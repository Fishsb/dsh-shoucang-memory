/**
 * composition.ts — **唯一 composition root 的持有面**（G0 · 2026-09-13）
 *
 * 为什么需要它（Q 目标里的「唯一 composition root」）：
 *   本插件有两个独立装配点（`panel` 与 `scheduler`），而 panel 的路由需要在**请求时**读到 scheduler
 *   半区构造出来的运行时句柄（MCL 状态、suite 扫描、深睡控制）。原做法是三只**模块级全局 holder**
 *   （`scheduler-share` / `deepsleep-share` / `mcl-share`）：scheduler 启动期往里写，panel 请求时往外读。
 *   它解决了装配次序问题，但代价是**跨模块隐式通道**——"谁在何时初始化、谁依赖谁"无法静态核对，
 *   于是长出 3 条桥、6 条边（`check-bridges.mjs` 已把它数成数字）。
 *
 * 本件的形态：root **显式创建句柄盒**并在装配时交给两侧（`applyPanel(ctx, config, comp)` /
 *   `applyScheduler(ctx, config, comp)`）——次序不变（panel 先装），但依赖变成**显式参数**：
 *   · 生产者：scheduler 往 `comp.mcl.current` 装入句柄；
 *   · 消费者：panel 路由从 `comp.mcl.current` 取出；
 *   · 没有模块级可变全局，静态可追。
 *
 * 迁移节奏（棘轮目标 0 条桥边）：`mcl` → `deepSleep` → **`scheduler`（2026-09-13 完成，桥边 0）**。
 *   **不换装配次序**（避免启动期行为风险）。
 */
import type { MclStatus } from './mcl.js';
import type { DeepSleepStatus } from './deepsleep-core.js';
import type { SuiteMemberRow } from './targets.js';
/**
 * scheduler 装配面句柄（原 `scheduler-share.ts` 的 holder，2026-09-13 随该桥退役搬入 root）。
 * 形状与 `scheduler.ts#schedulerShareApiOf` 的返回**结构一致**（那边以本类型标注返回值 ⇒ 编译期对齐）。
 */
export interface SchedulerApi {
    /** suite 装配矩阵（`targets.suiteAssemblyMatrix` 的产物；单一实现在 targets） */
    suiteScan: () => {
        members: SuiteMemberRow[];
        summary: string;
    };
    /** 运行中蒸馏配置（UI 展示源） */
    distillConfig: () => {
        enableDistill: boolean;
        idleWakeMs: number;
        minTurnChars: number;
        distillPrescan: boolean;
        llmProvider: string;
        llmModel: string;
        distillProvider: string;
        distillModel: string;
        sleepProvider: string;
        sleepModel: string;
    };
    /** LLM 模型枚举（Harness 模型体系） */
    llmModels: () => Promise<Array<{
        provider: string;
        id: string;
        name: string;
    }>>;
}
/** MCL 运行时句柄（面板 `/mcl/status` 消费的最小面） */
export interface MclHandle {
    status(): MclStatus;
}
/**
 * 深睡/蒸馏运行时句柄（原 `deepsleep-share.ts` 的 `DeepSleepApi`，2026-09-13 随该桥退役搬入 root）。
 * 由 scheduler 的 `registerDistill` 在启动期创建，panel 路由在请求时读取。
 */
export interface DeepSleepApi {
    /** 状态机快照（供 UI 轮询展示） */
    getDeepSleepStatus: () => DeepSleepStatus;
    /** 手动触发一次深度睡眠归纳（复用 runDeepSleep，含 deepSleepRunning 并发守卫） */
    runDeepSleepNow: () => Promise<{
        ok: boolean;
        error?: string;
        result?: 'done' | 'failed' | 'no-traces';
    }>;
    /** 运行中深度睡眠配置键（T2「可调」的展示源；持久化写 ~/.dsh/suite/scheduler.json） */
    getConfig: () => {
        enableDeepSleep: boolean;
        deepSleepIdleMs: number;
        deepSleepProbe: boolean;
        deepSleepProbeAfterMs: number;
        deepSleepProbeWindowMs: number;
    };
    /** 手动触发一轮蒸馏（2026-09-10：遍历根会话蒸馏，携带 pending 候选回流） */
    runDistillNow: () => Promise<{
        ok: boolean;
        sessions: number;
        note?: string;
    }>;
}
/**
 * 跨域句柄盒。字段用 `{ current }` 包一层，因为生产者在**装配期之后**才填入
 * （scheduler 装配时创建 MCL；panel 装配更早）——这层间接正是原桥存在的理由，现在它显式化在 root 里。
 */
export interface CompositionHandles {
    mcl: {
        current: MclHandle | null;
    };
    /** 深睡/蒸馏句柄（`deepsleep-share` 于 2026-09-13 退役后搬入） */
    deepSleep: {
        current: DeepSleepApi | null;
    };
    /** scheduler 装配面句柄（`scheduler-share` 于 2026-09-13 退役后搬入）——**三条桥至此全部退役** */
    scheduler: {
        current: SchedulerApi | null;
    };
}
export declare function createComposition(): CompositionHandles;
