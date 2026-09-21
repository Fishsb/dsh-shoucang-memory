// eval-config.ts — 「可配置评估通道」配置域（M1 · 2026-09-21 · ACT-283）
//
// 为什么单独成件（**按领域接缝，不是按行数硬切**）：本仓有两条硬约束夹住了 scheduler——
//   ① `check-module-growth` 对 `src/scheduler.ts` 有冻结棘轮，**实测 610 / 基线 606（+4 / 容差 15）**
//      ⇒ 再加 6 个 eval 键会继续逼近容差；
//   ② `audit-wiring` 的 I2（依赖包 ≤12 字段）与 I1（装配 ≤120 行）同为棘轮。
//   门禁自身给出的既有出路就是「按**领域接缝**拆出一块」——先例三处：`probe-config.ts`（因 scheduler
//   冻结棘轮抽出）· `probe-plan.ts` / `trigger-plan.ts`（因 `deepsleep-core` 导出棘轮抽出）。
//   本域 6 键**同属一条链路**（评估通道：开关 / 端基址 / 模型 / key 环境变量名 / 档位 / 出网许可）
//   且**只被评估通道消费** ⇒ 内聚度天然成立。
//
// ⚠ **类型侧与 schema 侧同处一文件** —— 防"两处各写一份"（本仓已登记的漂移源形态：schema 有 ≠ 运行时 config 有）。
// ⚠ schema 库是 **`schemastery`**（宿主体系，**不是 zod**）——与 `scheduler.ts` 同源。
// ⚠ **零硬编码本机路径**（开源红线）：`evalBaseUrl` 的缺省值走**同仓既有的本机 Ollama 基址**，
//   与 `embedBaseUrl` 的缺省同源（同一个 `effectiveEmbed` 语义族），不是新引入的本机路径。
import z from 'schemastery';
/** 档位枚举（**const union**，防死开关）。可执行依据：`scheduler.ts` 的 `storeMode` 先例—— */
/** 「设 `storeMode:'record'` 不报错、只静默无动作」，故该处改为 const union 并注「防死开关」（risk D3）。 */
export const EVAL_TIERS = ['local', 'fast', 'native', 'llm'];
/**
 * 评估域 schema（**供 `Config` 展开**：`...evalConfigSchema`）。
 * ⚠ 与 `probeConfigSchema` 同法：**声明与投影同文件**，防两处漂移。
 */
export const evalConfigSchema = {
    evalEnabled: z.boolean().default(false).description('可配置评估通道（缺省**关**=fail-closed：关闭时行为与改造前逐字节一致）。开=类型化决策可用（choice/boolean/score）'),
    evalBaseUrl: z.string().default('http://127.0.0.1:11434/v1').description('OpenAI 兼容 /chat/completions 基址（缺省本机 Ollama :11434，**免 key**；换云端改此键 + evalApiKeyEnv）'),
    evalModel: z.string().default('qwen3:8b').description('评估模型名（缺省 qwen3:8b：本机已装免 key；闸门实测中文类型化 19/20）。⚠ 若按某版本校准过阈值，应 **pin 版本 ID** 而非用浮动别名'),
    evalApiKeyEnv: z.string().default('EVAL_API_KEY').description('API key 环境变量名（本地免 key；云端须设，**不落盘**）'),
    evalTier: z.union(EVAL_TIERS.map((t) => z.const(t))).default('local').description("档位：'local' 本地零成本（缺省）| 'fast' 远程小快 | 'native' 原生校准（TypeSafe）| 'llm' 现有大模型。⚠ const union 防死开关（先例 scheduler.storeMode）"),
    evalEgressAllow: z.boolean().default(false).description('**出网许可**（缺省 false）：向**非 loopback** 端点发送内容须显式开启。与 evalEnabled **分离**——「允许装外部服务」≠「允许记忆内容出机」'),
};
/** 把评估域的运行时取值从 config 投影出来（**显式映射**，防漏键；与 `probeOptionsOf` 同法）。 */
export const evalOptionsOf = (config) => ({
    evalEnabled: config.evalEnabled,
    evalBaseUrl: config.evalBaseUrl,
    evalModel: config.evalModel,
    evalApiKeyEnv: config.evalApiKeyEnv,
    evalTier: config.evalTier,
    evalEgressAllow: config.evalEgressAllow,
});
/* ══ 判定辅助（**纯函数、零 IO** · 供消费侧复用，避免各处重写） ═══════════════════════
 * 这两条是 G1 出网条款的**可执行部分**：把"发不发得出去"变成代码里的判据，
 * 而不是靠注释约定（本仓教训：名字比能力大的东西最危险）。
 */
/**
 * **解析后的 hostname** 判定 loopback（G1 条款）。
 *
 * ⚠ **为什么不用仓内既有的两份 `isLocal` 正则**（会审实测结论，edge + 主持人两轮 13 例 URL 对拍）：
 *   · `src/vec.ts:243`：漏 `127.0.0.2`/`[::1]`/无尾斜杠/大写（`http://LOCALHOST:1/v1` 判 remote）；
 *   · `src/panel-shared.ts:803` `isLocalBase`：**方向不安全** —— `http://127.0.0.1.evil.com/v1`
 *     与 `http://localhost:11434@evil.com/v1` 均被其判为 **LOCAL**（缺尾 `/` 要求、未锚定 host）。
 *   ⇒ 出网判定**一律走解析后的 hostname**（`new URL().hostname`），这是三份实现里唯一无漏无误的。
 */
export function isLoopbackUrl(raw) {
    let h = '';
    try {
        h = new URL(String(raw || '').trim()).hostname.toLowerCase();
    }
    catch {
        return false;
    }
    if (!h)
        return false;
    if (h === 'localhost' || h === '[::1]' || h === '::1')
        return true;
    // 127.0.0.0/8 整段（不只是 127.0.0.1）
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (m)
        return Number(m[1]) === 127;
    return false;
}
/**
 * **能否把 `state` 发往该端点**（G1 条款 ①+② 的可执行合取）。
 * 语义（**只用于收紧，不用于放宽**）：loopback ⇒ 允许；非 loopback ⇒ 须 `evalEgressAllow`。
 */
export function egressAllowed(cfg) {
    if (!cfg.evalBaseUrl)
        return { ok: false, why: 'endpoint-empty' };
    if (isLoopbackUrl(cfg.evalBaseUrl))
        return { ok: true, why: 'loopback' };
    if (!cfg.evalEgressAllow)
        return { ok: false, why: 'egress-not-allowed' };
    return { ok: true, why: 'egress-allowed' };
}
//# sourceMappingURL=eval-config.js.map