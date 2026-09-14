import { type AssocProposal } from './association-propose.js';
import { type EmbedCfg } from './vec.js';
export interface AssocSupply {
    /** 切出的小节数 */
    sections: number;
    /** 成功嵌入的小节数 */
    embedded: number;
    proposals: AssocProposal[];
    /** 空结果的原因（**可读、可判断**；有候选时为 undefined） */
    reason?: string;
}
export interface AssocSupplyOpts {
    minSim?: number;
    maxShared?: number;
    topN?: number;
    /** 单批嵌入条数（本地端点过大不划算；缺省 32） */
    batch?: number;
}
export declare function supplyAssociations(root: string, embed: EmbedCfg, opts?: AssocSupplyOpts): Promise<AssocSupply>;
/** 把候选渲染成给**模型读的文本块**（工具与深睡共用同一版式 ⇒ 口径一致）。 */
export declare function renderAssocBlock(s: AssocSupply): string;
