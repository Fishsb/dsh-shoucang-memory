export type DeficitKind = 'empty-landing' | 'empty-section' | 'anchor-needed' | 'knowledge-defer';
export interface DeficitRow {
    kind: DeficitKind;
    /** `notes/x.md §标题`（空壳标题 = 该节自身；落点 = 该节自身） */
    ref: string;
    /** 来源说明（主档行 / 全库巡检 / 台账 / pending 卡） */
    detail: string;
    /** 台账 anchor-needed 专用：该小节**现在是否仍不存在**（`true`=真缺陷 / `false`=过时项 / `undefined`=未判） */
    stillMissing?: boolean;
}
/** 全库空壳标题（`##`~`####`，正文 0 非空行；不论有无引用） */
export declare function scanEmptySections(bankRoot: string): DeficitRow[];
/** 主档（MEMORY/AGENT/USER）里**落点为空格**的指针行（读侧回落语义：取最后一个可解析部分） */
export declare function scanEmptyLandings(bankRoot: string): DeficitRow[];
/**
 * 台账 `type=anchor-needed`（蒸馏写侧登记的"需人工建锚"；同 target§section 只留一条）。
 *
 * ⚠ **必须读全量 + 读全部卷**（G12/G13 · 2026-09-19 真机暴露两次）：
 *   ① 原先缺省 `slice(-4000)` 只回读末 4000 行，而真库台账已 **2.2 万行**
 *      ⇒ **靠前的缺陷行被静默漏掉**（实测：出口报 **25** 条，全量 **33** 条）；
 *   ② 即便改成"全量读主档"仍不够——台账有**按大小轮转**（`rotateBySize` ⇒ `ledger.jsonl.1`），
 *      实测 17:45 轮转后主档只剩 105 行，**33 条 anchor 行全在旧卷** ⇒ 只读主档读数变 **0**（全盲）。
 *   现改为复用**既有单一实现** `ledger-compact#readLedgerVolumes`（跨档按时间序、不可读档跳过），
 *   不再自写"读哪些文件"的逻辑（避免又一份口径）。
 *
 * 传入 `bankRoot` 时对每行判 `stillMissing`：指向**已存在**小节的行是**过时项**
 *   （小节后来经别的路径建好了）⇒ 由 `deferredQueueOf` 归入 `staleAnchor`，**不再冒充缺陷**。
 */
export declare function readAnchorNeeded(ledgerFile: string, bankRoot?: string): DeficitRow[];
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
    /** 台账 anchor-needed 中**指向已存在小节**的过时项条数（不计入 counts/rows，但显式可见） */
    staleAnchor: number;
    /** 过时项 ref 清单（供人工复核；不静默丢弃） */
    staleRefs: string[];
}
/**
 * **统一只读出口**：四个来源合并（空壳落点 / 全库空壳 / 台账 anchor-needed / pending 知识回退）。
 * 不变量：`rows.length === total === Σcounts`——**清单与计数同源**（stale 项单列，不进这一组）。
 */
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
