/**
 * criteria.ts — 判据内核（ADR-122 记忆核心 v2）：**L0 共用评估器 + 升格/降格裁决**，单一实现。
 *
 * 判据取值与参数唯一事实源 = `skill/engine/criteria.json` → 生成投影 `src/criteria.generated.ts`（禁手写）。
 * 本模块只做**确定性判定**（无 LLM）：把"可复用性/泛化度/稳定性/冲突性"与"升格/降格门槛"从各域 prompt 散文里
 * 抽成可调用、可审计的函数——两域（摄取 Ingestor / 巩固 Consolidator）**同调一份实现**，杜绝判据漂移。
 *
 * 用法：
 *   evaluateL0(input)                      → L0 四维枚举 + basis（依据的 criteria id，入台账）
 *   promoteVerdict('principle'|'path', s)  → 升格裁决（含 premise 硬门）
 *   demoteVerdict(s)                       → 降格/遗忘裁决（三守卫 + 画像节保护 + 单轮上限）
 */
import { CRITERIA_VERSION } from './criteria.generated.js';
export { CRITERIA_VERSION };
export type L0Reuse = 'cross-task' | 'cross-project' | 'session-only';
export type L0Generality = 'direction' | 'contract-fact' | 'detail';
export type L0Stability = 'once' | 'same-day-repeat' | 'cross-day';
export type L0Conflict = 'none' | 'coexist' | 'supersede';
export interface L0Verdict {
    reuse: L0Reuse;
    generality: L0Generality;
    stability: L0Stability;
    conflict: L0Conflict;
    /** 用了哪些判据 id（写台账，供"判据-结果一致率"对账） */
    basis: string[];
}
/** 判据参数查表（唯一事实源=注册表 → 生成投影的 CRITERIA_ROWS） */
export declare function paramOf<T = unknown>(criteriaId: string, key: string, fallback: T): T;
export interface L0Input {
    /** 待判文本（候选/条目正文；可为空=只按统计判） */
    text?: string;
    /** 同主题痕迹条数（窗口内） */
    traces?: number;
    /** 近 30 天命中日数（跨日重现信号） */
    days30?: number;
    /** 涉及会话数（跨会话信号） */
    sessions?: number;
    /** 与既有条目冲突（将被取代） */
    supersedes?: boolean;
}
/** L0 共用内核：四维枚举（两域同口径；**不打分**，避免魔法数） */
export declare function evaluateL0(input: L0Input): L0Verdict;
export interface PromoteStats {
    traces?: number;
    occurrences?: number;
    sessions?: number;
    success?: boolean;
    /** 该结论是否依赖未写出的隐含前提（premise awareness，v2 新增） */
    dependsOnPremise?: boolean;
    /** 前提是否已写进概况/正文 */
    premiseWritten?: boolean;
}
export interface Verdict {
    ok: boolean;
    reason: string;
    basis: string[];
}
/** 升格裁决：notes/候选 → [原则] / [路径]（巩固域唯一入口的确定性前置） */
export declare function promoteVerdict(kind: 'principle' | 'path', stats: PromoteStats): Verdict;
export interface DemoteStats {
    leaf?: boolean;
    status?: string;
    isStub?: boolean;
    file?: string;
    daysSinceHit?: number;
    archivedThisRun?: number;
}
/** 降格/遗忘裁决：三守卫 + 画像节保护 + 单轮上限（禁直删） */
export declare function demoteVerdict(s: DemoteStats): Verdict;
/** 检索面参数（供 vec/mcl 读取，避免各处硬编码阈值） */
export declare const SURFACE_PARAMS: {
    readonly injection: {
        readonly budgetChars: 4000;
        readonly budgetNote: "热记忆注入**恒定面安全带**（字符）。语义（2026-09-13 v2 修正）：恒定面（双画像索引行 + P 层画像行）**必在、不按比例裁**，本值只防库无界膨胀；变动面（知识索引）≤600、一次性面（成长 delta）≤200 各有硬顶，超预算的行被裁且**留痕提示**（不静默）。测算：AGENT 索引 1,138 + USER 索引 430 + 画像行 ≈630 + 标题 ≈1,990 ⇒ 实际每步 ≈2,800 上限。原 1800（三层按比例分档）会把 AGENT 侧 `[原则]`/`[路径]` 裁掉一半以上、损伤人格一致性，已回退该口径。**⚠ 2026-09-14（P8 收口 · 实测否决）**：P8 原计划「恒定面**框架化**」（把清单降为「框架 + 可展开指针」）**经实测否决，不再重议**——测得每步真实 **2391–2977 字符**（Q1），其中 P 层 **1756 字符**，而 **`[原则]`+`[路径]` = 1532 字符（87%）且 18 条互不重复**（画像行与索引行**同名重复 = 0**）；**可压面只剩指针尾巴 302 字符（≈总 10%）**，而压缩会把 `notes/lessons.md §X` 变成缩写 ⇒ **引入新的指针解析失败模式**（与「模型须能按指针取详情」及 L2「误注入代价 > 漏注入」冲突）。⇒ 结论：**无既定的可收益压缩面**；恒定面之所以大，是因为它**几乎全是承载人格的习得原则**，而不是「灌」。要再压须先改变「原则不得裁」这条口径本身（那是一条已拍板的价值选择，不在本方案范围内）。";
        readonly order: 88;
        readonly relevance: true;
        readonly freshSlots: 2;
        readonly levelCaps: {
            readonly low: 2;
            readonly medium: 4;
            readonly high: 8;
            readonly smart: 10;
        };
        readonly carriers: {
            readonly profile: 6;
            readonly note: "P 层画像行注入上限（0=关闭 → 回滚到「画像行不注入」的旧行为）。沿革：2026-09-13（P0）3→4（配额改「按标签各留最近 1 条」）；同日 4→6（质量评估 R3）：实测被挡下的画像行 agent 3 条 / user 13–14 条，其中有「架构议题要抛开历史决策约束…」「UI 判定须视觉实证」等高价值偏好——提到 6（zod 上限）以减少「最有用的那几条恰好被挡」的概率；仍受稳定面安全带与块内配额约束，被挡者留痕可见。上限可配 injectProfileRows（0–6）";
        };
        readonly situation: {
            readonly enabled: true;
            readonly budgetChars: 300;
            readonly cueDims: readonly ["scope", "task", "subject", "event"];
            readonly ringOrder: readonly ["relation", "decision", "association", "fact", "value"];
            readonly topN: 3;
            readonly note: "**情境层（第三槽）**：环记录（`file=''`，无 md 投影）不进内容相关性面，而由**情境键匹配**（cue-driven）供给——依据是编码特异性（提取取决于「编码情境↔提取线索」匹配，非内容相似度）与前瞻记忆多进程框架（承诺/意图须线索驱动，纯战略监控在高负荷下系统性失败）。enabled=false 且 budgetChars=0 ⇒ **缺省零行为变化**（照抄 serendipity 槽先例）。cueDims 是**唯一维度声明处**（situation-key.ts 按它迭代，不另立名单）；ringOrder 按**环**排序（commitment 与 relation 同属 relation 环；episode 属 fact 环——故不按 kind 排，避免把两个语义层混进一张表）。**2026-09-14 P7 订正**：原先把 `value` 环排除在外，理由是「走图式层」——但图式层走的是 **md 投影行**，而 `valence` 记录是 `file=''` 的**环记录** ⇒ 实测它**两条路都不可达**（既不在恒定面、也不在 ringOrder）。现把 `value` 补进 ringOrder **末位**：只有 `file=''` 的 value 环记录（即 valence；`persona`/`principle`/`preference` 皆带 md 投影或不产出）能进，故不会挤占。**同时放弃原计划的 `alphaVal` 打分项**：`layeredScore` 的打分对象是**索引行**，索引行**没有 valence 信号**（valence 只存在于环记录 meta）⇒ 加它只能是恒 0 的**假旋钮**（仓内警示的「假可控」）。valence 的正确定位是**情境召回**，不是相关性权重。";
            readonly adaptive: true;
            readonly adaptiveNote: "S4-5（2026-09-14）：`true` ⇒ 情境槽 `topN` 由**活体环记录数**派生（clamp(ceil(√N),3,12)，实测 N=105 ⇒ 11）；`false` ⇒ 回退固定 `topN`。判因：固定 3 而库内环记录 105 条 ⇒ 命中率天花板 ≈3%，\"库越大经历面越稀释\"。";
        };
        readonly process: {
            readonly enabled: false;
            readonly carrierTag: readonly ["路径"];
            readonly topN: 3;
            readonly budgetChars: 300;
            readonly note: "S4-3（2026-09-14）**中层 process 槽**：任务级供给 —— 按标签取 `[路径]` 行（**不走内容相关性竞争**）。判因：人类三层结构里**中层是唯一没有专用通路的层**（`[路径]` 现经 R 层 gated 相关性召回，与其它内容争同一预算；且实测库内 `[路径]` 仅 5 条）。缺省 `enabled:false` ⇒ **零行为变化**。⚠ **运行时实现被前置重构阻塞**（登记 S4-findings 的 L5）：`panel-shared.ts` 受 `check-module-growth` **大模块冻结棘轮**约束（基线 831 / 上限 846），接入需先做「**动态面选行领域拆分**」—— 把该模块 :582-622 那段（预热缓存 ∪ 相关性 ∪ 新鲜槽 ∪ 基线补位）抽成独立模块（净减约 35 行），才腾得出接入空间。**那一步是本领的前置，不是可选项。**";
        };
    };
    readonly score: {
        readonly mode: "v2";
        readonly alphaRel: 1;
        readonly alphaImp: 0.25;
        readonly alphaRec: 0.1;
        readonly note: "v2.2 统一打分：score = α_rel·relevance(RRF) + α_imp·importance + α_rec·recency。**α_imp=0.25 由模拟证据选定**（scripts/shadow-sim.mjs 扫描：α=0.35→top-3 Jaccard 0.56 扰动过大；α=0.25→0.68 满足预注册判据 Jaccard≥0.6，且 corr(imp,rel)=−0.293 证明分量不冗余、扰动方向为『换进更重要条目』）。**mode=v2 已于 2026-09-11 翻转**（运行时开关 scheduler.scoreWeights=v2 同步）；回滚 = 两处同时回 legacy";
    };
    readonly recall: {
        readonly topK: 3;
        readonly topKMax: 5;
        readonly scope: "all";
        readonly coldFactorPercent: 35;
    };
    readonly fusion: {
        readonly kind: "rrf";
        readonly k: 60;
        readonly fallback: "weighted";
        readonly weights: {
            readonly dense: 0.7;
            readonly lexical: 0.3;
        };
        readonly dedupBySection: true;
    };
    readonly threshold: {
        readonly metric: "abs-cosine";
        readonly tOn: 0.65;
        readonly tOff: 0.6;
        readonly note: "ACT-024 校准：绝对余弦；归一化融合分只能排序不可做阈值";
    };
    readonly rerank: {
        readonly enabled: false;
        readonly gate: {
            readonly indexRows: 200;
            readonly followRateDropRuns: 2;
        };
        readonly note: "触发门未达前不引入 reranker（避免堆叠）";
    };
    readonly mcl: {
        readonly familiarThreshold: 0.55;
        readonly maxNudges: 1;
        readonly budgetChars: 600;
        readonly topK: 3;
        readonly note: "2026-09-11 阈值重校准（缺陷2）：旧值 0.65 在实测样本上**结构性不可达**——193 条 mcl-step 审计 sim 分布 max=0.634 / mean=0.5658 / p75=0.609 / p90=0.624，≥0.65 命中 **0 行** ⇒ 快通道恒为 0（快/慢分流退化为单一慢通道）。**2026-09-14 P7 二次重校准（D3）**：在 **936 条** sim 样本上按**预注册判据**（目标覆盖率 = 注册表原始意图 27.5%）取分位——实测 p50=0.513 / p60=0.529 / p70=0.548 / p72.5=0.548 / **p75=0.561** / p90=0.575 / max=0.662；扫阈值得 0.54→38.9% · **0.55→25.4%** · 0.56→25.1% · 0.57→11.9% · 0.58→**9.3%**（= 上轮值，实测远低于其自述的 27.5%）。取 **0.55**（最接近 27.5% 且落在拐点上）。回滚：**/set mclFamiliarThreshold 0.58**（全局 scheduler.json，热生效，无需重启）。**另一道门 hasHighConf 未放宽**（仍要求 mclGate 标签），故实际快通道触发率显著低于 25.4%。";
    };
};
/** 成熟度（v2.2 E6）：A(0)=A0；每次**跨日再现** +step（上限 1.0）。distinctDays = 出现过的不同日数（−1 次首现）。 */
export declare function activationOf(distinctDays: number, params?: {
    readonly A0: 0.3;
    readonly step: 0.2;
    readonly gate: 0.5;
    readonly enforce: false;
    readonly note: "成熟度（v2.2 E6）：A(0)=A0；每次跨日再现 +step（上限 1.0）；只有 A≥gate 才允许升格为 [原则]/[路径]；A<gate 不注入但参与打分（implicit priming）。enforce=false 时只记录不强制（M4 影子期）。**2026-09-14（P7 · D11）决策：保持 false，并把依据写在这里**——`maturation-scan` 实测**拦阻率 57.4% > 50%**，扫描器自己的判据是「翻 enforce 会**冻结升格**」⇒ 当前不可翻。**记录该决策的目的**：把 `false` 从「疑似遗漏的开关」变成「**有实测依据的选择**」，后来人不必重查。要翻转须先让拦阻率降到 50% 以下（信号源=activity.days30 / access.log 的观测窗口仍在积累）";
    readonly ledger: "audit/maturation.jsonl";
}): number;
/** 升格成熟度门（v2.2）：enforce=false（缺省，M4 影子期）时恒放行，只回带 A 供台账记录 */
export declare function maturationVerdict(A: number, enforce: boolean, params?: {
    readonly A0: 0.3;
    readonly step: 0.2;
    readonly gate: 0.5;
    readonly enforce: false;
    readonly note: "成熟度（v2.2 E6）：A(0)=A0；每次跨日再现 +step（上限 1.0）；只有 A≥gate 才允许升格为 [原则]/[路径]；A<gate 不注入但参与打分（implicit priming）。enforce=false 时只记录不强制（M4 影子期）。**2026-09-14（P7 · D11）决策：保持 false，并把依据写在这里**——`maturation-scan` 实测**拦阻率 57.4% > 50%**，扫描器自己的判据是「翻 enforce 会**冻结升格**」⇒ 当前不可翻。**记录该决策的目的**：把 `false` 从「疑似遗漏的开关」变成「**有实测依据的选择**」，后来人不必重查。要翻转须先让拦阻率降到 50% 以下（信号源=activity.days30 / access.log 的观测窗口仍在积累）";
    readonly ledger: "audit/maturation.jsonl";
}): Verdict;
/** v2.2 统一打分（E 层）：score = α_rel·relevance + α_imp·importance + α_rec·recency（口径见 criteria.surface.score） */
export declare function layeredScore(input: {
    relevance: number;
    importance: number;
    recency: number;
}): number;
export declare function importanceOf(line: string): number;
