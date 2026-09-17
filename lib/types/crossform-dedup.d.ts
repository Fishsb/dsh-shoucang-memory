/** 注入侧消重阈值（**登记表单一事实源**；`check-threshold-registry` 的 probe 锚点）。 */
export declare const CROSS_FORM_DEDUP_SIM = 0.8;
export interface DedupSkipReason {
    /** 被跳过的细粒度行（逐字）。 */
    line: string;
    /** 覆盖它的粗粒度行（逐字）。 */
    by: string;
    /** 相似度。 */
    sim: number;
}
export interface DedupResult {
    skip: string[];
    reasons: DedupSkipReason[];
    note: string;
    stat: {
        coarse: number;
        fine: number;
        embedded: number;
    };
}
/** 从 `~/.dsh/suite/scheduler.json` 造 embed 配置（**自包含**：预热只需 memRoot，零跨域依赖）。 */
export declare function embedCfgFromSuite(home?: string): {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKeyEnv: string;
};
/**
 * 计算"注入时应跳过的细粒度行"。**纯读 + 向量**，不写任何文件。
 * 向量不可用/异常 ⇒ 空 `skip` **并给出原因**（fail-open；仓内口径：不可用即如实记"未判"）。
 */
export declare function crossFormCovered(memRoot: string, embedCfg: unknown, opts?: {
    threshold?: number;
}): Promise<DedupResult>;
/** 过滤注入**行**（纯函数：逐字比对，不做模糊匹配 —— 避免"消重"自身引入不确定性）。
 *  ⚠ **两侧对称 trim**：文本行与 skip 条目都 trim 后再比 —— 首版只 trim 文本侧 ⇒
 *    skip 条目带首尾空白时**不命中**（实测被 `test-inject-dedup` ⑤ 抓到，18/19）。 */
export declare function filterInjected(lines: readonly string[], skip: readonly string[]): string[];
/** 过滤**注入文本**（整段；逐行逐字比对，保留行序）。fail-open：`skip` 空 ⇒ **原样返回**。 */
export declare function filterInjectedText(text: string, skip: readonly string[]): string;
/** 预热（**fire-and-forget 安全**：并发只跑一次；失败不抛、不影响注入）。 */
export declare function warmInjectDedup(memRoot: string, opts?: {
    threshold?: number;
    embedCfg?: unknown;
}): Promise<void>;
/** 同步取用（注入路径每步调用；**O(1)**，无 IO）。 */
export declare function dedupState(): {
    skip: readonly string[];
    reasons: readonly DedupSkipReason[];
    note: string;
    warmedAt: number;
};
