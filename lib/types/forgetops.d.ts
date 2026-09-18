import type { TreeOpsHooks } from './treeops.js';
export interface ForgetOp {
    action: 'archive' | 'keep';
    file: string;
    section: string;
    reason?: string;
    /** P2（审查项）：索引已不再引用的孤儿条目——仅标注入审计，不改变守卫判定 */
    orphan?: boolean;
}
/** 小节存在性（**S1R 2026-09-19：口径收敛到单一实现 `section-ref`**）：
 *  二值签名保持不变（`exists` 才为真 ⇒ 既有调用点逐例行为不变），
 *  但「同名歧义」现在有独立三态可消费（`resolveSection(...).state === 'ambiguous'`），不再折成"不存在"。 */
export declare function sectionExists(memRoot: string, file: string, section: string): boolean;
export declare function applyForgetOps(memRoot: string, ops: ForgetOp[], hooksIn?: TreeOpsHooks): Promise<{
    archived: number;
    kept: number;
    skipped: number;
}>;
