/** 每轮收敛配额（与 `consolidate.demote.archive.maxPerRun` 同法；**单一常量**，勿散落字面量）。 */
export declare const CONVERGE_MAX_PER_RUN = 3;
/** 一条收敛提案（模型产出；宿主只校验，不生成）。 */
export interface ConvergeOp {
    file: string;
    coarse: string;
    fine: string;
}
export interface ConvergeResult {
    applied: number;
    skipped: number;
    tried: number;
    archived: number;
    reasons: string[];
}
/**
 * 应用收敛提案。**纯 IO、无 LLM**：只做校验 + 移除 + 归档（幂等：同一条重复提交第二次即 `skipped`）。
 * @param memRoot 记忆库根
 * @param ops     模型给出的收敛提案
 * @param hooks   审计/日志注入（留痕；缺省静默，便于单测）
 */
export declare function applyConvergeOps(memRoot: string, ops: ConvergeOp[], hooks?: {
    audit?: (o: Record<string, unknown>) => void;
    log?: (m: string) => void;
}): Promise<ConvergeResult>;
