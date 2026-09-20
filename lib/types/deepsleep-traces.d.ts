/** 痕迹采集的全部依赖：两个候选目录 + 一条审计流。 */
export interface TraceDeps {
    candidateDir: string;
    pendDir: string;
    auditFile: string;
}
/**
 * **窗口内痕迹文件枚举**（`pending/` + `notes/`，按 mtime ≥ since）。
 *
 * 抽出的理由（2026-09-20 round 9 · S-P1b″ 口径定案）：
 *   `trigger.newTracesMin` 注册名是「窗口内最少新痕迹**数**」，而消费点比较的是
 *   `gatherDeepSleepTraces(...).length` —— **材料段字符串的字符数**，不是痕迹数。
 *   ⇒ 值 `1` 时两者恰好同效（非空 ⇔ ≥1 条），但这个**名实不符是潜伏的**：一旦有人把
 *     该值调到 3，名字说"至少 3 个痕迹文件"，行为却是"材料段至少 3 个字符"（**必然通过**）。
 *   本函数把这个**真正的轴**变成可测量量（进审计 `traceFiles`），使"改值"这件事
 *   第一次有真机分布可依，而不是靠猜（仓内纪律：样本不足写 `insufficient-data`，不猜方向）。
 */
export declare function enumerateWindowTraces(d: TraceDeps, memRoot: string, since: number): {
    pend: string[];
    notes: string[];
};
/** **窗口内痕迹文件数**（`newTracesMin` 的**注册语义**所指的那个量）。
 *  ⚠ 与 `gatherDeepSleepTraces(...).length`（材料段字符数）**不是一个量** —— 两者当前都被
 *    "痕迹"一词覆盖，是本轮定案的病灶；本函数的存在让二者此后**可分辨**。 */
export declare function countWindowTraces(d: TraceDeps, memRoot: string, since: number): number;
export declare function gatherDeepSleepTraces(d: TraceDeps, memRoot: string, since: number): string;
