/** 记录类别（扩展点：新增一类只加常量，不动消费者）。
 * 2026-09-13（G1 内容环）：新增 `decision`/`outcome`/`valence` 三类——**Record 存得下 md 存不下的东西**，
 *   这正是 DS1「事实源↔投影解耦」的兑现：决策/后果/价态天然没有 md 投影（`file=''`）。
 *   新增 kind 必须同时登记环归属（`rings.ts#RING_OF_KIND`），否则 `check-ring-coverage` FAIL。 */
export declare const KINDS: readonly ["fact", "procedure", "persona", "episode", "decision", "outcome", "valence", "relation", "commitment", "association", "prose", "structure", "blank"];
export type RecordKind = (typeof KINDS)[number];
/** 生命周期（遗忘=迁移，不删除） */
export declare const LIFECYCLES: readonly ["active", "cold", "retired"];
export type Lifecycle = (typeof LIFECYCLES)[number];
/** md 投影文件 → 主体（新增主体=加一行，零架构改动） */
export declare const SUBJECT_OF_FILE: Readonly<Record<string, string>>;
/** 三索引投影文件（顺序即投影顺序） */
export declare const INDEX_FILES: readonly ["MEMORY.md", "USER.md", "AGENT.md"];
export interface MemRecord {
    /** 内容指纹派生（`subject:kind:fp`）⇒ 天然去重 */
    id: string;
    kind: RecordKind;
    /** 主体（字段，不是文件名） */
    subject: string;
    /** global / workspace:<path> / project:<name> */
    scope: string;
    /** 原子正文（投影时原样拼回） */
    text: string;
    /** 来源（会话 id + 事件序号 / notes 锚） */
    source: string;
    /** 索引行标签（无标签=''） */
    tag: string;
    /** 指针目标（notes/x.md §节） */
    pointer: string;
    /** 投影归属文件 */
    file: string;
    /** 投影顺序（同文件内按此稳定排序） */
    order: number;
    /** 本行自己的行分隔符（逐字节还原的关键） */
    eol: string;
    /** 环专属载荷（决策环：rationale/alternatives/predicted/decisionId/hit；价值环：valence/trigger）。
     * 通用槽位 ⇒ **新增一种内容类型不必再动 schema**（P4 验收「新增类型/主体零架构改动」的落地形态）。 */
    meta?: Record<string, string>;
    /**
     * **双时间戳**（事实环时态失效，2026-09-13）：断言自何时成立 / 何时失效（空 = 未失效）。
     * 与 `lifecycle` **正交**：`lifecycle` 管「值不值得注入」（活性降级），`validTo` 管「还成不成立」（真伪失效）。
     * 二者混用会犯两类错——把"过时"当"不重要"，或把"不重要"当"不成立"。
     */
    validFrom?: string;
    validTo?: string;
    maturity: number;
    lifecycle: Lifecycle;
    hits: number;
    lastHit: string;
    createdAt: string;
    updatedAt: string;
}
/** 内容指纹（djb2 变体 → base36）：原文改一字即换 id ⇒ 视为新记录 */
export declare function fingerprint(text: string): string;
export declare function subjectIsCompanion(subject: string): boolean;
export declare function isValidSubject(subject: string): boolean;
export declare function isValidScope(scope: string): boolean;
/** 行首标签（`- [x]` 或 `[x]`） */
export declare function tagOfLine(line: string): string;
/** 指针目标（`→ notes/x.md §节`） */
export declare function pointerOfLine(line: string): string;
/** 来源锚（`← 源: notes/x.md §节`） */
export declare function sourceOfLine(line: string): string;
/**
 * 行 → 类别。**层从注册表 CARRIERS 派生**（P=persona / R=procedure / 其余有标签=fact），
 * 不在此处维护第二份标签名单。
 */
export declare function kindOfLine(line: string, tag: string): RecordKind;
/** 内容字段（不含 stats/时间戳）——id 与走形判定只认这些 */
export interface RecordInit {
    text: string;
    file: string;
    subject?: string;
    scope?: string;
    source?: string;
    kind?: RecordKind;
    tag?: string;
    pointer?: string;
    order?: number;
    eol?: string;
    maturity?: number;
    lifecycle?: Lifecycle;
    /** 显式 id 覆盖（环记录用：同文本但属不同决策的后果不得互相撞 id） */
    id?: string;
    /** 环专属载荷（见 MemRecord.meta） */
    meta?: Record<string, string>;
    /** 双时间戳（见 MemRecord.validFrom/validTo） */
    validFrom?: string;
    validTo?: string;
}
/** 由内容字段构造记录（id 派生；时间戳/stats 由调用方经 `stampRecord` 补） */
export declare function makeRecord(init: RecordInit): MemRecord;
/** 逐行解析（**保留每行自己的分隔符**）⇒ 导出即原样拼回 */
export declare function parseRecords(raw: string, file: string, opts?: {
    subject?: string;
    scope?: string;
}): MemRecord[];
/** 单文件投影（按 order 稳定排序后原样拼回） */
export declare function renderFile(records: readonly MemRecord[], file: string): string;
/** 多文件投影（按 INDEX_FILES 顺序） */
export declare function renderAll(records: readonly MemRecord[], files?: readonly string[]): string;
/** 记录集 → JSONL（事实源落盘形态：一行一记录，可 grep、可 diff、零依赖） */
export declare function serializeRecords(records: readonly MemRecord[]): string;
export declare function parseRecordStore(text: string): MemRecord[];
export interface RecordDiff {
    added: MemRecord[];
    removed: MemRecord[];
    changed: Array<{
        id: string;
        from: MemRecord;
        to: MemRecord;
    }>;
}
/** 集合差分（按 id）。changed 只认**内容字段**变化，忽略 stats/时间戳噪声 */
export declare function diffRecords(prev: readonly MemRecord[], next: readonly MemRecord[]): RecordDiff;
export type UpsertAction = 'added' | 'replaced' | 'unchanged';
/** 按 id 去重写入（事实源的天然去重，对应 §3.1「id 内容指纹派生」） */
export declare function upsertRecord(records: readonly MemRecord[], rec: MemRecord): {
    records: MemRecord[];
    action: UpsertAction;
};
/** 生命周期迁移（遗忘=迁移，不删除）；命中统计随供给侧写入 */
export declare function moveLifecycle(r: MemRecord, lifecycle: Lifecycle, at: string): MemRecord;
/** 命中记账（供给侧调用：hits/lastHit 是「被用过」的证据，不是猜测） */
export declare function noteHit(r: MemRecord, at: string): MemRecord;
/** 补时间戳（导入/新建时统一入口，避免各处自己写 new Date） */
export declare function stampRecord(r: MemRecord, at: string): MemRecord;
/** 校验（写门只守：类型合法 / 主体合法 / 来源可溯 / 指针不悬空由上层判） */
export declare function validateRecord(r: MemRecord): string[];
export interface Inventory {
    records: number;
    bytes: number;
    byFile: Record<string, number>;
    byKind: Record<string, number>;
    bySubject: Record<string, number>;
    byLifecycle: Record<string, number>;
    byTag: Record<string, number>;
    untagged: number;
}
/** 清单统计（供面板/审计/迁移申报） */
export declare function inventoryOf(records: readonly MemRecord[]): Inventory;
/**
 * md → Record 全量导入（一次性迁移 + 对账用；不常驻——§10 单写向）。
 * `files` 为 { 文件名: 原文 }；返回记录集与逐文件往返结论。
 */
export declare function importFromMd(files: Readonly<Record<string, string>>, at: string, opts?: {
    scope?: string;
}): {
    records: MemRecord[];
    roundTrip: Record<string, boolean>;
};
/**
 * Record 集 → md 文件集合（投影；导出即事实源的一次渲染）。
 * 只渲染**文件内已有记录**，不凭空产生文件 ⇒ 投影与事实源一一对应。
 */
export declare function exportToMd(records: readonly MemRecord[], files?: readonly string[]): Record<string, string>;
