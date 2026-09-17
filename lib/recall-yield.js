// recall-yield.ts — S4/D1（2026-09-14）：**检索收益与停止准则**（消费链条）
//
// 判因（S4 方案 §4.4；人类依据见 `docs/human-task-loop-vs-embodied-ai-2026-09.md` §1.3）：
//   人类按**边际价值**停止检索 —— 当某来源的边际收益降到低于环境平均，就**离开该斑块**。
//   而本插件此前**没有任何停止判据**：慢通道注入材料后，模型引用与否只落审计，
//   **不产生任何行为后果**（再引导上限 1 次即放行）。
//
// **零新采集**：收益信号**审计里早就有** —— `phase:'compliance'` 事件的 `compliant` 字段
//   就是「材料是否被引用」。本件只做两件事：把它折成**连续零增益计数**，按阈值出**换向信号**。
//
// 边界（照仓内"工具只提案不判"的先例）：本件**只出信号**（`switchSource`），
//   **不决定换向到哪** —— 选行归 `ring-supply` / `recallIndex`。判据在此，决策留给调用方与模型。
//
// 纯函数、零 IO、零依赖、零抛出 —— 可独立断言。
//
// 🔴🔴 **J5/U3 前置实测（2026-09-16 · 常备探针 `scripts/yield-signal-probe.mjs`）—— 三条事实，
//   读本件前必看**（否则会在**死信号**上继续叠加升级）：
//   ① **信号源已死**：`phase:'compliance'` 行 **1061** 条，`compliant=true` **0** 条 ⇒ 合规率 **0.0%**
//      ⇒ `nextZeroGain` 永远只走"递增"分支、**不可能归零**（`zeroGain` 实测冲到 **246**）。
//   ② **判据恒真**：`switchSource=true` **878/1061 = 82.8%** ⇒ "换向信号"是**恒真噪声**
//      （恒真 = 没有判别力，正是仓内最忌的「假旋钮」）。
//   ③ **无人消费**：`switchSource`/`zeroGain` **只写进审计，`src/` 内没有消费者** ⇒ **没有行为后果**
//      （与本件抬头"不产生任何行为后果"的自述一致 —— 至今仍如此）。
//   ⇒ **正确顺序 = 先修信号源，再谈判定机制**：在死信号上把判定交 LLM（本册 §3.3 的写法）
//     **毫无意义** —— 喂进去的仍是"未引用"这一条恒真事实。修信号源须取证
//     「**注入材料之后模型实际做了什么**」（可从转录顺带采集，同 S-P2 工具维的做法）。
/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export const SWITCH_THRESHOLD = 2;
/** 折一次收益：合规 ⇒ **归零**（来源仍有效）；不合规 ⇒ 递增（线索在变弱） */
export function nextZeroGain(prev, compliant) {
    return compliant ? 0 : Math.max(0, Number(prev) || 0) + 1;
}
/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料） */
export function shouldSwitchSource(zeroGain, threshold = SWITCH_THRESHOLD) {
    return (Number(zeroGain) || 0) >= Math.max(1, threshold);
}
/** 收益读数（供诊断聚合；纯函数、含分母口径——合规率**必须有分母**，仓内曾因只在失败分支落账而无分母） */
export function yieldOf(rows) {
    const total = rows.length;
    const compliant = rows.filter((r) => r.compliant === true).length;
    return { total, compliant, rate: total ? Math.round((compliant / total) * 1000) / 10 : null };
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
//# sourceMappingURL=recall-yield.js.map