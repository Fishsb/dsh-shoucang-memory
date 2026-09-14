/** 双源读蒸馏审计行（坏行跳过、不可读=空，**零抛出**）。 */
export declare function readDistillAudit(legacyFile: string): Array<Record<string, unknown>>;
/**
 * **双源合并文本**（JSONL）——给"原本就是 `readFileSync(路径,'utf8').split('\n')`"的调用点用：
 * 只换读取表达式即可，**既有的过滤/解析/括号结构一律不动**（改面越小越安全）。
 * 不存在的历史文件 ⇒ 贡献空串（调用方原有的 `existsSync` 守卫可保留，也可直接删）。
 */
export declare function readDistillAuditText(legacyFile: string): string;
