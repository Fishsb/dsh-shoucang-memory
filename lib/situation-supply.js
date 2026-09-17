/**
 * situation-supply.ts — **情境槽的读侧供给**（2026-09-17 自 `panel-shared.ts` 抽出）
 *
 * 为什么单独成件：`panel-shared.ts` 受 `check-module-growth` 的**大模块冻结棘轮**约束
 *   （实测有效行数 547 / 基线 547 ⇒ **顶格、余量 0**，且不在 15 行容差名单内）。
 *   本轮要在 `sitCtx` 补第二个键（`task`）——**加一行即撞顶**。
 *   ⇒ 先抽这两件叶子逻辑腾出空间，再改。此即该门禁自己给出的出路（"新功能落新模块"），
 *   与 `dynamic-select.ts` / `injection-playbook.ts` 的抽出先例同规格（不是为拆而拆）。
 *
 * 依赖方向：`panel-shared(L5)` → `record-shadow(L2)` / `ring-supply` —— 高依赖低，无环。
 * 边界：**只做"读盘 + 选行"**；装配（预算/槽序/记账）仍归 `supply-assembly`（唯一装配实现）。
 * 零抛出：情境层拿不到就当空（**绝不打断装配** —— 记忆是增强，不是主路径）。
 *
 * ⚠ **逐字等价**：本件与抽出前的 `panel-shared#situationLinesOf` 行为**完全相同**
 *   （同一 `SURFACE` 读取、同一 `adaptiveTopN` 调用、同一零抛出）；证据见 `test-situation-supply-split`。
 */
import { SURFACE } from './criteria.generated.js';
import { loadStore } from './record-shadow.js';
import { createRingSupplyApi, adaptiveTopN, parseCues } from './ring-supply.js';
/**
 * **写侧已有的全部 `task=` 键**（2026-09-17）。
 *
 * 用途：读侧 `sitCtx` 补 `task` 键时的**受控候选词表** —— 只允许从写侧真实存在的键里挑，
 *   禁从 query 硬抽（中文恒空、英文过匹配，均有实测；见 `situation-key#taskCueOf`）。
 *
 * 为什么按需现算而不落注册表：键集合**随库增长**（现 46 个），写死即静态快照 ⇒ 新任务型永远匹配不上。
 * 开销：只在 `sitBudget > 0` 时读盘一次（与 `situationLinesOf` 同源、同在装配路径上，不新增 IO 次数）。
 * 零抛出：拿不到就当空表（`taskCueOf` 返回 `''` ⇒ 该维承认缺席，不硬造）。
 */
export function knownTaskCuesOf(memRoot) {
    try {
        const { records } = loadStore(memRoot);
        if (!records?.length)
            return [];
        const out = new Set();
        for (const r of records) {
            for (const k of parseCues(r.meta?.cues)) {
                if (k.startsWith('task='))
                    out.add(k.slice(5).trim());
            }
        }
        out.delete('');
        return [...out];
    }
    catch {
        return [];
    }
}
/**
 * **情境槽候选**（P3 · 2026-09-14 原实现迁自 `panel-shared#situationLinesOf`，逐字等价）。
 * 只在预算 > 0 且 cues 非空时才读盘（缺省 `budgetChars=0` ⇒ **零开销、零行为变化**）。
 */
export function situationLinesOf(memRoot, cues, at, budget) {
    if (budget <= 0 || !cues.length)
        return [];
    try {
        const { records } = loadStore(memRoot);
        if (!records || !records.length)
            return [];
        const s = SURFACE.injection.situation;
        const api = createRingSupplyApi({ rings: (s?.ringOrder ?? []), topN: adaptiveTopN(records, s?.topN, s?.adaptive !== false) });
        return api.lines(records, cues, at);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=situation-supply.js.map