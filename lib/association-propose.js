import { extractRecallTokens } from './targets.js';
/**
 * 把 notes 记录按标题切成**小节**（纯函数）。
 * 口径：`#`/`##`/`###` 行开新节（记录 `kind==='structure'` 由解析器标注），节体 = 其后至下一个标题的行。
 * 只取 notes/*（索引行是"指针"，不是内容；联想要在**内容**之间发生）。
 */
export function sectionsOf(records) {
    const byFile = new Map();
    for (const r of records) {
        if (!r.file || !r.file.startsWith('notes/'))
            continue;
        const arr = byFile.get(r.file);
        if (arr)
            arr.push(r);
        else
            byFile.set(r.file, [r]);
    }
    const out = [];
    for (const [file, rows] of byFile) {
        const sorted = rows.slice().sort((x, y) => x.order - y.order);
        let cur = null;
        const flush = () => {
            if (!cur)
                return;
            const text = cur.lines.join(' ').trim();
            if (cur.section && text)
                out.push({ key: `${file} §${cur.section}`, file, section: cur.section, text });
            cur = null;
        };
        for (const r of sorted) {
            const t = (r.text || '').trim();
            if (/^#{1,6}\s/.test(t)) {
                flush();
                cur = { section: t.replace(/^#{1,6}\s*/, '').trim(), lines: [] };
                continue;
            }
            if (cur)
                cur.lines.push(t);
            // 标题之前的内容（文件抬头）不属于任何小节 ⇒ 丢弃（它不是"断言"，是说明文字）
        }
        flush();
    }
    return out;
}
/**
 * **提议联想**（纯函数：向量由调用方注入 ⇒ 本件零 IO、可单测）。
 *
 * 判据（三条都要满足，缺一即"不是联想"）：
 *   ① **跨载体**：`a.file !== b.file` —— 同一文件内的相近是"重复"，不是"异域同构"；
 *   ② **语义相近**：`sim >= minSim`（默认 0.72，`bge-m3` 余弦；可调）；
 *   ③ **词面不重叠**：共有检索 token 数 `<= maxShared`（默认 2）—— **这是与"检索"的分界线**：
 *      若两段话共词很多，那只是"用词像"，检索就能找到，**不值得称联想**。
 *
 * 排序：相似度降序（同分按共词数升序 ⇒ 更"异域"的排前面）；截断 `topN`。
 */
export function proposeAssociations(sections, vectors, opts = {}) {
    const minSim = opts.minSim ?? 0.72;
    const maxShared = opts.maxShared ?? 2;
    const topN = opts.topN ?? 20;
    const toks = sections.map((s) => new Set(extractRecallTokens(s.text)));
    const cos = (a, b) => {
        let d = 0, na = 0, nb = 0;
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) {
            d += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return na && nb ? d / Math.sqrt(na * nb) : 0;
    };
    const out = [];
    for (let i = 0; i < sections.length; i++) {
        const va = vectors[i];
        if (!va || !va.length)
            continue;
        for (let j = i + 1; j < sections.length; j++) {
            if (sections[i].file === sections[j].file)
                continue; // ① 同文件 ⇒ 不算异域
            const vb = vectors[j];
            if (!vb || !vb.length)
                continue;
            const sim = cos(va, vb);
            if (sim < minSim)
                continue; // ② 语义要近
            const shared = [];
            for (const t of toks[i])
                if (toks[j].has(t))
                    shared.push(t);
            if (shared.length > maxShared)
                continue; // ③ 词面别重叠（否则那是检索，不是联想）
            out.push({ a: sections[i], b: sections[j], sim, sharedTokens: shared.length, shared });
        }
    }
    return out.sort((x, y) => (y.sim - x.sim) || (x.sharedTokens - y.sharedTokens)).slice(0, topN);
}
//# sourceMappingURL=association-propose.js.map