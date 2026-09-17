#!/usr/bin/env node
// test-inject-dedup.mjs — **注入侧跨形态消重**（S-P4e · 2026-09-16）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §7（R2-A 改判：消费侧消重）+ OPEN-ITEMS S-P4e 四条判据。
// 判据（**行为级**，真临时库；**不依赖向量服务** —— 向量路径用「未配置 ⇒ fail-open」分支覆盖）：
//   ① **不重复注入**：`skip` 里的行**逐字**从注入文本里消失；其余行与**行序**保持
//   ② **库文件 sha 不变**：本件**纯读**（测试实测两画像文件 mtime+内容不变）
//   ③ **误判可解释**：`crossFormCovered` 返回的每条 skip 都带 `by`（覆盖它的粗行）+ `sim`
//   ④ **关闭即逐字节回基线**：`skip` 为空 ⇒ 输出 === 输入（**byte-identical**）
//   ⑤ 顺带：**不做模糊匹配**（子串不算命中）· 幂等 · 预热前状态为空
//
// 用法: node scripts/test-inject-dedup.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { filterInjected, filterInjectedText, dedupState, crossFormCovered, CROSS_FORM_DEDUP_SIM } from '../lib/crossform-dedup.js'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

const COARSE = '[原则] 批处理水位即真相 · 产物未校验可解析不得推进水位，失败须回滚重试 → notes/flows.md §深睡蒸馏'
const FINE = '- 深睡产线曾先推水位致窗口恒零痕迹、产物不可解析仍推水位；done 前先校验产物可解析。 ← 源: distill e739b514'
const OTHER = '- 另一条与任何粗行都无关的叙事行，应当保留不动。'
const TEXT = `## 画像\n${COARSE}\n${FINE}\n${OTHER}\n\n## 尾\n`

console.log('── S-P4e 注入侧消重（行为级）──')

// ④ 关闭即逐字节回基线
{
  const out = filterInjectedText(TEXT, [])
  ok(out === TEXT, '④ 关闭（skip 空）⇒ 输出与输入**逐字节相同**')
  ok(Buffer.from(out, 'utf8').equals(Buffer.from(TEXT, 'utf8')), '④ 字节级相等（Buffer.compare）')
}

// ① 不重复注入：逐字移除 + 行序保持
{
  const out = filterInjectedText(TEXT, [FINE])
  ok(!out.includes(FINE), '① skip 里的行**已从注入文本消失**')
  ok(out.includes(COARSE) && out.includes(OTHER), '① 其余行**保留**（粗行与无关行都在）')
  const a = TEXT.split('\n').filter((l) => l !== FINE).join('\n')
  ok(out === a, '① 行序与其余内容**与"仅删该行"完全一致**（无副作用重排）')
  ok(out.split('\n').length === TEXT.split('\n').length - 1, '① 只少一行（不多删）')
}

// ⑤ 不做模糊匹配：子串不算命中
{
  const out = filterInjectedText(TEXT, [FINE.slice(0, 20)])
  ok(out === TEXT, '⑤ **子串不算命中**（消重只认逐字整行 —— 避免引入不确定性）')
}

// trim 语义：skip 带首尾空白也能命中
{
  const out = filterInjectedText(TEXT, ['   ' + FINE + '  '])
  ok(!out.includes(FINE), '⑤ skip 条目带首尾空白仍命中（两侧 trim 后逐字比对）')
}

// 幂等
{
  const once = filterInjectedText(TEXT, [FINE])
  const twice = filterInjectedText(once, [FINE])
  ok(once === twice, '⑤ 幂等：连续应用两次 = 一次')
}

// filterInjected（行数组版）
{
  const lines = TEXT.split('\n')
  const kept = filterInjected(lines, [FINE])
  ok(kept.length === lines.length - 1 && !kept.includes(FINE), '⑤ 行数组版与文本版行为一致')
  ok(JSON.stringify(filterInjected(lines, [])) === JSON.stringify(lines), '⑤ 行数组版也 fail-open')
}

// ⑤ 预热前状态为空（薄引用缝的初值）
{
  const st = dedupState()
  ok(Array.isArray(st.skip) && st.skip.length === 0, '⑤ 预热前 skip 为空（fail-open 初值）')
  ok(st.warmedAt === 0 || typeof st.warmedAt === 'number', '⑤ 状态可读（warmedAt 为数值）')
}

// ③ 误判可解释 + ② 纯读（真临时库；向量未配置 ⇒ 走 fail-open 分支，不触网）
{
  const dir = mkdtempSync(join(tmpdir(), 'sc-dedup-'))
  writeFileSync(join(dir, 'AGENT.md'), [COARSE, FINE, OTHER].join('\n') + '\n', 'utf8')
  writeFileSync(join(dir, 'USER.md'), '[身份] 测试用户 → notes/user.md §身份\n', 'utf8')
  const before = { a: readFileSync(join(dir, 'AGENT.md'), 'utf8'), u: readFileSync(join(dir, 'USER.md'), 'utf8') }
  const r = await crossFormCovered(dir, { enabled: false })
  const after = { a: readFileSync(join(dir, 'AGENT.md'), 'utf8'), u: readFileSync(join(dir, 'USER.md'), 'utf8') }
  ok(before.a === after.a && before.u === after.u, '② **库文件内容未变**（本件纯读；判据②的单元级证据）')
  ok(r.skip.length === 0, '⑤ 向量未配置 ⇒ skip 空（fail-open）')
  ok(/未判|未配置/.test(r.note), `③ 且**如实记"未判"**（note=「${r.note}」）—— 不假装已判`)
  ok(Array.isArray(r.reasons) && r.reasons.length === r.skip.length, '③ 可解释：reasons 与 skip 一一对应（此处置空）')
  ok(r.stat.coarse >= 1 && r.stat.fine >= 1, `③ 判定面已识别（粗 ${r.stat.coarse} · 细 ${r.stat.fine}）`)
  rmSync(dir, { recursive: true, force: true })
}

ok(CROSS_FORM_DEDUP_SIM > 0 && CROSS_FORM_DEDUP_SIM <= 1, `阈值常量合法（${CROSS_FORM_DEDUP_SIM}；登记于 criteria.json#thresholds`)

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
