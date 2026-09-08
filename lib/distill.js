/**
 * distill.ts — ADR-0002 阶段 2：蒸馏器（自记忆插件 index.ts 迁入，写入分发重接 targets.ts）。
 *
 * 事件链（ADR-0004 模式）：ctx.on('session/event') turn/end(completed) 且 root agent → per-agent idle 定时器
 *   → 到点且 agent idle → 内存增量（snapshotEvents 水位后）→ 预筛（信号词 + pending 候选；皆无则跳过不唤醒）
 *   → spawn 蒸馏子代理（maxDepth=1，10min 超时 race）→ 结构化 JSON（route=memory|project|discard）
 *   → targets.ts 动态路由 + 各库白名单门禁（不符合不存）→ 零拷贝写入（memory-append / devref-card）
 *   → 水位推进（suite/knowledge/audit/distill-watermark.jsonl）→ 蒸馏审计（distill-audit.jsonl，UI 统计卡数据源）。
 *
 * 深度睡眠归纳（L0 原则层 PRINCIPLES.md；2026-09-08 拍板）：独立巡检定时器（10min）检测「全部会话停滞 ≥3h」→ 触发一次。
 *   判据=**会话活跃状态机**（见 SessRec 注释）：任意事件→RUNNING，turn/end→ENDED；RUNNING 无事件 ≥probeAfterMs
 *   → PROBING（采样 transcript 两次比对 mtime/size）→ 增长=长任务（刷新水位不睡，唯一拦睡条件）/ 不增长+会话在
 *   =STALLED（不阻塞，发审计告警）/ 不增长+会话没了=EXIT / 探针不可用或异常=无法确认。后三者一律按停滞处理→正常睡。
 *   作用域=痕迹窗口（max(本日 0 点, 上次深度睡眠时刻)，按 mtime/时间戳判定，规避 pending 文件名 UTC 口径跨日偏差）：
 *   窗口内 pending + 窗口内写入的 notes + 窗口内 access 命中 → 归纳子代理 → 原则 JSON → write_gate 校验
 *   → PRINCIPLES.md 原子落盘（冲突=原地 replace）。
 *
 * 坑位防御（devref/pitfalls 全清单）：禁 spawnSync（全异步 runAsync）；定时器随 disposed 事件清理；
 * reload 后旧 ctx 失效→错误 catch+水位保留重试；maxDepth=1+persona 委派禁令+toolFilter；
 * 路由归一化未知回退 memory（宁滥勿丢）；LLM 路由连败≥2 弃用指定 provider 回落继承（本迁入版补强）。
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { dshHome, knowledgeRoot, memoryLibRoot, pmgScriptsRoot, memberPresent, memorySkillPresent, resolveTarget, loadWhitelist, gateMemoryAppend, gateProjectCard, BUILTIN_WHITELISTS, } from './targets.js';
// ── 蒸馏裁决契约 v3.1（事实源=记忆仓 engine/distill-contract.md；守藏为执行宿主，契约文本不改动语义）──
// v3（2026-09-06 用户拍板）：判定锚从类别改为粒度——两库区别不是主题，是粒度分工。
// v3.1（2026-09-06 用户拍板）：格式传递——appends.text 教程式三段、newIndex.line 内嵌 spec §8 索引行模板（格式权威=记忆库 spec §8）。
export const DEFAULT_DISTILL_PROMPT = `你是知识整理蒸馏子代理（ADR-0005 v3）。任务：从给定会话增量正文中，判定每条可复用知识的归属（第一层路由），再输出结构化入册指令（由宿主执行写入，你无需也不能直接写文件/跑命令）。
判定锚（v3）：两库不是按主题分类，是按粒度分工——
- 记忆库=泛化元记忆（人脑类比）：只存「下次做类似任务时给 agent 的大概方向」——任务大概步骤轮廓/关键注意点/目标形态，粒度宁粗勿细。
- pmg 项目卡库=细粒度承载，内分两板块：board=generic 收官方性/规范性文档级信息（DSH 开发规范、官方规则、平台规则、工具用法资料）；board=project 收项目事实/开发中用户拍板的决策/项目专属契约踩坑细节。
第一层归属路由（对每条候选按序判定）：
- R1 泛化方向指引？这条知识的作用=下次做类似任务给大概方向？→ route=memory（粗粒度是特性，不要把细节条文塞进记忆库）
- R2 细粒度开发知识？官方规范/平台规则/开发规范条文（→board=generic）或某项目事实/用户决策/契约踩坑细节（→board=project）→ route=project
- R3 其余（一次性进度/可搜索公开知识/无实质/<relevant-memories>注入缓存/重复已有归属）→ route=discard
- 同一条既像 R1 又像 R2：能浓缩成一句方向指引的价值→R1；必须保留细节条文才有用→R2；两边都塞=双写漂移，禁止。
- 超出 R1/R2 范围一律不存；R2 且无承接插件→丢弃不回退记忆库。
- 拿不准 → route=memory 但 appends 留空记 skipped（宁缺毋滥）。
route=memory 时续走四问：Q0 已有归属？Q1 下周用得上？Q2 归谁（MEMORY/USER/AGENT）？Q3 能合并？
委派禁令：**独立完成，绝不 spawn/委派任何子代理**（查重凭给定正文与你自身知识判断）。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"route":"memory","appends":[{"target":"notes/tools.md","section":"<既有 ## 小节名>","text":"教程式浓缩：目标一句+编号步骤+注意，≤120字"}],"newIndex":[{"target":"MEMORY.md","line":"[tag] 主题 · 概况短语/短语/短语 → notes/x.md §小节"}],"projectCards":[{"cardType":"how-to|reference|decision","board":"generic|project","title":"≤20字","text":"≤200字","source":"≤30字"}],"migrationHint":"","skipped":[{"title":"...","reason":"≤30字"}]}
约束：route=memory → 填 appends/newIndex（target 白名单 notes/tools.md notes/flows.md notes/lessons.md notes/env.md notes/release.md；section 必须既有 ## 小节名；**text 教程式三段**「目标：… 1. … 2. … 注意：…」只写方向指引级浓缩——目标形态/步骤轮廓/关键注意点，不搬细节条文，纯事实类可省步骤保留目标行；**newIndex.line 格式权威=记忆库 spec §8**：[tag] 主题 · 概况短语/短语/短语 → notes/<file>.md §小节，定界符 ·=段界 /=短语界 →=指针，主题≤12字名词性禁冒号复合，概况名词短语 / 分隔、≤30字、高判别实词（专名/数值/路径关键词）、禁日期溯源），projectCards 留空；route=project → 填 projectCards（cardType: how-to=操作步骤/reference=契约事实/decision=架构决策；board 必填：generic=官方规范/平台规则，project=项目事实/用户决策，缺省按 project），appends/newIndex 留空，若该项目开发知识密集（连续踩坑/多契约）填 migrationHint（≤30字，提示宿主安排卡库迁移复核）；route=discard → 除 skipped 全空；与 route 不匹配的条目宿主拒收。`;
// ── 深度睡眠归纳契约（L0 原则层 PRINCIPLES.md；睡眠=回想巩固当天的记忆）──
export const DEEP_SLEEP_PROMPT = `你是深度睡眠归纳子代理（守藏记忆 L0 原则层，audit-protocol §5）。任务：像人睡前回想当天经历一样，回顾给定「当天记忆痕迹」，提炼跨任务泛化原则（巩固记忆；主动遗忘=提纯下放，不是删除）。
判定规则：
- 同主题 ≥3 条痕迹，或单主题当日反复命中 → 提炼 1 条原则；支撑不足的一律不提炼。
- 原则=一句方向指引（对齐 R1 粒度锚：目标形态/步骤轮廓/关键注意点），不搬细节条文。
- 源指针只能指向给定痕迹中真实出现过的 notes/<file>.md §小节（1-2 个小节）；行格式严格为：\`- <原则一句> ← 源: notes/<file>.md §小节A/§小节B\`
- **跨工作区红线**：记忆库是全局单库，痕迹可能来自多个工作区，而原则会常驻注入到**所有**工作区会话。含项目专名/具体路径/版本号/一次性事实的经验一律不提炼（skipped 注明「项目专属」）；只在单一项目语境成立的结论同样不提炼——宁缺毋滥，误注入比漏提炼危害大。
- pending 内容尚未入册 notes 的，不得作为源指针（仅作背景理解）；找不到 notes 锚点就不提炼（宁缺毋滥）。
- 与既有原则冲突时用 replace（match=既有原则行原文，须逐字来自给定「现行原则」清单）；否则 add。
- 独立完成：不 spawn 子代理、不使用任何工具，只依据给定材料。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"principles":[{"action":"add","text":"- ... ← 源: notes/lessons.md §A/§B"},{"action":"replace","match":"- 既有原则原文","text":"- ... ← 源: notes/tools.md §C"}],"skipped":[{"title":"...","reason":"≤30字"}]}
无足够素材 → {"principles":[],"skipped":[]}。`;
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
            const mod = await import('file://' + p.replace(/\\/g, '/'));
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
    const log = (msg) => { try {
        mkdirSync(dirname(logFile), { recursive: true });
        appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + msg + '\n');
    }
    catch { /* 静默 */ } };
    const audit = (o) => { try {
        mkdirSync(dirname(auditFile), { recursive: true });
        appendFileSync(auditFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
    }
    catch { /* 静默 */ } };
    const distilling = new Set(); // 并发守卫：同会话蒸馏在途标记（防 turn/end 重武装导致双写/竞态）
    const presence = () => ({
        memory: memorySkillPresent(), // A 方案：探测技能权威根 MEMORY.md（包名探测随合并失效）
        governance: memberPresent(config.memberPackages.governance),
    });
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
        try {
            const file = await locateTranscript(sid);
            if (!file)
                return null;
            const m = file.match(/sessions[\\/]+(--.+?--)[\\/]/);
            if (!m)
                return null;
            const ws = m[1].slice(2, -2).replace(/--/g, '\\').replace(/~0040/g, '@');
            if (!/^[A-Za-z]:/.test(ws))
                return null;
            return ws;
        }
        catch {
            return null;
        }
    };
    // ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
    const memAppend = async (target, kind, payload, section, t) => {
        const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs');
        const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload];
        const env = t.library === 'shoucang-local' ? { MEMORY_ROOT: t.root } : undefined;
        return runNode(config.nodeBin, script, args, { env, timeout: 20000 });
    };
    const writeDispatch = async (sid, out, route, workspace) => {
        let added = 0, rejected = 0, failed = 0;
        if (route === 'memory') {
            const { resolved } = resolveTarget('memory', presence());
            const { wl, source } = loadWhitelist(resolved.root, resolved.library);
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
            if (resolved.library !== 'memory-plugin' && resolved.library !== 'shoucang-local') {
                for (const _a of appends) {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', reason: 'memory 目标库不可用', lib: resolved.library });
                }
                return { added, rejected, failed, targetLib: resolved.library };
            }
            for (const a of appends) {
                if (!a || !a.target || !a.section || !gate(a.target)) {
                    if (a && (!a.target || !a.section))
                        failed++;
                    continue;
                }
                const r = await memAppend(String(a.target), 'append', String(a.text || '').trim(), String(a.section).trim(), resolved);
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
            audit({ sid, kind: 'distill-run', route, lib: resolved.library, wlSource: source, added, rejected, failed });
            return { added, rejected, failed, targetLib: resolved.library };
        }
        if (route === 'project') {
            const { resolved } = resolveTarget('project', presence());
            const cards = (out && Array.isArray(out.projectCards)) ? out.projectCards : [];
            for (const pc of cards) {
                if (!pc || !pc.title || !pc.text) {
                    failed++;
                    continue;
                }
                // 契约 v3：先定板块与写入目标；白名单跟随实际写入目标目录（各库自治：board=generic → pmg 权威仓 docs/devref，board=project → workspace docs/devref）
                const board = String(pc.board || 'project') === 'generic' ? 'generic' : 'project';
                const project = resolved.library === 'pmg-cards'
                    ? (board === 'generic' ? (config.genericProject.trim() || '') : (workspace || (config.defaultProject.trim() || '')))
                    : '';
                let wl;
                if (resolved.library === 'pmg-cards' && project)
                    wl = loadWhitelist(join(project, 'docs', 'devref'), 'pmg-cards').wl;
                else
                    wl = BUILTIN_WHITELISTS[resolved.library];
                const g = gateProjectCard({ cardType: pc.cardType, board }, wl);
                if (!g.ok) {
                    rejected++;
                    audit({ sid, kind: 'gate-reject', target: pc.title, reason: g.reason, lib: resolved.library });
                    log(`distill 拒收: ${g.reason?.slice(0, 120)}`);
                    continue;
                }
                if (resolved.library === 'pmg-cards') {
                    const script = join(pmgScriptsRoot(), 'devref-card.mjs');
                    if (!project || !existsSync(script)) {
                        failed++;
                        const reason = !project ? (board === 'generic' ? '通用板块未配置 generic_project（宿主直写积压）' : '无目标项目（workspace 反解失败且未配 defaultProject）') : 'devref-card 未就位';
                        audit({ sid, kind: 'write-fail', target: pc.title, reason, lib: 'pmg-cards' });
                        try {
                            // 降级积压（不丢知识；迁移工具并入时按标记分流）
                            const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 30) || 'card';
                            const tag = board === 'generic' ? '[board:generic]' : '[route:project]';
                            const fb = join(pendDir, `${new Date().toISOString().slice(0, 10)}-proj-${sid.slice(0, 8)}-${slug}.md`);
                            writeFileSync(fb, `# ${tag} ${pc.cardType || 'reference'} · ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 板块：${board}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 落点：${board === 'generic' ? '通用板块（配置 generic_project 后经迁移并入）' : 'pmg 缺席积压（装上后经迁移工具并入卡库）'}\n\n${pc.text}\n`, 'utf8');
                            failed--;
                            added++;
                        }
                        catch (e2) {
                            log(`distill project 卡积压兜底失败: ${String(e2.message).slice(0, 120)}`);
                        }
                        continue;
                    }
                    const args = [project, '--title', String(pc.title).trim(), '--card-type', String(pc.cardType || 'reference').trim(), '--text', String(pc.text || '').trim()];
                    if (pc.source)
                        args.push('--source', String(pc.source).trim());
                    const r = await runNode(config.nodeBin, script, args, { timeout: 20000 });
                    if (r.status === 0)
                        added++;
                    else {
                        failed++;
                        audit({ sid, kind: 'write-fail', target: pc.title, reason: textOf(r).slice(0, 120), lib: 'pmg-cards' });
                    }
                }
                else {
                    // local-pending 兜底：宿主直写防丢失积压（白名单已过；积压不过白名单语义见 ADR-0002 决策 4）
                    try {
                        const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 30) || 'card';
                        const fb = join(pendDir, `${new Date().toISOString().slice(0, 10)}-proj-${sid.slice(0, 8)}-${slug}.md`);
                        writeFileSync(fb, `# [route:project] ${pc.cardType || 'reference'} · ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 落点：pmg 缺席积压（装上后经迁移工具并入卡库）\n\n${pc.text}\n`, 'utf8');
                        added++;
                    }
                    catch (e2) {
                        failed++;
                        log(`distill project 卡积压兜底失败: ${String(e2.message).slice(0, 120)}`);
                    }
                }
            }
            audit({ sid, kind: 'distill-run', route, lib: resolved.library, added, rejected, failed });
            return { added, rejected, failed, targetLib: resolved.library };
        }
        return { added, rejected, failed, targetLib: 'none' };
    };
    const distillAgent = async (agent) => {
        const sid = agent.id;
        if (distilling.has(sid))
            return; // 并发守卫：蒸馏在途（最长 10min）内再触发直接跳过（防双写/竞态）
        if (agent.status && agent.status !== 'idle') {
            log(`distill: ${sid.slice(0, 8)} 已恢复活跃（status=${agent.status}），跳过`);
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
                log(`distill: ${sid.slice(0, 8)} 增量 ${deltaText.length} 字符 < 门槛，水位推进 ${lastSeq}→${maxSeq}（不蒸馏）`);
                return;
            }
            if (config.distillPrescan !== false) {
                const hasSig = hasDistillSignals(deltaText);
                if (!hasSig && candFiles.length === 0) {
                    writeWatermark(sid, maxSeq);
                    log(`distill: ${sid.slice(0, 8)} 预筛跳过（增量 ${deltaText.length} 字符无信号词 & pending 无候选），水位推进 ${lastSeq}→${maxSeq}`);
                    return;
                }
                log(`distill: ${sid.slice(0, 8)} 预筛通过（信号词=${hasSig}，pending 候选=${candFiles.length}），进入蒸馏`);
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
            const useProvider = config.llmProvider && config.llmModel && providerFailCount < 2;
            const agentOptions = useProvider ? { provider: config.llmProvider, model: config.llmModel } : undefined;
            const ac = new AbortController();
            const timeout = setTimeout(() => { try {
                ac.abort(new Error('distill timeout 10min'));
            }
            catch { /* */ } }, 600000);
            try {
                const run2 = await ctx.subagents.start('spawn', {
                    label: `distill-${sid.slice(0, 8)}`,
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
                let out = null;
                if (result && Array.isArray(result.output)) {
                    const joined = result.output.filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
                    const cleaned = joined.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
                    try {
                        out = JSON.parse(cleaned);
                    }
                    catch (e1) {
                        const m = cleaned.match(/\{[\s\S]*\}/);
                        if (m) {
                            try {
                                out = JSON.parse(m[0]);
                            }
                            catch (e2) {
                                log(`distill: ${sid.slice(0, 8)} JSON 解析失败: ${String(e2.message).slice(0, 80)}`);
                            }
                        }
                        else
                            log(`distill: ${sid.slice(0, 8)} JSON 解析失败: ${String(e1.message).slice(0, 80)}`);
                    }
                }
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
                log(`distill: ${sid.slice(0, 8)} stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`);
                audit({ sid, kind: 'distill-run', route, stop, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed });
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
                if (stop === 'completed') {
                    writeWatermark(sid, maxSeq);
                    log(`distill: ${sid.slice(0, 8)} completed，水位推进 → ${maxSeq}`);
                }
                else {
                    log(`distill: ${sid.slice(0, 8)} stop=${stop}，水位保留 ${lastSeq} 待下轮重试`);
                }
            }
            catch (e) {
                clearTimeout(timeout);
                if (useProvider)
                    providerFailCount++;
                log(`distill ERROR ${sid.slice(0, 8)}: ${String(e?.message || e).slice(0, 200)}`);
            }
        }
        catch (e) {
            log(`distill agent err ${sid.slice(0, 8)}: ${String(e?.message || e).slice(0, 120)}`);
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
    // ═══ 深度睡眠归纳 pass（L0 原则层 PRINCIPLES.md 自动写入口；2026-09-08 拍板）═══
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
                    && !['no-parent', 'no-traces'].includes(String(o.result))
                    && t > lastDeepSleepAt)
                    lastDeepSleepAt = t;
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 无审计文件=新装 */ }
    /**
     * 痕迹窗口起点 = max(本日 0 点, 上次深度睡眠时刻)——
     * ① 统一用 mtime/时间戳比较，规避 pending 文件名日期为 UTC（`toISOString` 切片）与本地日期跨日不一致导致的漏收；
     * ② 同一天多次触发时不重复喂同一批材料（已归纳的不再回想）。
     */
    const traceSince = () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return Math.max(d.getTime(), Number(lastDeepSleepAt) || 0);
    };
    // 当天痕迹收集（深度睡眠作用域=本日）
    const gatherDeepSleepTraces = (memRoot) => {
        const since = traceSince();
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
        return parts.join('\n\n');
    };
    // 原则落盘：宿主拼装新全文 → write_gate 校验（容量/指针/行格式）→ 原子替换（冲突=原地 replace）
    const applyPrinciples = async (memRoot, out) => {
        const principlesPath = join(memRoot, 'PRINCIPLES.md');
        const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs');
        if (!existsSync(gateScript))
            return { added: 0, replaced: 0, skipped: 0, gate: 'write_gate 未就位' };
        let content = '';
        try {
            content = readFileSync(principlesPath, 'utf8');
        }
        catch {
            content = '# PRINCIPLES.md — 原则层（L0 图式；spec §5.8）\n\n> 跨任务泛化方向指引，常驻注入。唯一写入口=深度睡眠归纳 pass，经 write_gate 落盘；每条带源指针。容量 ≤1,000 字符硬限（超限=原则间合并）。\n';
        }
        const lines = content.split(/\r?\n/);
        let added = 0, replaced = 0, skipped = 0;
        for (const p of ((out && Array.isArray(out.principles)) ? out.principles : [])) {
            const text = String((p && p.text) || '').trim();
            if (!/^- .+←\s*源:\s*notes\/[A-Za-z0-9_-]+\.md/.test(text)) {
                skipped++;
                continue;
            } // 行格式宿主预检（gate 亦校验）
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
            const g = await runNode(config.nodeBin, gateScript, ['PRINCIPLES.md', tmpPath], { env: { MEMORY_ROOT: memRoot }, timeout: 20000 });
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
    /** 返回 'done'=本轮窗口已消化（推进水位）；'failed'=瞬时故障（回滚水位，下轮可重试同一批痕迹） */
    const runDeepSleep = async () => {
        try {
            const { resolved } = resolveTarget('memory', presence());
            if (resolved.library !== 'memory-plugin' && resolved.library !== 'shoucang-local') {
                log('deep sleep: 记忆目标库不可用，跳过');
                return 'done';
            }
            const traces = gatherDeepSleepTraces(resolved.root);
            if (!traces) {
                log(`deep sleep: 本日无痕迹，跳过（窗口起点 ${new Date(traceSince()).toLocaleString()}）`);
                audit({ kind: 'deep-sleep', result: 'no-traces' });
                return 'done';
            }
            log(`deep sleep: 窗口内痕迹 ${traces.length} 字符（起点 ${new Date(traceSince()).toLocaleString()}）`);
            const currentPrinciples = (() => { try {
                return readFileSync(join(resolved.root, 'PRINCIPLES.md'), 'utf8');
            }
            catch {
                return '';
            } })();
            const currentList = currentPrinciples.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^- .+←/.test(l)).join('\n') || '（暂无条目）';
            validateProvider();
            const userInput = [
                '## 当天记忆痕迹（作用域=本日，不做全库扫描）',
                traces,
                `## 现行原则（冲突时 replace，match 逐字取自此清单）\n${currentList}`,
                '请按规则处理：提炼跨任务泛化原则并输出 JSON 指令。',
            ].join('\n\n');
            const useProvider = config.llmProvider && config.llmModel && providerFailCount < 2;
            const agentOptions = useProvider ? { provider: config.llmProvider, model: config.llmModel } : undefined;
            const parent = pickParent();
            if (!parent) {
                log('deep sleep: 无可用 parent agent（宿主 spawn 必需），跳过本轮');
                audit({ kind: 'deep-sleep', result: 'no-parent' });
                return 'failed';
            }
            const ac = new AbortController();
            const timeout = setTimeout(() => { try {
                ac.abort(new Error('deep sleep timeout 10min'));
            }
            catch { /* */ } }, 600000);
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
                const out = parseAgentJson(result, 'deep sleep');
                if (stop === 'completed' && out)
                    providerFailCount = 0;
                else if (useProvider && (stop !== 'completed' || !out))
                    providerFailCount++;
                const app = (stop === 'completed' && out)
                    ? await applyPrinciples(resolved.root, out)
                    : { added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}` };
                log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）`);
                audit({ kind: 'deep-sleep', stop, added: app.added, replaced: app.replaced, skipped: app.skipped, gate: app.gate });
                return 'done';
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
        const short = rec.sid.slice(0, 8);
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
        lastDeepSleepAt = now;
        log(`deep sleep: 触发（停滞 ${Math.round((now - hottest) / 60000)}min ≥ 阈值 ${Math.round(idleMs / 60000)}min · 会话态 running=${running} ended=${ended} stalled=${stalled}）`);
        runDeepSleep().then((r) => {
            // 瞬时故障（无 parent / 子代理异常）→ 水位回滚，否则同一批痕迹会被永久划出窗口
            if (r === 'failed') {
                lastDeepSleepAt = prevDeepSleepAt;
                log('deep sleep: 本轮失败，水位回滚（同一批痕迹下轮可重试）');
            }
        }).catch((e) => {
            lastDeepSleepAt = prevDeepSleepAt;
            log(`deep sleep err: ${String(e?.message || e).slice(0, 120)}（水位回滚）`);
        }).finally(() => { deepSleepRunning = false; });
    };
    /** 状态机快照（供 UI 消费；接线待办见 docs/ui-todo.md）——后续面板展示/手动触发都读这里 */
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
            list.push({ sid: rec.sid.slice(0, 8), state: rec.state, lastEventAt: rec.lastEventAt, lastEndAt: rec.lastEndAt, probeResult: rec.probeResult });
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
            await runDeepSleep();
            return { ok: true };
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
            distillAgent(agent).catch((e) => log(`distill agent err ${sid.slice(0, 8)}: ${String(e?.message || e).slice(0, 120)}`));
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
    // 状态机活跃信号：**任意**根会话事件 → RUNNING（长任务持续产生 chunk/tool 事件即持续刷新水位）
    ctx.on('session/event', (session, _event) => {
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
    return { getDeepSleepStatus, runDeepSleepNow, getConfig };
}
//# sourceMappingURL=distill.js.map