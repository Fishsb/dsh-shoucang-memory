import { type EmbedCfg } from './vec.js';
export interface MclConfig {
    enabled: boolean;
    /** 熟悉度阈值（绝对余弦；0.65 = ACT-024 校准值：触发率 ~2%，阈上样本全部真命中） */
    familiarThreshold: number;
    /** 慢通道再引导上限（缺省 1；0 = 只注入不引导） */
    maxNudges: number;
    /** 材料硬预算（字符） */
    budgetChars: number;
    /** 指针条数 */
    topK: number;
    /** 审计开关（落 knowledgeRoot()/audit/mcl-audit.jsonl） */
    audit: boolean;
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
    steps: number;
    fast: number;
    slow: number;
    injected: number;
    nudged: number;
    lastAt: number;
    lastChannel: 'fast' | 'slow' | '';
    lastSim: number;
    sessions: number;
    tasks: number;
}
export declare function registerMcl(ctx: {
    on(event: string, handler: (payload: any, arg2?: any) => any): unknown;
    logger?: {
        info?(m: string): void;
    };
}, cfg: MclConfig, hooksIn?: Partial<MclHooks>): {
    status(): MclStatus;
};
