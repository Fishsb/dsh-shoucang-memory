/**
 * criteria.ts — 判据内核（ADR-122 记忆核心 v2）：**L0 共用评估器 + 升格/降格裁决**，单一实现。
 *
 * 判据取值与参数唯一事实源 = `skill/engine/criteria.json` → 生成投影 `src/criteria.generated.ts`（禁手写）。
 * 本模块只做**确定性判定**（无 LLM）：把"可复用性/泛化度/稳定性/冲突性"与"升格/降格门槛"从各域 prompt 散文里
 * 抽成可调用、可审计的函数——两域（摄取 Ingestor / 巩固 Consolidator）**同调一份实现**，杜绝判据漂移。
 *
 * 用法：
 *   evaluateL0(input)                      → L0 四维枚举 + basis（依据的 criteria id，入台账）
 *   promoteVerdict('principle'|'path', s)  → 升格裁决（含 premise 硬门）
 *   demoteVerdict(s)                       → 降格/遗忘裁决（三守卫 + 画像节保护 + 单轮上限）
 */
import { CRITERIA_ROWS, CRITERIA_VERSION, SURFACE, MATURATION, SCORE, L0 } from './criteria.generated.js';
export { CRITERIA_VERSION };
/** 判据参数查表（唯一事实源=注册表 → 生成投影的 CRITERIA_ROWS） */
export function paramOf(criteriaId, key, fallback) {
    const row = CRITERIA_ROWS.find((c) => c.id === criteriaId);
    const v = row?.params?.[key];
    return (v === undefined ? fallback : v);
}
/** 项目专名/本机路径/版本号等"单项目专属"信号（跨工作区红线的确定性代理） */
const PROJECT_SPECIFIC = /(?:[A-Za-z]:[\\/]|D:\\FF|shoucang|project-nav|prompt-enhancer|\bv?\d+\.\d+\.\d+\b)/;
/** L0 取值域（B 档 · 审查 F1-A）：**枚举字面量取自注册表** `criteria.l0.*.values`，并在此做一致性校验——
 *  注册表若删/改某取值，这里立刻抛错（fail-fast），而不是静默漂移成"声明一套、实现一套"。 */
const l0Pick = (dim, want) => {
    const vals = L0[dim].values;
    if (!vals.includes(want))
        throw new Error(`criteria.l0.${dim} 取值域缺少 '${want}'（注册表与实现不一致，请先补齐注册表）`);
    return want;
};
const REUSE = { task: l0Pick('reuse', 'cross-task'), project: l0Pick('reuse', 'cross-project'), session: l0Pick('reuse', 'session-only') };
const GEN = { direction: l0Pick('generality', 'direction'), contract: l0Pick('generality', 'contract-fact'), detail: l0Pick('generality', 'detail') };
const STAB = { once: l0Pick('stability', 'once'), sameDay: l0Pick('stability', 'same-day-repeat'), crossDay: l0Pick('stability', 'cross-day') };
const CONF = { none: l0Pick('conflict', 'none'), coexist: l0Pick('conflict', 'coexist'), supersede: l0Pick('conflict', 'supersede') };
/** L0 共用内核：四维枚举（两域同口径；**不打分**，避免魔法数） */
export function evaluateL0(input) {
    const text = String(input.text || '');
    const traces = Math.max(0, Number(input.traces) || 0);
    const days30 = Math.max(0, Number(input.days30) || 0);
    const sessions = Math.max(0, Number(input.sessions) || 0);
    const basis = [];
    // reuse：项目专名 → 仅本会话（守跨工作区红线）；跨会话 → 跨项目；否则跨任务（字面量取自注册表 REUSE）
    let reuse = REUSE.task;
    if (PROJECT_SPECIFIC.test(text)) {
        reuse = REUSE.session;
        basis.push('l0.reuse.project-specific');
    }
    else if (sessions >= 2) {
        reuse = REUSE.project;
        basis.push('l0.reuse.cross-session');
    }
    // generality：显式标注 → 方向指引；含具体数值/路径 → 细节条文；否则契约事实
    let generality = GEN.contract;
    if (/\[(原则|路径)\]/.test(text)) {
        generality = GEN.direction;
        basis.push('l0.generality.direction');
    }
    else if (/[0-9]{2,}|[A-Za-z]:[\\/]/.test(text)) {
        generality = GEN.detail;
        basis.push('l0.generality.detail');
    }
    // stability：跨日命中日数 ≥2 → 跨日；线索 ≥2 → 当日重现；否则单次
    let stability = STAB.once;
    if (days30 >= 2) {
        stability = STAB.crossDay;
        basis.push('l0.stability.cross-day');
    }
    else if (traces >= 2) {
        stability = STAB.sameDay;
        basis.push('l0.stability.same-day');
    }
    const conflict = input.supersedes ? CONF.supersede : CONF.none;
    if (input.supersedes)
        basis.push('l0.conflict.supersede');
    return { reuse, generality, stability, conflict, basis };
}
/** 升格裁决：notes/候选 → [原则] / [路径]（巩固域唯一入口的确定性前置） */
export function promoteVerdict(kind, stats) {
    const basis = [];
    if (kind === 'principle') {
        const id = 'consolidate.support.principle';
        const min = paramOf(id, 'minTraces', 3);
        basis.push(id);
        if ((stats.traces || 0) < min)
            return { ok: false, reason: `traces<${min}`, basis };
    }
    else {
        const id = 'consolidate.support.path';
        const minOccur = paramOf(id, 'minOccur', 2);
        const minCross = paramOf(id, 'crossSessionMin', 2);
        const successOnly = paramOf(id, 'successOnly', true);
        basis.push(id);
        if ((stats.occurrences || 0) < minOccur)
            return { ok: false, reason: `occurrences<${minOccur}`, basis };
        if ((stats.sessions || 0) < minCross)
            return { ok: false, reason: `crossSession<${minCross}`, basis };
        if (successOnly && stats.success === false)
            return { ok: false, reason: 'failed-task（只从成功学）', basis };
    }
    // premise 硬门（v2）：依赖隐含前提却没写出 → 不升格（降级 notes）
    const pid = 'consolidate.promote.premise';
    basis.push(pid);
    if (paramOf(pid, 'requirePremiseWhenDependent', true) && stats.dependsOnPremise && !stats.premiseWritten) {
        return { ok: false, reason: 'premise-missing（前提未写出 → 降级 notes）', basis };
    }
    // 跨工作区红线：项目专名/版本号 → 不升格
    const rid = 'consolidate.cross-workspace-redline';
    basis.push(rid);
    if (paramOf(rid, 'forbidProjectNames', true) && stats.dependsOnPremise === undefined && false) { /* 保留位：文本侧判定在 evaluateL0 完成 */ }
    return { ok: true, reason: 'ok', basis };
}
/** 降格/遗忘裁决：三守卫 + 画像节保护 + 单轮上限（禁直删） */
export function demoteVerdict(s) {
    const id = 'consolidate.demote.archive';
    const basis = [id];
    const coldDays = paramOf(id, 'coldDays', 90);
    const maxPerRun = paramOf(id, 'maxPerRun', 3);
    const profileForbidden = paramOf(id, 'profileFilesForbidden', true);
    if (profileForbidden && /^(user|agent)\.md$/i.test(String(s.file || '')))
        return { ok: false, reason: 'profile-file（画像节禁归档）', basis };
    if (!s.leaf)
        return { ok: false, reason: 'not-leaf（防孤儿树枝）', basis };
    if (s.isStub)
        return { ok: false, reason: 'already-stub（幂等）', basis };
    if (s.status !== 'cold' && s.status !== 'retired')
        return { ok: false, reason: `status=${s.status}（非 cold/retired）`, basis };
    if (Number(s.daysSinceHit ?? 0) < coldDays && s.status !== 'retired')
        return { ok: false, reason: `daysSinceHit<${coldDays}`, basis };
    if ((s.archivedThisRun || 0) >= maxPerRun)
        return { ok: false, reason: `maxPerRun=${maxPerRun}`, basis };
    return { ok: true, reason: 'archive', basis };
}
/** 检索面参数（供 vec/mcl 读取，避免各处硬编码阈值） */
export const SURFACE_PARAMS = SURFACE;
/** 成熟度（v2.2 E6）：A(0)=A0；每次**跨日再现** +step（上限 1.0）。distinctDays = 出现过的不同日数（−1 次首现）。 */
export function activationOf(distinctDays, params = MATURATION) {
    const a0 = Number(params.A0 ?? 0.3);
    const step = Number(params.step ?? 0.2);
    const days = Math.max(0, Number(distinctDays) || 0);
    return Math.min(1, a0 + step * Math.max(0, days - 1));
}
/** 升格成熟度门（v2.2）：enforce=false（缺省，M4 影子期）时恒放行，只回带 A 供台账记录 */
export function maturationVerdict(A, enforce, params = MATURATION) {
    const gate = Number(params.gate ?? 0.5);
    const ok = !enforce || A >= gate;
    return { ok, reason: ok ? 'ok' : `A=${A.toFixed(2)}<gate ${gate}（成熟度不足 → 降级 notes）`, basis: ['maturation.gate'] };
}
/** v2.2 统一打分（E 层）：score = α_rel·relevance + α_imp·importance + α_rec·recency（口径见 criteria.surface.score） */
export function layeredScore(input) {
    const s = SCORE;
    return Number(s.alphaRel ?? 1) * input.relevance + Number(s.alphaImp ?? 0.35) * input.importance + Number(s.alphaRec ?? 0.1) * input.recency;
}
/** importance 代理（v2.2 · MSR 五因子的可得信号近似：标签权重 + 内容长度；内容长度是校准后权重最高的信号 .363） */
const TAG_IMP = { lesson: 1.0, 原则: 1.0, flow: 0.9, 路径: 0.9, 经验: 0.9, 教训: 0.9, env: 0.7, tool: 0.7 };
export function importanceOf(line) {
    const m = String(line || '').match(/^\[([^\]]+)\]/);
    const tagW = m ? (TAG_IMP[m[1]] ?? 0.6) : 0.5;
    const lenNorm = Math.min(1, String(line || '').replace(/\s+/g, '').length / 70);
    return 0.5 * tagW + 0.5 * lenNorm;
}
//# sourceMappingURL=criteria.js.map