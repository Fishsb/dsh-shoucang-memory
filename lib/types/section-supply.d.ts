/** 每文件的两级小节（复用 `sectionTitles` 单一解析器；父/子关系按 idx 就近归属） */
export interface FileSections {
    file: string;
    /** `##` 级标题 */
    tops: string[];
    /** `##父/子` 形式的树状路径（含父在浅、子在深） */
    paths: string[];
}
/** 逐文件枚举 `notes/*.md`（排除 `INDEX.md`；不可读/零小节的文件**不出现**，不冒充） */
export declare function fileSectionsOf(memRoot: string): FileSections[];
export interface AddressSupply {
    /** 供模型逐字选取的地址行（已按预算裁剪） */
    lines: string[];
    /** 清单里的地址集合（归一化键 `notes/x.md§<core>`，供 `sectionMiss` 比对；与 `section-ref.sectionCore` 同口径） */
    set: Set<string>;
    sections: number;
    files: number;
    /** 是否发生降级（true ⇒ 只给了 `##` 级或更少） */
    degraded: boolean;
    /** 人读摘要（**N=0 显式记 0**） */
    summary: string;
}
/** 归一化地址键（逐段走 `section-ref#sectionCore` —— **不在此另写归一器**，防口径漂移） */
export declare const addressKeyOf: (file: string, section: unknown) => string;
/**
 * 生成地址清单（纯读、零抛出）。
 * 降级链：① 全量（`##` + `##父/子`）→ ② 仅 `##` 级 → ③ 仅摘要计数（连 `##` 级都放不下时）。
 * ⚠ 任何一级都**按行裁剪**（不截断到半行），且降级时**显式标注**（不静默变少）。
 */
export declare function sectionAddressSupply(memRoot: string, maxChars?: number): AddressSupply;
/** 材料段标题（**唯一字面量**：判据件据此断言"抵达"） */
export declare const ADDRESS_SUPPLY_HEADER = "## \u53EF\u7528\u5C0F\u8282\u5730\u5740\uFF08\u5E93\u4FA7\u4F9B\u7ED9\uFF1B\u4E0D\u5728\u6E05\u5355\u5185\u7684 \u00A7 \u4F1A\u88AB\u5199\u95E8\u62D2\u6536\u2014\u2014\u5B81\u7F3A\u52FF\u7F16\uFF09";
/**
 * 蒸馏材料装配（**纯字符串**，无 IO）——单独成函数是为了让"接线 ≠ 抵达"可机检：
 *   判据件直接调用本函数并断言返回文本里**含**地址段与其内容（见 `check-section-supply.mjs`）。
 */
export interface DistillInputParts {
    sid: string;
    startSeq: number;
    endSeq: number;
    totalChunks: number;
    index: number;
    body: string;
    manifest: string;
    relMemLines: string;
    candidates: string;
    addressLines: string[];
}
export declare function buildDistillUserInput(p: DistillInputParts): string;
