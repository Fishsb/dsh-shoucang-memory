export interface ActivityHooks {
    audit(o: Record<string, unknown>): void;
    log(msg: string): void;
}
export interface ActivityRow {
    key: string;
    f: string;
    s: string;
    hits: number;
    hits30: number;
    days30?: number;
    salience?: number;
    lastHit: number | null;
    firstSeen: number;
    status: 'active' | 'warm' | 'cold';
    retired?: boolean;
}
/** 本地日键 `YYYY-MM-DD`（**导出供复用**：S4Z 收敛 —— 此前 `deepsleep-materials` 因它未导出而复制了一份） */
export declare function dayKey(d: number): string;
/**
 * v7 条目活性聚合（A 步）。
 * 阈值经 opts 传入（UI 通道：面板「参数调节」→ /set → scheduler.json → distill 深睡巡检调用本函数）；
 * 缺省**读登记表**（`activity.statusDays` 三键 + `activity.hotHits`）。
 *
 * ⚠ **round 8（2026-09-20）修正**：原先四行是**裸数值字面量** `?? 14 / ?? 44 / ?? 90 / ?? 23`
 *   —— 与注册表构成**双源**，改注册表**零效果**（值恰好相等，所以行为看不出差别，属"假绿"）。
 *   现改读 `thresholdValue` / `thresholdParam`（唯一读口）；字面量只作**注册表缺项兜底**，
 *   由 `check-threshold-control` 守「登记项必有消费点」。
 */
export declare function activityAggregate(memRoot: string, hooks: ActivityHooks, opts?: Partial<{
    warmDays: number;
    coldDays: number;
    archiveDays: number;
    hotHits: number;
}>): Promise<void>;
