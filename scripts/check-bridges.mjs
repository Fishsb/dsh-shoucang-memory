#!/usr/bin/env node
/**
 * check-bridges.mjs — 惰性桥消费点**棘轮**（G0「唯一 composition root」的前置仪表 · 2026-09-13）
 *
 * 为什么需要它：目标里的「唯一 composition root」要求**消掉 3 个 `-share` 惰性桥**
 *   （`scheduler-share` / `deepsleep-share` / `mcl-share`）。但"消桥"这件事若没有数字，
 *   就会变成一句愿望——而本项目已有实证：没有仪表盘的机制，坏了也没人知道。
 *   本件把三条桥的**发布点/消费点**数成数字，并**只许减不许增**（棘轮）。
 *
 * 现状基线（**2026-09-13 达到目标 0**：6 → 4 → 2 → 0）：
 *   · 三条桥（`mcl-share` / `deepsleep-share` / `scheduler-share`）**全部退役** —— 列入 RETIRED，**复现即 FAIL**；
 *   · 边数 0：跨域句柄一律由 composition root（`src/composition.ts`）构造并**显式传递**。
 *
 * 棘轮语义（与 audit-fnspan / audit-wiring 同规格）：
 *   · 边数 **> 基线** ⇒ FAIL（新增惰性桥消费点：请改走 composition root；确需新增须显式上调基线并说明理由）；
 *   · 边数 **< 基线** ⇒ PASS 并**提示收紧基线**（棘轮只许收紧——拆桥后必须把基线降下来）。
 *
 * 用法：node scripts/check-bridges.mjs [--selftest]
 * 退出码：0 = pass（≤ 基线）· 1 = fail（超基线）· selftest 下：0/1 表示扫描器自证通过/失败
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(repoRoot, 'src')
const BRIDGES = []
/** **已退役**的桥（composition root 已接管）：文件复现即 FAIL —— 退役不许被悄悄加回来 */
const RETIRED = ['mcl-share', 'deepsleep-share', 'scheduler-share']

/** 棘轮基线（**只许收紧**）：6 → 4（`mcl-share`）→ 2（`deepsleep-share`）→ **0**（`scheduler-share`，2026-09-13 收尾） */
const BASELINE = { publishers: 0, consumers: 0 }

/**
 * 判定一个源文件对某条桥的角色：
 *   'publish' = 出现 `X.api =`（写入 holder）；'consume' = 只读 `X.api`；null = 不使用该桥。
 * 两者同时出现时以 **publish 优先**（构造处即 owner）。
 *
 * ⚠ 标识符**必须从 import 语句里解析**，不能按文件名推导——本件初版按 `deepsleep-share → deepsleepShare`
 *   推导，而实际导入名是 `deepSleepShare`（大写 S）⇒ **漏掉整整一条桥**（基线被算成 4 而非 6）。
 *   实测教训：名字推导规则是「第二份事实源」，与真实导入名一漂移就静默漏计。
 */
function roleOf(src, bridge) {
  const m = src.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'\\./${bridge}\\.js'`))
  if (!m) return null
  const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)
  if (!names.length) return null
  if (names.some((n) => new RegExp(`\\b${n}\\.api\\s*=`).test(src))) return 'publish'
  return names.some((n) => new RegExp(`\\b${n}\\.api\\b`).test(src)) ? 'consume' : null
}

function scan() {
  const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith('.ts')) : []
  const rows = []
  for (const f of files) {
    if (BRIDGES.some((b) => f === `${b}.ts`)) continue // 桥自身不算消费点
    const src = readFileSync(join(SRC, f), 'utf8')
    for (const b of BRIDGES) {
      const role = roleOf(src, b)
      if (role) rows.push({ file: f, bridge: b, role })
    }
  }
  return rows
}

// ── 反向证伪（--selftest）：证明**扫描器真会分辨**发布/消费，而不是恒返回空（否则门禁是假绿）──
if (process.argv.includes('--selftest')) {
  const cases = [
    ["import { mclShare } from './mcl-share.js'\nmclShare.api = { status: () => 1 }", 'mcl-share', 'publish'],
    ["import { mclShare } from './mcl-share.js'\nconst a = mclShare.api?.status()", 'mcl-share', 'consume'],
    ["import { deepSleepShare } from './deepsleep-share.js'\nif (!deepSleepShare.api) return", 'deepsleep-share', 'consume'],
    ["import { schedulerShare } from './scheduler-share.js'\nschedulerShare.api = x", 'scheduler-share', 'publish'],
    ["import { other } from './targets.js'\nother()", 'scheduler-share', null],
    ["// 注释里提到 mclShare.api = 1 但没有 import 语句", 'mcl-share', null],
  ]
  let bad = 0
  for (const [src, bridge, want] of cases) {
    const got = roleOf(src, bridge)
    const ok = got === want
    if (!ok) bad++
    console.log(`${ok ? '✅' : '❌'} ${bridge} → ${String(got)}（期望 ${String(want)}）`)
  }
  console.log(bad ? `\nFAIL（${bad} 例）` : '\nPASS（桥接扫描器自证可用）')
  process.exit(bad ? 1 : 0)
}

const rows = scan()
const pub = rows.filter((r) => r.role === 'publish')
const con = rows.filter((r) => r.role === 'consume')
let bad = 0
const chk = (label, cur, base) => {
  if (cur > base) { bad++; console.log(`❌ ${label} ${cur} > 基线 ${base}`) }
  else if (cur < base) console.log(`⚠ ${label} ${cur} < 基线 ${base} —— **请把基线收紧到 ${cur}**（棘轮只许收紧）`)
  else console.log(`✅ ${label} ${cur}（= 基线）`)
}

console.log(`惰性桥消费点棘轮 · 目标 0（由 composition root 显式传句柄）`)
for (const b of RETIRED) {
  if (existsSync(join(SRC, `${b}.ts`))) { bad++; console.log(`❌ 已退役的桥**复现**：src/${b}.ts（退役不许被悄悄加回）`) }
}
for (const r of rows) console.log(`  · ${r.role.padEnd(7)} ${r.bridge.padEnd(18)} ${r.file}`)
console.log('')
chk('发布侧边数', pub.length, BASELINE.publishers)
chk('消费侧边数', con.length, BASELINE.consumers)
console.log(`· 桥模块 ${BRIDGES.length} 个 · 边合计 ${rows.length}/${BASELINE.publishers + BASELINE.consumers}`)

if (bad) { console.log(`\nFAIL（${bad} 项超基线：新增惰性桥消费点须改走 composition root，或显式上调基线并说明）`); process.exit(1) }
console.log('\nPASS（未新增惰性桥边；拆桥后请同步收紧基线）')
