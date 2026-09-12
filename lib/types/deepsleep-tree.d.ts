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
