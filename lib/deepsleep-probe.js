// deepsleep-probe.ts — 深睡「会话输出增长探测」领域（依赖 5 个）
import { statSync } from 'node:fs';
import { planProbeOutcome } from './probe-plan.js';
export function probeSession(d, rec) {
    const { log, audit, config, ctx, locateTranscript } = d;
    if (rec.state === 'probing')
        return;
    rec.state = 'probing';
    rec.probeAt = Date.now();
    rec.probeRound = (rec.probeRound || 0) + 1;
    const short = (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8));
    const samples = Math.max(1, Number(config.deepSleepProbeSamples) || 3);
    const confirm = Math.max(1, Number(config.deepSleepProbeConfirm) || 2);
    const retries = Math.max(1, Number(config.deepSleepProbeRetries) || 2);
    const windowMs = Math.max(5000, Number(config.deepSleepProbeWindowMs) || 60000);
    const maxMs = Math.max(windowMs * samples + 30000, Number(config.deepSleepProbeMaxMs) || 600000);
    const started = Date.now();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const agentAlive = () => { try {
        return !!ctx.agents.get(rec.sid);
    }
    catch {
        return false;
    } };
    const agentActive = () => { try {
        const a = ctx.agents.get(rec.sid);
        const s = a && a.status;
        return !!s && s !== 'idle';
    }
    catch {
        return false;
    } };
    /* 2026-09-16 **本会话是否有活跃子代理** —— 判据同 `distill-parent.ts:44 / #hasActiveSubagents` 的
     *   **live 枚举通道**（此处只取无状态子集，**不引入跨域 `childSeen`**，避免探针依赖蒸馏状态）。
     *   判因（读码 + 实测）：深睡父会话 **await 子代理**期间**本就不写自己的转录** ⇒ 只看父转录，
     *   "正常等待"必然满足「连续 `confirm` 轮无增长」⇒ **stall 是系统性的**（实测 32 条 stall 的
     *   `idleMin` 全为 58–66 分钟，含**仅触发数分钟**的新会话 ⇒ 基准陈旧，读数亦误导）。
     *   ⚠ **不放宽护栏**：要求**正向证据** —— 存在 `origin==='subagent'`、**归属本会话**、且 `status!=='idle'`
     *     的子代理；三者缺一即不认（存在但空闲 = 不算在跑；归属别人 = 与本会话无关）。 */
    const hasLiveSubagent = () => {
        try {
            const list = (ctx.agents && typeof ctx.agents.list === 'function') ? (ctx.agents.list() || []) : [];
            for (const a of list) {
                const h = a && a.session && a.session.header;
                if (!h || h.origin !== 'subagent')
                    continue;
                const p = h.parentSession || (a.options && (a.options.parentSession || a.options.parentId)) || a.parentSession || a.parentId;
                if (p !== rec.sid)
                    continue;
                const live = ctx.agents.get(a.id);
                if (live && live.status && live.status !== 'idle')
                    return true;
            }
            return false;
        }
        catch {
            return false;
        }
    };
    void (async () => {
        try {
            // ① 定位转录（失败重试 retries 次；期间若来新事件则中止）
            let file = null;
            for (let i = 0; i < retries && !file; i++) {
                file = await locateTranscript(rec.sid);
                if (!file && i < retries - 1)
                    await sleep(windowMs);
                if (rec.state !== 'probing')
                    return; // 新事件打断 → 交回状态机，不覆盖
            }
            if (!file) {
                // ★ S-P2b：本出口同样经决策表（`noTranscript: true`）——判据全在判据层，本文件零判定分支。
                const o = planProbeOutcome({ alive: true, active: false, viaChildren: false, grew: false, noTranscript: true }, { stallRound: rec.stallRound || 0, conflictRound: rec.conflictRound || 0 }, { confirm, conflictMax: Math.max(1, Number(config.deepSleepProbeConflictMax) || 3) });
                rec.probeResult = o.probeResult;
                rec.state = o.state;
                rec.lastEndAt = rec.lastEventAt;
                log(`deep sleep probe: ${short} 探针不可用（已重试 ${retries} 次）→ 无法确认为长任务，按停滞处理（正常睡眠）；请检查记忆仓 locate-transcript-probe 是否就位`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'no-transcript', rounds: rec.probeRound, note: '探针不可用，无法确认长任务，按停滞处理' });
                return;
            }
            // ② 多轮采样：任一轮 size/mtime 增长 → long-run
            const snap = () => {
                try {
                    const st = statSync(file);
                    return { mtimeMs: st.mtimeMs, size: st.size };
                }
                catch {
                    return null;
                }
            };
            let prev = snap();
            let grew = false, delta = 0, rounds = 1;
            for (let i = 1; i < samples; i++) {
                await sleep(windowMs);
                if (rec.state !== 'probing')
                    return; // 事件心跳：探测期间会话恢复活跃 → 中止
                if (Date.now() - started > maxMs)
                    break;
                const cur = snap();
                if (!cur)
                    break;
                if (prev && (cur.size !== prev.size || cur.mtimeMs > prev.mtimeMs)) {
                    grew = true;
                    delta = cur.size - prev.size;
                    rounds = i + 1;
                    break;
                }
                prev = cur;
                rounds = i + 1;
            }
            if (rec.state !== 'probing')
                return;
            /* ★ S-P2b（2026-09-20）：全部出口收敛为**一张决策表**（`planProbeOutcome`，判据层纯函数）。
             *   原实现在此处写 8 个命令式 if，其中 `active`（证据冲突）分支**排在 stallRound 推进之前且直接
             *   return** ⇒ 计数永不推进 ⇒ 状态回写 suspect ⇒ 下轮再探再冲突 = **活锁**
             *   （真机 `28f9f094` 连续 23 次 / 跨 11 小时，该窗口「探测未决」41 行、触发 0 行）。
             *   现判据外移：本函数只负责**采证**（下方 evidence）与**搬状态**（apply）。 */
            const alive1 = agentAlive();
            if (!alive1)
                await sleep(3000);
            const alive = alive1 && agentAlive();
            const active = agentActive();
            const viaChildren = hasLiveSubagent();
            rec.probeEvidence = { rounds, samples, deltaBytes: delta, alive, active, ...(viaChildren ? { viaChildren: true } : {}) };
            const evidence = { alive, active, viaChildren, grew, noTranscript: false };
            const outcome = planProbeOutcome(evidence, { stallRound: rec.stallRound || 0, conflictRound: rec.conflictRound || 0 }, { confirm, conflictMax: Math.max(1, Number(config.deepSleepProbeConflictMax) || 3) });
            rec.state = outcome.state;
            rec.probeResult = outcome.probeResult;
            rec.stallRound = outcome.stallRound;
            rec.conflictRound = outcome.conflictRound;
            if (outcome.refreshActivity)
                rec.lastEventAt = Date.now();
            // 审计与日志按结论分支（与改前逐字保持同一观测口径；新增 conflict 计数以便复核）
            if (outcome.probeResult === 'long-run') {
                rec.lastEventAt = Date.now(); // 唯一会刷新水位的分支（确认长任务，probeAfter 后再复查）
                if (evidence.viaChildren) {
                    log(`deep sleep probe: ${short} 父转录无增长但**子代理仍在跑** → 判正常长任务（不睡）`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'long-run', rounds, samples, viaChildren: true, note: '父会话等待子代理（子代理活跃）' });
                }
                else {
                    log(`deep sleep probe: ${short} 第 ${rounds}/${samples} 轮检出输出增长（+${delta}B）→ 正常长任务，不睡`);
                    audit({ kind: 'deep-sleep-probe', sid: short, result: 'long-run', deltaBytes: delta, rounds, samples });
                }
                return;
            }
            if (outcome.probeResult === 'exit') {
                rec.lastEndAt = rec.lastEventAt;
                log(`deep sleep probe: ${short} ${samples} 轮无增长且会话已消失（二次确认）→ 异常退出（正常睡眠）`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'exit', rounds, samples, note: '会话已退出（二次确认）' });
                return;
            }
            if (outcome.probeResult === 'conflict') {
                log(`deep sleep probe: ${short} 无输出增长但 agent 状态活跃 → 证据冲突第 ${outcome.conflictRound} 轮，转 suspect 下轮复核`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'conflict', rounds, samples, conflictRound: outcome.conflictRound, note: '状态活跃但无输出增长，复核' });
                return;
            }
            if (outcome.probeResult === 'stall') {
                rec.lastEndAt = rec.lastEndAt || rec.lastEventAt;
                log(`deep sleep probe: ${short} ${outcome.note}`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'stall', rounds, samples, stallRound: outcome.stallRound, conflictRound: outcome.conflictRound, idleMin: Math.round((Date.now() - rec.lastEventAt) / 60000), note: outcome.note });
                return;
            }
            log(`deep sleep probe: ${short} ${outcome.note}`);
            audit({ kind: 'deep-sleep-probe', sid: short, result: 'suspect', rounds, samples, stallRound: outcome.stallRound });
        }
        catch (e) {
            // 探测异常一律"按停滞处理（正常睡）"（既有口径）；并**复位冲突计数**——否则异常残留的
            // conflictRound 会污染下一次探测的判据（S-P2b 新增字段，必须与 stallRound 同寿同清）。
            rec.probeResult = 'error';
            rec.state = 'ended';
            rec.stallRound = 0;
            rec.conflictRound = 0;
            rec.lastEndAt = rec.lastEventAt;
            log(`deep sleep probe err ${short}: ${String(e?.message || e).slice(0, 120)} → 按停滞处理（正常睡眠）`);
            audit({ kind: 'deep-sleep-probe', sid: short, result: 'error', rounds: rec.probeRound, note: String(e?.message || e).slice(0, 120) });
        }
    })();
}
//# sourceMappingURL=deepsleep-probe.js.map