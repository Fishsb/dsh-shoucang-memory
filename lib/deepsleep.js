// deepsleep.ts — 深度睡眠「会话状态机 + 装配层」
//
// ⚠ 依赖方向（严格单向，零环）：index → scheduler → distill → deepsleep → deepsleep-core → criteria.generated
//   深睡**会回调蒸馏**（distillAgent / writeDispatch）⇒ 绝不 import distill，回调经 ctx 注入（依赖倒置）。
//
// 2026-09-12 架构根治 P1 二期：自 distill.ts 的 registerDistill 巨型闭包迁出（零逻辑改动）。
// 2026-09-12 阶段 B（本轮）：拆掉 32 字段的 DsScope 团块 ——
//   上一版把「闭包里 60+ 个互相可见的名字」整体打包成一个对象往下传，**显式了，没变少**。
//   现依赖按**领域分组**（io/cfg/llm/session/write/housekeep，每组 ≤8 字段），
//   每个实现函数只拿自己那 3–7 个：trace 3 · tree 3 · apply 7 · materials 0 · probe 5。
import { readFileSync } from 'node:fs';
import { deepSleepReplayable } from './deepsleep-core.js';
import { probeSession as probeSessionImpl } from './deepsleep-probe.js';
import { runDeepSleep as runDeepSleepImpl } from './deepsleep-run.js';
export function createDeepSleep(C) {
    const { io, cfg, session: sess, appCtx: ctx } = C;
    const { log, auditFile } = io;
    const { config } = cfg;
    const DEEP_SLEEP_CHECK_MS = 600000; // 巡检间隔 10min（停滞阈值由 deepSleepIdleMs 独立控制）
    let lastActivityAt = Date.now(); // 全局兜底水位（无在册会话时使用）
    let lastDeepSleepAt = 0;
    // 连续「未消化」轮数（G-19 策略 C 用）：每轮 failed 累加，任一轮 done 归零。仅内存态——
    //   重启后从 0 起算（保守：宁可再重试几轮，也不因回放误判立刻放行丢料）。
    // ⚠ 装箱成对象：runDeepSleep 会写它，标量经解构传递是**快照**，写不回本闭包
    const streak = { v: 0 };
    let deepSleepRunning = false;
    /** 会话状态表：sid → SessRec（随 disposed 出表，防内存泄漏） */
    const sessions = new Map();
    /** 状态迁移入口：任意事件 → RUNNING；turn/end(completed) → ENDED（停滞计时起点） */
    const noteEvent = (sid, isTurnEnd) => {
        const now = Date.now();
        lastActivityAt = now;
        const rec = sessions.get(sid) || { sid, state: 'running', lastEventAt: now, lastEndAt: 0, probeAt: 0, probeRound: 0, stallRound: 0 };
        rec.lastEventAt = now;
        // 任何新事件都让会话「复活」：清掉探测/卡住计数（卡住的会话若恢复输出，不应继续按 stall 处理）
        rec.state = isTurnEnd ? 'ended' : 'running';
        if (isTurnEnd)
            rec.lastEndAt = now;
        rec.probeAt = 0;
        rec.probeRound = 0;
        rec.stallRound = 0;
        rec.probeResult = undefined;
        sessions.set(sid, rec);
    };
    // 启动水位回放：取蒸馏审计最新时间（重启不重置停滞判定）；同时回放上次深度睡眠时间（痕迹窗口起点）
    try {
        for (const l of readFileSync(auditFile, 'utf8').split('\n')) {
            if (!l.trim())
                continue;
            try {
                const o = JSON.parse(l);
                const t = Date.parse(String(o.at));
                if (Number.isNaN(t))
                    continue;
                if (t > lastActivityAt)
                    lastActivityAt = t;
                // 只回放「确实消化过痕迹」的深睡：error / no-parent / no-traces 都不推进水位——
                // no-traces 说明本轮一条痕迹都没收到（可能只是窗口被上一轮污染），
                // 若把它当水位，会把窗口内早于该时刻的痕迹永久关在窗外（当天再也回想不到）。
                // 2026-09-11：判据收敛到导出的 `deepSleepReplayable`（单一实现，供单测直接驱动编译产物）。
                // 旧判据只排 no-parent/no-traces（"无事可做"），漏排"做了但被拒"（attempted>0 && added=0）——
                // 那类轮次被当有效水位回放，那批痕迹就永久关在窗外（重启一次即丢料）。
                if (deepSleepReplayable(o) && t > lastDeepSleepAt)
                    lastDeepSleepAt = t;
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 无审计文件=新装 */ }
    // 全新启动（审计里从无消化记录）：水位从启动时刻起算——首轮睡眠只看启动后的新痕迹，
    // 不把既有全历史 notes/pending 一股脑当材料（那是一次性的激进归纳）。
    if (!lastDeepSleepAt)
        lastDeepSleepAt = Date.now();
    /**
     * 痕迹窗口起点 = 上次深度睡眠水位（纯水位语义，2026-09-09 拍板重构）——
     * ① 统一用 mtime/时间戳比较，规避 pending 文件名日期为 UTC（`toISOString` 切片）与本地日期跨日不一致导致的漏收；
     * ② 同一天多次触发时不重复喂同一批材料（已归纳的不再回想）；
     * ③ **不再叠加「本日 0 点」下限**：0 点切会把午夜前产生、午夜后才睡眠的痕迹永久划出窗口（日切丢痕迹）；
     *    纯水位下「无痕迹滑窗」与「消化后推进」都只会把起点移到更晚，未来产生的痕迹 mtime 必然更晚，永不丢失。
     */
    const traceSince = () => Number(lastDeepSleepAt) || 0;
    // 状态机自持态 → 注入编排器（streak 装箱是**引用**，runDeepSleep 写它要能写回本闭包）
    const state = { streak, traceSince };
    // ── 依赖按领域窄传：每个实现函数只拿自己那 3–7 个（不再是 32 字段一把梭）──
    const probeDeps = {
        log: io.log, audit: io.audit, config: cfg.config, ctx, locateTranscript: sess.locateTranscript,
    };
    const runDeps = { ...C, state };
    /**
     * consolidation v1（2026-09-10 用户拍板：向量去重整合通道，并入深度睡眠巡检）——
     * 树状记忆/画像（索引行冠层 → notes ##/###/#### 子树）只增不修的补偿机制：周期性去重整合。
     *
     * 子步骤（顺序执行，只改确有变化的文件；每文件写入一律「tmp 写后 rename 原子覆盖」，与本文件
     * applyPrinciples/applyPointerOps 落盘纪律一致）：
     *   A 索引行精确重复折叠（MEMORY.md/USER.md/AGENT.md）：同文件内 trim 后完全相同的指针行保留首次。
     *   B 索引行语义近重折叠（同一批文件）：组键=同文件+同 [标签]+同指针目标（同 notes 文件且 §小节名
     *     双向包含）；组内行两两 semanticSim 比较「去掉指针尾（→ 起）后的前段文本」，sim≥0.90 视为同事实
     *     → 保留概况（字符）较长者、删除较短者（保留/删除皆归档）。
     *   C 同小节正文行去重（notes/*.md 除 INDEX.md）：小节=某标题到下一「同层或更高层」标题之间、且不含
     *     子标题区；小节内 trim 完全相同的非空正文行保留首次，其余删除（删除前该小节整段原文归档一次）。
     *   D 叶子小节语义合并（notes/*.md 除 INDEX.md）：候选=同文件内两两「无子标题的叶子小节」，比较
     *     标题+正文 semanticSim≥0.95（正文逐行全同视为 1.0 直并；sim 为 null 时跳过语义但允许正文全同直并）。
     *
     * 树感知规则（用户「合并/调整树干时树枝必须有明确去向」）：
     *   - phase-1 限制：D 只并**叶子小节**（其下无更深子标题）——带子树的树干（如被并小节含 ###/#### 子树）
     *     本版明确不合并，避免树枝悬空/孤儿子树；带子树树干合并留给后续阶段（与 LLM 跨主题大合并同批）。
     *   - 被并小节删除后，其全文先归档（可回滚），且同文件索引行（MEMORY/USER/AGENT）中指向它的
     *     「§另一小节名」指针段**整段改写**为 canonical 小节去日期核心名 → 不留悬空指针。
     *   - 守卫：另一小节标题核心名与 canonical 核心名双向包含（同族/同名演化小节）→ 保守跳过；正文为空
     *     或「正文等长且内容不同」→ 无法唯一确定 canonical → 跳过。
     *   - 阈值 0.90（索引概况前段）/ 0.95（小节全文）为保守高置信，宁少勿错；校准预留：样本累积后按
     *     误并/漏并分布再下调或分档（本 v1 不做跨主题大合并）。
     * embed 不可用（embedCfgOf().enabled=false / semanticSim 返回 null / HTTP 失败）→ 整函数自动退化为
     * 「只做确定性去重」（A/C 恒做；D 仅正文全同直并；B 无语义折叠），不报错、不中断深睡主流程。
     * 全程防御式：内部 try/catch，单文件出错跳过继续，绝不抛出。
     */
    /**
     * 深睡 parent 兜底（2026-09-08 修复：无 parent 直接崩 —— reading 'options'）。
     * 悖论：深睡在「全部会话停滞/结束」时触发，此时 ctx.agents.roots() 常为空，
     * 而宿主 spawn 必须有 parent（resolveChildDepth 读 parent.options）→ 必然会睡的时候必然崩。
     * 解法：事件中缓存最近一次活动过的 agent（对象带 options/ctx 即可当 parent 用），
     * 顺序=当前 roots → 在册 agents → 缓存的最近 agent；都没有则跳过本轮并审计（绝不崩）。
     */
    /**
     * 输出增长探测（状态机 PROBING，加固版 2026-09-08）——**避免一次采样错判就把长任务睡掉**：
     *   ① 多轮采样：`deepSleepProbeSamples`（默认 3）轮 × `deepSleepProbeWindowMs`，任一轮检出增长即判长任务；
     *   ② 多信号交叉：转录 size/mtime 增长（主证据）+ 事件心跳（探测期间来事件即中止，回 RUNNING）
     *      + agent 存活 + agent.status 活跃态；状态活跃但无增长=**证据冲突**，不直接判卡住，转 suspect 复核；
     *   ③ 卡住需连续 `deepSleepProbeConfirm`（默认 2）轮确认，首轮落 **suspect**（阻塞睡眠，下轮巡检复核）；
     *   ④ 探针不可用/异常：内部重试 `deepSleepProbeRetries`（默认 2）次，仍失败才按「无法确认 → 正常睡」处理；
     *   ⑤ 总时长 `deepSleepProbeMaxMs` 兜底，防悬挂；停滞计时一律沿用 lastEventAt（不刷新成 now，否则永不睡）。
     */
    const deepSleepCheck = () => {
        if (!config.enableDeepSleep || deepSleepRunning)
            return;
        const now = Date.now();
        const idleMs = Number(config.deepSleepIdleMs) || 10800000;
        const probeAfter = Number(config.deepSleepProbeAfterMs) || idleMs;
        let hottest = sessions.size ? 0 : lastActivityAt; // 无在册会话时用全局兜底水位
        let probing = 0, stalled = 0, ended = 0, running = 0;
        for (const [sid, rec] of sessions) {
            try {
                if (!ctx.agents.get(sid)) {
                    sessions.delete(sid);
                    continue;
                }
            }
            catch {
                sessions.delete(sid);
                continue;
            }
            // 子代理守卫（2026-09-10 实态修复）：子代理在跑 = 父会话仍在干活——直接视为 running 且刷新活动，
            // 既不发起"输出增长探测"（子代理写的是自己的转录，父转录不增长会被误判卡住），也不阻塞计数为停滞。
            if (sess.hasActiveSubagents(sid)) {
                rec.state = 'running';
                rec.lastEventAt = now;
                running++;
                continue;
            }
            // 状态机推进：running 且无事件 ≥ probeAfter → 发起探测；suspect → 下轮巡检复核（卡住需连续确认）
            if (config.deepSleepProbe) {
                if (rec.state === 'running' && now - rec.lastEventAt >= probeAfter)
                    probeSessionImpl(probeDeps, rec);
                else if (rec.state === 'suspect')
                    probeSessionImpl(probeDeps, rec);
            }
            if (rec.state === 'probing' || rec.state === 'suspect') {
                probing++;
                continue;
            } // 未决/待复核 → 阻塞本轮（不睡）
            if (rec.state === 'stalled') {
                stalled++;
                continue;
            } // 已确认无输出 → 不阻塞睡眠
            if (rec.state === 'ended')
                ended++;
            else
                running++;
            const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt;
            if (act > hottest)
                hottest = act;
        }
        if (probing > 0) {
            log(`deep sleep: ${probing} 个会话探测未决，本轮跳过（保守不睡）`);
            return;
        }
        if (now - hottest < idleMs)
            return;
        if (hottest <= lastDeepSleepAt)
            return; // 本轮停滞窗口已消化（新活动推进水位后重新武装）
        deepSleepRunning = true;
        const prevDeepSleepAt = lastDeepSleepAt;
        // 窗口起点必须在推进水位**之前**取：lastDeepSleepAt 一旦置为 now，traceSince() 会退化成
        // max(今日 0 点, now)=now，痕迹扫描窗口变成 [now, now] → 恒「本日无痕迹」（2026-09-09 实修）。
        const since = traceSince();
        lastDeepSleepAt = now;
        log(`deep sleep: 触发（停滞 ${Math.round((now - hottest) / 60000)}min ≥ 阈值 ${Math.round(idleMs / 60000)}min · 会话态 running=${running} ended=${ended} stalled=${stalled}）`);
        runDeepSleepImpl(runDeps, since).then((r) => {
            // 水位语义：done（消化了材料）与 no-traces（确认无材料）都把窗口滑到当前——未来痕迹 mtime 必然
            // 更晚，不丢；只有 failed（有材料但没消化成，如 no-parent / 子代理异常）回滚，同一批下轮重试。
            // 这同时消解空转：无材料滑窗后 hottest ≤ 水位 → 后续巡检直接 return，不再每 10min 重触发。
            if (r === 'failed') {
                lastDeepSleepAt = prevDeepSleepAt;
                log('deep sleep: 本轮未消化（failed），水位回滚（同一批痕迹下轮可重试）');
            }
            else
                lastDeepSleepAt = now;
        }).catch((e) => {
            lastDeepSleepAt = prevDeepSleepAt;
            log(`deep sleep err: ${String(e?.message || e).slice(0, 120)}（水位回滚）`);
        }).finally(() => { deepSleepRunning = false; });
    };
    /** 状态机快照——面板展示 / 手动触发（POST /deepsleep/trigger）/ 配置读写（/deepsleep/config）均读这里 */
    const getDeepSleepStatus = () => {
        let hottest = sessions.size ? 0 : lastActivityAt;
        const list = [];
        let running = 0, ended = 0, probing = 0, stalled = 0, suspect = 0;
        for (const rec of sessions.values()) {
            if (rec.state === 'probing')
                probing++;
            else if (rec.state === 'suspect')
                suspect++;
            else if (rec.state === 'stalled')
                stalled++;
            else if (rec.state === 'ended')
                ended++;
            else
                running++;
            if (rec.state !== 'stalled' && rec.state !== 'probing' && rec.state !== 'suspect') {
                const act = rec.state === 'ended' ? rec.lastEndAt : rec.lastEventAt;
                if (act > hottest)
                    hottest = act;
            }
            list.push({ sid: (rec.sid.startsWith('session-') ? rec.sid.slice(8, 16) : rec.sid.slice(0, 8)), state: rec.state, lastEventAt: rec.lastEventAt, lastEndAt: rec.lastEndAt, probeResult: rec.probeResult });
        }
        return {
            enabled: !!config.enableDeepSleep,
            idleMs: Number(config.deepSleepIdleMs) || 10800000,
            probeAfterMs: Number(config.deepSleepProbeAfterMs) || (Number(config.deepSleepIdleMs) || 10800000),
            lastActivityAt: hottest,
            lastDeepSleepAt,
            running, ended, probing, suspect, stalled,
            nextEligibleAt: hottest + (Number(config.deepSleepIdleMs) || 10800000),
            sessions: list,
        };
    };
    /** 手动触发入口（T2 面板「立即归纳一次」）：复用 deepSleepRunning 并发守卫，避免与自动巡检重叠。 */
    const runDeepSleepNow = async () => {
        if (deepSleepRunning)
            return { ok: false, error: 'deep-sleep-already-running' };
        deepSleepRunning = true;
        try {
            // 手动触发同样按上次水位取窗口；done（消化）/ no-traces（确认无材料）都推进水位防重复回想，failed 回滚
            const since = traceSince();
            const r = await runDeepSleepImpl(runDeps, since);
            if (r !== 'failed')
                lastDeepSleepAt = Date.now();
            return { ok: true, result: r };
        }
        catch (e) {
            return { ok: false, error: String(e?.message || e).slice(0, 160) };
        }
        finally {
            deepSleepRunning = false;
        }
    };
    /** 运行中深度睡眠配置（T2 面板「可调」展示源；持久化经 ~/.dsh/suite/scheduler.json） */
    const getConfig = () => ({
        enableDeepSleep: !!config.enableDeepSleep,
        deepSleepIdleMs: Number(config.deepSleepIdleMs) || 10800000,
        deepSleepProbe: !!config.deepSleepProbe,
        deepSleepProbeAfterMs: Number(config.deepSleepProbeAfterMs) || (Number(config.deepSleepIdleMs) || 10800000),
        deepSleepProbeWindowMs: Number(config.deepSleepProbeWindowMs) || 60000,
    });
    // ── 事件订阅（effect 自动清理，reload 零泄漏）──
    // 对外句柄：distill 装配期取用（事件钩子用 noteEvent，巡检用 deepSleepCheck + DEEP_SLEEP_CHECK_MS，
    // 面板经 deepsleep-share 取 getDeepSleepStatus / runDeepSleepNow）。
    // sessions 也对外暴露：distill 的 `agent/disposed` / `session/disposed` 事件钩子要清表。
    return { DEEP_SLEEP_CHECK_MS, sessions, noteEvent,
        // 这两个已迁为模块级函数：对外仍是无参/单参句柄，由这里注入 S（调用方零感知）
        runDeepSleep: (sinceArg) => runDeepSleepImpl(runDeps, sinceArg),
        probeSession: (rec) => probeSessionImpl(probeDeps, rec),
        deepSleepCheck, getDeepSleepStatus, runDeepSleepNow, getConfig };
}
//# sourceMappingURL=deepsleep.js.map