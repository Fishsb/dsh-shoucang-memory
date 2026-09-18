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
export declare const coreName: (t: string) => string;
/** 双向包含（核心名口径）：x===y || x.includes(y) || y.includes(x) */
export declare const biContains: (a: string, b: string) => boolean;
type Section = {
    idx: number;
    level: number;
    title: string;
    end: number;
    leaf: boolean;
    body: string[];
    bodyIdx: number[];
};
/** 小节解析：标题到「下一个同层或更高层标题」之间；正文=区间内排除更深子树段的行；leaf=区间内无更深标题 */
export declare function parseSections(ls: string[]): Section[];
/** 归一化 op.file（容忍 `notes/x.md` 与 `x.md` 两种写法；禁 INDEX.md/穿越路径） */
export declare function normalizeNotesFile(f: unknown): string | null;
export declare const atomicWrite: (p: string, text: string) => boolean;
/** 既有行整理口径：空行压缩 + 末尾单换行（与 applyPrinciples/applyPointerOps/consolidateTree 一致） */
export declare const finalize: (ls: string[]) => string;
export declare const readLines: (p: string) => string[] | null;
export declare function safeAudit(hooks: TreeOpsHooks, o: Record<string, unknown>): void;
export declare function safeLog(hooks: TreeOpsHooks, m: string): void;
/**
 * 深睡 treeOps 最小通道 v1 宿主执行：模型提结构提案（rename/merge），宿主守不变量执行。
 * 全程防御式（单 op 异常仅 log 并跳过），绝不抛出；返回 {applied, skipped, archived}。
 */
export declare function applyTreeOps(memRoot: string, ops: TreeOp[], hooksIn?: TreeOpsHooks): Promise<TreeOpsResult>;
/** 标题匹配：核心名精确优先，无精确时唯一双向包含；仍歧义（>1）→ 不匹配（宁缺毋滥） */
export declare function matchSection(sections: Section[], kw: string): {
    sec: Section;
    exact: boolean;
} | null;
/**
 * **各 op 的可操作节范围（level）—— 单一事实源**。
 * ⚠ **G-22 根因**：过滤原散落四处各自手写（**merge 漏了** ⇒ 匹配并落盘 L4 `####` ⇒
 * 实证树结构破坏：整节消失 + 跨容器搬运 + 孤儿空容器）。**只给 merge 补 filter 是补丁**；
 * 本表 + `scopeOf` 收敛为唯一落点，并由 `scripts/check-treeops-scope.mjs` 机检（判因详版见该脚本头注）。
 */
declare const OP_SCOPE: {
    readonly rename: readonly [2, 3];
    readonly merge: readonly [2, 3];
    readonly splitTarget: readonly [2];
    readonly splitConflict: readonly [3];
};
/** 按 op 取节范围（**唯一 filter 落点**；口径见 `OP_SCOPE`） */
export declare const scopeOf: (sections: Section[], op: keyof typeof OP_SCOPE) => Section[];
export {};
