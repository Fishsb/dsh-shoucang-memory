/** 一条失效指令。**目标定位二选一**：优先 `targetId`（精确），否则 `targetText`（逐字，须唯一）。 */
export interface SupersedeOp {
    /** 目标记录 id（精确命中；与 `targetText` 同给时**以 id 为准**） */
    targetId?: string;
    /** 目标记录正文（**逐字**匹配；0 命中 ⇒ 陈旧，多命中 ⇒ 歧义 ⇒ 均拒） */
    targetText?: string;
    /** 因何失效（人读；进 `meta.staleNote`） */
    note?: string;
    /** 被谁取代（记录 id 或一句话；进 `meta.supersededBy`）。**不得编造** —— 定不下就不填。 */
    by?: string;
}
export interface SupersedeApplyDeps {
    /** 记忆库根（`memoryLibRoot()`） */
    root: string;
    /** 判定时刻（**必填**：不吃隐式 now，否则结果不可复现 —— 与 `buildCandidates`/`ringCandidates` 同纪律） */
    at: string;
    log(m: string): void;
    audit(o: Record<string, unknown>): void;
}
export interface SupersedeVerdict {
    /** 命中的目标 id（未命中为空串） */
    targetId: string;
    verdict: 'applied' | 'skipped';
    reason: string;
}
export interface SupersedeApplyResult {
    /** 是否真的执行（开关关闭时 false ⇒ 零写入、零留档、零审计） */
    ran: boolean;
    applied: number;
    skipped: number;
    /** 留档条数（**成功留档**才计；留档失败 ⇒ 该条被拒改 ⇒ 不计） */
    archived: number;
    reasons: string[];
    /** 逐条裁决（**可核验**：审计与测试都读它，不靠日志猜） */
    verdicts: SupersedeVerdict[];
    ok: boolean;
}
/** 留档目录（每轮一个文件，一行一记录原文）。 */
export declare const supersedeArchiveDirOf: (root: string) => string;
/**
 * 执行一批失效指令。**fail-closed**：`enabled !== true` ⇒ 零写入、零留档、零审计。
 *
 * 幂等由 `fact-ring#supersede` 自身守（已失效者拒绝重复标记）⇒ 重复提交计 `skipped`
 * 且**不改既有失效时刻**（"何时失效"不被后来者覆盖）。
 */
export declare function applySupersedeOps(d: SupersedeApplyDeps, ops: readonly SupersedeOp[], opts?: {
    enabled?: boolean;
    archiveDir?: string;
}): SupersedeApplyResult;
/** 读取留档（回滚入口用：`revive` 只需 id，此处给出 id 与原文供人工核对）。 */
export declare function readSupersedeArchive(root: string, file?: string): Array<Record<string, unknown>>;
/** 模型侧提交的一条失效提案（形状与两处 prompt 的 `supersedes` 通道一致）。 */
export interface SupersedeProposal {
    /** **目标正文**：须逐字抄自材料里给出的「相关既有记忆」/「现行条目清单」 */
    target?: unknown;
    note?: unknown;
    by?: unknown;
}
/** 提案 → 指令的裁决结论（**纯函数**，供判据件断言"接线 ≠ 抵达"）。 */
export interface SupersedePlan {
    ops: SupersedeOp[];
    accepted: number;
    rejected: number;
    reasons: string[];
}
/**
 * **提案 → 指令**（纯函数，零 I/O）。
 *
 * 为什么单独成函数：本仓反复踩的「接线 ≠ 抵达」——把通道接上了，但模型给的字段**从不被真的消费**。
 *   把转换做成纯函数，判据件就能**直接调用并断言返回**（不 grep 源码、不靠日志猜）。
 *
 * 三条硬门（与 `fact-supersede-apply` 的目标定位同口径，**在入口先拦一道**）：
 *   ① 空目标 ⇒ 拒（模型留空是常态，不该进日志）；
 *   ② 目标不在**给定材料**里出现过 ⇒ 拒——这是**幻觉门**：模型很容易编一条"看起来像既有行"的文本，
 *      而编造的目标在库里要么 0 命中（白白留一条 noise 日志），要么**恰好命中一条真记录**（误标失效）。
 *      故要求"逐字来自材料"这一条**先于**库匹配成立。
 *   ③ 超长目标 ⇒ 拒（模型倾向把整段话当目标）。
 */
export declare function planSupersedeOps(proposals: unknown, seenLines: readonly string[], limits?: {
    maxOps?: number;
    maxTargetChars?: number;
}): SupersedePlan;
