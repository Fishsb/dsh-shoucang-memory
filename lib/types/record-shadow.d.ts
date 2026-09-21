import type { Inventory, MemRecord } from './record-store.js';
/** 影子库落点（与 md 同根，隐藏目录；随记忆库一起 git 版本化） */
export declare const RECORD_DIR = ".records";
export declare const RECORD_FILE = "records.jsonl";
/** **写时自证**计数落点（M3 · 2026-09-13）：状态表，非事件流；体积极小，随镜像低频重写 */
export declare const SHADOW_STATS_FILE = "shadow-stats.json";
export interface ShadowStats {
    /** 镜像次数 */
    writes: number;
    /** 其中"记录导出可逐字节还原 md"的次数 */
    verified: number;
    /** **分歧次数**（不可还原）——切源的运行态放行门：必须为 0 */
    diverged: number;
    lastAt: string;
    lastFile: string;
    lastDivergedAt: string;
    lastDivergedFile: string;
}
/** 计数落点路径 */
export declare function shadowStatsPath(root: string): string;
/** 读计数（缺席/损坏 ⇒ 全零，**不抛**） */
export declare function readShadowStats(root: string): ShadowStats;
/**
 * 累加一次写时自证结果（best-effort · **零抛出**）。
 * 为什么落盘而不是只留内存：**"生产里到底有没有分歧过"必须能被事后核**（内存计数随进程消失），
 * 而它正是 M4/M5 切源的运行态依据 —— `diverged === 0` 才是"记录能还原 md"在生产上的证据。
 */
export declare function bumpShadowStats(root: string, at: string, file: string, roundTrip: boolean): void;
export interface MirrorResult {
    file: string;
    ok: boolean;
    records: number;
    bytes: number;
    /** Record 导出能否逐字节还原 md —— 双写期的核心判据 */
    roundTrip: boolean;
    error?: string;
}
export interface ParityRow {
    file: string;
    present: boolean;
    /** 影子库该文件投影 == md 原文 */
    ok: boolean;
    mdBytes: number;
    storeBytes: number;
    reason?: string;
}
export declare function recordStorePath(root: string): string;
/** 读影子库（缺失/损坏 → 空集 + 原因，不抛） */
export declare function loadStore(root: string): {
    records: MemRecord[];
    error?: string;
};
/** 落盘记录集（环记录用：`file=''` 的记录不会被 mirrorFile 的按文件替换碰到） */
export declare function saveStoreRecords(root: string, records: readonly MemRecord[]): void;
/** 一个 md 文件 → Record 片（保留各自 eol ⇒ 可逐字节还原） */
export declare function parseMdFile(root: string, file: string, at: string): {
    records: MemRecord[];
    raw: string;
} | null;
/**
 * **记忆载体清单**（2026-09-13 · `storeMode=record` 切源的前置）：索引三件 + `notes/*.md`。
 *
 * 为什么需要它：DS1 的「Record 事实源 **→** md 投影」要求**每个载体都得有记录表示**。
 *   实测（`check-record-parity --coverage`）：索引 **3/3** 有表示，而 **notes 0/8**（94.7KB 详情主体）
 *   ⇒ 彼时切源 = 「索引由 Record 权威 + 详情由 md 权威」的**双权威**，正是"合并"要消除的东西。
 *
 * 可行性**先实证后落地**：既有 `parseRecords` + `renderFile` 对 8 个 notes 文件**全部往返逐字节一致**
 *   （合计 789 行）——故本件只需把载体面**显式列全**，不需要新的解析/渲染逻辑。
 */
export declare function carrierFiles(root: string): string[];
/**
 * 镜像单个 md 文件进影子库（按文件整片替换）。
 * `storeMode==='md'` 时调用方不应调用本函数（无开关=不动作）。
 */
export declare function mirrorFile(root: string, file: string, at: string): MirrorResult;
/** 镜像全部三索引（一次性迁移 / 对账 / 自检用） */
export declare function mirrorAll(root: string, at: string, files?: readonly string[]): MirrorResult[];
/**
 * 把一批镜像结果**收敛成「必须留痕」的失败清单**（纯函数 · 可机检）。
 *
 * 判因（2026-09-21 · 实测）：`distill-write` 的**一趟末尾统一镜像**调用原为
 *   `try { mirrorAll(…) } catch { 空吞 }` —— **返回值被整个丢弃**，`catch` 又不留痕
 *   ⇒ 镜像失败 / 往返不一致**完全不可观测**，唯一症状是**后来某次对账红**，
 *   而账面指向"库失步"，与"机制坏了"**不可分辨**。
 *   实测踩到：`notes/lessons.md` 少 2 张教训卡（6 行），而镜像自证 `writes:6709/diverged:0`、
 *   往返闸全绿 —— 两者同时成立，无法从账上判断是"漏镜像"还是"解析坏"。
 *   ⇒ 抽成纯函数供调用方**留痕**（对齐 §0o 既有纪律：**凡静默路径必须报出为何为空/为何失败**）。
 */
export declare function mirrorFailuresOf(res: readonly MirrorResult[]): string[];
/**
 * 对账：影子库投影 ⟷ md 原文（**双写期唯一判据**，§10「同一 Record 集导出 md 必须逐字节重现」）。
 * 只读，不写任何文件。
 */
export declare function parityOf(root: string, files?: readonly string[]): ParityRow[];
/** 影子库清单（供面板/审计申报；与供给无关，纯统计） */
export declare function shadowInventory(root: string): Inventory & {
    error?: string;
};
