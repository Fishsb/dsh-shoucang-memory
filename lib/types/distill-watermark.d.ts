import type { WmBaseline } from './deepsleep-core.js';
import type { DistillState } from './distill-state.js';
export interface WmDeps {
    watermarkFile: string;
    log(m: string): void;
    audit(o: Record<string, unknown>): void;
    sidShort(sid: string): string;
    st: DistillState;
}
/**
 * 阶段 2（2026-09-14）：**流程实例** —— 让「这一轮跑到哪一步」可查询。
 *
 * 背景（审核 `docs/eda-architecture-audit-20260914.md` F1）：原先的续传状态**只是一个数字**
 * （`lastSeq`），加上内存态（`distilling` / `dispatchFailStreak`）重启清零 ⇒
 * **没有「当前在第几步」这回事，只有「上次到哪」**。后果：spawn 卡住 10 分钟时无从判断，
 * 面板也查不到蒸馏进度。
 *
 * 形态：**纯增量**追加字段，既有字段语义一律不动
 * （本件头注 :54-57 已记：为形态对齐去动水位读链风险与收益不成比例）。
 * 旧行没有这些字段 ⇒ `readRunState` 回落 `phase='unknown'`，与旧行为完全等价。
 */
export interface RunState {
    /** 一次蒸馏 run 的标识（跨段共享；重启后由新 run 重新生成） */
    runId: string;
    /** 当前阶段：`spawn` / `segment-done` / `forced` */
    phase: string;
    attempt?: number;
}
export interface RunSnapshot {
    runId: string | null;
    phase: string;
    lastSeq: number;
    updatedAt: string;
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createWmApi(d: WmDeps): {
    readWatermarks: () => Map<string, any>;
    writeWatermark: (sessionId: string, lastSeq: number, agent?: any, run?: RunState | undefined) => void;
    sessionFormatVersionOf: (agent: any) => number | undefined;
    agentFingerprintAt: (agent: any, seq: number) => string | null;
    discardWatermark: (sid: string, reason: string, agent: any, wm: any) => {
        maxSeq: number;
        wrote: boolean;
    };
    resolveWatermark: (sid: string, agent: any, mapCache?: Map<string, any> | undefined) => WmBaseline | null;
    readRunState: (sid: string) => RunSnapshot | null;
};
export type WmApi = ReturnType<typeof createWmApi>;
declare const readWatermarks: (d: WmDeps) => Map<string, any>;
/**
 * 阶段 2：读回某会话的**流程实例快照**（取该会话最后一行为准）。
 *
 * 为什么取最后一行：水位流是 append-only 且**同名覆盖 = 末行生效**（与 `readWatermarks` 同口径），
 *   故末行就是「最近一次推进后的状态」。
 * 旧行兼容：v18 之前的历史行没有 `runId`/`phase` ⇒ 回落 `runId=null, phase='unknown'`
 *   ——**不加这个兜底，升级后首次读会把历史会话全判成"运行中"**。
 * 零抛出：水位文件不可读时返回 null（调用方按"无实例"处理）。
 */
declare const readRunState: (d: WmDeps, sid: string) => RunSnapshot | null;
declare const writeWatermark: (d: WmDeps, sessionId: string, lastSeq: number, agent?: any, run?: RunState) => void;
declare const sessionFormatVersionOf: (d: WmDeps, agent: any) => number | undefined;
/** 锚点事件指纹：记录时刻 lastSeq 处事件的 type|time|data 长度（seq 重排后此三元组随之改变）。 */
declare const agentFingerprintAt: (d: WmDeps, agent: any, seq: number) => string | null;
/**
 * 未验证水位行的一次性收尾（作废留痕）：**跳到当前 live maxSeq 并写双证**，而不是写 0。
 * 为何不是 0：写 0 的行没有可用锚点（seq 0 无事件）→ 下次读仍判「不可验证」→ 每轮全量重蒸，形成死循环。
 * 为何跳到 maxSeq 是安全的：作废的三种情形（格式代变更 / 锚点指纹不符 / 双证缺失的历史行）都意味着
 * 「已消费边界」不可定位——不可定位就无法安全重蒸（可能错位重蒸整会话，也可能错位跳过），
 * 故从当前边界继续；旧版本已消费的部分由旧版本负责，不重复也不再回补。
 * 代价明确且可接受：不可定位的那一段增量不再回补（宁可少蒸一次，不可错位重蒸/错位跳过）。
 * G-20（2026-09-12）：本注释此前被自身代码违反——`snapshotEvents()` 抛异常时 catch 把 maxSeq 退化为 0，
 *   随后仍 `writeWatermark(d, sid, 0, agent)`，即写下本注释明令禁止的「0 行」。现由 runDiscardWatermark
 *   强制：maxSeq<=0 ⇒ **不写**（读侧 `lastSeq<=0 → null` 与不写等价，写 0 只污染文件与审计）。
 */
declare const discardWatermark: (d: WmDeps, sid: string, reason: string, agent: any, wm: any) => {
    maxSeq: number;
    wrote: boolean;
};
/**
 * 取基线。返回 null **仅当**真的需要全量（水位缺失 / seq 空间回退 / 快照不可用）；
 * 双证失效但 live 边界未回退时返回**降级基线**（lastSeq=当前 live maxSeq, degraded=true），
 * 不再返回裸 null —— 旧码返回 null 会让调用方 `baseline ? baseline.lastSeq : 0` 把 lastSeq 打成 0 ⇒ 整窗重蒸。
 */
declare const resolveWatermark: (d: WmDeps, sid: string, agent: any, mapCache?: Map<string, any>) => WmBaseline | null;
export {};
