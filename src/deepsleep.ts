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
import { readFileSync } from 'node:fs'
import type { SessRec, SessState, DeepSleepStatus } from './deepsleep-core.js'
import { deepSleepReplayable } from './deepsleep-core.js'
import { probeSession, type ProbeDeps } from './deepsleep-probe.js'
import { runDeepSleep, type RunDeps } from './deepsleep-run.js'
import { deepSleepCheck, getDeepSleepStatus, noteEvent, replayWatermark, runDeepSleepNow, type MachineDeps, type SleepMachine } from './deepsleep-machine.js'
import type { DeepSleepCtx, SleepState } from './deepsleep-contract.js'

export type { DeepSleepCtx }

export function createDeepSleep(C: DeepSleepCtx) {
  const { io, cfg, session: sess, appCtx: ctx } = C
  const DEEP_SLEEP_CHECK_MS = 600000 // 巡检间隔 10min（停滞阈值由 deepSleepIdleMs 独立控制）
  /** ⚠ 装箱：状态机的标量字段（水位/并发闸）必须按引用操作，否则写不回本层（与 streak 同一理由） */
  const m: SleepMachine = {
    sessions: new Map<string, SessRec>(),
    lastActivityAt: Date.now(), // 全局兜底水位（无在册会话时使用）
    lastDeepSleepAt: 0,
    deepSleepRunning: false,
  }
  /**
   * 痕迹窗口起点 = 上次深度睡眠水位（纯水位语义，2026-09-09 拍板重构）——
   * ① 统一用 mtime/时间戳比较，规避 pending 文件名日期为 UTC 与本地日期跨日不一致导致的漏收；
   * ② 同一天多次触发时不重复喂同一批材料（已归纳的不再回想）；
   * ③ **不再叠加「本日 0 点」下限**：0 点切会把午夜前产生、午夜后才睡眠的痕迹永久划出窗口；
   *    纯水位下「无痕迹滑窗」与「消化后推进」都只会把起点移到更晚，未来痕迹 mtime 必然更晚，永不丢失。
   */
  const traceSince = (): number => Number(m.lastDeepSleepAt) || 0
  /** 连续「未消化」轮数（G-19 策略 C）：每轮 failed 累加、任一轮 done 归零。仅内存态（重启从 0 起算）。 */
  const state: SleepState = { streak: { v: 0 }, traceSince }

  // ── 依赖按领域窄传：每个实现函数只拿自己那 3–7 个 ──
  const probeDeps: ProbeDeps = {
    log: io.log, audit: io.audit, config: cfg.config, ctx, locateTranscript: sess.locateTranscript,
  }
  const runDeps: RunDeps = { ...C, state }
  const dep: MachineDeps = { config: cfg.config, ctx, io, session: sess, state, probe: probeDeps, run: runDeps }

  // 启动水位回放（重启不重置停滞判定）；审计里从无消化记录 ⇒ 水位从启动时刻起算，
  // 不把既有全历史 notes/pending 一股脑当材料（那是一次性的激进归纳）。
  replayWatermark(dep, m)
  if (!m.lastDeepSleepAt) m.lastDeepSleepAt = Date.now()

  // 对外句柄：distill 装配期取用（事件钩子用 noteEvent，巡检用 deepSleepCheck + DEEP_SLEEP_CHECK_MS，
  // 面板经 deepsleep-share 取 getDeepSleepStatus / runDeepSleepNow）。
  // sessions 也对外暴露：distill 的 `agent/disposed` / `session/disposed` 事件钩子要清表。
  return {
    DEEP_SLEEP_CHECK_MS,
    sessions: m.sessions,
    // 状态机四件套已迁 deepsleep-machine.ts：对外仍是无参/单参句柄，由这里注入 (dep, m)（调用方零感知）
    noteEvent: (sid: string, isTurnEnd: boolean) => noteEvent(dep, m, sid, isTurnEnd),
    runDeepSleep: (sinceArg?: number) => runDeepSleep(runDeps, sinceArg),
    probeSession: (rec: SessRec) => probeSession(probeDeps, rec),
    deepSleepCheck: () => deepSleepCheck(dep, m),
    getDeepSleepStatus: () => getDeepSleepStatus(dep, m),
    runDeepSleepNow: () => runDeepSleepNow(dep, m),
    getConfig: () => ({
      enableDeepSleep: !!cfg.config.enableDeepSleep,
      deepSleepIdleMs: Number(cfg.config.deepSleepIdleMs) || 10800000,
      deepSleepProbe: !!cfg.config.deepSleepProbe,
      deepSleepProbeAfterMs: Number(cfg.config.deepSleepProbeAfterMs) || (Number(cfg.config.deepSleepIdleMs) || 10800000),
      deepSleepProbeWindowMs: Number(cfg.config.deepSleepProbeWindowMs) || 60000,
    }),
  }
}
