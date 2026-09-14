/**
 * event-envelope.ts — **统一事件信封**（DS4「单一事件源」的形态前置 · 2026-09-13）
 *
 * 为什么要有它（根因 + 副本治理两件事）：
 *
 * **① 根因**：原写法是 `{ at: new Date().toISOString(), ...o }` —— **展开顺序允许调用方用
 *   `at: undefined` 把注入的时间戳覆盖掉**，而 `JSON.stringify` **静默丢弃 undefined 键** ⇒
 *   产出的行没有 `at`，且不报错、不抛异常。实测证据：`check-observability --shape` 读出
 *   `distill-audit` **930 行里有 1 行缺 `at`** —— 不是漏写，是**被覆盖后丢弃**。
 *
 * **② 副本**：该写法在 src 里曾出现 **6 处 / 5 个模块**（`distill-infra` ×4 · `mcl` · `deepsleep-tree` ·
 *   `treeops` ×2 · `vec`）—— 正是本项目一直在剿的「同一事实 N 份副本」。现全部收敛到本件，
 *   并由 `check-observability` 断言**源码中不再出现原始写法**（单一实现）。
 *
 * 语义：把两个**结构性字段放在展开之后**并做有效性兜底 ⇒ 调用方无法把它们弄没：
 *   · `at`   —— 时间（合并 / 排序 / 对账的前提）
 *   · `type` —— 判别字段（合并后靠它区分记录；原先只有 `ledger` 有）
 * 调用方给出的**有效** `at` / `type` 仍被尊重（不覆盖合法值）。
 */
export function envelopeEvent(o, defaultType) {
    return JSON.stringify({
        ...o,
        at: typeof o.at === 'string' && o.at ? o.at : new Date().toISOString(),
        type: typeof o.type === 'string' && o.type ? o.type : defaultType,
    }) + '\n';
}
//# sourceMappingURL=event-envelope.js.map