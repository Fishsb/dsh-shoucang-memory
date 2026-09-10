export interface TreeOp {
    action: 'rename' | 'merge';
    file: string;
    oldTitle?: string;
    newTitle?: string;
    keepTitle?: string;
    dropTitle?: string;
}
export interface TreeOpsHooks {
    audit(o: Record<string, unknown>): void;
    log(m: string): void;
}
export interface TreeOpsResult {
    applied: number;
    skipped: number;
    archived: number;
}
/**
 * 深睡 treeOps 最小通道 v1 宿主执行：模型提结构提案（rename/merge），宿主守不变量执行。
 * 全程防御式（单 op 异常仅 log 并跳过），绝不抛出；返回 {applied, skipped, archived}。
 */
export declare function applyTreeOps(memRoot: string, ops: TreeOp[], hooksIn?: TreeOpsHooks): Promise<TreeOpsResult>;
