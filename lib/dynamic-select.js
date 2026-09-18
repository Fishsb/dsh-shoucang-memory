// dynamic-select.ts — 动态面**选行**领域（L5 · 2026-09-14 自 `panel-shared` 抽出）
//
// **由来**：这段原嵌在 `panel-shared#buildHotMemoryText` 体内（约 92 行），而该模块受
//   `check-module-growth` **大模块冻结棘轮**约束（基线 831 / 上限 846 —— 改动前已**顶格 846**）
//   ⇒ 任何新增都无法落地（S4-3 的**中层 `process` 槽**正卡在此处）。
//   门禁给出的出路即「**按领域接缝拆**」（而不是按行数硬切），本件按此办理：**只移动、不改逻辑**。
//
// **职责**：把「基线池 + 查询」变成「本步该注入的知识索引行」——
//   三通道叠加 = **相关性**（MCL 预热融合召回 ∪ 词法召回）∪ **新鲜度槽** ∪ **位置式基线补齐**，
//   并在基线/补位排序中贯穿**冷热降权**（cold 后置、`hits30` 高者先占槽）。
//
// **边界**：本件**只选行 + 合并** —— 不渲染、不裁切（裁切归 `clampLines`）、不记预算账（归 `supply-assembly`）。
//   纯读：只读 `MEMORY.md` 与 `activity.jsonl`（相关性面交 `relevance-supply`）；路径由调用方派生（零硬编码）。
import { readFileSync } from 'node:fs';
/** 注入缓存的**失效判定**（纯函数 · 2026-09-16 用户指令「新会话注入一次 + 每次上下文压缩后一次」）。
 *  返回 `''` = **命中缓存（逐字复用）**；否则返回重建原因，供审计与 `/inject/stats` 读数。
 *
 *  **为什么需要它**：实测旧实现**每轮重建**（`/inject/stats calls=535`，而主会话仅 34 步）。
 *  四条失效条件（全部可观测，无猜测）：
 *    ① `prev` 缺失 ⇒ `new`（新会话，或插件热重载后首次）；
 *    ② `sid` 变化 ⇒ `session-changed`；
 *    ③ **事件条数回落**，或**首 seq 前跳** ⇒ `compacted`（历史被压缩重写；宿主 `SessionStartSource` 含 `'compact'`）；
 *    ④ **记忆库戳变化** ⇒ `lib-changed`（睡眠/蒸馏刚写了库 ⇒ 必须让新内容可见）。
 *  ⚠ **顺序有意义**：压缩判定**先于**库戳判定 —— 压缩是"上下文丢了"（必须重建），库变是"内容变了"（可稍后）。
 *  ⚠ **技术边界（勿误传）**：命中缓存**不代表省 token** —— system prompt 每步仍会发给模型；
 *    它省的是「每轮重建（读盘+选行+消重）」并保证文本**逐字稳定**（⇒ 提供商 prompt 缓存可命中）。 */
export function injectCacheReason(prev, now) {
    if (!prev)
        return 'new';
    if (prev.sid !== now.sid)
        return 'session-changed';
    /* ⚠ `q`（本步任务文本）**必须参与失效** —— 既有实现（`panel-shared` 顶部 30s `cacheKey = memRoot|q`）
     *   正是把它算进键里的：动态面（索引热取 N 条）**按 query 选行**，若冻住 query 就等于**杀掉按需召回**。
     *   实测口径：`q` 取自「最近一条**真实用户消息**」⇒ **同一用户回合内多步 q 不变** ⇒
     *   本缓存省掉的正是「**同回合内每步重建**」，同时**保留了跨回合的按需性**（这是与用户指令的关键取舍）。 */
    if (prev.q !== now.q)
        return 'query-changed';
    if (now.evLen < prev.evLen)
        return 'compacted';
    if (prev.firstSeq >= 0 && now.firstSeq > prev.firstSeq)
        return 'compacted';
    /* ★IR1 册四（2026-09-18）**上游事件戳分两级**（库 / 介质）—— 实测旧实现只签**库戳**（三索引），
     *   而 `activity.jsonl`（冷热状态）与 `delta.md`（晨起摘要）是**另外两条介质**：
     *   它们在**外层**判据里不可见 ⇒ 运行时"改了介质却不重建"（内层 30s TTL 之外看不到）。
     *   现两级都进判据（同一结构化戳，见 `supply-stamp#libStampOf`），读数上也可分辨是谁变的。 */
    if (prev.lib !== now.lib)
        return 'lib-changed';
    if (String(prev.media ?? '') !== String(now.media ?? ''))
        return 'media-changed';
    return '';
}
import { join } from 'node:path';
import { emptyTrace, selectRelevantLines } from './relevance-supply.js';
/**
 * S4-3（2026-09-14）**中层 `process` 槽选行**：按**标签**取 `[路径]` 行（**不走内容相关性竞争**）。
 *
 * 判因：人类三层里**中层是唯一没有专用通路的层** —— `[路径]` 原经 R 层 gated 相关性召回，
 *   与知识索引行争同一 `dynamic` 预算 ⇒ 「**可复用步骤**」这种过程指引会被"内容相关性"挤掉。
 *   本槽给它**优先进位**（与 `situation`/`serendipity` 同构的理由：改权重解决不了，只能分槽）。
 *
 * 边界：**只选行**（不渲染、不裁切、不记账）；`enabled !== true` ⇒ 返回空（**缺省零行为变化**）。
 */
export function selectProcessLines(allIndexRows, opts) {
    if (opts?.enabled !== true)
        return [];
    const tags = opts.carrierTag && opts.carrierTag.length ? opts.carrierTag : ['路径'];
    const topN = Math.max(1, Number(opts.topN) || 3);
    const out = [];
    for (const l of allIndexRows) {
        const m = /^\[([^\]\s]+)\]/.exec(String(l).trim());
        if (!m || !tags.includes(m[1]))
            continue;
        if (!out.includes(l))
            out.push(l);
        if (out.length >= topN)
            break;
    }
    return out;
}
/**
 * 动态面选行（**IR1 册一后**：相关性面已交 `relevance-supply`，本件只留"补齐与合并"）。
 *
 * 通道序是**判据而非巧合**：相关性 → 新鲜度 → 基线补齐；
 *   `picked` 为空时**保持基线**（`return memBase`），与抽取前的 `if (picked.length)` 等价。
 *
 * ★2026-09-18（IR1 册一）：原「桥读取 + `recallIndex` + `file==='MEMORY.md'` 过滤 + 域内 top1」整段
 *   已迁至 `relevance-supply#selectRelevantLines`（**按域路由/领域接缝拆**，非按行数硬切）。
 *   迁因是**缺陷**而非整洁：单文件过滤把 `AGENT.md` 的命中**全丢** ⇒ 真命中词与乱码词注入面 63/63 行相同。
 *   本件保留：`process` 槽合并 · 冷热降权 · 新鲜度槽 · 存量补位 —— 它们与"相关性打分"无关。
 *   返回值加 `trace`（相关性通道来源 + 失败原因 + 零命中标志），供注入面**如实记账/注明**。
 */
export function selectDynamicLines(dep) {
    const { allMem, cap, q, memRoot, activityFile, readSuite } = dep;
    // v8（认知对照 P1「降权贯穿三通道」+「复习-强化」）注入侧的冷热感知 + 命中次权重。
    //   R6 审查项：**回退分支也要生效**——否则 `injectRelevance=false` 或空 query 时「降权贯穿三通道」实际只剩两通道。
    const actMap = new Map();
    try {
        for (const l of readFileSync(activityFile, 'utf8').split(/\r?\n/)) {
            if (!l.trim())
                continue;
            try {
                const o = JSON.parse(l);
                const f = String(o.f || '').replace(/^notes\//, '');
                const s = String(o.s || '').trim().toLowerCase();
                if (f && s)
                    actMap.set(`${f}::${s}`, { cold: String(o.status) === 'cold' || !!o.retired, hits30: Number(o.hits30 || 0) });
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 无 activity.jsonl = 不感知（保持旧行为） */ }
    const rowWeight = (l) => {
        const fm = (l.match(/notes\/([A-Za-z0-9_-]+)\.md/) || [])[1] || '';
        const tail = l.split('→').pop() || '';
        let cold = false;
        let hits = 0;
        for (const m of tail.matchAll(/§([^/→]+)/g)) {
            const s = String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase();
            const e = actMap.get(`${fm}::${s}`) || actMap.get(`${fm}.md::${s}`);
            if (!e)
                continue;
            if (e.cold)
                cold = true;
            hits = Math.max(hits, e.hits30);
        }
        return { cold, hits30: hits };
    };
    // S4-3（2026-09-14）：**中层 `process` 槽**先算（与 query 无关 —— 任务级供给在任务开始即生效）
    const proc = selectProcessLines(dep.processRows ?? [], dep.process);
    /* 位置式回退基线的**候选池**（空 query 分支用）。
     *
     * ★2026-09-18 修（按域路由 P0-a 的副作用）：池仍是 `allMem`（= `readIdx('MEMORY.md')`，**只含 `inject=always` 行**）——
     *   这是**层过滤不变量**（`test-carrier-layers` A7-1/A8：无查询时**不得**铺 gated 载体），不可用全量行替换
     *   （实测那样会把 路径/经验/tool/flow 泄漏进恒定注入面）。
     *   但归一 `[环境]`（P/always → E/gated）后 MEMORY.md 的 always 池**可能恒空** ⇒ 空 query 时
     *   `memBase` 为空、动态面丢兜底（实测 `test-inject-cache` 三条断言红）。
     *   ⇒ 判据：**池沿用 always（守住层过滤）；池空时不再"无兜底"，而是靠下方 `allMemFill` 的新鲜度槽
     *     与 `rest` 补位**（两者本就以全量行为池、且只在**有查询**或**相关性子通道**里生效）。
     *   ⚠ 关键区别：`memBase` 是**空 query 的兜底**，而 `allMemFill` 全程参与 —— 前者必须记层，
     *     后者是"新鲜度保证槽"（本就设计为不按相关性、按位置取最近 N 条）。 */
    /* IR1 册一（2026-09-18）：**恒定面已持有的行**在**此处统一剔除**（含兜底池与新鲜度池）——
     *   理由见 `RelevanceDeps.exclude`：同一行不得两处注入（实测重复 2 行），且被恒定面裁掉的行
     *   不得"从动态面复活"（否则"哪一槽丢了什么"不可核）。 */
    const dropSet = new Set((dep.exclude ?? []).map((s) => String(s).trim()).filter(Boolean));
    const memBase = [...allMem]
        .filter((l) => !dropSet.has(String(l).trim()))
        .sort((a, b) => (rowWeight(a).cold ? 1 : 0) - (rowWeight(b).cold ? 1 : 0))
        .slice(0, cap);
    const relOn = readSuite().injectRelevance !== false;
    const allMemFill = (() => {
        try {
            return readFileSync(join(memRoot, 'MEMORY.md'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => /^\[/.test(l)).filter((l) => !dropSet.has(l));
        }
        catch {
            return [...allMem].filter((l) => !dropSet.has(String(l).trim()));
        }
    })();
    // 合并：`process` 行**前置**且**额外占位**（不吃 dynamic 的 cap ⇒ 这就是它的"独立额度"简化实现）
    const merge = (base) => {
        if (!proc.length)
            return base;
        const out = [...proc];
        for (const l of base) {
            if (out.length >= cap + proc.length)
                break;
            if (!out.includes(l))
                out.push(l);
        }
        return out;
    };
    if (!q || !relOn)
        return { lines: merge(memBase), trace: emptyTrace(), proc };
    const fresh = Math.max(0, Math.min(Number(readSuite().injectFreshSlots) || 2, cap));
    /* 相关性面（IR1 册一）：**桥（向量融合预热）→ 词法 → 位置式**三档降级，每次降级都记账。
     * 旧实现在此处做两件事、两件都错：① 桥行按 `file==='MEMORY.md'` 过滤（AGENT.md 命中全丢）；
     * ② 词法路同样过滤 ⇒ 实测 `"深睡蒸馏"` 8–10 行命中**全部被丢掉**、自然语言中文查询 0 行。 */
    const rel = selectRelevantLines({ memRoot, q, cap, exclude: dep.exclude });
    const picked = [...rel.picked];
    /* ★2026-09-18（按域路由 P2-b）**域内 top1 保底** —— 消除「小域永远垫底」。
     *
     * 判因（实测）：动态面在**单一全局序**里竞争 —— 7 个 gated 域共 256 行候选，而 cap 只放得下约 12 行，
     *   大域（`lesson` 114 行）在统计上系统性占优，小域（`经验` 1 行 / `路径` 15 行）几乎不出现。
     *   会议结论（arch/minimal 一致）：最小改动即「**域内 top1 保底 + 其余沿用全局序**」——
     *   不为"按行数占比"的精确性付复杂度（那需要行数统计 + clamp + 新单测，且随库抖动不可复现）。
     *
     * 实现：把相关性通道已取回的候选按**域**分组，每域取其**首条**（= 该域在全局序里的最优）**前置**；
     *   其余行按原全局序跟在后面。**不新增召回调用、不改 cap**（只在既有候选内重排）⇒ 零额外成本，
     *   且**零命中域自然不占位**（分组为空即无 top1）——这正是会议要的"让位（保证相关）"。
     * ⚠ 保底只在**相关性通道有货**时生效；空 query 分支（`!q || !relOn`）不参与（那里本就无相关性可言）。 */
    if (picked.length > 1) {
        const firstRowOfDomain = new Map();
        for (const l of picked) {
            const t = /^\[([^\]\s]+)\]/.exec(String(l).trim())?.[1];
            if (t && !firstRowOfDomain.has(t))
                firstRowOfDomain.set(t, l);
        }
        if (firstRowOfDomain.size > 1) {
            const headRows = [...firstRowOfDomain.values()];
            const headSet = new Set(headRows);
            picked.splice(0, picked.length, ...headRows, ...picked.filter((l) => !headSet.has(l)));
        }
    }
    for (const l of allMemFill.slice(Math.max(0, allMemFill.length - fresh)))
        if (!picked.includes(l))
            picked.push(l);
    // 槽位不足时用**位置式基线**补齐：防「短指令（如"继续"）零命中」导致知识行从 cap 缩到 fresh 的信息损失。
    // 三者叠加 = 相关性 ∪ 新鲜度 ∪ 基线覆盖，任一维度都不牺牲。
    const rest = allMemFill.filter((l) => !picked.includes(l));
    rest.sort((a, b) => {
        const A = rowWeight(a);
        const B = rowWeight(b);
        if (A.cold !== B.cold)
            return A.cold ? 1 : -1;
        return B.hits30 - A.hits30;
    });
    for (const l of rest) {
        if (picked.length >= cap)
            break;
        picked.push(l);
    }
    return { lines: merge(picked.length ? picked.slice(0, cap) : memBase), trace: rel.trace, proc };
}
//# sourceMappingURL=dynamic-select.js.map