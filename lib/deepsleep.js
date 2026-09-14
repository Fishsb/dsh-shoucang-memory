import { probeSession } from './deepsleep-probe.js';
import { runDeepSleep } from './deepsleep-run.js';
import { deepSleepCheck, getDeepSleepStatus, noteEvent, replayWatermark, runDeepSleepNow } from './deepsleep-machine.js';
export function createDeepSleep(C) {
    const { io, cfg, session: sess, appCtx: ctx } = C;
    const DEEP_SLEEP_CHECK_MS = 600000; // 巡检间隔 10min（停滞阈值由 deepSleepIdleMs 独立控制）
    /** ⚠ 装箱：状态机的标量字段（水位/并发闸）必须按引用操作，否则写不回本层（与 streak 同一理由） */
    const m = {
        sessions: new Map(),
        lastActivityAt: Date.now(), // 全局兜底水位（无在册会话时使用）
        lastDeepSleepAt: 0,
        deepSleepRunning: false,
    };
    /**
     * 痕迹窗口起点 = 上次深度睡眠水位（纯水位语义，2026-09-09 拍板重构）——
     * ① 统一用 mtime/时间戳比较，规避 pending 文件名日期为 UTC 与本地日期跨日不一致导致的漏收；
     * ② 同一天多次触发时不重复喂同一批材料（已归纳的不再回想）；
     * ③ **不再叠加「本日 0 点」下限**：0 点切会把午夜前产生、午夜后才睡眠的痕迹永久划出窗口；
     *    纯水位下「无痕迹滑窗」与「消化后推进」都只会把起点移到更晚，未来痕迹 mtime 必然更晚，永不丢失。
     */
    const traceSince = () => Number(m.lastDeepSleepAt) || 0;
    /** 连续「未消化」轮数（G-19 策略 C）：每轮 failed 累加、任一轮 done 归零。仅内存态（重启从 0 起算）。 */
    const state = { streak: { v: 0 }, traceSince };
    // ── 依赖按领域窄传：每个实现函数只拿自己那 3–7 个 ──
    const probeDeps = {
        log: io.log, audit: io.audit, config: cfg.config, ctx, locateTranscript: sess.locateTranscript,
    };
    const runDeps = { ...C, state };
    const dep = { config: cfg.config, ctx, io, session: sess, state, probe: probeDeps, run: runDeps };
    // ── 面板富化（2026-09-14 · 会话三块名，用户拍板）──
    // **只补名字，不判定状态**：`待蒸馏/停滞` 由客户端**直接按会话状态**映射（用户拍板：不依赖任何其他信息）——
    //   `stalled` ⇒ 停滞；其余（running/ended/probing/suspect）⇒ 待蒸馏。本层**不参与**该判定。
    // **为什么名字在本层做**：① 本层有 `appCtx`（可查 agent 拿工作区与 DSH 会话栏标题）；
    //   ② 表示层 `panel-observe` 的 ObserveDeps **没有 ctx**；③ 不动 composition 契约（句柄签名不变）。
    // **成本纪律**：工作区/标题**每会话只取一次**（`session/title` 写入后不再变），命中缓存即零成本。
    const metaCache = new Map();
    const metaOf = (fullSid) => {
        const hit = metaCache.get(fullSid);
        if (hit)
            return hit;
        let workspace = '', title = '';
        try {
            const a = ctx.agents.get(fullSid);
            const cwd = String((a && a.session && a.session.header && a.session.header.cwd) || '');
            workspace = cwd ? (cwd.split(/[\\/]/).filter(Boolean).pop() || '') : '';
            const evs = (a && a.session && a.session.snapshotEvents && a.session.snapshotEvents()) || [];
            for (let i = evs.length - 1; i >= 0; i--) {
                if (evs[i] && evs[i].type === 'session/title') {
                    title = String((evs[i].data && evs[i].data.title) || '');
                    break;
                }
            }
        }
        catch { /* 取不到 ⇒ 不富化（面板退化显示编码，不影响状态机） */ }
        const v = { workspace, title };
        if (workspace || title)
            metaCache.set(fullSid, v); // 只在**拿到东西**时缓存，否则会把"空"钉死
        return v;
    };
    // 启动水位回放（重启不重置停滞判定）；审计里从无消化记录 ⇒ 水位从启动时刻起算，
    // 不把既有全历史 notes/pending 一股脑当材料（那是一次性的激进归纳）。
    replayWatermark(dep, m);
    if (!m.lastDeepSleepAt)
        m.lastDeepSleepAt = Date.now();
    // 对外句柄：distill 装配期取用（事件钩子用 noteEvent，巡检用 deepSleepCheck + DEEP_SLEEP_CHECK_MS，
    // 面板经 deepsleep-share 取 getDeepSleepStatus / runDeepSleepNow）。
    // sessions 也对外暴露：distill 的 `agent/disposed` / `session/disposed` 事件钩子要清表。
    return {
        DEEP_SLEEP_CHECK_MS,
        sessions: m.sessions,
        // 状态机四件套已迁 deepsleep-machine.ts：对外仍是无参/单参句柄，由这里注入 (dep, m)（调用方零感知）
        noteEvent: (sid, isTurnEnd) => noteEvent(dep, m, sid, isTurnEnd),
        runDeepSleep: (sinceArg) => runDeepSleep(runDeps, sinceArg),
        probeSession: (rec) => probeSession(probeDeps, rec),
        deepSleepCheck: () => deepSleepCheck(dep, m),
        getDeepSleepStatus: () => {
            const st = getDeepSleepStatus(dep, m);
            try {
                const live = new Set();
                st.sessions = st.sessions.map((s) => {
                    live.add(s.fullSid);
                    const meta = metaOf(s.fullSid);
                    return { ...s, workspace: meta.workspace, title: meta.title };
                });
                for (const k of [...metaCache.keys()])
                    if (!live.has(k))
                        metaCache.delete(k); // 会话出表即清缓存
            }
            catch { /* 富化失败 ⇒ 原样返回（面板退化，绝不影响状态机判定） */ }
            return st;
        },
        runDeepSleepNow: () => runDeepSleepNow(dep, m),
        getConfig: () => ({
            enableDeepSleep: !!cfg.config.enableDeepSleep,
            deepSleepIdleMs: Number(cfg.config.deepSleepIdleMs) || 10800000,
            deepSleepProbe: !!cfg.config.deepSleepProbe,
            deepSleepProbeAfterMs: Number(cfg.config.deepSleepProbeAfterMs) || (Number(cfg.config.deepSleepIdleMs) || 10800000),
            deepSleepProbeWindowMs: Number(cfg.config.deepSleepProbeWindowMs) || 60000,
        }),
    };
}
//# sourceMappingURL=deepsleep.js.map