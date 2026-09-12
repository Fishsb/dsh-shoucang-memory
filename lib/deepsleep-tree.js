// deepsleep-tree.ts — 深睡「树整合 consolidation」领域（依赖 3 个）
//
// ⚠ 411 行仍是全仓第二大函数（>400 ⇒ 计入单函数跨度债务）。本阶段只做**迁出 + 依赖窄化**，
//   算法未动（零逻辑改动）；把它按 A/B/C/D 四相拆开排在阶段 D（需重排共享中间态，风险高于本步）。
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { semanticSim } from './vec.js';
export async function consolidateTree(d, memRoot) {
    const { log, audit, embedCfgOf } = d;
    const pad2 = (n) => String(n).padStart(2, '0');
    const n0 = new Date();
    const archStamp = `${n0.getFullYear()}${pad2(n0.getMonth() + 1)}${pad2(n0.getDate())}-${pad2(n0.getHours())}${pad2(n0.getMinutes())}${pad2(n0.getSeconds())}`;
    let archFile = '';
    let archived = 0;
    // 归档：每轮 <memRoot>/audit/consolidate/consolidate-<YYYYMMDD-HHmmss>.jsonl 逐条 append（可回滚证据）
    const archive = (o) => {
        try {
            if (!archFile) {
                const dir = join(memRoot, 'audit', 'consolidate');
                mkdirSync(dir, { recursive: true });
                archFile = join(dir, `consolidate-${archStamp}.jsonl`);
            }
            appendFileSync(archFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8');
            archived++;
        }
        catch { /* 归档失败静默：绝不影响 consolidation 主流程 */ }
    };
    // 原子整文件重写（tmp + rename，与本文件既有落盘纪律一致）
    const atomicWrite = (p, text) => {
        try {
            const tmp = p + '.tmp';
            writeFileSync(tmp, text, 'utf8');
            renameSync(tmp, p);
            return true;
        }
        catch {
            try {
                unlinkSync(p + '.tmp');
            }
            catch { /* */ }
            return false;
        }
    };
    // 既有行整理口径：空行压缩 + 末尾单换行（与 applyPrinciples/applyPointerOps 一致）
    const finalize = (ls) => ls.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
    // 索引指针行：`[标签] …` 起始（标签内无空白，与全文件既有口径一致）
    const idxRowRe = /^\[[^\]\s]+\]/;
    // 小节标题核心名：去掉行尾「（20xx-…）」日期括号后缀（memory_write_gate.mjs 禁日期戳同口径）
    const coreName = (t) => String(t || '').trim().replace(/\s*[（(]\s*20\d{2}[-/]\d{1,2}[-/]\d{1,2}[^）)]*[）)]\s*$/, '').trim();
    // 双向包含：title===kw || title.includes(kw) || kw.includes(title)（与 memory_write_gate.mjs 同口径，按核心名比较）
    const biContains = (a, b) => {
        const x = coreName(a);
        const y = coreName(b);
        return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
    };
    const refsOf = (line) => {
        const out = [];
        const re = /→\s*(notes\/[A-Za-z0-9_-]+\.md)\s*([^→]*?)(?=→|$)/g;
        let m;
        while ((m = re.exec(line))) {
            const file = m[1].trim();
            for (const part of String(m[2] || '').split('/')) {
                const kw = part.replace(/^§+/, '').trim();
                if (kw)
                    out.push({ file, kw });
            }
        }
        return out;
    };
    const ecfg = embedCfgOf();
    let embedBudget = 300; // 单轮语义比较预算（本地 bge 也应控量；用尽后只做确定性去重）
    let idxExact = 0, idxSem = 0, secMerged = 0, lineDedup = 0;
    const IDX_FILES = ['MEMORY.md', 'USER.md', 'AGENT.md'];
    try {
        // ═══ A 索引行精确重复折叠（确定性，恒做）═══
        for (const f of IDX_FILES) {
            try {
                const p = join(memRoot, f);
                let content = '';
                try {
                    content = readFileSync(p, 'utf8');
                }
                catch {
                    continue;
                } // 缺失/不可读 → 跳过该文件
                const lines = content.split(/\r?\n/);
                const seen = new Set();
                const kept = [];
                const droppedRaw = [];
                for (const ln of lines) {
                    const t = ln.trim();
                    if (t && idxRowRe.test(t)) {
                        if (seen.has(t)) {
                            droppedRaw.push(ln);
                            continue;
                        } // trim 完全相同：删后续，保留首次
                        seen.add(t);
                    }
                    kept.push(ln);
                }
                if (!droppedRaw.length)
                    continue; // 无变化不落盘
                for (const d of droppedRaw)
                    archive({ action: 'idx-exact-drop', file: f, original: d });
                if (atomicWrite(p, finalize(kept)))
                    idxExact += droppedRaw.length;
            }
            catch { /* A 单文件异常：跳过继续 */ }
        }
        // ═══ B 索引行语义近重折叠（同文件+同标签+同指针目标组内 pairwise sim≥0.90 → 留长删短）═══
        for (const f of IDX_FILES) {
            try {
                const p = join(memRoot, f);
                let content = '';
                try {
                    content = readFileSync(p, 'utf8');
                }
                catch {
                    continue;
                }
                const lines = content.split(/\r?\n/);
                const rows = [];
                lines.forEach((ln, idx) => {
                    const t = ln.trim();
                    if (!t || !idxRowRe.test(t) || !/→\s*notes\//.test(t))
                        return;
                    const tag = String((t.match(/^\[([^\]\s]+)\]/) || [])[1] || '');
                    const at = t.indexOf('→');
                    rows.push({ idx, raw: ln, tag, front: (at >= 0 ? t.slice(0, at) : t).trim(), refs: refsOf(t) });
                });
                if (rows.length < 2)
                    continue;
                const shareTarget = (ra, rb) => {
                    for (const a of ra)
                        for (const b of rb)
                            if (a.file === b.file && biContains(a.kw, b.kw))
                                return true;
                    return false;
                };
                // 指针组（union-find）：同文件 + 同标签 + 共享指针目标（§小节名双向包含）→ 一组
                const parent = rows.map((_, i) => i);
                const find = (x) => { while (parent[x] !== x) {
                    parent[x] = parent[parent[x]];
                    x = parent[x];
                } return x; };
                for (let i = 0; i < rows.length; i++) {
                    for (let j = i + 1; j < rows.length; j++) {
                        if (rows[i].tag === rows[j].tag && shareTarget(rows[i].refs, rows[j].refs))
                            parent[find(i)] = find(j);
                    }
                }
                const groups = new Map();
                rows.forEach((_, i) => { const r = find(i); const g = groups.get(r) || []; g.push(i); groups.set(r, g); });
                const dropSet = new Set();
                // 语义组（仅 ecfg.enabled 且预算内）：组内两两前段 semanticSim≥0.90 → 同事实（union-find）
                if (ecfg.enabled && embedBudget > 0) {
                    for (const g of groups.values()) {
                        if (g.length < 2 || embedBudget <= 0)
                            continue;
                        const sp = g.map((_, k) => k);
                        const sfind = (x) => { while (sp[x] !== x) {
                            sp[x] = sp[sp[x]];
                            x = sp[x];
                        } return x; };
                        for (let i = 0; i < g.length && embedBudget > 0; i++) {
                            for (let j = i + 1; j < g.length && embedBudget > 0; j++) {
                                embedBudget--;
                                let s = null;
                                try {
                                    s = await semanticSim(rows[g[i]].front, rows[g[j]].front, ecfg);
                                }
                                catch {
                                    s = null;
                                } // sim 失败=跳过该对
                                if (s !== null && s >= 0.9)
                                    sp[sfind(i)] = sfind(j);
                            }
                        }
                        const comps = new Map();
                        g.forEach((_, k) => { const r = sfind(k); const c = comps.get(r) || []; c.push(k); comps.set(r, c); });
                        for (const c of comps.values()) {
                            if (c.length < 2)
                                continue;
                            // 保留概况（前段字符）较多者；等长取文件序更早（唯一确定，防抖动）
                            let keep = c[0];
                            for (const k of c) {
                                const a = rows[g[keep]];
                                const b = rows[g[k]];
                                if (b.front.length > a.front.length || (b.front.length === a.front.length && b.idx < a.idx))
                                    keep = k;
                            }
                            const keptRow = rows[g[keep]];
                            for (const k of c) {
                                const r = rows[g[k]];
                                if (k === keep)
                                    archive({ action: 'idx-sem-keep', file: f, original: r.raw });
                                else {
                                    archive({ action: 'idx-sem-drop', file: f, original: r.raw, into: keptRow.raw });
                                    dropSet.add(r.idx);
                                }
                            }
                        }
                    }
                }
                if (!dropSet.size)
                    continue; // 无变化不落盘
                const out = [];
                lines.forEach((ln, idx) => { if (!dropSet.has(idx))
                    out.push(ln); });
                if (atomicWrite(p, finalize(out)))
                    idxSem += dropSet.size;
            }
            catch { /* B 单文件异常：跳过继续 */ }
        }
        const parseSections = (ls) => {
            const heads = [];
            for (let i = 0; i < ls.length; i++) {
                const m = /^(#{2,})[ \t]+(.*)$/.exec(ls[i]);
                if (m)
                    heads.push({ i, level: m[1].length, title: m[2].trim() });
            }
            const levelAt = new Map();
            heads.forEach((h) => levelAt.set(h.i, h.level));
            const out = [];
            for (let k = 0; k < heads.length; k++) {
                const h = heads[k];
                let end = ls.length;
                for (let kk = k + 1; kk < heads.length; kk++) {
                    if (heads[kk].level <= h.level) {
                        end = heads[kk].i;
                        break;
                    }
                }
                let leaf = true;
                const body = [];
                const bodyIdx = [];
                let p = h.i + 1;
                while (p < end) {
                    const lv = levelAt.get(p);
                    if (lv !== undefined && lv > h.level) {
                        // 遇到更深子标题：整段跳过（属子树区，不是本小节正文）→ 本小节非叶子
                        leaf = false;
                        let q = p + 1;
                        while (q < ls.length) {
                            const l2 = levelAt.get(q);
                            if (l2 !== undefined && l2 <= lv)
                                break;
                            q++;
                        }
                        p = q;
                        continue;
                    }
                    body.push(ls[p]);
                    bodyIdx.push(p);
                    p++;
                }
                out.push({ idx: h.i, level: h.level, title: h.title, end, leaf, body, bodyIdx, raw: ls.slice(h.i, end) });
            }
            return out;
        };
        let noteFiles = [];
        try {
            noteFiles = readdirSync(join(memRoot, 'notes')).filter((x) => /\.md$/i.test(x) && x.toLowerCase() !== 'index.md');
        }
        catch {
            noteFiles = [];
        }
        // ═══ C 同小节内精确重复正文行去重（确定性，恒做）═══
        for (const nf of noteFiles) {
            try {
                const p = join(memRoot, 'notes', nf);
                let content = '';
                try {
                    content = readFileSync(p, 'utf8');
                }
                catch {
                    continue;
                }
                const lines = content.split(/\r?\n/);
                const dropIdx = new Set();
                const archivedSec = new Set(); // 每小节整段原文只归档一次（避免重复归档）
                let fileDedup = 0;
                for (const s of parseSections(lines)) {
                    const seenL = new Set();
                    const dups = [];
                    for (let k = 0; k < s.bodyIdx.length; k++) {
                        const t = s.body[k].trim();
                        if (!t)
                            continue;
                        if (seenL.has(t)) {
                            dups.push(s.body[k]);
                            dropIdx.add(s.bodyIdx[k]);
                        }
                        else
                            seenL.add(t);
                    }
                    if (!dups.length)
                        continue;
                    if (!archivedSec.has(s.idx)) {
                        archivedSec.add(s.idx);
                        archive({ action: 'line-dedup-section', file: `notes/${nf}`, heading: s.title, sectionOriginal: s.raw.join('\n'), dropped: dups });
                    }
                    fileDedup += dups.length;
                }
                if (fileDedup > 0) {
                    const kept = lines.filter((_, i) => !dropIdx.has(i));
                    if (atomicWrite(p, finalize(kept)))
                        lineDedup += fileDedup;
                }
            }
            catch { /* C 单文件异常：跳过继续 */ }
        }
        // ═══ D 叶子小节语义合并（树感知：只并叶子、指针整段改写、归档可回滚）═══
        const mergesByFile = new Map();
        for (const nf of noteFiles) {
            try {
                const p = join(memRoot, 'notes', nf);
                let content = '';
                try {
                    content = readFileSync(p, 'utf8');
                }
                catch {
                    continue;
                }
                let lines = content.split(/\r?\n/);
                let merges = 0;
                let changed = false;
                const chain = [];
                for (let guard = 0; guard < 8; guard++) { // 每并一次结构变化 → 重解析再找；上限防病态循环
                    const secs = parseSections(lines);
                    const leaves = secs.filter((s) => s.leaf && !!coreName(s.title));
                    if (leaves.length < 2)
                        break;
                    let merged = false;
                    for (let a = 0; a < leaves.length && !merged; a++) {
                        for (let b = a + 1; b < leaves.length && !merged; b++) {
                            const x = leaves[a];
                            const y = leaves[b];
                            const xBody = x.body.filter((l) => l.trim()).map((l) => l.trim()).join('\n');
                            const yBody = y.body.filter((l) => l.trim()).map((l) => l.trim()).join('\n');
                            // 守卫：正文空（无可并内容）、标题核心名双向包含（同名/演化同族）、或核心名含 / 或 §
                            // （会破坏索引指针 `§A/§B` 列表语法，改写后无法再被解析）→ 保守跳过
                            if (!xBody || !yBody || biContains(x.title, y.title))
                                continue;
                            const xCore = coreName(x.title);
                            const yCore = coreName(y.title);
                            if (xCore.includes('/') || xCore.includes('§') || yCore.includes('/') || yCore.includes('§'))
                                continue;
                            let sim = null;
                            if (xBody === yBody)
                                sim = 1; // 正文逐行全同 → 视为 1.0 直并（不依赖向量）
                            else if (ecfg.enabled && embedBudget > 0) {
                                embedBudget--;
                                try {
                                    sim = await semanticSim(`${coreName(x.title)}\n${xBody}`, `${coreName(y.title)}\n${yBody}`, ecfg);
                                }
                                catch {
                                    sim = null;
                                }
                            }
                            if (sim === null || sim < 0.95)
                                continue; // sim 不可用/未达标：跳过语义（正文全同已在上方直并）
                            // canonical=正文较长者；等长且正文不同 → 无法唯一确定 canonical → 跳过；等长正文全同 → 取文件序更早
                            let c;
                            let o;
                            if (xBody.length > yBody.length) {
                                c = x;
                                o = y;
                            }
                            else if (yBody.length > xBody.length) {
                                c = y;
                                o = x;
                            }
                            else if (xBody !== yBody)
                                continue;
                            else {
                                c = x.idx < y.idx ? x : y;
                                o = x.idx < y.idx ? y : x;
                            }
                            // 合并执行：删除 o（标题+正文整段），把 o 正文中 canonical 没有的唯一非空行追加到 canonical 正文尾
                            const cTrim = new Set(c.body.map((l) => l.trim()));
                            const extra = [];
                            for (const ol of o.body) {
                                const t = ol.trim();
                                if (!t || cTrim.has(t))
                                    continue;
                                cTrim.add(t);
                                extra.push(/^-\s/.test(ol) ? ol : `- ${ol}`); // 原本有 `- ` 前缀保留原样，否则补 `- `
                            }
                            const delta = o.end - o.idx;
                            const rest = lines.slice(0, o.idx).concat(lines.slice(o.end));
                            const cIdx = o.idx < c.idx ? c.idx - delta : c.idx;
                            // canonical 小节正文尾部（其末个非空行之后；下一个 ≤ 级标题前）作为追加插入点
                            let slot = rest.length;
                            for (let q = cIdx + 1; q < rest.length; q++) {
                                const lv = /^(#{2,})[ \t]+/.exec(rest[q]);
                                if (lv && lv[1].length <= c.level) {
                                    slot = q;
                                    break;
                                }
                            }
                            let ins = cIdx + 1;
                            for (let q = cIdx + 1; q < slot; q++) {
                                if (rest[q].trim() !== '')
                                    ins = q + 1;
                            }
                            lines = rest.slice(0, ins).concat(extra, rest.slice(ins));
                            archive({
                                action: 'sec-merge', file: `notes/${nf}`,
                                removedHeading: o.title, removedOriginal: o.raw.join('\n'),
                                keptHeading: c.title, keptOriginal: c.raw.join('\n'), mergedExtra: extra,
                                reason: xBody === yBody ? 'body-identical' : `semantic-${Number(sim).toFixed(3)}`,
                            });
                            chain.push({ old: coreName(o.title), next: coreName(c.title) });
                            merges++;
                            changed = true;
                            merged = true;
                        }
                    }
                    if (!merged)
                        break;
                }
                if (changed && merges && atomicWrite(p, finalize(lines))) {
                    secMerged += merges;
                    mergesByFile.set(nf, chain); // 落盘成功才登记指针改写链（防改指针指向未落盘的合并）
                }
            }
            catch { /* D 单文件异常：跳过继续 */ }
        }
        // D 尾：索引指针整段改写（被并 §另一小节名 → §canonical 去日期核心名；匹配=核心名双向包含）
        if (mergesByFile.size) {
            // 链式合并解析终值（A→B 后又 B→C → 最终 C），改写只对「已不存在的旧小节名」发生
            const finalChain = (chain) => {
                const map = new Map();
                for (const c of chain) {
                    if (c.old && c.next && c.old !== c.next)
                        map.set(c.old, c.next);
                }
                const out = [];
                for (const [old, n0] of map) {
                    let next = n0;
                    let hop = 0;
                    while (map.has(next) && hop < 8) {
                        next = map.get(next);
                        hop++;
                    }
                    out.push({ old, next });
                }
                return out;
            };
            // 单行改写：把 notes/<nf>（nf 已含 .md 扩展名）后紧跟的 § 目标 token 中匹配 old 的整段换成 new。
            // 段边界=下一个 notes/ 引用或 →（小节 token 列表必在 → 之前）；改写只替换 token 文本、保留其余原样；
            // 若整段为纯「§A/§B」语法（无杂散文本）才做重复 § 折叠归一，避免把 ` → ` 等连字符吞进 token。
            const rewriteRowPointers = (raw, nf, finals) => {
                const token = `notes/${nf}`;
                if (!raw.includes(token))
                    return null;
                let out = '';
                let cursor = 0;
                let pos = raw.indexOf(token);
                let changed = false;
                while (pos >= 0) {
                    out += raw.slice(cursor, pos + token.length);
                    let end = raw.length;
                    const nx = raw.indexOf('notes/', pos + token.length);
                    const nxArrow = raw.indexOf('→', pos + token.length);
                    if (nx >= 0 && nx < end)
                        end = nx;
                    if (nxArrow >= 0 && nxArrow < end)
                        end = nxArrow; // 段内不得越过 →（token 列表必在其前）
                    let seg = raw.slice(pos + token.length, end);
                    const firstSeg = seg;
                    let segChanged = false;
                    seg = seg.replace(/(§[^§/]*)/g, (whole) => {
                        const kw = coreName(whole.replace(/^§+/, '').trim());
                        if (!kw)
                            return whole;
                        for (const fm of finals) {
                            if (biContains(kw, fm.old)) {
                                changed = true;
                                segChanged = true;
                                return `§${fm.next}`;
                            }
                        }
                        return whole;
                    });
                    if (segChanged) {
                        // 纯「§A/§B」（可带空白）才整段归一：去空 token、同目标重复折叠、统一 ` §A/§B` 风格；
                        // 保留原段首/段尾空白（防 `…§X → …` 边界丢空格）；含杂散文本（如 →/notes/）则只做 token 替换不改其余
                        const gm = /^\s*((?:§[^§/→]*)(?:\s*\/\s*(?:§[^§/→]*))*)\s*$/.exec(seg);
                        if (gm) {
                            const seen = new Set();
                            const norm = [];
                            const tokRe = /§([^§/]+)/g;
                            let tm;
                            while ((tm = tokRe.exec(gm[1]))) {
                                const core = coreName(tm[1].trim());
                                if (!core || seen.has(core))
                                    continue;
                                seen.add(core);
                                norm.push(`§${core}`);
                            }
                            if (norm.length) {
                                const lead = /^\s/.test(firstSeg) ? ' ' : '';
                                const trail = /\s$/.test(firstSeg) ? ' ' : '';
                                seg = lead + norm.join('/') + trail;
                            }
                        }
                    }
                    out += seg;
                    cursor = end;
                    if (end >= raw.length)
                        break;
                    pos = raw.indexOf(token, end);
                }
                out += raw.slice(cursor);
                return changed ? out : null;
            };
            for (const f of IDX_FILES) {
                try {
                    const p = join(memRoot, f);
                    let content = '';
                    try {
                        content = readFileSync(p, 'utf8');
                    }
                    catch {
                        continue;
                    }
                    const lines = content.split(/\r?\n/);
                    let fileChanged = false;
                    const rewritten = [];
                    for (const raw of lines) {
                        const t = raw.trim();
                        if (!t || !idxRowRe.test(t)) {
                            rewritten.push(raw);
                            continue;
                        }
                        let cur = raw;
                        for (const [nf, chain] of mergesByFile) {
                            const upd = rewriteRowPointers(cur, nf, finalChain(chain));
                            if (upd !== null)
                                cur = upd;
                        }
                        if (cur !== raw) {
                            fileChanged = true;
                            archive({ action: 'sec-merge-pointer', file: f, original: raw, into: cur });
                        }
                        rewritten.push(cur);
                    }
                    if (fileChanged)
                        atomicWrite(p, finalize(rewritten));
                }
                catch { /* 索引指针改写单文件异常：跳过继续 */ }
            }
        }
    }
    catch (e) {
        // 顶层防御：异常仅收敛为日志（已发生步骤的计数保留），绝不抛出、不中断深睡主流程
        log(`consolidate: 内部异常（已收敛）: ${String(e?.message || e).slice(0, 120)}`);
    }
    audit({ kind: 'consolidate', idxExact, idxSem, secMerged, lineDedup, archived, memRoot });
    log(`consolidate: 索引精确去重 ${idxExact} / 语义折叠 ${idxSem} / 小节合并 ${secMerged} / 行内去重 ${lineDedup} / 归档 ${archived}`);
    return { idxExact, idxSem, secMerged, lineDedup, archived };
}
//# sourceMappingURL=deepsleep-tree.js.map