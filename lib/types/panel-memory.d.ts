import type { PanelLogger, RouteFn, SuiteConfigAccess } from './panel-shared.js';
export interface MemoryDeps {
    route: RouteFn;
    suite: SuiteConfigAccess;
    logger: PanelLogger;
}
export interface MemIndexEntry {
    tag: string;
    subject: string;
    pointer: string;
}
/** 索引行：`[标签] 主题 · 概况 → notes/x.md §小节`（只留三字段，`raw` 不进响应——见上方册零说明）
 *
 * ⚠ **行尾空白必须先剥（2026-09-24 真机缺陷 · 本件是仓内唯一未剥的解析点）**：
 *   `split(/\r?\n/)` 只吃掉**一个** `\r`；文件若带多枚行尾 CR（实测真库 MEMORY.md 曾
 *   597 行是 `\r\r\r\r` / 268 行是 `\r\r\r`），残留的 `\r` 会让正则**整行失配** ——
 *   因为 `.` 不匹配 `\r`、而 `$` 要求真行尾。后果不是报错，是**静默吞行**：
 *   实测 890 条只解析出 **21** 条（吞吐 2.4%）且面板无任何异常提示。
 *   ⇒ 与仓内同族口径（`targets#scanIndexRows` / `count-memory-lines.mjs` 均先 `trim`）
 *     保持一致：这里取 `trimEnd()` 而非 `trim()`，**只剥行尾**，保住 `^\[` 的
 *     「列首锚定」语义不变（不得因宽容行尾而顺带接受行首缩进的行）。
 *   回归守：`scripts/check-index-parse-cr.mjs`（含变异自证）。
 *   ⚠ **导出仅为可机检**（行为面判定必须能 import 求值，不能 grep 源码判绿）：
 *     这是本仓"数值/语义口径要有可复算实现"的既有纪律（同 `count-memory-lines` 的立件理由）。 */
export declare const parseIndexLines: (text: string) => MemIndexEntry[];
export declare function registerMemoryRoutes(d: MemoryDeps): void;
