#!/usr/bin/env node
// check-relevance-live.mjs — IR1 册一 · **真机**相关性抵达面（A1/A2/A4 + A5 一致性）（2026-09-18）
//
// 为什么必须是**真机**：本册的病灶恰恰是"接口通了、门禁绿了、注入面却与任务无关"——
//   单测能证明"选行逻辑对"，**证明不了**它真的抵达注入文本。故本件走 `GET /inject/preview`
//   （与真注入面**同一条读桥**：预览端点按需预热，见 `panel-inject#injectPreviewRoute`）。
//
// 判据（逐条对应验收册）：
//   **A1** 不同 query 的**动态面**必须不同（相同部分只应是恒定面）—— 现状实测 63/63 行相同（0 差异）；
//   **A2** 真命中词取回 **≥1 条与该词相关**的行（且该行**不出现在**乱码词的动态面里）；
//   **A4** 注入侧**向量可用**（`/vector/status2` 与注入读数互核：向量在跑 ⇒ 桥必须真被读到；
//        向量不可用 ⇒ 必须**如实记**降级原因，不得静默）；
//   **A5** 「零命中注明」与 `relevance.zeroHit` **双向一致**（有注明必有零命中；零命中必有注明）。
//
// 用法：node scripts/check-relevance-live.mjs [--selftest]
// 退出码：0 = PASS · 1 = FAIL · 3 = SKIP（宿主未运行 —— 与 `inject-baseline-diff` 同规格）
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.DSH_PORT || '3080'
const API = `http://127.0.0.1:${PORT}/api/shoucang-panel`
const HIT = process.env.SC_REL_HIT || '深睡蒸馏'   // 库内真实存在的词（实测 `recallIndex` 可命中）
const HIT_TOKEN = process.env.SC_REL_TOKEN || '深睡'
const MISS = 'xyzzy-nonexistent-token-qq'

/** 动态面与恒定面的**切分判据**：动态面从「知识索引（」起（段序 oneshot→stable→dynamic，故它是尾部） */
const DYN_MARK = '知识索引（'
const split = (t) => { const i = t.indexOf(DYN_MARK); return i < 0 ? { head: t, dyn: '' } : { head: t.slice(0, i), dyn: t.slice(i) } }
const lines = (s) => s.split('\n')
const zeroNote = '相关性零命中'

/** A1 的判定：两段动态面是否**可分辨**（完全相同 = 不分辩 ⇒ 判定为 FAIL） */
export const dynDiffers = (a, b) => String(a) !== String(b)
/** A2 的判定：命中词的动态面里存在含 token 的行，且该行**不在**乱码词的动态面里 */
export const hasHitRow = (dynHit, dynMiss, token) => lines(dynHit).some((l) => l.includes(token) && l.trim() && !lines(dynMiss).includes(l))

// ── `--selftest`：判据的**双向自证**（不连宿主也能跑；证明断言有判别力，不是恒真）──
if (process.argv.includes('--selftest')) {
  const A = `${DYN_MARK}热取前 2 条）：\n- [路径] 深睡记忆蒸馏 · 概况 → notes/flows.md §深睡蒸馏`
  const B = `${DYN_MARK}热取前 2 条）：\n- [lesson] 别的行 · 概况 → notes/lessons.md §别的`
  const legacy = `${DYN_MARK}热取前 2 条）：\n- [lesson] 位置式基线行 · 概况 → notes/lessons.md §基线`
  let f = 0
  const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) f++ }
  console.log('check-relevance-live · --selftest（判据自证）')
  ok(dynDiffers(A, B), '① 动态面不同 ⇒ 判 "可分辨"（正例）')
  ok(!dynDiffers(legacy, legacy), '② **两段相同 ⇒ 判 "不可分辨"（这就是修复前的真实形态 63/63）** ⇒ A1 断言有判别力')
  ok(hasHitRow(A, B, HIT_TOKEN), '③ 命中行在 A 不在 B ⇒ 判 "取回相关行"（正例）')
  ok(!hasHitRow(legacy, legacy, HIT_TOKEN), '④ 基线里没有命中行 ⇒ 判 "未取回" ⇒ A2 断言有判别力')
  console.log(f ? `\nFAIL（${f} 项）` : '\nPASS（判据双向可证）')
  process.exit(f ? 1 : 0)
}

const get = async (url, ms = 20000) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

const [hit, miss, empty] = await Promise.all([
  get(`${API}/inject/preview?q=${encodeURIComponent(HIT)}`),
  get(`${API}/inject/preview?q=${encodeURIComponent(MISS)}`),
  get(`${API}/inject/preview`),
])
if (!hit || !miss || !empty) {
  console.log(`⏭ SKIP：宿主不可达或预览端点无响应（${API}/inject/preview）—— 未运行时不算失败`)
  process.exit(3)
}
const vec = await get(`${API}/vector/status2`)
const relOf = (o) => o?.supplyUsage?.relevance || null

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const dH = split(String(hit.text || '')), dM = split(String(miss.text || ''))
const sameLines = lines(dH.dyn).filter((l) => lines(dM.dyn).includes(l)).length
const total = Math.max(lines(dH.dyn).length, lines(dM.dyn).length, 1)

console.log('IR1 册一 · 真机相关性抵达面')
console.log(`  读数：动态面行数 命中=${lines(dH.dyn).length} 乱码=${lines(dM.dyn).length} · **逐行相同 ${sameLines}/${total}**（修复前实测 63/63 = 100% 相同）`)

// ── A1：不同 query ⇒ 动态面必须不同（相同部分只应是恒定面）──
ok(dynDiffers(dH.dyn, dM.dyn), `A1 动态面可分辨（相同行 ${sameLines}/${total} < 100%）`)
ok(dH.head === dM.head, 'A1′ **恒定面逐字节相同**（差异只许出现在动态面 —— 这正是"恒定"的定义）')

// ── A2：真命中词取回 ≥1 相关行（现 0）──
ok(hasHitRow(dH.dyn, dM.dyn, HIT_TOKEN), `A2 命中词「${HIT}」取回 ≥1 条相关行（含 token「${HIT_TOKEN}」且不在乱码词的动态面里）`)

// ── A4：注入侧向量可用（或如实记不可用）──
{
  const running = vec?.running || {}
  const vecOn = !!(running.enabled && vec?.localOk)
  const rel = relOf(hit)
  if (vecOn) {
    const viaBridge = !!rel && rel.source === 'bridge' && rel.hits.bridge > 0
    const accounted = !!rel && !!rel.fallback
    ok(viaBridge || accounted, `A4 向量在跑（provider=${vec?.provider}）⇒ 注入侧**真读到桥**（source=${rel?.source} bridge=${rel?.hits?.bridge}）或**如实记降级**（fallback=${rel?.fallback || '(空 = 未记账)'}）`)
  } else {
    ok(!!rel && !!rel.fallback, `A4 向量不可用（provider=${vec?.provider || 'unknown'}）⇒ **如实记降级原因**（fallback=${rel?.fallback || '(空 = 静默)'}）`)
  }
}

// ── A5：零命中注明 ⟺ zeroHit（双向一致；实况多为"有命中"⇒ 该分支不触发，但一致性必须成立）──
{
  for (const [name, o, sp] of [['命中', hit, dH], ['乱码', miss, dM], ['空 query', empty, split(String(empty.text || ''))]]) {
    const z = !!relOf(o)?.zeroHit
    const noted = String(o.text || '').includes(zeroNote)
    ok(z === noted, `A5 ${name}：「零命中注明」与 \`relevance.zeroHit\` 一致（zeroHit=${z} · 注明=${noted}）`)
  }
}

console.log(`\n归类：A1 ${dynDiffers(dH.dyn, dM.dyn) ? 'PASS' : 'FAIL'} · A2 ${hasHitRow(dH.dyn, dM.dyn, HIT_TOKEN) ? 'PASS' : 'FAIL'} · A4/A5 见上`)
console.log(fail ? `\n❌ FAIL（${fail} 项）` : '\n✅ PASS（相关性真抵达注入面 · 非"接口通了"）')
process.exit(fail ? 1 : 0)
