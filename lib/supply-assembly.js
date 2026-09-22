import { isLive } from './fact-ring.js';
import { ringOfKind } from './rings.js';
import { indexRowInLayer, indexRowTag, isProfileRow } from './targets.js';
/** 缺省 = 方案档 §13 #3 的注入硬顶（恒定 1,000 / 变动 600 / 一次性 200）；联想与情境槽缺省关 */
export const DEFAULT_BUDGET = { stable: 1000, dynamic: 600, oneshot: 200, serendipity: 0, situation: 0 };
/**
 * S4-1（2026-09-14）**预算口径的单一实现**：按总预算派生三层额度。
 *
 * 判因：这条公式此前**只写在 `panel-shared#buildHotMemoryText` 里**（手写三行），而 `DEFAULT_BUDGET`
 *   是另一套固定值 —— 同一件事两处口径，且**运行时的真实额度只存在于那一处代码里**
 *   （装配器拿到的 `stable` 是 1000，主路径实际是 3200，**差 3 倍**）⇒ 抽成单一实现。
 *
 * ⚠ **与 `DEFAULT_BUDGET` 的区别（不可互换）**：后者是**无总预算上下文时的固定缺省**（离线预览用）；
 *   本函数是**运行时按注册表总预算派生**（`stable` 吃余额，故远大于 1000）。
 *   这就是 S4-1「统一口径」的**边界**：统一的是**公式**，不是"把所有场景压成同一组数"。
 *
 * 与改前手写实现**逐式等价**（由 `scripts/test-budget-single.mjs` 内联旧公式作夹具比对）
 *   ⇒ 数值不变、**注入文本不变** —— 这正是本项能自主推进、无须产品决策的前提。
 */
export function budgetOf(totalChars) {
    const total = Math.max(1200, Number(totalChars) || 4000);
    const oneshot = Math.max(80, Math.min(200, Math.round(total * 0.05)));
    const dynamic = Math.max(120, Math.min(600, Math.round(total * 0.15)));
    return { stable: Math.max(200, total - oneshot - dynamic), dynamic, oneshot, serendipity: 0, situation: 0 };
}
/**
 * 按字符预算逐行保留；返回 `[保留行, **被丢弃的行**]`。
 *
 * **归属**（S4R/R2 迁移）：本件从 `panel-shared` 迁来 —— 它是**裁切**（装配域），与 `budgetOf` /
 *   `assembleSupply` 同域，**放在 panel 侧本就是错位**（迁移同时解冻了 `panel-shared` 的冻结棘轮）。
 *
 * S4R/R2 语义变更：原先只返回"丢了几行"（`number`）⇒ 账**无法逐条比对**，只能是近似值。
 *   返回内容后账可**逐条核**（B2 的判据要求"逐条可比内容"）。
 *   **裁切行为不变**：保留集与丢弃集与原实现完全相同（`lines.length - out.length` → `lines.slice(out.length)`）。
 */
export const clampLines = (lines, cap) => {
    const out = [];
    let used = 0;
    for (const l of lines) {
        if (out.length && used + l.length + 1 > cap)
            return [out, lines.slice(out.length)];
        out.push(l);
        used += l.length + 1;
    }
    return [out, []];
};
/* ⚠ **单位错误修正（2026-09-22）**：原式末尾有 `+ (b.process ?? 0)` —— 而 `process` 槽在调用点
 *   （`panel-shared.ts#buildHotMemoryText`）传的是**行数**（`procPicked.length`），把它加进**字符**
 *   总额属**量纲混用**；且注册表明写该槽「**不参与限额**」（零挤占，见 `surface.injection.process.note`）
 *   ⇒ 它**不得**计入任何"预算总额"。移除后本函数语义收敛为「**参与限额的槽**的额度之和」。
 *   影响面实测：主路径传 `opts.budgetTotal` 覆盖，故该处数值本未受影响；但本函数是**公开导出**，
 *   `scripts/supply-preview.mjs`（离线预览）直接用 ⇒ 那里它是**真错**。 */
export function budgetTotalOf(b) {
    return b.stable + b.dynamic + b.oneshot + b.serendipity + b.situation;
}
/**
 * **溢出判据（单一实现 · 2026-09-22 修正）** —— 逐槽比**该槽自己的**额度。
 *
 * ── 判因（真机实测 · **恒真旋钮**，同 `switchSource 95.7% 恒真` 家族）────────────────
 * 原式两处（`supplyMetaOf` / `assembleSupply`）皆写：
 *   `overBudget: chars > budgetTotal || stableChars > budget.stable`
 * 而 `chars` 是**全部槽**字符之和 —— 其中 `situation`（独立预算）与 `process`（**不参与限额**，
 * 注册表原文「不吃 dynamic 额度 · 零挤占」）**根本不在那三层预算里**。
 * 真机读数（2026-09-22 · `/inject/preview`）：
 *   `chars=4064 > budgetTotal=4000 ⇒ overBudget=true`，而**三层逐项都没超**
 *   （stable 2799/3200 · dynamic 360/600 · oneshot 70/200）、
 *   `situation` 也是 615/1200 ⇒ **真实结论应为 false**。
 *   实测跨 6 个 query：**空 query 才 false，其余 5 个恒 true** —— 典型恒真。
 * ⇒ 改为**逐槽比自身额度**：任何"参与限额的槽"超了才算溢出。
 *   等价性：`chars > budgetTotal` 在全槽受限时**由逐槽条件蕴含**（各项 ≤ 各自额度 ⇒ 和 ≤ 总额度），
 *   故删掉总量项**不放松**任何真实溢出，只消除"非受限槽撑大分子"的假阳性。
 *   ⚠ `stable` 项含 `core`（核心必进、**超额度也进**）—— 这正是它必须逐槽判而非看总量的原因。
 */
export function isOverBudget(used, budget) {
    return used.stable > budget.stable
        || used.dynamic > budget.dynamic
        || used.oneshot > budget.oneshot
        || (used.serendipity ?? 0) > (budget.serendipity ?? 0)
        || (used.situation ?? 0) > (budget.situation ?? 0);
}
const SLOT_WHY = {
    core: '核心必进（不计入预算判定）',
    stable: '恒定面（P 层 always + 画像行）预算',
    dynamic: '变动面预算',
    oneshot: '一次性面预算',
    process: '中层 process 槽（**外接追加，零挤占** —— 只补账，不参与限额）',
    serendipity: '越界联想槽预算',
    situation: '情境槽预算',
};
/**
 * **账：由真实裁切直出**（纯函数、零 I/O、零重算）。
 * 入参 = 每槽**实际**保留的行与被丢的行（主路径产出）⇒ 账与文本**同源**，不可能漂移。
 * 不变式：`kept + dropped == 候选数`（由调用方保证；`test-usage-truth` 逐条核）。
 */
export function supplyMetaOf(outcomes, budget, opts = {}) {
    const slots = {};
    const kept = {};
    const dropped = [];
    let chars = 0;
    /* 逐槽实耗字符（**只为溢出判定** —— 不参与任何切割；切割语义仍归各领域） */
    const used = { stable: 0, dynamic: 0, oneshot: 0, serendipity: 0, situation: 0 };
    for (const slot of ['core', 'stable', 'dynamic', 'oneshot', 'process', 'serendipity', 'situation']) {
        const o = outcomes[slot];
        const kLines = (o?.kept ?? []).map(String);
        const kChars = kLines.reduce((n, s) => n + s.length + 1, 0);
        chars += kChars;
        // `core` 与 `stable` **同属恒定面额度**（core 必进、超额度也进 ⇒ 逐槽判据据此才成立）；
        // `process` 槽**不计入任何额度**（外接追加、零挤占）⇒ 此处刻意不累计。
        if (slot === 'stable' || slot === 'core')
            used.stable += kChars;
        else if (slot in used)
            used[slot] += kChars;
        const dRows = (o?.droppedRows ?? []).map(String);
        for (const line of dRows)
            dropped.push({ slot, line, why: `${slot}：${o?.why ?? SLOT_WHY[slot]}` });
        kept[slot] = kLines.length;
        slots[slot] = { kept: kLines.length, chars: kChars, dropped: dRows.length };
    }
    const budgetTotal = Number(opts.budgetTotal ?? budgetTotalOf(budget));
    return {
        chars,
        budgetTotal,
        /* 溢出判据走**单一实现**（逐槽比自身额度；判因见 `isOverBudget` 抬头）。
         * ⚠ 旧式 `chars > budgetTotal || stableChars > budget.stable` 已删 —— 它被
         *   `situation`/`process`（**不吃三层额度**）撑大分子 ⇒ 真机恒 true。 */
        overBudget: isOverBudget(used, budget),
        serendipityEnabled: budget.serendipity > 0,
        situationEnabled: budget.situation > 0,
        kept,
        slots,
        dropped,
    };
}
export const DEFAULT_CORE_TAGS = ['身份', '使命', '边界'];
/**
 * **候选集构建**（读侧装配器的入口）：记录集 → 按层分好、且**已剔时态失效者**的候选。
 *
 * ⚠ **接线状态（2026-09-20 实测，先读这段再看下面）**：本函数**不在运行时注入链上** ——
 *   `src/` 内**零消费者**，唯一调用者是离线件 `scripts/supply-preview.mjs`（真库预览）
 *   与单测 `scripts/test-supply-assembly.mjs`（同族纪律：**注释自称不得当证据**，故此处只陈述实测）。
 *   ⇒ 时态失效（`validTo`）到注入面之间**没有经本函数的通路**；环记录那一路由 `ring-supply.ts:174`
 *     的 `isLive` 自行过滤（**另有一条同名语义**，见下方「口径」）。
 *   本节**曾经**把「失效者不得入候选」写成"**读侧的硬规则**"并称其为"读侧闭环" —— **那描述与实况不符**：
 *   `validTo` 在真库**从未落库过一条**（`.records/records.jsonl` 5777 行 · 非空 0），
 *   即便落了，本函数也吃不到（零消费者）。⇒ 现如实改为「**离线装配器的语义**」，
 *   并**登记**该缺口（`scripts/check-injection-reach.mjs` 的 REACH 表 + `docs/OPEN-ITEMS.md`）。
 *   ⚠ 不在此处"顺手接线"：零样本接线只会产出"机制在、证据无"的**假绿**（仓内教训）。
 *
 * 「为什么必须有这一步」的原设计意图（**保留**，它仍是本函数存在的理由）：`validFrom/validTo`
 *   若只写不读，机制就是**空转**——标了失效的断言照样进候选、照样被注入，
 *   「旧事实与新事实并存」的污染一点没减。本函数把「失效者不得入候选」变成候选构建的规则，
 *   并把被剔者**显式记账**（不是静默过滤）。
 *
 * 分层判据**复用仓内单一实现** `targets#indexRowInLayer` / `targets#isProfileRow`（不在此另写标签名单
 * 或行形态判据）。活性（lifecycle）**不在此处理**——那是既有 recall/panel 的职责；本件只管**时间维**（新轴），
 * 免得两条路径对同一件事各判一次（口径漂移的经典来源）。
 */
export function buildCandidates(records, opts) {
    const coreTags = new Set(opts.coreTags ?? DEFAULT_CORE_TAGS);
    const out = { core: [], stable: [], dynamic: [], ring: [], expired: [], notInjectable: 0 };
    for (const r of records) {
        // ① **无内容**才是真的不可注入（结构/空白/空文本）
        if (r.kind === 'structure' || r.kind === 'blank' || !r.text.trim()) {
            out.notInjectable++;
            continue;
        }
        // ② `file === ''` 的语义是「**无 md 投影**」（Record 独有），**不是**「不可注入」。
        //    旧实现把这两个概念混进同一个条件 ⇒ 环记录被**静默丢弃**。实测：980 条记录里带环语义的仅 9 条，
        //    且 9/9 因此零注入 —— 而它们恰好是"经历"所在（决策/后果/价态/关系/承诺/联想/情景）。
        //    现按 kind 分流：属已登记环者进 `ring`（交 ring-supply 走**情境键匹配**通道），其余仍计 non-injectable。
        if (r.file === '') {
            if (ringOfKind(r.kind) !== 'none') {
                if (isLive(r, opts.at))
                    out.ring.push(r);
                else
                    out.expired.push({ id: r.id, text: r.text, why: `已于 ${r.validTo} 失效（环记录）` });
                continue;
            }
            out.notInjectable++;
            continue;
        }
        if (!isLive(r, opts.at)) {
            out.expired.push({ id: r.id, text: r.text, why: `已于 ${r.validTo} 失效${r.meta?.staleNote ? `（${r.meta.staleNote}）` : ''}` });
            continue;
        }
        const tag = indexRowTag(r.text);
        if (tag && coreTags.has(tag)) {
            out.core.push(r.text);
            continue;
        }
        // 画像行（`- … ← 源:`）也属**恒定面**（P 层 always 的另一种 form）——不按 tag 分流的活口
        if (isProfileRow(r.text)) {
            out.stable.push(r.text);
            continue;
        }
        if (indexRowInLayer(r.text, 'always'))
            out.stable.push(r.text);
        else
            out.dynamic.push(r.text);
    }
    return out;
}
/** 把一条越界联想渲染成一行（人读可辨：两侧小节 + 跨度） */
export function serendipityLine(p) {
    const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
    return `[联想] ${p.a.section} ⨯ ${p.b.section}（跨度 ${p.span}）｜${clip(p.a.text, 48)} ／ ${clip(p.b.text, 48)}`;
}
/**
 * **按槽限额取行**（对外出口；IR1 册三起供主路径直接调用 —— 语义与 `assembleSupply` 内**同一实现**：
 *   「超出即跳过、后续更短的行仍有机会」，与 `clampLines` 的「停-在首超」**不同且不可互换**）。
 * 主路径的情境槽用它 ⇒ 切割语义仍属装配域（单一实现），而整段文本**逐字节不变**。
 */
export function takeSlotLines(lines, limit, slot = 'situation') {
    const dropped = [];
    const { kept } = takeSlot(lines, limit, slot, dropped);
    return { kept, dropped };
}
/**
 * 逐槽取行：**整条进或整条丢**（绝不截半行——半截行既走样又可能断指针）。
 * `mustInclude` 为 true 的行无视预算（核心必进），但仍计入字符账。
 */
function takeSlot(lines, limit, slot, dropped, mustInclude = () => false) {
    const kept = [];
    let chars = 0;
    for (const l of lines) {
        const s = String(l ?? '');
        if (!s.trim())
            continue;
        const cost = s.length + 1; // + 换行
        if (chars + cost > limit && !mustInclude(s)) {
            dropped.push({ slot, line: s, why: `超出 ${slot} 预算（已用 ${chars}/${limit}，本行 ${cost}）` });
            continue;
        }
        kept.push(s);
        chars += cost;
    }
    return { kept, chars };
}
/**
 * 装配（纯函数、确定性）：同输入必同输出。
 * 顺序即优先级：`core`（必进）→ `stable` → `dynamic` → `oneshot`；`serendipity` **独立成槽**。
 */
export function assembleSupply(inputs, budget = DEFAULT_BUDGET) {
    const dropped = [];
    const coreLines = (inputs.core ?? []).map(String).filter((s) => s.trim());
    const budgetTotal = budgetTotalOf(budget);
    const serendipityEnabled = budget.serendipity > 0;
    const situationEnabled = budget.situation > 0;
    // 恒定面：core 必进 + stable 其余填预算（core 的字符也占本槽额度，但 core 不受限）
    const stableTake = takeSlot(inputs.stable ?? [], budget.stable, 'stable', dropped);
    const coreChars = coreLines.reduce((n, s) => n + s.length + 1, 0);
    const stableChars = coreChars + stableTake.chars;
    const dynamicTake = takeSlot(inputs.dynamic ?? [], budget.dynamic, 'dynamic', dropped);
    const oneshotTake = takeSlot(inputs.oneshot ?? [], budget.oneshot, 'oneshot', dropped);
    const serLines = serendipityEnabled ? (inputs.serendipity ?? []).map(serendipityLine) : [];
    const serTake = takeSlot(serLines, budget.serendipity, 'serendipity', dropped);
    // 情境槽（P3）：独立预算，与相关性面**互不挤占**（与联想槽同规格）；关闭时不参与、也不记账
    const sitLines = situationEnabled ? (inputs.situation ?? []).map(String).filter((s) => s.trim()) : [];
    const sitTake = takeSlot(sitLines, budget.situation, 'situation', dropped);
    const chars = coreChars + stableTake.chars + dynamicTake.chars + oneshotTake.chars + serTake.chars + sitTake.chars;
    return {
        blocks: {
            core: coreLines.join('\n'),
            stable: stableTake.kept.join('\n'),
            dynamic: dynamicTake.kept.join('\n'),
            oneshot: oneshotTake.kept.join('\n'),
            serendipity: serTake.kept.join('\n'),
            situation: sitTake.kept.join('\n'),
        },
        meta: {
            chars,
            budgetTotal,
            /* 溢出判据走**单一实现**（逐槽比自身额度 · 判因见 `isOverBudget` 抬头）。
             * ⚠ 旧式 `chars > budgetTotal || stableChars > budget.stable` 已删 —— 同 `supplyMetaOf`。 */
            overBudget: isOverBudget({ stable: stableChars, dynamic: dynamicTake.chars, oneshot: oneshotTake.chars, serendipity: serTake.chars, situation: sitTake.chars }, budget),
            serendipityEnabled,
            situationEnabled,
            kept: {
                stable: stableTake.kept.length,
                dynamic: dynamicTake.kept.length,
                oneshot: oneshotTake.kept.length,
                serendipity: serTake.kept.length,
                situation: sitTake.kept.length,
            },
            dropped,
        },
    };
}
/** 缺省段序（= 装配优先级）。**改它等于改所有既有调用方的输出** ⇒ 只许通过 `opts.order` 按调用点覆盖。 */
const DEFAULT_SEG_ORDER = ['core', 'stable', 'dynamic', 'oneshot', 'situation', 'serendipity'];
/**
 * 渲染成可注入文本（空段不产标题）。
 *
 * 缺省行为**与 R1 之前逐字节相同**（段序 = 装配优先级 · 分隔符 `'\n\n'` · 无 tailNote）——
 * 新选项全可选，既有调用方**零影响**（[原则] 变更先判因备份：共享接口只做**增量扩展**）。
 */
export function renderSupplyText(r, opts = {}) {
    const H = { core: '【核心】', stable: '【恒定面】', dynamic: '【变动面】', oneshot: '【一次性】', serendipity: '【越界联想】', situation: '【情境】', ...opts.headers };
    const order = opts.order && opts.order.length ? opts.order : DEFAULT_SEG_ORDER;
    const sep = opts.separator ?? '\n\n';
    const parts = [];
    for (const k of order) {
        const body = r.blocks[k];
        if (!body)
            continue;
        const h = H[k];
        // `headers[k]` 传**空串** ⇒ 视为"本段**不要外层标题**"（段内容自带标题）。
        //   主路径（`buildHotMemoryText`）即此形态 —— 它的 stable/dynamic 块内已含标题与行前缀。
        //   这是"两套渲染"的第 7 处差异（段标题有无），由 `test-render-opts` 的「先红」用例实证。
        parts.push(h ? `${h}\n${body}` : body);
    }
    if (opts.annotateOverflow && r.meta.dropped.length)
        parts.push(`（本次因预算挡下 ${r.meta.dropped.length} 行）`);
    if (opts.tailNote)
        parts.push(opts.tailNote);
    return parts.join(sep);
}
//# sourceMappingURL=supply-assembly.js.map