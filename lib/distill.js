/**
 * distill.ts — ADR-0002 阶段 2：蒸馏器（自记忆插件 index.ts 迁入，写入分发重接 targets.ts）。
 *
 * 事件链（ADR-0004 模式）：ctx.on('session/event') turn/end(completed) 且 root agent → per-agent idle 定时器
 *   → 到点且 agent idle → 内存增量（snapshotEvents 水位后）→ 预筛（信号词 + pending 候选；皆无则跳过不唤醒）
 *   → spawn 蒸馏子代理（maxDepth=1，10min 超时 race）→ 结构化 JSON（route=memory|project|discard）
 *   → targets.ts 动态路由 + 白名单门禁（不符合不存）→ 零拷贝写入（memory-append；R3 项目事实直写 workspace devref）
 *   → 水位推进（suite/knowledge/audit/distill-watermark.jsonl）→ 蒸馏审计（distill-audit.jsonl，UI 统计卡数据源）。
 *   v18 分段蒸馏（2026-09-10）：增量先由 buildEventChunks 按 CHUNK_CHARS/事件边界切段（不劈事件），distillAgent
 *   逐段 spawn——每段成功即推水位到该段 endSeq（断点续传，失败只停本段下轮续、不整窗重蒸）、段间紧凑清单 manifest
 *   续上下文防同轮重复入册、单轮至多 MAX_CHUNKS_PER_RUN 段；修复旧「整窗一次注入 24k 截断丢尾 / 失败整窗重蒸」。
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
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, unlinkSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDeepSleep } from './deepsleep.js';
import { dshHome, knowledgeRoot, memoryLibRoot, resolveTarget, loadWhitelist, gateMemoryAppend, } from './targets.js';
import { recallRanked, semanticSim } from './vec.js';
// 深睡判据层：2026-09-12 自本文件抽出为 ./deepsleep-core.ts（架构根治 P1）。
// 下方 `export *` 是**过渡兼容**——两个行为测试件仍从 lib/distill.js 取这些符号，
// 直接断链会让它们模块解析即失败（本仓 09-12 已栽过一次「重命名后测试件断链」）。
// 待消费方全部改指 deepsleep-core 后，可删掉该行并改为精确具名导入。
import { DISCARD_SNAPSHOT_CB_N, SKIP_HOLD_MAX, planSkipWatermark, runDiscardWatermark, resolveWatermarkBaseline, } from './deepsleep-core.js';
export * from './deepsleep-core.js';
// ═══ v18 分段蒸馏常量（2026-09-10 拍板「分段蒸馏 + 每段成功即推水位（可续传）+ 段间紧凑清单续上下文」）═══
// 开放可校准：CHUNK_CHARS=单段字符预算（切段只在事件边界、不劈事件），MAX_CHUNKS_PER_RUN=单轮触发至多处理段数
// （超出的段留待下一触发续传——水位停在已处理段的 endSeq）；UI 登记/参数化列为后续档。
const CHUNK_CHARS = 10000;
const MAX_CHUNKS_PER_RUN = 3;
// 蒸馏文本化规则单一实现（buildEventChunks 唯一入口，防口径漂移）：user/message 的每个 text 内容片
// ≤2000 前缀、assistant/chunk block-end 的 text ≤3000 前缀；事件无文本片 → 空数组。
const textPartsOfEvent = (e) => {
    const parts = [];
    if (e.type === 'user/message') {
        const d = e.data || {};
        const arr = Array.isArray(d.content) ? d.content : [];
        for (const c of arr)
            if (c && c.type === 'text' && typeof c.text === 'string')
                parts.push('[user] ' + c.text.slice(0, 2000));
    }
    else if (e.type === 'assistant/chunk') {
        const c = e.data && e.data.chunk;
        if (c && c.type === 'block-end' && c.block && c.block.type === 'text' && typeof c.block.text === 'string')
            parts.push('[assistant] ' + c.block.text.slice(0, 3000));
    }
    return parts;
};
/**
 * buildEventChunks — v18 分段器（2026-09-10）：把 seq>lastSeq 的事件增量按「累计字符超 chunkChars 即切段」切成若干段。
 * - 文本化规则 = 模块级 textPartsOfEvent 单一实现（user text 片 ≤2000、assistant block-end text ≤3000）；
 * - 切段只在事件边界，绝不劈事件；单个事件文本超 chunkChars 时允许单事件成段；
 * - 无文本事件并入当前开放段（只推进其 endSeq，不增字符）；窗口开头、首个文本事件之前的无文本事件不占段，
 *   但恒被水位推进覆盖（蒸馏成功推至首段 endSeq / 跳过推至 maxSeq），不丢事件；
 * - 窗口内完全没有 seq>lastSeq 的事件 → chunks=[]、maxSeq=lastSeq；maxSeq=窗口最末事件 seq；
 * - 不再返回 truncatedTail（2026-09-11 清理：该字段恒 false 且无消费方）；「还有后续段未处理」由调用方按
 *   chunks.length 与本轮段数上限（MAX_CHUNKS_PER_RUN）判定（水位停在已处理段的 endSeq，下一触发续传）。
 */
export function buildEventChunks(agent, lastSeq, chunkChars = CHUNK_CHARS, eventsOf) {
    const events = eventsOf || agent.session.snapshotEvents();
    let maxSeq = lastSeq;
    const chunks = [];
    let cur = null;
    for (const e of events) {
        const seq = e.seq ?? 0;
        if (seq <= lastSeq)
            continue;
        if (seq > maxSeq)
            maxSeq = seq;
        const parts = textPartsOfEvent(e);
        if (!parts.length) {
            if (cur)
                cur.endSeq = seq;
            continue;
        }
        const partLen = parts.reduce((n, p) => n + p.length, 0);
        // 追加成本 = 各文本片长度 + join('\n') 分隔符数（cur 已有内容时每个新片前多一个 \n；开新段时片间分隔 n-1 个）
        const addCost = partLen + (cur ? parts.length : parts.length - 1);
        if (cur && cur.len + addCost > chunkChars) {
            chunks.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') });
            cur = null;
        }
        if (!cur)
            cur = { startSeq: seq, endSeq: seq, parts: [], len: 0 };
        for (const p of parts) {
            cur.len += p.length + (cur.parts.length > 0 ? 1 : 0);
            cur.parts.push(p);
        }
        cur.endSeq = seq;
    }
    if (cur)
        chunks.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') });
    return { chunks, maxSeq };
}
// 段间紧凑清单（v18）：manifest 行构造 / 推入（字符上限超出丢最早行）。行=每段成功后追加，
// 只服务「同轮后段查重/合并」；跨轮查重由「相关既有记忆（recallRanked）」承担。
const manifestLineFor = (endSeq, route, out) => {
    const seen = new Set();
    const topics = [];
    // appends 目标小节（归一化后）前 12 字去重，最多 3 个
    for (const a of (out && Array.isArray(out.appends)) ? out.appends : []) {
        if (!a || topics.length >= 3)
            continue;
        // v21（§8.1 分裂律）：section 可为树状路径「父/子」——逐段各截 12 字，不整体截断（否则同父下不同子撞键）
        const sec = String(a.section || '').trim().replace(/^[§#]+\s*/, '').replace(/(\/)?\s*[§#]+\s*/g, '$1')
            .split('/').map((s) => s.trim().slice(0, 12)).filter(Boolean).join('/');
        if (!sec || seen.has(sec))
            continue;
        seen.add(sec);
        topics.push(sec);
    }
    // newIndex 行主题最多 2 个（`[tag] 主题 · …` 取主题前 12 字）
    let niCount = 0;
    for (const ni of (out && Array.isArray(out.newIndex)) ? out.newIndex : []) {
        if (!ni || niCount >= 2)
            continue;
        const m = String(ni.line || '').match(/^\[[^\]\s]+\]\s*([^·]+?)\s*·/);
        const theme = m ? m[1].trim().slice(0, 12) : '';
        if (!theme || seen.has(theme))
            continue;
        seen.add(theme);
        topics.push(theme);
        niCount++;
    }
    const n = (out && Array.isArray(out.appends)) ? out.appends.length : 0;
    return `[segment ${endSeq}] route=${route} appends=${n} topics=${topics.length ? topics.join(',') : '-'}`;
};
const manifestPush = (manifest, line, cap) => {
    const next = manifest ? manifest + '\n' + line : line;
    if (next.length <= cap)
        return next;
    const ls = next.split('\n');
    let drop = 0;
    while (ls.length - drop > 1 && ls.slice(drop).join('\n').length > cap)
        drop++;
    return ls.slice(drop).join('\n');
};
// （会话活跃状态机 FSM 文档与 SessState / DeepSleepStatus / SessRec 已迁至 ./deepsleep-core.ts）
// ── 蒸馏裁决契约 v7（ADR-122 记忆核心 v2：判据段由 skill/engine/criteria.json 生成，禁手写）──
// v4 变更：取消「记忆库 vs 项目卡库」粒度二分——跨项目有用的细粒度条文也进 notes；项目专属事实直写项目工作区 devref；
//          新增 profiles 双画像通道（用户画像 USER + Agent 自我画像 AGENT，Q2「归谁」的落地写入通道）。
// v5 变更：appends 条目可选 rootCause/avoidWhen——教训/踩坑类浓缩附 WHY 根因与「不适用」场景。
// v7 变更（v2 架构）：① 判据段（R1-R4 + 四问 + Q2 画像判定）改为**生成投影** INGEST_JUDGE（源=criteria.json）；
//          ② 四问**降级为归属子判据组**（不再是全局判据抬头）；③ **删除「规则→SOUL.md」死支**（宿主无该写入通道）；
//          ④ 输出可带可选 `judgement`（L0 四维 + dup）→ 宿主写 judgement-ledger 供对账。
import { INGEST_JUDGE, JUDGEMENT_HINT, LEDGER_FILE, CRITERIA_VERSION } from './criteria.generated.js';
import { evaluateL0, promoteVerdict } from './criteria.js';
export const DEFAULT_DISTILL_PROMPT = `你是知识整理蒸馏子代理（守藏契约 v5）。任务：从给定会话增量正文中，判定每条可复用知识的归属（第一层路由），再输出结构化入册指令（由宿主执行写入，你无需也不能直接写文件/跑命令）。
判定锚（v4 单库）：只有一个记忆库——notes 存「下次做类似任务时给 agent 的方向」与跨项目有用的事实；项目专属事实不属于全局库，直写项目工作区。
${INGEST_JUDGE}
委派禁令：**独立完成，绝不 spawn/委派任何子代理**（查重凭给定正文与你自身知识判断）。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"route":"memory","appends":[{"target":"notes/tools.md","section":"<既有 ## 小节名，或「父/子」路径>","text":"教程式浓缩：目标一句+编号步骤+注意，≤120字"}],"newIndex":[{"target":"MEMORY.md","line":"[tag] 主题 · 概况短语/短语/短语 → notes/x.md §小节"}],"profiles":[{"target":"USER.md|AGENT.md","section":"≤12字小节名","text":"≤80字一句话"}],"projectCards":[{"cardType":"how-to|reference|decision","title":"≤20字","text":"≤200字","source":"≤30字"}],"skipped":[{"title":"...","reason":"≤30字"}]}
约束：route=memory → 填 appends/newIndex（target 白名单 notes/tools.md notes/flows.md notes/lessons.md notes/env.md notes/release.md；section = 既有 ## 小节名，或「父/子」树状路径（子节不存在时宿主自动建 ###，v21）；**裂 ### 判据（spec §8.1 分裂律）**：目标 ## 小节**子树正文 > 1000 字**（R=一次读取单元）**或同级条目 > 6 条**（K，防横向膨胀）→ 裂出子节、用「父/子」路径写入；否则并入父节（宁并勿滥裂，一层必须缩小候选集才有意义）；**text 教程式三段**「目标：… 1. … 2. … 注意：…」只写方向指引级浓缩——目标形态/步骤轮廓/关键注意点，不搬细节条文，纯事实类可省步骤保留目标行；**newIndex.line 格式权威=记忆库 spec §8**：[tag] 主题 · 概况短语/短语/短语 → notes/<file>.md §小节，定界符 ·=段界 /=短语界 →=指针，主题≤12字名词性禁冒号复合，概况名词短语 / 分隔、≤30字、高判别实词（专名/数值/路径关键词）、禁日期溯源），profiles/projectCards 留空；profiles 仅在 route=memory 时可填（0-2 条，宁缺毋滥，须是稳定画像而非一次性事实）；route=project → 填 projectCards（cardType: how-to=操作步骤/reference=契约事实/decision=架构决策），其余留空；route=discard → 除 skipped 全空；与 route 不匹配的条目宿主拒收。教训/踩坑类（notes/lessons.md 或 [lesson] 语境）可在 appends 条目附可选 rootCause/avoidWhen（各 ≤30 字，v5）——宿主写入时自动追加「- 根因：…」「- 不适用：…」两行，让教训带 WHY 与不适用条件（对标 WikiSkill pattern 双记 + When NOT to Apply），其余条目省略。
${JUDGEMENT_HINT}`;
// ── 宿主注入样板判别（**单一实现**：候选区 isNoiseIntent + 打扰度采样 activationStep 共用；2026-09-11 ACT-024）──
// 背景：DSH 会把宿主注入块作为 `user/message` 事件下发——运行态快照（Current runtime context）、后台 job/子代理回执
// （Background subagent|job …）、`<system-reminder>` 指令块、子代理消息回执（Agent <uuid> sent a message）。这类文本
// 既不构成「可复用的任务类型」（候选区），也不代表用户任务意图（打扰度采样：实测 909 样本污染 49.3%）。
// 首选判别是**结构字段 `data.source.kind`**（采样侧已用）；本内容闸用于无 source 的旧格式/夹具事件与候选区文本兜底。
export const CANDIDATE_NOISE = [
    /^Current runtime context\b/i,
    /<system-reminder>/i,
    /^Background (subagent|job)\b/i,
    /^background (subagent|job)\b/, // 实测真实模板是小写 `background job pwsh-1 (…)`，旧正则漏判
    /^You are an AI agent\b/i,
    /^Agent [0-9a-f-]{8,} sent a message\b/i, // 子代理→父会话回执
    /^#\s*守藏[·\s]/, // 热记忆横幅（若被当作用户输入）
];
/** 文本是否宿主注入样板（见上：候选区与采样共用的单一实现） */
export const isNoiseIntent = (s) => CANDIDATE_NOISE.some((re) => re.test(String(s)));
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
            // 2026-09-10 实锤修复：宿主 process.env 含 NODE_OPTIONS（inspector --inspect=9445），子进程继承后
            // 端口冲突 → Node 启动异常（status=null / 无 stdout），所有 runNode 子脚本静默失效。
            // 统一清空 NODE_OPTIONS（子脚本无需 inspector），彻底消除该干扰。
            env: { ...process.env, NODE_OPTIONS: '', ...(opts?.env || {}) },
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
    // 判据台账（ADR-122 v2）：每次决策一行——判据取值 + 决策 + 结果 + 依据，供 scripts/criteria-audit.mjs 对账
    const ledgerFile = join(kRoot, LEDGER_FILE);
    const ledger = (o) => {
        try {
            mkdirSync(dirname(ledgerFile), { recursive: true });
            const dom = String(o.domain || '');
            const type = String(o.type || (dom === 'consolidate' ? 'decision.consolidate' : dom === 'ingest' ? 'decision.ingest' : 'event'));
            appendFileSync(ledgerFile, JSON.stringify({ at: new Date().toISOString(), criteriaVersion: CRITERIA_VERSION, type, ...o }) + '\n', 'utf8');
        }
        catch { /* 台账失败静默（不影响主流程） */ }
    };
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
    // 项目卡标题相似度（2026-09-10）：英文词 ≥2（含 vec 等短词）+ 中文 2-gram；
    // 相似度 = 交集/min(|A|,|B|) ≥0.42 —— 比指针门 Jaccard 宽松，适配「标题短、同事实不同措辞」（实测同类对 0.444~1.0、异主题 ≤0.30）
    // （实测「vec缓存指纹与重建机制」vs「vec 缓存模型指纹与重建」用 intentTokens+Jaccard 仅 0.45 漏判）
    const cardTokens = (text) => {
        const t = String(text || '').replace(/[^\w\u4e00-\u9fa5]+/g, ' ').trim();
        const out = new Set();
        for (const w of t.split(' '))
            if (/[A-Za-z0-9]/.test(w) && w.length >= 2)
                out.add(w.toLowerCase());
        const zh = (t.match(/[\u4e00-\u9fa5]+/g) || []).join('');
        for (let i = 0; i + 1 < zh.length; i++)
            out.add(zh.slice(i, i + 2));
        return [...out];
    };
    const cardSimilar = (a, b) => {
        const A = cardTokens(a), B = cardTokens(b);
        if (!A.length || !B.length)
            return 0;
        const inter = A.filter((x) => B.includes(x)).length;
        return inter / Math.min(A.length, B.length);
    };
    // 候选噪声闸：判别实现已上提为模块级 `isNoiseIntent`（单一实现，候选区 + 打扰度采样共用；2026-09-11 ACT-024）
    const ensureFlowCandidate = async (sid, intent) => {
        if (!intent || intent.length < 8 || isNoiseIntent(intent))
            return;
        try {
            mkdirSync(candidateDir, { recursive: true });
            const day = new Date().toISOString().slice(0, 10);
            // 同型聚合（memory-core-model §4 转正数据源）：intent 指纹与既有候选「类型线索」共享 ≥2 token 视为同型，
            // 追加本次源会话 + 成功计数到既有文件（跨会话可见重复 → 深睡可归纳 [路径]），否则新建候选。
            // v6 向量第二批：词法无同型时再走语义（dense ≥0.80 保守并，补措辞迥异漏网；embed 未启用/失败=新建）
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
            if (!matched) {
                try {
                    const ecfg = embedCfgOf();
                    if (ecfg.enabled) {
                        let bestSim = 0.8;
                        for (const f of existsSync(candidateDir) ? readdirSync(candidateDir).filter((x) => x.endsWith('.md')) : []) {
                            try {
                                const body = readFileSync(join(candidateDir, f), 'utf8');
                                const m = body.match(/- 类型线索：(.+)/);
                                if (!m)
                                    continue;
                                const s = await semanticSim(intent, m[1].trim(), ecfg);
                                if (s !== null && s > bestSim) {
                                    bestSim = s;
                                    matched = f;
                                }
                            }
                            catch { /* 坏候选跳过 */ }
                        }
                    }
                }
                catch { /* 语义匹配失败=按词法结论（新建） */ }
            }
            if (matched) {
                const fp = join(candidateDir, matched);
                const body = readFileSync(fp, 'utf8');
                const cur = body.match(/- 类型线索：(.+)/);
                const clue = cur ? cur[1].trim() : intent;
                // 跨会话计数：源会话不重复追加；会话集合数=跨会话信号（供深睡「同类型 ≥2 次且跨会话」判据）
                const sids = [...new Set([...(body.match(/^- 源会话：(.+)$/gm) || []).map((l) => l.replace(/^- 源会话：/, '').trim()), sid])];
                const n = sids.length;
                // 规范化整体重写（修 2026-09-11 实测缺陷）：原先只剔「源会话/成功次数/跨会话」三键，
                // **「最近更新」从不剔除** ⇒ 每次同型合并都再追加一行，实测单个候选累积 40 条重复行
                // （文件膨胀 + 「最近更新」语义失真）。现按固定字段序重建，任何字段都不会重复累积；
                // 源会话改为**每会话一行**，使跨会话数可从文件自身复算（不再只依赖计数行）。
                // v2（ADR-122）：转正资格由宿主判据函数**确定性预判**（单一实现 `criteria.ts#promoteVerdict`）——
                // 深睡材料据此直接看到"已达转正门槛"的证据，而不是只靠计数行措辞；判定结果同步落判据台账。
                const promote = promoteVerdict('path', { occurrences: n, sessions: n, success: true });
                const newBody = [
                    '# 任务候选（低置信 · 跨窗口记忆）',
                    '',
                    `- 类型线索：${clue}`,
                    ...sids.map((s) => `- 源会话：${s}`),
                    `- 成功次数：${n}`,
                    `- 跨会话：${n}`,
                    '- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）',
                    `- 转正判据：${promote.ok ? 'eligible' : 'not-yet'}（${promote.basis.join(' + ')}${promote.ok ? '' : ` · ${promote.reason}`}）`,
                    `- 最近更新：${day}`,
                    '',
                ].join('\n');
                writeFileSync(fp, newBody, 'utf8');
                ledger({
                    domain: 'consolidate', step: 'candidate-promote', sid: sid.replace(/^session-/, '').slice(0, 8),
                    criteriaId: 'consolidate.support.path', basis: promote.basis,
                    judgement: { evidence: n, stability: n >= 2 ? 'cross-day' : 'once', conflict: 'none', cost: 'conservative' },
                    decision: { promote: promote.ok ? 'eligible' : 'hold', reason: promote.reason, clue },
                    result: { occurrences: n, sessions: n, file: matched },
                });
                return;
            }
            let hash = 0;
            for (const c of intent)
                hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
            const f = join(candidateDir, `${day}-${hash.toString(36).slice(0, 6)}.md`);
            writeFileSync(f, `# 任务候选（低置信 · 跨窗口记忆）\n\n- 类型线索：${intent}\n- 源会话：${sid}\n- 成功次数：1\n- 跨会话：1\n- 状态：候选（非源指针；仅供深睡跨窗口同型判断——同类成功 ≥2 且跨会话 ≥2 由深睡归纳为 [路径]）\n- 最近更新：${day}\n`, 'utf8');
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
    /** G-20 熔断计数：sid → **连续**「快照不可用（maxSeq<=0）」轮次数；任一成功写入即复位（见 writeWatermark）。 */
    const snapshotUnavailableStreak = new Map();
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
    const writeWatermark = (sessionId, lastSeq, agent) => {
        try {
            // 双证随行（2026-09-10 v19）：格式代 + 锚点事件指纹。缺失则退化为纯数字水位（与旧行同构）。
            const ver = sessionFormatVersionOf(agent);
            const fp = agentFingerprintAt(agent, lastSeq);
            mkdirSync(dirname(watermarkFile), { recursive: true });
            appendFileSync(watermarkFile, JSON.stringify({
                sessionId, lastSeq, at: new Date().toISOString(),
                ...(ver === undefined ? {} : { formatVersion: ver }),
                ...(fp === null ? {} : { fp }),
            }) + '\n', 'utf8');
            // G-20：任一成功写入 = 本轮快照可用 → 熔断计数复位（单一复位点，覆盖全部写入点）
            snapshotUnavailableStreak.delete(sessionId);
        }
        catch { /* 静默 */ }
    };
    // ═══ 水位双证校验（2026-09-10 v19：抗会话格式代际迁移的 seq 重排）═══
    // 背景（alpha V0→V3 迁移实锤）：DSH 会话格式升级时 seq 被**密集重排**并插入 system/message 行，
    // 同一个数字不再指向同一个事件；守藏水位是自持的 sessionId→lastSeq 数字，迁移后：
    //   ① 若 live seq 空间比记录的小 → 增量窗口被放大成整会话 → LLM 成本爆炸 + 重复入册；
    //   ② 若 live seq 空间更大 → 事件在挪位后的序号上未被消费 → 静默跳过一段真实增量。
    // 两种都无声出错，故记录时同时落「格式代 + 锚点事件指纹」，读取时双证一致才信任：
    //   - 格式代不同（v0/v1/v2 → v3）= 已发生迁移 → 作废全量重蒸（宁可重蒸，不可错漏）；
    //   - 锚点事件指纹（type|time|data 长度）不符 = 序号空间被重排 → 同样作废；
    //   - 两证皆缺（v19 前的历史水位行）= 不可验证 → 不信任（重蒸一次，随后被新行升级为双证）。
    const sessionFormatVersionOf = (agent) => {
        try {
            const v = agent?.session?.header?.version;
            return typeof v === 'number' ? v : undefined;
        }
        catch {
            return undefined;
        }
    };
    /** 锚点事件指纹：记录时刻 lastSeq 处事件的 type|time|data 长度（seq 重排后此三元组随之改变）。 */
    const agentFingerprintAt = (agent, seq) => {
        try {
            if (!(seq > 0) || typeof agent?.session?.eventAt !== 'function')
                return null;
            const e = agent.session.eventAt(seq);
            if (!e)
                return null;
            let dl = -1;
            try {
                dl = JSON.stringify(e.data ?? null).length;
            }
            catch { /* 不可序列化 → -1 */ }
            return `${e.type || '?'}|${e.time ?? -1}|${dl}`;
        }
        catch {
            return null;
        }
    };
    /**
     * 未验证水位行的一次性收尾（作废留痕）：**跳到当前 live maxSeq 并写双证**，而不是写 0。
     * 为何不是 0：写 0 的行没有可用锚点（seq 0 无事件）→ 下次读仍判「不可验证」→ 每轮全量重蒸，形成死循环。
     * 为何跳到 maxSeq 是安全的：作废的三种情形（格式代变更 / 锚点指纹不符 / 双证缺失的历史行）都意味着
     * 「已消费边界」不可定位——不可定位就无法安全重蒸（可能错位重蒸整会话，也可能错位跳过），
     * 故从当前边界继续；旧版本已消费的部分由旧版本负责，不重复也不再回补。
     * 代价明确且可接受：不可定位的那一段增量不再回补（宁可少蒸一次，不可错位重蒸/错位跳过）。
     * G-20（2026-09-12）：本注释此前被自身代码违反——`snapshotEvents()` 抛异常时 catch 把 maxSeq 退化为 0，
     *   随后仍 `writeWatermark(sid, 0, agent)`，即写下本注释明令禁止的「0 行」。现由 runDiscardWatermark
     *   强制：maxSeq<=0 ⇒ **不写**（读侧 `lastSeq<=0 → null` 与不写等价，写 0 只污染文件与审计）。
     */
    const discardWatermark = (sid, reason, agent, wm) => {
        // G-20：实现下沉到导出的 runDiscardWatermark（可单测）；此处只管熔断计数的推进/复位，并回传 live 边界。
        const r = runDiscardWatermark(sid, reason, agent, wm, snapshotUnavailableStreak.get(sid) ?? 0, {
            writeWatermark, audit, log, versionOf: sessionFormatVersionOf,
        });
        if (r.wrote) {
            // 成功写入时 writeWatermark 已复位计数；此处保留原日志口径
            log(`watermark: ${sidShort(sid)} 双证失效（${reason}）→ 从当前边界 ${r.maxSeq} 继续（prevSeq=${wm?.lastSeq ?? '-'} prevVer=${wm?.formatVersion ?? '-'} ver=${sessionFormatVersionOf(agent) ?? '-'}）`);
        }
        else {
            snapshotUnavailableStreak.set(sid, r.streak);
        }
        return { maxSeq: r.maxSeq, wrote: r.wrote };
    };
    /**
     * 取基线。返回 null **仅当**真的需要全量（水位缺失 / seq 空间回退 / 快照不可用）；
     * 双证失效但 live 边界未回退时返回**降级基线**（lastSeq=当前 live maxSeq, degraded=true），
     * 不再返回裸 null —— 旧码返回 null 会让调用方 `baseline ? baseline.lastSeq : 0` 把 lastSeq 打成 0 ⇒ 整窗重蒸。
     */
    const resolveWatermark = (sid, agent, mapCache) => {
        const wm = (mapCache || readWatermarks()).get(sid);
        return resolveWatermarkBaseline(sid, wm, agent, {
            discard: discardWatermark,
            versionOf: sessionFormatVersionOf,
            fingerprintAt: agentFingerprintAt,
        });
    };
    // LLM 路由连败弃用（坑位补强：连败≥2 回落继承主会话模型，成功后复位）
    const llmState = { providerFailCount: 0 }; // 蒸馏与深睡**共享**（两侧都写）⇒ 以对象引用传递，传值快照会让两侧计数脱钩
    const validateProvider = () => {
        if (!(config.llmProvider && config.llmModel) || llmState.providerFailCount >= 2)
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
    // 2026-09-11 清理：原 extractDelta（24k 截断版）已实证**零调用**（全仓 grep 只剩定义与注释；原注释「勿删」与实况不符），
    // 故删除。文本化规则的唯一实现 = 模块级 textPartsOfEvent → buildEventChunks（蒸馏/深睡按需复用）。
    // E3 探针脚本路径：locateTranscript（蒸馏侧）与深睡探测**共用** ⇒ 留在 distill 并注入深睡，
    //   不放进 deepsleep.ts —— 否则蒸馏侧要反向 import 深睡，形成依赖倒置方向错误。
    const probeScriptPath = join(memoryLibRoot(), 'scripts', 'locate-transcript-probe.mjs');
    /** E3 桥：定位会话转录文件绝对路径（零拷贝调记忆仓 locate-transcript-probe；探测「是否还在输出」的硬证据） */
    const locateTranscript = async (sid) => {
        try {
            if (!existsSync(probeScriptPath))
                return null;
            const r = await runNode(config.nodeBin, probeScriptPath, [sid], { timeout: 15000 });
            if (r.status !== 0)
                return null;
            // 2026-09-11 修复（F-1 断链 · 双闸之第二闸）：原判据 `includes('session.jsonl')` 对 DSH 新命名
            //   `session.v3.jsonl.zstd` **恒 false**（不含子串 `session.jsonl`）⇒ 探针已定位成功仍被二次判 null。
            //   改为版本无关正则（与 archive-lib 的 TRANSCRIPT_NAME_RE 同判据，拒绝同族重复实现）。
            const line = textOf(r).trim().split('\n').map((s) => s.trim()).filter(Boolean).pop();
            if (!line)
                return null;
            return /^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(line.split(/[\\/]/).pop() || '') ? line : null;
        }
        catch {
            return null;
        }
    };
    const resolveWorkspace = async (sid) => {
        // 反解带瞬态容错：转录定位可能晚于会话 end 落盘 / 探针单次抖动 → 仅「定位失败」重试 3 次（1.5s 退避）；
        // 路径已定位但无 workspace 归属属永久无归属，重试无意义，直接返回 null 走 writeDispatch 降级链。
        // 2026-09-10 实锤修复：目录名 decode 有歧义（盘符冒号压成 '-' 且目录内连字符无法区分，D:\FF\shoucang → D-FF-shoucang
        // 无法还原冒号 → 校验失败 → project 卡全降级 pending 死循环）——改为优先读转录首行 cwd（权威无歧义），目录 decode 仅兜底。
        for (let attempt = 1; attempt <= 3; attempt++) {
            let file = null;
            try {
                file = await locateTranscript(sid);
            }
            catch {
                file = null;
            }
            if (!file)
                log(`ws 反解: 转录定位失败 attempt=${attempt} sid=${sid.slice(0, 18)}`);
            if (file) {
                // ① 权威：转录首行 session.cwd
                try {
                    const cwdProbe = join(memoryLibRoot(), 'scripts', 'transcript-cwd-probe.mjs');
                    if (existsSync(cwdProbe)) {
                        const r = await runNode(config.nodeBin, cwdProbe, [file], { timeout: 30000 });
                        const wsCwd = r.status === 0 ? textOf(r).trim() : '';
                        if (wsCwd && /^[A-Za-z]:[\\/]/.test(wsCwd))
                            return wsCwd;
                        log(`ws 反解: cwd 探针无结果 status=${r.status} out=${JSON.stringify(textOf(r).slice(0, 80))}`);
                    }
                    else {
                        log(`ws 反解: cwd 探针缺失 ${cwdProbe}`);
                    }
                }
                catch (e) {
                    log(`ws 反解: cwd 探针异常 ${String(e?.message || e).slice(0, 80)}`);
                }
                // ② 兜底：目录名 decode（盘符冒号补全）
                const m = file.match(/sessions[\\/]+(--.+?--)[\\/]/);
                if (m) {
                    const ws0 = m[1].slice(2, -2).replace(/--/g, '\\').replace(/~0040/g, '@');
                    const ws = /^([A-Za-z])\\/.test(ws0) ? ws0[0] + ':' + ws0.slice(1) : ws0;
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
    // 容量门实时读取（2026-09-10：面板调容量门后写门即时生效，不必重载插件）——
    // 优先 scheduler.json 的 capAgent/capUser/capMemory（= 面板同源），回落启动期 config 值。
    const liveCaps = () => {
        const d = { agent: config.capAgent ?? 3000, user: config.capUser ?? 3000, memory: config.capMemory ?? 5000 };
        try {
            const s = JSON.parse(readFileSync(join(dshHome(), 'suite', 'scheduler.json'), 'utf8'));
            if (typeof s.capAgent === 'number' && s.capAgent > 0)
                d.agent = s.capAgent;
            if (typeof s.capUser === 'number' && s.capUser > 0)
                d.user = s.capUser;
            if (typeof s.capMemory === 'number' && s.capMemory > 0)
                d.memory = s.capMemory;
        }
        catch { /* 配置不可读=用启动值 */ }
        return d;
    };
    const capEnv = () => {
        const c2 = liveCaps();
        return { SHOUCANG_CAP_MEMORY: String(c2.memory), SHOUCANG_CAP_USER: String(c2.user), SHOUCANG_CAP_AGENT: String(c2.agent) };
    };
    // ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
    const memAppend = async (target, kind, payload, section, t) => {
        const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs');
        const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload];
        return runNode(config.nodeBin, script, args, { env: { MEMORY_ROOT: t.root, ...capEnv() }, timeout: 20000 });
    };
    // ── 双画像维护（2026-09-08 用户拍板：蒸馏/睡眠不只补记忆，还更新 USER/AGENT 双画像——助理角色要有自我认知）
    //    v16：AGENT.md 升格为「成长型自我画像」（含 [原则] 习得原则），容量 2,000→3,000 ──
    // v5.1（2026-09-10 架构体检实锤）：契约教模型输出 target=USER|AGENT，写门却只认 USER.md|AGENT.md →
    //   蒸馏 profiles 通道自 v15 上线以来每次写入必被拒（审计 kind=gate-reject target=USER/AGENT 为证）。
    //   模型输出的用词漂移一律在宿主侧收敛——与下方 section 归一化（前导 §/## 前缀）同法，不回退成「拒收」。
    const normalizeProfileTarget = (raw) => {
        const k = String(raw || '').trim().toLowerCase().replace(/\.md$/, '');
        return k === 'user' ? 'USER.md' : k === 'agent' ? 'AGENT.md' : null;
    };
    // 容量门同源（补齐 2026-09-10「画像/记忆容量与容量门同源」漏掉的第三处源：此处原为硬编码 3,000）
    const profileCapOf = (canon) => (canon === 'USER.md' ? liveCaps().user : liveCaps().agent);
    const PROFILE_HEADER = {
        'USER.md': '# USER.md — 用户画像\n\n> 「人」的画像：用户稳定偏好/背景/禁忌。库中唯一直接关于用户的文件；其余（notes/原则/索引/AGENT.md）皆为 agent 自身资产。写入口=蒸馏 profileUpdates + 深度睡眠 profileOps；每行带源指针。',
        'AGENT.md': '# AGENT.md — Agent 自我画像（助理的成长档案）\n\n> 用户助理角色的自我认知：角色定位/稳定做法/能力边界/常犯错误与教训/[原则] 习得原则（深度睡眠归纳内化，v16）。库中其余一切（notes/索引）都是本 agent 为履行助理职责而积累的自身资产，本文件只回答「我是谁、我学到了什么、我怎样服务好用户」。写入口=蒸馏 profileUpdates + 深度睡眠（原则行 + profileOps）；每行带源指针。',
    };
    /**
     * 画像行写入（宿主直写，tmp+rename 原子）：小节存在→小节尾加行；不存在→文件尾建小节。
     * 门禁：target 归一化后仅 USER.md/AGENT.md、小节名防注入、单行 ≤160 字符、库容量按 liveCaps()、去重、replace 须 match 逐字存在。
     * 返回带拒因（v5.1）：拒收原因写真进审计，不再糊成一句「格式/容量门」导致无法诊断。
     */
    const writeProfileLine = (root, target, section, line, replaceMatch) => {
        try {
            const canon = normalizeProfileTarget(target);
            if (!canon)
                return { st: 'rejected', why: `target 非画像（${String(target).slice(0, 24)}）` };
            const sec = String(section || '').trim().replace(/^##+ */, '').trim();
            const ln = String(line || '').trim();
            if (!sec || !ln || ln.length > 160 || /[#`]/.test(sec))
                return { st: 'rejected', why: `格式违规（${!sec ? '小节名为空' : !ln ? '行为空' : ln.length > 160 ? `行长 ${ln.length} > 160` : '小节名含 # 或 ` 注入字符'}）` };
            const file = join(root, canon);
            let body = '';
            try {
                body = readFileSync(file, 'utf8');
            }
            catch {
                body = (PROFILE_HEADER[canon] || `# ${canon}\n`) + '\n';
            }
            if (body.split('\n').some((l) => l.trim() === ln))
                return { st: 'dedup' };
            const cap = profileCapOf(canon);
            if (body.length + ln.length + sec.length + 8 > cap)
                return { st: 'rejected', why: `容量超限（${body.length}+${ln.length}+${sec.length}+8 > ${canon} 容量 ${cap}）` }; // 容量门：超限拒绝，待画像间合并
            const lines = body.split('\n');
            const secIdx = lines.findIndex((l) => l.trim() === `## ${sec}`);
            if (secIdx < 0)
                lines.push('', `## ${sec}`, ln);
            else if (replaceMatch) {
                const mi = lines.findIndex((l) => l.trim() === String(replaceMatch).trim());
                if (mi < 0)
                    return { st: 'rejected', why: 'replace 未逐字命中既有行' }; // replace 要求 match 逐字存在（防误改）
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
            return { st: 'added' };
        }
        catch {
            return { st: 'failed' };
        }
    };
    /**
     * 索引行新增 → 同步登记 notes/INDEX.md「条目元数据表」（维护台账）。
     * 判因（2026-09-11 ACT-030）：元数据表是「一行一主题」的维护台账，但 newIndex 通道从不登记
     * ⇒ 体检「未登记元数据表主题」缺口随每次蒸馏持续增长（实测存量 36 条）。这里补齐**登记端**，
     * 使台账随索引自动同步（幂等：同主题已存在则跳过）。失败不阻断索引写入——体检仍以 ⚠️ 暴露缺口。
     */
    const registerIndexMeta = (root, targetFile, indexLine, sid) => {
        try {
            if (!['MEMORY.md', 'USER.md', 'AGENT.md'].includes(targetFile))
                return;
            const idxFile = join(root, 'notes', 'INDEX.md');
            if (!existsSync(idxFile))
                return;
            // 主题口径与体检脚本一致：去标签 → 取 · 前 → 去 → 后 → 去 =/：复合前段
            const topic = String(indexLine).replace(/^\[[^\]]+\]\s*/, '').split('·')[0].split('→')[0].trim().split(/[=：]/)[0].trim();
            if (!topic)
                return;
            const body = readFileSync(idxFile, 'utf8');
            const meta = body.split('## 条目元数据表')[1];
            if (!meta || meta.includes(topic))
                return;
            const row = `| ${topic} | ${new Date().toISOString().slice(0, 10)} | agent | active | 蒸馏 ${sidShort(sid)} 新增 |`;
            const lines = body.split('\n');
            const note = lines.findIndex((l) => l.startsWith('> 维护规则：新增条目'));
            lines.splice(note > -1 ? note : lines.length, 0, row);
            const tmp = idxFile + '.tmp';
            writeFileSync(tmp, lines.join('\n'), 'utf8');
            renameSync(tmp, idxFile);
        }
        catch { /* 台账登记失败不阻断索引写入 */ }
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
                // 小节名归一化（2026-09-10 实锤：模型偶发输出带前导 § 的 section → memory-append 按字面找不到既有锚，
                // 整条落点失败 dispatch-failed）：去前导 §、把路径间游离 § 规整为 /（保留 父/子 路径语义）
                // 2026-09-10 再实锤：模型还可能输出 '## 小节名'（带 markdown 标记，如 741dc51b 落点失败）→ 一并归一化
                const _sec = String(a.section || '').trim().replace(/^[§#]+\s*/, '').replace(/(\/)?\s*[§#]+\s*/g, '$1');
                if (!_sec) {
                    failed++;
                    continue;
                }
                const r = await memAppend(String(a.target), 'append', _base + _rc + _aw, _sec, resolved);
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
                const nl = String(ni.line).trim();
                // 指针唯一性硬门（2026-09-10 用户拍板 v6：同类同事实的指针只允许一个）——
                // ① 精确键=同文件 同[标签]+同主题 → 拒；② 语义近似=标签同 + 主题 bigram 重叠 ≥0.66（双方 ≥2 token）→ 拒并留原指针。
                const mNew = nl.match(/^\[([^\]\s]+)\]\s*([^·]+?)\s*·/);
                if (mNew) {
                    const tagNew = mNew[1];
                    const themeNew = mNew[2].trim();
                    const tn = intentTokens(themeNew);
                    let dup = 'none';
                    const sameTagLines = [];
                    try {
                        for (const ol of readFileSync(join(resolved.root, t), 'utf8').split(/\r?\n/)) {
                            const m = ol.match(/^\[([^\]\s]+)\]\s*([^·]+?)\s*·/);
                            if (!m || m[1] !== tagNew)
                                continue;
                            const themeOld = m[2].trim();
                            if (themeOld === themeNew) {
                                dup = 'exact';
                                break;
                            }
                            const to = intentTokens(themeOld);
                            if (tn.length >= 2 && to.length >= 2) {
                                const inter = tn.filter((x) => to.includes(x)).length;
                                const union = new Set([...tn, ...to]).size;
                                if (union > 0 && inter / union >= 0.66) {
                                    dup = 'approx';
                                    break;
                                }
                            }
                            sameTagLines.push(ol.trim());
                        }
                    }
                    catch { /* 目标文件不存在=无既有行 */ }
                    // ③ 向量近似（v6 第二批 2026-09-10）：embed 可用时对同标签既有行整行语义比对（去指针段），
                    //    高阈值 0.80 保守拒并——补词法漏网的「措辞迥异同事实」；未启用/失败自动跳过（精确+词法已兜底）
                    if (dup === 'none' && sameTagLines.length && tn.length >= 1) {
                        try {
                            const ecfg = embedCfgOf();
                            if (ecfg.enabled) {
                                const headOf = (l) => { const i = l.indexOf('→'); return (i >= 0 ? l.slice(0, i) : l).trim(); };
                                const qText = headOf(nl);
                                for (const ol of sameTagLines) {
                                    const s = await semanticSim(qText, headOf(ol), ecfg);
                                    if (s !== null && s >= 0.8) {
                                        dup = 'sem';
                                        break;
                                    }
                                }
                            }
                        }
                        catch { /* 语义拒并失败=按既有词法结论 */ }
                    }
                    if (dup !== 'none') {
                        rejected++;
                        audit({ sid, kind: 'gate-reject', target: t, reason: `dup-index-topic:${dup}` });
                        log(`distill 拒收: 索引行重复（${dup} ${tagNew}/${themeNew.slice(0, 20)}），保留原指针（同类同事实唯一）`);
                        continue;
                    }
                }
                const r = await memAppend(t, 'new', nl, '-', resolved);
                if (r.status === 0) {
                    added++;
                    registerIndexMeta(resolved.root, t, nl, sid);
                }
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
                const w = writeProfileLine(resolved.root, String(p.target).trim(), String(p.section), `- ${String(p.text).trim()} ← 源: distill ${sidShort(sid)} ${date}`);
                if (w.st === 'added')
                    added++;
                else if (w.st === 'rejected') {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', target: p.target, reason: `画像更新被拒（${w.why}）` });
                }
                else if (w.st === 'failed')
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
            // 2026-09-10：project 卡去重门（防多轮蒸馏同主题重复产卡）——读 devref 已有卡标题，
            // 同标签语义近似（主题 bigram 重叠 ≥0.66，双方 ≥2 token）→ 判重跳过并审计（与 MEMORY 指针唯一性同口径）。
            const existingCardTitles = (() => {
                try {
                    return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
                        try {
                            const m = readFileSync(join(dir, f), 'utf8').match(/^#\s*\[项目事实\][^·]*·\s*(.+)$/m);
                            return m ? m[1].trim() : '';
                        }
                        catch {
                            return '';
                        }
                    }).filter(Boolean);
                }
                catch {
                    return [];
                }
            })();
            const cardDupOf = (title) => {
                if (cardTokens(title).length < 2)
                    return null;
                for (const ex of existingCardTitles) {
                    if (ex === title)
                        return ex;
                    if (cardSimilar(title, ex) >= 0.42)
                        return ex;
                }
                return null;
            };
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
                const dupOf = cardDupOf(String(pc.title));
                if (dupOf) {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', target: pc.title, reason: `项目卡重复（语义近似既有卡「${dupOf}」）——跳过防重复产卡`, lib: 'workspace' });
                    log(`distill 项目卡判重跳过: ${String(pc.title).slice(0, 30)}（≈ ${dupOf.slice(0, 30)}）`);
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
    // ── pending defer 卡直写（2026-09-10：project-defer 是「已裁决为项目卡」的降级暂存——workspace 恢复后
    //    应直接直写该工作区 devref，不再让 LLM 重裁决（重裁决会按本轮会话 route 一刀切导致项目卡被 skip 丢失）。
    //    flush 成功后移入 .processed（防重复）；workspace 仍不可解则留 pending 等下轮。──
    const flushDeferCards = async () => {
        let written = 0, kept = 0;
        let files = [];
        try {
            files = readdirSync(pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-project-defer-.*\.md$/.test(f));
        }
        catch {
            return { written, kept };
        }
        for (const f of files) {
            try {
                const raw = readFileSync(join(pendDir, f), 'utf8');
                const sidM = raw.match(/^-\s*源会话：\s*(session-\S+)/m);
                const titleM = raw.match(/^#\s*\[project-defer\]\s*(.+)$/m);
                const typeM = raw.match(/^-\s*卡类型：\s*(\S+)/m);
                if (!sidM || !titleM) {
                    kept++;
                    log(`defer 保留 ${f.slice(0, 40)}: 解析失败 sid=${!!sidM} title=${!!titleM}`);
                    continue;
                }
                const ws = await resolveWorkspace(sidM[1].trim());
                if (!ws) {
                    kept++;
                    log(`defer 保留 ${f.slice(0, 40)}: workspace 不可解（sid=${sidM[1].trim().slice(0, 18)}）`);
                    continue;
                } // workspace 仍不可解：留 pending
                const title = titleM[1].trim();
                const cardType = ['how-to', 'reference', 'decision'].includes(String(typeM ? typeM[1].trim() : '')) ? String(typeM[1].trim()) : 'reference';
                const bodyIdx = raw.indexOf('待蒸馏重裁决或人工认领');
                const body = bodyIdx >= 0 ? raw.slice(bodyIdx + '待蒸馏重裁决或人工认领'.length).trim() : '';
                const dir = join(ws, 'docs', 'devref', 'shoucang');
                mkdirSync(dir, { recursive: true });
                const date = new Date().toISOString().slice(0, 10);
                const slug = title.replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'card';
                const out = join(dir, `${date}-${cardType}-${slug}.md`);
                // 2026-09-10：语义判重（防同主题重复卡，与蒸馏直写同口径）——近似既有卡则只清 pending 不重复写
                const dupTitle = (() => {
                    if (cardTokens(title).length < 2)
                        return null;
                    try {
                        for (const ef of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
                            const m = readFileSync(join(dir, ef), 'utf8').match(/^#\s*\[项目事实\][^·]*·\s*(.+)$/m);
                            if (!m)
                                continue;
                            const ex = m[1].trim();
                            if (ex === title)
                                return ex;
                            if (cardSimilar(title, ex) >= 0.42)
                                return ex;
                        }
                    }
                    catch { /* 读取失败=不判重 */ }
                    return null;
                })();
                if (!dupTitle && !existsSync(out))
                    writeFileSync(out, `# [项目事实] ${cardType} · ${title}\n\n- 卡类型：${cardType}\n- 溯源：（defer 回流 ${f}）\n- 源会话：${sidM[1].trim()}\n- 工作区：${ws}\n\n${body}\n`, 'utf8');
                const procDir = join(pendDir, '.processed');
                try {
                    mkdirSync(procDir, { recursive: true });
                    renameSync(join(pendDir, f), join(procDir, f));
                }
                catch { /* 移动失败：下轮重试 */ }
                written++;
                audit({ kind: 'defer-flush', target: title, workspace: ws, cardType, file: f, sid: sidM[1].trim(), ...(dupTitle ? { dupOf: dupTitle } : {}) });
                log(`defer 回流: ${title.slice(0, 30)} → ${ws}/docs/devref/shoucang/${dupTitle ? `（判重跳过 ≈${dupTitle.slice(0, 24)}）` : ''}`);
            }
            catch (e) {
                kept++;
                log(`defer 回流失败 ${f.slice(0, 30)}: ${String(e?.message || e).slice(0, 100)}`);
            }
        }
        if (written || kept)
            log(`defer 回流汇总: 写入 ${written} / 保留 ${kept}`);
        return { written, kept };
    };
    // ── A1（2026-09-11 审查修复）：段落级落盘失败的有界重试 ──
    // 语义：stop/JSON 都 OK 但条目级写失败（白名单外目标、磁盘错误、原子写失败…）时**不再前移水位**；
    // 同一段连续失败满 MAX_DISPATCH_RETRY 次后强制推进 + 落审计 dispatch-failed-forced（丢失显式记账）。
    const MAX_DISPATCH_RETRY = 3;
    // ⚠ 记账口径误导（2026-09-12 实测，审计 800 行）：`dispatch-failed-forced` 记的是「同一段连败满 3 次」，
    //   而**真实丢料发生在「第 1 次失败后被跳过分支越过」**（50 个失败段中 35 段如此，真重扫仅 4 段）
    //   ⇒ forced 恒为 0，不能读作「没有丢料」。G-4a 修复后，这类丢料改由 distill-skip 审计行的
    //   `skipPlan=skip-abandoned-after-hold` 与 `heldForUndigested` 记账（见下方 A4 段）。
    const dispatchFailStreak = new Map(); // `${sid}#${endSeq}` → 连续失败次数（内存态，重启清零=最多再试 MAX 次）
    // ── A4（2026-09-12 G-4a）：**跳过分支不得越过「未消化段」推进水位** ──
    // 背景（2026-09-12 实测，审计 800 行）：段 dispatch 失败后水位确实保留（本段不写），
    //   但下一轮若命中 below-min / prescan-no-signal，旧码直接 `writeWatermark(sid, maxSeq)`
    //   ⇒ 水位一步跨过未消化段 ⇒ **该段永不重扫**：50 个失败段里 35 个是这样被越过的
    //   （真重扫只有 4 个）⇒ 这就是 `dispatch-failed-forced` 恒为 0 的真因：重试从未累积到第 2 次。
    // 处置：存在未消化段时**不推水位**（保留基线），把窗口留给下一轮再看一次；
    //   防死循环：连续 SKIP_HOLD_MAX 轮仍无进展 ⇒ 放弃并推 maxSeq，落审计显式记账。
    const skipHoldStreak = new Map(); // sid → 因未消化段而「扣住不推」的连续轮数
    // 本会话是否还有未消化段（= dispatchFailStreak 里还有它自己的失败段记账）
    const hasPendingUndigested = (sid) => {
        const p = `${sid}#`;
        for (const k of dispatchFailStreak.keys())
            if (k.startsWith(p))
                return true;
        return false;
    };
    // 判据本身是**模块级纯函数** `planSkipWatermark`（见 planDiscardWrite 附近），与 G-20 同规格，
    // 便于脱离宿主直接驱动；这里只持有状态（内存态，重载清零 ⇒ 最多再扣 SKIP_HOLD_MAX 轮）。
    // ── A3（2026-09-11 审查修复）：跨实例 claim 锁**统一判定** ──
    // 背景：claim 原只在 sweepBacklog 一侧读判，idle 路径（armIdleTimer → distillAgent）完全不查 ⇒
    //   重叠 fiber 的 idle 定时器可与扫尾同时蒸同一会话（注释宣称的「跨实例防双蒸」不成立）。
    // 现语义：claim 的**写**只发生在蒸馏入口（幂等）；扫尾只做只读让位判定；本轮结束/早退即释放。
    const CLAIM_TTL_MS = 25 * 60000;
    const claimDirOf = () => join(kRoot, 'audit', 'claims');
    const claimFileOf = (sid) => join(claimDirOf(), sid + '.json');
    /** 在途 claim（TTL 内）→ false（让位）；否则写入并返回 true。异常一律 true（claim 失败不阻塞，与既有语义一致） */
    const tryClaim = (sid, lastSeq, maxSeq) => {
        try {
            let at = 0;
            try {
                at = Number(JSON.parse(readFileSync(claimFileOf(sid), 'utf8')).at || 0);
            }
            catch { /* 无 claim */ }
            if (at && Date.now() - at < CLAIM_TTL_MS)
                return false;
            mkdirSync(claimDirOf(), { recursive: true });
            writeFileSync(claimFileOf(sid), JSON.stringify({ at: Date.now(), lastSeq, maxSeq }), 'utf8');
            return true;
        }
        catch {
            return true;
        }
    };
    const claimHeld = (sid) => {
        try {
            const at = Number(JSON.parse(readFileSync(claimFileOf(sid), 'utf8')).at || 0);
            return !!at && Date.now() - at < CLAIM_TTL_MS;
        }
        catch {
            return false;
        }
    };
    const releaseClaim = (sid) => { try {
        unlinkSync(claimFileOf(sid));
    }
    catch { /* 无 claim/删除失败均无害 */ } };
    const bankGitScript = join(memoryLibRoot(), 'scripts', 'bank-git.mjs');
    /** v2.2 睡眠期/定时自检（**单一实现**）：6 项检测 + 白名单窄动作。由两条路径调用——
     *  ① 深睡完成之后（宿主义务：子代理只归纳）② 计时器周期性（深睡触发严苛，靠它保证"想不起来也会做"）。 */
    const runSelfCheck = async (trigger) => {
        try {
            const scScript = join(memoryLibRoot(), 'scripts', 'sleep-selfcheck.mjs');
            if (!existsSync(scScript))
                return null;
            const scOut = join(kRoot, 'audit', 'selfcheck-latest.json');
            const scArgs = ['--out', scOut, '--trigger', trigger, ...(config.selfCheckRepo ? ['--repo', String(config.selfCheckRepo)] : [])];
            await runNode(config.nodeBin, scScript, scArgs, { env: { MEMORY_ROOT: memoryLibRoot() }, timeout: 180000 });
            const sc = JSON.parse(readFileSync(scOut, 'utf8'));
            const adjIds = (sc.adjustments || []).map((a) => a.id);
            // 台账 check.sleep **由脚本自己写**（三条触发路径同一处留痕）；此处只负责白名单动作与日志
            log(`selfcheck(${trigger}): 裁决 ${sc.verdict}${adjIds.length ? ' · 建议调整 ' + adjIds.join(',') : ''}`);
            if (config.selfCheckAutoRollback === true) {
                const adj = (sc.adjustments || []).find((a) => a.id === 'rollback-scoreWeights' && a.action);
                if (adj?.action) {
                    const cfgPath = join(dshHome(), 'suite', 'scheduler.json');
                    try {
                        copyFileSync(cfgPath, cfgPath + '.bak-selfcheck');
                    }
                    catch { /* 首次可能不存在 */ }
                    let cur = {};
                    try {
                        cur = JSON.parse(readFileSync(cfgPath, 'utf8'));
                    }
                    catch { /* */ }
                    writeFileSync(cfgPath, JSON.stringify({ ...cur, [adj.action.key]: adj.action.value }, null, 2), 'utf8');
                    ledger({ type: 'adjust.rollback', domain: 'consolidate', trigger, key: adj.action.key, value: adj.action.value, why: 'selfcheck R-3（shadow-sim.flipReady=false）', needsReload: true });
                    log(`selfcheck(${trigger}): 白名单回滚 ${adj.action.key}=${adj.action.value}（已备份 .bak-selfcheck；需重载生效）`);
                }
            }
            return { verdict: sc.verdict, adjustments: adjIds };
        }
        catch (e) {
            log(`selfcheck(${trigger}) 失败（不影响主流程）：${String(e.message).slice(0, 80)}`);
            return null;
        }
    };
    /** v2 库 git 版本化快照（写后触发；失败静默——版本化是增强不是主流程依赖） */
    const bankSnapshot = async (label) => {
        if (config.bankGit === false)
            return;
        try {
            if (!existsSync(bankGitScript))
                return;
            await runNode(config.nodeBin, bankGitScript, ['--message', `memory: ${label} @ ${new Date().toISOString().slice(0, 19)}`], { env: { MEMORY_ROOT: memoryLibRoot() }, timeout: 20000 });
        }
        catch { /* 静默 */ }
    };
    const distillAgent = async (agent) => {
        const sid = agent.id;
        if (distilling.has(sid))
            return; // 并发守卫（本 fiber 内）：蒸馏在途（最长 10min）内再触发直接跳过
        if (agent.status && agent.status !== 'idle') {
            log(`distill: ${sidShort(sid)} 已恢复活跃（status=${agent.status}），跳过`);
            return;
        }
        // 子代理守卫（2026-09-10 实态修复）：主会话派子代理执行并等待返回时，主会话 turn/end 已完成、status=idle、
        // 但其子代理仍在 running——此时蒸馏只是把任务"做到一半"的内容切碎入册，且水位推进后不会重蒸。
        // 处理：本轮推迟（不推水位、不消费），重新武装 idle 定时器；子代理完成时父会话会收到 followup 事件再触发。
        if (hasActiveSubagents(sid)) {
            audit({ sid, kind: 'distill-skip', reason: 'active-subagent', fclass: 'busy-subagent' });
            ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'busy-subagent' }, result: { added: 0, rejected: 0, failed: 0 } });
            log(`distill: ${sidShort(sid)} 有活跃子代理在跑（等待返回），推迟蒸馏（水位保留）`);
            armIdleTimer(agent);
            return;
        }
        distilling.add(sid);
        let claimed = false;
        try {
            // A2（2026-09-11 审查修复）：入口先回流 project-defer 卡 —— 它们是「已裁决为项目卡」的降级暂存，
            // 只因 workspace 当初不可解才留在 pending；绝不能再喂 LLM 重裁决（会按本轮会话 route 一刀切 →
            // 落错工作区；随后还可能被候选 .processed 吞掉）。flush 内部按卡内「源会话」反解 workspace。
            try {
                await flushDeferCards();
            }
            catch { /* 回流失败不阻断本轮蒸馏 */ }
            validateProvider();
            // v19（2026-09-10）：水位不再是裸数字——经「格式代 + 锚点事件指纹」双证校验，迁移/序号重排即作废全量重蒸。
            // 快照只取一次（同一数组喂水位增量计算 + 分段器），避免全量 snapshotEvents 被重复物化。
            const wmEvents = agent.session.snapshotEvents();
            const baseline = resolveWatermark(sid, agent);
            // ⚠ `lastSeq = 0`（整窗）在此处承载**两种成因完全不同的情况**，勿再误读成单一缺陷：
            //   (a) 真·无基线：`resolveWatermark` 返回 null 是因为**水位缺失**（`!wm`）或**水位本身 <= 0**
            //       —— 没有可用边界，全量是**唯一选择**；
            //   (b) 语义 B 主动全量：水位存在且双证失效，但 live 边界 `maxSeq < prevSeq`（序号空间已重排/缩小，
            //       如 prevSeq=101539 / maxSeq=511）——旧 seq 已不可寻址，**全量是故意的、是正确行为，不要"修"**。
            //       对应 `planDegradedBaseline` 返回 `degrade:false` 的分支（G-20）。
            //   反之，双证失效但边界未回退（`maxSeq >= prevSeq`）时 `resolveWatermark` 返回的是**降级基线**
            //   （`{ lastSeq: maxSeq, degraded: true }`），走的是语义 A——此处 lastSeq 不为 0，不整窗。
            const lastSeq = baseline ? baseline.lastSeq : 0;
            // G-20 熔断：连续 N 轮拿不到会话快照 ⇒ 本轮跳过（不再整窗重蒸烧 LLM）。
            // 依据：水位注释预言「写 0 → 下次读仍判不可验证 → 每轮全量重蒸，形成死循环」；
            //       实测 09-11 仅失效 2 轮即自愈，**没触发是运气（下轮快照就恢复），不是设计保证**——故必须有这道闸。
            const streak = snapshotUnavailableStreak.get(sid) ?? 0;
            if (streak >= DISCARD_SNAPSHOT_CB_N) {
                audit({ sid, kind: 'distill-skip', reason: 'snapshot-unavailable-circuit-break', fclass: 'snapshot-unavailable', streak, threshold: DISCARD_SNAPSHOT_CB_N });
                ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'snapshot-unavailable-circuit-break' }, result: { added: 0, rejected: 0, failed: 0 } });
                log(`distill: ${sidShort(sid)} 快照连续 ${streak} 轮不可用（阈值 ${DISCARD_SNAPSHOT_CB_N}）→ 本轮跳过（熔断，防整窗重蒸死循环）`);
                return;
            }
            // v18 分段蒸馏（2026-09-10）：整窗按 CHUNK_CHARS/事件边界切段后逐段蒸馏——每段成功即推水位到该段 endSeq
            // （断点续传），段间紧凑清单 manifest 续上下文防同轮重复入册；修复旧「整窗一次注入 24k 截断丢尾 / 失败整窗重蒸」。
            const { chunks, maxSeq } = buildEventChunks(agent, lastSeq, CHUNK_CHARS, wmEvents);
            // A3：统一 claim（idle 与扫尾同一判定）——在途即让位（本 fiber 结束/早退时释放）。
            if (!tryClaim(sid, lastSeq, maxSeq)) {
                audit({ sid, kind: 'distill-skip', reason: 'claim-held', fclass: 'claim-held' });
                ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'claim-held' }, result: { added: 0, rejected: 0, failed: 0 } });
                log(`distill: ${sidShort(sid)} claim 在途（其他实例接管中），本轮让位`);
                return;
            }
            claimed = true;
            const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
            let candFiles = [];
            // A2：候选池排除 project-defer 卡（它们归 flushDeferCards 直写，不进 LLM 重裁决）
            try {
                candFiles = readdirSync(pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f) && !f.includes('-project-defer-')).sort();
            }
            catch {
                candFiles = [];
            }
            // 门槛（below-min 语义保持现状）：整窗文本总字符 < minTurnChars（chunks 空=无增量/全无文本事件）→ 跳过并推进水位
            if (!chunks.length || totalChars < (config.minTurnChars ?? 200)) {
                // G-4a：有未消化段时**不得**把水位推到 maxSeq（否则该段永不重扫），改为扣住不推（最多 SKIP_HOLD_MAX 轮）
                const skipPlan = planSkipWatermark(hasPendingUndigested(sid), skipHoldStreak.get(sid) || 0, maxSeq);
                skipHoldStreak.set(sid, skipPlan.holdRounds);
                if (skipPlan.write)
                    writeWatermark(sid, skipPlan.seq, agent);
                // 跳过也留审计痕（观测盲区修复 2026-09-09：此前门槛/预筛跳过只进日志，审计里只见真实 run，
                // 「蒸馏为什么没跑」无法从数据区分——是没触发还是被挡）
                audit({ sid, kind: 'distill-skip', reason: 'below-min-chars', fclass: 'below-min', chars: totalChars, skipPlan: skipPlan.reason, heldForUndigested: !skipPlan.write, starved: skipPlan.holdRounds, watermarkTo: skipPlan.write ? skipPlan.seq : lastSeq });
                ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'below-min-chars', chars: totalChars, heldForUndigested: !skipPlan.write }, result: { added: 0, rejected: 0, failed: 0 } });
                log(`distill: ${sidShort(sid)} 增量 ${totalChars} 字符 < 门槛${skipPlan.write ? `，水位推进 ${lastSeq}→${skipPlan.seq}（${skipPlan.reason}）` : `，因存在未消化段**扣住水位** ${lastSeq}（第 ${skipPlan.holdRounds}/${SKIP_HOLD_MAX} 轮，${skipPlan.reason}）`}`);
                return;
            }
            if (config.distillPrescan !== false) {
                // 2026-09-10 用户拍板：大段增量强制蒸馏——信息密集但无信号词的会话（如研究/工具流）不再被预筛整段丢弃
                // v18 分段口径：信号词判定按首段文本（首段=窗口最早 ≤CHUNK_CHARS 前缀，窗口小于预算时即整窗）；
                // 大段强制阈值按整窗总字符（保留现状语义：增量 ≥prescanMin 强制蒸馏，与切段与否无关）
                const prescanMin = Number(config.prescanMinChars) > 0 ? Number(config.prescanMinChars) : 4000;
                const bigDelta = totalChars >= prescanMin;
                const hasSig = bigDelta || hasDistillSignals(chunks[0].text);
                if (!hasSig && candFiles.length === 0) {
                    // G-4a：同上——有未消化段时不得推到 maxSeq
                    const skipPlan = planSkipWatermark(hasPendingUndigested(sid), skipHoldStreak.get(sid) || 0, maxSeq);
                    skipHoldStreak.set(sid, skipPlan.holdRounds);
                    if (skipPlan.write)
                        writeWatermark(sid, skipPlan.seq, agent);
                    audit({ sid, kind: 'distill-skip', reason: 'prescan-no-signal', fclass: 'prescan-no-signal', chars: totalChars, skipPlan: skipPlan.reason, heldForUndigested: !skipPlan.write, starved: skipPlan.holdRounds, watermarkTo: skipPlan.write ? skipPlan.seq : lastSeq });
                    ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'prescan-no-signal', chars: totalChars, heldForUndigested: !skipPlan.write }, result: { added: 0, rejected: 0, failed: 0 } });
                    log(`distill: ${sidShort(sid)} 预筛跳过（增量 ${totalChars} 字符无信号词 & pending 无候选）${skipPlan.write ? `，水位推进 ${lastSeq}→${skipPlan.seq}（${skipPlan.reason}）` : `，因存在未消化段**扣住水位** ${lastSeq}（第 ${skipPlan.holdRounds}/${SKIP_HOLD_MAX} 轮，${skipPlan.reason}）`}`);
                    return;
                }
                log(`distill: ${sidShort(sid)} 预筛通过（信号词=${hasSig}${bigDelta ? `，大段 ${totalChars}≥${prescanMin} 强制蒸馏` : ''}，pending 候选=${candFiles.length}），进入分段蒸馏`);
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
                const candBlock = `### 源 ${f}\n${body}`;
                if (candBlock.length > candBudget)
                    return ''; // 本文件装不下：不进本轮，保留 pending
                candBudget -= candBlock.length + 1; // +1 join('\n') 分隔符
                candIncluded.push(f);
                return candBlock;
            }).join('\n');
            // ═══ v18 分段主循环（2026-09-10）：每段一次性 spawn（与现状同参数），段间连续性由 manifest 紧凑清单承接；
            // 「可复用子代理 + 全上下文」列为后续可选档（规格已定，本轮不实现）。
            // 每段成功（stop=completed && out）→ 既有 route 判定 + writeDispatch + episode 留痕 + 立即 writeWatermark(该段 endSeq)；
            // 段失败 → 记录 log/审计并 break：水位停在失败段前（已成功段已推进）→ 下一触发从失败段断点续传，前段不重蒸。
            const resolvedLlm = resolveLlm(config.distillProvider, config.distillModel);
            const useProvider = !!resolvedLlm && llmState.providerFailCount < 2;
            const agentOptions = useProvider ? { provider: resolvedLlm.provider, model: resolvedLlm.model } : undefined;
            const segLimit = Math.min(chunks.length, MAX_CHUNKS_PER_RUN);
            const MANIFEST_CAP = 1500; // 同轮前段固化清单字符上限（超出丢最早行；只服务同轮后段查重/合并）
            let manifest = '';
            let wmNow = lastSeq;
            let anyAdded = false;
            for (let k = 0; k < segLimit; k++) {
                const chunk = chunks[k];
                let segOk = false;
                let ac = null;
                let abortTimer = null;
                let raceTimer = null;
                try {
                    // v6 向量政策：给裁决 agent 喂「相关既有记忆」上下文（recallRanked 融合召回，query=本段 text 前 512）——
                    // Q0 已有归属 / Q3 能合并 判定从此有库内证据；未启用/失败自动省略
                    let relMemLines = '';
                    try {
                        const rres = await recallRanked(memoryLibRoot(), chunk.text.slice(0, 512), 5, 'all', embedCfgOf());
                        if (rres.rows.length)
                            relMemLines = rres.rows.map((r) => `- ${r.line}`).join('\n');
                    }
                    catch { /* 相关记忆上下文失败=省略 */ }
                    const userInput = [
                        `## 待蒸馏会话\nsessionId=${sid}（分段蒸馏，本段 seq ${chunk.startSeq}→${chunk.endSeq}，共 ${chunks.length} 段第 ${k + 1} 段）`,
                        `## 会话增量正文（本段）\n${chunk.text}`,
                        manifest ? `## 同轮前段固化清单（防重复入册/可引用合并，勿重复入册）\n${manifest}` : '（同轮前段固化清单：无——本段为当前触发首段；后续段将携带本段裁决清单防重复入册）',
                        relMemLines ? `## 相关既有记忆（recallRanked 召回，Q0 已有归属 / Q3 合并判据；命中即视为已覆盖候选）\n${relMemLines}` : '（相关既有记忆：未启用向量或零命中，按无历史裁决）',
                        candIncluded.length ? `## 待固化候选（pending/ 中 ${candIncluded.length}/${candFiles.length} 个，预算 ${CAND_BUDGET} 字符内）\n${candText}` : (candFiles.length ? '（待固化候选超预算，本轮不携带；候选保留 pending 待下轮）' : '（无待固化候选）'),
                        '请按规则处理：裁决本段可复用知识点并输出入册指令 JSON。',
                    ].join('\n\n');
                    ac = new AbortController();
                    abortTimer = setTimeout(() => { try {
                        ac?.abort(new Error('distill timeout 10min'));
                    }
                    catch { /* */ } }, 600000);
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
                        new Promise((resolve) => { raceTimer = setTimeout(() => resolve({ stopReason: 'timeout' }), 600000); }),
                    ]);
                    if (abortTimer) {
                        clearTimeout(abortTimer);
                        abortTimer = null;
                    }
                    if (raceTimer) {
                        clearTimeout(raceTimer);
                        raceTimer = null;
                    }
                    const stop = result && result.stopReason;
                    const out = parseAgentJson(result, `distill ${sidShort(sid)}`); // 子代理输出 → JSON（剥离代码栅栏+容错提取，与深睡共用同一实现）
                    if (stop === 'completed' && out)
                        llmState.providerFailCount = 0;
                    else if (useProvider && (stop !== 'completed' || !out))
                        llmState.providerFailCount++;
                    const rawRoute = (out && typeof out.route === 'string') ? out.route.trim().toLowerCase() : '';
                    const route = ['memory', 'project', 'discard'].includes(rawRoute) ? rawRoute : 'memory'; // 归一化+未知回退 memory（宁滥勿丢）
                    const workspace = await resolveWorkspace(sid);
                    const disp = route === 'discard'
                        ? { added: 0, rejected: 0, failed: 0, targetLib: 'none' }
                        : await writeDispatch(sid, out, route, workspace);
                    log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit}（seq ${chunk.startSeq}→${chunk.endSeq}）stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`);
                    // WikiSkill 借鉴：失败归类 fclass（供审计聚合/深睡根因回流）+ LLM 指纹（大小模型蒸馏质量实证的数据底座）
                    const llmLabel = useProvider && resolvedLlm ? `${resolvedLlm.provider}/${resolvedLlm.model}` : 'inherited';
                    const fclass = !out ? 'json-parse'
                        : stop !== 'completed' ? (useProvider ? 'provider-fail' : 'agent-stop')
                            : route === 'discard' ? 'discard'
                                : disp.failed > 0 ? 'dispatch-failed'
                                    : disp.rejected > 0 ? 'gate-reject'
                                        : 'ok';
                    // v18：审计行与 raw-stub 均带分段标记（chunk/chunkStart/chunkEnd/totalChunks）；stub watermark=该段推进区间（同步用该段 endSeq）
                    audit({ sid, kind: 'distill-run', route, stop, fclass, llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length });
                    // 判据台账（摄取域）：模型判据（可选 judgement）+ 宿主 L0 代理评估 + 决策与结果
                    ledger({
                        domain: 'ingest', sid: sid.slice(0, 8), chunk: k + 1,
                        judgement: (out && out.judgement) || null,
                        l0After: evaluateL0({ text: String(chunk.text || '').slice(0, 400), traces: 1 }),
                        decision: { route, fclass, handledByHost: true },
                        result: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib },
                        enqueued: { appends: (out?.appends || []).length, newIndex: (out?.newIndex || []).length, profiles: (out?.profiles || []).length, projectCards: (out?.projectCards || []).length, skipped: (out?.skipped || []).length },
                    });
                    if (disp.added > 0 || (out?.newIndex || []).length > 0)
                        void bankSnapshot('distill'); // v2：写后库快照（best-effort，不阻塞）
                    // v2.1 M2：摄取侧**写入回执**（write.ingest）
                    ledger({
                        type: 'write.ingest', domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), chunk: k + 1,
                        channel: 'appends+newIndex', carrier: 'gated:index', target: disp.targetLib || 'memory',
                        verdict: disp.added > 0 ? 'written' : (disp.rejected > 0 ? 'rejected' : 'skipped'),
                        attempted: (out?.appends || []).length + (out?.newIndex || []).length, written: disp.added, rejected: disp.rejected, failed: disp.failed,
                    });
                    recordStub({ sid, watermark: [wmNow, chunk.endSeq], chars: chunk.text.length, route, stop, fclass, llm: llmLabel, disp: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib }, outShape: out ? { appends: (out.appends || []).length, newIndex: (out.newIndex || []).length, profiles: (out.profiles || []).length, projectCards: (out.projectCards || []).length, skipped: (out.skipped || []).length } : null, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length });
                    if (stop === 'completed' && out && disp.failed === 0) {
                        if (disp.added > 0)
                            anyAdded = true;
                        // 路线②：蒸馏裁决完成（stop=completed && out，无论入册多少）即留轻 episode——episode=「任务发生+结果」的
                        // 同类判定/转正数据源（memory-core-model §3.1）；入册或裁决非 discard 时再建/更新低置信任务候选
                        const intent = intentOf(chunk.text);
                        recordEpisode({ sid, intent: intent.slice(0, 120), route, fclass, llm: llmLabel, outcome: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, lib: disp.targetLib });
                        if (route !== 'discard')
                            await ensureFlowCandidate(sid, intent);
                        // v18 核心：段成功立即推水位到该段 endSeq（断点续传——失败/截断不再丢尾；整窗处理完自然到达 maxSeq）
                        writeWatermark(sid, chunk.endSeq, agent);
                        // G-4a：本段已消化 ⇒ 清掉它的失败记账与「扣住」计数（否则 hasPendingUndigested 永久为真 ⇒ 跳过分支被无谓扣住）
                        dispatchFailStreak.delete(`${sid}#${chunk.endSeq}`);
                        skipHoldStreak.delete(sid);
                        log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} completed，水位推进 ${wmNow}→${chunk.endSeq}${chunk.endSeq < maxSeq ? `（整窗尚余 ${chunks.length - k - 1} 段，下轮续传）` : '（整窗蒸馏完成，水位=maxSeq）'}`);
                        wmNow = chunk.endSeq;
                        // 段间紧凑清单续上下文：本段裁决一行（供同轮后段查重/合并，勿重复入册；超 MANIFEST_CAP 丢最早行）
                        manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP);
                        segOk = true;
                    }
                    else if (stop === 'completed' && out && disp.failed > 0) {
                        // A1（2026-09-11 审查修复）：stop/JSON 都 OK 但**条目级落盘失败** → 本段不算消化，水位不前移。
                        // 防死循环：同一段连续失败满 MAX_DISPATCH_RETRY 次 → 强制推进并落审计（丢失显式记账）。
                        const streakKey = `${sid}#${chunk.endSeq}`;
                        const tries = (dispatchFailStreak.get(streakKey) || 0) + 1;
                        if (tries >= MAX_DISPATCH_RETRY) {
                            dispatchFailStreak.delete(streakKey);
                            skipHoldStreak.delete(sid); // 本段已放弃 ⇒ 不再因它扣住跳过分支
                            writeWatermark(sid, chunk.endSeq, agent);
                            wmNow = chunk.endSeq;
                            manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP);
                            segOk = true;
                            audit({ sid, kind: 'distill-run', route, stop, fclass: 'dispatch-failed-forced', llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length, tries });
                            log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条、已连续 ${tries} 轮——强制推进水位 → ${chunk.endSeq}（丢失已审计 dispatch-failed-forced）`);
                        }
                        else {
                            dispatchFailStreak.set(streakKey, tries);
                            log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条（第 ${tries}/${MAX_DISPATCH_RETRY} 次）——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`);
                        }
                    }
                    else {
                        // 水位保留：stop≠completed（error/timeout/aborted）或 stop=completed 但 out=null（JSON 解析失败，
                        // 2026-09-09 实锤「Unexpected end of JSON input」）都不算消化——本段不推进，下轮从本段续传
                        log(`distill: ${sidShort(sid)} 段${k + 1}/${segLimit} stop=${stop} out=${out ? 'ok' : 'null'}，本段失败——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`);
                    }
                }
                catch (e) {
                    if (abortTimer) {
                        clearTimeout(abortTimer);
                        abortTimer = null;
                    }
                    if (raceTimer) {
                        clearTimeout(raceTimer);
                        raceTimer = null;
                    }
                    const msg = String(e?.message || e);
                    if (msg.includes('inactive context')) {
                        // 旧 fiber 遗留定时器在 ctx 失效后触发（重载场景）：静默跳过、水位保留，由新实例积压扫尾补蒸馏（2026-09-10 修复）
                        log(`distill: ${sidShort(sid)} 段${k + 1} 旧 ctx 已失效（inactive context），跳过本轮（水位保留 ${wmNow}，待扫尾）`);
                    }
                    else {
                        if (useProvider)
                            llmState.providerFailCount++;
                        log(`distill ERROR ${sidShort(sid)} 段${k + 1}: ${msg.slice(0, 200)}`);
                    }
                }
                if (!segOk)
                    break; // v18：段失败即停——已成功段已推水位，本段未推 → 下轮从本段断点续传（前段不重蒸）
            }
            // pending 候选 .processed 移动（现语义：有段 added>0 且本轮携带候选）——循环后统一一次，
            // 避免多段重复移同名（rename 幂等已有，统一处理更干净）
            if (anyAdded && candIncluded.length) {
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
        }
        catch (e) {
            log(`distill agent err ${sidShort(sid)}: ${String(e?.message || e).slice(0, 120)}`);
        }
        finally {
            distilling.delete(sid);
            if (claimed)
                releaseClaim(sid);
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
    let lastParent = null;
    let daemonParent = null;
    const isValidParent = (p) => !!p && typeof p === 'object' && !!p.options && !!p.ctx;
    const rememberAgent = (a) => { try {
        if (isValidParent(a))
            lastParent = a;
    }
    catch { /* */ } };
    // 子代理感知（2026-09-10 实态修复：主会话"派子代理执行、等返回"期间被误判空闲/停滞）：
    // DSH 子代理会话 header.origin='subagent' 且 header.parentSession=父会话 id；子代理在跑 = 父会话仍在干活。
    const isSubagentAgent = (a) => { try {
        return a?.session?.header?.origin === 'subagent';
    }
    catch {
        return false;
    } };
    // 父会话 id 解析（2026-09-10 三修）：E2E 实证记录对象上 header.parentSession 可能取不到（当时三会话同判 busy=走了全局兜底）
    // → 多字段探测（live session header / record header / options / 直挂字段），全失败才回落全局兜底。
    const parentSidOf = (a) => {
        try {
            const cands = [
                a?.session?.header?.parentSession, a?.session?.header?.parent, a?.session?.parentSession,
                a?.session?.record?.header?.parentSession, a?.session?.record?.parentSession,
                a?.options?.parentSession, a?.options?.parentId, a?.parentSession, a?.parentId, a?.parent?.id,
            ];
            for (const c of cands)
                if (typeof c === 'string' && c)
                    return c;
            return null;
        }
        catch {
            return null;
        }
    };
    // 子代理活动双通道（2026-09-10 二修，E2E 实证 ctx.agents.list() 记录未必带 live status）：
    // ① 事件通道：收到任意子代理事件即记「该父会话有子代在跑」（3 分钟新鲜度，防僵尸残留）；
    // ② 枚举通道：list() 扫 subagent 记录并用 ctx.agents.get(id) 取 live agent 判 status==='running'。
    const childSeen = new Map(); // parentSid -> childSid -> lastSeen
    let globalChildSeen = 0; // 父归属解析失败时的全局兜底（宁少蒸勿切碎）
    let globalChildLoggedAt = 0; // 兜底生效日志节流（60s 一次，防每轮刷屏）
    const CHILD_ACTIVE_MS = 180000;
    const noteChildActivity = (parentSid, childSid) => {
        const now = Date.now();
        if (!parentSid) {
            globalChildSeen = now;
            return;
        }
        let m = childSeen.get(parentSid);
        if (!m) {
            m = new Map();
            childSeen.set(parentSid, m);
        }
        m.set(childSid, now);
    };
    const dropChild = (childSid) => {
        for (const [p, m] of childSeen) {
            if (m.delete(childSid) && !m.size)
                childSeen.delete(p);
        }
    };
    /** 该会话是否有运行中的子代理后代（事件通道 + live status 枚举通道） */
    const hasActiveSubagents = (sid) => {
        const now = Date.now();
        try {
            const m = childSeen.get(sid);
            if (m) {
                for (const [child, seen] of m) {
                    const live = ctx.agents.get(child);
                    if (live && live.status === 'running')
                        return true;
                    if (now - seen < CHILD_ACTIVE_MS)
                        return true;
                    m.delete(child);
                }
                if (!m.size)
                    childSeen.delete(sid);
            }
            if (globalChildSeen && now - globalChildSeen < CHILD_ACTIVE_MS) {
                // 2026-09-11 审查：父归属解析失败的子代理事件会**全局**冻结蒸馏/深睡（保守取舍：宁少蒸勿切碎）——
                // 加节流日志，避免「为什么没蒸」无从判断。
                if (now - globalChildLoggedAt > 60000) {
                    globalChildLoggedAt = now;
                    log(`子代理活动兜底生效：父归属未解，全局冻结蒸馏/深睡中（剩余 ${Math.ceil((CHILD_ACTIVE_MS - (now - globalChildSeen)) / 1000)}s）`);
                }
                return true;
            }
        }
        catch { /* 事件通道异常→继续走枚举通道 */ }
        try {
            for (const a of ctx.agents.list() || []) {
                if (!isSubagentAgent(a))
                    continue;
                const live = ctx.agents.get(a.id);
                if (!(live && live.status === 'running'))
                    continue;
                let p = parentSidOf(a) || parentSidOf(live);
                let depth = 0;
                if (!p)
                    return true; // 归属解析失败：宁少蒸勿切碎（保守）
                while (p && depth++ < 4) {
                    if (p === sid)
                        return true;
                    const pa = ctx.agents.get(p);
                    p = pa ? parentSidOf(pa) : null;
                }
            }
        }
        catch { /* 查询失败=按无活跃子代理（保守不阻断） */ }
        return false;
    };
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
    // ── 深睡状态机装配（2026-09-12 P1 二期：1499 行已迁至 ./deepsleep.ts）──────────
    // 依赖倒置：把蒸馏侧回调（distillAgent / writeDispatch）与共享设施**注入**，
    //   deepsleep.ts 因此**零 import distill** —— 依赖方向保持严格单向、零环不破。
    //   （若让 deepsleep 直接 import distill，就会因为「深睡回调蒸馏」形成循环依赖。）
    // ⚠ 2026-09-12 阶段 B：依赖**按领域分组**注入（io/cfg/llm/session/write/housekeep，每组 ≤8 字段），
    //   取代原先 32 字段一把梭的扁平 ctx —— 深睡侧每个实现函数只从自己那组取 3–7 个。
    const ds = createDeepSleep({
        io: { log, audit, ledger, kRoot, auditFile, pendDir, candidateDir, probeScriptPath },
        cfg: { config, PROFILE_HEADER, capEnv, llmState },
        llm: { runNode, textOf, resolveLlm, resolveDefaultModel, validateProvider },
        session: { pickParent, ensureDaemonParent, locateTranscript, hasActiveSubagents },
        write: { distillAgent, writeDispatch, writeProfileLine, parseAgentJson, normalizeProfileTarget },
        housekeep: {
            runSelfCheck, bankSnapshot,
            // 惰性包裹：embedCfgOf 定义在本调用之后（TDZ），箭头函数延迟求值即可，无需搬动其定义位置。
            embedCfgOf: () => embedCfgOf(),
        },
        appCtx: ctx,
    });
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
            if (origin === 'subagent') { // 子代理 turn/end = 父会话仍在干活（2026-09-10）：记子代活动+刷新父会话，不武装蒸馏
                const p = parentSidOf(agent);
                noteChildActivity(p, sid);
                if (p)
                    ds.noteEvent(p, false);
                return;
            }
            ds.noteEvent(sid, true); // 状态机：turn 完成 → ENDED（停滞计时起点）
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
            dropChild(agent.id);
        }
        catch { /* */ } // 子代理出表：清其活动标记（防僵尸阻止蒸馏）
        try {
            ds.sessions.delete(agent.id);
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
            dropChild(session && session.id);
        }
        catch { /* */ }
        try {
            ds.sessions.delete(session && session.id);
        }
        catch { /* */ }
    });
    // ═══ 路线④ 打扰度观察（shadow-first MVP）：打分/滞回/冷却/落影子日志，默认不做上下文注入 ═══
    // 设计（v5.2 §5 + §9④）：先攒 activation-shadow.jsonl 真实样本校准阈值（T_on/T_off 初值 0.62/0.52），
    // 校准满意后再由用户开 activationPrefetch 走 active（注入接线=后续档，非本 MVP）。
    const actShadowFile = join(kRoot, 'audit', 'activation-shadow.jsonl');
    const actState = new Map();
    const actConf = {
        on: Number(config.activationTOn) || 0.65,
        off: Number(config.activationTOff) || 0.6,
        cooldown: Math.max(0, Number(config.activationCooldownSteps) || 3),
        topK: Math.min(5, Math.max(1, Number(config.activationTopK) || 3)),
    };
    // v6 向量政策：embed cfg 单一构造（取自 DistillConfig 可选字段，与 scheduler vec 通道同源；未配置=词法降级）
    const embedCfgOf = () => ({
        enabled: !!(config.embedEnabled && config.embedBaseUrl && config.embedModel),
        baseUrl: String(config.embedBaseUrl || ''),
        model: String(config.embedModel || ''),
        apiKeyEnv: String(config.embedApiKeyEnv || ''),
        // v7 召回降权系数（UI 可调：recallColdFactorPercent，% → /100；缺省 35% → 0.35）
        coldFactor: (Number(config.recallColdFactorPercent) > 0 ? Number(config.recallColdFactorPercent) : 35) / 100,
        // v2（ADR-122）：融合策略（缺省 RRF；scheduler 配置 recallFusion=weighted 可回滚）
        fusionKind: config.recallFusion === 'weighted' ? 'weighted' : 'rrf',
        // v2.2（ADR-130）：分层打分与影子打分（缺省 legacy + 影子开）
        scoreMode: config.scoreWeights === 'v2' ? 'v2' : 'legacy',
        shadowScore: config.shadowScore !== false,
    });
    // 路线④ 打扰度观察（v6 向量政策 2026-09-10：打分改 recallRanked 融合召回——dense 主、lexical 稳；
    // sim 口径随 mode：fusion 的 score=0..100（已 min-max 归一）→ /100；lexical=命中数/tokens。阈值随影子样本再校准）
    const activationStep = async (sid, event) => {
        try {
            if (!event)
                return;
            const d = event.data || {};
            // ACT-024（2026-09-11 结构性去污染，实测污染率 49.3%）：DSH 把**宿主注入块也作为 `user/message` 事件**下发
            // （系统提示快照 / 后台 job 与子代理回执 / 指令文件 / skill 目录），旧实现只按内容正则判 → 大量非用户文本
            // 进入影子样本（"Current runtime context…"、"Background subagent … finished"、"Agent <uuid> sent a message"）。
            // 判别改用**结构字段 `data.source.kind`**（真值域：user / plugin / agent-instructions / skill-catalog /
            // agent-message / subagent-settled …）：带源且非 `user` 一律丢弃；无 source 的旧格式/夹具事件走内容闸兜底。
            const srcKind = String((d.source && d.source.kind) || '');
            const arr = Array.isArray(d.content) ? d.content : [];
            let text = '';
            for (const c of arr)
                if (c && c.type === 'text' && typeof c.text === 'string')
                    text += c.text;
            if (event.type !== 'user/message' || !text.trim())
                return;
            if (srcKind) {
                if (srcKind !== 'user')
                    return;
            }
            else if (isNoiseIntent(text.trim()))
                return;
            const rres = await recallRanked(memoryLibRoot(), text, actConf.topK, 'all', embedCfgOf());
            const { rows, tokens } = rres;
            if (!tokens.length && !rows.length)
                return;
            // 相对分（旧口径）：融合召回**池内 min-max 归一化**后的分数
            const relSim = !rows.length ? 0
                : rres.mode === 'fusion' ? Math.min(1, (rows[0].score || 0) / 100)
                    : Math.min(1, rows[0].score / (tokens.length || 1));
            // ACT-024（2026-09-11 重校准）：阈值量改为**绝对余弦**（用户文本 ↔ 命中索引行）。
            // 判因（实测 200 条干净样本）：相对分是池内归一化量，p50=0.770、p90=1.000 —— 现状阈值 0.62 会命中
            // 88.5% 的真实用户消息，**结构上不可标定**；绝对余弦则可分辨（真命中 0.62–0.73，噪声 0.38–0.45）。
            // embed 不可用/失败 → 退化回相对分（与旧行为一致，不误报）。
            const ecfg = embedCfgOf();
            let sim = relSim;
            let metric = 'rel-fallback';
            if (rows.length && ecfg.enabled) {
                try {
                    const c = await semanticSim(text, rows[0].line, ecfg);
                    if (c !== null) {
                        sim = Math.max(0, Math.min(1, c));
                        metric = 'abs-cos';
                    }
                }
                catch { /* 失败保持回退 */ }
            }
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
                    at: new Date().toISOString(), kind: 'activation-step', sid: sidShort(sid), rmode: rres.mode, mode: config.activationPrefetch ? 'prefetch-armed' : 'shadow',
                    src: srcKind || 'unknown', // ACT-024：采样源（应为 user；旧格式行无此字段）——供校准与污染复盘
                    metric, rel: Number(relSim.toFixed(3)), // ACT-024：判据量（abs-cos 为现行）；rel 留档旧口径便于对照
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
    // 候选：**当前 ctx 根内（live）**的会话、水位<内存末事件 seq、且已出「10min 宽限期」（避免与 idle 定时器抢跑/打断用户续聊）。
    // ⚠ 覆盖边界（2026-09-11 审查修正注释）：root 之外/重启前已结束且**未被重新载入**的会话不在本链覆盖内——
    //   旧注释「重启前已结束的一律补」与现码不符；真要补需会话重新载入，或另立持久会话清单（本档未实现）。
    const sweepBacklog = async () => {
        try {
            // 先回流 pending defer 卡（workspace 恢复后直写 devref；周期扫尾也覆盖）
            try {
                await flushDeferCards();
            }
            catch { /* 回流失败不阻断扫尾 */ }
            const roots = (ctx.agents && typeof ctx.agents.roots === 'function') ? ctx.agents.roots() : [];
            for (const a of roots) {
                try {
                    if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function')
                        continue;
                    const origin = a.session && a.session.header && a.session.header.origin;
                    if (origin === 'subagent')
                        continue;
                    const sid = a.id;
                    if (hasActiveSubagents(sid))
                        continue; // 子代理在跑：任务未完，扫尾勿抢蒸（2026-09-10）
                    if (distilling.has(sid))
                        continue;
                    const rec = ds.sessions.get(sid);
                    if (rec) {
                        if (rec.state === 'running' || rec.state === 'probing' || rec.state === 'suspect')
                            continue;
                        if (rec.lastEndAt && Date.now() - rec.lastEndAt < config.idleWakeMs)
                            continue; // 仍在宽限期，等 idle 定时器
                    }
                    // v19：水位走同一双证校验（resolveWatermark）——失效时由 discardWatermark 从当前边界续写并落审计，
                    // 扫尾与 idle 通路口径一致（单一实现，勿在此另写判定）；快照取一次供增量比对与后续蒸馏复用。
                    const base = resolveWatermark(sid, a);
                    // 同蒸馏主路径：`lastSeq = 0` 有两种成因——(a) 真·无水位 ⇒ 全量是唯一选择；
                    // (b) 语义 B 主动全量（live 边界 maxSeq < prevSeq，序号空间已重排）⇒ **故意全量，不要"修"**。
                    const lastSeq = base ? base.lastSeq : 0;
                    const sweepEvents = a.session.snapshotEvents();
                    let maxSeq = lastSeq;
                    for (const e of sweepEvents) {
                        const s = e.seq ?? 0;
                        if (s > lastSeq && s > maxSeq)
                            maxSeq = s;
                    }
                    if (maxSeq > lastSeq) {
                        // 跨实例 claim 锁（2026-09-10 实锤：重叠 fiber 的 30s 首扫会同时抢同一积压窗口 → 471aca03 被双蒸馏双写）：
                        // 在途 claim（25min 内）→ 跳过；过期 claim → 覆盖重试；无增量时顺手清理陈旧 claim。
                        // A3：claim 判定已统一到 distillAgent 入口（幂等写入 / 结束释放）——扫尾只做**只读**让位判定，
                        //     不再自己写 claim（否则与入口刚写入的 claim 互斥，补蒸馏将永不发生）。
                        if (claimHeld(sid)) {
                            continue;
                        } // 在途，其他 fiber 已接管
                        log(`sweep: ${sidShort(sid)} 水位 ${lastSeq}→${maxSeq} 有未消化增量，补蒸馏`);
                        void distillAgent(a).catch(() => { });
                    }
                    else {
                        try {
                            unlinkSync(join(kRoot, 'audit', 'claims', sid + '.json'));
                        }
                        catch { /* 无 claim 可清 */ }
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
            if (origin === 'subagent') { // 子代理任意事件 = 父会话任务仍在推进（2026-09-10）：记子代活动+刷新父会话活动
                const p = parentSidOf(a);
                noteChildActivity(p, sid);
                if (p)
                    ds.noteEvent(p, false);
                return;
            }
            ds.noteEvent(sid, false);
            rememberAgent(a); // 深睡 parent 兜底缓存（任意根会话事件都刷新）
            if (config.activationShadow !== false || config.activationPrefetch)
                void activationStep(sid, event); // 路线④：影子默认开；prefetch 置位后决策通路照走（影子行 mode 区分），实际注入仍待影子校准（后续档）
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
            ds.deepSleepCheck();
        }
        catch { /* 巡检零抛出 */ } }, ds.DEEP_SLEEP_CHECK_MS);
        return () => clearInterval(iv);
    }, SHORT + ': deep-sleep check');
    // ═══ v2.2 定时自检：独立于深睡（深睡触发严苛：需全部会话停滞 ≥3h）——保证「想不起来也会自动做」═══
    //   启动 3 分钟后先跑一次；此后每 selfCheckIntervalHours（缺省 6h）；selfCheck=false 或周期=0 时关闭。
    //   与深睡后的自检共用同一实现（runSelfCheck），台账 type=check.sleep 区分 trigger。
    ctx.effect(() => {
        const hours = Number(config.selfCheckIntervalHours ?? 6);
        if (config.selfCheck === false || !(hours > 0))
            return;
        const ms = Math.max(30 * 60 * 1000, hours * 3600 * 1000);
        const t0 = setTimeout(() => { void runSelfCheck('timer'); }, 3 * 60 * 1000);
        const iv = setInterval(() => { void runSelfCheck('timer'); }, ms);
        return () => { clearTimeout(t0); clearInterval(iv); };
    }, SHORT + ': sleep selfcheck timer');
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
        const iv = setInterval(run, ds.DEEP_SLEEP_CHECK_MS);
        return () => { clearTimeout(t0); clearInterval(iv); };
    }, SHORT + ': distill sweep');
    // ── 手动蒸馏触发（2026-09-10：pending 回流闭环——参数调节「立即处理 pending」调此）──
    const runDistillNow = async () => {
        try {
            // 先回流 pending defer 卡（workspace 恢复后直写 devref，不等 LLM 重裁决）
            const fl = await flushDeferCards();
            const roots = (ctx.agents && typeof ctx.agents.roots === 'function') ? ctx.agents.roots() : [];
            let n = 0;
            for (const a of roots) {
                try {
                    if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function')
                        continue;
                    const origin = a.session && a.session.header && a.session.header.origin;
                    if (origin === 'subagent')
                        continue;
                    if (distilling.has(a.id))
                        continue;
                    await distillAgent(a).catch(() => { });
                    n++;
                }
                catch { /* 单会话跳过 */ }
            }
            const flNote = fl.written ? `（defer 回流 ${fl.written} 张卡${fl.kept ? `，保留 ${fl.kept}` : ''}）` : (fl.kept ? `（defer 待认领 ${fl.kept}：workspace 仍不可解）` : '');
            return { ok: true, sessions: n, note: `蒸馏 ${n} 个根会话${flNote}` };
        }
        catch (e) {
            return { ok: false, sessions: 0, note: String(e?.message || e).slice(0, 120) };
        }
    };
    return { getDeepSleepStatus: ds.getDeepSleepStatus, runDeepSleepNow: ds.runDeepSleepNow, getConfig: ds.getConfig, runDistillNow };
}
//# sourceMappingURL=distill.js.map