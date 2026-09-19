// probe-config.ts — 深睡「输出增长探测」配置域（S-P2b 抽出 · 2026-09-20）
//
// 为什么抽出（**按领域接缝，不是按行数硬切**）：`check-module-growth` 对 `src/scheduler.ts`
//   有冻结棘轮（基线 611 + 容差 15 = 626），而 S-P2b 新增阈值令实测达到 627（**仅超 1 行**）。
//   门禁自身给出的首选出路是「按**领域接缝**拆出一块」——本组 8 键与 `deepsleep-probe.ts`
//   **同域**（输出增长探测：开关 / 发起时机 / 采样窗 / 采样数 / 卡住确认 / 冲突上限 / 重试 / 总时长），
//   且**只被这一条链路消费**（`deepsleep-probe.ts` 经 `cfg.config` 读取）⇒ 内聚度天然成立。
//
// ⚠ 抽出后**单一事实源不变**：zod 缺省仍在 `skill/engine/criteria.json#trigger.*`（生成投影
//   `TRIGGER`），本件只是把「读缺省 + 声明 schema」这组动作搬到 probe 域，**不改任何数值**。
// ⚠ 类型侧（`ProbeConfigFields`）与 schema 侧（`probeConfigSchema`）**同处一文件**——防"两处各写一份"
//   （本仓已登记的漂移源形态：schema 有 ≠ 运行时 config 有）。
// ⚠ schema 库是 **`schemastery`**（宿主体系；不是 zod）——与 `scheduler.ts` 同源。
import z from 'schemastery'
import { TRIGGER } from './criteria.generated.js'

/** 探测域配置键（**运行时直传**；`Config` 与 `distillOptionsOf` 均按此形状消费）。 */
export interface ProbeConfigFields {
  /** 输出增长探测开关（running 无事件超时后采样转录，确认真活跃） */
  deepSleepProbe: boolean
  /** running 状态无事件多久发起探测（缺省同 idleMs = 2700000ms 即 45min） */
  deepSleepProbeAfterMs: number
  /** 探测采样间隔（毫秒，缺省 60 秒） */
  deepSleepProbeWindowMs: number
  /** 每轮采样次数（缺省 3；任一次检出增长即判长任务） */
  deepSleepProbeSamples: number
  /** 判「卡住」需连续无增长的轮数（缺省 2；首轮落 suspect，阻塞睡眠待复核） */
  deepSleepProbeConfirm: number
  /** 证据冲突（状态活跃但连续零输出）连续轮数上限（达上限按卡住处理；治 conflict 分支活锁） */
  deepSleepProbeConflictMax: number
  /** 探针不可用/异常时重试次数（缺省 2） */
  deepSleepProbeRetries: number
  /** 单轮探测总时长兜底（毫秒，缺省 10 分钟，防悬挂） */
  deepSleepProbeMaxMs: number
}

/**
 * 探测域 zod schema（**分散声明，供 `Config` 展开**）。
 * ⚠ `deepSleepProbeConflictMax` 的缺省读**注册表** `TRIGGER.deepSleepProbeConflictMax`（单一真源）；
 *   该值是「有界性」（正确性要求），不是待校准的经验值。
 */
export const probeConfigSchema = {
  deepSleepProbe: z.boolean().default(true).description('输出增长探测：会话 running 但长时间无事件时，采样转录文件两次确认是长任务还是卡住'),
  deepSleepProbeAfterMs: z.number().min(600000).default(TRIGGER.probeAfterMs).description('running 状态无事件持续此毫秒数后发起探测（缺省读注册表 TRIGGER.probeAfterMs）'),
  deepSleepProbeWindowMs: z.number().min(5000).default(TRIGGER.probeWindowMs).description('探测采样间隔（毫秒，缺省 60 秒）'),
  deepSleepProbeSamples: z.number().min(1).default(3).description('每轮探测采样次数：任一次检出转录增长即判为长任务（缺省 3）'),
  deepSleepProbeConfirm: z.number().min(1).default(2).description('判「卡住」需连续无增长的轮数，首轮落 suspect 阻塞睡眠待下轮复核（缺省 2）'),
  // S-P2b（2026-09-20）：**证据冲突有界**。原实现「状态活跃但零输出」分支不推进任何计数 ⇒ 活锁
  //   （真机实测连续 23 次 conflict / 跨 11 小时零触发）。缺省读注册表 `TRIGGER.deepSleepProbeConflictMax`。
  deepSleepProbeConflictMax: z.number().min(1).default(Number(TRIGGER.deepSleepProbeConflictMax) || 3).description('证据冲突（agent 状态活跃但连续零输出）连续此轮数即按卡住处理（不阻塞睡眠）。缺省读注册表 TRIGGER.deepSleepProbeConflictMax = 3；这是**有界性**（正确性）而非校准值'),
  deepSleepProbeRetries: z.number().min(1).default(2).description('探针不可用或异常时的重试次数（缺省 2）'),
  deepSleepProbeMaxMs: z.number().min(30000).default(600000).description('单轮探测总时长兜底（毫秒，缺省 10 分钟，防悬挂）'),
} as const

/** 把探测域的运行时取值从 config 投影出来（`distillOptionsOf` 用；**显式映射**，防漏键）。 */
export const probeOptionsOf = (config: ProbeConfigFields): ProbeConfigFields => ({
  deepSleepProbe: config.deepSleepProbe,
  deepSleepProbeAfterMs: config.deepSleepProbeAfterMs,
  deepSleepProbeWindowMs: config.deepSleepProbeWindowMs,
  deepSleepProbeSamples: config.deepSleepProbeSamples,
  deepSleepProbeConfirm: config.deepSleepProbeConfirm,
  deepSleepProbeConflictMax: config.deepSleepProbeConflictMax,
  deepSleepProbeRetries: config.deepSleepProbeRetries,
  deepSleepProbeMaxMs: config.deepSleepProbeMaxMs,
})
