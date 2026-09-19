export type SectionRefState = 'exists' | 'ambiguous' | 'missing';
/** **spec 级**（`§父/子` 路径）四态：名字级只有三态；`partial` 是"路径部分可解析"（读侧回落父节）。
 *  判因（2026-09-19 实测 51 组悬空）：**主模式是「父/子」指针里子节不存在**（子节从未创建/被改名），
 *  而父节仍在且读侧可回落 ⇒ 若把 partial 当 missing 处理，生产链会**大面积误拒**（子节名是模型生成的深层锚）。 */
export type SectionRefSpecState = SectionRefState | 'partial';
export interface SectionRefCand {
    /** 标题原文（未归一） */
    title: string;
    /** 归一核心名（小写、去空白、去行尾日期括号） */
    core: string;
    /** 标题层级（2 = `##`，3 = `###`） */
    level: number;
    /** 标题所在行号（0-based，相对 notes 文件） */
    idx: number;
    /** 是否与查询名精确相等（归一后） */
    exact: boolean;
}
export interface SectionRefResult {
    state: SectionRefState;
    /** 命中集合里是否含精确命中（`exact` 优先用于展示与排序） */
    exact: boolean;
    /** 全部候选（`ambiguous` 时 >1；`exists` 时恰 1；`missing` 时空） */
    cands: SectionRefCand[];
    /** 目标 notes 文件是否存在（区别于「文件在、小节不在」） */
    fileExists: boolean;
    /** 无法解析时的原因（文件非法 / 名字为空）——供调用方如实呈现，不静默 */
    reason?: string;
}
/** 归一：核心名 → 小写 → 去全部空白（两处实现同口径） */
export declare const sectionCore: (s: unknown) => string;
/** 单文件标题清单（`##`/`###` 两级；ADR-015 两级检索单元）；文件不可读 ⇒ null */
export declare function sectionTitles(memRoot: string, file: string): {
    title: string;
    level: number;
    idx: number;
}[] | null;
/**
 * 单一小节名 → 三态。
 * @param memRoot 记忆库根（其下须有 `notes/`）
 * @param file    `env.md` 或 `notes/env.md`（`normalizeNotesFile` 容错）
 * @param name    § 后的名字（可含括号日期；允许多级路径的**单段**）
 */
/**
 * ══ 册三（2026-09-19 · docs/pointer-supply-plan.md §5-1）：**层级化放置裁决** ══
 *
 * 判因（方案 §2.2 G5，实测坐实）：`memory-append` 自带一份 `matches`（**双向包含**）+ `findChild`（逐级取**首个**）
 *   ⇒ 夹具库只有 `## DSH 环境` 时写「环境」**误配**进「DSH 环境」（exit 0 无提示），与本节三态语义不统一。
 * 语义（与 `resolveFromTitles` 同源，但**限定父作用域 + 指定层级**）：exact → loose 唯一命中 →
 *   **多命中 ⇒ `ambiguous`**（调用方必须拒绝并要求写「父/子」全路径）；无命中 ⇒ `missing`（写入侧按既有策略建子节）。
 * ⚠ 与 `skill/scripts/section-ref.mjs` 是同一语义的两份物理实现（子进程活件零依赖，不可 import src/），
 *   一致由 `scripts/check-section-ref-parity.mjs` 的**放置用例**差分锁守。
 */
export interface PlacementHit {
    title: string;
    core: string;
    level: number;
    idx: number;
    at: number;
    exact: boolean;
}
export interface LevelResolution {
    state: 'exact' | 'loose' | 'ambiguous' | 'missing';
    pick: PlacementHit | null;
    cands: PlacementHit[];
}
export declare function resolveLevelInParent(titles: {
    title: string;
    level: number;
    idx: number;
}[] | null | undefined, parentIdx: number, level: number, name: unknown, opts?: {
    loose?: 'prefix' | 'contains';
}): LevelResolution;
export interface PlacementStep {
    pi: number;
    level: number;
    state: string;
    name: string;
    at?: number;
    title?: string;
}
export interface PlacementPlan {
    refused: {
        pi: number;
        level: number;
        name: string;
        cands: string[];
    } | null;
    steps: PlacementStep[];
    parentIdx: number;
    missingPi: number;
}
/** 路径放置计划：逐级裁决；`ambiguous` ⇒ **refused**（不猜、不取首个）；首缺层 ⇒ `missingPi` */
export declare function planPlacement(titles: {
    title: string;
    level: number;
    idx: number;
}[] | null | undefined, pathParts: string[], opts?: {
    loose?: 'prefix' | 'contains';
}): PlacementPlan;
export declare function resolveSection(memRoot: string, file: string, name: unknown): SectionRefResult;
/** 纯函数裁决（供差分锁在不落盘的前提下逐例比对） */
export declare function resolveFromTitles(titles: {
    title: string;
    level: number;
    idx: number;
}[], name: unknown): SectionRefResult;
/**
 * `§A/§B`（同文件并列小节 / 父子路径）→ 逐部分三态 + **聚合四态**。
 * 聚合：全部 exists ⇒ exists；**部分可解析 ⇒ `partial`**（读侧回落最深可解析段）；
 *      无 missing 但有 ambiguous ⇒ ambiguous；**全不可解析 ⇒ missing**。
 * ⚠ `partial` **只作用于准入策略**（放行 + 提示），不是"名字存在"——名字级判定始终三态。
 */
export declare function resolveSectionSpec(memRoot: string, file: string, spec: unknown): {
    agg: SectionRefSpecState;
    parts: {
        name: string;
        res: SectionRefResult;
    }[];
};
/** 二值兼容门（与迁移前 `forgetops#sectionExists` 逐例同结论：只有 exists 为真） */
export declare function sectionExistsRef(memRoot: string, file: string, section: unknown): boolean;
/** 主档索引行里的 `→ notes/x.md §y` 引用（一行可含多个文件指针与 `§A/§B` 并列；不承担行格式校验） */
export interface RowPointer {
    file: string;
    spec: string;
}
export declare function pointersOfRow(line: string): RowPointer[];
/** 索引行准入（唯一强制点，S1R · D3）：`missing`（全不可解析）⇒ 不可写入；
 *  `partial`（父节可回落）/ `ambiguous`（同名多候选）⇒ **放行 + 提示**。
 *  ⚠ **2026-09-19 收口（真库实测病灶）**：`partial` 里**末段缺失**的那一支 ⇒ **视同 missing，拒写**。
 *   病灶形状（实测）：`§npm 失效与残留 shim 修复/junction 装配漂移` —— 父节在、子节**没落地**
 *   （同批 append 失败，见同轮 `failedItems k=append`）⇒ 旧策略"partial 一律放行"把它写成
 *   **孤儿指针**（真库 `check-section-refs` partial 0→1 翻红）。索引行与明细**同写 / 同不写**才是准入的本意；
 *   **中段**缺失仍放行（读侧可回落最深可解析段）。孪生 `skill/scripts/section-ref.mjs` 同改（差分锁守）。 */
export interface RowAdmission {
    ok: boolean;
    missing: {
        file: string;
        spec: string;
        name: string;
    }[];
    partial: {
        file: string;
        spec: string;
        missing: string[];
        resolved: string[];
    }[];
    ambiguous: {
        file: string;
        spec: string;
        cands: string[];
    }[];
}
export declare function admitIndexRow(memRoot: string, line: string): RowAdmission;
