/** 静默判据的证据来源（窄传；不引入新状态） */
export interface QuiescenceDeps {
    ctx: any;
    hasActiveSubagents(sid: string): boolean;
}
export type Quiescence = 'quiet' | 'busy' | 'unknown';
/**
 * 会话是否**静默**（= 无在途工作）——「空闲」的正确定义。
 *
 * 为什么不用「最后一次 turn/end 之后 N 分钟」当"空闲"：自主轮次（子代理交活唤醒宿主、goal 轮、
 *   auto-continue 续跑）**同样产生 `turn/end(completed)`**（真机实测：`308db868` 18 轮里 17 轮
 *   prompt 为空、`69471309` 80/122、`6be5ac2e` 71/100），故"事件计数"不等于"用户停手"。
 * 本判据的三态里 **`unknown` 不是 busy**：取不到证据**不阻断**（按时间兜底），但调用方**必须落审计**
 *   （仓内纪律：静默失效最可怕；`unknown` 要与 `quiet` 可分辨）。
 */
export declare const quiescenceOf: (d: QuiescenceDeps, agent: any) => {
    state: Quiescence;
    why: string;
};
/** 会话**最后一次 `turn/end` 的毫秒时间戳**（0 = 取不到）——宽限期的**持久来源**。
 *  为什么不用内存 `sleep.sessions.lastEndAt`：它是每实例新建的 Map，热重载即清零
 *  （这正是「重载后 30s 必蒸」的机制）。会话日志本身是持久事实源，永远可推导。 */
export declare const lastTurnEndMsOf: (agent: any) => number;
export interface IngestAdmissionInput {
    /** 水位基线（已消费边界） */
    lastSeq: number;
    /** live 扫描边界 */
    maxSeq: number;
    /** 距最后一次轮次结束的毫秒（null = 取不到） */
    sinceLastEndMs: number | null;
    /** 空闲唤醒阈值 */
    idleWakeMs: number;
    /** 静默判据三态 */
    quiet: Quiescence;
    /** 跨实例 claim 是否在途 */
    claimHeld: boolean;
    /** G-20 快照不可用连续轮数 / 熔断阈值 */
    snapshotStreak: number;
    circuitBreakN: number;
    /** 手动触发（面板「立即蒸馏」）：**只**豁免宽限期，其余约束照旧 */
    manual?: boolean;
}
export interface IngestAdmission {
    run: boolean;
    reason: string;
    /** 准入输入摘要（落审计用；`unknown` 必须可分辨） */
    evidence: string;
}
/**
 * 准入决策表（单一实现）。**顺序即优先级**：便宜的判定在前，且"无增量"永远先短路。
 * 判据语义：
 *   · `no-increment`：`maxSeq <= lastSeq` ⇒ 没有可蒸的东西（最便宜，先判）
 *   · `snapshot-unavailable-circuit-break`：G-20 熔断（连续 N 轮拿不到快照 ⇒ 不再整窗重蒸烧 LLM）
 *   · `claim-held`：其他实例接管中（跨实例防双蒸）
 *   · `not-quiet`：会话**不静默**（在途：子代理/非 idle/inbox 排队）⇒ 让位，等下轮
 *   · `grace-period`：静默但距上次轮次结束不足 `idleWakeMs`（**仅手动触发可豁免**）
 *   · `ok` / `manual` / `unknown-quiescence-fallback`（三态里的 unknown：按时间兜底，**落审计**不静默）
 */
export declare const planIngestAdmission: (i: IngestAdmissionInput) => IngestAdmission;
