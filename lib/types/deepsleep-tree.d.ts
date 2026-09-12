import type { EmbedCfg } from './vec.js';
/** 树整合的全部依赖：日志 + 审计 + 嵌入配置。 */
export interface TreeDeps {
    log(m: string): void;
    audit(o: Record<string, unknown>): void;
    embedCfgOf(): EmbedCfg;
}
export declare function consolidateTree(d: TreeDeps, memRoot: string): Promise<{
    idxExact: number;
    idxSem: number;
    secMerged: number;
    lineDedup: number;
    archived: number;
}>;
/** 核心名：去掉标题尾部「（20xx-…）」日期括号（与 memory_write_gate.mjs 同口径）。 */
export declare const coreName: (t: string) => string;
export declare const biContains: (a: string, b: string) => boolean;
/** 单行索引指针改写（原为 consolidateTree 内闭包，提到模块级以降单函数跨度）。 */
export declare const rewriteRowPointers: (raw: string, nf: string, finals: Array<{
    old: string;
    next: string;
}>) => string | null;
