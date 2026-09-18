/**
 * ring-supply.ts — **环记录的情境供给**（P2 · 2026-09-14 · 拟人化方案 §4.3 线 A）
 *
 * 为什么需要它：五个内容环（fact / decision / relation / association / value）里，环记录**天然没有 md 投影**
 *   （`record-store.ts:21-23` 的设计意图：`file=''` 表示"Record 能存、md 存不下"），
 *   而活注入路径 `panel-shared#readCarrier` 是 `readFileSync` **直接读三个 md 文件**
 *   ⇒ 环记录在结构上**不可达**。实测：980 条记录中带环语义的仅 9 条，且全部零注入。
 *   本件给它们一条**独立通道**（不迁移数据源、不重写 readCarrier）。
 *
 * 边界纪律（**照抄 `supply-assembly.ts` 头注**，本仓防漂移的核心手法）：
 *   · 只做**选择 + 渲染**；**装配**（预算分配 / 槽序 / 溢出记账）归 `supply-assembly`（唯一装配实现）；
 *   · **不重排、不新写打分函数** —— 候选序 = 「情境键命中 → 环优先级（注册表 ringOrder）→ due 紧迫度 → 新鲜度」，
 *     这是**选择判据**，不是与 `vec.recallRanked` 竞争的第二份**相关性打分**（仓内红线：打分口径只能一份）；
 *   · **纯函数、零 I/O、零抛出、确定性**（判定时刻 `at` 必填，不吃隐式 now）。
 */
import type { MemRecord, RecordKind } from './record-store.js';
import { type Ring } from './rings.js';
import { CUES_SEP, parseCues, serializeCues } from './cue-space.js';
export { CUES_SEP, parseCues, serializeCues };
/** 环记录**必带** `file === ''`（= 无 md 投影）。这不是"缺失"，是设计意图，也是本件的选择基准。 */
export declare const RING_RECORD_FILE = "";
/**
 * S4-5（2026-09-14）**情境槽额度自适应**：由**活体环记录数**派生 `topN`。
 *
 * 判因：`topN` 此前是注册表里的固定 **3**，而实测库内环记录 **105 条** ⇒ **命中率天花板 ≈3%**
 *   （105 条抢 3 个位置）。额度与库规模脱钩，等于"**库越大，经历面越稀释**"。
 *
 * 公式 `clamp(ceil(√N), 3, 12)`：**次线性**（避免库大时把注入面撑满）、下限沿用原值 3（小库**零变化**）、
 *   上限 12（注入面硬约束）。实测 N=105 ⇒ **11**（≈原 3.7 倍）。
 *
 * 回滚：注册表 `surface.injection.situation.adaptive = false` ⇒ 回到固定 `topN`（缺省 `true`）。
 * 纯函数、零 IO、零抛出（与 `ringCandidates` 同纪律）。
 */
export declare function adaptiveTopN(records: readonly MemRecord[], fixedTopN?: number, adaptive?: boolean): number;
/**
 * S4-4（2026-09-14）**到期前瞻**：`due` 是否「已到或临近」（`at` 起 `windowMs` 内）。
 *
 * 判因：本件 :85 早已自述「过期的承诺/意图是**最该被想起**的（前瞻记忆的失败模式就是漏掉它们）」，
 *   但此前 `due` **只在"同组内"按 `dueRank` 排序** —— 一旦该条未命中情境线索，就落进**兜底组**，
 *   于是**永远排在所有命中者之后**（跨组优先级压过组内 due）。⇒ 本函数把"到期/临近"提为**独立组**。
 *
 * 纪律（与 `dueRank` 同）：**坏时间戳按"无 due"处理，不抛**。
 * 窗口缺省 7 天 —— "临近"的定义由此唯一，不在调用处各写一个数（防口径漂移）。
 */
export declare function dueSoon(meta: Record<string, string> | undefined, at: string, windowMs?: number): boolean;
/** 渲染一行（人读可辨：环标签 + 正文 + 关键 meta）。**渲染只此一处**，panel/深睡/工具共用。 */
export declare function renderRingLine(r: MemRecord): string;
export interface RingSupplyOpts {
    /** 目标环与**优先级序**（缺省取注册表 `surface.injection.situation.ringOrder`） */
    rings?: readonly Ring[];
    /** 条数上限（缺省取注册表 `surface.injection.situation.topN`） */
    topN?: number;
    /** 判定时刻（**必填**：不吃隐式 now，否则结果不可复现 —— 与 `buildCandidates` 同纪律） */
    at: string;
}
/** 一条候选（带**为什么进**的理由，便于面板与审计复核——不静默） */
export interface RingCandidate {
    id: string;
    kind: RecordKind;
    ring: Ring;
    /** `cue` = 情境键命中；`due` = cues 未命中但**已到期/临近**（S4-4 主动提）；`fallback` = 其余兜底序 */
    why: 'cue' | 'due' | 'fallback';
    /** 命中的键（why=cue 时非空） */
    hits: string[];
    line: string;
    record: MemRecord;
}
/**
 * 环候选选择（**纯函数**）。判据顺序即优先级：
 *   ① 情境键命中者（按命中数降序）② 兜底者（cues 缺失/未命中）
 *   组内按：环优先级（注册表序）→ due 紧迫度 → 新鲜度（`createdAt` 降序，空视为最旧）。
 * 去重按 `id`（同 id 只留一条，保序）。
 */
export declare function ringCandidates(records: readonly MemRecord[], cues: readonly string[], opts: RingSupplyOpts): RingCandidate[];
/** 注册表缺省（`criteria.json#surface.injection.situation`）；调用方应传注册表实际值覆盖 */
export declare const DEFAULT_RING_ORDER: readonly Ring[];
export declare const DEFAULT_RING_TOPN = 3;
export interface RingSupplyDeps {
    /** 目标环序（缺省 `DEFAULT_RING_ORDER`；生产方应传 `SURFACE.injection.situation.ringOrder`） */
    rings?: readonly Ring[];
    /** 条数上限（缺省 `DEFAULT_RING_TOPN`；生产方应传注册表值） */
    topN?: number;
}
export interface RingSupplyApi {
    candidates(records: readonly MemRecord[], cues: readonly string[], at: string): RingCandidate[];
    /** 供 `supply-assembly` 的 situation 槽直接消费（只取行文本） */
    lines(records: readonly MemRecord[], cues: readonly string[], at: string): string[];
}
export declare function createRingSupplyApi(d?: RingSupplyDeps): RingSupplyApi;
