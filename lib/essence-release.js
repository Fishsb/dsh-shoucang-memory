// essence-release.ts — **精要层释放**（S-P5c · 2026-09-16）
//
// 判据（来自 S-P5a/b′，同一口径的**单一事实源**）：
//   一条 `[标签] 主题 · 说明 → notes/… §…` 的行，若 `说明` 段 **≥ RELEASE_MIN_ACTION_CHARS 字符**
//   **且**含动作/因果词 ⇒ 判「**字面自足**」（丢掉正文后仍能据以复现做法）。
//   `MEMORY.md`（知识索引，行是指针）与 `USER.md`（画像/事实型）**一律不参与** —— 职责由**文件**决定。
//
// ⚠⚠ **本件的历史定位已变更（2026-09-20 round 9 订正 · 遵 [原则] 契约须描述现状）**：
//   本头注原写「只做候选与计划这一半，**不做不可逆释放**」，并列出「三件保护**尚未实现**」。
//   **该描述已过期** —— 三件保护此后均已落地（同日 S-P5c 系列）：
//     ① **语义复核**：`buildSemanticReviewRequest` / `buildSemanticReviewBatches` / `parseSemanticReview`
//        / `semanticApprovedRows` / `intersectApprovals`（**已实现**，真机跑通：字面 49 → 语义通过 19）
//     ② 执行侧**归档可回滚**：`applyRelease` 复用 `forgetops` 的 archive+stub（**已实现**）
//     ③ **未自足者零释放**：`planRelease` 内（**已实现**）
//   ⇒ **现状**：本件**具备**完整释放能力（计划 → 语义门 → 执行 → 可回滚）；
//     唯一"关"的是**自动执行开关**（`releaseAuto` 默认 `false`，见 `deepsleep-run`），
//     那是**接线决策**（须待波动收敛到 Jaccard ≥ 0.8），**不是"能力未实现"**。
//   ⚠ **这一订正本身就是一条纪律的实例**：注释与实现不符会让后来人据注释做出错误决策
//     （本行正被 `S-P5c-执行侧` 的登记照抄过一轮）。改实现后**必须同批改注释**。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
/** 判据阈值（**与 `scripts/effective-directions.mjs` 同源**：那边 import 本常量，不各写一份）。 */
export const RELEASE_MIN_ACTION_CHARS = 12;
/** 动作/因果词（**唯一实现**；`effective-directions.mjs` 同源引用）。 */
export const RELEASE_ACTION_WORDS = /先|须|勿|应|取|改用|核|校验|回滚|禁|避免|才能|只|不得|逐|按|写|读|跑|看|判|记|建|拆|配|验|对账|收敛|释放|用|带|免|让|使|选|收|放|开|关|换|替|加|删|移|合|置|走|要/;
/** 判据载体文件（**主键 = 文件职责**，不是标签）。 */
export const JUDGMENT_FILE = 'AGENT.md';
/** 单轮释放上限（与 `forgetops#MAX_ARCHIVE_PER_RUN` 同值同纪律：防一次动太多）。 */
export const RELEASE_MAX_PER_RUN = 3;
/**
 * 扫描释放候选（**纯读、零写入**：不归档、不删行、不改任何文件）。
 * 判据与度量器同源（阈值/词表/文件主键均 import 自本件），故"度量出的候选"与"可释放的候选"**同口径**。
 */
export function planRelease(memRoot) {
    let text = '';
    try {
        text = readFileSync(join(memRoot, JUDGMENT_FILE), 'utf8');
    }
    catch {
        return { candidates: [], blocked: 0, stat: { scanned: 0 }, note: `无 ${JUDGMENT_FILE} ⇒ 未判` };
    }
    const candidates = [];
    let blocked = 0;
    let scanned = 0;
    for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim();
        if (!l || !/→\s*notes\//.test(l))
            continue;
        scanned++;
        const before = l.split('→')[0];
        const parts = before.split('·');
        const desc = (parts.length > 1 ? parts.slice(1).join('·') : '').trim();
        const chars = desc.replace(/\s/g, '').length;
        const selfContained = chars >= RELEASE_MIN_ACTION_CHARS && RELEASE_ACTION_WORDS.test(desc);
        if (!selfContained) {
            blocked++;
            continue;
        } // 判据③：未自足**永不入候选**
        candidates.push({ row: l, tag: (/^\[([^\]\s]+)\]/.exec(l) || [])[1] || '(无标签)', descChars: chars });
    }
    return {
        candidates, blocked, stat: { scanned },
        note: candidates.length
            ? `候选 ${candidates.length}/${scanned}（**仅计划，未释放**）`
            : '无候选（**合法结果**：无可释放者，或本文件无可判行）',
    };
}
/* ══ P5c **执行侧**（2026-09-16）═════════════════════════════════════════════════════
 * **关键判断**：释放的**对象**是 `notes/` 小节，与 `forgetops` **同一对象类型**，只是**判据不同**
 *   （自足 vs 冷）。⇒ **不自己写归档**（仓规则 5），而是产出 **forgetOps 同形的 `archive` op**，
 *   交由既有 `applyForgetOps` 执行 —— 复用其**全部**机制：
 *     ① 归档到 `notes/archive/<file>`（**含原文逐行**）② 原位留 **stub**（「需要时复制回来即可」）
 *     ③ 单轮上限 3 ④ 已是 stub 则跳过（幂等）⑤ **禁止直删** ⑥ 画像文件硬保护。
 *   ⇒ **零新归档实现**，且**释放本身可回滚**（先前把它当"不可逆"是高估了风险 —— 实测机制如此）。
 * ⚠ **语义门已实现**（`semanticApprovedRows` 等，见件头订正）；但 `applyRelease` 仍**不传语义清单即零释放**
 *   —— 那是**双判据的硬约束**（字面自足 ≠ 语义自足），**不是能力缺失**（fail-closed 是设计，不是待办）。 */
/** 从指针解析归档目标：`→ notes/<file> §<section>` ⇒ `{ file, section }`（解析不出 ⇒ null）。 */
export function parsePointerOf(row) {
    const m = /→\s*notes\/([^\s§]+)\s*§\s*([^\s（(]+)/.exec(String(row || ''));
    if (!m)
        return null;
    return { file: m[1].trim(), section: m[2].trim() };
}
/**
 * 把释放计划转成 **forgetOps 同形 op 列表**（**只提案，不执行**）。两道门在本件内：
 *   · **无指针/解析不出 ⇒ 不产 op**（指针是释放的唯一入口）；② **未自足 ⇒ 不产 op**（判据③再断言一次）。
 */
export function releaseOpsFromPlan(plan) {
    const ops = [];
    let skipped = 0;
    for (const c of plan.candidates) {
        const p = parsePointerOf(c.row);
        if (!p) {
            skipped++;
            continue;
        }
        if (!(c.descChars >= RELEASE_MIN_ACTION_CHARS)) {
            skipped++;
            continue;
        }
        ops.push({ op: 'archive', file: p.file, section: p.section, action: 'archive', why: `判据行自足（说明段 ${c.descChars} 字）⇒ 其 notes 小节可释放` });
    }
    return {
        ops, skipped,
        note: ops.length ? `提案 ${ops.length} 条（**待语义复核 + 显式执行**；未执行前零写入）${skipped ? ` · 跳过 ${skipped}` : ''}` : `无提案（候选 ${plan.candidates.length} · 跳过 ${skipped}）`,
    };
}
/**
 * 应用释放提案（**唯一写入口**）。**双重 fail-closed**：
 *   ① **必须显式传 `semanticApproved`**（语义复核通过的行文本清单）—— 该门**尚未自动产出**，
 *      故**不传 = 零释放**（绝不把"字面自足"当成"可以释放"）；
 *   ② 逐条**以当下库状态重新复核**（`planRelease` 再跑一次）—— **不接受调用方自报自足**（防越权/防陈旧计划）。
 * ⚠ 本函数**不自己归档**：通过的 op 交给调用方注入的 `applyOps`（既有 `applyForgetOps`）。
 */
export async function applyRelease(memRoot, proposed, semanticApproved, applyOps, opts) {
    const reasons = [];
    const max = Math.max(1, Number(opts?.maxPerRun) || RELEASE_MAX_PER_RUN);
    if (!semanticApproved.length)
        return { released: 0, skipped: proposed.length, reasons: ['语义复核清单为空 ⇒ **零释放**（语义门未实现，fail-closed）'] };
    const fresh = planRelease(memRoot);
    const approved = new Set(semanticApproved.map((s) => String(s).trim()));
    const pass = [];
    let skipped = 0;
    for (const o of proposed.slice(0, max)) {
        const row = fresh.candidates.find((c) => { const p = parsePointerOf(c.row); return !!p && p.file === o.file && p.section === o.section; });
        if (!row) {
            skipped++;
            reasons.push(`${o.file} §${o.section}：**当下复核未通过**（不再自足/指针消失）⇒ 不释放`);
            continue;
        }
        if (!approved.has(row.row.trim())) {
            skipped++;
            reasons.push(`${o.file} §${o.section}：**不在语义复核通过清单** ⇒ 不释放`);
            continue;
        }
        pass.push(o);
    }
    if (!pass.length)
        return { released: 0, skipped, reasons };
    const r = await applyOps(pass);
    return { released: r.archived, skipped: skipped + r.skipped, reasons: reasons.concat(`已交既有归档链路（archived ${r.archived} / kept ${r.kept} / skipped ${r.skipped}）`) };
}
/* ══ P5c **语义门**（2026-09-16）：字面自足 ≠ 语义自足 ══════════════════════════════════
 * 判因：字面判据只答"**这一行里有没有做法**"；它答不了"**换个读者/换个情境，只看这一行还能不能把事做对**"
 *   —— 后者是**语义判断**（正是本仓"模糊判断交模型"的分工）。
 * 口径（**与 J3/J5 同族**）：**候选由确定性产出**（`planRelease` 的字面判据），**判定交模型**；
 *   **不一致时以更严者为准** ⇒ 只有 `usable === true` 才算通过，**未判(null)/false 一律不通过**
 *   （宁可保留正文，也不误释放）。
 * ⚠ **本件不调 LLM**（纯函数三件套）；调用点在 `deepsleep-run`（与 J3/J5 同一处、并发发起）。 */
/** 构造语义复核请求（**纯函数**：只拼文本）。**只给行本身**，不附正文 —— 这正是在模拟"丢掉正文"。
 *  @param offset/limit 分批：一次问太多条会让每条分到的注意力变少（实测 49 条一次问 ⇒ **59% 判不准**）。
 *         `i` 一律用**全局序号**（= 候选下标），故分批后仍可直接合并。 */
export function buildSemanticReviewRequest(plan, opts) {
    const off = Math.max(0, Number(opts?.offset) || 0);
    const lim = Math.max(1, Number(opts?.limit) || 10);
    const batch = plan.candidates.map((c, i) => ({ c, i })).slice(off, off + lim);
    const lines = [];
    lines.push('你在做一次"**丢掉正文还能不能用**"的复核。下面每一行都是**判据行**（它们各自指向一个 notes 小节）。');
    lines.push('请对每一行判断：**假设把那个 notes 小节的正文全部删掉，只留这一行——照着它还能把这件事故对/做出来吗？**');
    lines.push('');
    /* ⚠ 2026-09-16 **判据收紧（实测校准）**：首版问的是"**能不能说出具体动作**"——**门槛过低**，
     *   任何判据行都能被改写成一句动作 ⇒ 真机 **51/51 全判 true**（通过率 100%，**过松**）。
     *   自足的**实质**不是"能说出个动作"，而是「**动作所需的信息是否都在这一行里**」。
     *   ⇒ 改为**信息完备性**判据（三个检查点，逐条对照）。 */
    lines.push('**怎么判（逐条对照下面三点，不要凭感觉）**：');
    lines.push('  ① 这一行说了**做什么**吗？');
    lines.push('  ② 这一行说了**按什么判 / 用什么值**吗？（阈值、编号、路径、命令、字段名…）');
    lines.push('  ③ 这一行说了**出错怎么办 / 边界在哪**吗？');
    lines.push('  **关键**：上面三点里需要的**具体信息**（哪条路径、哪个阈值、哪个字段、哪个命令），');
    lines.push('  **必须就写在这一行里**。如果某一步必须**去翻正文才知道该用什么** ⇒ usable = **false**。');
    lines.push('  · 三点都齐、且具体信息都在行内 ⇒ usable = true');
    lines.push('  · 只能说出"关于 X 的事"/"X 相关"，或**关键取值得翻正文** ⇒ usable = false');
    lines.push('  · 这一行自相矛盾或语义不明，你确实读不出该做什么 ⇒ usable = null（**拿不准就 null，不要猜**）');
    lines.push('');
    for (const { c, i } of batch)
        lines.push(`- [${i}]（该行说明段 ${c.descChars} 字）${c.row.slice(0, 200)}`);
    lines.push('');
    lines.push('只输出一行 JSON 数组，**只含上面列出的这些 i**：');
    lines.push('[{"i":0,"usable":true,"quote":"从该行逐字摘的片段","why":"≤40字"}]');
    lines.push('');
    /* ⚠ 2026-09-16 **降波动（实测驱动）**：真机 6 轮分解显示**模型判定波动占加权 91%**（候选变化只占 9%）
     *   ⇒ 波动主因在模型。⇒ 加**接地约束**：除 `usable` 外必须给 `quote`（**从该行逐字摘的片段**），
     *   且**由宿主机检 `quote` 确为该行子串**（不符 ⇒ 该项按未判处理）。
     *   依据：**判定必须落在行文本上**，才能把"凭印象判"压成"必须找到依据"。 */
    lines.push('**另必须给 `quote`**：从**该行**里逐字摘一段（≥4 字，**原样照抄，不得改写**），它就是你这次判断的依据。');
    lines.push('引文与判定必须一致：判 true 的引文应当是你据以动手的那句；判 false 的引文应当是你**找遍了也没有**做法的那句（可摘其主题词）。');
    lines.push('⚠ 宿主会**机检引文是否确为该行的子串**；对不上 ⇒ 这一项按"未判"处理（等于白判）。');
    return lines.join('\n');
}
/** 分批请求（**纯函数**）：把候选按 `size` 切批，每批一个请求；`i` 为全局下标，合并时直接可用。 */
export function buildSemanticReviewBatches(plan, size = 10) {
    const n = Math.max(1, Number(size) || 10);
    const out = [];
    for (let off = 0; off < plan.candidates.length; off += n)
        out.push(buildSemanticReviewRequest(plan, { offset: off, limit: n }));
    return out.length ? out : [buildSemanticReviewRequest(plan, { offset: 0, limit: n })];
}
/** 严格解析（**整批原子**：结构不合法 ⇒ 整体 null —— 半批会静默改变"通过清单"）。
 *  ⚠ `quote` **缺失/过短不算结构错** ⇒ 记空串，交由 `semanticApprovedRows` **按项判未判**
 *    （**接地失败是逐条事实，不是整批结构错**；整批作废会白烧整批判定）。 */
export function parseSemanticReview(text) {
    const m = /\[[\s\S]*\]/.exec(String(text || ''));
    if (!m)
        return null;
    let arr;
    try {
        arr = JSON.parse(m[0]);
    }
    catch {
        return null;
    }
    if (!Array.isArray(arr) || !arr.length)
        return null;
    const out = [];
    for (const x of arr) {
        const o = x;
        if (typeof o?.i !== 'number' || !Number.isFinite(o.i))
            return null;
        const u = o.usable;
        if (!(u === true || u === false || u === null))
            return null;
        out.push({ i: o.i, usable: u, why: String(o.why || '').slice(0, 80), quote: String(o.quote || '') });
    }
    return out;
}
/**
 * 双判据合并 ⇒ **语义复核通过的行清单**（可直接喂 `applyRelease` 的 `semanticApproved`）。
 * ⚠ **以更严者为准**：只有 `usable === true` **且 引文接地成功**才算通过。
 * ⚠ **引文接地机检**（2026-09-16 降波动）：`quote`（≥4 字）必须**是该行的逐字子串**；
 *   不符/缺失 ⇒ **按未判处理**（不通过）。依据是真机 6 轮分解：**模型波动占加权 91%** ⇒
 *   必须把"凭印象判"压成"必须在行内找到依据"。
 */
export function semanticApprovedRows(plan, review) {
    const byIdx = new Map(review.map((r) => [r.i, r]));
    const approved = [];
    let rejected = 0, unjudged = 0, ungrounded = 0;
    plan.candidates.forEach((c, i) => {
        const r = byIdx.get(i);
        if (!r) {
            unjudged++;
            return;
        }
        const q = String(r.quote || '').trim();
        if (q.length < 4 || !c.row.includes(q)) {
            ungrounded++;
            unjudged++;
            return;
        } // 接地失败 ⇒ 未判（不通过）
        if (r.usable === true)
            approved.push(c.row);
        else {
            if (r.usable === null)
                unjudged++;
            else
                rejected++;
        }
    });
    return { approved, rejected, unjudged, ungrounded };
}
/** 两次独立判定的**通过集交集**（保序、去重）—— **降波动手段**（2026-09-16）。
 *  判因（实测分解）：当代 6 纪元的波动**加权 93% 来自模型判定**（候选变化仅 7%）；而文献
 *   （arXiv:2510.27106）已证伪两条常见路 ——「调温度」**降低**与人类判断的一致性、
 *   「多跑取**多数**」对自可靠性**无显著改善**。⇒ 取**交集**（**两次都判 `true` 才通过**）而非多数：
 *   它**必然收缩通过集** ⇒ **单调更保守**（少释放、不误释放）；代价是通过率下降 ⇒
 *   **效率换稳定**，方向安全（未判/否一律不通过，与 `semanticApprovedRows` 同口径）。 */
export function intersectApprovals(a, b) {
    const setB = new Set(b.map((x) => x.trim()));
    const seen = new Set();
    const out = [];
    for (const x of a) {
        const k = x.trim();
        if (setB.has(k) && !seen.has(k)) {
            seen.add(k);
            out.push(x);
        }
    }
    return out;
}
/** 集合指纹：把一批行文本折成**排序后的短哈希**（`sha1(trim(行))` 前 8 hex）—— **判据用，零隐私暴露**。
 *  判因（2026-09-16 实测）：用「通过率极差」当稳定性判据是**代理指标** —— 它被**未判率污染**
 *   （未判 ⇒ 缩小交集 ⇒ 通过率下降），实测未判率 `0→25.3%` 直接变成通过率摆动（仓内 [原则] 代理指标非判据）。
 *   ⇒ **更本质的判据**是「**两轮释放集合有多像**」（Jaccard）⇒ 需要每轮的**集合指纹**。
 *  ⚠ 为什么用哈希而非行文本：**审计体积**与**隐私面** —— 短哈希**不可逆**、且候选全集本就在 `AGENT.md`（库内），
 *   故**不增加暴露面**（能读库的人本就能读行）；而记全文会让审计膨胀数倍。
 *  ⚠ **排序**是刻意的：集合比较与顺序无关，排序后才能与 `intersectApprovals` 的保序结果对齐比较。 */
export function stableSetHashes(rows) {
    const out = new Set();
    for (const r of rows)
        out.add(createHash('sha1').update(String(r).trim(), 'utf8').digest('hex').slice(0, 8));
    return [...out].sort();
}
/** 两个集合指纹的 **Jaccard 相似度**（|交| / |并|；两者皆空 ⇒ 1.0「一致地没有」）。 */
export function jaccardOfHashes(a, b) {
    const A = new Set(a), B = new Set(b);
    if (!A.size && !B.size)
        return 1;
    let inter = 0;
    for (const x of A)
        if (B.has(x))
            inter++;
    return inter / (A.size + B.size - inter);
}
//# sourceMappingURL=essence-release.js.map