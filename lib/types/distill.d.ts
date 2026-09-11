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
