/** 稳定面缓存的失效窗口（毫秒）。与主路径同口径（两套 TTL 会让两处不同步）。 */
export declare const STABLE_TTL_MS = 120000;
/**
 * 恒定面构造的**query 无关参数**（主路径在 `buildHotMemoryText` 内组装一次并存入 `cache.sd`）。
 * 全部字段与 query 无关 ⇒ 可安全供每步调用。
 */
export interface StableStash {
    /** 缓存键：`memRoot|personaMode|profileCap|playbook|尺寸签名`（口径属调用方，本件只比对） */
    key: string;
    /** 记忆库根（抬头行用） */
    memRoot: string;
    /** 恒定面额度 = `budgetOf(totalBudget).stable` */
    capStable: number;
    /** 判据常驻块是否启用 */
    playbookOn: boolean;
    /** agent 侧恒定面行（**含块标题行**） */
    agentBlock: readonly string[];
    /** user 侧恒定面行（同上） */
    userBlock: readonly string[];
}
/** 本件只需 cache 的这 4 个字段（窄化 ⇒ 与 panel-shared 的 HotMemoryCache 结构兼容）。 */
export interface StableCache {
    stableKey: string | null;
    stableAt: number;
    stableText: string[];
    realCut?: {
        stable: number;
        dropped: string[];
    };
}
/** 把「画像行」渲染成带块标题的行集（标题行也受配额约束 —— 与抽出的原实现一致）。 */
export declare function stableStashOf(memRoot: string, capStable: number, playbookOn: boolean, key: string, agentLines: readonly string[], userLines: readonly string[]): StableStash;
/**
 * 构造（或复用）恒定面行集。**与主路径同源**：主路径也调本函数 ⇒ 不存在第二套渲染口径。
 * 缓存判定：键相同且未超 TTL ⇒ 复用（零重算、零读盘）；否则重算并回写同一 cache。
 * ⚠ `realCut`（真实裁切的保留数与被丢行）由本件回写 —— `supplyUsageMeta` 依赖它算账，不得漏。
 */
export declare function stableLinesOf(s: StableStash, now: number, cache: StableCache): string[];
/** 恒定面**单独出口**的文本形态（`HotMemory.buildStable()` 用）。 */
export declare function stableTextOf(s: StableStash, now: number, cache: StableCache): string;
