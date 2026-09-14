#!/usr/bin/env node
/**
 * test-distill-source-filter.mjs — 蒸馏来源过滤（第二副本）回归门（2026-09-13 深层归因）
 *
 * 背景（实测）：`episodes.jsonl` 255 条里 **190 条（75%）intent 是宿主注入样板**（`Current runtime context` /
 *   MCL 慢通道材料 / `<system-reminder>`）⇒ 转正与同型判定的数据源被污染；根因是 `distill-chunks.ts` 的
 *   `textPartsOfEvent` 只按**事件类型**取文本、**不看 `source.kind`**，而 `distill-activation.ts` 的去污染
 *   只作用于采样判定 —— 同一根因的两个副本，口径不一致。
 *
 * 本件锁死「四处统一口径」：`data.source.kind` 缺失（旧格式/夹具）或 === 'user' ⇒ 收；其余 ⇒ 丢。
 * 退出码：0 = 全过；1 = 有断言失败。
 */
const ok = (cond, label) => { console.log(`${cond ? '✅' : '❌'} ${label}`); if (!cond) fail++; }
let fail = 0
const mod = await import(new URL('../lib/distill-chunks.js', import.meta.url).href)

const um = (text, kind) => ({ type: 'user/message', data: { content: [{ type: 'text', text }], ...(kind === undefined ? {} : { source: { kind } }) } })

// ① 真实用户消息（kind='user'）必须收
ok(mod.textPartsOfEvent(um('帮我评估记忆架构', 'user')).length === 1, "① kind='user' 的 user/message 被收录")
// ② 无 source 字段（旧格式/夹具）必须收（否则夹具与历史事件全被丢光）
ok(mod.textPartsOfEvent(um('旧格式事件')).length === 1, '② 无 source.kind（旧格式/夹具）被收录')
// ③ 宿主注入块必须丢（三类真实 kind 各验一次）
for (const k of ['plugin', 'agent-instructions', 'skill-catalog']) {
  ok(mod.textPartsOfEvent(um('Current runtime context. This snapshot supersedes…', k)).length === 0, `③ kind='${k}' 的注入块被丢弃`)
}
// ④ 注入块的正文形态（即使内容是用户口吻）也必须丢 —— 防「按内容猜」旁路
ok(mod.textPartsOfEvent(um('我想知道这个是怎么玩的', 'plugin')).length === 0, '④ 注入块即使内容是用户口吻也丢（判据是结构字段，不是内容）')
// ⑤ assistant 文本不受来源判据影响 —— **v3 现行形状**（data.message.content[]）
//     ⚠ 2026-09-14 修：原断言用的是 `assistant/chunk`（**v0 已发布类型**），而现行转录是 v3
//     （`session.v3.jsonl.zstd`；实测 `assistant/chunk` 0 次 / `assistant/message` 578 次）
//     ⇒ 旧断言**锁住了错误的形状**，等于把「助手侧永远进不了蒸馏」这个缺陷钉成了"预期行为"。
//     同型先例：2026-09-13 修 `user/message`（按事件形状取文本，而形状隔代变了）——当时只修了用户侧。
const am = (text) => ({ type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } })
ok(mod.textPartsOfEvent(am('回复')).length === 1, "⑤ v3 assistant/message 的 text 片被收录（data.message.content[]）")
ok(mod.textPartsOfEvent({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'reasoning', text: '思维链' }, { type: 'text', text: '结论' }] } } }).join('') === '[assistant] 结论', '⑤ 只收 text 片、**不收 reasoning**（思维链不进蒸馏材料）')
ok(mod.textPartsOfEvent({ type: 'assistant/message', data: {} }).length === 0, '⑤ assistant/message 无 message 字段 ⇒ 空（不抛）')
// ⑥ 分段器整体：注入块不占字符预算（含注入的窗口段文本应只含真实用户文本）
const events = [
  { seq: 1, ...um('真实提问', 'user') },
  { seq: 2, ...um('Current runtime context. 本环境装有 dsh-super-injector（dev_* 工具）', 'plugin') },
  { seq: 3, ...um('【认知环·慢通道】这是你不熟悉的任务', 'plugin') },
]
const { chunks, maxSeq } = mod.buildEventChunks(null, 0, 10000, events)
ok(maxSeq === 3, '⑥ 水位仍推进到窗口末事件（丢文本不丢 seq）')
ok(chunks.length >= 1 && chunks.every((c) => !/Current runtime context|认知环/.test(c.text)) && /真实提问/.test(chunks[0].text), '⑥ 段文本只含真实用户内容（注入块零残留）')

console.log(`\n${fail ? 'FAIL' : 'PASS'}（来源过滤回归：${fail} 条失败）`)
process.exit(fail ? 1 : 0)
