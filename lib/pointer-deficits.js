// pointer-deficits.ts — 「指针缺陷 · 待认领队列」**单一实现**（2026-09-19 · 指针供给 §4-3 / §12）
//
// 判因（两轮方案共同暴露的结构性盲区）：
//   ① **半落**（写侧）：同批 append 失败而索引行照写 ⇒ 行指向**存在但正文为空**的小节（G2）；
//   ② **跨批**（读侧）：详情在后续批次始终没落地 ⇒ 同一形态的**长期**空壳落点（本次实测：3 个小节被 4 行指着）。
//   两类的共同点：**地址有效、知识不在**——现有全部机检都在测地址空间，测不到这一点。
//
// 本模块把该缺陷类收成**一个读出口 + 一条幂等登记闭环**：
//   · 扫描（确定性，零语义判断）：`scanEmptyLandings`（主档指针落点为**正文 0 非空行**的小节）
//     + `scanEmptySections`（全库空壳标题，不论有无引用——它是"下次被误指进去"的诱因）；
//   · 两个既有**待认领队列**的读侧：台账 `type=anchor-needed`（需人工建锚）+ `pending/-knowledge-defer-*`（未落地知识）；
//   · `deferredQueueOf` = **统一只读出口**（计数 + 去重行 + 来源）；
//   · `registerDeficits` = **幂等登记**（同 (源, 目标, 形态) ⇒ 同文件，已存在即跳过）⇒ 周期巡检把**新**缺陷自动入队。
//
// 边界（明确不做）：**不自动建锚**、**不自动回填正文**（方案 §3「不做」）。
//   队列只保证"漏掉的可见、可捞、可认领"——处置仍是人的决策（本文件的 `registerDeficits` 只写登记卡）。
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pointersOfRow, resolveSectionSpec, sectionTitles } from './section-ref.js';
import { readLedgerVolumes } from './ledger-compact.js';
/** 小节正文 = 标题后到下一个同级/更高级标题之间的**非空行数**（确定性口径；与 check-pointer-content 同源） */
const bodyNonEmptyLines = (absFile, titleIdx, level) => {
    let lines = [];
    try {
        lines = readFileSync(absFile, 'utf8').split(/\r?\n/);
    }
    catch {
        return null;
    }
    let n = 0;
    for (let i = titleIdx + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#{2,6})[ \t]+/);
        if (m && m[1].length <= level)
            break;
        if (lines[i].trim())
            n++;
    }
    return n;
};
const notesFilesOf = (bankRoot) => {
    try {
        return readdirSync(join(bankRoot, 'notes')).filter((f) => /\.md$/i.test(f) && f.toLowerCase() !== 'index.md');
    }
    catch {
        return [];
    }
};
/** 全库空壳标题（`##`~`####`，正文 0 非空行；不论有无引用） */
export function scanEmptySections(bankRoot) {
    const out = [];
    for (const f of notesFilesOf(bankRoot)) {
        let lines = [];
        try {
            lines = readFileSync(join(bankRoot, 'notes', f), 'utf8').split(/\r?\n/);
        }
        catch {
            continue;
        }
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^(#{2,4})[ \t]+(.*)$/);
            if (!m)
                continue;
            const n = bodyNonEmptyLines(join(bankRoot, 'notes', f), i, m[1].length);
            if (n === 0)
                out.push({ kind: 'empty-section', ref: `notes/${f} §${m[2].trim()}`, detail: `${'#'.repeat(m[1].length)} 标题正文为空` });
        }
    }
    return out;
}
/** 主档（MEMORY/AGENT/USER）里**落点为空格**的指针行（读侧回落语义：取最后一个可解析部分） */
export function scanEmptyLandings(bankRoot) {
    const out = [];
    for (const mf of ['MEMORY.md', 'AGENT.md', 'USER.md']) {
        const p = join(bankRoot, mf);
        if (!existsSync(p))
            continue;
        let text = '';
        try {
            text = readFileSync(p, 'utf8');
        }
        catch {
            continue;
        }
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim() || !line.includes('→'))
                continue;
            for (const ptr of pointersOfRow(line)) {
                const { agg, parts } = resolveSectionSpec(bankRoot, ptr.file, ptr.spec);
                const okParts = parts.filter((x) => x.res.state === 'exists');
                if (agg === 'missing' || !okParts.length)
                    continue; // 悬空指针由 check-section-refs 棘轮另守
                const landing = okParts[okParts.length - 1];
                const titles = sectionTitles(bankRoot, ptr.file) || [];
                const t = titles.find((x) => x.idx === landing.res.cands[0].idx);
                if (!t)
                    continue;
                const n = bodyNonEmptyLines(join(bankRoot, 'notes', String(ptr.file).replace(/^notes\//, '')), t.idx, t.level);
                if (n === 0)
                    out.push({ kind: 'empty-landing', ref: `notes/${ptr.file} §${t.title}`, detail: `${mf}: ${line.trim().slice(0, 90)}` });
            }
        }
    }
    return out;
}
/**
 * 建锚行是否**仍然**缺锚（确定性，复用 `section-ref` 的**同一**解析器，不另写匹配）。
 * 保守方向：说不清（文件/小节名为空、解析异常）⇒ 视为**仍缺**（宁可报缺，不静默丢缺陷）。
 */
const anchorStillMissing = (bankRoot, target, section) => {
    const file = String(target ?? '').trim();
    const spec = String(section ?? '').trim();
    if (!file || !spec)
        return true;
    try {
        const { agg, parts } = resolveSectionSpec(bankRoot, file, spec);
        const okParts = parts.filter((x) => x.res.state === 'exists');
        return agg === 'missing' || !okParts.length;
    }
    catch {
        return true;
    }
};
/**
 * 台账 `type=anchor-needed`（蒸馏写侧登记的"需人工建锚"；同 target§section 只留一条）。
 *
 * ⚠ **必须读全量 + 读全部卷**（G12/G13 · 2026-09-19 真机暴露两次）：
 *   ① 原先缺省 `slice(-4000)` 只回读末 4000 行，而真库台账已 **2.2 万行**
 *      ⇒ **靠前的缺陷行被静默漏掉**（实测：出口报 **25** 条，全量 **33** 条）；
 *   ② 即便改成"全量读主档"仍不够——台账有**按大小轮转**（`rotateBySize` ⇒ `ledger.jsonl.1`），
 *      实测 17:45 轮转后主档只剩 105 行，**33 条 anchor 行全在旧卷** ⇒ 只读主档读数变 **0**（全盲）。
 *   现改为复用**既有单一实现** `ledger-compact#readLedgerVolumes`（跨档按时间序、不可读档跳过），
 *   不再自写"读哪些文件"的逻辑（避免又一份口径）。
 *
 * 传入 `bankRoot` 时对每行判 `stillMissing`：指向**已存在**小节的行是**过时项**
 *   （小节后来经别的路径建好了）⇒ 由 `deferredQueueOf` 归入 `staleAnchor`，**不再冒充缺陷**。
 */
export function readAnchorNeeded(ledgerFile, bankRoot) {
    const seen = new Map();
    const lines = readLedgerVolumes(ledgerFile);
    for (const l of lines) {
        if (!l)
            continue;
        try {
            const o = JSON.parse(l);
            if (!o || o.type !== 'anchor-needed')
                continue;
            const target = String(o.target ?? '');
            const section = String(o.section ?? '');
            const ref = `notes/${target.replace(/^notes\//, '')} §${section}`;
            const stillMissing = bankRoot ? anchorStillMissing(bankRoot, target, section) : undefined;
            seen.set(ref, {
                kind: 'anchor-needed',
                ref,
                detail: `${String(o.reason ?? '').slice(0, 90)}（sid ${String(o.sid ?? '').slice(0, 8)}）`,
                ...(stillMissing === undefined ? {} : { stillMissing }),
            });
        }
        catch { /* 坏行跳过 */ }
    }
    return [...seen.values()];
}
/** `pending/-knowledge-defer-*.md`（未落地知识回退卡；同文件名只留一条） */
export function readKnowledgeDefers(pendDir) {
    let files = [];
    try {
        files = readdirSync(pendDir).filter((f) => f.includes('-knowledge-defer-') && f.endsWith('.md'));
    }
    catch {
        return [];
    }
    return files.sort().map((f) => {
        let head = '';
        try {
            head = readFileSync(join(pendDir, f), 'utf8').split(/\r?\n/).slice(0, 6).join(' ').slice(0, 110);
        }
        catch { /* 读失败=只报文件名 */ }
        return { kind: 'knowledge-defer', ref: `pending/${f}`, detail: head };
    });
}
/** 主档指针统计（**判据件与运行时共用同一实现**，避免"检查器自己再写一份扫描"） */
export function pointerStats(bankRoot) {
    let pointers = 0, rows = 0, unresolvable = 0;
    for (const mf of ['MEMORY.md', 'AGENT.md', 'USER.md']) {
        const p = join(bankRoot, mf);
        if (!existsSync(p))
            continue;
        let text = '';
        try {
            text = readFileSync(p, 'utf8');
        }
        catch {
            continue;
        }
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim() || !line.includes('→'))
                continue;
            const ptrs = pointersOfRow(line);
            if (!ptrs.length)
                continue;
            rows++;
            for (const ptr of ptrs) {
                pointers++;
                const { agg, parts } = resolveSectionSpec(bankRoot, ptr.file, ptr.spec);
                const okParts = parts.filter((x) => x.res.state === 'exists');
                if (agg === 'missing' || !okParts.length)
                    unresolvable++;
            }
        }
    }
    return { pointers, rows, unresolvable, emptyLandings: scanEmptyLandings(bankRoot), emptySections: scanEmptySections(bankRoot) };
}
/**
 * **统一只读出口**：四个来源合并（空壳落点 / 全库空壳 / 台账 anchor-needed / pending 知识回退）。
 * 不变量：`rows.length === total === Σcounts`——**清单与计数同源**（stale 项单列，不进这一组）。
 */
export function deferredQueueOf(d) {
    const anchors = readAnchorNeeded(join(d.kRoot, 'audit', 'ledger.jsonl'), d.bankRoot);
    const liveAnchors = anchors.filter((r) => r.stillMissing !== false);
    const staleRefs = anchors.filter((r) => r.stillMissing === false).map((r) => r.ref);
    const rows = [
        ...scanEmptyLandings(d.bankRoot),
        ...scanEmptySections(d.bankRoot),
        ...liveAnchors,
        ...readKnowledgeDefers(join(d.kRoot, 'pending')),
    ];
    const counts = { 'empty-landing': 0, 'empty-section': 0, 'anchor-needed': 0, 'knowledge-defer': 0 };
    for (const r of rows)
        counts[r.kind]++;
    return { counts, total: rows.length, rows, staleAnchor: staleRefs.length, staleRefs: staleRefs.sort() };
}
/** 回退卡文件名（幂等命名：同 (源, 目标形态, 内容) ⇒ 同路径）——`distill-write` 的同类卡复用本函数 */
export const knowledgeDeferFileOf = (pendDir, sid, line, now = new Date()) => {
    const hash = createHash('sha1').update(`${sid}\n${String(line ?? '')}`).digest('hex').slice(0, 10);
    return join(String(pendDir), `${now.toISOString().slice(0, 10)}-knowledge-defer-${hash}.md`);
};
/**
 * **幂等登记闭环**（周期巡检调用）：把**新**出现的缺陷登记成待认领卡。
 *   · 只登记 `empty-landing` / `empty-section` 两类（`anchor-needed` 已是台账行、`knowledge-defer` 已是卡，无需再登记）；
 *   · 同 (源, 形态, ref) ⇒ 同文件 ⇒ 已存在即跳过（**幂等**，反复巡检不膨胀）；
 *   · **不建锚、不回填**（边界见文件头）；登记卡只是"可捞"的载体。
 */
export function registerDeficits(d) {
    const now = d.now || new Date();
    const pendDir = join(d.kRoot, 'pending');
    const rows = [...scanEmptyLandings(d.bankRoot), ...scanEmptySections(d.bankRoot)];
    let written = 0, skipped = 0;
    const files = [];
    for (const r of rows) {
        const f = knowledgeDeferFileOf(pendDir, 'pointer-inspection', `${r.kind}\n${r.ref}`, now);
        if (existsSync(f)) {
            skipped++;
            continue;
        }
        try {
            mkdirSync(pendDir, { recursive: true });
            writeFileSync(f, `# [knowledge-defer] ${r.kind} · ${r.ref}\n\n- 形态：${r.kind}（地址有效、正文为空）\n- 来源：周期巡检（pointer-deficits#registerDeficits）\n- 明细：${r.detail}\n- 状态：待认领（**不自动建锚、不自动回填**；处置口径见 docs/pointer-supply-plan.md §2.3/§12）\n`, 'utf8');
            written++;
            files.push(f);
        }
        catch {
            skipped++;
        }
    }
    if (written) {
        try {
            mkdirSync(join(d.kRoot, 'audit'), { recursive: true });
            appendFileSync(join(d.kRoot, 'audit', 'ledger.jsonl'), JSON.stringify({ at: now.toISOString(), type: 'pointer-deficit-registered', domain: 'consolidate', written, scanned: rows.length }) + '\n', 'utf8');
        }
        catch { /* 台账失败不影响登记 */ }
    }
    return { scanned: rows.length, written, skipped, files };
}
//# sourceMappingURL=pointer-deficits.js.map