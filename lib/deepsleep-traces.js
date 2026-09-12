// deepsleep-traces.ts — 深睡「当天痕迹采集」领域（依赖 3 个，按领域窄传）
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
export function gatherDeepSleepTraces(d, memRoot, since) {
    const { candidateDir, pendDir, auditFile } = d;
    const parts = [];
    // 窗口内文件枚举（pending 按 mtime 判定，不解析文件名日期——文件名是 UTC 口径，本地日切会跨日错配）
    const pendFiles = (() => {
        try {
            return readdirSync(pendDir).filter((f) => f.endsWith('.md')).filter((f) => {
                try {
                    return statSync(join(pendDir, f)).mtimeMs >= since;
                }
                catch {
                    return false;
                }
            }).sort();
        }
        catch {
            return [];
        }
    })();
    const notesDir = join(memRoot, 'notes');
    const noteFiles = (() => {
        try {
            return readdirSync(notesDir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md').filter((f) => {
                try {
                    return statSync(join(notesDir, f)).mtimeMs >= since;
                }
                catch {
                    return false;
                }
            }).sort();
        }
        catch {
            return [];
        }
    })();
    // 0) 痕迹清单先给全——跨工作区公平：正文按预算截断时，子代理至少知道窗口内有哪些痕迹存在（不被静默吞掉）
    if (pendFiles.length || noteFiles.length) {
        parts.push('### 窗口内痕迹清单（记忆库为全局单库，痕迹可能来自多个工作区；正文按单文件上限截断）\n'
            + [...pendFiles.map((f) => `pending/${f}`), ...noteFiles.map((f) => `notes/${f}`)].map((p) => `- ${p}`).join('\n'));
    }
    // 1) pending 正文（背景材料，不作源指针）：单文件上限 PEND_PER_FILE，防单个工作区大文件吃光预算
    const PEND_PER_FILE = 2500;
    let budget = 12000;
    for (const f of pendFiles) {
        if (budget <= 0)
            break;
        let body = '';
        try {
            body = readFileSync(join(pendDir, f), 'utf8');
        }
        catch {
            continue;
        }
        const cut = body.length > PEND_PER_FILE ? body.slice(0, PEND_PER_FILE) + '\n…(截断)' : body;
        const chunk = `### pending/${f}\n${cut}`;
        if (chunk.length > budget)
            break;
        budget -= chunk.length + 1;
        parts.push(chunk);
    }
    // 2) notes 正文（原则源指针唯一合法来源）：单文件上限 NOTES_PER_FILE，保证多工作区痕迹都能进上下文
    const NOTES_PER_FILE = 6000;
    let notesBudget = 18000;
    for (const f of noteFiles) {
        if (notesBudget <= 0)
            break;
        let body = '';
        try {
            body = readFileSync(join(notesDir, f), 'utf8');
        }
        catch {
            continue;
        }
        const cut = body.length > NOTES_PER_FILE ? body.slice(0, NOTES_PER_FILE) + '\n…(截断)' : body;
        const chunk = `### notes/${f}\n${cut}`;
        if (chunk.length > notesBudget)
            break;
        notesBudget -= chunk.length + 1;
        parts.push(chunk);
    }
    // 3) 本日 access.log 检索命中（回想强度信号）
    try {
        const hits = readFileSync(join(memRoot, 'audit', 'access.log'), 'utf8').split('\n').filter((l) => l.trim())
            .map((l) => { try {
            return JSON.parse(l);
        }
        catch {
            return null;
        } })
            .filter((o) => !!o && !Number.isNaN(Date.parse(String(o.t))) && Date.parse(String(o.t)) >= since);
        if (hits.length) {
            const agg = new Map();
            for (const h of hits) {
                const k = `notes/${h.f || '?'} §${h.s || '?'}`;
                agg.set(k, (agg.get(k) || 0) + 1);
            }
            parts.push('### 本日 access 检索命中\n' + [...agg.entries()].map(([k, v]) => `- ${k} ×${v}`).join('\n'));
        }
    }
    catch { /* 无 access.log=无 */ }
    // 4) 窗口内蒸馏运行统计（成败对比材料；ExpeL 式信号；2026-09-09 v17）
    //    只取「带 stop 字段」的 distill-run 行：writeDispatch 与 distillAgent 会双写审计（前两者无 stop），
    //    直接过滤 kind 会把每次 run 计 2 次——此处以 stop 存在为唯一 run 记号（distillAgent 汇总行）。
    //    红线：只给统计与 stop/route 字段，不携带 target 文件名与 reason 全文（可能含项目专名，跨工作区红线）。
    try {
        let runs = 0, ok = 0, bad = 0, mem = 0, proj = 0, rej = 0;
        for (const l of readFileSync(auditFile, 'utf8').split('\n')) {
            if (!l.trim())
                continue;
            try {
                const o = JSON.parse(l);
                if (o.kind !== 'distill-run' || typeof o.stop !== 'string')
                    continue;
                if (!Number.isNaN(Date.parse(String(o.at))) && Date.parse(String(o.at)) < since)
                    continue;
                runs++;
                if (o.stop === 'completed')
                    ok++;
                else
                    bad++;
                if (o.route === 'memory')
                    mem++;
                else if (o.route === 'project')
                    proj++;
                rej += Number(o.rejected) || 0;
            }
            catch { /* 坏行跳过 */ }
        }
        if (runs > 0) {
            const stat = `### 窗口内任务运行统计（成败对比材料；ExpeL 式信号）\n- 蒸馏运行 ${runs} 次：成功（stop=completed）${ok} / 异常（error/timeout/aborted）${bad}；写入分布 memory ${mem} 条 / project ${proj} 条 / 拒收 ${rej} 条`;
            parts.push(stat.length > 800 ? stat.slice(0, 800) : stat);
        }
    }
    catch { /* 无审计文件=无统计 */ }
    // 5) 跨窗口任务候选（路线②）：flow-candidates/ 恒随材料（不限水位）——低置信「成功做过且成类型的任务」记忆，
    //    让深睡能跨天看到「同类型重复」（[路径] 判据的数据基础）；仅背景材料，非源指针。
    //    S4（2026-09-09）：候选带「成功次数/跨会话」字段——满足 成功≥2 且跨会话≥2 的转正候选排序置顶，
    //    深睡可据此直接归纳 [路径]（memory-core-model §4 转正门槛：成功≥2 且跨会话≥2）。
    try {
        const candFiles = existsSync(candidateDir) ? readdirSync(candidateDir).filter((f) => f.endsWith('.md')) : [];
        if (candFiles.length) {
            const scoreCand = (f) => {
                try {
                    const body = readFileSync(join(candidateDir, f), 'utf8');
                    const n = Number((body.match(/- 成功次数：(\d+)/) || [])[1] || 0);
                    const cross = Number((body.match(/- 跨会话：(\d+)/) || [])[1] || 0);
                    return { n, cross };
                }
                catch {
                    return { n: 0, cross: 0 };
                }
            };
            // 转正候选（成功≥2 且跨会话≥2）置顶；其余按时间序；最多取 8 个
            const sorted = candFiles
                .map((f) => ({ f, ...scoreCand(f) }))
                .sort((a, b) => ((b.n >= 2 && b.cross >= 2 ? 1 : 0) - (a.n >= 2 && a.cross >= 2 ? 1 : 0)) || (a.f < b.f ? -1 : 1))
                .slice(0, 8);
            const blocks = ['### 跨窗口任务候选（背景材料，非源指针；含成功次数/跨会话）'];
            let cbudget = 2400;
            for (const { f } of sorted) {
                if (cbudget <= 0)
                    break;
                try {
                    const body = readFileSync(join(candidateDir, f), 'utf8').slice(0, 600);
                    const chunk = `### candidate/${f}\n${body}`;
                    if (chunk.length > cbudget)
                        break;
                    cbudget -= chunk.length + 1;
                    blocks.push(chunk);
                }
                catch { /* 跳过坏候选 */ }
            }
            if (blocks.length > 1)
                parts.push(blocks.join('\n'));
        }
    }
    catch { /* 无候选区=无 */ }
    return parts.join('\n\n');
}
//# sourceMappingURL=deepsleep-traces.js.map