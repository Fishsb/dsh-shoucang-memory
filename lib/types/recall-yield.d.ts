/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export declare const SWITCH_THRESHOLD = 2;
/**
 * 一次**轮级**判定的三态（与 `switchFromJudgements` 的口径同源，**不新造第三套词表**）：
 *   · `'helped'`     —— 有实质进展 ⇒ 归零（线索没变弱）；
 *   · `'not-helped'` —— 确实没帮上 ⇒ 递增（这才是该换向的形态）；
 *   · `'unjudged'`   —— 模型说**判不准** ⇒ 计数**不动**（与"缺席"等价处理）。
 */
export type YieldVerdict = 'helped' | 'not-helped' | 'unjudged';
/** 一次折减的全部证据（**唯一驱动者只有 `verdict`**） */
export interface YieldEvidence {
    /** **轮级模型判** —— 唯一有权驱动换向计数者；缺席 = 未判 = 不驱动 */
    verdict?: YieldVerdict;
    /**
     * **词面代理**（上一步回复是否回引材料主题词）。
     * ⚠ **仅观测，不参与 `zeroGain`**：它实测恒 false（true=0/3119），且测的是"词面巧合"
     *   而非"材料被用上"（仓内已有实证）。保留它只为在 `reason` 里解释"为什么没换向"。
     */
    echoed?: boolean | null;
}
/** 本次折减的**信号来源**（落审计，供事后分辨"这条判定依据的是什么"） */
export type YieldSignal = 'verdict' | 'echo' | 'none';
/** 折减理由（**可机检的输入量可见化**；不做兜底推断） */
export type YieldReason = 'verdict-helped' | 'verdict-not-helped' | 'verdict-unjudged' | 'echo' | 'no-evidence';
export interface YieldFolding {
    /** 折减后的连续零增益计数（`0` = 本轮有正向证据） */
    zeroGain: number;
    /** **哪个信号**驱动了本次折减 */
    signal: YieldSignal;
    /**
     * **本次是否真的产生了一次判定**（`false` ⇒ 计数与出口**都不动**）。
     * ⚠ 观测面用它区分「**没进展**」与「**没判**」—— 这正是 D5 那次哑火被掩盖的原因
     *   （v 恒真的"有动作"让两种情形在读数上同形）。
     */
    judged: boolean;
    /** 可机检的折减理由 */
    reason: YieldReason;
}
/**
 * **收益折减的单一实现**（纯函数 · 零 IO · 零抛出）。
 *
 * 语义（**只有 `verdict` 驱动**）：
 *   · `verdict:'not-helped'` ⇒ `zeroGain + 1`（**幂等由调用方按轮去重** —— 同一轮只 +1）；
 *   · `verdict:'helped'`     ⇒ `0`；
 *   · `verdict:'unjudged'` / 缺席 ⇒ **保持不动**（`judged:false`），`reason` 如实标来源。
 *
 * @param prev 上一步/上一轮的连续零增益计数
 * @param ev   `verdict` = 轮级模型判（唯一驱动者）；`echoed` = 词面代理（**仅观测**）
 */
export declare function foldZeroGain(prev: number | undefined, ev: YieldEvidence): YieldFolding;
/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料）
 *  ⚠ 调用方**必须先判 `judged`**：未判时不得出换向（本函数只看计数，不知道"有没有判过"）。 */
export declare function shouldSwitchSource(zeroGain: number | undefined, threshold?: number): boolean;
/** 回流行的判别 type（**唯一拼写处**，读侧复用同一常量，防两处漂移） */
export declare const YIELD_VERDICT_TYPE = "yield.verdict";
/**
 * **会话短码的单一实现**（2026-09-23 · ACT-363 · 复验抓出的**键错配真缺陷**）。
 *
 * ⚠ **为什么必须有唯一实现**：真机 `agent.id` 是**长形** `session-<uuid>`（活体面板实测
 *   `sysBlockLastSid="session-7de99a"` + 轨迹 `renSame`）。此前**两侧各写一份归一化且口径相反**：
 *     · 审计/写侧（`mcl.ts` 全文、`harvest-access.mjs:68`）：`.slice(0, 8)` ⇒ `7de99ad0`
 *     · 回流读侧（旧 `mcl.ts:588`）：`.slice(-8)` ⇒ **`9fbca42b`**
 *   ⇒ 同一会话算出**两个不同键** ⇒ 回流**永不命中**。实测反证：喂长形读不到，喂短形才读到。
 *   而它 **fail-closed**（未判 ⇒ 计数不动、不换向）⇒ **不报警，只静默失效** ——
 *   正是本仓「接线≠抵达」型假绿里最难看见的一类。
 *
 * 语义：剥 `session-` 前缀后取**前 8 位**（与全部审计行口径一致，跨侧通用）。
 * 幂等：入参已是短形时 `slice(0, 8)` 恒等 ⇒ 写侧重复归一不改变结果。
 */
export declare function shortSidOf(raw: unknown): string;
/**
 * **收益取样的确定性先筛**（2026-09-23 · ACT-363 · 复验抓出的**第二处**缺陷）。
 *
 * ⚠ **为什么必须有它**（旧实现的真缺陷，实测复现）：`deepsleep-run.ts:209` 原为
 *   `rows.sort((a,b) => idleSteps(b) − idleSteps(a)).slice(0,10).reverse()`。
 *   而 `idleSteps` 被采集器封顶在 `YIELD_NEXT_N = 3` ⇒ 实测分布 `{0:948, 1:20, 2:26, 3:5739}`
 *   —— **85.2% 并列最大值** ⇒ 排序键**饱和**，`Array#sort` 稳定 ⇒ `slice(0,10)` 取到的是
 *   **最老的 10 行**（实测全部来自 2026-09-15），而**不是**"最近/最相关"的。
 *   ⇒ 写侧 `lastSid = rows[last].sid` 于是**恒指向已死会话**（实测 `6be5ac2e`，末次活动 09-16）
 *   ⇒ 回流行写进台账，**活会话永远读不到**（读侧按自己的 sid 取，**跨会话不继承**）
 *   ⇒ 即使 sid 口径修好，回流**仍然落空**。这是"通道建成 ≠ 抵达"的第二层。
 *
 * 语义（沿用本件既有注释 `deepsleep-run.ts:205-208` 已写明的意图，**只把实现对齐它**）：
 *   ① **先筛**：`idleSteps > 0`（注入后**真有动作**的轮才谈得上"帮没帮上"——注释原文
 *      「信息量取决于取样」，实测有动作者占 13.2%，`idleSteps:0` 的模型只能判 `null`）；
 *   ② **再按时间序取最近 n 条**（`lastSid` 因此落在**活会话**上，回流才有接收方）。
 *
 * ⚠ 不按 `idleSteps` 排序：该键已饱和（85% 并列），排序无判别力，只会引入稳定排序的
 *   **首个先验**（即"最老"）—— 这正是旧实现的失效机制。
 */
export declare function sampleYieldRounds<T extends Record<string, unknown>>(rows: readonly T[], n?: number): T[];
export interface YieldVerdictRecord {
    /** 会话短码（经 `shortSidOf` 归一 —— **两侧同源**，否则读不到） */
    sid: string;
    /** 该轮的三态判定 */
    verdict: YieldVerdict;
    /** 该轮序号（与 `judgeYieldRounds` 的 `i` 对齐，供对账） */
    roundIndex?: number;
    /** 该轮注入的材料字符数（形态） */
    injectedChars?: number;
    /** 该轮注入后模型实际调用的工具数（**只记个数，不记名字**） */
    nextToolsN?: number;
}
/**
 * 拼一条回流事件（**纯函数**）。返回对象可直接交给 `envelopeEvent(o, YIELD_VERDICT_TYPE)`。
 * 语义纪律：`type` 用 `yield.verdict`（与 `mcl.*` / `eval.decision` 同族命名法）。
 */
export declare function yieldVerdictEventOf(r: YieldVerdictRecord): Record<string, unknown>;
/** 一轮待判的检索（**只带判定所需的最小事实**，不塞原文）。 */
export interface YieldRound {
    /** 回合序号（0 起；用于把判定结果对回去）。 */
    i: number;
    /** 该轮注入的材料字符数（0 = 没注入任何材料，本身就是强线索）。 */
    injectedChars: number;
    /** 材料是否被后续动作引用（**旧信号**；实测恒 false ⇒ 只能作旁证，不能作主判据）。 */
    cited: boolean;
    /** **注入之后模型实际调用了哪些工具**（新取证信号；ASCII 工具名，来自 `yield-rounds.jsonl`）。 */
    nextTools: readonly string[];
    /** 该轮之后模型做了什么（**可选**：转录摘要，当前采集层只落工具名 ⇒ 通常为空）。 */
    nextAction?: string;
}
/** 构造收益判定请求（**纯函数**：只拼文本）。 */
export declare function buildYieldRequest(rounds: readonly YieldRound[]): string;
export interface YieldJudgement {
    i: number;
    /** `true` 帮上了 · `false` 确实没帮上 · `null` 判不准（**未判**） */
    helped: boolean | null;
    why: string;
}
/**
 * 严格解析（**不猜、不兜底**）：必须是一行 JSON **数组**，每项含数值 `i`；
 * `helped` 只接受 `true|false|null`。任一项不合法 ⇒ **整体 `null`**
 *   （宁可整批判"未判"，也不接受半解析 —— 半批会静默改变换向链的长度）。
 */
export declare function parseYieldJudgements(text: string): YieldJudgement[] | null;
/**
 * 由**语义判定序列**出换向信号（替代/并列于计数法）。
 * 口径：**只有明确的 `false` 累积**；`true` 或 `null`（未判）都**打断链** ⇒ 保守不换向。
 * @param threshold 连续多少个明确 `false` 才换（与计数法同缺省 2 —— 语义不同，但行动级判据一致）
 */
export declare function switchFromJudgements(judgements: readonly YieldJudgement[], threshold?: number): boolean;
/** 把一次模型判定映射为回流三态（**纯函数**；`null`（判不准）⇒ `'unjudged'`，**不兜底成 not-helped**） */
export declare function verdictOfJudgement(helped: boolean | null | undefined): YieldVerdict;
/**
 * **由一批判定归约出"该轮"的单一态**（纯函数 · 2026-09-23）。
 *
 * 判因：回流是「**这轮该来源帮上没帮上**」的整体判断，不是逐条流水 ⇒ 须把 `judged[]` 归约成一条。
 * 口径（**保守**）：
 *   · `helped` 多于 `not-helped` ⇒ `'helped'`（该源仍有效，**不该换向**）；
 *   · `not-helped` 多于 `helped` ⇒ `'not-helped'`（该源变弱，可累积换向链）；
 *   · **平局 / 全为 null / 空批** ⇒ `'unjudged'`（**不兜底**——平局不能算"没帮上"）。
 */
export declare function tallyVerdictOf(judgements: readonly YieldJudgement[]): YieldVerdict;
/**
 * **回流写侧的纯装配**（2026-09-23 · 消费链拟态落地方案 §3.1）—— 把一批判定折成**一条**回流事件。
 *
 * 为什么放在本件（而不是 `deepsleep-run`）：该件实测 **600 行 ≥ `check-module-growth` 阈值 600**
 *   ⇒ 门禁判「未登记」红。门禁给出的正道是「**新功能应落新模块，而不是堆大旧模块**」
 *   （抬基线属 R3 须用户拍板）⇒ 装配逻辑归本件（纯函数区），调用方只留一行 IO。
 *
 * ⚠ **不新开 `.jsonl` 流**：`check-observability.mjs:153` 的 `BASELINE = 1` 只许减不许增
 *   （`eval-ledger.ts:10-13` 同一判因）⇒ 并入既有 `ledger.jsonl`，以 `type` 区分。
 * ⚠ **只落形态不落内容**（沿 `yield-rounds` 既有隐私决定）：只落 verdict 档位 + 计数，
 *   **不落 topics / 查询原文 / 材料正文**。
 * ⚠ 每轮**只写一条**（取该批判定的**多数态**）——回流是"这轮该来源帮上没帮上"，不是逐条流水。
 *
 * @param judgements 该批模型判定
 * @param rounds     该批轮次（供注入量与工具**个数**的形态汇总）
 * @param lastSid    本轮材料所属会话 id（取 `yield-rounds` 末行的 sid；空 ⇒ 写空 sid = 不可读）
 */
export declare function buildYieldVerdictEvent(judgements: readonly YieldJudgement[], rounds: readonly YieldRound[], lastSid: string): Record<string, unknown>;
