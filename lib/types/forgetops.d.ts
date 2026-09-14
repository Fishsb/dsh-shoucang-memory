import type { TreeOpsHooks } from './treeops.js';
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
