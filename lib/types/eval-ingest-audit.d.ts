import type { EvalDecisionRow } from './eval-ledger.js';
/** 本件的窄依赖（模块级实现 + 依赖作首参，沿仓内约定）。 */
export interface EvalIngestDeps {
    cfg: {
        evalEnabled: boolean;
        evalBaseUrl: string;
        evalModel: string;
        evalApiKeyEnv: string;
        evalTier: string;
        evalEgressAllow: boolean;
    };
    env(name: string): string | undefined;
    audit(rec: EvalDecisionRow): void;
    log?(msg: string): void;
}
/** 装配入参：结构化窄接口（`DistillConfig` 无索引签名，宽类型会逼调用方 `as any`）。 */
export interface IngestAuditConfig {
    evalEnabled?: boolean;
    evalBaseUrl?: string;
    evalModel?: string;
    evalApiKeyEnv?: string;
    evalTier?: string;
    evalEgressAllow?: boolean;
}
/**
 * 装配入口：**仅当评估开启时才返回钩子**（否则 `undefined` ⇒ 调用方零分支 ⇒ 逐字节一致）。
 * 配置读取在本件内完成，避免把 6 个 eval 键的缺省映射抄成第二份。
 */
export declare function ingestAuditOf(config: IngestAuditConfig | undefined, io: {
    log?(m: string): void;
    audit(rec: EvalDecisionRow): void;
}): ((line: string, at: {
    sid: string;
    target: string;
}) => Promise<void>) | undefined;
/** 索引行 → { 主题, 概况 }（沿索引行文法：`[tag] 主题 · 概况 → 指针`）。 */
export declare function splitIndexLine(line: string): {
    topic: string;
    summary: string;
} | null;
/**
 * 审计一条索引行：「该概况是否在描述它的主题」。
 *
 * @returns `'off'`（通道关 / 拆不出 / 判不出 ⇒ **未判，调用方必须放行**）· `'ok'` · `'mismatch'`
 *
 * ⚠ **材料必须含主题**（实测教训）：首版只把「概况」当材料、把主题塞进问题文本
 *   ⇒ 模型看不到两者的**对照**，一律判「不符合」（实测含明确正例）。现材料 = 「主题 · 概况」全文。
 */
export declare function auditIndexLine(d: EvalIngestDeps, line: string, at: {
    sid: string;
    target: string;
}): Promise<'off' | 'ok' | 'mismatch'>;
