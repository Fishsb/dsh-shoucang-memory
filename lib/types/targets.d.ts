export declare function dshHome(): string;
/** 守藏本地知识区（记忆库同构三索引 + notes + pending + audit + whitelist.json） */
export declare function knowledgeRoot(): string;
/** 记忆插件生产副本根（数据与脚本同根，scripts 缺省自定位） */
export declare function memoryLibRoot(): string;
/** pmg 引擎 scripts 目录——双部署探测：skills 运行副本优先，plugins/engine 兜底（pmg 治理保证两副本同步） */
export declare function pmgScriptsRoot(): string;
/** 成员是否已装配（任一基准命中） */
export declare function memberPresent(memberPackage: string): boolean;
/**
 * 记忆技能就位探测（2026-09-08 合并后 A 方案）：
 * 记忆技能内嵌本插件 skill/，生产部署仍以 ~/.dsh/skills/managing-memory 为权威根；
 * 探测口径 = 该根下 MEMORY.md 存在（不再探测已消失的 @dsh-external/dsh-managing-memory 包）。
 */
export declare function memorySkillPresent(): boolean;
export interface RouteTarget {
    library: 'memory-plugin' | 'shoucang-local' | 'pmg-cards' | 'local-pending';
    kind: 'memory' | 'project';
    root: string;
    present: boolean;
    /** 写入口：zero-copy 脚本相对 root 的调用物（蒸馏器据此派发） */
    writer: string;
    note: string;
}
export declare function memoryChain(memoryMemberPresent: boolean): RouteTarget[];
export declare function projectChain(governanceMemberPresent: boolean): RouteTarget[];
export interface ResolvedRoute {
    resolved: RouteTarget;
    chain: RouteTarget[];
}
export declare function resolveTarget(route: 'memory' | 'project', members: {
    memory: boolean;
    governance: boolean;
}): ResolvedRoute;
export interface BoardDef {
    host?: string;
    accept?: string[];
    reject?: string[];
}
export interface Whitelist {
    version: number;
    library: string;
    routes: string[];
    indexTargets: string[];
    notes: string[];
    cardTypes: string[];
    /** 契约 v3 粒度锚：板块边界（generic=官方/规范文档级；project=项目事实/用户拍板）。空键=不设板块门禁 */
    boards: Record<string, BoardDef>;
}
export declare const BUILTIN_WHITELISTS: Record<RouteTarget['library'], Whitelist>;
export declare function loadWhitelist(root: string, library: RouteTarget['library']): {
    wl: Whitelist;
    source: 'file' | 'builtin';
};
export interface GateResult {
    ok: boolean;
    reason?: string;
}
/** memory 路由入册条目门禁：target ∈ indexTargets 或 notes/<白名单名>.md */
export declare function gateMemoryAppend(a: {
    target?: string;
}, wl: Whitelist): GateResult;
/** project 路由卡目门禁：cardType ∈ 白名单卡型；板块 ∈ 白名单 boards（契约 v3 粒度锚，空键=不设板块门禁） */
export declare function gateProjectCard(pc: {
    cardType?: string;
    board?: string;
}, wl: Whitelist): GateResult;
export declare function selftestMatrix(real: {
    memory: boolean;
    governance: boolean;
}): string[];
