// deepsleep-probe.ts — 深睡「会话输出增长探测」领域（依赖 5 个）
import { statSync } from 'node:fs';
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
                rec.probeResult = 'no-transcript';
                rec.state = 'ended';
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
            if (grew) {
                rec.probeResult = 'long-run';
                rec.state = 'running';
                rec.lastEventAt = Date.now(); // 唯一会刷新水位的分支（确认长任务，3h 后再复查）
                rec.stallRound = 0;
                rec.probeEvidence = { rounds, samples, deltaBytes: delta, alive: true, active: true };
                log(`deep sleep probe: ${short} 第 ${rounds}/${samples} 轮检出输出增长（+${delta}B）→ 正常长任务，不睡`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'long-run', deltaBytes: delta, rounds, samples });
                return;
            }
            // ③ 无增长：二次确认存活（防瞬时查找失败误判 exit）
            const alive1 = agentAlive();
            if (!alive1)
                await sleep(3000);
            const alive = alive1 && agentAlive();
            const active = agentActive();
            rec.probeEvidence = { rounds, samples, deltaBytes: 0, alive, active };
            if (!alive) {
                rec.probeResult = 'exit';
                rec.state = 'ended';
                rec.lastEndAt = rec.lastEventAt;
                log(`deep sleep probe: ${short} ${samples} 轮无增长且会话已消失（二次确认）→ 异常退出（正常睡眠）`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'exit', rounds, samples, note: '会话已退出（二次确认）' });
                return;
            }
            /* ③′ 2026-09-16 **父转录无增长但子代理在跑** ⇒ 判正常长任务（不睡）。
             *   ⚠ **必须排在 `active` 冲突分支之前**：子代理活跃是**正向进展证据**（比"状态说活跃但没输出"的
             *   证据冲突更强），先判它可避免把"父会话等子代理"记成 conflict 噪声。
             *   依据见 `hasLiveSubagent` 抬头；并**顺手刷新 `lastEventAt`** —— 它原先**只在"确认长任务"分支刷新**
             *   （原第 67 行），故 `idleMin` 实为「距上次**确认长任务**的分钟数」而非「距上次输出」⇒ 审计读数误导
             *   （实测全为 58–66 分钟）。此处一并修正该基准。 */
            if (hasLiveSubagent()) {
                rec.probeResult = 'long-run';
                rec.state = 'running';
                rec.lastEventAt = Date.now();
                rec.stallRound = 0;
                rec.probeEvidence = { rounds, samples, deltaBytes: 0, alive: true, active: false, viaChildren: true };
                log(`deep sleep probe: ${short} 父转录无增长但**子代理仍在跑** → 判正常长任务（不睡）`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'long-run', rounds, samples, viaChildren: true, note: '父会话等待子代理（子代理活跃）' });
                return;
            }
            if (active) {
                // 证据冲突：状态说活跃但输出没长 → 不判卡住，转 suspect 复核（宁可多等一轮，不误判长任务）
                rec.state = 'suspect';
                rec.probeResult = 'conflict';
                log(`deep sleep probe: ${short} 无输出增长但 agent 状态活跃 → 证据冲突，转 suspect 下轮复核`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'conflict', rounds, samples, note: '状态活跃但无输出增长，复核' });
                return;
            }
            // ④ 卡住需连续 confirm 轮确认
            const sr = (rec.stallRound || 0) + 1;
            rec.stallRound = sr;
            if (sr >= confirm) {
                rec.probeResult = 'stall';
                rec.state = 'stalled';
                log(`deep sleep probe: ${short} 连续 ${sr}/${confirm} 轮无输出增长（会话仍在）→ 确认卡住，不阻塞睡眠（请人工确认）`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'stall', rounds, samples, stallRound: sr, idleMin: Math.round((Date.now() - rec.lastEventAt) / 60000), note: '疑似卡住：连续无输出增长且会话未退出' });
            }
            else {
                rec.state = 'suspect';
                rec.probeResult = 'suspect';
                log(`deep sleep probe: ${short} 第 ${sr}/${confirm} 次无增长 → suspect，下轮巡检复核（期间阻塞睡眠）`);
                audit({ kind: 'deep-sleep-probe', sid: short, result: 'suspect', rounds, samples, stallRound: sr });
            }
        }
        catch (e) {
            rec.probeResult = 'error';
            rec.state = 'ended';
            rec.lastEndAt = rec.lastEventAt;
            log(`deep sleep probe err ${short}: ${String(e?.message || e).slice(0, 120)} → 按停滞处理（正常睡眠）`);
            audit({ kind: 'deep-sleep-probe', sid: short, result: 'error', rounds: rec.probeRound, note: String(e?.message || e).slice(0, 120) });
        }
    })();
}
//# sourceMappingURL=deepsleep-probe.js.map