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
    lastHit: number | null;
    firstSeen: number;
    status: 'active' | 'warm' | 'cold';
    retired?: boolean;
}
/**
 * v7 条目活性聚合（A 步）。
 * 阈值经 opts 传入（UI 通道：面板「参数调节」→ /set → scheduler.json → distill 深睡巡检调用本函数）；
 * 缺省 14/44/90/5 与 scheduler zod 默认一致（activityWarmDays/activityColdDays/activityArchiveDays/activityHotHits）。
 */
export declare function activityAggregate(memRoot: string, hooks: ActivityHooks, opts?: Partial<{
    warmDays: number;
    coldDays: number;
    archiveDays: number;
    hotHits: number;
}>): Promise<void>;
