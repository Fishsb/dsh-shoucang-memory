/** 探测域配置键（**运行时直传**；`Config` 与 `distillOptionsOf` 均按此形状消费）。 */
export interface ProbeConfigFields {
    /** 输出增长探测开关（running 无事件超时后采样转录，确认真活跃） */
    deepSleepProbe: boolean;
    /** running 状态无事件多久发起探测（缺省同 idleMs = 2700000ms 即 45min） */
    deepSleepProbeAfterMs: number;
    /** 探测采样间隔（毫秒，缺省 60 秒） */
    deepSleepProbeWindowMs: number;
    /** 每轮采样次数（缺省 3；任一次检出增长即判长任务） */
    deepSleepProbeSamples: number;
    /** 判「卡住」需连续无增长的轮数（缺省 2；首轮落 suspect，阻塞睡眠待复核） */
    deepSleepProbeConfirm: number;
    /** 证据冲突（状态活跃但连续零输出）连续轮数上限（达上限按卡住处理；治 conflict 分支活锁） */
    deepSleepProbeConflictMax: number;
    /** 探针不可用/异常时重试次数（缺省 2） */
    deepSleepProbeRetries: number;
    /** 单轮探测总时长兜底（毫秒，缺省 10 分钟，防悬挂） */
    deepSleepProbeMaxMs: number;
}
/**
 * 探测域 zod schema（**分散声明，供 `Config` 展开**）。
 * ⚠ `deepSleepProbeConflictMax` 的缺省读**注册表** `TRIGGER.deepSleepProbeConflictMax`（单一真源）；
 *   该值是「有界性」（正确性要求），不是待校准的经验值。
 */
export declare const probeConfigSchema: {
    readonly deepSleepProbe: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    readonly deepSleepProbeAfterMs: import("@deepseek-ai/schemastery").default<number, number>;
    readonly deepSleepProbeWindowMs: import("@deepseek-ai/schemastery").default<number, number>;
    readonly deepSleepProbeSamples: import("@deepseek-ai/schemastery").default<number, number>;
    readonly deepSleepProbeConfirm: import("@deepseek-ai/schemastery").default<number, number>;
    readonly deepSleepProbeConflictMax: import("@deepseek-ai/schemastery").default<number, number>;
    readonly deepSleepProbeRetries: import("@deepseek-ai/schemastery").default<number, number>;
    readonly deepSleepProbeMaxMs: import("@deepseek-ai/schemastery").default<number, number>;
};
/** 把探测域的运行时取值从 config 投影出来（`distillOptionsOf` 用；**显式映射**，防漏键）。 */
export declare const probeOptionsOf: (config: ProbeConfigFields) => ProbeConfigFields;
