/**
 * distill.ts — ADR-0002 阶段 2：蒸馏器（自记忆插件 index.ts 迁入，写入分发重接 targets.ts）。
 *
 * 事件链（ADR-0004 模式）：ctx.on('session/event') turn/end(completed) 且 root agent → per-agent idle 定时器
 *   → 到点且 agent idle → 内存增量（snapshotEvents 水位后）→ 预筛（信号词 + pending 候选；皆无则跳过不唤醒）
 *   → spawn 蒸馏子代理（maxDepth=1，10min 超时 race）→ 结构化 JSON（route=memory|project|discard）
 *   → targets.ts 动态路由 + 白名单门禁（不符合不存）→ 零拷贝写入（memory-append；R3 项目事实直写 workspace devref）
 *   → 水位推进（suite/knowledge/audit/distill-watermark.jsonl）→ 蒸馏审计（distill-audit.jsonl，UI 统计卡数据源）。
 *
 * 深度睡眠归纳（v16：习得原则并入 agent 画像 AGENT.md；2026-09-08 拍板机制、2026-09-09 拍板定位=agent 的反思进化迭代）：独立巡检定时器（10min）检测「全部会话停滞 ≥3h」→ 触发一次。
 *   判据=**会话活跃状态机**（见 SessRec 注释）：任意事件→RUNNING，turn/end→ENDED；RUNNING 无事件 ≥probeAfterMs
 *   → PROBING（采样 transcript 两次比对 mtime/size）→ 增长=长任务（刷新水位不睡，唯一拦睡条件）/ 不增长+会话在
 *   =STALLED（不阻塞，发审计告警）/ 不增长+会话没了=EXIT / 探针不可用或异常=无法确认。后三者一律按停滞处理→正常睡。
 *   作用域=痕迹窗口（起点=上次深度睡眠水位，纯水位语义 2026-09-09：无痕迹滑窗不睡、消化后推进、失败回滚，
 *   不再叠加「本日 0 点」下限——0 点切会日切丢痕；按 mtime/时间戳判定，规避 pending 文件名 UTC 口径跨日偏差）：
 *   窗口内 pending + 窗口内写入的 notes + 窗口内 access 命中 → 归纳子代理 → 原则 JSON → write_gate 校验
 *   → `[原则]` 索引行原子写入 AGENT.md（冲突=原地 replace；反思双通道：认识自己+认识用户，同 pass 维护 USER 画像）。
 *
 * 坑位防御（devref/pitfalls 全清单）：禁 spawnSync（全异步 runAsync）；定时器随 disposed 事件清理；
 * reload 后旧 ctx 失效→错误 catch+水位保留重试；maxDepth=1+persona 委派禁令+toolFilter；
 * 路由归一化未知回退 memory（宁滥勿丢）；LLM 路由连败≥2 弃用指定 provider 回落继承（本迁入版补强）。
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dshHome, knowledgeRoot, memoryLibRoot, resolveTarget, loadWhitelist, gateMemoryAppend, recallIndex, } from './targets.js';
// ── 蒸馏裁决契约 v5（v4 单库化之上，2026-09-10 WikiSkill 借鉴：失败即知识 + 教训带适用边界）──
// v4 变更：取消「记忆库 vs 项目卡库」粒度二分——跨项目有用的细粒度条文也进 notes；项目专属事实直写项目工作区 devref；
//          新增 profiles 双画像通道（用户画像 USER + Agent 自我画像 AGENT，Q2「归谁」的落地写入通道）。
// v5 变更：appends 条目可选 rootCause/avoidWhen——教训/踩坑类浓缩附 WHY 根因与「不适用」场景（对标 WikiSkill pattern
//          双记 + SKILL.md When NOT to Apply），宿主写入时追加「- 根因：…」「- 不适用：…」两行；其余字段语义兼容 v4。
export const DEFAULT_DISTILL_PROMPT = `你是知识整理蒸馏子代理（守藏契约 v5）。任务：从给定会话增量正文中，判定每条可复用知识的归属（第一层路由），再输出结构化入册指令（由宿主执行写入，你无需也不能直接写文件/跑命令）。
判定锚（v4 单库）：只有一个记忆库——notes 存「下次做类似任务时给 agent 的方向」与跨项目有用的事实；项目专属事实不属于全局库，直写项目工作区。
第一层归属路由（对每条候选按序判定）：
- R1 泛化方向指引？这条知识的作用=下次做类似任务给大概方向？→ route=memory（粗粒度是特性，不要把细节条文塞进记忆库）
- R2 官方规范/平台规则/工具用法等**跨项目有用**的细粒度条文 → route=memory（归 notes/tools 或 notes/lessons，教程式浓缩）
- R3 某项目专属事实（项目结构/该项目用户拍板的决策/项目契约踩坑，只在单一项目语境有用）→ route=project（宿主直写该项目工作区 docs/devref/shoucang/）
- R4 其余（一次性进度/可搜索公开知识/无实质/<relevant-memories>注入缓存/重复已有归属）→ route=discard
- 同一条既像 R1/R2 又像 R3：跨项目可复用→memory；只在单一项目成立→project。既不跨项目也不属于当前会话项目→丢弃。
- 拿不准 → route=memory 但 appends 留空记 skipped（宁缺毋滥）。
route=memory 时续走四问：Q0 已有归属？Q1 下周用得上？Q2 归谁（notes 记忆 / USER 用户画像 / AGENT 自我画像）？Q3 能合并？
Q2 画像判定：**用户的稳定偏好/背景/禁忌**（非一次性需求）→ profiles target=USER；**agent 自身的稳定做法/能力边界/常犯错误教训**（可跨任务复用的自我认知）→ profiles target=AGENT；一般知识→appends。
委派禁令：**独立完成，绝不 spawn/委派任何子代理**（查重凭给定正文与你自身知识判断）。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"route":"memory","appends":[{"target":"notes/tools.md","section":"<既有 ## 小节名>","text":"教程式浓缩：目标一句+编号步骤+注意，≤120字"}],"newIndex":[{"target":"MEMORY.md","line":"[tag] 主题 · 概况短语/短语/短语 → notes/x.md §小节"}],"profiles":[{"target":"USER|AGENT","section":"≤12字小节名","text":"≤80字一句话"}],"projectCards":[{"cardType":"how-to|reference|decision","title":"≤20字","text":"≤200字","source":"≤30字"}],"skipped":[{"title":"...","reason":"≤30字"}]}
约束：route=memory → 填 appends/newIndex（target 白名单 notes/tools.md notes/flows.md notes/lessons.md notes/env.md notes/release.md；section 必须既有 ## 小节名；**text 教程式三段**「目标：… 1. … 2. … 注意：…」只写方向指引级浓缩——目标形态/步骤轮廓/关键注意点，不搬细节条文，纯事实类可省步骤保留目标行；**newIndex.line 格式权威=记忆库 spec §8**：[tag] 主题 · 概况短语/短语/短语 → notes/<file>.md §小节，定界符 ·=段界 /=短语界 →=指针，主题≤12字名词性禁冒号复合，概况名词短语 / 分隔、≤30字、高判别实词（专名/数值/路径关键词）、禁日期溯源），profiles/projectCards 留空；profiles 仅在 route=memory 时可填（0-2 条，宁缺毋滥，须是稳定画像而非一次性事实）；route=project → 填 projectCards（cardType: how-to=操作步骤/reference=契约事实/decision=架构决策），其余留空；route=discard → 除 skipped 全空；与 route 不匹配的条目宿主拒收。教训/踩坑类（notes/lessons.md 或 [lesson] 语境）可在 appends 条目附可选 rootCause/avoidWhen（各 ≤30 字，v5）——宿主写入时自动追加「- 根因：…」「- 不适用：…」两行，让教训带 WHY 与不适用条件（对标 WikiSkill pattern 双记 + When NOT to Apply），其余条目省略。`;
// ── 深度睡眠归纳契约（v17：习得原则与通用任务路径 [路径] 并入 agent 画像 AGENT.md；成败信号入材料；睡眠=agent 的反思进化迭代——认识自己也认识用户）──
export const DEEP_SLEEP_PROMPT = `你是深度睡眠归纳子代理（守藏记忆·agent 画像成长引擎，audit-protocol §5）。任务：像人睡前回想当天经历一样，回顾给定「当天记忆痕迹」——**反思三通道：认识自己（提炼习得原则写入 AGENT.md）+ 认识用户（更新用户画像 USER.md）+ 沉淀通用任务路径（[路径] 行写入 AGENT.md，对标 AWM）**，仅认识自己或认识用户其一即反思不完整。原则=多条经验反复提纯凝成的跨任务泛化指引（巩固记忆；主动遗忘=提纯下放，不是删除）；路径=可复用任务类型的步骤序列（具体值必须变量化）。
判定规则：
- **原则判据**：同主题 ≥3 条痕迹，或单主题当日反复命中 → 提炼 1 条原则；支撑不足的一律不提炼（路径判据见下，二者区分勿混）。
- 原则=一句方向指引（对齐 R1 粒度锚：目标形态/步骤轮廓/关键注意点），不搬细节条文。
- **路径判据**：同一任务类型在窗口内出现 ≥2 次（痕迹/运行统计可见重复模式）→ 归纳 1 条路径；候选区若含「成功次数 ≥2 且跨会话 ≥2」的任务候选 = 已达转正门槛（memory-core-model §4），直接归纳为 [路径]；**只归纳成功走通的任务**，失败任务只进原则教训（AWM：只从成功学）。
- 路径行格式：\`[路径] <任务类型 ≤10 字> · <步骤概要 ≤40 字，用 ①②③ 串联> → notes/flows.md §小节\`；**具体值必须变量化**（如 <项目名>/<端口>/<文件名>——不抽象=过拟合单例）。
- 材料若含「窗口内任务运行统计」：先做成败对比（ExpeL 式）——异常集中出现的环节才是真因所在；对比结论仍受跨工作区红线约束，不得把单项目细节写成原则/路径。
- 源指针只能指向给定痕迹中真实出现过的 notes/<file>.md §小节（1-2 个小节）；行格式严格为（AGENT.md 索引行格式，概况段即原则一句或路径概要）：\`[原则] <主题 · 一句泛化> → notes/<file>.md §小节A/§小节B\`（主题 ≤12 字、概况 ≤30 字、禁日期戳）或 \`[路径]\`（格式见上，概要 ≤40 字）
- **跨工作区红线**：记忆库是全局单库，痕迹可能来自多个工作区，而原则会常驻注入到**所有**工作区会话。含项目专名/具体路径/版本号/一次性事实的经验一律不提炼（skipped 注明「项目专属」）；只在单一项目语境成立的结论同样不提炼——宁缺毋滥，误注入比漏提炼危害大。
- pending 内容尚未入册 notes 的，不得作为源指针（仅作背景理解）；找不到 notes 锚点就不提炼（宁缺毋滥）。
- 与既有原则/路径冲突时用 replace（match=既有行原文，须逐字来自给定「现行原则/路径」清单）；否则 add。
- **v5.4 树状纪律**：notes 小节的**结构生长（分裂新子节）由事件蒸馏自动完成**（写侧按内容量归并 vs 分裂 ###）；你**不新建/不合并 notes 小节**（深睡聚焦画像/原则/路径提炼，树形整编——合并冗余子节/降级冷枝——在树出现冗余后由后续整编步骤做，本契约不改 JSON 结构）。源指针仍指向真实存在的 §小节（含子节路径如 §父节/子节 若材料中已存在）。
- 独立完成：不 spawn 子代理、不使用任何工具，只依据给定材料。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"principles":[{"action":"add","text":"[原则] 排障先看根因 · 先验证成本低再修改成本高 → notes/lessons.md §A/§B"},{"action":"add","text":"[路径] DSH 插件升级 · ①提交推送 ②cp 覆盖 lib ③sc restart ④四端点 200 → notes/flows.md §升级"},{"action":"replace","match":"[原则] 既有原则原文行","text":"[原则] ... → notes/tools.md §C"}],"profileOps":[{"target":"USER.md","action":"add","section":"沟通偏好","text":"- ... ← 源: notes/lessons.md §A"}],"skipped":[{"title":"...","reason":"≤30字"}]}
无足够素材 → {"principles":[],"profileOps":[],"skipped":[]}。

双画像巩固（反思的另一通道=认识用户；与原则同判据、同红线）：
- 回顾给定「现行画像」（USER=用户画像 / AGENT=你的自我画像）与当天痕迹，若发现：**用户跨任务稳定的偏好/背景/禁忌**（非一次性需求）→ profileOps target=USER.md；**你自身反复出现的稳定做法/能力边界/常犯错误教训**（可跨任务复用的自我认知）→ target=AGENT.md。
- 每条必须带 notes 源指针（行内 \`← 源: notes/<file>.md §小节\`），无锚不提炼；与既有画像行冲突用 replace（match=既有行原文，须逐字来自给定现行画像）；宁缺毋滥。`;
// ── 预筛信号词（零拷贝优先动态加载记忆仓 engine/signals.mjs；不可达时内嵌兜底副本，与 engine 同源）──
const PRESCAN_STRONG = ['记住', '以后', '注意', '踩坑', '原来是这样', '应该改成', '别再用', '纠正', '别忘了', '务必'];
const PRESCAN_MID = [/失败.{0,24}(换|改)用/, /(报错|失败).{0,16}(换|改)用/, /改用.{0,12}(工具|方式|方案|命令)/, /原因.{0,12}(是|为|在于)/, /(记|存).{0,6}(到|进)/, /根因/, /对策/, /(要|该)记住/, /下次(要|得|注意)/];
let hasDistillSignalsImpl = null;
const hasDistillSignals = (text) => {
    if (!text)
        return false;
    if (hasDistillSignalsImpl)
        return hasDistillSignalsImpl(text);
    if (PRESCAN_STRONG.some((s) => text.includes(s)))
        return true;
    return PRESCAN_MID.some((re) => re.test(text));
};
const loadEngineSignals = async () => {
    const candidates = [join(memoryLibRoot(), 'engine', 'signals.mjs')];
    for (const p of candidates) {
        try {
            const mod = await import(pathToFileURL(p).href);
            if (mod && typeof mod.hasDistillSignals === 'function') {
                hasDistillSignalsImpl = mod.hasDistillSignals;
                return;
            }
        }
        catch { /* 下一个 */ }
    }
};
function runNode(nodeBin, scriptPath, args, opts) {
    return new Promise((resolve) => {
        let out = '', err = '', killed = false;
        const child = spawn(nodeBin || 'node', [scriptPath, ...args], {
            cwd: opts?.cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
            env: opts?.env ? { ...process.env, ...opts.env } : process.env,
        });
        const to = setTimeout(() => { killed = true; try {
            child.kill();
        }
        catch { /* */ } }, opts?.timeout ?? 60000);
        child.stdout?.on('data', (d) => { out += d; });
        child.stderr?.on('data', (d) => { err += d; });
        child.on('error', (e) => { clearTimeout(to); resolve({ status: null, out: '', err: String(e).slice(0, 200) }); });
        child.on('close', (code) => { clearTimeout(to); resolve({ status: killed ? null : code, out, err: killed ? err + '\n[timed out]' : err }); });
    });
}
const textOf = (r) => (r.out + (r.err ? '\n[stderr] ' + r.err.trim() : '')).trim();
// ── 蒸馏器主体 ──
export function registerDistill(ctx, config) {
    const SHORT = 'shoucang-scheduler';
    const logFile = join(dshHome(), 'super-injector', SHORT + '.log');
    const kRoot = knowledgeRoot();
    const watermarkFile = join(kRoot, 'audit', 'distill-watermark.jsonl');
    const auditFile = join(kRoot, 'audit', 'distill-audit.jsonl');
    const pendDir = join(kRoot, 'pending');
    // ═══ 路线② 成长环数据源：轻 episode（同类判定/转正数据源，不存全文）+ 低置信任务候选区（跨窗口记忆）═══
    const episodeFile = join(kRoot, 'audit', 'episodes.jsonl');
    const candidateDir = join(pendDir, 'flow-candidates');
    const EPISODE_CAP = 256;
    const recordEpisode = (o) => {
        try {
            mkdirSync(dirname(episodeFile), { recursive: true });
            appendFileSync(episodeFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8');
            try {
                const ls = readFileSync(episodeFile, 'utf8').split('\n').filter((l) => l.trim());
                if (ls.length > EPISODE_CAP + 8)
                    writeFileSync(episodeFile, ls.slice(ls.length - EPISODE_CAP).join('\n') + '\n', 'utf8');
            }
            catch { /* 修剪失败无害 */ }
        }
        catch { /* 记录失败静默 */ }
    };
    const intentOf = (deltaText) => {
        const m = String(deltaText || '').match(/^\[user\]\s*([\s\S]{0,120})/m);
        return m ? m[1].trim().replace(/\s+/g, ' ') : '';
    };
    // 语义指纹：intent → 判别 token 集（CJK 双字滑动 + 英文 ≥4 词），供同型判定（词法地板，零依赖）
    const intentTokens = (text) => {
        const t = String(text || '').replace(/[^\w\u4e00-\u9fa5]+/g, ' ').trim();
        const out = new Set();
        // 英文/数字 ≥4 的整词
        for (const w of t.split(' '))
            if (/[A-Za-z0-9]/.test(w) && w.length >= 4)
                out.add(w.toLowerCase());
        // 中文连续 2 字滑动窗口（去标点后保留中文段）
        const zh = (t.match(/[\u4e00-\u9fa5]+/g) || []).join('');
        for (let i = 0; i + 1 < zh.length; i++)
            out.add(zh.slice(i, i + 2));
        return [...out];
    };
    const ensureFlowCandidate = (sid, intent) => {
        if (!intent || intent.length < 8)
            return;
        try {
            mkdirSync(candidateDir, { recursive: true });
            const day = new Date().toISOString().slice(0, 10);
            // 同型聚合（memory-core-model §4 转正数据源）：intent 指纹与既有候选「类型线索」共享 ≥2 token 视为同型，
            // 追加本次源会话 + 成功计数到既有文件（跨会话可见重复 → 深睡可归纳 [路径]），否则新建候选。
            const tokens = intentTokens(intent);
            let matched = null;
            let matchedScore = 0;
            for (const f of existsSync(candidateDir) ? readdirSync(candidateDir).filter((x) => x.endsWith('.md')) : []) {
                try {
                    const body = readFileSync(join(candidateDir, f), 'utf8');
                    const m = body.match(/- 类型线索：(.+)/);
                    if (!m)
                        continue;
                    const existing = intentTokens(m[1]);
                    const inter = tokens.filter((tk) => existing.includes(tk)).length;
                    if (inter >= 2 && inter > matchedScore) {
                        matched = f;
                        matchedScore = inter;
                    }
                }
                catch { /* 坏候选跳过 */ }
            }
            if (matched) {
                const fp = join(candidateDir, matched);
                const body = readFileSync(fp, 'utf8');
                // 跨会话计数：源会话不重复追加；会话集合数=跨会话信号（供深睡「同类型 ≥2 次且跨会话」判据）
                const sids = [...new Set([...(body.match(/^- 源会话：(.+)$/gm) || []).map((l) => l.replace(/^- 源会话：/, '').trim()), sid])];
                const n = sids.length;
                const out = body
                    .replace(/- 源会话：[^\n]*(\n|$)/g, '')
                    .replace(/- 成功次数：[^\n]*\n/, '')
                    .replace(/- 跨会话：[^\n]*\n/, '');
                const newBody = `${out.trim()}\n- 成功次数：${n}\n- 跨会话：${n}（${sids.slice(-4).join(', ')}${sids.length > 4 ? '…' : ''}）\n- 最近更新：${day}\n`;
                writeFileSync(fp, newBody, 'utf8');
                return;
            }
            let hash = 0;
            for (const c of intent)
                hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
            const f = join(candidateDir, `${day}-${hash.toString(36).slice(0, 6)}.md`);
            writeFileSync(f, `# 任务候选（低置信 · 跨窗口记忆）\n\n- 类型线索：${intent}\n- 源会话：${sid}\n- 成功次数：1\n- 跨会话：1\n- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）\n`, 'utf8');
        }
        catch { /* 候选落盘失败静默 */ }
    };
    const log = (msg) => { try {
        mkdirSync(dirname(logFile), { recursive: true });
        appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + msg + '\n');
    }
    catch { /* 静默 */ } };
    // sid 可读短号：slice(0,8) 恒等于 'session-' 前缀（此前日志全打成 'session-' 无辨识度）——取 uuid 中段
    const sidShort = (sid) => (sid && sid.startsWith('session-') && sid.length > 16 ? sid.slice(8, 16) : String(sid || '').slice(0, 12));
    const audit = (o) => { try {
        mkdirSync(dirname(auditFile), { recursive: true });
        appendFileSync(auditFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
    }
    catch { /* 静默 */ } };
    // ═══ WikiSkill 借鉴 · raw 裁决存根（raw-stub/）：每轮蒸馏裁决的不可变元数据留档（不含正文/文本内容，隐私安全），
    // 供 route 分流抽验（audit-protocol §8 第 5 问）与契约升级的离线重放评测（对标 WikiSkill raw/ 只存证据不存解读）。写入后不覆写。
    const stubDir = join(kRoot, 'audit', 'raw-stub');
    const recordStub = (o) => {
        try {
            mkdirSync(stubDir, { recursive: true });
            appendFileSync(join(stubDir, 'stub.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8');
        }
        catch { /* 存根失败静默 */ }
    };
    const distilling = new Set(); // 并发守卫：同会话蒸馏在途标记（防 turn/end 重武装导致双写/竞态）
    // 单库化（2026-09-08 用户拍板）：守藏只有一个记忆库（生产根），不再有 presence 二分与降级链。
    // 库缺席（部署残缺）时由各写入点如实审计，不再静默换库。
    loadEngineSignals();
    // 水位（suite 本地，自记忆插件 audit/ 迁入；切换时存量水位行随 pending 一并移交）
    const readWatermarks = () => {
        const map = new Map();
        try {
            for (const l of readFileSync(watermarkFile, 'utf8').split('\n')) {
                if (!l.trim())
                    continue;
                try {
                    const o = JSON.parse(l);
                    map.set(o.sessionId, o);
                }
                catch { /* 坏行跳过 */ }
            }
        }
        catch { /* 无水位文件=全新 */ }
        return map;
    };
    const writeWatermark = (sessionId, lastSeq) => {
        try {
            mkdirSync(dirname(watermarkFile), { recursive: true });
            appendFileSync(watermarkFile, JSON.stringify({ sessionId, lastSeq, at: new Date().toISOString() }) + '\n', 'utf8');
        }
        catch { /* 静默 */ }
    };
    // LLM 路由连败弃用（坑位补强：连败≥2 回落继承主会话模型，成功后复位）
    let providerFailCount = 0;
    const validateProvider = () => {
        if (!(config.llmProvider && config.llmModel) || providerFailCount >= 2)
            return;
        try {
            const llm = ctx.llm;
            const providers = llm.listProviders ? llm.listProviders() : [];
            const names = (providers || []).map((p) => p && (p.id || p.provider || p.name));
            if (names.length && !names.includes(config.llmProvider)) {
                log(`warn: llmProvider "${config.llmProvider}" 不在实例注册列表 [${names.join(', ')}]——spawn 将 NO_ADAPTER，请改用真实 adapter 名或留空继承`);
            }
        }
        catch { /* listProviders 不可用时静默 */ }
    };
    // 2026-09-10：蒸馏/深睡各自独立模型——具体键有值用之，否则回落共用键（仍空=继承主会话）
    const resolveLlm = (sp, sm) => {
        if (sp && sm)
            return { provider: sp, model: sm };
        if (config.llmProvider && config.llmModel)
            return { provider: config.llmProvider, model: config.llmModel };
        return null;
    };
    const extractDelta = (agent, lastSeq) => {
        const events = agent.session.snapshotEvents();
        let maxSeq = lastSeq;
        const parts = [];
        for (const e of events) {
            const seq = e.seq ?? 0;
            if (seq <= lastSeq)
                continue;
            if (seq > maxSeq)
                maxSeq = seq;
            if (e.type === 'user/message') {
                const d = e.data || {};
                const arr = Array.isArray(d.content) ? d.content : [];
                for (const c of arr)
                    if (c && c.type === 'text' && typeof c.text === 'string')
                        parts.push('[user] ' + c.text.slice(0, 2000));
            }
            else if (e.type === 'assistant/chunk') {
                const c = e.data && e.data.chunk;
                if (c && c.type === 'block-end' && c.block && c.block.type === 'text' && typeof c.block.text === 'string') {
                    parts.push('[assistant] ' + c.block.text.slice(0, 3000));
                }
            }
        }
        return { maxSeq, text: parts.join('\n').slice(0, 24000) };
    };
    /** E3 桥：定位会话转录文件绝对路径（零拷贝调记忆仓 locate-transcript-probe；探测「是否还在输出」的硬证据） */
    const locateTranscript = async (sid) => {
        try {
            if (!existsSync(probeScriptPath))
                return null;
            const r = await runNode(config.nodeBin, probeScriptPath, [sid], { timeout: 15000 });
            if (r.status !== 0)
                return null;
            return textOf(r).trim().split('\n').find((l) => l.includes('session.jsonl')) || null;
        }
        catch {
            return null;
        }
    };
    const resolveWorkspace = async (sid) => {
        // 反解带瞬态容错：转录定位可能晚于会话 end 落盘 / 探针单次抖动 → 仅「定位失败」重试 3 次（1.5s 退避）；
        // 路径已定位但正则不匹配（如 _no-cwd 会话）属永久无归属，重试无意义，直接返回 null 走 writeDispatch 降级链。
        // 2026-09-09 实态审计：曾出现 route=project 整批 6 连拒、reason=workspace 反解失败——
        // 同会话稍后探针即可定位，属触发时刻瞬态而非永久无归属。
        for (let attempt = 1; attempt <= 3; attempt++) {
            let file = null;
            try {
                file = await locateTranscript(sid);
            }
            catch {
                file = null;
            }
            if (file) {
                const m = file.match(/sessions[\\/]+(--.+?--)[\\/]/);
                if (m) {
                    const ws = m[1].slice(2, -2).replace(/--/g, '\\').replace(/~0040/g, '@');
                    if (/^[A-Za-z]:/.test(ws))
                        return ws;
                }
                return null; // 已定位但无 workspace 归属：永久，不重试
            }
            if (attempt < 3)
                await new Promise((r) => setTimeout(r, 1500));
        }
        return null;
    };
    // ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
    const memAppend = async (target, kind, payload, section, t) => {
        const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs');
        const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload];
        return runNode(config.nodeBin, script, args, { env: { MEMORY_ROOT: t.root }, timeout: 20000 });
    };
    // ── 双画像维护（2026-09-08 用户拍板：蒸馏/睡眠不只补记忆，还更新 USER/AGENT 双画像——助理角色要有自我认知）
    //    v16：AGENT.md 升格为「成长型自我画像」（含 [原则] 习得原则），容量 2,000→3,000 ──
    const PROFILE_CAP = 3000;
    const PROFILE_HEADER = {
        'USER.md': '# USER.md — 用户画像\n\n> 「人」的画像：用户稳定偏好/背景/禁忌。库中唯一直接关于用户的文件；其余（notes/原则/索引/AGENT.md）皆为 agent 自身资产。写入口=蒸馏 profileUpdates + 深度睡眠 profileOps；每行带源指针。',
        'AGENT.md': '# AGENT.md — Agent 自我画像（助理的成长档案）\n\n> 用户助理角色的自我认知：角色定位/稳定做法/能力边界/常犯错误与教训/[原则] 习得原则（深度睡眠归纳内化，v16）。库中其余一切（notes/索引）都是本 agent 为履行助理职责而积累的自身资产，本文件只回答「我是谁、我学到了什么、我怎样服务好用户」。写入口=蒸馏 profileUpdates + 深度睡眠（原则行 + profileOps）；每行带源指针。',
    };
    /**
     * 画像行写入（宿主直写，tmp+rename 原子）：小节存在→小节尾加行；不存在→文件尾建小节。
     * 门禁：target 仅 USER.md/AGENT.md、小节名防注入、单行 ≤160 字符、库容量 ≤2,000、去重、replace 须 match 逐字存在。
     */
    const writeProfileLine = (root, target, section, line, replaceMatch) => {
        try {
            if (target !== 'USER.md' && target !== 'AGENT.md')
                return 'rejected';
            const sec = String(section || '').trim().replace(/^##+ */, '').trim();
            const ln = String(line || '').trim();
            if (!sec || !ln || ln.length > 160 || /[#`]/.test(sec))
                return 'rejected';
            const file = join(root, target);
            let body = '';
            try {
                body = readFileSync(file, 'utf8');
            }
            catch {
                body = (PROFILE_HEADER[target] || `# ${target}\n`) + '\n';
            }
            if (body.split('\n').some((l) => l.trim() === ln))
                return 'dedup';
            if (body.length + ln.length + sec.length + 8 > PROFILE_CAP)
                return 'rejected'; // 容量门：超限拒绝，待画像间合并
            const lines = body.split('\n');
            const secIdx = lines.findIndex((l) => l.trim() === `## ${sec}`);
            if (secIdx < 0)
                lines.push('', `## ${sec}`, ln);
            else if (replaceMatch) {
                const mi = lines.findIndex((l) => l.trim() === String(replaceMatch).trim());
                if (mi < 0)
                    return 'rejected'; // replace 要求 match 逐字存在（防误改）
                lines[mi] = ln;
            }
            else {
                let end = secIdx + 1;
                while (end < lines.length && !lines[end].startsWith('## '))
                    end++;
                lines.splice(end, 0, ln);
            }
            const tmp = file + '.tmp';
            writeFileSync(tmp, lines.join('\n'), 'utf8');
            renameSync(tmp, file);
            return 'added';
        }
        catch {
            return 'failed';
        }
    };
    const writeDispatch = async (sid, out, route, workspace) => {
        let added = 0, rejected = 0, failed = 0;
        if (route === 'memory') {
            const resolved = resolveTarget();
            if (!resolved.present) {
                for (const _a of ((out && Array.isArray(out.appends)) ? out.appends : [])) {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', reason: '记忆库缺席（部署残缺）', lib: resolved.library });
                }
                return { added, rejected, failed, targetLib: resolved.library };
            }
            const { wl, source } = loadWhitelist(resolved.root);
            const gate = (t) => {
                const r = gateMemoryAppend({ target: t }, wl);
                if (!r.ok) {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', target: t, reason: r.reason, lib: resolved.library });
                    log(`distill 拒收: ${r.reason?.slice(0, 120)}`);
                }
                return r.ok;
            };
            const appends = (out && Array.isArray(out.appends)) ? out.appends : [];
            const newIndex = (out && Array.isArray(out.newIndex)) ? out.newIndex : [];
            for (const a of appends) {
                if (!a || !a.target || !a.section || !gate(a.target)) {
                    if (a && (!a.target || !a.section))
                        failed++;
                    continue;
                }
                // v5：教训条目附 rootCause/avoidWhen → 追加「- 根因：…」「- 不适用：…」两行（WikiSkill 借鉴：WHY + 适用边界）
                const _base = String(a.text || '').trim();
                const _rc = typeof a.rootCause === 'string' && a.rootCause.trim() ? `\n- 根因：${a.rootCause.trim()}` : '';
                const _aw = typeof a.avoidWhen === 'string' && a.avoidWhen.trim() ? `\n- 不适用：${a.avoidWhen.trim()}` : '';
                const r = await memAppend(String(a.target), 'append', _base + _rc + _aw, String(a.section).trim(), resolved);
                if (r.status === 0)
                    added++;
                else {
                    failed++;
                    log(`distill 落点失败 ${a.target}§${a.section}: ${textOf(r).slice(0, 120)}`);
                }
            }
            for (const ni of newIndex) {
                if (!ni || !ni.line) {
                    failed++;
                    continue;
                }
                const t = String(ni.target || 'MEMORY.md');
                if (!gate(t))
                    continue;
                const r = await memAppend(t, 'new', String(ni.line).trim(), '-', resolved);
                if (r.status === 0)
                    added++;
                else {
                    failed++;
                    log(`distill 新索引失败: ${textOf(r).slice(0, 120)}`);
                }
            }
            // 双画像：Q2「归谁」的 USER/AGENT 通道（宿主直写，格式/容量/去重门禁）
            const profiles = (out && Array.isArray(out.profiles)) ? out.profiles : [];
            const date = new Date().toISOString().slice(0, 10);
            for (const p of profiles) {
                if (!p || !p.target || !p.section || !p.text) {
                    failed++;
                    continue;
                }
                const r = writeProfileLine(resolved.root, String(p.target).trim(), String(p.section), `- ${String(p.text).trim()} ← 源: distill ${sidShort(sid)} ${date}`);
                if (r === 'added')
                    added++;
                else if (r === 'rejected') {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', target: p.target, reason: '画像更新被拒（格式/容量门）' });
                }
                else if (r === 'failed')
                    failed++;
                // dedup：静默不计
            }
            audit({ sid, kind: 'distill-run', route, lib: resolved.library, wlSource: source, added, rejected, failed });
            return { added, rejected, failed, targetLib: resolved.library };
        }
        if (route === 'project') {
            // 单库化（2026-09-08 用户拍板）：pmg 项目卡库已随治理插件移除，项目专属事实**直写项目工作区**
            // <workspace>/docs/devref/shoucang/（workspace 由会话转录反解）。
            // 降级链（2026-09-09 实态审计补缺）：反解失败≠丢弃——cards 幂等降级落 pending/
            // （<date>-project-defer-<slug>.md，符合蒸馏候选命名规范 → 下一轮随 pending 重新裁决；
            // workspace 恢复后 route=project 直写 devref；确认泛化则 route=memory 入 notes）。
            // 红线不变：项目专属内容绝不落全局 notes/索引——降级是「暂存等认领」，不是「放水入全局库」。
            const cards = (out && Array.isArray(out.projectCards)) ? out.projectCards : [];
            if (!workspace) {
                for (const pc of cards) {
                    if (!pc || !pc.title || !pc.text) {
                        failed++;
                        continue;
                    }
                    try {
                        const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'card';
                        const date = new Date().toISOString().slice(0, 10);
                        const deferFile = join(pendDir, `${date}-project-defer-${slug}.md`);
                        // 幂等：同题降级文件已存在 → 不重复堆积，只审计计数（防止每轮蒸馏重复降级同一批）
                        if (existsSync(deferFile)) {
                            rejected++;
                            audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 已存在（去重），待认领' });
                            continue;
                        }
                        mkdirSync(pendDir, { recursive: true });
                        writeFileSync(deferFile, `# [project-defer] ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 源会话：${sid}\n- 溯源：${pc.source || ''}\n- 状态：workspace 反解失败降级暂存，待蒸馏重裁决或人工认领\n\n${pc.text}\n`, 'utf8');
                        rejected++; // 未入册（defer=暂存非入册）
                        audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 待认领（不丢弃）' });
                    }
                    catch (e3) {
                        failed++;
                        log(`distill project-defer 落盘失败: ${String(e3.message).slice(0, 120)}`);
                    }
                }
                return { added, rejected, failed, targetLib: 'pending-defer' };
            }
            const dir = join(workspace, 'docs', 'devref', 'shoucang');
            const cardTypes = ['how-to', 'reference', 'decision'];
            const date = new Date().toISOString().slice(0, 10);
            for (const pc of cards) {
                if (!pc || !pc.title || !pc.text) {
                    failed++;
                    continue;
                }
                const cardType = cardTypes.includes(String(pc.cardType || '')) ? String(pc.cardType) : 'reference';
                if (!cardTypes.includes(String(pc.cardType || ''))) {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', target: pc.title, reason: `cardType=${pc.cardType} 不在 [${cardTypes.join(',')}]` });
                    continue;
                }
                try {
                    const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'card';
                    mkdirSync(dir, { recursive: true });
                    const fb = join(dir, `${date}-${cardType}-${slug}.md`);
                    writeFileSync(fb, `# [项目事实] ${cardType} · ${pc.title}\n\n- 卡类型：${cardType}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 工作区：${workspace}\n\n${pc.text}\n`, 'utf8');
                    added++;
                }
                catch (e2) {
                    failed++;
                    log(`distill 项目事实直写失败: ${String(e2.message).slice(0, 120)}`);
                }
            }
            audit({ sid, kind: 'distill-run', route, lib: 'workspace', added, rejected, failed });
            return { added, rejected, failed, targetLib: 'workspace' };
        }
        return { added, rejected, failed, targetLib: 'none' };
    };
    const distillAgent = async (agent) => {
        const sid = agent.id;
        if (distilling.has(sid))
            return; // 并发守卫：蒸馏在途（最长 10min）内再触发直接跳过（防双写/竞态）
        if (agent.status && agent.status !== 'idle') {
            log(`distill: ${sidShort(sid)} 已恢复活跃（status=${agent.status}），跳过`);
            return;
        }
        distilling.add(sid);
        try {
            validateProvider();
            const wm = readWatermarks().get(sid);
            const lastSeq = wm ? (wm.lastSeq || 0) : 0;
            const { maxSeq, text: deltaText } = extractDelta(agent, lastSeq);
            let candFiles = [];
            try {
                candFiles = readdirSync(pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f)).sort();
            }
            catch {
                candFiles = [];
            }
            if (!deltaText || deltaText.length < (config.minTurnChars ?? 200)) {
                writeWatermark(sid, maxSeq);
                // 跳过也留审计痕（观测盲区修复 2026-09-09：此前门槛/预筛跳过只进日志，审计里只见真实 run，
                // 「蒸馏为什么没跑」无法从数据区分——是没触发还是被挡）
                audit({ sid, kind: 'distill-skip', reason: 'below-min-chars', fclass: 'below-min', chars: deltaText.length });
                log(`distill: ${sidShort(sid)} 增量 ${deltaText.length} 字符 < 门槛，水位推进 ${lastSeq}→${maxSeq}（不蒸馏）`);
                return;
            }
            if (config.distillPrescan !== false) {
                // 2026-09-10 用户拍板：大段增量强制蒸馏——信息密集但无信号词的会话（如研究/工具流）不再被预筛整段丢弃
                const prescanMin = Number(config.prescanMinChars) > 0 ? Number(config.prescanMinChars) : 4000;
                const bigDelta = deltaText.length >= prescanMin;
                const hasSig = bigDelta || hasDistillSignals(deltaText);
                if (!hasSig && candFiles.length === 0) {
                    writeWatermark(sid, maxSeq);
                    audit({ sid, kind: 'distill-skip', reason: 'prescan-no-signal', fclass: 'prescan-no-signal', chars: deltaText.length });
                    log(`distill: ${sidShort(sid)} 预筛跳过（增量 ${deltaText.length} 字符无信号词 & pending 无候选），水位推进 ${lastSeq}→${maxSeq}`);
                    return;
                }
                log(`distill: ${sidShort(sid)} 预筛通过（信号词=${hasSig}${bigDelta ? `，大段 ${deltaText.length}≥${prescanMin} 强制蒸馏` : ''}，pending 候选=${candFiles.length}），进入蒸馏`);
            }
            // 候选按文件粒度装填：预算内进 prompt，放不下的整文件留 pending 下轮（防截断外候选被整批归档丢失知识）
            const CAND_BUDGET = 12000;
            const candIncluded = [];
            let candBudget = CAND_BUDGET;
            const candText = candFiles.map((f) => {
                let body = '';
                try {
                    body = readFileSync(join(pendDir, f), 'utf8');
                }
                catch {
                    return '';
                }
                const chunk = `### 源 ${f}\n${body}`;
                if (chunk.length > candBudget)
                    return ''; // 本文件装不下：不进本轮，保留 pending
                candBudget -= chunk.length + 1; // +1 join('\n') 分隔符
                candIncluded.push(f);
                return chunk;
            }).join('\n');
            const userInput = [
                `## 待蒸馏会话\nsessionId=${sid}（内存增量，水位 ${lastSeq}→${maxSeq}）`,
                `## 会话增量正文\n${deltaText}`,
                candIncluded.length ? `## 待固化候选（pending/ 中 ${candIncluded.length}/${candFiles.length} 个，预算 ${CAND_BUDGET} 字符内）\n${candText}` : (candFiles.length ? '（待固化候选超预算，本轮不携带；候选保留 pending 待下轮）' : '（无待固化候选）'),
                '请按规则处理：裁决可复用知识点并输出入册指令 JSON。',
            ].join('\n\n');
            const resolvedLlm = resolveLlm(config.distillProvider, config.distillModel);
            const useProvider = !!resolvedLlm && providerFailCount < 2;
            const agentOptions = useProvider ? { provider: resolvedLlm.provider, model: resolvedLlm.model } : undefined;
            const ac = new AbortController();
            const timeout = setTimeout(() => { try {
                ac.abort(new Error('distill timeout 10min'));
            }
            catch { /* */ } }, 600000);
            try {
                const run2 = await ctx.subagents.start('spawn', {
                    label: `distill-${sidShort(sid)}`,
                    parent: agent,
                    signal: ac.signal,
                    maxDepth: 1,
                    ...(agentOptions ? { agentOptions } : {}),
                    prompt: [{ type: 'text', text: userInput }],
                    persona: config.distillPrompt || DEFAULT_DISTILL_PROMPT,
                    toolFilter: { allow: [] },
                });
                const result = await Promise.race([
                    run2.result,
                    new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'timeout' }), 600000)),
                ]);
                clearTimeout(timeout);
                const stop = result && result.stopReason;
                const out = parseAgentJson(result, `distill ${sidShort(sid)}`); // 子代理输出 → JSON（剥离代码栅栏+容错提取，与深睡共用同一实现）
                if (stop === 'completed' && out)
                    providerFailCount = 0;
                else if (useProvider && (stop !== 'completed' || !out))
                    providerFailCount++;
                const rawRoute = (out && typeof out.route === 'string') ? out.route.trim().toLowerCase() : '';
                const route = ['memory', 'project', 'discard'].includes(rawRoute) ? rawRoute : 'memory'; // 归一化+未知回退 memory（宁滥勿丢）
                const workspace = await resolveWorkspace(sid);
                const disp = route === 'discard'
                    ? { added: 0, rejected: 0, failed: 0, targetLib: 'none' }
                    : await writeDispatch(sid, out, route, workspace);
                log(`distill: ${sidShort(sid)} stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`);
                // WikiSkill 借鉴：失败归类 fclass（供审计聚合/深睡根因回流）+ LLM 指纹（大小模型蒸馏质量实证的数据底座）
                const llmLabel = useProvider && resolvedLlm ? `${resolvedLlm.provider}/${resolvedLlm.model}` : 'inherited';
                const fclass = !out ? 'json-parse'
                    : stop !== 'completed' ? (useProvider ? 'provider-fail' : 'agent-stop')
                        : route === 'discard' ? 'discard'
                            : disp.failed > 0 ? 'dispatch-failed'
                                : disp.rejected > 0 ? 'gate-reject'
                                    : 'ok';
                audit({ sid, kind: 'distill-run', route, stop, fclass, llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed });
                recordStub({ sid, watermark: [lastSeq, maxSeq], chars: deltaText.length, route, stop, fclass, llm: llmLabel, disp: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib }, outShape: out ? { appends: (out.appends || []).length, newIndex: (out.newIndex || []).length, profiles: (out.profiles || []).length, projectCards: (out.projectCards || []).length, skipped: (out.skipped || []).length } : null });
                if (disp.added > 0 && candIncluded.length) {
                    const procDir = join(pendDir, '.processed');
                    try {
                        mkdirSync(procDir, { recursive: true });
                        for (const f of candIncluded) {
                            try {
                                renameSync(join(pendDir, f), join(procDir, f));
                            }
                            catch { /* */ }
                        }
                    }
                    catch { /* */ }
                }
                // 路线②：蒸馏裁决完成（stop=completed && out，无论入册多少）即留轻 episode——episode=「任务发生+结果」的
                // 同类判定/转正数据源（memory-core-model §3.1），与是否入册无关（discard 也是有效裁决：该任务不值得记）；
                // 入册或裁决非 discard 时再建/更新低置信任务候选（跨窗口记忆；同类二次出现供深睡跨窗归纳 [路径]）
                if (stop === 'completed' && out) {
                    const intent = intentOf(deltaText);
                    recordEpisode({ sid, intent: intent.slice(0, 120), route, fclass, llm: llmLabel, outcome: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, lib: disp.targetLib });
                    if (route !== 'discard')
                        ensureFlowCandidate(sid, intent);
                }
                if (stop === 'completed' && out) {
                    writeWatermark(sid, maxSeq);
                    log(`distill: ${sidShort(sid)} completed，水位推进 → ${maxSeq}`);
                }
                else {
                    // 水位保留：stop≠completed（error/timeout/aborted）或 stop=completed 但 out=null（JSON 解析失败，
                    // 2026-09-09 实锤「Unexpected end of JSON input」）都不算消化——推进水位会把本窗口增量永久划出
                    log(`distill: ${sidShort(sid)} stop=${stop} out=${out ? 'ok' : 'null'}，水位保留 ${lastSeq} 待下轮重试`);
                }
            }
            catch (e) {
                clearTimeout(timeout);
                const msg = String(e?.message || e);
                if (msg.includes('inactive context')) {
                    // 旧 fiber 遗留定时器在 ctx 失效后触发（重载场景）：静默跳过、水位保留，由新实例积压扫尾补蒸馏（2026-09-10 修复）
                    log(`distill: ${sidShort(sid)} 旧 ctx 已失效（inactive context），跳过本轮（水位保留，待扫尾）`);
                }
                else {
                    if (useProvider)
                        providerFailCount++;
                    log(`distill ERROR ${sidShort(sid)}: ${msg.slice(0, 200)}`);
                }
            }
        }
        catch (e) {
            log(`distill agent err ${sidShort(sid)}: ${String(e?.message || e).slice(0, 120)}`);
        }
        finally {
            distilling.delete(sid);
        }
    };
    // 子代理输出 → JSON（剥离代码栅栏 + 容错提取首个 {...}；蒸馏/深度睡眠共用）
    const parseAgentJson = (result, label) => {
        if (!result || !Array.isArray(result.output))
            return null;
        const joined = result.output.filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
        const cleaned = joined.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        try {
            return JSON.parse(cleaned);
        }
        catch (e1) {
            const m = cleaned.match(/\{[\s\S]*\}/);
            if (m) {
                try {
                    return JSON.parse(m[0]);
                }
                catch (e2) {
                    log(`${label} JSON 解析失败: ${String(e2.message).slice(0, 80)}`);
                }
            }
            else
                log(`${label} JSON 解析失败: ${String(e1.message).slice(0, 80)}`);
            return null;
        }
    };
    // ═══ 深度睡眠归纳 pass（v16：习得原则 → AGENT.md `[原则]` 行自动写入口；2026-09-08 拍板）═══
    // 触发口径：以「最后一次根会话 turn/end（completed）」为活动水位——无任何会话活动持续 ≥deepSleepIdleMs
    // （缺省 3h）且无活跃 agent → 自动执行一次（每轮停滞窗口至多一次，新活动重置水位）；审计轮仍可手工兜底。
    // 作用域=当天痕迹（本日 pending + 本日写入的 notes + 本日 access 命中，不做全库扫描）；产出经 write_gate 落盘。
    const DEEP_SLEEP_CHECK_MS = 600000; // 巡检间隔 10min（停滞阈值由 deepSleepIdleMs 独立控制）
    let lastActivityAt = Date.now(); // 全局兜底水位（无在册会话时使用）
    let lastDeepSleepAt = 0;
    let deepSleepRunning = false;
    /** 会话状态表：sid → SessRec（随 disposed 出表，防内存泄漏） */
    const sessions = new Map();
    const probeScriptPath = join(memoryLibRoot(), 'scripts', 'locate-transcript-probe.mjs');
    /** 状态迁移入口：任意事件 → RUNNING；turn/end(completed) → ENDED（停滞计时起点） */
    const noteEvent = (sid, isTurnEnd) => {
        const now = Date.now();
        lastActivityAt = now;
        const rec = sessions.get(sid) || { sid, state: 'running', lastEventAt: now, lastEndAt: 0, probeAt: 0, probeRound: 0, stallRound: 0 };
        rec.lastEventAt = now;
        // 任何新事件都让会话「复活」：清掉探测/卡住计数（卡住的会话若恢复输出，不应继续按 stall 处理）
        rec.state = isTurnEnd ? 'ended' : 'running';
        if (isTurnEnd)
            rec.lastEndAt = now;
        rec.probeAt = 0;
        rec.probeRound = 0;
        rec.stallRound = 0;
        rec.probeResult = undefined;
        sessions.set(sid, rec);
    };
    // 启动水位回放：取蒸馏审计最新时间（重启不重置停滞判定）；同时回放上次深度睡眠时间（痕迹窗口起点）
    try {
        for (const l of readFileSync(auditFile, 'utf8').split('\n')) {
            if (!l.trim())
                continue;
            try {
                const o = JSON.parse(l);
                const t = Date.parse(String(o.at));
                if (Number.isNaN(t))
                    continue;
                if (t > lastActivityAt)
                    lastActivityAt = t;
                // 只回放「确实消化过痕迹」的深睡：error / no-parent / no-traces 都不推进水位——
                // no-traces 说明本轮一条痕迹都没收到（可能只是窗口被上一轮污染），
                // 若把它当水位，会把窗口内早于该时刻的痕迹永久关在窗外（当天再也回想不到）。
                if (o.kind === 'deep-sleep' && !o.error
                    && o.stop !== 'error'
                    && !['no-parent', 'no-traces'].includes(String(o.result))
                    && t > lastDeepSleepAt)
                    lastDeepSleepAt = t;
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 无审计文件=新装 */ }
    // 全新启动（审计里从无消化记录）：水位从启动时刻起算——首轮睡眠只看启动后的新痕迹，
    // 不把既有全历史 notes/pending 一股脑当材料（那是一次性的激进归纳）。
    if (!lastDeepSleepAt)
        lastDeepSleepAt = Date.now();
    /**
     * 痕迹窗口起点 = 上次深度睡眠水位（纯水位语义，2026-09-09 拍板重构）——
     * ① 统一用 mtime/时间戳比较，规避 pending 文件名日期为 UTC（`toISOString` 切片）与本地日期跨日不一致导致的漏收；
     * ② 同一天多次触发时不重复喂同一批材料（已归纳的不再回想）；
     * ③ **不再叠加「本日 0 点」下限**：0 点切会把午夜前产生、午夜后才睡眠的痕迹永久划出窗口（日切丢痕迹）；
     *    纯水位下「无痕迹滑窗」与「消化后推进」都只会把起点移到更晚，未来产生的痕迹 mtime 必然更晚，永不丢失。
     */
    const traceSince = () => Number(lastDeepSleepAt) || 0;
    // 当天痕迹收集（深度睡眠作用域=本日）
    // since 由调用方显式传入：**必须在推进 lastDeepSleepAt 之前取值**（否则窗口起点=当前时刻 → 恒零痕迹，
    // 见 deepSleepCheck 的调用处注释；此坑曾让深度睡眠自上线起从未真正归纳过任何材料）。
    const gatherDeepSleepTraces = (memRoot, since) => {
        const parts = [];
        // 窗口内文件枚举（pending 按 mtime 判定，不解析文件名日期——文件名是 UTC 口径，本地日切会跨日错配）
        const pendFiles = (() => {
            try {
                return readdirSync(pendDir).filter((f) => f.endsWith('.md')).filter((f) => {
                    try {
                        return statSync(join(pendDir, f)).mtimeMs >= since;
                    }
                    catch {
                        return false;
                    }
                }).sort();
            }
            catch {
                return [];
            }
        })();
        const notesDir = join(memRoot, 'notes');
        const noteFiles = (() => {
            try {
                return readdirSync(notesDir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md').filter((f) => {
                    try {
                        return statSync(join(notesDir, f)).mtimeMs >= since;
                    }
                    catch {
                        return false;
                    }
                }).sort();
            }
            catch {
                return [];
            }
        })();
        // 0) 痕迹清单先给全——跨工作区公平：正文按预算截断时，子代理至少知道窗口内有哪些痕迹存在（不被静默吞掉）
        if (pendFiles.length || noteFiles.length) {
            parts.push('### 窗口内痕迹清单（记忆库为全局单库，痕迹可能来自多个工作区；正文按单文件上限截断）\n'
                + [...pendFiles.map((f) => `pending/${f}`), ...noteFiles.map((f) => `notes/${f}`)].map((p) => `- ${p}`).join('\n'));
        }
        // 1) pending 正文（背景材料，不作源指针）：单文件上限 PEND_PER_FILE，防单个工作区大文件吃光预算
        const PEND_PER_FILE = 2500;
        let budget = 12000;
        for (const f of pendFiles) {
            if (budget <= 0)
                break;
            let body = '';
            try {
                body = readFileSync(join(pendDir, f), 'utf8');
            }
            catch {
                continue;
            }
            const cut = body.length > PEND_PER_FILE ? body.slice(0, PEND_PER_FILE) + '\n…(截断)' : body;
            const chunk = `### pending/${f}\n${cut}`;
            if (chunk.length > budget)
                break;
            budget -= chunk.length + 1;
            parts.push(chunk);
        }
        // 2) notes 正文（原则源指针唯一合法来源）：单文件上限 NOTES_PER_FILE，保证多工作区痕迹都能进上下文
        const NOTES_PER_FILE = 6000;
        let notesBudget = 18000;
        for (const f of noteFiles) {
            if (notesBudget <= 0)
                break;
            let body = '';
            try {
                body = readFileSync(join(notesDir, f), 'utf8');
            }
            catch {
                continue;
            }
            const cut = body.length > NOTES_PER_FILE ? body.slice(0, NOTES_PER_FILE) + '\n…(截断)' : body;
            const chunk = `### notes/${f}\n${cut}`;
            if (chunk.length > notesBudget)
                break;
            notesBudget -= chunk.length + 1;
            parts.push(chunk);
        }
        // 3) 本日 access.log 检索命中（回想强度信号）
        try {
            const hits = readFileSync(join(memRoot, 'audit', 'access.log'), 'utf8').split('\n').filter((l) => l.trim())
                .map((l) => { try {
                return JSON.parse(l);
            }
            catch {
                return null;
            } })
                .filter((o) => !!o && !Number.isNaN(Date.parse(String(o.t))) && Date.parse(String(o.t)) >= since);
            if (hits.length) {
                const agg = new Map();
                for (const h of hits) {
                    const k = `notes/${h.f || '?'} §${h.s || '?'}`;
                    agg.set(k, (agg.get(k) || 0) + 1);
                }
                parts.push('### 本日 access 检索命中\n' + [...agg.entries()].map(([k, v]) => `- ${k} ×${v}`).join('\n'));
            }
        }
        catch { /* 无 access.log=无 */ }
        // 4) 窗口内蒸馏运行统计（成败对比材料；ExpeL 式信号；2026-09-09 v17）
        //    只取「带 stop 字段」的 distill-run 行：writeDispatch 与 distillAgent 会双写审计（前两者无 stop），
        //    直接过滤 kind 会把每次 run 计 2 次——此处以 stop 存在为唯一 run 记号（distillAgent 汇总行）。
        //    红线：只给统计与 stop/route 字段，不携带 target 文件名与 reason 全文（可能含项目专名，跨工作区红线）。
        try {
            let runs = 0, ok = 0, bad = 0, mem = 0, proj = 0, rej = 0;
            for (const l of readFileSync(auditFile, 'utf8').split('\n')) {
                if (!l.trim())
                    continue;
                try {
                    const o = JSON.parse(l);
                    if (o.kind !== 'distill-run' || typeof o.stop !== 'string')
                        continue;
                    if (!Number.isNaN(Date.parse(String(o.at))) && Date.parse(String(o.at)) < since)
                        continue;
                    runs++;
                    if (o.stop === 'completed')
                        ok++;
                    else
                        bad++;
                    if (o.route === 'memory')
                        mem++;
                    else if (o.route === 'project')
                        proj++;
                    rej += Number(o.rejected) || 0;
                }
                catch { /* 坏行跳过 */ }
            }
            if (runs > 0) {
                const stat = `### 窗口内任务运行统计（成败对比材料；ExpeL 式信号）\n- 蒸馏运行 ${runs} 次：成功（stop=completed）${ok} / 异常（error/timeout/aborted）${bad}；写入分布 memory ${mem} 条 / project ${proj} 条 / 拒收 ${rej} 条`;
                parts.push(stat.length > 800 ? stat.slice(0, 800) : stat);
            }
        }
        catch { /* 无审计文件=无统计 */ }
        // 5) 跨窗口任务候选（路线②）：flow-candidates/ 恒随材料（不限水位）——低置信「成功做过且成类型的任务」记忆，
        //    让深睡能跨天看到「同类型重复」（[路径] 判据的数据基础）；仅背景材料，非源指针。
        //    S4（2026-09-09）：候选带「成功次数/跨会话」字段——满足 成功≥2 且跨会话≥2 的转正候选排序置顶，
        //    深睡可据此直接归纳 [路径]（memory-core-model §4 转正门槛：成功≥2 且跨会话≥2）。
        try {
            const candFiles = existsSync(candidateDir) ? readdirSync(candidateDir).filter((f) => f.endsWith('.md')) : [];
            if (candFiles.length) {
                const scoreCand = (f) => {
                    try {
                        const body = readFileSync(join(candidateDir, f), 'utf8');
                        const n = Number((body.match(/- 成功次数：(\d+)/) || [])[1] || 0);
                        const cross = Number((body.match(/- 跨会话：(\d+)/) || [])[1] || 0);
                        return { n, cross };
                    }
                    catch {
                        return { n: 0, cross: 0 };
                    }
                };
                // 转正候选（成功≥2 且跨会话≥2）置顶；其余按时间序；最多取 8 个
                const sorted = candFiles
                    .map((f) => ({ f, ...scoreCand(f) }))
                    .sort((a, b) => ((b.n >= 2 && b.cross >= 2 ? 1 : 0) - (a.n >= 2 && a.cross >= 2 ? 1 : 0)) || (a.f < b.f ? -1 : 1))
                    .slice(0, 8);
                const blocks = ['### 跨窗口任务候选（背景材料，非源指针；含成功次数/跨会话）'];
                let cbudget = 2400;
                for (const { f } of sorted) {
                    if (cbudget <= 0)
                        break;
                    try {
                        const body = readFileSync(join(candidateDir, f), 'utf8').slice(0, 600);
                        const chunk = `### candidate/${f}\n${body}`;
                        if (chunk.length > cbudget)
                            break;
                        cbudget -= chunk.length + 1;
                        blocks.push(chunk);
                    }
                    catch { /* 跳过坏候选 */ }
                }
                if (blocks.length > 1)
                    parts.push(blocks.join('\n'));
            }
        }
        catch { /* 无候选区=无 */ }
        return parts.join('\n\n');
    };
    // 习得原则/任务路径落盘（v17：[原则]/[路径] 并入 AGENT.md）：宿主拼装新全文 → write_gate 校验（容量/指针/行格式）→ 原子替换（冲突=原地 replace）
    const applyPrinciples = async (memRoot, out) => {
        const principlesPath = join(memRoot, 'AGENT.md');
        const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs');
        if (!existsSync(gateScript))
            return { added: 0, replaced: 0, skipped: 0, gate: 'write_gate 未就位' };
        let content = '';
        try {
            content = readFileSync(principlesPath, 'utf8');
        }
        catch {
            content = PROFILE_HEADER['AGENT.md'] + '\n';
        }
        const lines = content.split(/\r?\n/);
        let added = 0, replaced = 0, skipped = 0;
        for (const p of ((out && Array.isArray(out.principles)) ? out.principles : [])) {
            const text = String((p && p.text) || '').trim();
            if (!/^\[(原则|路径)\].+→\s*notes\/[A-Za-z0-9_-]+\.md/.test(text)) {
                skipped++;
                continue;
            } // 行格式宿主预检（v17：[路径] 同行门禁；gate 亦校验 [tag] 索引行）
            if (p && p.action === 'replace') {
                const match = String(p.match || '').trim();
                const idx = lines.findIndex((l) => l.trim() === match);
                if (idx < 0) {
                    skipped++;
                    continue;
                }
                lines[idx] = text;
                replaced++;
            }
            else {
                if (lines.some((l) => l.trim().toLowerCase() === text.toLowerCase())) {
                    skipped++;
                    continue;
                } // 去重
                lines.push(text);
                added++;
            }
        }
        if (!added && !replaced)
            return { added, replaced, skipped, gate: 'no-op' };
        const tmpPath = principlesPath + '.tmp';
        try {
            writeFileSync(tmpPath, lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n'), 'utf8');
            const g = await runNode(config.nodeBin, gateScript, ['AGENT.md', tmpPath], { env: { MEMORY_ROOT: memRoot }, timeout: 20000 });
            if (g.status === 0) {
                renameSync(tmpPath, principlesPath);
                return { added, replaced, skipped, gate: 'pass' };
            }
            try {
                unlinkSync(tmpPath);
            }
            catch { /* */ }
            const reason = g.status === 1 ? '超限=原则间合并（本轮跳过）' : g.status === 2 ? '指针悬空/未注册' : g.status === 4 ? '行格式违规' : `gate exit=${g.status}`;
            log(`deep sleep: write_gate 拒收（${reason}）: ${textOf(g).slice(0, 120)}`);
            return { added, replaced, skipped, gate: reason };
        }
        catch (e) {
            try {
                unlinkSync(tmpPath);
            }
            catch { /* */ }
            return { added, replaced, skipped, gate: '落盘异常: ' + String(e.message).slice(0, 80) };
        }
    };
    /**
     * 深睡 parent 兜底（2026-09-08 修复：无 parent 直接崩 —— reading 'options'）。
     * 悖论：深睡在「全部会话停滞/结束」时触发，此时 ctx.agents.roots() 常为空，
     * 而宿主 spawn 必须有 parent（resolveChildDepth 读 parent.options）→ 必然会睡的时候必然崩。
     * 解法：事件中缓存最近一次活动过的 agent（对象带 options/ctx 即可当 parent 用），
     * 顺序=当前 roots → 在册 agents → 缓存的最近 agent；都没有则跳过本轮并审计（绝不崩）。
     */
    let lastParent = null;
    let daemonParent = null;
    const isValidParent = (p) => !!p && typeof p === 'object' && !!p.options && !!p.ctx;
    const rememberAgent = (a) => { try {
        if (isValidParent(a))
            lastParent = a;
    }
    catch { /* */ } };
    const pickParent = () => {
        try {
            for (const r of ctx.agents.roots() || [])
                if (isValidParent(r))
                    return r;
        }
        catch { /* */ }
        try {
            for (const a of ctx.agents.list() || [])
                if (isValidParent(a))
                    return a;
        }
        catch { /* */ }
        return isValidParent(lastParent) ? lastParent : null;
    };
    /**
     * 守护 parent（最后兜底）：服务重启后若从未有过会话活动，roots/list/lastParent 全空，
     * 深睡将永远跑不起来（夜间正是这种场景）。此时用插件 ctx 惰性创建一个常驻 agent 当 parent
     * （只用于承载子代理创建，不给它下发任何任务）；创建失败则退回 no-parent 跳过，不崩。
     */
    /**
     * 默认 LLM 路由（守护 parent 用）：优先插件配置，其次宿主默认模型服务。
     * 守护 parent 是新建的空 agent，没有会话继承模型；不显式给路由，子代理会 100ms 内
     * stop=error 且零输出（实测），归纳必然空转。
     */
    const resolveDefaultModel = () => {
        try {
            const c = ctx;
            const svc = c.agentDefaultModel ?? (typeof c.get === 'function' ? c.get('agentDefaultModel') : undefined);
            const sel = svc && typeof svc.currentSelection === 'function' ? svc.currentSelection() : null;
            if (sel && sel.provider && sel.model)
                return { provider: String(sel.provider), model: String(sel.model) };
        }
        catch { /* 解析失败=不给路由 */ }
        return undefined;
    };
    const ensureDaemonParent = async (signal, agentOptions) => {
        if (isValidParent(daemonParent))
            return daemonParent;
        try {
            // sessionId 必须显式给：宿主用它当 agent id（缺省会抛 agent id "undefined" does not match session id）
            const handle = await ctx.agents.create({
                sessionId: `session-${randomUUID()}`,
                ...(agentOptions ? { agentOptions } : {}),
                signal,
            });
            const a = handle && handle.agent ? handle.agent : handle;
            if (isValidParent(a)) {
                daemonParent = a;
                log('deep sleep: 已建立守护 parent（无会话场景承载归纳子代理）');
                return a;
            }
            log('deep sleep: 守护 parent 创建结果不可用');
        }
        catch (e) {
            log(`deep sleep: 守护 parent 创建失败：${String(e?.message || e).slice(0, 120)}`);
        }
        return null;
    };
    /** 返回 'done'=本轮窗口已消化（推进水位）；'failed'=瞬时故障（回滚水位，下轮可重试同一批痕迹） */
    const runDeepSleep = async (sinceArg) => {
        try {
            const since = sinceArg ?? traceSince();
            const resolved = resolveTarget();
            if (!resolved.present) {
                log('deep sleep: 记忆库缺席（部署残缺），跳过');
                return 'failed';
            }
            const traces = gatherDeepSleepTraces(resolved.root, since);
            // 无痕迹=无事可归纳，不调用 LLM、不留审计（防每巡检周期一条 no-traces 的膨胀与空转感）——
            // 「没有材料就不需要睡眠」：窗口直接滑到当前，未来痕迹 mtime 必然晚于水位，永不丢失。
            if (!traces) {
                log(`deep sleep: 窗口内无痕迹（起点 ${new Date(since).toLocaleString()}），窗口滑到当前，本轮不睡`);
                return 'no-traces';
            }
            log(`deep sleep: 窗口内痕迹 ${traces.length} 字符（起点 ${new Date(since).toLocaleString()}）`);
            const currentPrinciples = (() => { try {
                return readFileSync(join(resolved.root, 'AGENT.md'), 'utf8');
            }
            catch {
                return '';
            } })();
            const currentList = currentPrinciples.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[(原则|路径)\]/.test(l)).join('\n') || '（暂无条目）';
            // 双画像巩固材料：现行 USER/AGENT 画像全文（行格式门禁的 replace 依据）
            const currentProfiles = ['USER.md', 'AGENT.md'].map((f) => {
                let body = '';
                try {
                    body = readFileSync(join(resolved.root, f), 'utf8');
                }
                catch { /* 无文件=空 */ }
                return `### ${f}\n${body.trim() || '（空）'}`;
            }).join('\n\n');
            validateProvider();
            const userInput = [
                '## 当天记忆痕迹（作用域=本日，不做全库扫描）',
                traces,
                `## 现行原则/路径（冲突时 replace，match 逐字取自此清单）\n${currentList}`,
                `## 现行画像（profileOps 的 replace match 逐字取自此处）\n${currentProfiles}`,
                '请按规则处理：提炼跨任务泛化原则与双画像更新指令，输出 JSON。',
            ].join('\n\n');
            const resolvedLlm = resolveLlm(config.sleepProvider, config.sleepModel);
            const useProvider = !!resolvedLlm && providerFailCount < 2;
            const agentOptions = useProvider ? { provider: resolvedLlm.provider, model: resolvedLlm.model } : undefined;
            const ac = new AbortController();
            const timeout = setTimeout(() => { try {
                ac.abort(new Error('deep sleep timeout 10min'));
            }
            catch { /* */ } }, 600000);
            let parent = pickParent();
            // 守护 parent 默认关闭（宿主「新建空 agent 当 parent」路径未经验证，实测子代理 100ms stop=error）
            if (!parent && config.deepSleepDaemonParent) {
                const route = agentOptions ?? resolveDefaultModel();
                log(`deep sleep: 无可用 agent，尝试守护 parent（路由 ${route ? `${route.provider}/${route.model}` : '继承默认'}）`);
                parent = await ensureDaemonParent(ac.signal, route);
            }
            if (!parent) {
                log('deep sleep: 无可用 parent agent（宿主 spawn 必需），跳过本轮');
                audit({ kind: 'deep-sleep', result: 'no-parent' });
                return 'failed';
            }
            try {
                const run2 = await ctx.subagents.start('spawn', {
                    label: 'deep-sleep-induction',
                    parent,
                    signal: ac.signal,
                    maxDepth: 1,
                    ...(agentOptions ? { agentOptions } : {}),
                    prompt: [{ type: 'text', text: userInput }],
                    persona: DEEP_SLEEP_PROMPT,
                    toolFilter: { allow: [] },
                });
                const result = await Promise.race([
                    run2.result,
                    new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'timeout' }), 600000)),
                ]);
                clearTimeout(timeout);
                const stop = result && result.stopReason;
                if (stop !== 'completed')
                    log(`deep sleep: 子代理非正常结束 stop=${stop} 详情=${JSON.stringify(result).slice(0, 400)}`);
                const out = parseAgentJson(result, 'deep sleep');
                if (stop === 'completed' && out)
                    providerFailCount = 0;
                else if (useProvider && (stop !== 'completed' || !out))
                    providerFailCount++;
                const app = (stop === 'completed' && out)
                    ? await applyPrinciples(resolved.root, out)
                    : { added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}` };
                // 双画像巩固：profileOps（add/replace，须 notes 源指针；格式/容量/去重门禁同蒸馏）
                let profileAdded = 0;
                if (stop === 'completed' && out && Array.isArray(out.profileOps)) {
                    const ops = out.profileOps.filter((o) => o && ['USER.md', 'AGENT.md'].includes(String(o.target)) && ['add', 'replace'].includes(String(o.action)));
                    for (const op of ops) {
                        const r = writeProfileLine(resolved.root, String(op.target), String(op.section || ''), String(op.text || ''), op.action === 'replace' ? String(op.match || '') : undefined);
                        if (r === 'added')
                            profileAdded++;
                    }
                }
                log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）画像 +${profileAdded}`);
                audit({ kind: 'deep-sleep', stop, added: app.added, replaced: app.replaced, skipped: app.skipped, profiles: profileAdded, gate: app.gate });
                if (stop === 'completed') {
                    // 路线② 晨起摘要 delta：深睡消化后的行级 diff（新增/替换 [原则]/[路径]/画像行 ≤3）→ suite/knowledge/delta.md
                    // 语义：delta 是「最近变化的新闻」，AGENT.md/USER.md 是档案全本；delta 永非事实源，过期即弃（下轮深睡覆盖）。
                    try {
                        const afterAgent = (() => { try {
                            return readFileSync(join(resolved.root, 'AGENT.md'), 'utf8');
                        }
                        catch {
                            return '';
                        } })();
                        const rows = [];
                        const pushDiff = (beforeText, afterText) => {
                            const pre = new Set((beforeText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
                            for (const l of (afterText || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
                                if (pre.has(l))
                                    continue;
                                const tag = (l.match(/^\[([^\] ]+)\]/) || [])[1];
                                if (tag === '原则' || tag === '路径' || l.startsWith('- '))
                                    rows.push(l);
                            }
                        };
                        pushDiff(currentPrinciples, afterAgent); // AGENT 全档 diff：覆盖 [原则]/[路径] 行与 AGENT 画像 '- ' 行
                        pushDiff(currentProfiles, (() => { try {
                            return readFileSync(join(resolved.root, 'USER.md'), 'utf8');
                        }
                        catch {
                            return '';
                        } })()); // USER 画像行（currentProfiles 已含 USER 原文作 before）
                        if (rows.length) {
                            const deltaFile = join(kRoot, 'delta.md');
                            writeFileSync(deltaFile, JSON.stringify({ at: new Date().toISOString(), staleAt: new Date(Date.now() + 48 * 3600e3).toISOString(), injections: 0, rows: rows.slice(0, 3) }, null, 2), 'utf8');
                            log(`deep sleep: 晨起摘要已生成（${Math.min(rows.length, 3)} 行）`);
                        }
                    }
                    catch (e) {
                        log(`deep sleep: 晨起摘要生成失败 ${String(e?.message || e).slice(0, 100)}`);
                    }
                }
                // 子代理异常结束（stop=error/timeout/aborted）不算消化：回滚水位，同一批痕迹下轮可重试。
                // 2026-09-09 补缺：stop=completed 但 out=null（JSON 解析失败，如「Unexpected end of JSON input」实锤 ×2）
                // 同样不算消化——否则 done 分支推进水位，整批痕迹永久划出窗口（归纳结果整轮丢失）。
                return (stop === 'completed' && out) ? 'done' : 'failed';
            }
            catch (e) {
                clearTimeout(timeout);
                if (useProvider)
                    providerFailCount++;
                log(`deep sleep ERROR: ${String(e?.message || e).slice(0, 200)}`);
                audit({ kind: 'deep-sleep', error: String(e?.message || e).slice(0, 160) });
                return 'failed';
            }
        }
        catch (e) {
            log(`deep sleep err: ${String(e?.message || e).slice(0, 120)}`);
            return 'failed';
        }
    };
    /**
     * 输出增长探测（状态机 PROBING，加固版 2026-09-08）——**避免一次采样错判就把长任务睡掉**：
     *   ① 多轮采样：`deepSleepProbeSamples`（默认 3）轮 × `deepSleepProbeWindowMs`，任一轮检出增长即判长任务；
     *   ② 多信号交叉：转录 size/mtime 增长（主证据）+ 事件心跳（探测期间来事件即中止，回 RUNNING）
     *      + agent 存活 + agent.status 活跃态；状态活跃但无增长=**证据冲突**，不直接判卡住，转 suspect 复核；
     *   ③ 卡住需连续 `deepSleepProbeConfirm`（默认 2）轮确认，首轮落 **suspect**（阻塞睡眠，下轮巡检复核）；
     *   ④ 探针不可用/异常：内部重试 `deepSleepProbeRetries`（默认 2）次，仍失败才按「无法确认 → 正常睡」处理；
     *   ⑤ 总时长 `deepSleepProbeMaxMs` 兜底，防悬挂；停滞计时一律沿用 lastEventAt（不刷新成 now，否则永不睡）。
     */
    const probeSession = (rec) => {
        if (rec.state === 'probing')
            return;
        rec.state = 'probing';
        rec.probeAt = Date.now();
        rec.probeRound = (rec.probeRound || 0) + 1;
        const short = (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8));
        const samples = Math.max(1, Number(config.deepSleepProbeSamples) || 3);
        const confirm = Math.max(1, Number(config.deepSleepProbeConfirm) || 2);
        const retries = Math.max(1, Number(config.deepSleepProbeRetries) || 2);
        const windowMs = Math.max(5000, Number(config.deepSleepProbeWindowMs) || 60000);
        const maxMs = Math.max(windowMs * samples + 30000, Number(config.deepSleepProbeMaxMs) || 600000);
        const started = Date.now();
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const agentAlive = () => { try {
            return !!ctx.agents.get(rec.sid);
        }
        catch {
            return false;
        } };
        const agentActive = () => { try {
            const a = ctx.agents.get(rec.sid);
            const s = a && a.status;
            return !!s && s !== 'idle';
        }
        catch {
            return false;
        } };
        void (async () => {
            try {
                // ① 定位转录（失败重试 retries 次；期间若来新事件则中止）
                let file = null;
                for (let i = 0; i < retries && !file; i++) {
                    file = await locateTranscript(rec.sid);
                    if (!file && i < retries - 1)
                        await sleep(windowMs);
                    if (rec.state !== 'probing')
                        return; // 新事件打断 → 交回状态机，不覆盖
                }
                if (!file) {
                    rec.probeResult = 'no-transcript';
                    rec.state = 'ended';
                    rec.lastEndAt = rec.lastEventAt;
                    log(`deep sleep probe: ${short} 探针不可用（已重试 ${retries} 次）→ 无法确认为长任务，按停滞处理（正常睡眠）；请检查记忆仓 locate-transcript-probe 是否就位`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'no-transcript', rounds: rec.probeRound, note: '探针不可用，无法确认长任务，按停滞处理' });
                    return;
                }
                // ② 多轮采样：任一轮 size/mtime 增长 → long-run
                const snap = () => {
                    try {
                        const st = statSync(file);
                        return { mtimeMs: st.mtimeMs, size: st.size };
                    }
                    catch {
                        return null;
                    }
                };
                let prev = snap();
                let grew = false, delta = 0, rounds = 1;
                for (let i = 1; i < samples; i++) {
                    await sleep(windowMs);
                    if (rec.state !== 'probing')
                        return; // 事件心跳：探测期间会话恢复活跃 → 中止
                    if (Date.now() - started > maxMs)
                        break;
                    const cur = snap();
                    if (!cur)
                        break;
                    if (prev && (cur.size !== prev.size || cur.mtimeMs > prev.mtimeMs)) {
                        grew = true;
                        delta = cur.size - prev.size;
                        rounds = i + 1;
                        break;
                    }
                    prev = cur;
                    rounds = i + 1;
                }
                if (rec.state !== 'probing')
                    return;
                if (grew) {
                    rec.probeResult = 'long-run';
                    rec.state = 'running';
                    rec.lastEventAt = Date.now(); // 唯一会刷新水位的分支（确认长任务，3h 后再复查）
                    rec.stallRound = 0;
                    rec.probeEvidence = { rounds, samples, deltaBytes: delta, alive: true, active: true };
                    log(`deep sleep probe: ${short} 第 ${rounds}/${samples} 轮检出输出增长（+${delta}B）→ 正常长任务，不睡`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'long-run', deltaBytes: delta, rounds, samples });
                    return;
                }
                // ③ 无增长：二次确认存活（防瞬时查找失败误判 exit）
                const alive1 = agentAlive();
                if (!alive1)
                    await sleep(3000);
                const alive = alive1 && agentAlive();
                const active = agentActive();
                rec.probeEvidence = { rounds, samples, deltaBytes: 0, alive, active };
                if (!alive) {
                    rec.probeResult = 'exit';
                    rec.state = 'ended';
                    rec.lastEndAt = rec.lastEventAt;
                    log(`deep sleep probe: ${short} ${samples} 轮无增长且会话已消失（二次确认）→ 异常退出（正常睡眠）`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'exit', rounds, samples, note: '会话已退出（二次确认）' });
                    return;
                }
                if (active) {
                    // 证据冲突：状态说活跃但输出没长 → 不判卡住，转 suspect 复核（宁可多等一轮，不误判长任务）
                    rec.state = 'suspect';
                    rec.probeResult = 'conflict';
                    log(`deep sleep probe: ${short} 无输出增长但 agent 状态活跃 → 证据冲突，转 suspect 下轮复核`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'conflict', rounds, samples, note: '状态活跃但无输出增长，复核' });
                    return;
                }
                // ④ 卡住需连续 confirm 轮确认
                const sr = (rec.stallRound || 0) + 1;
                rec.stallRound = sr;
                if (sr >= confirm) {
                    rec.probeResult = 'stall';
                    rec.state = 'stalled';
                    log(`deep sleep probe: ${short} 连续 ${sr}/${confirm} 轮无输出增长（会话仍在）→ 确认卡住，不阻塞睡眠（请人工确认）`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'stall', rounds, samples, stallRound: sr, idleMin: Math.round((Date.now() - rec.lastEventAt) / 60000), note: '疑似卡住：连续无输出增长且会话未退出' });
                }
                else {
                    rec.state = 'suspect';
                    rec.probeResult = 'suspect';
                    log(`deep sleep probe: ${short} 第 ${sr}/${confirm} 次无增长 → suspect，下轮巡检复核（期间阻塞睡眠）`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'suspect', rounds, samples, stallRound: sr });
                }
            }
            catch (e) {
                rec.probeResult = 'error';
                rec.state = 'ended';
                rec.lastEndAt = rec.lastEventAt;
                log(`deep sleep probe err ${short}: ${String(e?.message || e).slice(0, 120)} → 按停滞处理（正常睡眠）`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'error', rounds: rec.probeRound, note: String(e?.message || e).slice(0, 120) });
            }
        })();
    };
    const deepSleepCheck = () => {
        if (!config.enableDeepSleep || deepSleepRunning)
            return;
        const now = Date.now();
        const idleMs = Number(config.deepSleepIdleMs) || 10800000;
        const probeAfter = Number(config.deepSleepProbeAfterMs) || idleMs;
        let hottest = sessions.size ? 0 : lastActivityAt; // 无在册会话时用全局兜底水位
        let probing = 0, stalled = 0, ended = 0, running = 0;
        for (const [sid, rec] of sessions) {
            try {
                if (!ctx.agents.get(sid)) {
                    sessions.delete(sid);
                    continue;
                }
            }
            catch {
                sessions.delete(sid);
                continue;
            }
            // 状态机推进：running 且无事件 ≥ probeAfter → 发起探测；suspect → 下轮巡检复核（卡住需连续确认）
            if (config.deepSleepProbe) {
                if (rec.state === 'running' && now - rec.lastEventAt >= probeAfter)
                    probeSession(rec);
                else if (rec.state === 'suspect')
                    probeSession(rec);
            }
            if (rec.state === 'probing' || rec.state === 'suspect') {
                probing++;
                continue;
            } // 未决/待复核 → 阻塞本轮（不睡）
            if (rec.state === 'stalled') {
                stalled++;
                continue;
            } // 已确认无输出 → 不阻塞睡眠
            if (rec.state === 'ended')
                ended++;
            else
                running++;
            const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt;
            if (act > hottest)
                hottest = act;
        }
        if (probing > 0) {
            log(`deep sleep: ${probing} 个会话探测未决，本轮跳过（保守不睡）`);
            return;
        }
        if (now - hottest < idleMs)
            return;
        if (hottest <= lastDeepSleepAt)
            return; // 本轮停滞窗口已消化（新活动推进水位后重新武装）
        deepSleepRunning = true;
        const prevDeepSleepAt = lastDeepSleepAt;
        // 窗口起点必须在推进水位**之前**取：lastDeepSleepAt 一旦置为 now，traceSince() 会退化成
        // max(今日 0 点, now)=now，痕迹扫描窗口变成 [now, now] → 恒「本日无痕迹」（2026-09-09 实修）。
        const since = traceSince();
        lastDeepSleepAt = now;
        log(`deep sleep: 触发（停滞 ${Math.round((now - hottest) / 60000)}min ≥ 阈值 ${Math.round(idleMs / 60000)}min · 会话态 running=${running} ended=${ended} stalled=${stalled}）`);
        runDeepSleep(since).then((r) => {
            // 水位语义：done（消化了材料）与 no-traces（确认无材料）都把窗口滑到当前——未来痕迹 mtime 必然
            // 更晚，不丢；只有 failed（有材料但没消化成，如 no-parent / 子代理异常）回滚，同一批下轮重试。
            // 这同时消解空转：无材料滑窗后 hottest ≤ 水位 → 后续巡检直接 return，不再每 10min 重触发。
            if (r === 'failed') {
                lastDeepSleepAt = prevDeepSleepAt;
                log('deep sleep: 本轮未消化（failed），水位回滚（同一批痕迹下轮可重试）');
            }
            else
                lastDeepSleepAt = now;
        }).catch((e) => {
        }).catch((e) => {
            lastDeepSleepAt = prevDeepSleepAt;
            log(`deep sleep err: ${String(e?.message || e).slice(0, 120)}（水位回滚）`);
        }).finally(() => { deepSleepRunning = false; });
    };
    /** 状态机快照——面板展示 / 手动触发（POST /deepsleep/trigger）/ 配置读写（/deepsleep/config）均读这里 */
    const getDeepSleepStatus = () => {
        let hottest = sessions.size ? 0 : lastActivityAt;
        const list = [];
        let running = 0, ended = 0, probing = 0, stalled = 0, suspect = 0;
        for (const rec of sessions.values()) {
            if (rec.state === 'probing')
                probing++;
            else if (rec.state === 'suspect')
                suspect++;
            else if (rec.state === 'stalled')
                stalled++;
            else if (rec.state === 'ended')
                ended++;
            else
                running++;
            if (rec.state !== 'stalled' && rec.state !== 'probing' && rec.state !== 'suspect') {
                const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt;
                if (act > hottest)
                    hottest = act;
            }
            list.push({ sid: (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8)), state: rec.state, lastEventAt: rec.lastEventAt, lastEndAt: rec.lastEndAt, probeResult: rec.probeResult });
        }
        return {
            enabled: !!config.enableDeepSleep,
            idleMs: Number(config.deepSleepIdleMs) || 10800000,
            probeAfterMs: Number(config.deepSleepProbeAfterMs) || (Number(config.deepSleepIdleMs) || 10800000),
            lastActivityAt: hottest,
            lastDeepSleepAt,
            running, ended, probing, suspect, stalled,
            nextEligibleAt: hottest + (Number(config.deepSleepIdleMs) || 10800000),
            sessions: list,
        };
    };
    /** 手动触发入口（T2 面板「立即归纳一次」）：复用 deepSleepRunning 并发守卫，避免与自动巡检重叠。 */
    const runDeepSleepNow = async () => {
        if (deepSleepRunning)
            return { ok: false, error: 'deep-sleep-already-running' };
        deepSleepRunning = true;
        try {
            // 手动触发同样按上次水位取窗口；done（消化）/ no-traces（确认无材料）都推进水位防重复回想，failed 回滚
            const since = traceSince();
            const r = await runDeepSleep(since);
            if (r !== 'failed')
                lastDeepSleepAt = Date.now();
            return { ok: true, result: r };
        }
        catch (e) {
            return { ok: false, error: String(e?.message || e).slice(0, 160) };
        }
        finally {
            deepSleepRunning = false;
        }
    };
    /** 运行中深度睡眠配置（T2 面板「可调」展示源；持久化经 ~/.dsh/suite/scheduler.json） */
    const getConfig = () => ({
        enableDeepSleep: !!config.enableDeepSleep,
        deepSleepIdleMs: Number(config.deepSleepIdleMs) || 10800000,
        deepSleepProbe: !!config.deepSleepProbe,
        deepSleepProbeAfterMs: Number(config.deepSleepProbeAfterMs) || (Number(config.deepSleepIdleMs) || 10800000),
        deepSleepProbeWindowMs: Number(config.deepSleepProbeWindowMs) || 60000,
    });
    // ── 事件订阅（effect 自动清理，reload 零泄漏）──
    const idleTimers = new Map();
    const armIdleTimer = (agent) => {
        rememberAgent(agent); // 深睡 parent 兜底缓存
        const sid = agent.id;
        const old = idleTimers.get(sid);
        if (old)
            clearTimeout(old);
        const t = setTimeout(() => {
            idleTimers.delete(sid);
            distillAgent(agent).catch((e) => log(`distill agent err ${sidShort(sid)}: ${String(e?.message || e).slice(0, 120)}`));
        }, config.idleWakeMs);
        idleTimers.set(sid, t);
    };
    ctx.on('session/event', (session, event) => {
        try {
            if (!event || event.type !== 'turn/end')
                return;
            const reason = event.data && event.data.reason;
            if (reason && reason.kind && reason.kind !== 'completed')
                return;
            const sid = session && session.id;
            if (!sid)
                return;
            const agent = ctx.agents.get(sid);
            if (!agent)
                return;
            const origin = agent.session && agent.session.header && agent.session.header.origin;
            if (origin === 'subagent')
                return;
            noteEvent(sid, true); // 状态机：turn 完成 → ENDED（停滞计时起点）
            armIdleTimer(agent);
        }
        catch { /* 事件回调零抛出 */ }
    });
    ctx.on('agent/disposed', ({ agent }) => {
        try {
            const t = idleTimers.get(agent.id);
            if (t) {
                clearTimeout(t);
                idleTimers.delete(agent.id);
            }
        }
        catch { /* */ }
        try {
            sessions.delete(agent.id);
        }
        catch { /* */ }
    });
    ctx.on('session/disposed', (session) => {
        try {
            const sid = session && session.id;
            const t = idleTimers.get(sid);
            if (t) {
                clearTimeout(t);
                idleTimers.delete(sid);
            }
        }
        catch { /* */ }
        try {
            sessions.delete(session && session.id);
        }
        catch { /* */ }
    });
    // ═══ 路线④ 打扰度观察（shadow-first MVP）：打分/滞回/冷却/落影子日志，默认不做上下文注入 ═══
    // 设计（v5.2 §5 + §9④）：先攒 activation-shadow.jsonl 真实样本校准阈值（T_on/T_off 初值 0.62/0.52），
    // 校准满意后再由用户开 activationPrefetch 走 active（注入接线=后续档，非本 MVP）。
    const actShadowFile = join(kRoot, 'audit', 'activation-shadow.jsonl');
    const actState = new Map();
    const actConf = {
        on: Number(config.activationTOn) || 0.62,
        off: Number(config.activationTOff) || 0.52,
        cooldown: Math.max(0, Number(config.activationCooldownSteps) || 3),
        topK: Math.min(5, Math.max(1, Number(config.activationTopK) || 3)),
    };
    const activationStep = (sid, event) => {
        try {
            if (!event)
                return;
            const d = event.data || {};
            const arr = Array.isArray(d.content) ? d.content : [];
            let text = '';
            for (const c of arr)
                if (c && c.type === 'text' && typeof c.text === 'string')
                    text += c.text;
            if (event.type !== 'user/message' || !text.trim())
                return;
            const { rows, tokens } = recallIndex(memoryLibRoot(), text, actConf.topK, 'all');
            if (!tokens.length)
                return;
            const sim = Math.min(1, (rows.length ? rows[0].score : 0) / tokens.length);
            let st = actState.get(sid) || { state: 'idle', cooldown: 0, prevScore: 0 };
            const prev = st.state;
            let emit = false;
            if (st.cooldown > 0)
                st.cooldown--;
            if (sim >= actConf.on && st.cooldown === 0 && st.state === 'idle') {
                st.state = 'prefetch';
                emit = true;
                st.cooldown = actConf.cooldown;
            }
            else if (sim < actConf.off && st.state !== 'idle') {
                st.state = 'idle';
            }
            st.prevScore = sim;
            actState.set(sid, st);
            // 影子校准：每个有打分的 user 消息都落一行（跃迁/emit 也落）——样本分布是阈值校准原料，宁密勿稀
            try {
                mkdirSync(dirname(actShadowFile), { recursive: true });
                appendFileSync(actShadowFile, JSON.stringify({
                    at: new Date().toISOString(), kind: 'activation-step', sid: sid.slice(0, 8), mode: config.activationPrefetch ? 'prefetch-armed' : 'shadow',
                    state: st.state, prev, sim: Number(sim.toFixed(3)), tOn: actConf.on, tOff: actConf.off,
                    emit, tokens: tokens.length, hit: rows.length ? rows[0].line.slice(0, 120) : '',
                    pointers: rows.slice(0, 2).map((r) => r.pointer), excerpt: text.slice(0, 60),
                }) + '\n', 'utf8');
            }
            catch { /* 影子日志失败静默 */ }
        }
        catch { /* 观察零抛出 */ }
    };
    // ═══ 积压扫尾（2026-09-10 用户拍板：稳健性修复——旧 ctx 失败/重启/错过空闲窗的会话自动补蒸馏）═══
    // 候选：仍在 ctx 根内的会话、水位<内存末事件 seq、且已出「10min 宽限期」（避免与 idle 定时器抢跑/打断用户续聊）。
    // 无 FSM 记录的历史会话（如重启前已结束的）一律视为积压候选直接补。
    const sweepBacklog = async () => {
        try {
            const roots = (ctx.agents && typeof ctx.agents.roots === 'function') ? ctx.agents.roots() : [];
            for (const a of roots) {
                try {
                    if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function')
                        continue;
                    const origin = a.session && a.session.header && a.session.header.origin;
                    if (origin === 'subagent')
                        continue;
                    const sid = a.id;
                    if (distilling.has(sid))
                        continue;
                    const rec = sessions.get(sid);
                    if (rec) {
                        if (rec.state === 'running' || rec.state === 'probing' || rec.state === 'suspect')
                            continue;
                        if (rec.lastEndAt && Date.now() - rec.lastEndAt < config.idleWakeMs)
                            continue; // 仍在宽限期，等 idle 定时器
                    }
                    const wm = readWatermarks().get(sid);
                    const lastSeq = wm ? (wm.lastSeq || 0) : 0;
                    let maxSeq = lastSeq;
                    for (const e of a.session.snapshotEvents()) {
                        const s = e.seq ?? 0;
                        if (s > lastSeq && s > maxSeq)
                            maxSeq = s;
                    }
                    if (maxSeq > lastSeq) {
                        log(`sweep: ${sidShort(sid)} 水位 ${lastSeq}→${maxSeq} 有未消化增量，补蒸馏`);
                        void distillAgent(a).catch(() => { });
                    }
                }
                catch { /* 单会话扫尾失败静默 */ }
            }
        }
        catch { /* 扫尾零抛出 */ }
    };
    // 状态机活跃信号：**任意**根会话事件 → RUNNING（长任务持续产生 chunk/tool 事件即持续刷新水位）
    ctx.on('session/event', (session, event) => {
        try {
            const sid = session && session.id;
            if (!sid)
                return;
            const a = ctx.agents.get(sid);
            if (!a)
                return;
            const origin = a.session && a.session.header && a.session.header.origin;
            if (origin === 'subagent')
                return;
            noteEvent(sid, false);
            rememberAgent(a); // 深睡 parent 兜底缓存（任意根会话事件都刷新）
            if (config.activationShadow !== false || config.activationPrefetch)
                activationStep(sid, event); // 路线④：影子默认开；prefetch 置位后决策通路照走（影子行 mode 区分），实际注入仍待影子校准（后续档）
        }
        catch { /* 状态迁移零抛出 */ }
    });
    ctx.effect(() => {
        const t = setTimeout(() => {
            try {
                const roots = ctx.agents.roots();
                log(`distill 启动（守藏蒸馏器 · idleWake ${Math.round(config.idleWakeMs / 60000)}min · adopt roots=${roots.length} · 数据区 ${kRoot}）`);
                validateProvider();
            }
            catch (e) {
                log(`adopt err: ${String(e?.message || e).slice(0, 120)}`);
            }
        }, 2000);
        return () => clearTimeout(t);
    }, SHORT + ': distill adopt');
    // 深度睡眠巡检定时器（10min 一查；effect 清理，reload 零泄漏）
    ctx.effect(() => {
        const probeOk = existsSync(probeScriptPath);
        log(`deep sleep 巡检启动（enable=${config.enableDeepSleep} · 停滞阈值 ${Math.round((Number(config.deepSleepIdleMs) || 10800000) / 60000)}min · 探测 ${config.deepSleepProbe ? '开' : '关'}${config.deepSleepProbe ? `（无事件 ${Math.round((Number(config.deepSleepProbeAfterMs) || 10800000) / 60000)}min 后发起，探针${probeOk ? '就位' : '缺失→无法确认即正常睡'}）` : ''}）`);
        const iv = setInterval(() => { try {
            deepSleepCheck();
        }
        catch { /* 巡检零抛出 */ } }, DEEP_SLEEP_CHECK_MS);
        return () => clearInterval(iv);
    }, SHORT + ': deep-sleep check');
    // ═══ 蒸馏器清理（reload/ctx dispose 零泄漏）：清空遗留 idle 定时器——旧 fiber 定时器在 ctx 失效后触发
    // 正是「cannot get required service subagents in inactive context」报错的根源（2026-09-10 修复）═══
    ctx.effect(() => {
        return () => {
            try {
                for (const [, t] of idleTimers)
                    clearTimeout(t);
            }
            catch { /* */ }
            try {
                idleTimers.clear();
            }
            catch { /* */ }
            try {
                distilling.clear();
            }
            catch { /* */ }
        };
    }, SHORT + ': distill cleanup');
    // 积压扫尾定时器：启动 30s 首扫（覆盖重载/重启前错过窗口、仍在内存的会话）+ 每 10min 周期扫
    ctx.effect(() => {
        const run = () => { try {
            void sweepBacklog();
        }
        catch { /* 扫尾零抛出 */ } };
        const t0 = setTimeout(run, 30000);
        const iv = setInterval(run, DEEP_SLEEP_CHECK_MS);
        return () => { clearTimeout(t0); clearInterval(iv); };
    }, SHORT + ': distill sweep');
    return { getDeepSleepStatus, runDeepSleepNow, getConfig };
}
//# sourceMappingURL=distill.js.map