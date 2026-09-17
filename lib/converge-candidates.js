// converge-candidates.ts — **跨粒度收敛候选生成（向量层）**（S-P4c′ · 2026-09-16）
//
// 判因（真机实测）：S-P4b 把 `convergeOps` 写进 prompt 后，真机首发**模型一条都没提**（`otherTried:0`）。
//   查证后排除"通道不可达"（`currentProfiles` 注入的是两画像文件**全文**，叙事行确在材料里），
//   故问题在**分工**：我要求模型**自己从全量材料里找出**「同一知识的粗/细两版」——
//   而仓内既有原则早已写明分工：**候选生成交向量，模糊判断交模型**（`deepsleep-run.ts` 注释）。
// ⇒ 本件补上缺失的那一半：**向量先筛出候选对**（粗粒度带标签行 × 细粒度无标签行），
//   模型只需对**少数候选**做"是不是同一知识"的判断（那是它擅长的、也是不可替代的部分）。
//
// 与 P3 度量同源：`scripts/effective-directions.mjs#crossForm` 是**同一判据的报告态实现**
//   （口径：粗 = 含 `→ notes/` 或 `- ` 开头带标签；细 = `- ` 开头且无标签）。两处**口径必须一致**，
//   否则"度量出的空间"与"实际收敛的空间"不可比。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const isTagged = (l) => /\[[^\]\s]{1,8}\]/.test(l);
const isFine = (l) => /^\s*-\s/.test(l) && !isTagged(l);
const isCoarse = (l) => /→\s*notes\//.test(l) || (/^\s*-\s/.test(l) && isTagged(l));
/**
 * 生成跨粒度收敛候选（**纯读 + 向量**；不写任何文件）。向量不可用时返回空数组**并给出原因**
 * （调用方如实记"未判" —— 仓内口径：失败/不可用 ⇒ null/空，绝不假装已判）。
 */
export async function convergeCandidates(memRoot, deps) {
    const minSim = Number(deps.minSim ?? 0.75);
    const topN = Number(deps.topN ?? 8);
    const coarse = [];
    const fine = [];
    for (const f of ['AGENT.md', 'USER.md']) {
        let text = '';
        try {
            text = readFileSync(join(memRoot, f), 'utf8');
        }
        catch {
            continue;
        }
        for (const raw of text.split(/\r?\n/)) {
            const l = raw.trim();
            if (!l)
                continue;
            if (isCoarse(l))
                coarse.push({ file: f, line: l });
            else if (isFine(l))
                fine.push({ file: f, line: l });
        }
    }
    if (!fine.length || !coarse.length)
        return { candidates: [], reason: '无候选面（细粒度或粗粒度行集为空）' };
    const cfg = deps.embedCfg;
    if (!cfg || !cfg.enabled)
        return { candidates: [], reason: '向量未配置 ⇒ **未判**（不假装）' };
    let vec;
    try {
        vec = (await import('./vec.js'));
    }
    catch {
        return { candidates: [], reason: 'vec 模块不可用 ⇒ 未判' };
    }
    const embedMany = vec.embedMany;
    const cosine = vec.cosine;
    if (typeof embedMany !== 'function' || typeof cosine !== 'function')
        return { candidates: [], reason: 'vec 缺 embedMany/cosine ⇒ 未判' };
    let all;
    try {
        all = await embedMany(deps.embedCfg, [...coarse.map((c) => c.line), ...fine.map((c) => c.line)]);
    }
    catch (e) {
        return { candidates: [], reason: 'embedMany 失败（' + String(e?.message || e).slice(0, 50) + '）⇒ 未判' };
    }
    if (!all || all.length !== coarse.length + fine.length)
        return { candidates: [], reason: 'embed 返回长度不符 ⇒ 未判' };
    const out = [];
    for (let i = 0; i < fine.length; i++) {
        const fv = all[coarse.length + i];
        let best = -1, bi = -1;
        for (let j = 0; j < coarse.length; j++) {
            const s = cosine(fv, all[j]);
            if (s > best) {
                best = s;
                bi = j;
            }
        }
        if (bi >= 0 && best >= minSim)
            out.push({ file: fine[i].file, coarse: coarse[bi].line, fine: fine[i].line, sim: Math.round(best * 1000) / 1000 });
    }
    out.sort((a, b) => b.sim - a.sim);
    return { candidates: out.slice(0, topN), reason: `候选 ${out.length} 对（取前 ${topN}；阈值 ${minSim}）` };
}
//# sourceMappingURL=converge-candidates.js.map