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
/**
 * **登记阈值的运行时读口**（2026-09-20 round 8）。
 *
 * 判因（真机实测，推翻我当时自己的分类）：`THRESHOLDS` 投影在 `src/` 内**零消费者** ——
 *   8 项登记项的 `probe` 指向**代码里的裸数值字面量**（`distill-write.ts` 的 `>= 0.66` /
 *   `deepsleep-tree.ts` 的 `>= 0.9` / `activity.ts` 的 `v >= 0.5 && v < 0.66` …）。
 *   ⇒ 改了注册表、跑了 `gen:criteria`、门禁全绿，而**行为零变化** —— 这正是「假旋钮」。
 *   （`check-hardcode` 恰恰**希望**常量集中，`check-threshold-registry` 只问「登记了没」，
 *    `check-field-usage` 只看 `CRITERIA_ROWS` 系的字段角色 ⇒ 三方**都不问"这个值被读了吗"**。）
 *
 * ⇒ 本函数是这类登记项**唯一合法的读口**：probe 必须能命中一处 `thresholdValue('id', …)` 调用，
 *   由 `scripts/check-threshold-control.mjs` 机检（零命中 ⇒ 红）。
 * ⚠ **不写第二份缺省**：`fallback` 只用于「注册表缺项/关闭态（null）」，其值须与注册表登记值一致
 *   （由 `check-threshold-registry` ④ 的 `read` 漂移检测守）。
 */
export declare function thresholdValue<T = unknown>(id: string, fallback: T): T;
/** 对象型阈值的取键读口（如 `activity.statusDays` 的 `warm`/`cold`/`archive`）。
 *  对象整值也有 `thresholdValue`，但消费点通常只需要其中一维 —— 本函数避免每处各写一遍取键与兜底。 */
export declare function thresholdParam<T = unknown>(id: string, key: string, fallback: T): T;
/**
 * **分裂律参数（R / K）的唯一读口**（2026-09-20 round 9）。
 *
 * 判因（真机实测 · 「登记了 ≠ 被消费」的第 N 例）：`ingest.granularity.splitLaw` 登记值
 * `{R:1000, K:6}` **在所有实现面都零消费者**：
 *   · `src/panel-observe.ts:440` 写死 `const R = 1000`（超限节统计）；
 *   · `src/distill.ts:162` 的 `DEFAULT_DISTILL_PROMPT` 把 `> 1000 字 / > 6 条` **写死在模板串里**；
 *   · `src/deepsleep-core.ts:262` 的 `DEEP_SLEEP_PROMPT` 同款写死 `> R=1000 字`。
 * ⇒ 改注册表 + `gen:criteria` + 门禁全绿，而**提示词与实际判据零变化** —— 又一个「假旋钮」。
 * ⚠ 它的投影支 `criteria-gate.json#granularity` 由 `gen-criteria` 生成（**真源**），
 *   但脚本面读者（`memory_write_gate` / `memory_health_check`）**只读 `R`/`K` 等顶层键**，
 *   从不读 `granularity.*` ⇒ 「投影里存在」不等于「有人按该支读」（`check-threshold-control` ③ 现按归属支验）。
 *
 * 本读口取的是**注册表真源**（`ingest.granularity.split-law` 行参数），与投影支同源；
 *   三个消费点全部改读它，故「改注册表即改行为」在此处**成立**。
 */
export declare function splitLawOf(): {
    R: number;
    K: number;
};
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
    conflict?: L0Conflict;
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
            readonly budgetChars: 1200;
            readonly cueDims: readonly ["scope", "task"];
            readonly cueDimRules: {
                readonly scope: "路径归一：`\\`→`/` · 去尾斜杠 · 折叠重复斜杠 · **不改大小写**（POSIX 敏感）";
                readonly task: "kebab：小写 · 空白/下划线→`-` · 折叠 `-` · 去首尾 `-`（CJK 原样保留）";
            };
            readonly cueDimNote: "★IR1 册二（2026-09-18）**契约描述现状**：声明维 = **读侧真会产出**的维（`panel-shared#sitCtx` 只填 `scope` + `task`）。原声明的 `subject`/`event` **已删** —— 实测**两侧皆不产**（写侧存量 0 条、读侧无产出点），留着就是「声明了却永不匹配」的假契约（与「契约须描述现状」同族）。值规则**单一实现**在 `src/cue-space.ts#CUE_VALUE_RULES`（本表只声明文案，防两处漂移）。**收编路径**：若模型反复写某未声明维（`cue.rejected` 审计会带键名），把它**显式登记**进本表 + 在 `cue-space` 加值规则 + 在读侧补产出点，再由 `check-cue-space`（B5 双向）守。";
            readonly ringOrder: readonly ["relation", "decision", "association", "fact", "value"];
            readonly topN: 3;
            readonly note: "**情境层（第三槽）**：环记录（`file=''`，无 md 投影）不进内容相关性面，而由**情境键匹配**（cue-driven）供给——依据是编码特异性（提取取决于「编码情境↔提取线索」匹配，非内容相似度）与前瞻记忆多进程框架（承诺/意图须线索驱动，纯战略监控在高负荷下系统性失败）。enabled=false 且 budgetChars=0 ⇒ **缺省零行为变化**（照抄 serendipity 槽先例）。cueDims 是**唯一维度声明处**（situation-key.ts 按它迭代，不另立名单）；ringOrder 按**环**排序（commitment 与 relation 同属 relation 环；episode 属 fact 环——故不按 kind 排，避免把两个语义层混进一张表）。**2026-09-14 P7 订正**：原先把 `value` 环排除在外，理由是「走图式层」——但图式层走的是 **md 投影行**，而 `valence` 记录是 `file=''` 的**环记录** ⇒ 实测它**两条路都不可达**（既不在恒定面、也不在 ringOrder）。现把 `value` 补进 ringOrder **末位**：只有 `file=''` 的 value 环记录（即 valence；`persona`/`principle`/`preference` 皆带 md 投影或不产出）能进，故不会挤占。**同时放弃原计划的 `alphaVal` 打分项**：`layeredScore` 的打分对象是**索引行**，索引行**没有 valence 信号**（valence 只存在于环记录 meta）⇒ 加它只能是恒 0 的**假旋钮**（仓内警示的「假可控」）。valence 的正确定位是**情境召回**，不是相关性权重。";
            readonly adaptive: true;
            readonly adaptiveNote: "S4-5（2026-09-14）：`true` ⇒ 情境槽 `topN` 由**活体环记录数**派生（clamp(ceil(√N),3,12)，实测 N=105 ⇒ 11）；`false` ⇒ 回退固定 `topN`。判因：固定 3 而库内环记录 105 条 ⇒ 命中率天花板 ≈3%，\"库越大经历面越稀释\"。";
        };
        readonly process: {
            readonly enabled: true;
            readonly carrierTag: readonly ["路径"];
            readonly topN: 3;
            readonly gate: "tag";
            readonly budgetChars: 300;
            readonly note: "S4-3（2026-09-14）**中层 process 槽**：任务级供给 —— 按标签取 `[路径]` 行（**不走内容相关性竞争**）。判因：人类三层结构里**中层是唯一没有专用通路的层**（`[路径]` 现经 R 层 gated 相关性召回，与其它内容争同一预算；且实测库内 `[路径]` 仅 5 条）。★2026-09-18 **启用**（原 enabled:false）：按域路由方案 P0-b —— task 路由 = 打开本槽（零新代码）。⚠ 原 note 称「运行时实现被前置重构阻塞（panel-shared 大模块冻结棘轮）」**该判断已过期**：实测 `src/dynamic-select.ts` 已有 `selectProcessLines`(:80-95) 且 `panel-shared.ts:551-553` 已有 `process`/`processRows` 消费点（S4-3 的动态面选行领域拆分已完成）⇒ 启用即生效，无需前置。额度语义：本槽行 **不吃 dynamic cap**（`dynamic-select.ts:145-154` 额外占位）⇒ 总额不再无界的前提是封顶只在 `budgetOf`（见 surface.injection.note）。★**Q4（2026-09-20）新增 `gate`**：`tag`（缺省）⇒ 旧行为（按标签取前 topN 条，**零行为变化**）；`task` ⇒ 按**离散任务键**（`situation-key#taskCueOf` 读侧产出）过滤行。**判因**：真机实测三个语义无关 query（三种长期记忆梳理／深睡蒸馏怎么触发／发布插件到 github release）得到**同一组 3 条** `[路径]` ⇒ 原注自称「任务型门控」与运行态不符（那是**位置门控**）。**当前只落结构、gate 保持 tag 不启用 task**——未决项：`[路径]` 行是 md 索引行**不带 cues**（cues 只在环记录 meta），任务键与行的对齐口径（借指针 § 对齐 / 退回 `recallIndex` 词法打分）属结构选择，未裁前启用即造第二个假旋钮。**硬约束**：本槽门控**不得复用** `surface.mcl.familiarThreshold`（0.55）——那是 dense 相似度量纲，与任务键的**有/无离散命中**不是同一件事（复用即量纲误用）。";
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
        readonly familiarThreshold: 0.58;
        readonly maxNudges: 1;
        readonly budgetChars: 600;
        readonly topK: 3;
        readonly note: "2026-09-11 阈值重校准（缺陷2）：旧值 0.65 在实测样本上**结构性不可达**——193 条 mcl-step 审计 sim 分布 max=0.634 / mean=0.5658 / p75=0.609 / p90=0.624，≥0.65 命中 **0 行** ⇒ 快通道恒为 0（快/慢分流退化为单一慢通道）。**2026-09-14 P7 二次重校准（D3）**：在 **936 条** sim 样本上按**预注册判据**（目标覆盖率 = 注册表原始意图 27.5%）取分位——实测 p50=0.513 / p60=0.529 / p70=0.548 / p72.5=0.548 / **p75=0.561** / p90=0.575 / max=0.662；扫阈值得 0.54→38.9% · **0.55→25.4%** · 0.56→25.1% · 0.57→11.9% · 0.58→**9.3%**（= 上轮值，实测远低于其自述的 27.5%）。取 **0.55**（最接近 27.5% 且落在拐点上）。回滚：**/set mclFamiliarThreshold 0.58**（全局 scheduler.json，热生效，无需重启）。**另一道门 hasHighConf 未放宽**（仍要求 mclGate 标签），故实际快通道触发率显著低于 25.4%。 **2026-09-15 复验（OPEN-1 · 判据未变）**：样本累积至 **2154 条** sim，按同一预注册判据（目标覆盖率 27.5%）重扫——p50=0.521 / p75=0.559 / p90=0.593；扫阈值得 0.54→39.1% · **0.55→27.5%**（距目标 **0.0pp**）· 0.56→24.9% · 0.57→17.0% ⇒ **0.55 仍是最优，维持不改**。工具：复用既有 **`scripts/mcl-calibrate.mjs`**（已扩展：含**预注册目标判据**与**真实可救回集**，报告态不入 CHECKS；⚠ 未另建新器 —— 规则 5 不从零造轮子）；**复检触发 = 近期带 `missReason` 样本 N≥300（现 120）**。⚠ 同期 `recall-diagnose` 的 **coarse** `advice` 给出 `lower-threshold`，与本**细校准相反** ⇒ **以本校准为准**（降 0.54 会**过冲注册意图 11.6pp**）。且降阈值**只能救 `below-threshold`**（`no-highconf` 在阈值判定**之前**已出局）⇒ 若要继续改善，须另立**召回层**项。<br>**★ 2026-09-20 round 10 第三次重校准 ⇒ 改为 0.58（本值生效）**：复检触发早已满足（带 `missReason` 行 **4217 条**，远超 N≥300 门槛）；同判据、同工具、**只换样本量 ⇒ 结论翻转**：120 条时 `T=0.55` 过线 **27.3%**（距目标 0.2pp ⇒ 判维持），**4217 条**时同一 `T=0.55` 过线 **42.1%（过冲 14.6pp）**，`T=0.58` 过线 **27.7%**（距目标 0.2pp）⇒ 取 **0.58**。扫描表：`0.50→79.8%` · `0.55→42.1%（旧值）` · **`0.58→27.7%（现值）`** · `0.60→22.3%` · `0.65→6.0%`。⚠ **同时印证两条仓内原则**：① coarse `advice`（给 `lower-threshold`）与细校准方向相反 ⇒ 代理指标非判据；② **低样本下的「最优」不可信** —— 120 条的「恰好命中 27.3%」是巧合级贴合，与 `S-P1b′` 的「纪元 3/10」（真值 46）**同类**。回滚：`/set mclFamiliarThreshold 0.55`（热生效）。";
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
