export interface ActivityHooks {
    audit(o: Record<string, unknown>): void;
    log(msg: string): void;
}
export interface ActivityRow {
    key: string;
    f: string;
    s: string;
    hits: number;
    lastHit: number | null;
    firstSeen: number;
    status: 'active' | 'warm' | 'cold';
}
/**
 * 活性聚合（v1）：只读 access.log + 索引指针 §锚 建立条目宇宙 → 命中计数 → ACT-R 式状态迁移 → 遗忘候选清单。
 * 纯本地、零 LLM、零删除；任何失败只降级（跳过该文件），绝不抛出。
 */
export declare function activityAggregate(memRoot: string, hooks: ActivityHooks): Promise<void>;
