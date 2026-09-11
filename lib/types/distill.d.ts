export interface DistillChunk {
    startSeq: number;
    endSeq: number;
    text: string;
}
export interface DistillChunks {
    chunks: DistillChunk[];
    maxSeq: number;
}
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
export declare function buildEventChunks(agent: any, lastSeq: number, chunkChars?: number, eventsOf?: any[]): DistillChunks;
type AppContext = {
    tools: {
        register(tool: unknown): unknown;
    };
    llm: any;
    subagents: {
        start(name: string, request: any): Promise<any>;
    };
    agents: {
        get(id: string): any;
        list(): any[];
        roots(): any[];
        create(options: any): Promise<any>;
    };
    logger?: {
        info?(msg: string): void;
    };
    on(event: string, handler: (arg: any, arg2?: any) => void): unknown;
    effect(fn: () => any, key?: string): unknown;
};
export interface DistillConfig {
    nodeBin: string;
    idleWakeMs: number;
    minTurnChars: number;
    distillPrescan: boolean;
    prescanMinChars?: number;
    distillPrompt: string;
    llmProvider: string;
    llmModel: string;
    distillProvider: string;
    distillModel: string;
    sleepProvider: string;
    sleepModel: string;
    enableDeepSleep: boolean;
    enableRemPass?: boolean;
    deepSleepIdleMs: number;
    deepSleepProbe: boolean;
    deepSleepProbeAfterMs: number;
    deepSleepProbeWindowMs: number;
    deepSleepProbeSamples: number;
    deepSleepProbeConfirm: number;
    deepSleepDaemonParent: boolean;
    deepSleepProbeRetries: number;
    deepSleepProbeMaxMs: number;
    activationShadow?: boolean;
    activationPrefetch?: boolean;
    activationTOn?: number;
    activationTOff?: number;
    activationCooldownSteps?: number;
    activationTopK?: number;
    capAgent?: number;
    capUser?: number;
    capMemory?: number;
    embedEnabled?: boolean;
    embedBaseUrl?: string;
    embedModel?: string;
    embedApiKeyEnv?: string;
    recallFusion?: string;
    bankGit?: boolean;
    injectProfileRows?: number;
    scoreWeights?: string;
    shadowScore?: boolean;
    maturationEnforce?: boolean;
    perItemGate?: boolean;
    selfCheck?: boolean;
    selfCheckRepo?: string;
    selfCheckAutoRollback?: boolean;
    selfCheckIntervalHours?: number;
    activityWarmDays?: number;
    activityColdDays?: number;
    activityArchiveDays?: number;
    activityHotHits?: number;
    recallColdFactorPercent?: number;
}
/**
 * 会话活跃状态机（Session Activity FSM）——深度睡眠「是否算停滞」的唯一判据源。
 *
 * 状态迁移：
 *   (新会话/任意事件) → RUNNING ──turn/end(completed)──► ENDED（开始停滞计时）
 *                          │                                  │
 *        无事件 ≥ probeAfterMs│                                  │ 所有会话停滞 ≥ idleMs
 *                          ▼                                    ▼
 *                    PROBING（采样 transcript 两次，比对 mtime/size）──► 触发深度睡眠
 *              ┌───────────┬────────────┬─────────────┬────────────┐
 *     输出在增长│ 无增长+会话还在│ 无增长+会话消失│ 探针不可用/异常│
 *              ▼           ▼            ▼             ▼
 *          RUNNING      SUSPECT      ENDED          ENDED
 *        (正常长任务)  (待复核，阻塞)  (异常退出)   (无法确认，正常睡)
 *                          │ 连续 confirm 轮无增长（或状态活跃但无增长=证据冲突）
 *                          ▼
 *                       STALLED（已确认卡住，不阻塞）
 *
 * 用户拍板口径（2026-09-08）：**只有确认「长线任务正在推进」才拦住睡眠**；其余（卡住/异常退出/探针不可用/
 * 探测异常）一律按停滞处理 → 正常睡眠（停滞计时沿用最后事件时刻，不再刷新成 now，否则会永远睡不着）。
 * 仅在采样窗口内「探测未决」时跳过本轮（最多延后一个巡检周期，10min）。
 */
type SessState = 'running' | 'ended' | 'probing' | 'suspect' | 'stalled';
/** 深度睡眠状态机快照（UI 已接线：deepsleep-share.ts 惰性桥接 → panel `GET /deepsleep` → client.js「深度睡眠」视图） */
export interface DeepSleepStatus {
    enabled: boolean;
    idleMs: number;
    probeAfterMs: number;
    lastActivityAt: number;
    lastDeepSleepAt: number;
    running: number;
    ended: number;
    probing: number;
    suspect: number;
    stalled: number;
    nextEligibleAt: number;
    sessions: {
        sid: string;
        state: SessState;
        lastEventAt: number;
        lastEndAt: number;
        probeResult?: string;
    }[];
}
export declare const DEFAULT_DISTILL_PROMPT: string;
export declare const DEEP_SLEEP_PROMPT: string;
export declare const CANDIDATE_NOISE: RegExp[];
/** 文本是否宿主注入样板（见上：候选区与采样共用的单一实现） */
export declare const isNoiseIntent: (s: string) => boolean;
/**
 * 深睡本轮是否算「已消化」（决定水位推进 or 回滚）——**单一实现**，供 runDeepSleep 与单测共用。
 *
 * 2026-09-11 实修（静默丢料根因）：原判据只按 `stop === 'completed' && out`，从不检查候选是否**真正落地**。
 * 当代理跑完但门禁把候选行**全数拒收**（attempted>0 && added===0，如 gate=all-rejected /
 * maturation-rejected / 尾部总门失败）时仍判 done → 调用方推进水位 → 被拒痕迹永久划出窗口 → 静默丢失。
 * 审计实证 2 轮（08:32:23.997Z attempted=3/added=0、08:48:10.129Z attempted=1/added=0）共丢 4 条候选行。
 *
 * 判定口径：
 *  - `stop !== 'completed' || !out` → 未完成 / 无产出 ⇒ failed（回滚重试，含 stop=error/aborted、JSON 解析失败）。
 *  - `app.gate === 'write_gate 未就位'` → 门禁脚本缺席（applyPrinciples 早返回，attempted 恰为 0）属
 *    **基础设施失败**，不得因 attempted===0 误判 done ⇒ failed。
 *  - `app.added > 0` → 有落地 ⇒ done。
 *  - `app.attempted === 0` → 代理本就无新原则/路径提案（纯 profileOps/pointerOps/treeOps/forgetOps 轮或真·空轮）
 *    ⇒ done（回滚会导致同一批痕迹**无限重处理**，必须排除）。
 *  - `attempted>0 && added===0` → 100% 拒收 = 材料损失 ⇒ failed（水位回滚、同批下轮重试）。
 */
export declare const COMMIT_FAILED_GATE = "\u843D\u76D8\u5F02\u5E38";
export declare const deepSleepLanded: (stop: unknown, out: unknown, app: {
    attempted: number;
    added: number;
    gate: string;
}) => boolean;
export declare const deepSleepReplayable: (o: {
    kind?: unknown;
    error?: unknown;
    stop?: unknown;
    result?: unknown;
    landed?: unknown;
}) => boolean;
export declare const commitPrinciples: (tmpPath: string, targetPath: string) => {
    ok: boolean;
    err?: string;
};
export declare const DISCARD_SNAPSHOT_CB_N = 3;
/**
 * 写方决策表（单测直接驱动）：① maxSeq<=0 ⇒ 不写（禁写 0）；② maxSeq < prevSeq ⇒ 不写（禁写回退值）；③ 否则写。
 * `snapshotUnavailable` 是**熔断计数的唯一推进条件**（G-20 二修，cody 2026-09-12 指出）：
 *   只有「快照真的拿不到」才算一轮；「快照正常但序号空间重排」**不计**（它不烧 LLM，也不是故障，
 *   且读方已按语义 B 判为「保持全量」——若让它推进计数，连续 3 轮零写入就会撞上熔断被跳过，
 *   与语义 B「要重蒸」直接冲突 ⇒ 会话变「永久不蒸」）。
 */
export declare const planDiscardWrite: (maxSeq: number, prevSeq: number, consecutiveUnavailable: number) => {
    write: boolean;
    circuitBroken: boolean;
    snapshotUnavailable: boolean;
    reason: string;
};
/**
 * 读方决策表（G-20 补正的**主修点**）：双证失效后是「降级到当前 live 边界」还是「全量重蒸」。
 * 为何读方才是主修：**回退 100% 由读方决定**——旧码四个作废分支全部 `return null`，而调用方是
 *   `const lastSeq = baseline ? baseline.lastSeq : 0`，null ⇒ lastSeq=0 ⇒ **整窗重蒸**。写方写什么都与回退无关。
 *   实证（Cody 实测）：restartFrom = 114654 / 811483 / 339724 三条健康边界值写进去了，下一轮仍从 7~8 开始。
 * 判据：`maxSeq >= prevSeq` ⇒ 同一（或已增长的）seq 空间 ⇒ 跳到当前边界（下方注释 :662-668 声明的**语义 A**，
 *   是代码自己选过的语义）；`maxSeq < prevSeq` ⇒ 序号空间已重排/缩小，旧边界不可寻址 ⇒ **保持全量**（语义 B，
 *   此情形新空间通常只有几百条，便宜）。B 才是违背声明的实现，故按 A 修不需要用户拍板。
 */
export declare const planDegradedBaseline: (maxSeq: number, prevSeq: number) => {
    degrade: boolean;
    reason: string;
};
export interface DiscardWatermarkDeps {
    writeWatermark(sid: string, lastSeq: number, agent: any): void;
    audit(o: Record<string, unknown>): void;
    log(m: string): void;
    versionOf?(agent: any): number | undefined;
}
/**
 * 水位作废收尾的可单测驱动（`discardWatermark` 是闭包内 const，无 export，单测到不了；与 commitPrinciples 同手法）。
 * 返回 `wrote=false` 表示**未写水位**（快照不可用），读侧语义等价于「无水位」——绝不再写 lastSeq=0 的行。
 */
export declare const runDiscardWatermark: (sid: string, reason: string, agent: any, wm: any, consecutiveUnavailable: number, deps: DiscardWatermarkDeps) => {
    wrote: boolean;
    circuitBroken: boolean;
    reason: string;
    streak: number;
    maxSeq: number;
};
/** 水位基线：`degraded=false` = 双证可信；`degraded=true` = 降级基线（跳到当前 live 边界，非可信但**不回退到 0**）。 */
export interface WmBaseline {
    lastSeq: number;
    degraded: boolean;
    reason: string;
    formatVersion?: number;
    fp?: string;
}
export interface BaselineDeps {
    /** 返回本轮作废收尾后的 live 边界（maxSeq）与是否落了水位 */
    discard(sid: string, reason: string, agent: any, wm: any): {
        maxSeq: number;
        wrote: boolean;
    };
    versionOf(agent: any): number | undefined;
    fingerprintAt(agent: any, seq: number): string | null;
}
/**
 * 读方可单测驱动（G-20 补正主修点；`resolveWatermark` 是闭包内 const，无 export，与 commitPrinciples 同手法）。
 * 返回 null 仍表示「无基线 / 需全量」——但**只在真正需要全量时**（水位缺失、seq 空间回退、快照不可用）。
 * 关键不变量：双证失效且 live 边界未回退时，**不得返回 null**（旧码返回 null ⇒ 调用方把 lastSeq 打成 0 ⇒ 整窗重蒸）。
 */
export declare const resolveWatermarkBaseline: (sid: string, wm: any, agent: any, deps: BaselineDeps) => WmBaseline | null;
export declare function registerDistill(ctx: AppContext, config: DistillConfig): {
    getDeepSleepStatus: () => DeepSleepStatus;
    runDeepSleepNow: () => Promise<{
        ok: boolean;
        error?: string;
        result?: 'done' | 'failed' | 'no-traces';
    }>;
    getConfig: () => {
        enableDeepSleep: boolean;
        deepSleepIdleMs: number;
        deepSleepProbe: boolean;
        deepSleepProbeAfterMs: number;
        deepSleepProbeWindowMs: number;
    };
    runDistillNow: () => Promise<{
        ok: boolean;
        sessions: number;
        note?: string;
    }>;
};
export {};
