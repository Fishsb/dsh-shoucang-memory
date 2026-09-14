import type { SessRec, DeepSleepStatus } from './deepsleep-core.js';
import { type ProbeDeps } from './deepsleep-probe.js';
import { type RunDeps } from './deepsleep-run.js';
import type { SleepIo, SleepSession, SleepState } from './deepsleep-contract.js';
/** 装配层持有的**可变**状态（按引用传给状态机；标量必须装箱才写得回）。 */
export interface SleepMachine {
    sessions: Map<string, SessRec>;
    lastActivityAt: number;
    lastDeepSleepAt: number;
    deepSleepRunning: boolean;
}
/** 状态机需要的**依赖**（全部由 createDeepSleep 装配期构造）。 */
export interface MachineDeps {
    config: any;
    ctx: any;
    io: SleepIo;
    session: SleepSession;
    state: SleepState;
    probe: ProbeDeps;
    run: RunDeps;
}
/** 状态迁移入口：任意事件 → RUNNING；turn/end(completed) → ENDED（停滞计时起点） */
export declare function noteEvent(dep: MachineDeps, m: SleepMachine, sid: string, isTurnEnd: boolean): void;
/** 启动水位回放：取审计最新时间（重启不重置停滞判定）+ 上次深睡时间（痕迹窗口起点）。 */
export declare function replayWatermark(dep: MachineDeps, m: SleepMachine): void;
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
export declare function deepSleepCheck(dep: MachineDeps, m: SleepMachine): void;
/** 状态机快照——面板展示 / 手动触发（POST /deepsleep/trigger）/ 配置读写（/deepsleep/config）均读这里 */
export declare function getDeepSleepStatus(dep: MachineDeps, m: SleepMachine): DeepSleepStatus;
/** 手动触发入口（T2 面板「立即归纳一次」）：复用 deepSleepRunning 并发守卫，避免与自动巡检重叠。 */
export declare function runDeepSleepNow(dep: MachineDeps, m: SleepMachine): Promise<{
    ok: boolean;
    error?: string;
    result?: 'done' | 'failed' | 'no-traces';
}>;
