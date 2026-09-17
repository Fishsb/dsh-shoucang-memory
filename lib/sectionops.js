// sectionops.ts — **跨粒度收敛**（S-P4 / R2-A · 2026-09-16）
//
// 为什么单独成件：它动的是**画像文件**（AGENT.md / USER.md）的**行**，而 `forgetOps` 有一条既有硬保护
//   ——「画像文件（user/agent）**不得 archive**」（`forgetops.ts:15` R1 硬保护）。那条保护守的是
//   "整节归档"（会连人格一起搬走）；本件要做的却是**另一件事**：把**与粗粒度行语义同源的细粒度叙事行**收敛掉，
//   使同一知识不再以两种粒度并存（P0 实测：三索引 38 条无标签叙事行 / 2907 字符；语义层实测其中
//   1 条确定同源 + 36 条中间带 —— 见 `OPEN-ITEMS S-P3a′`）。
// ⇒ 故**不复用 forgetOps**（语义不同、护栏不同），但**复用其成熟纪律**：归档可回滚 + 审计留痕 + 绝不直删。
//
// **四条硬门（缺一即拒收该条）**：
//   ① **成对取证**：`coarse` 与 `fine` 都必须**逐字**存在于目标文件 —— 由**模型**从材料里抄，宿主**只校验**；
//   ② **细粒度行必须无标签**（`- ` 开头且不含 `[xx]`）—— 有标签者是画像行/索引行，**不在本通道范围**；
//   ③ **粗粒度行必须有标签**且 ≠ 细粒度行（防"自收敛"）；
//   ④ **配额**：每轮 ≤3 条（同 `consolidate.demote.archive.maxPerRun`，防一次大改）。
//
// **回滚**：被收敛的行**整行**写入 `<bank>/audit/converge/converge-<ts>.jsonl`（append-only），
//   需要时按 file+line 逐字贴回即可恢复 —— **绝不直删**（与忘归档同族纪律）。
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
/** 每轮收敛配额（与 `consolidate.demote.archive.maxPerRun` 同法；**单一常量**，勿散落字面量）。 */
export const CONVERGE_MAX_PER_RUN = 3;
const isFineRow = (l) => /^\s*-\s/.test(l) && !/\[[^\]\s]{1,8}\]/.test(l);
const isCoarseRow = (l) => /\[[^\]\s]{1,8}\]/.test(l);
const norm = (l) => l.trim();
/**
 * 应用收敛提案。**纯 IO、无 LLM**：只做校验 + 移除 + 归档（幂等：同一条重复提交第二次即 `skipped`）。
 * @param memRoot 记忆库根
 * @param ops     模型给出的收敛提案
 * @param hooks   审计/日志注入（留痕；缺省静默，便于单测）
 */
export async function applyConvergeOps(memRoot, ops, hooks) {
    const audit = hooks?.audit || (() => { });
    const log = hooks?.log || (() => { });
    const res = { applied: 0, skipped: 0, tried: 0, archived: 0, reasons: [] };
    const list = Array.isArray(ops) ? ops.slice(0, CONVERGE_MAX_PER_RUN) : [];
    res.tried = list.length;
    if (!list.length)
        return res;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const archDir = join(memRoot, 'audit', 'converge');
    let archFile = '';
    for (const op of list) {
        const file = String(op?.file || '').replace(/^notes\//, '');
        const coarse = norm(String(op?.coarse || ''));
        const fine = norm(String(op?.fine || ''));
        // ① 只允许这两个画像文件（本通道的射程）
        if (file !== 'AGENT.md' && file !== 'USER.md') {
            res.skipped++;
            res.reasons.push(`file 越界：${file}`);
            continue;
        }
        // ④ 成对取证：两条都必须逐字存在
        let lines;
        try {
            lines = readFileSync(join(memRoot, file), 'utf8').split(/\r?\n/);
        }
        catch {
            res.skipped++;
            res.reasons.push(`不可读：${file}`);
            continue;
        }
        const iFine = lines.findIndex((l) => norm(l) === fine);
        const iCoarse = lines.findIndex((l) => norm(l) === coarse);
        if (!coarse || !fine || iFine < 0 || iCoarse < 0) {
            res.skipped++;
            res.reasons.push(`取证失败（未逐字命中）：${file}`);
            continue;
        }
        // ② / ③ 形态门
        if (!isFineRow(lines[iFine])) {
            res.skipped++;
            res.reasons.push('细粒度行含标签（不属本通道）');
            continue;
        }
        if (!isCoarseRow(lines[iCoarse])) {
            res.skipped++;
            res.reasons.push('粗粒度行无标签');
            continue;
        }
        if (iFine === iCoarse) {
            res.skipped++;
            res.reasons.push('同一行（防自收敛）');
            continue;
        }
        // 归档（append-only，整行原文）→ 再移除
        try {
            mkdirSync(archDir, { recursive: true });
            archFile = archFile || join(archDir, `converge-${ts}.jsonl`);
            appendFileSync(archFile, JSON.stringify({ at: new Date().toISOString(), file, line: lines[iFine], into: lines[iCoarse] }) + '\n', 'utf8');
            res.archived++;
        }
        catch (e) {
            res.skipped++;
            res.reasons.push(`归档失败（拒绝移除）：${String(e?.message || e).slice(0, 60)}`);
            continue;
        }
        lines.splice(iFine, 1);
        // 原子整文件重写（同仓内既有落盘纪律：tmp + rename 由调用方保证；此处先直写，失败由上层回滚）
        try {
            writeFileSync(join(memRoot, file), lines.join('\n'), 'utf8');
        }
        catch (e) {
            res.skipped++;
            res.reasons.push(`写回失败：${String(e?.message || e).slice(0, 60)}`);
            continue;
        }
        res.applied++;
        audit({ kind: 'converge', file, removed: lines.length >= 0 ? fine.slice(0, 60) : '', into: coarse.slice(0, 60) });
        log(`converge: ${file} 收敛 1 条（细 → 粗），已归档可回滚`);
    }
    if (res.applied)
        audit({ kind: 'converge-summary', applied: res.applied, skipped: res.skipped, tried: res.tried, archived: res.archived });
    return res;
}
//# sourceMappingURL=sectionops.js.map