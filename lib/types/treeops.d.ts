export interface TreeOp {
    action: 'rename' | 'merge' | 'split';
    file: string;
    oldTitle?: string;
    newTitle?: string;
    keepTitle?: string;
    dropTitle?: string;
    /** split：目标小节标题（v2 仅支持叶子 `##`） */
    title?: string;
    /** split：子节列表（`title`=子节名，`start`=该子节首行原文，逐字取自材料） */
    parts?: Array<{
        title: string;
        start: string;
    }>;
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
export interface ForgetOp {
    action: 'archive' | 'keep';
    file: string;
    section: string;
    reason?: string;
    /** P2（审查项）：索引已不再引用的孤儿条目——仅标注入审计，不改变守卫判定 */
    orphan?: boolean;
}
/** 小节存在性（口径与 matchSection 同源，避免另立一套）：供材料侧剔除悬空候选（R2 审查项） */
export declare function sectionExists(memRoot: string, file: string, section: string): boolean;
export declare function applyForgetOps(memRoot: string, ops: ForgetOp[], hooksIn?: TreeOpsHooks): Promise<{
    archived: number;
    kept: number;
    skipped: number;
}>;
