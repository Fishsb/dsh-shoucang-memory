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
/**
 * 结算执行者（**可追溯**）：是模型判的、规则判的、用户说的，还是 CLI 手敲的。
 * 册零（2026-09-20）新增——此前 `kept/broken` 一旦落库即**不可复核**（无从分辨谁判的）。
 */
export type SettlementBy = 'user' | 'rule' | 'agent-proposal' | 'cli';
/** 事件重放专用入参（`ring-events#replayEvents` 唯一使用者）：按**载荷里真有的键**重建。 */
export interface SettlementReplay {
    /**
     * **重放专用标记**：本次调用是**重建历史状态**，不是一次结算裁决 ⇒ 跳过证据门。
     *
     * ⚠ 为什么必须有这个位（不给就会**改历史 / 对账恒红**）：
     *   · 历史事件的载荷里**没有** `evidence`（本轮才加的字段）⇒ 若不给豁免，全库既有 1022 条
     *     事件将**再也重放不出来**；
     *   · 但重放也必须**逐字重建 store 的 `meta`**（`reconcileRing` 比 `meta` 全等）——
     *     存量 11 条已结清记录的 `meta` 里**本来就没有** `evidence`/`settledBy`。
     *   ⇒ 故 `replay` 的语义是「**跳过证据门，且只写载荷里真有的键**」：
     *     缺字段的旧事件重建出缺字段的记录（与实际 store 一致），
     *     带字段的新事件照常重建出带字段的记录（新老并存，各自对账都成立）。
     */
    replay: true;
    status: 'kept' | 'broken';
    /** 载荷里有才传（缺省 = 该事件无此字段 ⇒ 重建出的记录也不该有） */
    evidence?: string;
    settledBy?: SettlementBy;
    note?: string;
    at: string;
}
/**
 * 结算入参。**两态判别式**（册零 · 2026-09-20）：
 *   · **活路径**（clawback CLI / 提案执行 / 规则）—— `evidence` **必填**（tsc 即强制，
 *     这就是方案档 V0.1「构造缺 `evidence` 的结算调用 ⇒ `npm run typecheck` 必须报错」的落地形态）；
 *   · **重放路径** —— 见 `SettlementReplay`（跳过证据门，按载荷重建）。
 * 两态分开写而不是「一个类型 + 可选字段」：后者会让活路径**也能**不传证据，
 *   而那正是本册要堵的口子（"结必有证"必须是**编译期**约束，不是运行时自觉）。
 */
export type SettlementInit = {
    status: 'kept' | 'broken';
    /** **证据串（必填）**：凭什么结清 —— 会话里已发生的交付 / 复验 / 用户的一句话。 */
    evidence: string;
    /** 执行者（可省：不传即不写该键）。 */
    settledBy?: SettlementBy;
    note?: string;
    at: string;
} | SettlementReplay;
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
 *
 * 册一（2026-09-20）**结必有证**：空/空白 `evidence` 一律拒绝（`{ok:false}`），且证据与执行者
 *   写进 `meta.evidence` / `meta.settledBy`（**只增字段**，不动既有 `note`）。
 *   判因：`kept/broken` 是 `trustOf` 的唯一分子/分母来源 ⇒ 若不在这里堵，"兑现率虚高"
 *   就只能靠人自觉——而本仓的纪律是**判据可机检**。
 *
 * ⚠ **事件重放的豁免**（关键，不改历史）：见 `SettlementInit.replay` 的详细说明——
 *   `replay:true` ⇒ 跳过证据门，且**只写载荷里真有的键**（缺字段的旧事件重建出缺字段的记录，
 *   与存量 store 逐字一致；带字段的新事件照常重建）。
 *   「这条结清有没有证据」的判法因此是：**`meta.evidence` 存在 ⇒ 新式（有证据）；缺失 ⇒ 存量无据**。
 *   `trustOf` 的 `evidenceMissing` 正是这么算的（册四）——不需要凭空补字段也能如实显示。
 */
export declare function settleCommitment(records: readonly MemRecord[], id: string, s: SettlementInit): {
    records: MemRecord[];
    ok: boolean;
    reason?: string;
};
/** 待兑现队列（pending 承诺）——「想不起来兑现」的防线；可按 who 过滤 */
export declare function openCommitments(records: readonly MemRecord[], who?: string): MemRecord[];
/**
 * **待裁决队列**（册三 · 2026-09-20 · `docs/promise-settlement-plan.md` §6）：
 * `due` 已逾期（复用 `dueSoon` 的 **7 天窗**，口径唯一）**且仍 pending** 的承诺。
 *
 * **明确不做**：**不自动判 `broken`**。理由（方案档原文）：逾期只证明"时间到了"，
 *   不证明"没做"——自动 broken 会把"其实已交付、只是没回写"的条目判成不兑现，
 *   **直接污染 `trustOf`**（与册一"结必有证"直接冲突）。
 *   ⇒ 本函数是**纯读**（零写入、不改状态），产出交人工/面板裁决。
 *
 * `overdue` 字段（**只增**）：`true` = 已过期，`false` = 7 天内到期（"临近"，同 `dueSoon` 语义）。
 * 排序：**过期在前**（最该被看见）→ 其次按 `due` 升序（越早到期越急）→ 无 `due`/坏时间戳不入选。
 */
export declare function overdueCommitments(records: readonly MemRecord[], at: string): Array<{
    record: MemRecord;
    overdue: boolean;
    due: string;
}>;
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
    minePending: number;
    theirsPending: number;
    mineOverdue: number;
    theirsOverdue: number;
    mineEvidenceMissing: number;
    theirsEvidenceMissing: number;
}
/**
 * 双向兑现率（KPI，**只从记录集推导**）：把「我欠」与「欠我」分开统计。
 * 合成单一比率会丢掉方向——方向信息正是判断"这段关系健不健康"的依据。
 *
 * ⚠ **分母口径写死且不许漂移**（册四）：`rate = kept/(kept+broken)`，**pending 不进分母**。
 *   本件只**加字段**，不做算术改动（`test-relation-ring` 的既有断言逐字比对）。
 * `overdueAt` 为**可选**入参：给了才算逾期字段（缺省 0 ⇒ 与旧行为逐字等价，调用方零迁移）。
 */
export declare function trustOf(records: readonly MemRecord[], who: string, overdueAt?: string): TrustScore;
