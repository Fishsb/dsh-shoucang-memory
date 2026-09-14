/**
 * distill-state.ts — 蒸馏器的**可变运行时状态**（集中装箱，显式传递）。
 *
 * 为什么集中成一个对象：`registerDistill` 里有一批并发守卫/连败计数（Set / Map / 计数器），
 *   它们被多个领域模块读写。若各自散在闭包里，模块一拆就得到处传一堆散装变量；
 *   装箱成一个 `DistillState` 后按引用传递即可。
 *
 * ⚠ 这不是「依赖团块」：这里装的是**状态**（会变的数据），不是**依赖**（外部能力）。
 *   判据：依赖是「谁来做」，状态是「做到哪了」；前者按领域窄传（3–11 项），后者整体装箱。
 *   ⚠ 更不能放到模块级全局：那会让多次 registerDistill 调用共享同一份状态（测试/热重载会串味）。
 */
export interface DistillState {
  /** 并发守卫：同会话蒸馏在途标记（防 turn/end 重武装导致双写/竞态） */
  distilling: Set<string>
  /** 快照不可用的连续轮数（sid → 次数） */
  snapshotUnavailableStreak: Map<string, number>
  /** 派发失败连败计数（`${sid}#${endSeq}` → 次数） */
  dispatchFailStreak: Map<string, number>
  /** 因未消化段而「扣住不推」的连续轮数（sid → 次数） */
  skipHoldStreak: Map<string, number>
  /** 空闲定时器（sid → timer） */
  idleTimers: Map<string, any>
  /** 最近一次活动过的 agent（深睡 parent 兜底） */
  lastParent: any
  /** 守护 parent（深睡无可用 agent 时复用） */
  daemonParent: any
  /** 子代理活跃表：parentSid → childSid → lastSeen */
  childSeen: Map<string, Map<string, number>>
  /** 父归属解析失败时的全局兜底计数（宁少蒸勿切碎） */
  globalChildSeen: number
  /** 兜底生效日志节流时间戳（60s 一次，防每轮刷屏） */
  globalChildLoggedAt: number
}

/** 造一份**全新**状态（每次装配调用一次；不做模块级单例）。 */
export function newDistillState(): DistillState {
  return {
    distilling: new Set(),
    snapshotUnavailableStreak: new Map(),
    dispatchFailStreak: new Map(),
    skipHoldStreak: new Map(),
    idleTimers: new Map(),
    lastParent: null,
    daemonParent: null,
    childSeen: new Map(),
    globalChildSeen: 0,
    globalChildLoggedAt: 0,
  }
}
