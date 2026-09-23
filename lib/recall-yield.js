// recall-yield.ts — S4/D1（2026-09-14）：**检索收益与停止准则**（消费链条）
//
// 判因（S4 方案 §4.4；人类依据见 `docs/human-task-loop-vs-embodied-ai-2026-09.md` §1.3）：
//   人类按**边际价值**停止检索 —— 当某来源的边际收益降到低于环境平均，就**离开该斑块**。
//   而本插件此前**没有任何停止判据**：慢通道注入材料后，模型引用与否只落审计，
//   **不产生任何行为后果**（再引导上限 1 次即放行）。
//
// 边界（照仓内"工具只提案不判"的先例）：本件**只出信号**（`switchSource`），
//   **不决定换向到哪** —— 选行归 `ring-supply` / `recallIndex`。判据在此，决策留给调用方与模型。
//
// 纯函数、零 IO、零依赖、零抛出 —— 可独立断言。
//
// ══ 2026-09-23 圆桌会议定稿（消费链拟态落地方案 §3）——**判断者替换，不是代理替换** ══
//
// **D5（2026-09-22）之后本链结构性哑火的真根因**（全三档台账实测）：
//   `acted` 取自 `agent.session.snapshotEvents()`（`mcl.ts:723`）**整个会话**，判据是
//   `evs.some(e => e.type === 'tool/call')` ⇒ 语义 =「**本会话是否曾经调用过任何工具**」。
//   会话内调过一次即**恒 true**（实测 `acted=true` 1356 / `false` **0**）⇒ 无条件归零
//   ⇒ `zeroGain` 恒 0 ⇒ `switchSource` 永假 ⇒ `mcl-switch` 结构性不可达。
//   **实证（全三档）**：D5 前 `zeroGain` 有 39 种取值 / `≥2` 行 180 / `switchSource=true` 114 行；
//   D5 后 judge 2570 行 `zeroGain` 全为 0。⇒ **不是"从未触发"，是 D5 把它关死的**。
//
// **为什么不再换一个确定性代理**（本仓已自证）：`nextTools` 口径实测 85%–99% 非空，
//   它是**采集器窗口内**"有没有动作"；把 `acted` 的窗口修对，只是把一个**会话级弱代理**
//   换成**窗口级弱代理** ⇒ 仓内反复剿灭的「**假绿换假绿**」。
//   同仓 `recall-yield` 旧注释早已写死结论：**「真正的收益判据在 `judgeYieldRounds`（子代理语义判）」**。
//
// **新语义（用户拍板原则：「在代码或者向量模型不足够做判断的时候要积极介入模型判断」）**：
//   · **唯一驱动者 = 轮级模型判**（`verdict`）—— 它答的是"这一步有没有实质进展"这类**语义**问题；
//   · **词面代理 `echoed` 仅观测、不驱动**（它实测恒 false 过，且是词面巧合，非"材料被用上"）；
//   · **未判 ⇒ 计数不动**（既不归零也不递增）—— fail-closed，**不据"没有证据"换向**；
//   · **计数推进单位 = 轮**（不是步）—— 与 M3a「高频那一半必须廉价」自洽：步内只筛候选、不动计数。
//
// ⚠ **确定性边界**（禁调模型、须可机检，见方案 §3.3）：水位/格式门/隐私红线/账目守恒/
//   幂等与原子性/路径白名单与预算/cue 归一 —— **模型结论不得进入其中任何一门**。
/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export const SWITCH_THRESHOLD = 2;
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
export function foldZeroGain(prev, ev) {
    const n = Math.max(0, Number(prev) || 0);
    const v = ev?.verdict === 'helped' || ev?.verdict === 'not-helped' || ev?.verdict === 'unjudged' ? ev.verdict : undefined;
    if (v === 'helped')
        return { zeroGain: 0, signal: 'verdict', judged: true, reason: 'verdict-helped' };
    if (v === 'not-helped')
        return { zeroGain: n + 1, signal: 'verdict', judged: true, reason: 'verdict-not-helped' };
    if (v === 'unjudged')
        return { zeroGain: n, signal: 'verdict', judged: false, reason: 'verdict-unjudged' };
    // 无 verdict：**绝不退化成"没进展"**（那正是 D5 之前 `echoed` 恒 false 时犯的错 —— 只递增不归零）
    const echoed = ev?.echoed === true || ev?.echoed === false ? ev.echoed : null;
    if (echoed !== null)
        return { zeroGain: n, signal: 'echo', judged: false, reason: 'echo' };
    return { zeroGain: n, signal: 'none', judged: false, reason: 'no-evidence' };
}
/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料）
 *  ⚠ 调用方**必须先判 `judged`**：未判时不得出换向（本函数只看计数，不知道"有没有判过"）。 */
export function shouldSwitchSource(zeroGain, threshold = SWITCH_THRESHOLD) {
    return (Number(zeroGain) || 0) >= Math.max(1, threshold);
}
/* ══ 回流载体的**拼行**（纯函数 · 零 IO） ═══════════════════════════════════════════════
 * 判因（方案 §3.1 · 实测）：步内出口与离线模型判定之间**根本不存在回流通道** ——
 *   `mcl-switch` 10 行（全在 D5 前）与 `yieldSwitchSemantic=true` 14 次**跨日错开**，
 *   配对检验 60s → 0/10、3600s → 0/10（86400s 的 10/10 是同日巧合）；
 *   且 `src/mcl.ts` 当时**全文零文件读**（无任何落盘读取调用）⇒ 它物理上不可能读离线产物。
 *
 * ⚠ **为什么不新开 `.jsonl` 流**（与 `eval-ledger.ts:10-13` 的既有决定同一判因）：
 *   `scripts/check-observability.mjs:153` 的 `BASELINE = 1` —— **观测流登记表只许减不许增**，
 *   新开流会被该门判 FAIL。⇒ 并入**既有统一台账** `knowledgeRoot()/audit/ledger.jsonl`，
 *   以 `type` 区分（与 `mcl.*` / `eval.decision` / `score.shadow` 同法）。
 *
 * ⚠ **只落形态不落内容**（沿 `yield-rounds.jsonl` 的既有隐私决定，`check-journal-privacy` 钉死）：
 *   **不落** topics/查询原文/材料正文，只落 verdict 档位与计数。
 */
/** 回流行的判别 type（**唯一拼写处**，读侧复用同一常量，防两处漂移） */
export const YIELD_VERDICT_TYPE = 'yield.verdict';
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
export function shortSidOf(raw) {
    return String(raw || '').replace(/^session-/, '').slice(0, 8);
}
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
export function sampleYieldRounds(rows, n = 10) {
    return rows
        .filter((r) => (Number(r?.idleSteps) || 0) > 0)
        .slice()
        .sort((a, b) => String(a?.at ?? '').localeCompare(String(b?.at ?? '')))
        .slice(-Math.max(1, n));
}
/**
 * 拼一条回流事件（**纯函数**）。返回对象可直接交给 `envelopeEvent(o, YIELD_VERDICT_TYPE)`。
 * 语义纪律：`type` 用 `yield.verdict`（与 `mcl.*` / `eval.decision` 同族命名法）。
 */
export function yieldVerdictEventOf(r) {
    const v = r.verdict === 'helped' || r.verdict === 'not-helped' ? r.verdict : 'unjudged';
    return {
        type: YIELD_VERDICT_TYPE,
        kind: 'yield-verdict',
        sid: shortSidOf(r.sid),
        verdict: v,
        roundIndex: Number.isFinite(Number(r.roundIndex)) ? Math.max(0, Number(r.roundIndex)) : 0,
        injectedChars: Math.max(0, Number(r.injectedChars) || 0),
        nextToolsN: Math.max(0, Number(r.nextToolsN) || 0),
    };
}
/** 构造收益判定请求（**纯函数**：只拼文本）。 */
export function buildYieldRequest(rounds) {
    const lines = [];
    lines.push('你在判定「检索是否真的帮上了」。下面是若干**疑似零收益**的回合（旧信号"材料未被引用"）。');
    lines.push('⚠ 注意：**旧信号"未被引用"实测恒为 false、没有判别力** —— 所以别只看它，**要看注入之后模型实际做了什么**。');
    lines.push('**未被引用 ≠ 没帮上**：模型可能已从材料得到方向、随后用别的方式解决了，或材料证实了它原本的判断。');
    lines.push('请逐轮判断：**这一轮注入的材料，对随后的动作有没有实质帮助**？');
    lines.push('');
    for (const r of rounds.slice(0, 20)) {
        lines.push(`- 回合 ${r.i}：注入 ${r.injectedChars} 字符 · 旧信号(被引用)=${r.cited ? '是' : '否'}`);
        lines.push(`    注入后调用的工具（按序，最多 3 个）：${r.nextTools.length ? r.nextTools.join(' → ') : '**（没有调用任何工具）**'}`);
        if (r.nextAction)
            lines.push(`    后续动作摘要：${String(r.nextAction).slice(0, 160)}`);
    }
    lines.push('');
    lines.push('只输出一行 JSON 数组（每轮一项，顺序不限，i 必须与上面一致）：');
    lines.push('[{"i":0,"helped":true,"why":"≤40字"},{"i":1,"helped":false,"why":"≤40字"}]');
    lines.push('判不准就把该项的 helped 写成 null（**不要猜**）。');
    return lines.join('\n');
}
/**
 * 严格解析（**不猜、不兜底**）：必须是一行 JSON **数组**，每项含数值 `i`；
 * `helped` 只接受 `true|false|null`。任一项不合法 ⇒ **整体 `null`**
 *   （宁可整批判"未判"，也不接受半解析 —— 半批会静默改变换向链的长度）。
 */
export function parseYieldJudgements(text) {
    const m = /\[[\s\S]*\]/.exec(String(text || ''));
    if (!m)
        return null;
    let arr;
    try {
        arr = JSON.parse(m[0]);
    }
    catch {
        return null;
    }
    if (!Array.isArray(arr) || !arr.length)
        return null;
    const out = [];
    for (const x of arr) {
        const o = x;
        if (typeof o?.i !== 'number' || !Number.isFinite(o.i))
            return null;
        const h = o.helped;
        if (!(h === true || h === false || h === null))
            return null;
        out.push({ i: o.i, helped: h, why: String(o.why || '').slice(0, 80) });
    }
    return out;
}
/**
 * 由**语义判定序列**出换向信号（替代/并列于计数法）。
 * 口径：**只有明确的 `false` 累积**；`true` 或 `null`（未判）都**打断链** ⇒ 保守不换向。
 * @param threshold 连续多少个明确 `false` 才换（与计数法同缺省 2 —— 语义不同，但行动级判据一致）
 */
export function switchFromJudgements(judgements, threshold = SWITCH_THRESHOLD) {
    const need = Math.max(1, threshold);
    let run = 0;
    for (const j of judgements) {
        if (j.helped === false) {
            run++;
            if (run >= need)
                return true;
        }
        else
            run = 0; // true 或 null（未判）一律打断
    }
    return false;
}
/** 把一次模型判定映射为回流三态（**纯函数**；`null`（判不准）⇒ `'unjudged'`，**不兜底成 not-helped**） */
export function verdictOfJudgement(helped) {
    if (helped === true)
        return 'helped';
    if (helped === false)
        return 'not-helped';
    return 'unjudged';
}
/**
 * **由一批判定归约出"该轮"的单一态**（纯函数 · 2026-09-23）。
 *
 * 判因：回流是「**这轮该来源帮上没帮上**」的整体判断，不是逐条流水 ⇒ 须把 `judged[]` 归约成一条。
 * 口径（**保守**）：
 *   · `helped` 多于 `not-helped` ⇒ `'helped'`（该源仍有效，**不该换向**）；
 *   · `not-helped` 多于 `helped` ⇒ `'not-helped'`（该源变弱，可累积换向链）；
 *   · **平局 / 全为 null / 空批** ⇒ `'unjudged'`（**不兜底**——平局不能算"没帮上"）。
 */
export function tallyVerdictOf(judgements) {
    let h = 0;
    let n = 0;
    for (const j of judgements) {
        if (j.helped === true)
            h++;
        else if (j.helped === false)
            n++;
    }
    if (h > n)
        return 'helped';
    if (n > h)
        return 'not-helped';
    return 'unjudged';
}
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
export function buildYieldVerdictEvent(judgements, rounds, lastSid) {
    return yieldVerdictEventOf({
        sid: shortSidOf(lastSid),
        verdict: tallyVerdictOf(judgements),
        injectedChars: rounds.reduce((a, r) => a + r.injectedChars, 0),
        nextToolsN: rounds.reduce((a, r) => a + r.nextTools.length, 0),
    });
}
/* ══ 回流**读侧**的落点说明（2026-09-23） ═════════════════════════════════════════════════
 * 读侧**不在本件**，而在 `ledger-compact#readLatestLedgerRow`（调用方 `mcl#readLatestVerdict`）。
 * 判因（一条真缺陷，如实记）：
 *   本件初版曾在此实现单档尾读（`readTailLines(file,200)` 只读**主档**）。这会撞本仓既有门禁
 *   `check-ledger-read.mjs:123-129` 的 v6 判据 —— 「含 `ledger.jsonl` ∧ 含按行读取器
 *   （`readTailLines` 在 `READERS` 名单内）∧ **不含 `readLedgerVolumes`** ⇒ 红」。
 *   **门禁是对的，不是要绕的障碍**：台账按体积轮转（`.1`/`.2`），**只读主档会静默丢历史且不报错**
 *   （G13「轮转失明」，本仓已因此漏网过 6 处）。⇒ 正解是把**跨档 + 有界**一起做实（见该件抬头），
 *   而不是给本件加例外。本件因此保持**纯函数、零 IO**（只有拼行与语义判定），台账 IO 全归 ledger 域。 */
//# sourceMappingURL=recall-yield.js.map