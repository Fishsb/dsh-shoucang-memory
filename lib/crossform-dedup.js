// crossform-dedup.ts — **注入侧跨形态消重**（S-P4e · 2026-09-16）
//
// 判因（真机实测两轮）：S-P4 原设计要在**库内物理收敛**（把与粗粒度行同源的细粒度叙事行移走），
//   但「让模型判同一性」在本模型上**实测不可行** —— 两轮真机（含语义层判为 0.809 同源的候选）**0 提案**，
//   且 `out` 顶层键里根本没有 `convergeOps`。
// ⇒ 改在**消费侧**做：**不改库**，只在**注入文本**里不再重复注入"已被粗粒度行涵盖"的细粒度行。
//   收益相同（省注入预算），但**误判代价从「丢库内容」降为「少注入一行」**，库文件零改动、无需回滚。
//   也更贴合四板块模型：**"压缩"在消费侧表现为去重注入**，库（原层）保持"只是记录"。
//
// **接线点（已定案）**：`panel-inject.ts` 的注入入口（`text: (context) => d.hot.build(...)`）。
//   **不在** `panel-shared` 内接线 —— 它受**大模块冻结棘轮**约束（`dynamic-select.ts` 即为此拆出）。
//   本件在**未冻结的调用方**包一层：**异步预热**（fire-and-forget 写本模块薄引用）+ **同步应用**（逐字过滤）。
//   ⚠ **失败开放（fail-open）**：预热未完成/向量不可用 ⇒ skip 空 ⇒ **注入面逐字节回基线**。
//     刻意的：消重是**优化**，绝不能因向量不可用而**少注入内容**（那才是真损失）。
//
// 判据分层：**判定全交向量**（确定性、可复现、可解释），本件**不调 LLM**。
//   阈值登记在 `criteria.json#thresholds` 的 `inject.crossFormDedupSim`。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
/** 注入侧消重阈值（**登记表单一事实源**；`check-threshold-registry` 的 probe 锚点）。 */
export const CROSS_FORM_DEDUP_SIM = 0.8;
const isTagged = (l) => /\[[^\]\s]{1,8}\]/.test(l);
const isFine = (l) => /^\s*-\s/.test(l) && !isTagged(l);
const isCoarse = (l) => /→\s*notes\//.test(l) || (/^\s*-\s/.test(l) && isTagged(l));
/** 从 `~/.dsh/suite/scheduler.json` 造 embed 配置（**自包含**：预热只需 memRoot，零跨域依赖）。 */
export function embedCfgFromSuite(home = homedir()) {
    try {
        const s = JSON.parse(readFileSync(join(home, '.dsh', 'suite', 'scheduler.json'), 'utf8'));
        const baseUrl = String(s.embedBaseUrl || '');
        const model = String(s.embedModel || '');
        return { enabled: !!(baseUrl && model), baseUrl, model, apiKeyEnv: String(s.embedApiKeyEnv || '') };
    }
    catch {
        return { enabled: false, baseUrl: '', model: '', apiKeyEnv: '' };
    }
}
/**
 * 计算"注入时应跳过的细粒度行"。**纯读 + 向量**，不写任何文件。
 * 向量不可用/异常 ⇒ 空 `skip` **并给出原因**（fail-open；仓内口径：不可用即如实记"未判"）。
 */
export async function crossFormCovered(memRoot, embedCfg, opts) {
    const thr = Number(opts?.threshold ?? CROSS_FORM_DEDUP_SIM);
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
                coarse.push(l);
            else if (isFine(l))
                fine.push(l);
        }
    }
    const stat = { coarse: coarse.length, fine: fine.length, embedded: 0 };
    const empty = (note) => ({ skip: [], reasons: [], note, stat });
    if (!fine.length || !coarse.length)
        return empty('无判定面（细粒度或粗粒度行集为空）');
    const cfg = embedCfg;
    if (!cfg || !cfg.enabled)
        return empty('向量未配置 ⇒ 未判（fail-open：注入面回基线）');
    let vec;
    try {
        vec = (await import('./vec.js'));
    }
    catch {
        return empty('vec 模块不可用 ⇒ 未判');
    }
    const embedMany = vec.embedMany;
    const cosine = vec.cosine;
    if (typeof embedMany !== 'function' || typeof cosine !== 'function')
        return empty('vec 缺 embedMany/cosine ⇒ 未判');
    let all;
    try {
        all = await embedMany(embedCfg, [...coarse, ...fine]);
    }
    catch (e) {
        return empty('embedMany 失败（' + String(e?.message || e).slice(0, 50) + '）⇒ 未判');
    }
    if (!all || all.length !== coarse.length + fine.length)
        return empty('embed 返回长度不符 ⇒ 未判');
    stat.embedded = all.length;
    const skip = [];
    const reasons = [];
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
        if (bi >= 0 && best >= thr) {
            skip.push(fine[i]);
            reasons.push({ line: fine[i], by: coarse[bi], sim: Math.round(best * 1000) / 1000 });
        }
    }
    return { skip, reasons, note: `已判定：跳过 ${skip.length}/${fine.length}（阈值 ${thr}）`, stat };
}
/** 过滤注入**行**（纯函数：逐字比对，不做模糊匹配 —— 避免"消重"自身引入不确定性）。
 *  ⚠ **两侧对称 trim**：文本行与 skip 条目都 trim 后再比 —— 首版只 trim 文本侧 ⇒
 *    skip 条目带首尾空白时**不命中**（实测被 `test-inject-dedup` ⑤ 抓到，18/19）。 */
export function filterInjected(lines, skip) {
    if (!skip.length)
        return [...lines];
    const set = new Set(skip.map((s) => s.trim()));
    return lines.filter((l) => !set.has(l.trim()));
}
/** 过滤**注入文本**（整段；逐行逐字比对，保留行序）。fail-open：`skip` 空 ⇒ **原样返回**。 */
export function filterInjectedText(text, skip) {
    if (!skip.length)
        return text;
    const set = new Set(skip.map((s) => s.trim()));
    return text.split('\n').filter((l) => !set.has(l.trim())).join('\n');
}
/* ── **本模块持有的薄引用**（异步预热 → 同步应用 的缝）─────────────────────────
 * 为什么不塞进 `HotMemoryCache`：后者定义在 `panel-shared`（**冻结棘轮**），加字段会撞冻结。
 * ⚠ **必须"可变状态装箱"**（单个 `const` 对象 + 改字段），**不得用模块级 `let`** ——
 *   仓内 `audit-architecture` 有「可变全局」棘轮（基线 0，只许降不许升），
 *   实测本件首版用 5 个 `let` ⇒ 当场判红（`distill-state.ts` 的同族纪律）。 */
const BOX = {
    skip: [],
    reasons: [],
    note: '未预热',
    warmedAt: 0,
    warming: false,
};
/** 预热（**fire-and-forget 安全**：并发只跑一次；失败不抛、不影响注入）。 */
export async function warmInjectDedup(memRoot, opts) {
    if (BOX.warming)
        return;
    BOX.warming = true;
    try {
        const cfg = opts?.embedCfg ?? embedCfgFromSuite();
        const r = await crossFormCovered(memRoot, cfg, opts);
        BOX.skip = r.skip;
        BOX.reasons = r.reasons;
        BOX.note = r.note;
        BOX.warmedAt = Date.now();
    }
    catch (e) {
        BOX.note = '预热异常（fail-open）：' + String(e?.message || e).slice(0, 50);
    }
    finally {
        BOX.warming = false;
    }
}
/** 同步取用（注入路径每步调用；**O(1)**，无 IO）。 */
export function dedupState() {
    return { skip: BOX.skip, reasons: BOX.reasons, note: BOX.note, warmedAt: BOX.warmedAt };
}
//# sourceMappingURL=crossform-dedup.js.map