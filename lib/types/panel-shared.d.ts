import type { IncomingMessage, ServerResponse } from 'node:http';
import { type StableStash } from './hot-stable.js';
export interface RootEntry {
    id: string;
    name: string;
    path: string;
}
export interface PanelState {
    roots: RootEntry[];
    active: string | null;
}
export interface RouteRegistry {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler(req: IncomingMessage, res: ServerResponse): void;
    }): () => void;
}
export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void;
/** 请求体校验器（schemastery 语义：**类型错抛错、缺字段不抛** —— 实测确认，故必填另用 required 声明）。
 *  入参用 any 而非 unknown：schemastery 的 Schema<T> 入参是具体 T（如 ObjectS<…>），
 *  在 strictFunctionTypes 下不能逆变赋给 (data: unknown) => unknown。（此处是"调用即校验"的边界，非内部数据流。） */
export type BodySchema = (data: any) => unknown;
/**
 * 路由契约（S4 · 2026-09-13）：把「这条路由收什么」从注释变成**可执行约束**。
 *   · body     —— 类型校验（schemastery schema）；类型不符 ⇒ 400，且**不调用 handler**
 *   · required —— 必填字段（缺一即 400）；与 body 分开是因为 schemastery 不校验缺字段
 * 只读 GET 端点可不声明契约（行为与旧版完全一致）。
 */
export interface RouteContract {
    body?: BodySchema;
    required?: readonly string[];
}
export type RouteFn = (sub: string, handler: RouteHandler, contract?: RouteContract) => void;
/** 日志窄接口：领域模块只许看日志，不许抱着整个 host ctx。 */
export interface PanelLogger {
    info?(s: string): void;
    warn?(s: string): void;
}
export interface StateStore {
    load(): PanelState;
    save(s: PanelState): void;
}
export interface RootAccess {
    activeRootOf(): RootEntry | null;
    configFileOf(): string | null;
}
export interface SuiteConfigAccess {
    read(): Record<string, unknown>;
    write(o: Record<string, unknown>): void;
}
export interface HotMemoryDeps {
    suite: SuiteConfigAccess;
    root: RootAccess;
}
/**
 * P0a（2026-09-14）：**影子记账**快照。把同批候选喂给读侧单一装配实现 `assembleSupply`，
 *   取它的溢出/丢弃账；**该账对主路径注入文本零影响**（这是 P0a「逐字节等价」的前提）。
 * 为什么先做影子而不是直接接管输出：G4 装配件在 `src/` 内**零运行时消费者**（唯一消费者是离线 CLI
 *   `scripts/supply-preview.mjs`），它自带的硬预算与溢出记账因此**从未在运行时生效、也从未被观测**。
 *   接成影子后，运行时首次有「候选集 vs 预算」的真实账（本文件下方「≈2,800 上限」长期是测算值无实测对照）。
 * ⚠ 阶段 3 口径修正（2026-09-14）：原注写「**不采用它的 blocks**」已不准确——本次起把装配器口径
 *   渲染出的文本也放进 `assemblerText`（**只读诊断字段，仍不进注入面**）。加它的理由：
 *   两套逻辑的结构性差异（抬头行 / 块标题 / `- ` 前缀 / 段落顺序 / 省略文案）原先只能靠读码推断，
 *   现在可与主路径文本**逐行并排比对**。这是阶段 3 产品决策的取证面，不是切换。
 */
export interface SupplyUsage {
    at: number;
    chars: number;
    budgetTotal: number;
    overBudget: boolean;
    kept: {
        stable: number;
        dynamic: number;
        oneshot: number;
        situation: number;
    };
    dropped: string[];
    /** P3：本次用的情境键（**可见化**：键不对/为空时能一眼看出，而不是"情境层静默无效"） */
    cues: string[];
    /** P3：情境槽是否开启（注册表 `surface.injection.situation` 的解析后值） */
    situationEnabled: boolean;
    /** 阶段 3 取证（2026-09-14）：装配器口径（`renderSupplyText`）渲染的注入文本。**只读诊断字段**。
     *  S4R/R1 起主路径**已改调** `renderSupplyText`（渲染收敛）⇒ 本字段现为**同一实现的独立复算**，用于对拍。 */
    assemblerText?: string;
    /** S4R/R2（2026-09-14）：**真实被丢弃的行内容**（主路径 `clampLines` 产出，**逐条可比**）。
     *  有它才能核「账 == 真实裁切」—— B2 的判据要求**逐条**可比，不只是计数。 */
    droppedRows?: string[];
}
export interface HotMemoryCache {
    key: string | null;
    at: number;
    text: string;
    /** P2（2026-09-13）：稳定面（画像两段，query 无关）单独缓存 —— 键含索引文件尺寸签名，写入即失效 */
    stableKey: string | null;
    stableAt: number;
    stableText: string[];
    /** P0a（2026-09-14）：末次装配的影子记账（观测用，**不参与文本生成**） */
    usage: SupplyUsage;
    /** S4R/R2：稳定面**真实裁切**结果（在缓存分支内产出 —— 该分支之外拿不到 `a2`/`u2`/`dA`/`dU`） */
    realCut?: {
        stable: number;
        dropped: string[];
    };
    /** P1（2026-09-18）：恒定面构造的 **query 无关参数**（主路径构建时写入；`buildStable()` 每步零副作用取用） */
    sd?: StableStash;
}
/**
 * 2026-09-18 按域路由 P1：新增 `buildStable()` —— **恒定面单独出口**。
 *   恒定面（双画像索引行 + P 层画像行 + 三层判据常驻块）与 query **无关**（`readCarrier` 全文无 q 引用，实测）
 *   ⇒ 可独立于动态面单独注入：它挂 `systemPrompt.section` 落 **节点 0（压缩豁免）**，
 *   动态面（知识索引，依赖 query）仍走 `systemPrompt.context`（可压区，本就该按需可丢）。
 *   接口写单行是**有意的**：本模块受大模块冻结棘轮约束（基线 537 + 容差 15），拆行即撞顶。
 */
export interface HotMemory {
    build(query?: string): string;
    buildStable(): string;
    buildDynamic(query?: string): string;
    invalidate(): void;
    supplyUsage(): SupplyUsage;
}
export interface RouteBinder {
    route: RouteFn;
    disposers: Array<() => void>;
}
export interface InjectMeta {
    calls: number;
    lastAt: number;
}
export declare const CONFIG_FILE = "shoucang.config.yaml";
export declare function expandHome(p: string): string;
export declare function sendJson(res: ServerResponse, code: number, body: unknown): void;
/**
 * 读取并解析请求体。
 * ⚠ 必须**缓存**：路由契约的校验会先读一次 body，若 handler 再读一次会拿到空流（流已被消费）⇒ 参数全丢。
 *   缓存挂在请求对象上，后续 readBody 返回同一对象（handler 只读字段，不改写）。
 */
export declare function readBody(req: IncomingMessage): Promise<Record<string, unknown>>;
export declare function statMtime(file: string): string;
export declare function createStateStore(statePath: string): StateStore;
export declare function createRouteBinder(webServer: RouteRegistry, logger: PanelLogger): RouteBinder;
export declare function createRootAccess(state: StateStore): RootAccess;
export declare function createSuiteConfig(): SuiteConfigAccess;
export declare function createInjectMeta(): InjectMeta;
/** 幂等建「单库骨架」：目录 + 三索引 + 七 notes + INDEX 注册表 + whitelist.json + 随包 scripts/engine/规则档 */
export declare const bootstrapDefaults: (rootPath: string) => {
    createdDirs: string[];
    createdIndexes: string[];
    skipped: string[];
    template: boolean;
};
export declare function createHotMemory(d: HotMemoryDeps): HotMemory;
export declare const backupThenWrite: (file: string, text: string) => void;
interface ParsedView {
    flags: Record<string, boolean | string>;
    injection_level?: string;
    max_tokens?: number;
    caps_agent?: number;
    caps_user?: number;
    caps_memory?: number;
    idle_review_ms?: number;
    age_days?: number;
    archive_mode?: string;
    fixed_time?: string;
    merge_fpr?: number;
    merge_floor?: number;
    sessions_dir?: string;
    interval_hours?: number;
    embedding?: Record<string, string | number>;
}
export declare const parseView: (text: string) => ParsedView;
/** 在原文中翻转任意 `a.b.c=true|false` 布尔行（缩进栈定位，注释保留）。 */
export declare function flipBool(text: string, dottedKey: string): string | null;
/** 设置标量（枚举/数值/布尔）：YAML 栈定位 dottedKey 行，替换值、保留注释与缩进 */
export declare function setKey(text: string, dottedKey: string, rawValue: string): string | null;
export declare const isLocalBase: (baseUrl: string) => boolean;
export declare const probeLocalEmbed: (baseUrl: string) => Promise<{
    ok: boolean;
    provider: string;
}>;
export {};
