import type { IncomingMessage, ServerResponse } from 'node:http';
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
export type RouteFn = (sub: string, handler: RouteHandler) => void;
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
export interface HotMemoryCache {
    key: string | null;
    at: number;
    text: string;
}
export interface HotMemory {
    build(query?: string): string;
    invalidate(): void;
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
export declare const probeLocalEmbed: (baseUrl: string) => {
    ok: boolean;
    provider: string;
};
export {};
