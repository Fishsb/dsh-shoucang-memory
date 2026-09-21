// eval-ingest-audit.ts — 评估通道的**真实消费者**：蒸馏索引行的「主题↔概况自洽」只读审计
//
// ── 判因（ACT-293 · 方案档 A4 的落点）──────────────────────────────────────
// A4 验收原文「新件**有真实消费者** + 登记」——实测 `evaluate-channel` 全仓零命中（能跑没人用）。
// 方案档 §4-M3 指定的落点（改 `mcl.ts` 每步判定）是"最难步"：触及冻结件 + 须先解 E-05 竞态。
//
// 本件选择**零冻结件、零竞态**的真消费面：
//   蒸馏写索引行时 `admitIndexRow` 只做**机械**准入（小节存在否/歧义），
//   **从无「这条概况是否真在描述它的主题」的判断**。
//
// ── 能力已实证（**对照实验，非单模型单次** · `_memory/audit/consumer-compare.mjs`）──
//   真库 20 行（产线写入 ⇒ 期望自洽）三模型对照，**同一提示同一数据**：
//     · 本地 qwen3.5:2b（关思考·原生端点）  自洽 15/20 → **假阳性 25.0%** · 101ms
//     · 本地 qwen3:8b（关思考）              自洽 10/20 →   假阳性 50.0% · 987ms
//     · v4.1-flash（云端）                   自洽 17/20 → **假阳性 15.0%** · 3315ms
//   ⇒ 所有模型均**非恒定预测**（75–85% 判自洽）⇒ **能力成立**；弱模型不达标是**选型问题**，
//     不是能力无效（本件一度据 12 条小样本的 67% 假阳性误判为"不可用"并删除，已撤回）。
//   ⇒ 且「假阳性」本身可**由阈值调节**（`eval-ledger#evaluateGateOf` 的 review 带）：
//     本件只产出**判定 + 置信**，是否据此「标记待复核」由调用方按档位阈值定（不在此硬编码）。
//
// ── 三条硬约束（沿本仓既有纪律）────────────────────────────────────────────
//   ① **默认关闭**：`evalEnabled=false` ⇒ 不建钩子，行为与改造前逐字节一致
//   ② **只观测不处置**：本件**绝不修改**模型给的文本；审计结论只进账本
//   ③ **不中断**：任何异常一律 catch ⇒ 放行（同 `mcl.ts` 审计纪律："宁可不记，不可打断主线"）
//
// ⚠ **不新开 .jsonl 流**（`check-observability` 登记表只许减不许增）：判定并入既有 `ledger.jsonl`，
//   type=`eval.decision`，与 `panel-eval` 同信封（`decisionEventOf` 单一实现）。
import { evaluate } from './eval-channel.js';
import { decisionEventOf, hostOf, isLoopbackHost, confidenceMinOf, stateSha8Of } from './eval-ledger.js';
/**
 * 装配入口：**仅当评估开启时才返回钩子**（否则 `undefined` ⇒ 调用方零分支 ⇒ 逐字节一致）。
 * 配置读取在本件内完成，避免把 6 个 eval 键的缺省映射抄成第二份。
 */
export function ingestAuditOf(config, io) {
    const cfg = config || {};
    if (cfg.evalEnabled !== true)
        return undefined; // fail-closed：缺省/关 ⇒ 不接
    const d = {
        cfg: {
            evalEnabled: true,
            evalBaseUrl: String(cfg.evalBaseUrl || ''),
            evalModel: String(cfg.evalModel || ''),
            evalApiKeyEnv: String(cfg.evalApiKeyEnv || 'EVAL_API_KEY'),
            evalTier: String(cfg.evalTier || 'local'),
            evalEgressAllow: cfg.evalEgressAllow === true,
        },
        env: (n) => process.env[n],
        audit: io.audit,
        log: io.log,
    };
    // 返回**吞异常**的包装：钩子抛错不得影响蒸馏主线。
    // ⚠ 返回 `Promise<void>` 是**签名约定**：消费点以 `void dep.auditIndexLine(...)` 调用、
    //   不读返回值（判定只进账本）。三态读取口是 `auditIndexLine` 本身（供测试/影子运行）。
    return async (line, at) => {
        try {
            await auditIndexLine(d, line, at);
        }
        catch { /* 宁可不记，不可打断主线 */ }
    };
}
/** 索引行 → { 主题, 概况 }（沿索引行文法：`[tag] 主题 · 概况 → 指针`）。 */
export function splitIndexLine(line) {
    let body = String(line || '');
    const pmi = body.search(/\s*(?:→|←)\s*/);
    if (pmi >= 0)
        body = body.slice(0, pmi);
    body = body.replace(/^\s*(?:-\s*)?\[[^\]]{1,8}\]\s*/, '');
    const dot = body.indexOf(' · ');
    if (dot < 0)
        return null;
    const topic = body.slice(0, dot).trim();
    const summary = body.slice(dot + 3).trim();
    if (!topic || !summary)
        return null;
    return { topic, summary };
}
/**
 * 审计一条索引行：「该概况是否在描述它的主题」。
 *
 * @returns `'off'`（通道关 / 拆不出 / 判不出 ⇒ **未判，调用方必须放行**）· `'ok'` · `'mismatch'`
 *
 * ⚠ **材料必须含主题**（实测教训）：首版只把「概况」当材料、把主题塞进问题文本
 *   ⇒ 模型看不到两者的**对照**，一律判「不符合」（实测含明确正例）。现材料 = 「主题 · 概况」全文。
 */
export async function auditIndexLine(d, line, at) {
    if (!d.cfg.evalEnabled)
        return 'off';
    const parts = splitIndexLine(line);
    if (!parts)
        return 'off';
    let r;
    try {
        r = await evaluate(d, `${parts.topic} · ${parts.summary}`, {
            matches: {
                type: 'boolean',
                instructions: '上面这对「主题 · 概况」是自洽的（概况确实在描述该主题，而非讲另一件事）。',
            },
        });
    }
    catch {
        return 'off';
    }
    const conf = confidenceMinOf(r.answers);
    const host = hostOf(d.cfg.evalBaseUrl);
    try {
        d.audit(decisionEventOf({
            source: 'eval', tier: d.cfg.evalTier, outcome: r.outcome, why: r.why,
            modelId: d.cfg.evalModel, destHost: host, destLoopback: isLoopbackHost(host),
            stateChars: parts.summary.length, stateSha8: stateSha8Of(parts.summary),
            qCount: 1, qTypes: ['boolean'],
            confidenceMin: conf, fellBack: false, latencyMs: r.latencyMs,
            sid: at.sid, point: 'distill-ingest',
        }));
    }
    catch { /* 落账失败静默 */ }
    if (r.outcome !== 'ok')
        return 'off'; // 未成功判出 ⇒ 既不放行也不拒收
    const ans = r.answers?.matches;
    if (!ans)
        return 'off';
    return ans.value === false ? 'mismatch' : 'ok';
}
//# sourceMappingURL=eval-ingest-audit.js.map