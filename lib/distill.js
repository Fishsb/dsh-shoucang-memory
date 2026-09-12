import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDeepSleep } from './deepsleep.js';
import { dshHome, knowledgeRoot, memoryLibRoot, } from './targets.js';
import { recallRanked } from './vec.js';
// 深睡判据层：2026-09-12 自本文件抽出为 ./deepsleep-core.ts（架构根治 P1）。
// 下方 `export *` 是**过渡兼容**——两个行为测试件仍从 lib/distill.js 取这些符号，
// 直接断链会让它们模块解析即失败（本仓 09-12 已栽过一次「重命名后测试件断链」）。
// 待消费方全部改指 deepsleep-core 后，可删掉该行并改为精确具名导入。
import { DISCARD_SNAPSHOT_CB_N, SKIP_HOLD_MAX, planSkipWatermark, } from './deepsleep-core.js';
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
import { INGEST_JUDGE, JUDGEMENT_HINT, LEDGER_FILE } from './criteria.generated.js';
import { evaluateL0 } from './criteria.js';
import { newDistillState } from './distill-state.js';
import { createInfraApi } from './distill-infra.js';
import { createCandApi } from './distill-candidates.js';
import { createWmApi } from './distill-watermark.js';
import { createLlmApi } from './distill-llm.js';
import { createParentApi } from './distill-parent.js';
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
import { runNode, textOf } from './distill-proc.js';
import { createWriteApi } from './distill-write.js';
import { createActApi } from './distill-activation.js';
// ── 蒸馏器主体 ──
export function registerDistill(ctx, config) {
    const SHORT = 'shoucang-scheduler';
    const logFile = join(dshHome(), 'super-injector', SHORT + '.log');
    const kRoot = knowledgeRoot();
    const watermarkFile = join(kRoot, 'audit', 'distill-watermark.jsonl');
    const auditFile = join(kRoot, 'audit', 'distill-audit.jsonl');
    // 判据台账（ADR-122 v2）：每次决策一行——判据取值 + 决策 + 结果 + 依据，供 scripts/criteria-audit.mjs 对账
    const ledgerFile = join(kRoot, LEDGER_FILE);
    const pendDir = join(kRoot, 'pending');
    // ═══ 路线② 成长环数据源：轻 episode（同类判定/转正数据源，不存全文）+ 低置信任务候选区（跨窗口记忆）═══
    const episodeFile = join(kRoot, 'audit', 'episodes.jsonl');
    const candidateDir = join(pendDir, 'flow-candidates');
    const EPISODE_CAP = 256;
    // ═══ WikiSkill 借鉴 · raw 裁决存根（raw-stub/）：每轮蒸馏裁决的不可变元数据留档（不含正文/文本内容，隐私安全），
    // 供 route 分流抽验（audit-protocol §8 第 5 问）与契约升级的离线重放评测（对标 WikiSkill raw/ 只存证据不存解读）。写入后不覆写。
    const stubDir = join(kRoot, 'audit', 'raw-stub');
    // ── 领域模块装配（阶段 C）：依赖**按领域窄传**，实现在 distill-*.ts ──
    const st = newDistillState();
    const infra = createInfraApi({
        logFile, auditFile, ledgerFile, episodeFile, stubDir, kRoot, EPISODE_CAP, LEDGER_FILE,
    });
    const cand = createCandApi({
        candidateDir,
        embedCfgOf: () => embedCfgOf(), // 惰性：embedCfgOf 定义在本函数更下方（TDZ），箭头延迟求值
        ledger: infra.ledger,
    });
    const wm = createWmApi({
        watermarkFile, log: infra.log, audit: infra.audit, sidShort: infra.sidShort, st,
    });
    // 并发守卫：同会话蒸馏在途标记（防 turn/end 重武装导致双写/竞态）
    // 单库化（2026-09-08 用户拍板）：守藏只有一个记忆库（生产根），不再有 presence 二分与降级链。
    // 库缺席（部署残缺）时由各写入点如实审计，不再静默换库。
    loadEngineSignals();
    // LLM 路由连败弃用（坑位补强：连败≥2 回落继承主会话模型，成功后复位）
    const llmState = { providerFailCount: 0 };
    const llm = createLlmApi({ log: infra.log, llmState, config, ctx });
    // ── 领域模块装配（阶段 C-2）：依赖**按领域窄传**，实现在 distill-*.ts ──
    const write = createWriteApi({
        kRoot, pendDir, infra, cand, llm, st, config,
        embedCfgOf: () => embedCfgOf(), // 惰性：embedCfgOf 定义在本函数更下方（TDZ），箭头延迟求值
    });
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
            infra.log(`selfcheck(${trigger}): 裁决 ${sc.verdict}${adjIds.length ? ' · 建议调整 ' + adjIds.join(',') : ''}`);
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
                    infra.ledger({ type: 'adjust.rollback', domain: 'consolidate', trigger, key: adj.action.key, value: adj.action.value, why: 'selfcheck R-3（shadow-sim.flipReady=false）', needsReload: true });
                    infra.log(`selfcheck(${trigger}): 白名单回滚 ${adj.action.key}=${adj.action.value}（已备份 .bak-selfcheck；需重载生效）`);
                }
            }
            return { verdict: sc.verdict, adjustments: adjIds };
        }
        catch (e) {
            infra.log(`selfcheck(${trigger}) 失败（不影响主流程）：${String(e.message).slice(0, 80)}`);
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
        if (st.distilling.has(sid))
            return; // 并发守卫（本 fiber 内）：蒸馏在途（最长 10min）内再触发直接跳过
        if (agent.status && agent.status !== 'idle') {
            infra.log(`distill: ${infra.sidShort(sid)} 已恢复活跃（status=${agent.status}），跳过`);
            return;
        }
        // 子代理守卫（2026-09-10 实态修复）：主会话派子代理执行并等待返回时，主会话 turn/end 已完成、status=idle、
        // 但其子代理仍在 running——此时蒸馏只是把任务"做到一半"的内容切碎入册，且水位推进后不会重蒸。
        // 处理：本轮推迟（不推水位、不消费），重新武装 idle 定时器；子代理完成时父会话会收到 followup 事件再触发。
        if (parent.hasActiveSubagents(sid)) {
            infra.audit({ sid, kind: 'distill-skip', reason: 'active-subagent', fclass: 'busy-subagent' });
            infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'busy-subagent' }, result: { added: 0, rejected: 0, failed: 0 } });
            infra.log(`distill: ${infra.sidShort(sid)} 有活跃子代理在跑（等待返回），推迟蒸馏（水位保留）`);
            armIdleTimer(agent);
            return;
        }
        st.distilling.add(sid);
        let claimed = false;
        try {
            // A2（2026-09-11 审查修复）：入口先回流 project-defer 卡 —— 它们是「已裁决为项目卡」的降级暂存，
            // 只因 workspace 当初不可解才留在 pending；绝不能再喂 LLM 重裁决（会按本轮会话 route 一刀切 →
            // 落错工作区；随后还可能被候选 .processed 吞掉）。flush 内部按卡内「源会话」反解 workspace。
            try {
                await write.flushDeferCards();
            }
            catch { /* 回流失败不阻断本轮蒸馏 */ }
            llm.validateProvider();
            // v19（2026-09-10）：水位不再是裸数字——经「格式代 + 锚点事件指纹」双证校验，迁移/序号重排即作废全量重蒸。
            // 快照只取一次（同一数组喂水位增量计算 + 分段器），避免全量 snapshotEvents 被重复物化。
            const wmEvents = agent.session.snapshotEvents();
            const baseline = wm.resolveWatermark(sid, agent);
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
            const streak = st.snapshotUnavailableStreak.get(sid) ?? 0;
            if (streak >= DISCARD_SNAPSHOT_CB_N) {
                infra.audit({ sid, kind: 'distill-skip', reason: 'snapshot-unavailable-circuit-break', fclass: 'snapshot-unavailable', streak, threshold: DISCARD_SNAPSHOT_CB_N });
                infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'snapshot-unavailable-circuit-break' }, result: { added: 0, rejected: 0, failed: 0 } });
                infra.log(`distill: ${infra.sidShort(sid)} 快照连续 ${streak} 轮不可用（阈值 ${DISCARD_SNAPSHOT_CB_N}）→ 本轮跳过（熔断，防整窗重蒸死循环）`);
                return;
            }
            // v18 分段蒸馏（2026-09-10）：整窗按 CHUNK_CHARS/事件边界切段后逐段蒸馏——每段成功即推水位到该段 endSeq
            // （断点续传），段间紧凑清单 manifest 续上下文防同轮重复入册；修复旧「整窗一次注入 24k 截断丢尾 / 失败整窗重蒸」。
            const { chunks, maxSeq } = buildEventChunks(agent, lastSeq, CHUNK_CHARS, wmEvents);
            // A3：统一 claim（idle 与扫尾同一判定）——在途即让位（本 fiber 结束/早退时释放）。
            if (!write.tryClaim(sid, lastSeq, maxSeq)) {
                infra.audit({ sid, kind: 'distill-skip', reason: 'claim-held', fclass: 'claim-held' });
                infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'claim-held' }, result: { added: 0, rejected: 0, failed: 0 } });
                infra.log(`distill: ${infra.sidShort(sid)} claim 在途（其他实例接管中），本轮让位`);
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
                const skipPlan = planSkipWatermark(write.hasPendingUndigested(sid), st.skipHoldStreak.get(sid) || 0, maxSeq);
                st.skipHoldStreak.set(sid, skipPlan.holdRounds);
                if (skipPlan.write)
                    wm.writeWatermark(sid, skipPlan.seq, agent);
                // 跳过也留审计痕（观测盲区修复 2026-09-09：此前门槛/预筛跳过只进日志，审计里只见真实 run，
                // 「蒸馏为什么没跑」无法从数据区分——是没触发还是被挡）
                infra.audit({ sid, kind: 'distill-skip', reason: 'below-min-chars', fclass: 'below-min', chars: totalChars, skipPlan: skipPlan.reason, heldForUndigested: !skipPlan.write, starved: skipPlan.holdRounds, watermarkTo: skipPlan.write ? skipPlan.seq : lastSeq });
                infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'below-min-chars', chars: totalChars, heldForUndigested: !skipPlan.write }, result: { added: 0, rejected: 0, failed: 0 } });
                infra.log(`distill: ${infra.sidShort(sid)} 增量 ${totalChars} 字符 < 门槛${skipPlan.write ? `，水位推进 ${lastSeq}→${skipPlan.seq}（${skipPlan.reason}）` : `，因存在未消化段**扣住水位** ${lastSeq}（第 ${skipPlan.holdRounds}/${SKIP_HOLD_MAX} 轮，${skipPlan.reason}）`}`);
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
                    const skipPlan = planSkipWatermark(write.hasPendingUndigested(sid), st.skipHoldStreak.get(sid) || 0, maxSeq);
                    st.skipHoldStreak.set(sid, skipPlan.holdRounds);
                    if (skipPlan.write)
                        wm.writeWatermark(sid, skipPlan.seq, agent);
                    infra.audit({ sid, kind: 'distill-skip', reason: 'prescan-no-signal', fclass: 'prescan-no-signal', chars: totalChars, skipPlan: skipPlan.reason, heldForUndigested: !skipPlan.write, starved: skipPlan.holdRounds, watermarkTo: skipPlan.write ? skipPlan.seq : lastSeq });
                    infra.ledger({ domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), decision: { route: 'skip', reason: 'prescan-no-signal', chars: totalChars, heldForUndigested: !skipPlan.write }, result: { added: 0, rejected: 0, failed: 0 } });
                    infra.log(`distill: ${infra.sidShort(sid)} 预筛跳过（增量 ${totalChars} 字符无信号词 & pending 无候选）${skipPlan.write ? `，水位推进 ${lastSeq}→${skipPlan.seq}（${skipPlan.reason}）` : `，因存在未消化段**扣住水位** ${lastSeq}（第 ${skipPlan.holdRounds}/${SKIP_HOLD_MAX} 轮，${skipPlan.reason}）`}`);
                    return;
                }
                infra.log(`distill: ${infra.sidShort(sid)} 预筛通过（信号词=${hasSig}${bigDelta ? `，大段 ${totalChars}≥${prescanMin} 强制蒸馏` : ''}，pending 候选=${candFiles.length}），进入分段蒸馏`);
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
            const resolvedLlm = llm.resolveLlm(config.distillProvider, config.distillModel);
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
                        label: `distill-${infra.sidShort(sid)}`,
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
                    const out = parseAgentJson(result, `distill ${infra.sidShort(sid)}`); // 子代理输出 → JSON（剥离代码栅栏+容错提取，与深睡共用同一实现）
                    if (stop === 'completed' && out)
                        llmState.providerFailCount = 0;
                    else if (useProvider && (stop !== 'completed' || !out))
                        llmState.providerFailCount++;
                    const rawRoute = (out && typeof out.route === 'string') ? out.route.trim().toLowerCase() : '';
                    const route = ['memory', 'project', 'discard'].includes(rawRoute) ? rawRoute : 'memory'; // 归一化+未知回退 memory（宁滥勿丢）
                    const workspace = await llm.resolveWorkspace(sid);
                    const disp = route === 'discard'
                        ? { added: 0, rejected: 0, failed: 0, targetLib: 'none' }
                        : await write.writeDispatch(sid, out, route, workspace);
                    infra.log(`distill: ${infra.sidShort(sid)} 段${k + 1}/${segLimit}（seq ${chunk.startSeq}→${chunk.endSeq}）stop=${stop} route=${route} → ${disp.targetLib} 入册 ${disp.added} / 拒收 ${disp.rejected} / 失败 ${disp.failed}`);
                    // WikiSkill 借鉴：失败归类 fclass（供审计聚合/深睡根因回流）+ LLM 指纹（大小模型蒸馏质量实证的数据底座）
                    const llmLabel = useProvider && resolvedLlm ? `${resolvedLlm.provider}/${resolvedLlm.model}` : 'inherited';
                    const fclass = !out ? 'json-parse'
                        : stop !== 'completed' ? (useProvider ? 'provider-fail' : 'agent-stop')
                            : route === 'discard' ? 'discard'
                                : disp.failed > 0 ? 'dispatch-failed'
                                    : disp.rejected > 0 ? 'gate-reject'
                                        : 'ok';
                    // v18：审计行与 raw-stub 均带分段标记（chunk/chunkStart/chunkEnd/totalChunks）；stub watermark=该段推进区间（同步用该段 endSeq）
                    infra.audit({ sid, kind: 'distill-run', route, stop, fclass, llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length });
                    // 判据台账（摄取域）：模型判据（可选 judgement）+ 宿主 L0 代理评估 + 决策与结果
                    infra.ledger({
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
                    infra.ledger({
                        type: 'write.ingest', domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), chunk: k + 1,
                        channel: 'appends+newIndex', carrier: 'gated:index', target: disp.targetLib || 'memory',
                        verdict: disp.added > 0 ? 'written' : (disp.rejected > 0 ? 'rejected' : 'skipped'),
                        attempted: (out?.appends || []).length + (out?.newIndex || []).length, written: disp.added, rejected: disp.rejected, failed: disp.failed,
                    });
                    infra.recordStub({ sid, watermark: [wmNow, chunk.endSeq], chars: chunk.text.length, route, stop, fclass, llm: llmLabel, disp: { added: disp.added, rejected: disp.rejected, failed: disp.failed, targetLib: disp.targetLib }, outShape: out ? { appends: (out.appends || []).length, newIndex: (out.newIndex || []).length, profiles: (out.profiles || []).length, projectCards: (out.projectCards || []).length, skipped: (out.skipped || []).length } : null, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length });
                    if (stop === 'completed' && out && disp.failed === 0) {
                        if (disp.added > 0)
                            anyAdded = true;
                        // 路线②：蒸馏裁决完成（stop=completed && out，无论入册多少）即留轻 episode——episode=「任务发生+结果」的
                        // 同类判定/转正数据源（memory-core-model §3.1）；入册或裁决非 discard 时再建/更新低置信任务候选
                        const intent = cand.intentOf(chunk.text);
                        infra.recordEpisode({ sid, intent: intent.slice(0, 120), route, fclass, llm: llmLabel, outcome: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, lib: disp.targetLib });
                        if (route !== 'discard')
                            await cand.ensureFlowCandidate(sid, intent);
                        // v18 核心：段成功立即推水位到该段 endSeq（断点续传——失败/截断不再丢尾；整窗处理完自然到达 maxSeq）
                        wm.writeWatermark(sid, chunk.endSeq, agent);
                        // G-4a：本段已消化 ⇒ 清掉它的失败记账与「扣住」计数（否则 hasPendingUndigested 永久为真 ⇒ 跳过分支被无谓扣住）
                        st.dispatchFailStreak.delete(`${sid}#${chunk.endSeq}`);
                        st.skipHoldStreak.delete(sid);
                        infra.log(`distill: ${infra.sidShort(sid)} 段${k + 1}/${segLimit} completed，水位推进 ${wmNow}→${chunk.endSeq}${chunk.endSeq < maxSeq ? `（整窗尚余 ${chunks.length - k - 1} 段，下轮续传）` : '（整窗蒸馏完成，水位=maxSeq）'}`);
                        wmNow = chunk.endSeq;
                        // 段间紧凑清单续上下文：本段裁决一行（供同轮后段查重/合并，勿重复入册；超 MANIFEST_CAP 丢最早行）
                        manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP);
                        segOk = true;
                    }
                    else if (stop === 'completed' && out && disp.failed > 0) {
                        // A1（2026-09-11 审查修复）：stop/JSON 都 OK 但**条目级落盘失败** → 本段不算消化，水位不前移。
                        // 防死循环：同一段连续失败满 MAX_DISPATCH_RETRY 次 → 强制推进并落审计（丢失显式记账）。
                        const streakKey = `${sid}#${chunk.endSeq}`;
                        const tries = (st.dispatchFailStreak.get(streakKey) || 0) + 1;
                        if (tries >= write.MAX_DISPATCH_RETRY) {
                            st.dispatchFailStreak.delete(streakKey);
                            st.skipHoldStreak.delete(sid); // 本段已放弃 ⇒ 不再因它扣住跳过分支
                            wm.writeWatermark(sid, chunk.endSeq, agent);
                            wmNow = chunk.endSeq;
                            manifest = manifestPush(manifest, manifestLineFor(chunk.endSeq, route, out), MANIFEST_CAP);
                            segOk = true;
                            infra.audit({ sid, kind: 'distill-run', route, stop, fclass: 'dispatch-failed-forced', llm: llmLabel, targetLib: disp.targetLib, added: disp.added, rejected: disp.rejected, failed: disp.failed, chunk: k + 1, chunkStart: chunk.startSeq, chunkEnd: chunk.endSeq, totalChunks: chunks.length, tries });
                            infra.log(`distill: ${infra.sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条、已连续 ${tries} 轮——强制推进水位 → ${chunk.endSeq}（丢失已审计 dispatch-failed-forced）`);
                        }
                        else {
                            st.dispatchFailStreak.set(streakKey, tries);
                            infra.log(`distill: ${infra.sidShort(sid)} 段${k + 1}/${segLimit} 落盘失败 ${disp.failed} 条（第 ${tries}/${write.MAX_DISPATCH_RETRY} 次）——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`);
                        }
                    }
                    else {
                        // 水位保留：stop≠completed（error/timeout/aborted）或 stop=completed 但 out=null（JSON 解析失败，
                        // 2026-09-09 实锤「Unexpected end of JSON input」）都不算消化——本段不推进，下轮从本段续传
                        infra.log(`distill: ${infra.sidShort(sid)} 段${k + 1}/${segLimit} stop=${stop} out=${out ? 'ok' : 'null'}，本段失败——水位保留 ${wmNow}，下轮从本段（seq ${chunk.startSeq}）续传`);
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
                        infra.log(`distill: ${infra.sidShort(sid)} 段${k + 1} 旧 ctx 已失效（inactive context），跳过本轮（水位保留 ${wmNow}，待扫尾）`);
                    }
                    else {
                        if (useProvider)
                            llmState.providerFailCount++;
                        infra.log(`distill ERROR ${infra.sidShort(sid)} 段${k + 1}: ${msg.slice(0, 200)}`);
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
            infra.log(`distill agent err ${infra.sidShort(sid)}: ${String(e?.message || e).slice(0, 120)}`);
        }
        finally {
            st.distilling.delete(sid);
            if (claimed)
                write.releaseClaim(sid);
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
                    infra.log(`${label} JSON 解析失败: ${String(e2.message).slice(0, 80)}`);
                }
            }
            else
                infra.log(`${label} JSON 解析失败: ${String(e1.message).slice(0, 80)}`);
            return null;
        }
    };
    const parent = createParentApi({ log: infra.log, config, ctx, st });
    /** 返回 'done'=本轮窗口已消化（推进水位）；'failed'=瞬时故障（回滚水位，下轮可重试同一批痕迹） */
    // ── 深睡状态机装配（2026-09-12 P1 二期：1499 行已迁至 ./deepsleep.ts）──────────
    // 依赖倒置：把蒸馏侧回调（distillAgent / writeDispatch）与共享设施**注入**，
    //   deepsleep.ts 因此**零 import distill** —— 依赖方向保持严格单向、零环不破。
    //   （若让 deepsleep 直接 import distill，就会因为「深睡回调蒸馏」形成循环依赖。）
    // ⚠ 2026-09-12 阶段 B：依赖**按领域分组**注入（io/cfg/llm/session/write/housekeep，每组 ≤8 字段），
    //   取代原先 32 字段一把梭的扁平 ctx —— 深睡侧每个实现函数只从自己那组取 3–7 个。
    const ds = createDeepSleep({
        io: { log: infra.log, audit: infra.audit, ledger: infra.ledger, kRoot, auditFile, pendDir, candidateDir, probeScriptPath: llm.probeScriptPath },
        cfg: { config, PROFILE_HEADER: write.PROFILE_HEADER, capEnv: write.capEnv, llmState },
        llm: { runNode, textOf, resolveLlm: llm.resolveLlm, resolveDefaultModel: parent.resolveDefaultModel, validateProvider: llm.validateProvider },
        session: { pickParent: parent.pickParent, ensureDaemonParent: parent.ensureDaemonParent, locateTranscript: llm.locateTranscript, hasActiveSubagents: parent.hasActiveSubagents },
        write: { distillAgent, writeDispatch: write.writeDispatch, writeProfileLine: write.writeProfileLine, parseAgentJson, normalizeProfileTarget: write.normalizeProfileTarget },
        housekeep: {
            runSelfCheck, bankSnapshot,
            // 惰性包裹：embedCfgOf 定义在本调用之后（TDZ），箭头函数延迟求值即可，无需搬动其定义位置。
            embedCfgOf: () => embedCfgOf(),
        },
        appCtx: ctx,
    });
    const armIdleTimer = (agent) => {
        parent.rememberAgent(agent); // 深睡 parent 兜底缓存
        const sid = agent.id;
        const old = st.idleTimers.get(sid);
        if (old)
            clearTimeout(old);
        const t = setTimeout(() => {
            st.idleTimers.delete(sid);
            distillAgent(agent).catch((e) => infra.log(`distill agent err ${infra.sidShort(sid)}: ${String(e?.message || e).slice(0, 120)}`));
        }, config.idleWakeMs);
        st.idleTimers.set(sid, t);
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
                const p = parent.parentSidOf(agent);
                parent.noteChildActivity(p, sid);
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
            const t = st.idleTimers.get(agent.id);
            if (t) {
                clearTimeout(t);
                st.idleTimers.delete(agent.id);
            }
        }
        catch { /* */ }
        try {
            parent.dropChild(agent.id);
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
            const t = st.idleTimers.get(sid);
            if (t) {
                clearTimeout(t);
                st.idleTimers.delete(sid);
            }
        }
        catch { /* */ }
        try {
            parent.dropChild(session && session.id);
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
    const act = createActApi({
        actShadowFile, actConf, actState, infra, st, config,
        embedCfgOf: () => embedCfgOf(), // 同上，惰性求值避 TDZ
    });
    // ═══ 积压扫尾（2026-09-10 用户拍板：稳健性修复——旧 ctx 失败/重启/错过空闲窗的会话自动补蒸馏）═══
    // 候选：**当前 ctx 根内（live）**的会话、水位<内存末事件 seq、且已出「10min 宽限期」（避免与 idle 定时器抢跑/打断用户续聊）。
    // ⚠ 覆盖边界（2026-09-11 审查修正注释）：root 之外/重启前已结束且**未被重新载入**的会话不在本链覆盖内——
    //   旧注释「重启前已结束的一律补」与现码不符；真要补需会话重新载入，或另立持久会话清单（本档未实现）。
    const sweepBacklog = async () => {
        try {
            // 先回流 pending defer 卡（workspace 恢复后直写 devref；周期扫尾也覆盖）
            try {
                await write.flushDeferCards();
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
                    if (parent.hasActiveSubagents(sid))
                        continue; // 子代理在跑：任务未完，扫尾勿抢蒸（2026-09-10）
                    if (st.distilling.has(sid))
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
                    const base = wm.resolveWatermark(sid, a);
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
                        if (write.claimHeld(sid)) {
                            continue;
                        } // 在途，其他 fiber 已接管
                        infra.log(`sweep: ${infra.sidShort(sid)} 水位 ${lastSeq}→${maxSeq} 有未消化增量，补蒸馏`);
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
                const p = parent.parentSidOf(a);
                parent.noteChildActivity(p, sid);
                if (p)
                    ds.noteEvent(p, false);
                return;
            }
            ds.noteEvent(sid, false);
            parent.rememberAgent(a); // 深睡 parent 兜底缓存（任意根会话事件都刷新）
            if (config.activationShadow !== false || config.activationPrefetch)
                void act.activationStep(sid, event); // 路线④：影子默认开；prefetch 置位后决策通路照走（影子行 mode 区分），实际注入仍待影子校准（后续档）
        }
        catch { /* 状态迁移零抛出 */ }
    });
    ctx.effect(() => {
        const t = setTimeout(() => {
            try {
                const roots = ctx.agents.roots();
                infra.log(`distill 启动（守藏蒸馏器 · idleWake ${Math.round(config.idleWakeMs / 60000)}min · adopt roots=${roots.length} · 数据区 ${kRoot}）`);
                llm.validateProvider();
            }
            catch (e) {
                infra.log(`adopt err: ${String(e?.message || e).slice(0, 120)}`);
            }
        }, 2000);
        return () => clearTimeout(t);
    }, SHORT + ': distill adopt');
    // 深度睡眠巡检定时器（10min 一查；effect 清理，reload 零泄漏）
    ctx.effect(() => {
        const probeOk = existsSync(llm.probeScriptPath);
        infra.log(`deep sleep 巡检启动（enable=${config.enableDeepSleep} · 停滞阈值 ${Math.round((Number(config.deepSleepIdleMs) || 10800000) / 60000)}min · 探测 ${config.deepSleepProbe ? '开' : '关'}${config.deepSleepProbe ? `（无事件 ${Math.round((Number(config.deepSleepProbeAfterMs) || 10800000) / 60000)}min 后发起，探针${probeOk ? '就位' : '缺失→无法确认即正常睡'}）` : ''}）`);
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
                for (const [, t] of st.idleTimers)
                    clearTimeout(t);
            }
            catch { /* */ }
            try {
                st.idleTimers.clear();
            }
            catch { /* */ }
            try {
                st.distilling.clear();
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
            const fl = await write.flushDeferCards();
            const roots = (ctx.agents && typeof ctx.agents.roots === 'function') ? ctx.agents.roots() : [];
            let n = 0;
            for (const a of roots) {
                try {
                    if (!a || !a.id || !a.session || typeof a.session.snapshotEvents !== 'function')
                        continue;
                    const origin = a.session && a.session.header && a.session.header.origin;
                    if (origin === 'subagent')
                        continue;
                    if (st.distilling.has(a.id))
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