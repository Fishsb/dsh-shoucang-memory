import { type RecallRow } from './targets.js';
import { type EmbedCfg } from './vec.js';
import { type SupplyLedger } from './supply-ledger.js';
export interface MclConfig {
    enabled: boolean;
    /** 熟悉度阈值（绝对余弦；缺省 0.58 = 2026-09-11 按 193 条实测样本重校准，见 criteria.json#surface.mcl） */
    familiarThreshold: number;
    /** 慢通道再引导上限（缺省 1；0 = 只注入不引导） */
    maxNudges: number;
    /** 材料硬预算（字符） */
    budgetChars: number;
    /** 指针条数 */
    topK: number;
    /** 审计开关（落 knowledgeRoot()/audit/mcl-audit.jsonl） */
    audit: boolean;
    /**
     * **P2b（2026-09-13）**：慢通道材料是否改走 **systemPrompt 段**（缺省 false ＝ 现状零行为变化）。
     * 关时材料以「插一条 user 消息」进转录（旧行为）；开时材料只挂 systemPrompt 块、**不进消息面**
     * （消息面仅保留 `nudge`——方案档 §3.3 明确允许的唯一一项）。
     * ⚠ 若 `systemPrompt.context` 不可用，注册期会把本字段**回落为 false** 并记日志（宁走旧路，不可静默失效）。
     */
    materialInSystem: boolean;
    /** 召回/嵌入配置（复用 vec 通道，与 scheduler 同源） */
    embed: EmbedCfg;
}
export interface MclHooks {
    audit(o: Record<string, unknown>): void;
    log(msg: string): void;
}
export interface MclStatus {
    enabled: boolean;
    familiarThreshold: number;
    maxNudges: number;
    budgetChars: number;
    /**
     * P2b（2026-09-13）：慢通道材料的**实际去向**——true=挂 systemPrompt 段（消息面零插入）；
     * false=插消息面。这是**解析后**的值：`systemPrompt` 能力不可用时注册期会回落为 false，
     * 故读它可当场判断开关是否真的生效（不是读了配置就算数）。
     */
    materialInSystem: boolean;
    /** P2b：systemPrompt 块被宿主渲染的次数（0 = 块没被调用；>0 = 通道在工作） */
    sysBlockCalls: number;
    /** 其中**返回了材料**的次数（>0 ⇒ 材料真的进得了注入面） */
    sysBlockNonEmpty: number;
    /** 末次返回的材料长度 */
    sysBlockLastChars: number;
    /** **宿主传入 context 的键名**（诊断用：确认块渲染时拿得到什么） */
    sysBlockCtxKeys: string;
    /** 末次从 context 解出的会话 id（`(未解出)` = 形状不符 ⇒ 材料取不到） */
    sysBlockLastSid: string;
    /** **时序轨迹**（最近 14 条 `t|tag|sid8|len`）：`cap` 捕获用户消息 · `set` 写材料 · `ren` 块渲染 */
    trace: string[];
    steps: number;
    fast: number;
    slow: number;
    injected: number;
    /** P1（2026-09-13）：因「本会话已注入过」而省下的候选行数 —— 增量注入的证据面 */
    dupSkipped: number;
    nudged: number;
    lastAt: number;
    lastChannel: 'fast' | 'slow' | '';
    lastSim: number;
    sessions: number;
    tasks: number;
    /** P1 会话级台账规模（跨轮累积；轮级 state 的重置不影响它） */
    ledgerSessions: number;
    ledgerRows: number;
}
interface SessMcl {
    nudges: number;
    topics: string[];
    /** 每行材料的「引用信号词元」集合（见 rowSignals；judge 的容错匹配用，2026-09-11 缺陷3） */
    signals: string[][];
    channel: 'fast' | 'slow' | '';
    sim: number;
    lateLogged?: boolean;
    /** P2b：本轮材料正文（供 systemPrompt 块渲染；轮级重置随 state 一并清） */
    materialText?: string;
    /** 材料落在第几步（同一材料的当步不判合规） */
    materialStep?: number;
    /** S4/D1（2026-09-14）：**连续零增益计数** —— 材料连投却始终未被引用即"线索变弱"，达阈值出换向信号 */
    zeroGain?: number;
    /** **E-05（2026-09-21）判定在飞标志** —— 与 `channel` 合成**原子幂等闸**（`decideTurn` 头，
     *  检查与置位之间无 await）。缺了它，两条入口会在两个 await 之间同时越过闸门 ⇒ 同一轮判两次。 */
    deciding?: boolean;
}
/** 消息工厂（DSH 官方 `createUserMessage` 动态加载；宿主/装配副本可解析，仓内无该包故不入静态 import → 手构兜底） */
type AnyMsg = {
    id: string;
    role: 'user';
    content: Array<{
        type: 'text';
        text: string;
    }>;
    source: Record<string, unknown>;
};
/**
 * **主题词回引判定**（缺陷3 修复）：三信号「或」——① 主题词全串 ② 主题词前缀（旧口径）③ 信号词元覆盖率
 *   （≥minHits 个词元且覆盖率 ≥ratio）：容忍转述/省字，但要求**足够密度**，不能把"提了一句相关词"算命中。
 * ⚠ IR1 附册 F2（2026-09-18）**命名诚实化**：本判据测的是「上一步是否**回引材料主题词**」（词面代理，
 *   真机 true=0/3119）⇒ 审计键 `compliant` → **`topicEcho`**；真实收益信号已换源 `audit/yield-rounds.jsonl`。
 * ⚠ round 8（2026-09-20）：实现在**模块级**（仓内约定；原为 `registerMcl` 内联箭头函数，接线后撞 I1 棘轮
 *   `audit-wiring` ≤120 行）。同时**接通登记表**：第三信号的两个参数原为裸字面量 `2` / `0.6`，
 *   而注册表把它们登记成 **`mcl.fastGate`** —— **名实不符**（它们**不是**快通道门；快通道门 =
 *   `sim >= familiarThreshold && hasHighConf`，见 `decideTurn`）。⇒ 登记项已改名 `mcl.topicEchoGate`。
 */
export declare function judgeTopicEcho(text: string, topics: string[], signals?: string[][]): boolean;
export declare function registerMcl(ctx: {
    on(event: string, handler: (payload: any, arg2?: any) => any): unknown;
    logger?: {
        info?(m: string): void;
    };
}, cfg: MclConfig, hooksIn?: Partial<MclHooks>): {
    status(): MclStatus;
};
/** `agent/pre-step` 处理器（自 registerMcl 提出；registerMcl 因此满足 I1 的 120 行上限）。
 *  依赖 **7 项**（收尾前 9 项：把注入面三个纯函数收进 `tools` 一组），均为装配期构造的会话态/工具；
 *  依赖显式传递，不再靠闭包隐式可见。
 *  口径：终极方案 §五「任一实现函数的依赖宽度 ≤ 8」+ AGENTS.md「分组后每组 ≤8」。
 *  为何是收 `material/judge/mkMsg` 而不是会话态：前者全函数仅 5 次引用、后者 15 次——
 *  收组要动引用面最小的一侧，别为凑指标去翻热路径。 */
export interface PreStepDeps {
    /** registerMcl 的配置形参（不是 body 里的 const ⇒ 依赖测绘易漏） */
    cfg: MclConfig;
    counters: {
        steps: number;
        fast: number;
        slow: number;
        injected: number;
        dupSkipped: number;
        nudged: number;
        lastAt: number;
        lastChannel: '' | 'fast' | 'slow';
        lastSim: number;
        trace?: string[];
    };
    state: Map<string, SessMcl>;
    /** P1：会话级注入台账（跨轮累积；与轮级 state 生命周期不同） */
    ledger: SupplyLedger;
    taskText: Map<string, string>;
    /** 该会话**任务文本到达时刻**（判定门用） */
    taskTextAt: Map<string, number>;
    /** 该会话**上次 pre-step 时刻**（判定门用） */
    lastStepAt: Map<string, number>;
    ready: Set<string>;
    hooks: MclHooks;
    /** 注入面三件：材料装配 / 合规判定 / 消息构造 */
    tools: {
        material(rows: RecallRow[], budget: number): {
            text: string;
            topics: string[];
            signals: string[][];
        };
        judge(text: string, topics: string[], signals?: string[][]): boolean;
        mkMsg(text: string): AnyMsg;
    };
}
/**
 * **通道判定（单一实现 · 两处触发）** —— 2026-09-13 §70 层二修复。
 *
 * 为什么需要"两处触发"：**块在请求装配时渲染，早于本步的 `pre-step`**（实测：`injected=436 viaSystem=1`
 * 而 `sysBlockNonEmpty=0`，21 次渲染全空）⇒ 若材料只在 `pre-step` 里写，块**永远晚一步**、实际取不到。
 * 故：① **消息到达时**（`session/event`，本可 async）先判一次 ⇒ 当轮**首次渲染**即可取到材料；
 *     ② `pre-step` 仍调用同一函数兜底（消息面注入也在此完成）。靠 `st.channel` **幂等**，不会判两次。
 */
export interface DecideDeps {
    cfg: PreStepDeps['cfg'];
    counters: PreStepDeps['counters'];
    state: Map<string, SessMcl>;
    taskText: Map<string, string>;
    ledger: SupplyLedger;
    hooks: MclHooks;
    tools: PreStepDeps['tools'];
}
export interface DecideResult {
    decided: boolean;
    channel: '' | 'fast' | 'slow';
    material: {
        text: string;
        topics: string[];
        signals: string[][];
    } | null;
    fresh: RecallRow | null;
    dupSkipped: number;
    hit: string;
    st: SessMcl;
}
export declare function decideTurn(d: DecideDeps, sid: string, step: number): Promise<DecideResult>;
export declare function handlePreStep(payload: any, next: () => Promise<any>, dep: PreStepDeps): Promise<any>;
export {};
