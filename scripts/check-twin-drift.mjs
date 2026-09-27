/**
 * check-twin-drift.mjs — 孪生拷贝漂移守卫（2026-09-26 立）
 *
 * ## 判因（实测事故，不是假想）
 *
 * 本仓有一批脚本**在 `scripts/` 与 `skill/scripts/` 各存一份**（共 21 对，
 * 库工具链与仓内工具各自可用）。此前**没有任何机制守它们一致**，靠手工同步。
 *
 * 实测（2026-09-26 R7 收尾）：修 `section-ref.mjs#pointersOfRow` 的解析缺陷时，
 * 只改了 `skill/scripts/` 那份 ⇒ `scripts/` 那份**静默停在旧代**，
 * 直到 `check-placement-convergence` 的「双份逐字一致」断言才撞出来。
 * ⚠ 该断言的覆盖**只限那一对**（它顺手比了 section-ref 与 memory-append），
 * 其余 19 对**无人看管** —— 这正是「失败不可观测」的典型形态。
 *
 * ## 本件做什么
 *
 * 对**每一对**同名文件做逐字节比较（`Buffer.equals`，不吃换行差异），
 * 输出漂移清单；有漂移即 `exit 1`。
 *
 * ## 边界（刻意不做）
 *
 * · **不自动同步** —— 自动覆盖会掩盖「两份本该不同」的情形；漂移应由人判断是
 *   「漏同步」还是「有意分叉」（后者须先解除孪生关系，即删掉一份）。
 * · **不新增依赖**、不碰记忆库、不评价内容 —— 只做同一性判定。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-twin-drift.mjs          # 报告 + 退出码
 * node scripts/check-twin-drift.mjs --list   # 只列孪生对
 * ```
 *
 * 退出码：0 = 全部一致 · 1 = 有漂移 · 3 = 未找到孪生目录（诚实跳过）
 *
 * @module dsh-shoucang-memory/scripts/check-twin-drift
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const A = join(ROOT, 'scripts')
const B = join(ROOT, 'skill', 'scripts')

if (!existsSync(A) || !existsSync(B)) {
  console.log('孪生漂移守卫：未找到 scripts/ 或 skill/scripts/ —— 跳过（exit 3）')
  process.exit(3)
}

/** 收集 A 侧全部 .mjs，与 B 侧同名者构成孪生对。 */
const pairs = []
for (const name of readdirSync(A)) {
  if (!name.endsWith('.mjs')) continue
  const a = join(A, name)
  const b = join(B, name)
  if (!existsSync(a) || !statSync(a).isFile()) continue
  if (!existsSync(b) || !statSync(b).isFile()) continue
  pairs.push({ name, a, b })
}
pairs.sort((x, y) => x.name.localeCompare(y.name))

if (process.argv.includes('--list')) {
  console.log('孪生对（' + pairs.length + '）：')
  for (const p of pairs) console.log('  · ' + p.name)
  process.exit(0)
}

/* ⚠ 逐**字节**比较，不做换行归一 —— 本仓是 CRLF 工作树，
 *   若归一 .gitattributes 会让「只差行尾」显示为一致而非真一致，那是放宽。 */
const drift = []
for (const p of pairs) {
  const ba = readFileSync(p.a)
  const bb = readFileSync(p.b)
  if (!ba.equals(bb)) drift.push({ ...p, sizeA: ba.length, sizeB: bb.length })
}

console.log('孪生拷贝漂移守卫 · 孪生对 ' + pairs.length + ' · 一致 ' + (pairs.length - drift.length) + ' · 漂移 ' + drift.length)

if (!drift.length) {
  console.log('✅ 全部逐字节一致')
  process.exit(0)
}

console.log('')
console.log('❌ 以下孪生对已漂移（两份同源文件内容不同）：')
for (const d of drift) {
  console.log('  · ' + d.name + '（scripts/ ' + d.sizeA + 'B · skill/scripts/ ' + d.sizeB + 'B）')
}
console.log('')
console.log('处置：先判断是「漏同步」还是「有意分叉」——')
console.log('  · 漏同步 ⇒ 把改动同步到两份（本件刻意不自动覆盖，避免掩盖有意分叉）')
console.log('  · 有意分叉 ⇒ 删掉其中一份（解除孪生关系），并在这里登记原因')
process.exit(1)
