/** 每次枚举最多富化多少个模型的档位（`resolveModelInfo` 是逐模型 RPC；防 N×M 打爆） */
const ENRICH_CAP = 80;
const strOf = (v) => (v === undefined || v === null ? '' : String(v));
/** provider 行的 id 取值（历史实现三写法兼容：id / provider / name —— 保留原语义不收紧） */
function providerIdOf(p) {
    const o = p;
    return strOf(o?.id) || strOf(o?.provider) || strOf(o?.name);
}
/**
 * 建一个**模型目录读取器**（调用方持有，按需调用；本件不缓存、不订阅）。
 *
 * 失败语义：**逐层降级、绝不抛** —— 宿主无 llm ⇒ 空数组；单 provider 枚举失败 ⇒ 跳过该 provider；
 *   单模型档位解析失败 ⇒ 该模型 `efforts:[]`（UI 显示「沿用模型默认」）。这与仓内既有
 *   `llmModelsOf` 的「枚举失败静默」同口径，但**多一层富化**。
 */
export function createLlmCatalog(ctx) {
    return async function listLlmCatalog() {
        const out = [];
        try {
            const llm = ctx?.llm;
            if (!llm || typeof llm.listProviders !== 'function')
                return out;
            const providers = llm.listProviders() || [];
            for (const p of providers) {
                const pid = providerIdOf(p);
                if (!pid)
                    continue;
                if (typeof llm.listModels !== 'function')
                    continue;
                let models = [];
                try {
                    models = (await llm.listModels(pid)) || [];
                }
                catch {
                    continue;
                } // 单 provider 枚举失败跳过
                for (const m of models) {
                    const id = strOf(m?.id);
                    if (!id)
                        continue;
                    const entry = { provider: pid, id, name: strOf(m?.name) || id, efforts: [] };
                    if (out.length < ENRICH_CAP && typeof llm.resolveModelInfo === 'function') {
                        try {
                            const info = await llm.resolveModelInfo(pid, id);
                            const effs = info?.reasoning?.efforts || [];
                            entry.efforts = effs.map((e) => strOf(e?.id)).filter(Boolean);
                            const dflt = strOf(info?.reasoning?.defaultEffort);
                            if (dflt)
                                entry.defaultEffort = dflt;
                            const cw = Number(info?.context?.contextWindow);
                            if (Number.isFinite(cw) && cw > 0)
                                entry.contextWindow = cw;
                        }
                        catch { /* 档位解析失败 ⇒ 保留空档位（UI 显「沿用模型默认」），不抛 */ }
                    }
                    out.push(entry);
                }
            }
        }
        catch { /* 宿主 llm 不可用 = 空目录 */ }
        return out;
    };
}
//# sourceMappingURL=llm-catalog.js.map