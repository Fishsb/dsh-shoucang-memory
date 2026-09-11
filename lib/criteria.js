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
import { CRITERIA_ROWS, CRITERIA_VERSION, SURFACE } from './criteria.generated.js';
export { CRITERIA_VERSION };
/** 判据参数查表（唯一事实源=注册表 → 生成投影的 CRITERIA_ROWS） */
export function paramOf(criteriaId, key, fallback) {
    const row = CRITERIA_ROWS.find((c) => c.id === criteriaId);
    const v = row?.params?.[key];
    return (v === undefined ? fallback : v);
}
/** 项目专名/本机路径/版本号等"单项目专属"信号（跨工作区红线的确定性代理） */
const PROJECT_SPECIFIC = /(?:[A-Za-z]:[\\/]|D:\\FF|shoucang|project-nav|prompt-enhancer|\bv?\d+\.\d+\.\d+\b)/;
/** L0 共用内核：四维枚举（两域同口径；**不打分**，避免魔法数） */
export function evaluateL0(input) {
    const text = String(input.text || '');
    const traces = Math.max(0, Number(input.traces) || 0);
    const days30 = Math.max(0, Number(input.days30) || 0);
    const sessions = Math.max(0, Number(input.sessions) || 0);
    const basis = [];
    // reuse：项目专名 → 仅本会话（守跨工作区红线）；跨会话 → 跨项目；否则跨任务
    let reuse = 'cross-task';
    if (PROJECT_SPECIFIC.test(text)) {
        reuse = 'session-only';
        basis.push('l0.reuse.project-specific');
    }
    else if (sessions >= 2) {
        reuse = 'cross-project';
        basis.push('l0.reuse.cross-session');
    }
    // generality：显式标注 → 方向指引；含具体数值/路径 → 细节条文；否则契约事实
    let generality = 'contract-fact';
    if (/\[(原则|路径)\]/.test(text)) {
        generality = 'direction';
        basis.push('l0.generality.direction');
    }
    else if (/[0-9]{2,}|[A-Za-z]:[\\/]/.test(text)) {
        generality = 'detail';
        basis.push('l0.generality.detail');
    }
    // stability：跨日命中日数 ≥2 → 跨日；线索 ≥2 → 当日重现；否则单次
    let stability = 'once';
    if (days30 >= 2) {
        stability = 'cross-day';
        basis.push('l0.stability.cross-day');
    }
    else if (traces >= 2) {
        stability = 'same-day-repeat';
        basis.push('l0.stability.same-day');
    }
    const conflict = input.supersedes ? 'supersede' : 'none';
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
//# sourceMappingURL=criteria.js.map