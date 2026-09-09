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
/** 查询 → 检索 token（ASCII 词 + 中文连续串 ≥2，去停用词去重；全小写） */
export declare function extractRecallTokens(text: string): string[];
export interface RecallRow {
    file: string;
    tag: string;
    line: string;
    score: number;
    pointer: string;
}
/** 词法召回：AGENT.md（[原则]/[路径]/画像行）+ MEMORY/USER 索引行，按 token 命中 × 标签权重排序（路径 > 原则 > 其余） */
export declare function recallIndex(root: string, query: string, topK?: number, scope?: 'agent' | 'all'): {
    rows: RecallRow[];
    tokens: string[];
};
export declare function selftestMatrix(): string[];
