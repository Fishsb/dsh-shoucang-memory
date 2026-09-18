// sleep-report.ts — **睡眠汇报 + 问题标记 + 影响账**（S2S3 册四；同时结清册二「影响账并入 sleep-reports.jsonl」）
//
// 用户口径：**每一次睡眠要产出一个汇报**（提存与压缩）· 导致反向/无用**只标记不处理** · 汇报**像日历一样一直有、
//   不会删除**且 UI 可见 · 还要一个**睡眠产出问题统计**。
//
// 三份产物（会审裁剪后的形态）：
//   ① 人读汇报 `<bank>/reports/sleep/<YYYY-MM-DD>.md` —— **同日多轮按轮追加，绝不覆盖**（"不删除"的落点）
//   ② 机器可读 `<kRoot>/audit/sleep-reports.jsonl` —— **每轮一行**；**影响账行也并入这条流**（册二裁定：不另开 `audit/impact/`）
//   ③ 问题队列 `<kRoot>/audit/sleep-issues.jsonl` —— 每条标记一行（状态机 `open → 处置/关闭`，**只增不改历史行**）
//
// **标记判据（确定性证据；代理指标只排序不裁定 —— 会审 Q3）**：
//   `unused`（本窗真读 0 且注入 0/未知）· `counter`（决策环 `outcome.hit==='0'`，Q7 裁定源）·
//   `suspect-recall`（`unused` **但索引行质量正常** ⇒ 归因指向注入/召回面）· `suspect-quality`（`unused` **且**指针悬空）。
//   ⚠ **"是否被注入"当前无法按条目判定**（`mcl-step` 的 `injected` 只到步级、fast 通道硬写 0）⇒
//   本件把它显式记成 `injected:'unknown'` 并在统计里单列，**不用代理指标冒充判据**。
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readTailLines } from './file-stat-cache.js';
import { resolveSection } from './section-ref.js';
export const sleepReportDirOf = (bankRoot) => join(bankRoot, 'reports', 'sleep');
export const sleepReportPathOf = (bankRoot, date) => join(sleepReportDirOf(bankRoot), `${date}.md`);
export const sleepReportsStreamOf = (kRoot) => join(kRoot, 'audit', 'sleep-reports.jsonl');
export const sleepIssuesStreamOf = (kRoot) => join(kRoot, 'audit', 'sleep-issues.jsonl');
const tail = (file, n) => { try {
    return readTailLines(file, n).filter(Boolean);
}
catch {
    return [];
} };
const parseRows = (file, n) => {
    const out = [];
    for (const l of tail(file, n)) {
        try {
            out.push(JSON.parse(l));
        }
        catch { /* 坏行跳过 */ }
    }
    return out;
};
/** **影响账**（确定性聚合）：窗口内每个 `(file, section)` 的真实读取与活性。
 *  数据源 = `access-real.jsonl`（真读埋点，字段 `t/f/s`）+ `activity.jsonl`（`hits/lastHit/status`）；
 *  两者都是**既有遥测**，本件不新建遥测。 */
export function buildImpactRows(d, limit = 3000) {
    const reads = new Map();
    for (const r of parseRows(join(d.kRoot, 'audit', 'access-real.jsonl'), limit)) {
        const t = Date.parse(String(r.t || ''));
        if (!Number.isFinite(t) || t < d.sinceMs || t > d.untilMs)
            continue;
        const k = `${String(r.f || '')}|${String(r.s || '')}`;
        reads.set(k, (reads.get(k) || 0) + 1);
    }
    const act = new Map();
    for (const r of parseRows(join(d.kRoot, 'audit', 'activity.jsonl'), limit))
        act.set(String(r.key || `${r.f}|${r.s}`), r);
    const keys = new Set([...reads.keys(), ...act.keys()]);
    const rows = [];
    for (const k of keys) {
        const [file, section] = k.split('|');
        if (!file)
            continue;
        const a = act.get(k);
        const realReads = reads.get(k) || 0;
        const hits = a ? Number(a.hits || 0) : null;
        rows.push({
            file, section, realReads, activityHits: hits,
            activityStatus: String(a?.status || 'unknown'),
            lastHitMs: a && Number.isFinite(Number(a.lastHit)) ? Number(a.lastHit) : null,
            injected: 'unknown',
            verdict: realReads > 0 || (hits || 0) > 0 ? 'keep' : 'unused-candidate',
        });
    }
    return rows.sort((x, y) => y.realReads - x.realReads || x.file.localeCompare(y.file));
}
/** 问题标记：**只用确定性证据**（真读/活性）；`suspect-recall` 与 `suspect-quality` 用**指针可解析性**分开。 */
export function issueRowsOf(memRoot, impact) {
    const out = [];
    for (const r of impact) {
        if (r.verdict !== 'unused-candidate')
            continue;
        const res = r.section ? resolveSection(memRoot, r.file.replace(/^notes\//, ''), r.section) : { state: 'missing' };
        const qualityOk = res.state === 'exists';
        out.push({
            tag: qualityOk ? 'suspect-recall' : 'suspect-quality',
            file: r.file, section: r.section,
            evidence: `realReads=${r.realReads} activityHits=${r.activityHits ?? 'n/a'} injected=${r.injected} pointer=${res.state}`,
            handled: 'not-handled',
            why: qualityOk
                ? '索引行/指针正常但从未被真读 ⇒ **归因指向注入/召回面**，不是记忆本身的问题（用户口径：只标记不处理）'
                : '指针不可解析 ⇒ 才可能是记忆质量问题（与上者分开计数）',
        });
    }
    return out;
}
/** 统计：**分母带绝对值**（`unused 率` 的分母固定为"本窗条数"），并单列 `injected-unknown` 占比。 */
export function statsOf(impact, issues) {
    const denom = impact.length;
    const unused = impact.filter((r) => r.verdict === 'unused-candidate').length;
    return {
        rows: denom,
        unused,
        unusedRate: denom ? Number((unused / denom).toFixed(3)) : 0,
        suspectRecall: issues.filter((i) => i.tag === 'suspect-recall').length,
        suspectQuality: issues.filter((i) => i.tag === 'suspect-quality').length,
        injectedUnknown: impact.filter((r) => r.injected === 'unknown').length,
    };
}
/** 汇报正文（**固定五段**）：区间 / 提存 / 压缩 / 问题标记 / 统计。 */
export function buildReportSection(i, stats, issues) {
    const ts = String(i.at).replace(/[:.]/g, '-');
    const lines = [];
    lines.push(`\n## ${i.at} · 第 ${i.materials.segments} 段区间\n`);
    lines.push(`### 1. 区间\n- 起止：${new Date(i.sinceMs).toISOString()} → ${new Date(i.untilMs).toISOString()}\n- 材料：L1 产出 ${i.materials.segments} 段 · 未落地 ${i.materials.failures} 条\n`);
    lines.push(`### 2. 提存\n- 原则：新增 ${i.produced.added} · 替换 ${i.produced.replaced}${i.produceOff ? '（**本月按口径停产**：gate=produce-off）' : ''}\n- 画像：${i.produced.profiles} 行\n`);
    lines.push(`### 3. 压缩\n- 树操作 ${i.maintenance.tree} · 指针 ${i.maintenance.pointers} · 归档 ${i.maintenance.archived} · 保留 ${i.maintenance.kept}\n`);
    lines.push(`### 4. 问题标记（**只标记不处理**）\n`);
    if (!issues.length)
        lines.push('- 本轮无标记\n');
    for (const s of issues.slice(0, 20))
        lines.push(`- \`${s.tag}\` ${s.file}${s.section ? ' §' + s.section : ''} · ${s.evidence} · **未处理**（${s.why}）\n`);
    lines.push(`\n### 5. 统计\n- 影响账 ${stats.rows} 条 · ` + '`unused`' + ` ${stats.unused}（率 ${stats.unusedRate}，分母=本窗 ${stats.rows} 条）\n- \`suspect-recall\` ${stats.suspectRecall} / \`suspect-quality\` ${stats.suspectQuality}（**前者占比高 ⇒ 问题在召回面**）\n- 注入口径不可判定 ${stats.injectedUnknown} 条（\`injected=unknown\`：步级遥测无法按条目归属，**不冒充判据**）\n`);
    lines.push(`\n<!-- round ${ts} -->\n`);
    return lines.join('');
}
/** 「最近成长」派生（`delta.md` 退役后的**注入源**）：三行方向级摘要。 */
export function derivationOf(i, stats) {
    const out = [`本轮提存 ${i.produced.added + i.produced.replaced} 条（原则/画像）`];
    if (i.maintenance.archived > 0)
        out.push(`压缩归档 ${i.maintenance.archived} 条（方向节点保留）`);
    if (stats.unused > 0)
        out.push(`标出 ${stats.unused} 条未被真读（疑似召回面 ${stats.suspectRecall} 条）`);
    return out.slice(0, 3);
}
/** 从**台账末条 `deep-sleep` 行**装配本轮输入（**解耦**：不必把一轮的十几个字段穿过装配层，
 *  也避开 `runDeepSleep` 的函数跨度上限 399/400 —— 这是会审记下的"净减前置"约束下的务实解法）。 */
export function roundInputFromLedger(d, fallbackDate = new Date().toISOString()) {
    const rows = parseRows(join(d.kRoot, 'audit', 'ledger.jsonl'), 400);
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.kind !== 'deep-sleep')
            continue;
        const at = String(r.at || fallbackDate);
        const until = Number(d.untilMs || Date.parse(at) || Date.now());
        const sinceMs = Number(r.epochSince || 0) || until - 6 * 3600 * 1000;
        return {
            at, sinceMs, untilMs: until,
            produceOff: String(r.gate || '') === 'produce-off' || Number(r.added || 0) === 0,
            produced: { added: Number(r.added || 0), replaced: Number(r.replaced || 0), profiles: Number(r.profiles || 0) },
            maintenance: {
                tree: Number(r.tree || 0), pointers: Number(r.pointers || 0),
                archived: Number(r.forgetArchived || 0), kept: Number(r.forgetKept || 0),
            },
            materials: { segments: Number(r.attempted || 0), failures: Number(r.rejected || 0) },
            impact: [],
        };
    }
    return null;
}
/** 一轮睡眠结束后落汇报（**从台账末条装配**；影响账在窗口上聚合）。 */
export function writeSleepReportFromLedger(d, untilMs) {
    const input = roundInputFromLedger({ kRoot: d.kRoot, untilMs });
    if (!input)
        return { ok: false, reason: 'no-deep-sleep-round' };
    input.impact = buildImpactRows({ kRoot: d.kRoot, sinceMs: input.sinceMs, untilMs: input.untilMs });
    const r = writeSleepRound(d, input);
    return { ok: true, reportFile: r.reportFile, issues: r.issues };
}
export function writeSleepRound(d, input) {
    const impact = input.impact;
    const issues = issueRowsOf(d.bankRoot, impact);
    const stats = statsOf(impact, issues);
    const report = buildReportSection(input, stats, issues);
    const file = sleepReportPathOf(d.bankRoot, d.date);
    const existed = existsSync(file);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, report, 'utf8'); // 追加：**同日多轮不覆盖**（"永不删除"的落点）
    mkdirSync(join(d.kRoot, 'audit'), { recursive: true });
    appendFileSync(sleepReportsStreamOf(d.kRoot), JSON.stringify({ kind: 'sleep-round', at: input.at, sinceMs: input.sinceMs, untilMs: input.untilMs, produceOff: input.produceOff, ...input.produced, ...input.maintenance, materials: input.materials, stats, firstOfDay: !existed }) + '\n', 'utf8');
    for (const r of impact)
        appendFileSync(sleepReportsStreamOf(d.kRoot), JSON.stringify({ kind: 'impact', at: input.at, ...r }) + '\n', 'utf8');
    for (const s of issues)
        appendFileSync(sleepIssuesStreamOf(d.kRoot), JSON.stringify({ at: input.at, state: 'open', ...s }) + '\n', 'utf8');
    return { reportFile: file, streamRow: true, issues: issues.length, report, stats };
}
//# sourceMappingURL=sleep-report.js.map