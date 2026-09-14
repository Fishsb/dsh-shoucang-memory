import type { MemRecord } from './record-store.js';
/** 方向：我欠（owed-by-me）/ 欠我（owed-to-me）—— 双向记账的关键字段 */
export type CommitmentDirection = 'owed-by-me' | 'owed-to-me';
export type CommitmentStatus = 'pending' | 'kept' | 'broken';
export interface RelationInit {
    /** 关系主体（人/角色/项目干系人） */
    who: string;
    /** 关于他/她的事实（在意什么、期待什么、忌讳什么） */
    note: string;
    /** 信任/重要性档位（-2..2，可省） */
    level?: number;
    /** 情境键（`\n` 分隔；`ring-supply#serializeCues` 序列化，与读侧同一实现）——「在什么情境下该想起它」 */
    cues?: string;
    evidence?: string;
    at: string;
    /** 显式 id（事件重放以事件为身份权威：载荷缺字段也不改身份） */
    id?: string;
    /** 显式正文覆盖（**legacy 记录的最后手段**：老版本只把内容写在正文里、meta 无 payload 时，
     *  事件携带原始正文 ⇒ 重放仍逐字还原；payload 完整时无需使用） */
    text?: string;
}
export interface CommitmentInit {
    who: string;
    /** 承诺内容（我答应做什么 / 对方答应做什么） */
    what: string;
    direction: CommitmentDirection;
    /** 期限（ISO 日期或自由文本，可省） */
    due?: string;
    /** 情境键（见 RelationInit.cues） */
    cues?: string;
    evidence?: string;
    at: string;
    /** 显式 id（见 RelationInit.id 说明） */
    id?: string;
    /** 显式正文覆盖（见 RelationInit.text 说明） */
    text?: string;
}
export interface SettlementInit {
    status: 'kept' | 'broken';
    note?: string;
    at: string;
}
/** 记一条关系事实 */
export declare function assertRelation(records: readonly MemRecord[], r: RelationInit): {
    records: MemRecord[];
    id: string;
};
/** 开一条承诺（status=pending，进入待兑现队列） */
export declare function openCommitment(records: readonly MemRecord[], c: CommitmentInit): {
    records: MemRecord[];
    id: string;
};
/**
 * **结清承诺**（本环的核心）：pending → kept | broken。
 * 幂等：已结清的承诺**拒绝重复结清**（重复即污染兑现率）。
 */
export declare function settleCommitment(records: readonly MemRecord[], id: string, s: SettlementInit): {
    records: MemRecord[];
    ok: boolean;
    reason?: string;
};
/** 待兑现队列（pending 承诺）——「想不起来兑现」的防线；可按 who 过滤 */
export declare function openCommitments(records: readonly MemRecord[], who?: string): MemRecord[];
/** 某主体的全部关系与承诺（双向视角：我欠与欠我都在） */
export declare function relationsOf(records: readonly MemRecord[], who: string): MemRecord[];
export interface RelationCensus {
    relations: number;
    commitments: number;
    pending: number;
    kept: number;
    broken: number;
    /** 关系网规模（去重主体数） */
    entities: number;
    byWho: Record<string, number>;
}
export declare function relationCensus(records: readonly MemRecord[]): RelationCensus;
export interface TrustScore {
    who: string;
    /** 我欠的：兑现 / 未兑现 */
    mineKept: number;
    mineBroken: number;
    /** 欠我的：兑现 / 未兑现 */
    theirsKept: number;
    theirsBroken: number;
    /** 兑现率（分母为 0 时报 0，不编造） */
    mineRate: number;
    theirsRate: number;
}
/**
 * 双向兑现率（KPI，**只从记录集推导**）：把「我欠」与「欠我」分开统计。
 * 合成单一比率会丢掉方向——方向信息正是判断"这段关系健不健康"的依据。
 */
export declare function trustOf(records: readonly MemRecord[], who: string): TrustScore;
