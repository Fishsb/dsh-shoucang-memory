import { readBody, sendJson } from './panel-shared.js';
import { evalOptionsOf, EVAL_TIERS } from './eval-config.js';
import { probeEndpoint } from './eval-channel.js';
import { decisionEventOf, evaluateGateOf, hostOf, isLoopbackHost, shapeOf, confidenceMinOf, statsOfLines, EVAL_THRESHOLDS } from './eval-ledger.js';
import { envelopeEvent as envelope } from './event-envelope.js';
import { contractFor } from './panel-contract.js';
import { knowledgeRoot } from './targets.js';
import { readLedgerVolumes } from './ledger-compact.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
/* M1（ACT-283）评估通道白名单。
 * ⚠ 会审 risk 的 D4 已登记「白名单将成第 3 份物理副本」的漂移风险 —— 但本仓门禁
 *   `check-panel-contract` ③ 是**按源码文本正则**解析此处声明并与契约导出逐键比对的，
 *   故**必须**保留字面量数组形态（改成展开式该门会报「源码未找到白名单」）。
 *   双保险而非改形态：① 门禁逐键比对（漂移即红）；② 下方编译期断言（漏键即 typecheck 红）。
 * ⚠ 本条注释**刻意不写字面量示例**：写了会被该门禁的正则先匹配到（本仓既有的
 *   「断言匹配到注释」型缺陷），本轮已实测踩过一次。 */
const EVAL_CONFIG_KEYS = ['evalEnabled', 'evalBaseUrl', 'evalModel', 'evalApiKeyEnv', 'evalTier', 'evalEgressAllow'];
const _evalKeysExhaustive = true;
void _evalKeysExhaustive;
const validateEvalConfig = (patch) => {
    if ('evalEnabled' in patch && typeof patch.evalEnabled !== 'boolean')
        return 'evalEnabled must be boolean';
    if ('evalBaseUrl' in patch && typeof patch.evalBaseUrl !== 'string')
        return 'evalBaseUrl must be string';
    if ('evalModel' in patch && typeof patch.evalModel !== 'string')
        return 'evalModel must be string';
    if ('evalApiKeyEnv' in patch && typeof patch.evalApiKeyEnv !== 'string')
        return 'evalApiKeyEnv must be string';
    if ('evalTier' in patch && !EVAL_TIERS.includes(String(patch.evalTier)))
        return `evalTier must be one of ${EVAL_TIERS.join('|')}`;
    if ('evalEgressAllow' in patch && typeof patch.evalEgressAllow !== 'boolean')
        return 'evalEgressAllow must be boolean';
    return null;
};
/** 评估通道**有效配置**（落盘 ∪ 缺省）—— **单一实现**（沿 `effectiveEmbed` 的教训：避免两处各写一份缺省） */
const effectiveEval = (p) => evalOptionsOf({
    evalEnabled: p.evalEnabled === true,
    evalBaseUrl: String(p.evalBaseUrl || 'http://127.0.0.1:11434/v1'),
    evalModel: String(p.evalModel || 'qwen3:8b'),
    evalApiKeyEnv: String(p.evalApiKeyEnv || 'EVAL_API_KEY'),
    evalTier: EVAL_TIERS.includes(String(p.evalTier)) ? p.evalTier : 'local',
    evalEgressAllow: p.evalEgressAllow === true,
});
/** 配置读写（GET 回 persisted/effective/isDefault；POST 白名单补丁） */
async function evalConfigRoute(d, req, res) {
    try {
        if (req.method === 'POST') {
            const body = (await readBody(req).catch(() => ({})));
            const patch = {};
            for (const k of EVAL_CONFIG_KEYS)
                if (k in body)
                    patch[k] = body[k];
            if (!Object.keys(patch).length)
                return sendJson(res, 400, { error: 'no-eval-keys' });
            const err = validateEvalConfig(patch);
            if (err)
                return sendJson(res, 400, { error: err });
            const merged = { ...d.suite.read(), ...patch };
            d.suite.write(merged);
            d.logger.info?.(`[shoucang] eval config updated: ${Object.keys(patch).join(',')}（重载后生效）`);
            return sendJson(res, 200, { ok: true, merged, reloadRequired: true });
        }
        const p = d.suite.read();
        sendJson(res, 200, {
            persisted: p,
            effective: effectiveEval(p),
            tiers: EVAL_TIERS,
            isDefault: {
                evalEnabled: !('evalEnabled' in p),
                evalBaseUrl: !p.evalBaseUrl,
                evalModel: !p.evalModel,
                evalApiKeyEnv: !p.evalApiKeyEnv,
                evalTier: !p.evalTier,
                evalEgressAllow: !('evalEgressAllow' in p),
            },
        });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
/* M2（ACT-283）判定落账：**并入**既有统一台账 `ledger.jsonl`（type=`eval.decision`）。
 * ⚠ **不新开 .jsonl 流**——`check-observability` 的观测流登记表**只许减不许增**（会审 impl B6）。
 * ⚠ **只落形态不落内容**（沿 `yield-rounds.jsonl` 的既有隐私决定，已被 `check-journal-privacy` 机检钉死）。 */
function appendEvalDecision(rec) {
    try {
        const dir = join(knowledgeRoot(), 'audit');
        mkdirSync(dir, { recursive: true });
        appendFileSync(join(dir, 'ledger.jsonl'), envelope(decisionEventOf(rec), 'eval.decision'), 'utf8');
    }
    catch { /* 落账失败静默（同 `mcl.ts` 的审计纪律：宁可不记，不可打断主线） */ }
}
/** 连通性测试：发一次最小 boolean 问题，回**分态**结果（G3 七态）**并落账**（M2）。 */
async function evalTestRoute(d, _req, res) {
    try {
        const cfg = effectiveEval(d.suite.read());
        const probeState = '[probe] 这是一次连通性测试。';
        const qTypes = ['boolean'];
        const r = await probeEndpoint({ cfg, env: (n) => process.env[n], log: (m) => d.logger.info?.(m) });
        const shape = shapeOf(probeState, qTypes);
        const gate = evaluateGateOf({ outcome: r.outcome, tier: cfg.evalTier, confidence: null });
        const host = hostOf(cfg.evalBaseUrl);
        appendEvalDecision({
            source: 'eval', tier: cfg.evalTier, outcome: r.outcome, why: r.why,
            modelId: cfg.evalModel, destHost: host, destLoopback: isLoopbackHost(host),
            ...shape, confidenceMin: confidenceMinOf(r.answers), fellBack: false, latencyMs: r.latencyMs,
            sid: '-', point: 'probe',
        });
        sendJson(res, 200, {
            ok: r.ok, outcome: r.outcome, why: r.why, latencyMs: r.latencyMs,
            endpoint: cfg.evalBaseUrl, model: cfg.evalModel, tier: cfg.evalTier,
            egress: cfg.evalEgressAllow, enabled: cfg.evalEnabled,
            // M2 新增：按**档位能力**给出的处置建议（native 用校准阈值 / 其余用保守阈值）
            gate: gate.gate, gateWhy: gate.why,
            thresholds: gate.why.startsWith('conf') ? (cfg.evalTier === 'native' ? EVAL_THRESHOLDS.native : EVAL_THRESHOLDS.weak) : null,
            destLoopback: isLoopbackHost(host),
        });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
/* M4（ACT-283）评估通道**只读观测**（册五 + 会审 A9）：把账折成分布 —— 四问必须答得出：
 *   谁做的(`bySource`) / 有无回落(`fellBack`) / 去向哪里(`egressOk`) / 分态是否可辨(`byOutcome`)。
 * ⚠ **M4 不新增端点**：M2 已建 `/eval/stats`，其聚合正答前三问；`recent[]` 补上**逐条明细**
 *   （四问本是**单条**属性 —— "哪一条回落了、去了哪"聚合答不了）。
 *   ⇒ 方案 §4-M4 写的 `/eval/status` 意图**折入本端点**，避免再开一个语义重叠的路由。 */
async function evalStatsRoute(d, req, res) {
    try {
        // 明细条数可由调用方指定（缺省 20；上限 100，防刷爆响应）
        let want = 20;
        try {
            const u = new URL(req.url ?? '/', 'http://127.0.0.1');
            const n = Number(u.searchParams.get('recent'));
            if (Number.isFinite(n) && n >= 0)
                want = Math.min(100, Math.max(0, Math.trunc(n)));
        }
        catch { /* 缺省 20 */ }
        let lines = [];
        try {
            lines = readLedgerVolumes(join(knowledgeRoot(), 'audit', 'ledger.jsonl'));
        }
        catch {
            lines = [];
        }
        const s = statsOfLines(lines, want);
        sendJson(res, 200, {
            ...s,
            // 分态可辨性的**正面断言**：若只有 `ok` 与单一失败态，说明归因仍在塌缩
            distinctOutcomes: Object.keys(s.byOutcome).length,
            recentCount: Array.isArray(s.recent) ? s.recent.length : 0,
            note: s.total === 0 ? '尚无 eval.decision 行（未跑过判定或通道从未开启）' : '',
        });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
/** 装配入口（与 `registerObserveRoutes` / `registerArchRoutes` 同族形态） */
export function registerEvalRoutes(d) {
    d.route('/eval/config', async (req, res) => evalConfigRoute(d, req, res), contractFor('/eval/config'));
    d.route('/eval/test', async (req, res) => evalTestRoute(d, req, res), contractFor('/eval/test'));
    d.route('/eval/stats', async (req, res) => evalStatsRoute(d, req, res), contractFor('/eval/stats'));
}
//# sourceMappingURL=panel-eval.js.map