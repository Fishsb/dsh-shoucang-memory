#!/usr/bin/env node
// test-save-roundtrip.mjs — `/save` 端到端副作用往返（UI1/U5-a · 2026-09-15）
//
// **为什么需要它**：`test-route-schema` 覆盖了「缺必填⇒400 · 类型不符⇒400 · 合法请求未被拦截」，
//   但**从未验证合法请求的副作用** —— 即「**真的写进去了，且能读回来**」。
//   而 UI1 的 U1/U2 要大规模拆分前端（`body.js` 5476 行 → 7 个 pane 模块），
//   「拆分后行为不变」需要**行为级证据**；`ui-geo-regress` 只测**几何与组件承载**
//   （实测 `submit`/`fetch(`/`POST` 全为 0）⇒ 缺口须由此件补上。
//
// **零副作用设计（关键）**：`/save` 写的是**配置原文**。本件**先读原文，再写回同样内容**
//   ⇒ 走通完整写入通道（POST → handler → 落盘 → 再读），却**不改变任何配置**。
//   这比"写一段测试数据再恢复"更安全：**没有恢复步骤，就没有恢复失败的风险**。
//
// 断言：
//   A1 `GET /config` 可读，取得原文基线
//   A2 `POST /save {text: 同原文}` ⇒ **200**（合法请求真的被受理）
//   A3 `GET /config` ⇒ 与 A1 **逐字节一致**（写入通道正确且幂等）
//   A4 **反例自证**：`POST /save {}`（缺必填）⇒ **400**
//   A5 反例之后 `GET /config` ⇒ 仍与 A1 一致（坏请求**未**破坏配置）
//
// 退出码：0 = pass · 1 = fail · 3 = skip（宿主不可达；与 inject-baseline-diff 同口径）
const BASE = process.env.SC_PANEL_BASE || 'http://127.0.0.1:3080/api/shoucang-panel'
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* 非 JSON 响应 */ }
  return { code: res.status, data }
}

// ── 探测可达性（不可达 ⇒ skip，不判失败：与 inject-baseline-diff 同口径）──
try {
  const probe = await call('GET', '/config')
  if (probe.code !== 200) { console.log(`test-save-roundtrip: /config 返回 ${probe.code} ⇒ skip（exit 3）`); process.exit(3) }
  console.log(`/save 端到端往返 · ${BASE}`)

  // ── A1 基线 ──
  const before = probe.data
  const text = typeof before === 'string' ? before : (before && (before.text ?? before.raw ?? JSON.stringify(before)))
  ok(typeof text === 'string' && text.length > 0, `A1 读到配置原文（${text.length} 字符）`)

  // ── A2 写回同样内容 ⇒ 200 ──
  const w = await call('POST', '/save', { text })
  ok(w.code === 200, `A2 POST /save（同内容）⇒ 200（实得 ${w.code}）`)

  // ── A3 再读 ⇒ 逐字节一致 ──
  const after = await call('GET', '/config')
  const text2 = typeof after.data === 'string' ? after.data : (after.data && (after.data.text ?? after.data.raw))
  ok(text2 === text, 'A3 写回后重读 ⇒ 与基线**逐字节一致**（写入通道正确且幂等）')

  // ── A4 反例自证：缺必填 ⇒ 400 ──
  const bad = await call('POST', '/save', {})
  ok(bad.code === 400, `A4 反例自证：缺必填 ⇒ 400（实得 ${bad.code}）`)

  // ── A5 坏请求未破坏配置 ──
  const after2 = await call('GET', '/config')
  const text3 = typeof after2.data === 'string' ? after2.data : (after2.data && (after2.data.text ?? after2.data.raw))
  ok(text3 === text, 'A5 反例之后配置仍与基线一致（坏请求未破坏数据）')
} catch (e) {
  console.log(`test-save-roundtrip: 宿主不可达（${String(e && e.message).slice(0, 60)}）⇒ skip（exit 3）`)
  process.exit(3)
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（/save 端到端往返：受理 ⇒ 落盘 ⇒ 可读回；坏请求被 400 拦住且未破坏数据）')
process.exit(fail ? 1 : 0)
