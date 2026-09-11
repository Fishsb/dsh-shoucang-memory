export declare function dshHome(): string;
/** 守藏运行状态区（蒸馏审计/水位/pending 输入队列；非记忆库） */
export declare function knowledgeRoot(): string;
/** 记忆库根（数据与脚本同根，scripts 缺省自定位） */
export declare function memoryLibRoot(): string;
export interface RegistryEntry {
    dir: string;
    name: string;
    at: string;
}
/** 注入器 registry.json → 已注入包名集合 + 原始条目（panel 明细展示用） */
export declare function readInjectedRegistry(): {
    names: Set<string>;
    entries: RegistryEntry[];
};
export interface ProfileScan {
    profile: string;
    pkgNames: Set<string>;
    bundles: string[];
}
/** 扫描 $DSH_HOME/profiles 下各 profile 的 package.json → 装配包名（bundles + dependencies 键名，逐 profile 归属） */
export declare function scanProfiles(): ProfileScan[];
export declare function resolveBaseName(pkg: string): string;
/** 成员是否已装配（任一基准命中） */
export declare function memberPresent(memberPackage: string): boolean;
export interface SuiteMemberSpec {
    id: string;
    package: string;
    repo: string;
    role: string;
}
export interface SuiteMemberRow extends SuiteMemberSpec {
    status: 'both' | 'injected' | 'profile' | 'missing';
    injected: boolean;
    profiles: string[];
    detail: string;
}
export declare function suiteAssemblyMatrix(members: SuiteMemberSpec[]): {
    members: SuiteMemberRow[];
    summary: string;
};
/**
 * 记忆库就位探测：库根下 MEMORY.md 存在（数据随 skill 部署到同一根）。
 */
export declare function memorySkillPresent(): boolean;
export interface RouteTarget {
    library: 'shoucang';
    kind: 'memory';
    root: string;
    present: boolean;
    /** 写入口：zero-copy 脚本相对 root 的调用物（蒸馏器据此派发） */
    writer: string;
    note: string;
}
/** 解析唯一记忆库（present=false 时仍返回目标，由调用方决定降级行为并如实审计） */
export declare function resolveTarget(): RouteTarget;
export interface Whitelist {
    version: number;
    library: string;
    routes: string[];
    indexTargets: string[];
    notes: string[];
}
export declare function loadWhitelist(root: string): {
    wl: Whitelist;
    source: 'file' | 'builtin';
};
export interface GateResult {
    ok: boolean;
    reason?: string;
}
/** memory 路由入册条目门禁：target ∈ indexTargets（含 USER/AGENT 画像）或 notes/<白名单名>.md */
export declare function gateMemoryAppend(a: {
    target?: string;
}, wl: Whitelist): GateResult;
/** 查询 → 检索 token（ASCII 词 + 中文短语；中文长句先按停用词切分，仍 ≥6 字再补三字滑窗，支持部分重叠命中；去重全小写） */
export declare function extractRecallTokens(text: string): string[];
export interface RecallRow {
    file: string;
    tag: string;
    line: string;
    score: number;
    pointer: string;
}
export type CarrierInject = 'always' | 'gated' | 'none';
/** 索引行（`[tag] … → notes/x.md §y`）在给定注入档下的标签集合 */
export declare function indexCarrierSet(inject: CarrierInject): Set<string>;
/** 画像行（`- [tag] … ← 源:`）在给定注入档下的标签集合 */
export declare function profileCarrierSet(inject: CarrierInject): Set<string>;
/** 索引行 → 标签（无标签 → null）。层判据与高置信判据共用同一取标签口径。 */
export declare function indexRowTag(line: string): string | null;
/**
 * 索引行是否属于给定注入档。**无标签 / 标签未登记 → false**（保守缺省：
 * 未登记标签不得进恒定面——宁可漏显，不可把 gated 载体塞进恒定预算）。
 */
export declare function indexRowInLayer(line: string, inject: CarrierInject): boolean;
/**
 * MCL 快通道「高置信命中」标签集合（注册表 `mclGate: true`）。
 * 2026-09-11：原为 mcl.ts 内硬编码正则 `/^\[(路径|原则)\]/`（同一事实的第二份副本），
 *   注册表 `路径` 的 note 本就写着「复用 ACT-029 MCL 快通道熟悉度分流」——故把判据归还注册表。
 */
export declare function highConfCarrierSet(): Set<string>;
/**
 * 原始索引行扫描（**单一实现**）：只取「有标签 + 有 notes/ 指针」的薄行，不做层过滤、不打分。
 * 三处入口共用，禁止再写第二份逐行 `^\[tag\]` 扫描（曾有两份副本 ⇒ 过滤口径漂移）。
 */
export declare function scanIndexRows(root: string, files?: string[]): RecallRow[];
/**
 * § 族键（同 § 竞争性抑制的**唯一键口径**，2026-09-11 收敛）：
 *   指针尾第一个 §token（`§A/§B` 以 A 为族键）+ 小节名去行尾日期括号后缀 + 小写。
 * 消费方：`recallIndex`（词法路）与 `vec.recallRanked`（融合重排路）——两路必须同键，
 * 否则同一批索引行在词法/融合两种模式下会去重出不同结果（曾有两份副本 + 归一化不一致）。
 */
export declare function sectionKeyOf(line: string, pointer?: string): string | null;
/** 同 § 只留首条（= 分数更高/先到者），**不足 k 时按序回填**（无竞争者时抑制无意义）。
 *  单一实现：禁止在调用方另写副本（AGENTS.md「架构单一实现」）。 */
export declare function dedupeBySection<T>(list: T[], k: number, keyOf: (x: T) => string | null): T[];
/**
 * 词法召回：AGENT.md（[原则]/[路径]/画像行）+ MEMORY/USER 索引行，按 token 命中 × 标签权重排序（路径 > 原则 > 其余）。
 * `inject` 缺省 = **不限层**（召回是按需通道，P/R/E 皆可命中）；
 *   传入 'always'/'gated' 则按载体契约限定档位（恒定注入面用 'always'，避免 gated 载体无差别进恒定预算）。
 */
export declare function recallIndex(root: string, query: string, topK?: number, scope?: 'agent' | 'all', inject?: CarrierInject): {
    rows: RecallRow[];
    tokens: string[];
    mode: 'lexical';
};
/**
 * S5 近似召回（零命中兜底）：全文命中（score≥1）为空的降级分析。
 * 词法近似的本质限制：零全文命中 = 无任何 token 命中任何行，逐行部分匹配（recallApprox 原设计）必然同为空——
 * 真价值是给「库内主题地图」：列 notes/ 各文件小节（按关键词/语义标注），让 agent 知道库里有哪类话题可换问法，
 * 并给出建议检索词（查询中属库内已知领域的 token，若有）。只读。
 */
export declare function recallApprox(root: string, query: string, scope?: 'agent' | 'all'): {
    near: RecallRow[];
    suggest: string[];
};
export declare function selftestMatrix(): string[];
