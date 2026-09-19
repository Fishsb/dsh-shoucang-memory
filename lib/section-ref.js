/**
 * section-ref.ts — 小节寻址**单一语义**（S1R · D1/D2，2026-09-19）
 *
 * 判因（S1 库核心只读复查，证据见 `docs/specs/S1-library-recheck-2026-09-19.md`）：
 *   库的 `§小节名` 是**内容锚**，但「名字 → 小节」的解析在仓内有**四份实现**且对「多命中」处置互不相同
 *   （`read_section` 取首个 / 写门集合去重 / `treeops#matchSection` 多命中⇒null / `memory-append` 逐级取首个）
 *   ⇒ 同一个指针在读侧、写门、材料侧**三种结论**；实测 `notes/env.md §插件注入` 正是此例
 *   （读侧能读、写门通过、材料侧判「不存在」并静默剔除）。
 *
 * 本件把语义收敛为**三态**：`exists | ambiguous | missing`。**歧义 ≠ 不存在**——
 *   同名小节是真实存在的情况（实测 env.md 两处），二值语义必然二选一地造假。
 *
 * ⚠ **物理多处、语义单源**：库工具链（`skill/scripts/section-ref.mjs`）因**子进程调用、零依赖**
 *   （不得 import src/）而必须另有一份同语义实现（与 `secret-redact.ts` ↔ `memory_write_gate.mjs`
 *   `findSecretHits` 的先例同型）。两处由 `scripts/check-section-ref-parity.mjs` 的**差分锁**守：
 *   同一夹具集逐例比对 `state + 候选集`，不一致即红。**改任一处必须同批改另一处。**
 *
 * 归一与裁决（两处实现必须逐条一致）：
 *   ① 去行尾维护元信息括号（`coreName` 口径）② 小写 ③ 去空白（含全角空格）
 *   ④ 标题面 = `##`/`###` 两级（ADR-015；不含 `####`）
 *   ⑤ 精确命中**唯一** ⇒ exists(exact)；否则双向包含命中唯一 ⇒ exists(loose)；
 *      否则命中 ≥2 ⇒ **ambiguous**；否则 ⇒ missing
 *   ⚠ ⑤ 与既有 `matchSection` 的差别**仅**在于「多命中」不再折成 null，而是显式 `ambiguous`
 *      ⇒ 既有调用点的二值判定（`state === 'exists'`）行为**逐例不变**。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreName, normalizeNotesFile, parseSections } from './treeops.js';
/** 归一：核心名 → 小写 → 去全部空白（两处实现同口径） */
export const sectionCore = (s) => coreName(String(s ?? '')).toLowerCase().replace(/\s+/g, '');
/** 单文件标题清单（`##`/`###` 两级；ADR-015 两级检索单元）；文件不可读 ⇒ null */
export function sectionTitles(memRoot, file) {
    const f = normalizeNotesFile(file);
    if (!f)
        return null;
    const p = join(String(memRoot || ''), 'notes', f);
    let text = '';
    try {
        text = readFileSync(p, 'utf8');
    }
    catch {
        return null;
    }
    const ls = text.split(/\r?\n/);
    return parseSections(ls)
        .filter((s) => s.level === 2 || s.level === 3)
        .map((s) => ({ title: s.title, level: s.level, idx: s.idx }));
}
export function resolveLevelInParent(titles, parentIdx, level, name, opts = {}) {
    const kw = sectionCore(name);
    const looseMode = opts.loose === 'contains' ? 'contains' : 'prefix';
    const list = Array.isArray(titles) ? titles : [];
    const from = parentIdx < 0 ? 0 : Number(parentIdx) + 1;
    const parentLevel = parentIdx < 0 ? 1 : list[Number(parentIdx)].level;
    const scope = [];
    for (let i = from; i < list.length; i++) {
        if (list[i].level <= parentLevel)
            break; // 出父范围
        if (list[i].level === level)
            scope.push({ t: list[i], at: i });
    }
    const cand = ({ t, at }) => {
        const core = sectionCore(t.title);
        return { title: t.title, core, level: t.level, idx: t.idx, at, exact: core === kw };
    };
    const exactHits = scope.filter(({ t }) => sectionCore(t.title) === kw);
    if (exactHits.length === 1)
        return { state: 'exact', pick: cand(exactHits[0]), cands: [cand(exactHits[0])] };
    // ⚠ **写侧比读侧严**（册三 · §5-1）：读侧的"双向包含"是**容错回落**（读了再说），
    //   而写侧 loose 只认**前缀关系**（候选以 kw 开头 / kw 以候选开头）。
    //   判因（G5 实测）：仅尾部包含会让「环境」落进「DSH 环境」——语义面不同的两件事，属**放错**而非容错。
    const uniq = new Map();
    for (const s of scope) {
        const c = sectionCore(s.t.title);
        if (!kw || !c)
            continue;
        const hit = looseMode === 'contains' ? (c === kw || c.includes(kw) || kw.includes(c)) : (c.startsWith(kw) || kw.startsWith(c));
        if (hit)
            uniq.set(s.t.idx, s);
    }
    const hits = [...uniq.values()].sort((a, b) => a.t.idx - b.t.idx);
    if (hits.length === 1)
        return { state: 'loose', pick: cand(hits[0]), cands: [cand(hits[0])] };
    if (hits.length > 1)
        return { state: 'ambiguous', pick: null, cands: hits.map(cand) };
    return { state: 'missing', pick: null, cands: [] };
}
/** 路径放置计划：逐级裁决；`ambiguous` ⇒ **refused**（不猜、不取首个）；首缺层 ⇒ `missingPi` */
export function planPlacement(titles, pathParts, opts = {}) {
    const parts = Array.isArray(pathParts) ? pathParts : [];
    const steps = [];
    let parentIdx = -1;
    let missingPi = -1;
    for (let pi = 0; pi < parts.length; pi++) {
        const level = 2 + pi;
        const r = resolveLevelInParent(titles, parentIdx, level, parts[pi], opts);
        if (r.state === 'ambiguous')
            return { refused: { pi, level, name: parts[pi], cands: r.cands.map((c) => c.title) }, steps, parentIdx, missingPi: -1 };
        if (r.state === 'missing') {
            missingPi = pi;
            steps.push({ pi, level, state: 'missing', name: parts[pi] });
            break;
        }
        steps.push({ pi, level, state: r.state, name: parts[pi], at: r.pick.at, title: r.pick.title });
        parentIdx = r.pick.at;
    }
    return { refused: null, steps, parentIdx, missingPi };
}
export function resolveSection(memRoot, file, name) {
    const f = normalizeNotesFile(file);
    const kw = sectionCore(name);
    if (!f)
        return { state: 'missing', exact: false, cands: [], fileExists: false, reason: '文件名非法（仅 notes/<name>.md）' };
    const p = join(String(memRoot || ''), 'notes', f);
    const fileExists = existsSync(p);
    if (!fileExists)
        return { state: 'missing', exact: false, cands: [], fileExists: false, reason: `文件不存在 notes/${f}` };
    if (!kw)
        return { state: 'missing', exact: false, cands: [], fileExists: true, reason: '小节名为空' };
    const titles = sectionTitles(memRoot, f) || [];
    return resolveFromTitles(titles, kw);
}
/** 纯函数裁决（供差分锁在不落盘的前提下逐例比对） */
export function resolveFromTitles(titles, name) {
    const kw = sectionCore(name);
    if (!kw)
        return { state: 'missing', exact: false, cands: [], fileExists: true, reason: '小节名为空' };
    const cand = (t) => {
        const core = sectionCore(t.title);
        return { title: t.title, core, level: t.level, idx: t.idx, exact: core === kw };
    };
    const exactHits = titles.filter((t) => sectionCore(t.title) === kw);
    if (exactHits.length === 1)
        return { state: 'exists', exact: true, cands: [cand(exactHits[0])], fileExists: true };
    const looseHits = titles.filter((t) => {
        const c = sectionCore(t.title);
        return !!c && (c === kw || c.includes(kw) || kw.includes(c));
    });
    const uniq = new Map();
    for (const t of looseHits)
        uniq.set(t.idx, t);
    const list = [...uniq.values()].sort((a, b) => a.idx - b.idx);
    if (list.length === 1)
        return { state: 'exists', exact: exactHits.length > 0, cands: [cand(list[0])], fileExists: true };
    if (list.length > 1)
        return { state: 'ambiguous', exact: exactHits.length > 0, cands: list.map(cand), fileExists: true };
    return { state: 'missing', exact: false, cands: [], fileExists: true };
}
/**
 * `§A/§B`（同文件并列小节 / 父子路径）→ 逐部分三态 + **聚合四态**。
 * 聚合：全部 exists ⇒ exists；**部分可解析 ⇒ `partial`**（读侧回落最深可解析段）；
 *      无 missing 但有 ambiguous ⇒ ambiguous；**全不可解析 ⇒ missing**。
 * ⚠ `partial` **只作用于准入策略**（放行 + 提示），不是"名字存在"——名字级判定始终三态。
 */
export function resolveSectionSpec(memRoot, file, spec) {
    const names = String(spec ?? '').split('/').map((s) => s.replace(/^§/, '').trim()).filter(Boolean);
    if (!names.length)
        return { agg: 'missing', parts: [] };
    const parts = names.map((name) => ({ name, res: resolveSection(memRoot, file, name) }));
    const nMissing = parts.filter((p) => p.res.state === 'missing').length;
    const nAmbig = parts.filter((p) => p.res.state === 'ambiguous').length;
    const nOk = parts.length - nMissing - nAmbig;
    const agg = nMissing === 0
        ? (nAmbig > 0 ? 'ambiguous' : 'exists')
        : (nOk + nAmbig === 0 ? 'missing' : 'partial');
    return { agg, parts };
}
/** 二值兼容门（与迁移前 `forgetops#sectionExists` 逐例同结论：只有 exists 为真） */
export function sectionExistsRef(memRoot, file, section) {
    return resolveSection(memRoot, file, section).state === 'exists';
}
export function pointersOfRow(line) {
    const s = String(line ?? '');
    const toks = [];
    const re = /notes\/([A-Za-z0-9_.-]+)\.md/g;
    let m;
    while ((m = re.exec(s)) !== null)
        toks.push({ file: m[1] + '.md', at: m.index, end: m.index + m[0].length });
    const out = [];
    for (let i = 0; i < toks.length; i++) {
        const stop = i + 1 < toks.length ? toks[i + 1].at : s.length;
        const tail = s.slice(toks[i].end, stop);
        if (!/^\s*§/.test(tail))
            continue;
        const spec = [];
        for (const seg of tail.split('/').map((x) => x.trim()).filter(Boolean)) {
            if (/\.md$/.test(seg))
                break;
            spec.push(seg.replace(/^§/, '').trim());
        }
        if (spec.length)
            out.push({ file: toks[i].file, spec: spec.join('/') });
    }
    return out;
}
export function admitIndexRow(memRoot, line) {
    const missing = [];
    const partial = [];
    const ambiguous = [];
    for (const p of pointersOfRow(line)) {
        const { agg, parts } = resolveSectionSpec(memRoot, p.file, p.spec);
        if (agg === 'missing') {
            const bad = parts.find((x) => x.res.state === 'missing');
            missing.push({ file: p.file, spec: p.spec, name: bad ? bad.name : p.spec });
        }
        else if (agg === 'partial') {
            partial.push({
                file: p.file,
                spec: p.spec,
                missing: parts.filter((x) => x.res.state === 'missing').map((x) => x.name),
                resolved: parts.filter((x) => x.res.state !== 'missing').map((x) => x.name),
            });
            const last = parts[parts.length - 1];
            if (last && last.res.state === 'missing')
                missing.push({ file: p.file, spec: p.spec, name: last.name });
        }
        else if (agg === 'ambiguous') {
            const amb = parts.find((x) => x.res.state === 'ambiguous');
            ambiguous.push({ file: p.file, spec: p.spec, cands: (amb ? amb.res.cands : []).map((c) => c.title) });
        }
    }
    return { ok: missing.length === 0, missing, partial, ambiguous };
}
//# sourceMappingURL=section-ref.js.map