/**
 * 深度睡眠状态机 · 跨插件共享引用。
 *
 * 背景：守藏单插件里，panel.ts 与 scheduler.ts 是两个独立 apply 函数，但共用同一
 * cordis ctx（index.ts 先 applyPanel 后 applyScheduler）。getDeepSleepStatus /
 * runDeepSleepNow / getConfig 由 scheduler 的 registerDistill 在启动期创建（闭包内），
 * 而 panel 的 HTTP RPC 在请求时才需要它们——故用一个 module 级 holder 惰性桥接：
 *   - scheduler 启动期把引用写入 deepSleepShare.api；
 *   - panel 路由在请求时读取（此时 scheduler 必然已运行完毕），读不到则返回未激活态。
 *
 * 红线：本文件只 type-only 引用 distill 的 DeepSleepStatus，无运行时循环依赖；
 * 不出现任何硬编码机器路径。
 */
import type { DeepSleepStatus } from './distill.js'

/** 深度睡眠运行时 API（由 scheduler.registerDistill 填充） */
export interface DeepSleepApi {
  /** 状态机快照（供 UI 轮询展示） */
  getDeepSleepStatus: () => DeepSleepStatus
  /** 手动触发一次深度睡眠归纳（复用 runDeepSleep，含 deepSleepRunning 并发守卫） */
  runDeepSleepNow: () => Promise<{ ok: boolean; error?: string }>
  /** 运行中深度睡眠配置键（T2「可调」的展示源；持久化写 ~/.dsh/suite/scheduler.json） */
  getConfig: () => {
    enableDeepSleep: boolean
    deepSleepIdleMs: number
    deepSleepProbe: boolean
    deepSleepProbeAfterMs: number
    deepSleepProbeWindowMs: number
  }
}

/** 共享引用：请求时惰性读取（可能为 null=蒸馏器未启用/未就绪） */
export const deepSleepShare: { api: DeepSleepApi | null } = { api: null }
