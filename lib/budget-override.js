/**
 * `budget-override.ts` — 注入槽位额度的**配置覆盖层**（2026-09-21 · S3）
 *
 * ── 判因（**差点造出第二个假旋钮**）──────────────────────────────────────────────
 * 「槽位预算接 UI」三册的真缺口是**面板调不到**（`/set` 白名单 27 键里
 * `injection.budgetChars` / `injection.levelCaps` / `injection.situation.budgetChars` **零命中**）。
 * 但**不能只把它们加进 `/set`**：实测运行时的总预算读的是
 * `panel-shared.ts:601` 的 `SURFACE.injection.budgetChars` —— 那是 **`criteria.json` 的构建期投影常量**
 * （`criteria.generated.ts`），**不是** `scheduler.json`。
 * ⇒ 只加白名单 ⇒ 用户改了值写进 `scheduler.json`，而运行时**永远读不到** ⇒
 *   **「看起来能调、调了没用」= 本仓最忌的假旋钮**（先例：`alphaVal` 恒 0 被放弃 · 9 项假旋钮分类）。
 *
 * ⇒ 正解 = **补一条覆盖链**：`scheduler.json`（热覆盖，用户可调）→ 注册表（缺省，单一真源）。
 *   本件是该链的**唯一实现**（`resolveInjectionBudget`），三处消费点共用：
 *   `panel-shared`（总预算 + 情境槽 · 运行时真正裁切的依据）· `scheduler`（zod 缺省）· `panel-config`（面板读数）。
 *
 * ── 边界（刻意不做）────────────────────────────────────────────────────────────
 * · **不改注册表**：`criteria.json` 仍是缺省与文档的**单一真源**；本件只做"热覆盖"。
 * · **不做无界**：每个键都带 `min/max` 夹取（与 `scheduler.ts` 的 zod 范围一致），
 *   越界值**夹取而不静默采用**（并留痕），防把注入面调成 0 或调到爆。
 * · **不新增配置键语义**：键名沿用既有 `inject*` 前缀习惯（`injectBudgetChars` / `injectLevelCaps` /
 *   `injectSituationBudgetChars`），与 `injectRelevance`/`injectFreshSlots` 同族。
 *
 * **纯函数**（零 IO、零依赖、不抛）⇒ 可独立断言，判据 `check-budget-override`。
 */
/** 注入槽位额度的三个可覆盖键（**唯一声明处**；面板白名单 / zod schema / 读数三处均引用此处，不各写一份）。 */
export const BUDGET_OVERRIDE_KEYS = ['injectBudgetChars', 'injectLevelCaps', 'injectSituationBudgetChars'];
/**
 * **容量计数口径「单一实现」**（ADR-333 册零 · 2026-09-22 圆桌会议 8 席确认）。
 *
 * ── 判因（真机实测 · 两套口径互相矛盾）──────────────────────────────────────────
 * 可计数口径曾有**两套**：
 *   · `distill-write.ts:172`（画像硬拒判定）用 `body.length` = **含空白**（USER.md 算 2967）；
 *   · `panel-memory.ts` / `panel-config.ts` / `memory_write_gate.mjs` / `memory-append.mjs`
 *     四处用 `replace(/\s+/g,'').length` = **去空白**（同一文件算 2619）。
 * ⇒ 用户看面板 **87.3%**、写门按 **98.9%** 判（Δ348）——**两个数互相矛盾**：
 *   面板那根进度条**在结构上不可能显示该故障**（用户以为还剩 13%≈390 字符，实际只剩 33）。
 *
 * ── 裁定（ADR-333 §7-O6）：**统一取去空白** ──────────────────────────────────
 * 理由不是"哪个更对"，而是**改动面**：写门脚本与面板**都已是**去空白
 * ⇒ 只改 `distill-write.ts` 一处即得**五者同源**；反向要改四处（含两个子进程活件）。
 *
 * ── 为什么落本件（而非 `targets.ts`）─────────────────────────────────────────
 * 首版落在 `targets.ts`，被 `audit-architecture` 的**导出棘轮**挡下（实测 36 > 35）。
 *   抬棘轮属 R3（须用户拍板）⇒ 本仓既有出路面是把判据放到**领域内聚且有余量**的模块。
 *   本件是「额度/容量」域的纯函数区（零 IO、零依赖、零扇出）⇒ 任何层都可安全引用，语义亦贴切。
 *
 * ⚠ **这是容量计数器（宿主侧）的唯一实现**。子进程脚本 `memory_write_gate.mjs` /
 *   `memory-append.mjs` 是**零依赖活件**（明令不得 import `src/`），各自内联同一公式
 *   ⇒ 由 `scripts/check-capacity-chars.mjs` 做**跨面同源差分锁**（同 `section-ref` 的孪生形态）。
 */
export const capacityCharsOf = (text) => String(text ?? '').replace(/\s+/g, '').length;
/** 各键的**合法范围**（与 `scheduler.ts` 的 zod `min/max` 同值 —— 改一处必须同改，由 `check-budget-override` 机检）。 */
export const BUDGET_RANGES = {
    /* 总预算：下限 1200 = `budgetOf` 自己的钳位地板（低于它 `stable` 会被 `Math.max(200, …)` 顶回，语义混乱） */
    injectBudgetChars: [1200, 20000],
    /* 档位行数上限：`levelCaps` 是 `{low,medium,high,smart}` 对象 ⇒ 此处给**单档上限**的可调范围 */
    injectLevelCaps: [1, 40],
    /* 情境槽预算：0 = 关闭（照抄 `surface.injection.situation.budgetChars=0` 的既有语义） */
    injectSituationBudgetChars: [0, 8000],
};
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
/**
 * 解析**单个数值型额度**：`override`（scheduler.json）优先，越界**夹取并留痕**；否则回落 `registry`。
 *
 * @param key      覆盖键（决定范围）
 * @param override `scheduler.json` 里的值（可为 undefined）
 * @param registry `criteria.json` 投影值（**单一真源缺省**）
 */
export function resolveBudgetNumber(key, override, registry) {
    const [lo, hi] = BUDGET_RANGES[key];
    const reg = num(registry);
    const ov = num(override);
    if (ov === null) {
        /* 注册表值也缺失时给范围下限（**不抛** —— 注入面不应因缺配置而整段失效） */
        return { value: reg === null ? lo : Math.max(lo, Math.min(hi, reg)), clamped: false, source: 'registry' };
    }
    const clamped = ov < lo || ov > hi;
    return { value: Math.max(lo, Math.min(hi, ov)), clamped, source: 'override' };
}
/**
 * 解析**档位行数上限** `{low,medium,high,smart}`：逐档可覆盖，逐档夹取。
 * ⚠ 缺档回落注册表对应档；注册表也缺 ⇒ 整档保持 `undefined`（**由调用方决定**，本件不编造档位）。
 */
export function resolveLevelCaps(override, registry) {
    const [lo, hi] = BUDGET_RANGES.injectLevelCaps;
    const out = {};
    const clamped = [];
    const ov = (override && typeof override === 'object') ? override : {};
    const reg = registry && typeof registry === 'object' ? registry : {};
    for (const k of Object.keys(reg)) {
        const r = num(reg[k]);
        const o = num(ov[k]);
        if (o === null) {
            if (r !== null)
                out[k] = Math.max(lo, Math.min(hi, r));
            continue;
        }
        if (o < lo || o > hi)
            clamped.push(k);
        out[k] = Math.max(lo, Math.min(hi, o));
    }
    return { caps: out, clamped };
}
/**
 * 从 `scheduler.json` 读出**覆盖面**（缺失项即"未覆盖"）。
 * ⚠ 只回**存在**的键 —— 让"未设置"与"设为缺省值"在读数上可分辨
 *   （同 `[原则] 输入量须可见化`：不得把"没设"渲染成"设成了默认"）。
 */
export function budgetOverrideOf(suite) {
    const out = {};
    const s = suite || {};
    for (const k of BUDGET_OVERRIDE_KEYS)
        if (k in s)
            out[k] = s[k];
    return out;
}
/**
 * **一次算清**注入面三个额度：`scheduler.json`（热覆盖）→ 注册表（缺省·单一真源）。
 *
 * ⚠ **为什么抽成聚合函数而不是三处各调一次**：
 *   ① 语义 —— 三者同属"注入面额度"这一件事，散在三处会让"覆盖链"这个概念没有单一落点；
 *   ② 结构 —— 就地内联会把 `panel-shared.ts` 顶爆 `check-module-growth` 的冻结上限（实测 868 > 846），
 *      而该门的**唯一出路**是"新功能落新模块"（抬基线属 R3）⇒ 抽出**同时是收紧**。
 *
 * ⚠ **`situation.enabled` 刻意不覆盖**：开关属「结构声明」（这个槽存不存在），
 *   额度属「运行参数」（这个槽给多少）。把开关也做成热覆盖会让"槽存在与否"随配置漂，
 *   与 `[原则] 契约须描述现状` 冲突 —— 故只覆盖额度。
 *
 * **纯函数**：只读入参，零 IO、零抛错。
 */
export function resolveSupplyBudget(suite, injection) {
    const ov = budgetOverrideOf(suite);
    const inj = injection || {};
    const clamped = [];
    const totalRes = resolveBudgetNumber('injectBudgetChars', ov.injectBudgetChars, inj.budgetChars);
    if (totalRes.clamped)
        clamped.push(`injectBudgetChars→${totalRes.value}（原 ${String(ov.injectBudgetChars)}）`);
    const capsRes = resolveLevelCaps(ov.injectLevelCaps, inj.levelCaps);
    const sitCfg = (inj.situation && typeof inj.situation === 'object') ? inj.situation : {};
    const sitRes = resolveBudgetNumber('injectSituationBudgetChars', ov.injectSituationBudgetChars, sitCfg.budgetChars);
    if (sitRes.clamped)
        clamped.push(`injectSituationBudgetChars→${sitRes.value}（原 ${String(ov.injectSituationBudgetChars)}）`);
    return {
        totalBudget: totalRes.value,
        levelCaps: capsRes.caps,
        /* 注册表说该槽关（`enabled !== true`）⇒ 额度记 0（**与改前同语义**：关闭态不读盘、不占预算） */
        situationBudget: (sitCfg.enabled === true) ? Math.max(0, sitRes.value) : 0,
        clamped,
    };
}
//# sourceMappingURL=budget-override.js.map