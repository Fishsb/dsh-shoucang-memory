import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDeepSleep } from './deepsleep.js';
import { dshHome, knowledgeRoot, memoryLibRoot, } from './targets.js';
export * from './deepsleep-core.js';
// （会话活跃状态机 FSM 文档与 SessState / DeepSleepStatus / SessRec 已迁至 ./deepsleep-core.ts）
// ── 蒸馏裁决契约 v7（ADR-122 记忆核心 v2：判据段由 skill/engine/criteria.json 生成，禁手写）──
// v4 变更：取消「记忆库 vs 项目卡库」粒度二分——跨项目有用的细粒度条文也进 notes；项目专属事实直写项目工作区 devref；
//          新增 profiles 双画像通道（用户画像 USER + Agent 自我画像 AGENT，Q2「归谁」的落地写入通道）。
// v5 变更：appends 条目可选 rootCause/avoidWhen——教训/踩坑类浓缩附 WHY 根因与「不适用」场景。
// v7 变更（v2 架构）：① 判据段（R1-R4 + 四问 + Q2 画像判定）改为**生成投影** INGEST_JUDGE（源=criteria.json）；
//          ② 四问**降级为归属子判据组**（不再是全局判据抬头）；③ **删除「规则→SOUL.md」死支**（宿主无该写入通道）；
//          ④ 输出可带可选 `judgement`（L0 四维 + dup）→ 宿主写 judgement-ledger 供对账。
import { INGEST_JUDGE, JUDGEMENT_HINT, LEDGER_FILE } from './criteria.generated.js';
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
import { createAgentApi } from './distill-agent.js';
import { createHooksApi } from './distill-hooks.js';
import { createBankApi } from './distill-bank.js';
import { createEmbedApi } from './distill-embed.js';
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
    const embed = createEmbedApi({ config });
    const cand = createCandApi({
        candidateDir,
        embedCfgOf: () => embed.embedCfgOf(), // 惰性：embedCfgOf 定义在本函数更下方（TDZ），箭头延迟求值
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
        embedCfgOf: () => embed.embedCfgOf(), // 惰性：embedCfgOf 定义在本函数更下方（TDZ），箭头延迟求值
    });
    const bank = createBankApi({ kRoot, infra, config });
    // ── 领域模块装配（阶段 C-2b）：依赖**按领域窄传**，实现在 distill-*.ts ──
    const parent = createParentApi({ log: infra.log, config, ctx, st });
    const agent = createAgentApi({
        io: { infra, pendDir },
        wm: { wm, st },
        write: { write, bankSnapshot: bank.bankSnapshot },
        llm: { llm, llmState, embedCfgOf: () => embed.embedCfgOf() }, // 惰性：embedCfgOf 定义更靠下（TDZ）
        cand: { cand },
        parent: { parent },
        env: { config, ctx, hasDistillSignals, DEFAULT_DISTILL_PROMPT },
    });
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
        write: { distillAgent: agent.distillAgent, writeDispatch: write.writeDispatch, writeProfileLine: write.writeProfileLine, parseAgentJson: agent.parseAgentJson, normalizeProfileTarget: write.normalizeProfileTarget },
        housekeep: {
            runSelfCheck: bank.runSelfCheck, bankSnapshot: bank.bankSnapshot,
            // 惰性包裹：embedCfgOf 定义在本调用之后（TDZ），箭头函数延迟求值即可，无需搬动其定义位置。
            embedCfgOf: () => embed.embedCfgOf(),
        },
        appCtx: ctx,
    });
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
            agent.armIdleTimer(agent);
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
    const act = createActApi({
        actShadowFile, actConf, actState, infra, st, config,
        embedCfgOf: () => embed.embedCfgOf(), // 同上，惰性求值避 TDZ
    });
    const hooks = createHooksApi({ infra, write, parent, wm, agent, st, ds, kRoot, ctx, config });
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
        const t0 = setTimeout(() => { void bank.runSelfCheck('timer'); }, 3 * 60 * 1000);
        const iv = setInterval(() => { void bank.runSelfCheck('timer'); }, ms);
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
            void hooks.sweepBacklog();
        }
        catch { /* 扫尾零抛出 */ } };
        const t0 = setTimeout(run, 30000);
        const iv = setInterval(run, ds.DEEP_SLEEP_CHECK_MS);
        return () => { clearTimeout(t0); clearInterval(iv); };
    }, SHORT + ': distill sweep');
    return { getDeepSleepStatus: ds.getDeepSleepStatus, runDeepSleepNow: ds.runDeepSleepNow, getConfig: ds.getConfig, runDistillNow: agent.runDistillNow };
}
//# sourceMappingURL=distill.js.map