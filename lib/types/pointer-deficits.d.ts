export type DeficitKind = 'empty-landing' | 'empty-section' | 'anchor-needed' | 'knowledge-defer';
export interface DeficitRow {
    kind: DeficitKind;
    /** `notes/x.md §标题`（空壳标题 = 该节自身；落点 = 该节自身） */
    ref: string;
    /** 来源说明（主档行 / 全库巡检 / 台账 / pending 卡） */
    detail: string;
}
/** 全库空壳标题（`##`~`####`，正文 0 非空行；不论有无引用） */
export declare function scanEmptySections(bankRoot: string): DeficitRow[];
/** 主档（MEMORY/AGENT/USER）里**落点为空格**的指针行（读侧回落语义：取最后一个可解析部分） */
export declare function scanEmptyLandings(bankRoot: string): DeficitRow[];
/** 台账 `type=anchor-needed`（蒸馏写侧登记的"需人工建锚"；同 target§section 只留一条） */
export declare function readAnchorNeeded(ledgerFile: string, limitLines?: number): DeficitRow[];
/** `pending/-knowledge-defer-*.md`（未落地知识回退卡；同文件名只留一条） */
export declare function readKnowledgeDefers(pendDir: string): DeficitRow[];
/** 主档指针统计（**判据件与运行时共用同一实现**，避免"检查器自己再写一份扫描"） */
export declare function pointerStats(bankRoot: string): {
    pointers: number;
    rows: number;
    unresolvable: number;
    emptyLandings: DeficitRow[];
    emptySections: DeficitRow[];
};
export interface DeferredQueue {
    counts: Record<DeficitKind, number>;
    total: number;
    rows: DeficitRow[];
}
/** **统一只读出口**：四个来源合并（空壳落点 / 全库空壳 / 台账 anchor-needed / pending 知识回退） */
export declare function deferredQueueOf(d: {
    bankRoot: string;
    kRoot: string;
}): DeferredQueue;
/** 回退卡文件名（幂等命名：同 (源, 目标形态, 内容) ⇒ 同路径）——`distill-write` 的同类卡复用本函数 */
export declare const knowledgeDeferFileOf: (pendDir: string, sid: string, line: string, now?: Date) => string;
/**
 * **幂等登记闭环**（周期巡检调用）：把**新**出现的缺陷登记成待认领卡。
 *   · 只登记 `empty-landing` / `empty-section` 两类（`anchor-needed` 已是台账行、`knowledge-defer` 已是卡，无需再登记）；
 *   · 同 (源, 形态, ref) ⇒ 同文件 ⇒ 已存在即跳过（**幂等**，反复巡检不膨胀）；
 *   · **不建锚、不回填**（边界见文件头）；登记卡只是"可捞"的载体。
 */
export declare function registerDeficits(d: {
    bankRoot: string;
    kRoot: string;
    now?: Date;
}): {
    scanned: number;
    written: number;
    skipped: number;
    files: string[];
};
