// check-distill-input-surface.mjs — 册一机检：蒸馏**输入面与段身份**（触发宽 · 准入严 的前置）
//
// 判因（真机实测，2026-09-18/19）：会话 3a0b155d 唯一 `turn/end` 在 seq 100，其后 seq 101–106
//   **六条全是 `subagent/catalog`**（宿主在父会话上落的管理事件）——而 `buildEventChunks` 让
//   **无文本事件也推进段 `endSeq`**（`distill-chunks.ts:75`）⇒ 每轮蒸馏自己把窗口右端 +1
//   ⇒ 重试键 `sid#endSeq` 每轮都变 ⇒ `MAX_DISPATCH_RETRY=3` 的结构性失效（全日志「第 3/3 次」0 次）。
//
// 可证伪性声明（先红）：
//   ② 段边界只到最后一个**内容**事件——改造前为最后一个事件（管理事件也推）⇒ 必红；
//   ④ `segKey` 存在且对管理事件免疫——改造前该字段不存在 ⇒ 必红；
//   ⑤ 等价性（纯内容流逐字节等价）恒须绿——它是"改动没顺手改材料"的反向保险。
//   ⇒ 本件在改造前**必须**红（红读数入档），改造后必须全绿。
//
// 宿主 parity（⑥）：本仓**不**在运行时 import `@deepseek-ai/dsh-session`（实测 profile 内
//   该包不可解析：`~/.dsh/profiles/web/node_modules/@deepseek-ai/` 只有 cordis/cosmokit/
//   dsh-client-*/dsh-llm/dsh-tools/schemastery ⇒ 运行时 import 会把插件整个加载链炸掉）。
//   故白名单在本仓定义、**由本件锁 parity**：逐条断言 ⊆ 宿主 `isSurfaceEligibleType` 的集合。
//   宿主不可达时**显式打印 UNVERIFIED**（不静默、不冒充已验）。
import * as Chunks from '../lib/distill-chunks.js'

const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }
const note = (m) => P.push(`NOTE  ${m}`)

// ── 夹具：内容事件 + 三类宿主管理事件 ──
const ev = (seq, type, data, time) => ({ seq, type, time, data })
const CONTENT = [
  ev(10, 'user/message', { content: [{ type: 'text', text: '请记住：这条要用 B 方案，别再走 A 了' }] }, 1000),
  ev(11, 'assistant/message', { message: { content: [{ type: 'text', text: '好的，已记录：用 B 方案替换 A。' }] } }, 2000),
]
const MGMT = [
  ev(12, 'subagent/catalog', { childId: 'c1', mode: 'one-shot' }, 3000),
  ev(13, 'approval/policy', { policy: 'danger-full-access' }, 4000),
  ev(14, 'session/title', { title: '探针标题' }, 5000),
]
const agentOf = (events) => ({ session: { snapshotEvents: () => events } })

// ── ① 白名单（材料面只认内容事件）──
const M = Chunks.MATERIAL_EVENT_TYPES
const hasSet = !!M && typeof M.has === 'function'
ok('① 材料白名单已导出（Set）', hasSet, hasSet ? `size=${M.size}` : 'MATERIAL_EVENT_TYPES 缺失')
if (hasSet) {
  for (const t of ['user/message', 'assistant/message']) ok(`① 白名单含 ${t}`, M.has(t))
  for (const t of ['subagent/catalog', 'approval/policy', 'session/title', 'tool/call', 'turn/end']) ok(`① 白名单**不含** ${t}`, !M.has(t))
}

// ── ② 段边界只到最后一个内容事件（管理事件不得推边界）──
const withMgmt = Chunks.buildEventChunks(agentOf([...CONTENT, ...MGMT]), 0)
const lastContentSeq = 11
const lastEventSeq = 14
const c0 = withMgmt.chunks[withMgmt.chunks.length - 1]
ok('② 段边界 = 最后一个**内容**事件 seq', !!c0 && c0.endSeq === lastContentSeq, `endSeq=${c0 ? c0.endSeq : '-'}（期望 ${lastContentSeq}；改造前会是 ${lastEventSeq} = 被管理事件推进）`)
ok('③ scan 边界仍覆盖全部事件（不丢事件）', withMgmt.maxSeq === lastEventSeq, `maxSeq=${withMgmt.maxSeq}（期望 ${lastEventSeq}）`)

// ── ④ segKey：存在 + 对管理事件免疫 ──
const key0 = c0 && c0.segKey
ok('④ 段身份 segKey 存在（字符串）', typeof key0 === 'string' && key0.length >= 8, `segKey=${key0 ?? '(缺失)'}`)
{
  const more = Chunks.buildEventChunks(agentOf([...CONTENT, ...MGMT, ev(15, 'subagent/catalog', { childId: 'c2' }, 6000)]), 0)
  const key1 = more.chunks[more.chunks.length - 1] && more.chunks[more.chunks.length - 1].segKey
  ok('④ 追加管理事件 ⇒ segKey 恒定', typeof key0 === 'string' && key0 === key1, `前=${key0 ?? '-'} 后=${key1 ?? '-'}`)
}
{
  // 内容变了 ⇒ segKey 必须变（防"恒真指纹"）
  const changed = [...CONTENT.slice(0, 1), ev(11, 'assistant/message', { message: { content: [{ type: 'text', text: '换一句内容。' }] } }, 2000)]
  const key2 = Chunks.buildEventChunks(agentOf(changed), 0).chunks[0]
  ok('④ 内容变化 ⇒ segKey 必变（反例自证）', key2 && typeof key2.segKey === 'string' && key2.segKey !== key0, `变后=${key2 ? key2.segKey : '-'}`)
}

// ── ⑤ 等价性：纯内容流（无管理事件）与参考实现逐字节相同 ──
//    参考实现 = 改造前语义（任何事件都推进 endSeq，只切文本）——只比**文本与段数**，不比 endSeq（那正是本册要改的）。
const refChunks = (events, lastSeq, chunkChars) => {
  let maxSeq = lastSeq; const out = []; let cur = null
  for (const e of events) {
    const seq = e.seq ?? 0
    if (seq <= lastSeq) continue
    if (seq > maxSeq) maxSeq = seq
    const parts = Chunks.textPartsOfEvent(e)
    if (!parts.length) { if (cur) cur.endSeq = seq; continue }
    const partLen = parts.reduce((n, p) => n + p.length, 0)
    const addCost = partLen + (cur ? parts.length : parts.length - 1)
    if (cur && cur.len + addCost > chunkChars) { out.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') }); cur = null }
    if (!cur) cur = { startSeq: seq, endSeq: seq, parts: [], len: 0 }
    for (const p of parts) { cur.len += p.length + (cur.parts.length > 0 ? 1 : 0); cur.parts.push(p) }
    cur.endSeq = seq
  }
  if (cur) out.push({ startSeq: cur.startSeq, endSeq: cur.endSeq, text: cur.parts.join('\n') })
  return { chunks: out, maxSeq }
}
{
  const long = [ev(20, 'user/message', { content: [{ type: 'text', text: 'x'.repeat(9000) }] }, 1), ev(21, 'assistant/message', { message: { content: [{ type: 'text', text: 'y'.repeat(9000) }] } }, 2), ev(22, 'user/message', { content: [{ type: 'text', text: '尾段' }] }, 3)]
  const got = Chunks.buildEventChunks(agentOf(long), 0)
  const want = refChunks(long, 0, Chunks.CHUNK_CHARS)
  ok('⑤ 段数逐字等价（纯内容流）', got.chunks.length === want.chunks.length, `got=${got.chunks.length} want=${want.chunks.length}`)
  ok('⑤ 段文本逐字等价（纯内容流）', got.chunks.every((c, i) => want.chunks[i] && c.text === want.chunks[i].text))
  ok('⑤ maxSeq 逐字等价（纯内容流）', got.maxSeq === want.maxSeq, `got=${got.maxSeq} want=${want.maxSeq}`)
}
{
  // 含管理事件的流：**文本**仍须与参考实现逐字节相同（边界可改，材料不可变）
  const mixed = [...CONTENT, ...MGMT]
  const got = Chunks.buildEventChunks(agentOf(mixed), 0)
  const want = refChunks(mixed, 0, Chunks.CHUNK_CHARS)
  ok('⑤ 段文本逐字等价（含管理事件）', got.chunks.length === want.chunks.length && got.chunks.every((c, i) => want.chunks[i] && c.text === want.chunks[i].text))
  ok('⑦ 管理事件载荷零字进入材料', got.chunks.every((c) => !/c1|one-shot|danger-full-access|探针标题/.test(c.text)))
}

// ── ⑥ 宿主 parity（可选，不可达即显式 UNVERIFIED）──
//    ⚠ 先红时实测到的**版本偏斜**（2026-09-19）：仓内 dev 副本 `@deepseek-ai/dsh-session`
//      的 surface 集为 **3 类**（`system/message` 判 false），而本机安装宿主 `lib/index.js` 的
//      `SURFACE_EVENT_TYPES` 是 **4 类**（含 `system/message`）。⇒ 断言**不硬编码成员表**
//      （那会把"契约描述目标态"写进断言，见仓内「契约须描述现状」），只锁**关系**：
//      ① 我们的白名单逐条 ⊆ 宿主 surface 集（方向：我们只收内容事件）；
//      ② 管理事件类（`subagent/catalog`）**非** surface（方向：宿主也不认它是内容）。
try {
  const host = await import('@deepseek-ai/dsh-session')
  const eligible = host.isSurfaceEligibleType
  if (typeof eligible !== 'function') throw new Error('宿主未导出 isSurfaceEligibleType')
  ok('⑥ 宿主 parity：白名单逐条 ⊆ 宿主 surface 集', hasSet && [...M].every((t) => eligible(t)), `ours=[${hasSet ? [...M].join(',') : '-'}]`)
  ok('⑥ 宿主 parity：管理事件非 surface（方向锁）', eligible('user/message') === true && eligible('subagent/catalog') === false)
  note(`⑥ 宿主 surface 实测：` + ['system/message', 'user/message', 'assistant/message', 'tool/result'].map((t) => `${t}=${eligible(t)}`).join(' '))
} catch (e) {
  note(`⑥ 宿主 parity 未验证（宿主包不可达：${String(e && e.message || e).slice(0, 80)}）—— 本件其余断言照跑，不作静默通过`)
}

// ── 输入量可见化（N=0 显式记 0）──
note(`读数：材料事件 ${(withMgmt.chunks[0] && withMgmt.chunks[0].events) ?? '(未导出)'} · 管理事件 ${MGMT.length} · scan 区间 0→${withMgmt.maxSeq} · 段数 ${withMgmt.chunks.length}`)

for (const l of P) console.log(l)
console.log(bad ? `\n❌ check-distill-input-surface: ${bad} 条断言未通过` : '\n✅ check-distill-input-surface: 全绿')
process.exit(bad ? 1 : 0)
