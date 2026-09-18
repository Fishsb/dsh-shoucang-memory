/**
 * 触发阈值回退的**单一来源**（2026-09-15 P0.1 实证修复 · 同日扩面订正）。
 *
 * 缺陷（实测）：全仓曾有 **8 处**硬编码 `|| 10800000`（3h）兜底，而真正生效的缺省来自
 *   `scheduler.ts` 的 zod `.default(TRIGGER.idleMs)` = **2700000（45min）** —— 同一个默认**两个来源**。
 *   且 zod 有 default ⇒ 配置**永不为 falsy** ⇒ 那 8 处兜底是**死代码**，连注释（多处"缺省 3h"）一并过期。
 * ⚠ **计数订正**：首轮只报了 4 处（`deepsleep-machine.ts`）—— 根因是检索用了**大小写敏感**的 `idleMs`，
 *   而 `deepSleepIdleMs` 的大写 `I` 不匹配 ⇒ **漏检 4 处**（`deepsleep.ts` ×2 · `distill-hooks.ts` ×2）。
 *   仓内原则「**模式派生集合先核对**」正是防这个：命中集必须显式列举，不能靠一次通配就下结论。
 * 修法（根部解决，**不改行为**）：回退一律引用注册表 ⇒ 默认值只有一处定义。
 *   放在本件（deepsleep-core）因它位于依赖链底部：machine / deepsleep / distill-hooks 三处都能 import。
 *   ⚠ 时间维的具体值将在 P1 双维水位里按预注册判据重新校准，本步**只统一来源、不动数值**。
 */
export declare const idleMsOf: (c: {
    deepSleepIdleMs?: unknown;
}) => number;
/**
 * **睡眠纪元标识**（S-P1a · 2026-09-15）：`epoch-<起时刻 ms>`。
 *
 * 语义（`docs/sleep-granularity-plan-2026-09-15.md` §5）：**纪元 = 上次睡眠成功 → 本次睡眠成功**的区间，
 *   **既是触发单位，也是度量单位**（R1 以它为样本）。
 *
 * ⚠ **对方案册的一处偏离（已记录）**：册中原写 `epoch-<单调序号>-<起时刻>`。实施时改为**仅用起时刻**——
 *   理由：单调序号在**重启后必须回放重建**（否则序号会回退），而回放本身要再引入一份状态与审计依赖；
 *   毫秒级起时刻**已唯一且天然有序**（同一毫秒不可能触发两次 —— 触发路径有 `m.deepSleepRunning` 并发闸 + 10min 巡检间隔）。
 *   ⇒ 用一个自带序的 id 换掉一份需要回放维护的计数器，属"**拒绝冗余**"取向。
 *
 * **命名避开 `epoch`**：该词已被 `supply-ledger.ts` 占用（per-session 去重窗口轮次）——
 *   仓内有 `audit-impl-drift` 专抓同名不同义（先例：`rewriteRowPointers` 被强制改名）。
 */
export declare const epochIdOf: (startedAt: number) => string;
/**
 * 纪元 id 的形状判据（**单一实现**：生成与校验共用，防两处正则漂移）。
 * ⚠ 收窄记录（2026-09-15 自纠）：初版写 `/^epoch-\d{10,}$/`（要求 ≥10 位）—— 但 `epochIdOf(1)`
 *   会产出 `epoch-1` ⇒ **生成器能产出自己校验不过的 id**，"单一实现"当场破功。
 *   放宽为 `\d+`：**凡生成器产出者必过校验**（真实调用传 `Date.now()`，自然 13 位）。
 */
export declare const EPOCH_ID_RE: RegExp;
/**
 * **双维触发决策表**（S-P1b · 2026-09-15）——`time` / `content` / `none`。
 *
 * 为什么抽成纯函数：与 `planDeepSleepVerdict` 同一理由 —— 判定若长在 `deepSleepCheck` 体内，
 *   单测无法驱动（触发还要求 `hottest > lastDeepSleepAt`，那需要把机器内部水位倒回过去），
 *   ⇒ 判据只能靠读代码断言。抽出来后**决策表本身可被穷举用例驱动**。
 *
 * 语义：**两维取 OR**。
 *   · 时间维到 ⇒ `time`（原行为，不变）
 *   · 时间维未到、但 `contentMin > 0` 且材料达标 ⇒ `content`（S-P1b 新增）
 *   · 否则 ⇒ `none`
 * ⚠ **等价性**：`contentMin <= 0` 时本表**恒等于**改造前的 `now - hottest >= idleMs` 判定
 *   （`content` 分支不可达）⇒ **缺省零行为变化**（这也是回归保护的判据）。
 */
export type TriggerDim = 'time' | 'content' | 'none';
export declare const planTriggerDim: (sinceHottestMs: number, idleMs: number, contentBytes: number, contentMin: number) => TriggerDim;
/**
 * **材料分片**（S-P1c · 2026-09-15）：把已按"面"分好的材料段贪心装进 ≤ `capChars` 的片里。
 *
 * 三条已决口径（**偏离方案册处在此声明**）：
 *  ① **段边界即语义边界**：材料本就按面装配（当天痕迹 / 现行清单 / 树节清单 / 遗忘候选 …），
 *     故"按**语义**切分"由**结构**天然满足，**不需要**再算相邻相似度低谷去求分界——
 *     方案册 AC-V.2 写的是"边界落在相似度低谷"，那是**没有现成分段**时的做法；此处有，故不额外引入 embedding。
 *  ② **永不切开单段**：一段是一件事，切开会让两片都判不准。单段超上限时**独占一片**（无法再语义细分）。
 *  ③ `capChars <= 0` ⇒ **单片段**，与改造前**逐字等价**（回归保护）。
 *
 * 返回 `string[][]`（片 → 该片的段数组），**保持段序**（顺序即材料优先级，不得打乱）。
 */
export declare function splitByCap(segments: readonly string[], capChars: number): string[][];
/**
 * **窗口内待消化材料量（字节）** —— S-P1b 内容水位（第二触发维）的度量。
 *
 * 口径（**显式声明，避免"看起来像"**）：`pending/` + `candidates/` 下 `.md` 文件中
 *   **mtime > since** 者的大小之和。它是"该被消化多少"的**代理**，不等于最终喂给模型的材料字符数
 *   （后者由 `gatherDeepSleepTraces` 分段装配、受各段预算裁剪）——故**阈值须按本口径校准**，
 *   不得与"材料字符数"混用（两口径不可比是仓内已登记的坑：`count-memory-lines` 首版口径之误）。
 *
 * 为什么在触发层用**文件统计**而不是真跑一遍采集：触发判据每 10min 被巡检调用一次，
 *   必须在**零 LLM、低 IO** 下可算（真采集要读文件内容并分段）。
 *
 * 失败一律收敛为 0（目录缺席/权限异常）⇒ 内容维视为"未达阈"，**退回纯时间维**，绝不影响既有行为。
 */
export declare function windowMaterialBytes(dirs: {
    pendDir: string;
    candidateDir: string;
}, since: number): number;
/**
 * 会话活跃状态机（Session Activity FSM）——深度睡眠「是否算停滞」的唯一判据源。
 *
 * 状态迁移：
 *   (新会话/任意事件) → RUNNING ──turn/end(completed)──► ENDED（开始停滞计时）
 *                          │                                  │
 *        无事件 ≥ probeAfterMs│                                  │ 所有会话停滞 ≥ idleMs
 *                          ▼                                    ▼
 *                    PROBING（采样 transcript 两次，比对 mtime/size）──► 触发深度睡眠
 *              ┌───────────┬────────────┬─────────────┬────────────┐
 *     输出在增长│ 无增长+会话还在│ 无增长+会话消失│ 探针不可用/异常│
 *              ▼           ▼            ▼             ▼
 *          RUNNING      SUSPECT      ENDED          ENDED
 *        (正常长任务)  (待复核，阻塞)  (异常退出)   (无法确认，正常睡)
 *                          │ 连续 confirm 轮无增长（或状态活跃但无增长=证据冲突）
 *                          ▼
 *                       STALLED（已确认卡住，不阻塞）
 *
 * 用户拍板口径（2026-09-08）：**只有确认「长线任务正在推进」才拦住睡眠**；其余（卡住/异常退出/探针不可用/
 * 探测异常）一律按停滞处理 → 正常睡眠（停滞计时沿用最后事件时刻，不再刷新成 now，否则会永远睡不着）。
 * 仅在采样窗口内「探测未决」时跳过本轮（最多延后一个巡检周期，10min）。
 */
export type SessState = 'running' | 'ended' | 'probing' | 'suspect' | 'stalled';
/** 深睡**当前阶段**（S3-6 · 2026-09-14）：把机器内部状态映射为一个**可读标签**，供 UI 一眼判断
 *  「没开 / 正在跑 / 探测中 / 会话活跃 / 可睡 / 等待 / 无会话」。
 *  **零新采集、零跨源依赖** —— 全部由既有字段派生（用户偏好：状态标签直接由实例自身状态映射）。 */
export type DeepSleepPhase = 'disabled' | 'running' | 'probing' | 'active' | 'eligible' | 'waiting' | 'idle';
/** 深度睡眠状态机快照（UI 已接线：deepsleep-share.ts 惰性桥接 → panel `GET /deepsleep` → client.js「深度睡眠」视图） */
export interface DeepSleepStatus {
    /** S3-6：当前阶段（派生见 `deepsleep-machine#getDeepSleepStatus`） */
    phase: DeepSleepPhase;
    /**
     * S-P1a（2026-09-15）**本纪元标识**（`epoch-<起时刻 ms>`；无纪元 ⇒ `null`）。
     * 面板可据此把「本轮深睡」与审计行对上（审计 `kind='deep-sleep'` 同带该字段）。
     */
    currentEpoch: string | null;
    /**
     * S-P1d（2026-09-15）**本纪元窗口起点**（ms；无纪元 ⇒ `null`）。
     * 与 `currentEpoch` 配对给出**起止区间**（止 = `lastDeepSleepAt`）—— AC-R0.5 的"当前纪元起止"。
     * ⚠ 该值在触发瞬间被**存进纪元箱**，不是每次现取 `traceSince()`：水位随即被推到 `now`，
     *   现取会拿到**新窗口**起点，使面板读数与审计 `epochSince` 不一致。
     */
    epochSince: number | null;
    enabled: boolean;
    idleMs: number;
    probeAfterMs: number;
    lastActivityAt: number;
    lastDeepSleepAt: number;
    running: number;
    ended: number;
    probing: number;
    suspect: number;
    stalled: number;
    nextEligibleAt: number;
    sessions: {
        sid: string;
        /** **完整 sid**（`session-<uuid>`）：面板富化（查 agent 拿工作区/标题、匹配蒸馏审计）必须用全量，
         *  `sid` 是 8 位显示编码，二者不可互相还原。2026-09-14 补。 */
        fullSid: string;
        state: SessState;
        lastEventAt: number;
        lastEndAt: number;
        probeResult?: string;
        /** **会话三块名**（2026-09-14 · 面板可读性，用户拍板）：`工作区 · 会话栏标题缩写 · 编码`。
         *  `workspace` = `agent.session.header.cwd` 末段；`title` = DSH 的 `session/title` 事件 `data.title`
         *  （**与宿主会话栏同源**，非本插件自造）；两者由深睡层**一次性富化并缓存**，取不到即空串（面板退化显示）。 */
        workspace?: string;
        title?: string;
    }[];
}
export interface SessRec {
    sid: string;
    state: SessState;
    lastEventAt: number;
    lastEndAt: number;
    probeAt: number;
    probeRound: number;
    stallRound: number;
    probeEvidence?: {
        rounds: number;
        samples: number;
        deltaBytes: number;
        alive: boolean;
        active: boolean;
        viaChildren?: boolean;
    };
    probeResult?: 'long-run' | 'stall' | 'suspect' | 'conflict' | 'exit' | 'no-transcript' | 'error';
}
export declare const DEEP_SLEEP_PROMPT: string;
/**
 * 深睡本轮是否算「已消化」（决定水位推进 or 回滚）——**单一实现**，供 runDeepSleep 与单测共用。
 *
 * 2026-09-11 实修（静默丢料根因）：原判据只按 `stop === 'completed' && out`，从不检查候选是否**真正落地**。
 * 当代理跑完但门禁把候选行**全数拒收**（attempted>0 && added===0，如 gate=all-rejected /
 * maturation-rejected / 尾部总门失败）时仍判 done → 调用方推进水位 → 被拒痕迹永久划出窗口 → 静默丢失。
 * 审计实证 2 轮（08:32:23.997Z attempted=3/added=0、08:48:10.129Z attempted=1/added=0）共丢 4 条候选行。
 *
 * 判定口径：
 *  - `stop !== 'completed' || !out` → 未完成 / 无产出 ⇒ failed（回滚重试，含 stop=error/aborted、JSON 解析失败）。
 *  - `app.gate === 'write_gate 未就位'` → 门禁脚本缺席（applyPrinciples 早返回，attempted 恰为 0）属
 *    **基础设施失败**，不得因 attempted===0 误判 done ⇒ failed。
 *  - `app.added > 0` → 有落地 ⇒ done。
 *  - `app.attempted === 0` → 代理本就无新原则/路径提案（真·空轮）⇒ done。
 *  - `attempted>0 && added===0` → 100% 拒收 = 材料损失 ⇒ failed（水位回滚、同批下轮重试）。
 *
 * ⚠ G-19 修正（2026-09-12）：上述判据**只消费 principles 一个通道**（`app`）。深睡同轮另有
 *   profileOps / pointerOps / treeOps / forgetOps 四个写入通道，其结果**从不进入判据** ⇒
 *   「纯 profileOps/指针/树/遗忘 轮且全数失败」时 `app.attempted === 0` ⇒ 误判 landed:true
 *   ⇒ 水位推进 ⇒ 那批材料永久关在窗外（静默丢料）。Rex 实测约占 9.5%~14.3% 轮次。
 *   架构修法：**判据必须消费完整轮次结果，而非其子集**（与 G-16 同源——判据只认真实完整产出）。
 *   取向：宁可重试（failed，幂等、可观测），不可静默丢料（landed，无声无息）。
 */
export declare const COMMIT_FAILED_GATE = "\u843D\u76D8\u5F02\u5E38";
/** 除 principles 外四通道的轮次汇总（G-19）：`tried`=该通道有提案且未落地数，`done`=成功落地数。 */
export type DeepSleepOtherChannels = {
    tried: number;
    done: number;
};
export declare const deepSleepLanded: (stop: unknown, out: unknown, app: {
    attempted: number;
    added: number;
    gate: string;
}, other?: DeepSleepOtherChannels) => boolean;
export type DeepSleepFailPolicy = 'retry' | 'graded';
export declare const DEFAULT_FAIL_POLICY: DeepSleepFailPolicy;
export declare const DEFAULT_FAIL_MAX_ROUNDS = 3;
export declare const planDeepSleepVerdict: (landed: boolean, policy: DeepSleepFailPolicy, failStreak: number, maxRounds: number) => {
    verdict: "done" | "failed";
    release: boolean;
    reason: string;
};
export declare const liveFailPolicy: () => {
    policy: DeepSleepFailPolicy;
    maxRounds: number;
};
export declare const deepSleepReplayable: (o: {
    kind?: unknown;
    error?: unknown;
    stop?: unknown;
    result?: unknown;
    landed?: unknown;
}) => boolean;
export declare const commitPrinciples: (tmpPath: string, targetPath: string) => {
    ok: boolean;
    err?: string;
};
export declare const DISCARD_SNAPSHOT_CB_N = 3;
/**
 * 写方决策表（单测直接驱动）：① maxSeq<=0 ⇒ 不写（禁写 0）；② maxSeq < prevSeq ⇒ 不写（禁写回退值）；③ 否则写。
 * `snapshotUnavailable` 是**熔断计数的唯一推进条件**（G-20 二修，cody 2026-09-12 指出）：
 *   只有「快照真的拿不到」才算一轮；「快照正常但序号空间重排」**不计**（它不烧 LLM，也不是故障，
 *   且读方已按语义 B 判为「保持全量」——若让它推进计数，连续 3 轮零写入就会撞上熔断被跳过，
 *   与语义 B「要重蒸」直接冲突 ⇒ 会话变「永久不蒸」）。
 */
export declare const planDiscardWrite: (maxSeq: number, prevSeq: number, consecutiveUnavailable: number) => {
    write: boolean;
    circuitBroken: boolean;
    snapshotUnavailable: boolean;
    reason: string;
};
/**
 * 读方决策表（G-20 补正的**主修点**）：双证失效后是「降级到当前 live 边界」还是「全量重蒸」。
 * 为何读方才是主修：**回退 100% 由读方决定**——旧码四个作废分支全部 `return null`，而调用方是
 *   `const lastSeq = baseline ? baseline.lastSeq : 0`，null ⇒ lastSeq=0 ⇒ **整窗重蒸**。写方写什么都与回退无关。
 *   实证（Cody 实测）：restartFrom = 114654 / 811483 / 339724 三条健康边界值写进去了，下一轮仍从 7~8 开始。
 * 判据：`maxSeq >= prevSeq` ⇒ 同一（或已增长的）seq 空间 ⇒ 跳到当前边界（下方注释 :662-668 声明的**语义 A**，
 *   是代码自己选过的语义）；`maxSeq < prevSeq` ⇒ 序号空间已重排/缩小，旧边界不可寻址 ⇒ **保持全量**（语义 B，
 *   此情形新空间通常只有几百条，便宜）。B 才是违背声明的实现，故按 A 修不需要用户拍板。
 */
export declare const planDegradedBaseline: (maxSeq: number, prevSeq: number) => {
    degrade: boolean;
    reason: string;
};
/**
 * G-4a（2026-09-12）：**跳过分支（below-min / prescan-no-signal）的水位推进判据**——抽成纯函数并导出。
 * 背景（实测，审计 800 行）：段 dispatch 失败后水位保留，但下一轮若命中跳过分支，旧码直接
 *   `writeWatermark(sid, maxSeq)` ⇒ 一步跨过未消化段 ⇒ 该段**永不重扫**（50 段中 35 段如此，真重扫仅 4 段）
 *   ⇒ `dispatch-failed-forced` 恒为 0 的真因是「重试从未累积到第 2 次」，而非计数没持久化。
 * 语义：
 *   · 无未消化段 ⇒ 照旧推 maxSeq（`skip-normal`，保持跳过分支原有行为，不引入死循环）；
 *   · 有未消化段 ⇒ **不推**（保留基线，把窗口留给下一轮再看一次），连续扣满 SKIP_HOLD_MAX 轮仍无进展
 *     ⇒ 放弃并推 maxSeq（`skip-abandoned-after-hold`，显式记账）——**没有这条就会死循环**：
 *     某会话内容长期低于门槛时，每轮都会重扫同一窗口。
 */
export declare const SKIP_HOLD_MAX = 3;
export declare const planSkipWatermark: (hasUndigested: boolean, holdRounds: number, maxSeq: number) => {
    write: boolean;
    seq: number;
    reason: string;
    holdRounds: number;
};
/**
 * 册三（2026-09-19）：**段级水位判据（失败三态 ⇒ 是否推进）**——单一实现，纯函数可单测。
 *
 * 判因（真机实测）：`writeDispatch` 原先只有一个 `failed` 计数，**同时**承载四类完全不同的东西——
 *   ① I/O / 原子写 / 子进程异常（该重试）；② 模型给的地址/格式不合规（内容**已被裁决**，不该重试）；
 *   ③ 地址不存在需人工建锚（该进队列，不该锁死）；④ 册零新增的「孤儿指针拒收」（同上）。
 *   而水位规则是 `failed > 0 ⇒ 不推`（`distill-agent.ts` A1 分支）⇒ ②③④ 都能**永久锁住水位**：
 *   实测近 1h `distill-run` **30/30 = 100%** 带 `failed>0`，同一段被反复重蒸（水位冻在 2 / 808 / 0）。
 *
 * 三态语义（**只有「未消化」能扣水位**）：
 *   · `undigested === 0` ⇒ **推进**（内容已裁决；`needsAnchor`/`rejected` 只是"没落进去"，不是"没看"）
 *   · `undigested > 0`   ⇒ 保留水位重试；同段累计满 `maxRetry` 次 ⇒ **强制推进**并落审计（有界，不是无界）
 * 返回 `attempt` 为**本轮之后**的累计次数（由调用方持久化，见册四）。
 */
export interface SegmentOutcome {
    added: number;
    rejected: number;
    undigested: number;
    needsAnchor: number;
}
export declare const planSegmentWatermark: (outcome: SegmentOutcome, attempt: number, maxRetry: number) => {
    advance: boolean;
    forced: boolean;
    attempt: number;
    reason: string;
};
export interface DiscardWatermarkDeps {
    writeWatermark(sid: string, lastSeq: number, agent: any): void;
    audit(o: Record<string, unknown>): void;
    log(m: string): void;
    versionOf?(agent: any): number | undefined;
}
/**
 * 水位作废收尾的可单测驱动（`discardWatermark` 是闭包内 const，无 export，单测到不了；与 commitPrinciples 同手法）。
 * 返回 `wrote=false` 表示**未写水位**（快照不可用），读侧语义等价于「无水位」——绝不再写 lastSeq=0 的行。
 */
export declare const runDiscardWatermark: (sid: string, reason: string, agent: any, wm: any, consecutiveUnavailable: number, deps: DiscardWatermarkDeps) => {
    wrote: boolean;
    circuitBroken: boolean;
    reason: string;
    streak: number;
    maxSeq: number;
};
/**
 * 水位基线：`degraded=false` = 双证可信；`degraded=true` = 降级基线（跳到当前 live 边界，非可信但**不回退到 0**）。
 *
 * ⚠ `degraded: true` **只在本轮有效，不会被持久化，也永远不会出现在水位文件里**——不要为它加防御代码：
 *   ① 降级基线是 `resolveWatermarkBaseline` 的**返回值**，仅用于喂给本轮 `baseline ? baseline.lastSeq : 0`；
 *   ② 落盘路径只有一条：`discardWatermark` → `writeWatermark`，而它由 `planDiscardWrite` 把关——
 *      `maxSeq >= prevSeq` 才写，且写的是**带双证的 maxSeq**（不是 degraded 标记）；
 *   ③ 故下一轮 `readWatermarks` 读到的总是可信行，**不存在「把不可信洗成可信」的路径**；
 *   ④ 这也是为什么**不加** `degradedFrom` 字段：lastSeq / formatVersion / fp 都是当时实测值，
 *      下轮双证校验会重新验一遍；加字段要在已跑通的水位格式上动刀，收益（元信息可见）不抵风险（解析分叉）。
 *      （G-20 审查结论，2026-09-12，team-lead 核准）
 */
export interface WmBaseline {
    lastSeq: number;
    degraded: boolean;
    reason: string;
    formatVersion?: number;
    fp?: string;
}
export interface BaselineDeps {
    /** 返回本轮作废收尾后的 live 边界（maxSeq）与是否落了水位 */
    discard(sid: string, reason: string, agent: any, wm: any): {
        maxSeq: number;
        wrote: boolean;
    };
    versionOf(agent: any): number | undefined;
    fingerprintAt(agent: any, seq: number): string | null;
}
/**
 * 读方可单测驱动（G-20 补正主修点；`resolveWatermark` 是闭包内 const，无 export，与 commitPrinciples 同手法）。
 * 返回 null 仍表示「无基线 / 需全量」——但**只在真正需要全量时**（水位缺失、seq 空间回退、快照不可用）。
 * 关键不变量：双证失效且 live 边界未回退时，**不得返回 null**（旧码返回 null ⇒ 调用方把 lastSeq 打成 0 ⇒ 整窗重蒸）。
 */
export declare const resolveWatermarkBaseline: (sid: string, wm: any, agent: any, deps: BaselineDeps) => WmBaseline | null;
