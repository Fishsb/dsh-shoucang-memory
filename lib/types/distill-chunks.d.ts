export declare const CHUNK_CHARS = 10000;
export declare const MAX_CHUNKS_PER_RUN = 3;
import { isRealUserEvent } from './targets.js';
export { isRealUserEvent };
/**
 * 材料事件白名单（册一 · 2026-09-19）——**输入面收敛的单一实现**。
 *
 * 判因（真机实测）：`buildEventChunks` 原让**无文本事件也推进段 `endSeq`**（下方 `:75` 旧码），
 *   而宿主在父会话上落的管理事件（`subagent/catalog` —— 每次 spawn 一条，见 `dsh-subagent/lib/index.js`
 *   的 `parent.append("subagent/catalog", …)`）**正是蒸馏自己造出来的** ⇒ 每轮重试把窗口右端 +1
 *   ⇒ 重试键 `sid#endSeq` 每轮都变 ⇒ `MAX_DISPATCH_RETRY=3` 结构性失效（真机：全会话唯一 `turn/end`
 *   在 seq 100，其后 101–106 六条全是 catalog；全日志「第 3/3 次」0 次）。
 *
 * 与宿主的关系（**不**在运行时 import）：宿主 `@deepseek-ai/dsh-session` 导出
 *   `isSurfaceEligibleType`（`SURFACE_EVENT_TYPES` = system/message · user/message · assistant/message · tool/result）。
 *   ⚠ 实测 profile 内该包**不可解析**（`~/.dsh/profiles/web/node_modules/@deepseek-ai/` 只有
 *   cordis / cosmokit / dsh-client-※ / dsh-llm / dsh-tools / schemastery）⇒ 运行时 import 会把插件整个加载链炸掉。
 *   故白名单在本仓定义、由 `scripts/check-distill-input-surface.mjs` ⑥ **锁 parity**（逐条 ⊆ 宿主 surface 集；
 *   宿主不可达则显式 UNVERIFIED）。**本集合只是宿主 surface 集的子集**（我们只取有正文的两类）。
 */
export declare const MATERIAL_EVENT_TYPES: ReadonlySet<string>;
/** 该事件是否属于**材料面**（只有材料事件能进段文本、能推段边界） */
export declare const isMaterialEvent: (e: any) => boolean;
export declare const textPartsOfEvent: (e: any) => string[];
export interface DistillChunk {
    startSeq: number;
    endSeq: number;
    text: string;
    segKey: string;
    events: number;
}
export interface DistillChunks {
    chunks: DistillChunk[];
    maxSeq: number;
}
/**
 * buildEventChunks — v18 分段器（2026-09-10）：把 seq>lastSeq 的事件增量按「累计字符超 chunkChars 即切段」切成若干段。
 * - 文本化规则 = 模块级 `textPartsOfEvent` 单一实现（user text 片 ≤2000、assistant text 片 ≤3000）；
 * - 切段只在事件边界，绝不劈事件；单个事件文本超 chunkChars 时允许单事件成段；
 * - ★ **册一（2026-09-19）：边界二分** ——
 *     `maxSeq` = **扫描边界**（覆盖窗口内**一切**事件，含管理事件 ⇒ 不丢事件，跳过分支据此推水位）；
 *     段 `endSeq` = **材料边界**（只由产生正文的事件推进）⇒ 宿主管理事件（`subagent/catalog` 等）
 *     **不再推段边界**，故同一段在重试之间身份稳定（旧行为下蒸馏自己 spawn 的子代理记录每轮把边界 +1）。
 *     ⚠ 旧注释「无文本事件并入当前开放段（只推进其 endSeq）」**已不成立**，此句即为现状描述。
 * - 段身份 `segKey` = 首末材料事件元信息 + 段文本长度（`segKeyOf`）——重试计数的键（见 `distill-agent.ts`）；
 * - 窗口内完全没有 seq>lastSeq 的事件 → chunks=[]、maxSeq=lastSeq；maxSeq=窗口最末事件 seq；
 * - 「还有后续段未处理」由调用方按 chunks.length 与本轮段数上限（MAX_CHUNKS_PER_RUN）判定
 *   （水位停在已处理段的 endSeq，下一触发续传）。
 */
export declare function buildEventChunks(agent: any, lastSeq: number, chunkChars?: number, eventsOf?: any[]): DistillChunks;
export declare const manifestLineFor: (endSeq: number, route: string, out: any) => string;
export declare const manifestPush: (manifest: string, line: string, cap: number) => string;
