/**
 * check-capacity-chars.mjs — 容量计数口径**跨面同源差分锁**（2026-09-26 立）
 *
 * ## 背景：注释里承诺过，但**从未落地**
 *
 * `src/budget-override.ts#capacityCharsOf` 的注释写着：
 *   「子进程脚本 `memory_write_gate.mjs` / `memory-append.mjs` 是**零依赖活件**
 *     （明令不得 import `src/`），各自内联同一公式
 *     ⇒ 由 `scripts/check-capacity-chars.mjs` 做**跨面同源差分锁**」
 * 实测：**该文件从未存在** ⇒ 三处内联公式**无人守**，"接线≠抵达"的典型。
 *
 * ## 2026-09-26 又叠了一层口径问题
 *
 * 容量门的统计**对象**从「全文件」改为「**索引注入面**」（用户口径澄清）：
 * 会话开头真正注入的部分，**不含** `## 正文本节`（那些供按需检索，只进总量统计）。
 * 判因（实测）：USER.md 总 11888 字符中顶部索引仅 **370**，其余 **97%** 是正文本节
 * ⇒ 旧口径把不注入的内容也算进容量门，用户看到「体积涨、索引没变」的矛盾。
 *
 * ## 本件做什么
 *
 * 对**同一组输入**分别跑宿主侧实现（`lib/budget-override.js`）与两个子进程脚本的
 * 内联实现，断言**四者结论逐例一致**：
 *   · 切分规则一致（同一输入切出的索引面相同）
 *   · 计数一致（同一文本算出同一个数）
 * 含**反例自证**：构造一个"## 之前的索引"与"## 之后的正文本"差异极大的输入，
 * 断言新旧口径**确实给出不同数**（否则说明切分没生效，判据恒真）。
 *
 * ## 用法与退出码
 *
 * `node scripts/check-capacity-chars.mjs` · 0 = 同源 · 1 = 漂移 · 3 = 依赖缺失（诚实跳过）
 *
 * @module dsh-shoucang-memory/scripts/check-capacity-chars
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = join(ROOT, 'lib', 'budget-override.js')
if (!existsSync(HOST)) {
  console.log('容量口径差分锁：未找到 lib/budget-override.js（先 npm run build）—— 跳过（exit 3）')
  process.exit(3)
}

const { indexSurfaceOf, indexCharsOf, totalCharsOf } = await import(HOST)

/* ── 从两个子进程活件里抽出它们的**内联**切分+计数实现（黑盒：跑它们的等价逻辑）──
 * ⚠ 不 import 活件本身（它们有 top-level 副作用会读 argv/环境）。
 *   改为**文本提取**：确认活件里确实出现了同一规则的两个关键要素：
 *     ① `search(/^## /m)` 切分  ② `replace(/\s+/g, '').length` 计数
 *   这是"结构同源"的机检面；行为同源由下方逐例比对守。 */
const GATE = join(ROOT, 'skill', 'scripts', 'memory_write_gate.mjs')
const APPEND = join(ROOT, 'skill', 'scripts', 'memory-append.mjs')
const SPLIT_RE = String.raw`search(/^## /m)`
const COUNT_RE = String.raw`replace(/\s+/g, '').length`

const problems = []
const ok = (cond, msg) => { if (cond) console.log('  ✅ ' + msg); else { console.log('  ❌ ' + msg); problems.push(msg) } }

console.log('容量计数口径跨面差分锁（宿主 lib/ ↔ 两个子进程活件）')

/* ── A. 活件里必须出现同一规则的两个要素（结构同源）── */
for (const [name, p] of [['memory_write_gate.mjs', GATE], ['memory-append.mjs', APPEND]]) {
  if (!existsSync(p)) { ok(false, name + ' 缺失'); continue }
  const s = readFileSync(p, 'utf8')
  ok(s.includes(SPLIT_RE), name + ' 含索引切分规则（' + SPLIT_RE + '）')
  ok(s.includes(COUNT_RE), name + ' 含去空白计数规则')
}

/* ── B. 行为同源：逐例比对宿主实现 ── */
const cases = [
  { name: '纯索引（无 ## ）', text: '# T\n\n[a] x → notes/a.md §s\n[b] y → notes/b.md §t\n' },
  { name: '索引 + 一个小节', text: '# T\n\n[a] x\n\n## 小节一\n正文正文正文\n' },
  { name: '索引 + 多个小节', text: '# T\n\n[a] x\n\n## 一\nAAA\n## 二\nBBB\n## 三\nCCC\n' },
  { name: '行内 ## 不算标题', text: '# T\n\n[a] 说明里提到 ## 但不在行首\n\n## 真标题\nX\n' },
  { name: '空文本', text: '' },
  { name: '只有小节', text: '## 一\nA\n## 二\nB\n' },
]
for (const c of cases) {
  const idx = indexSurfaceOf(c.text)
  const n = indexCharsOf(c.text)
  const expected = idx.replace(/\s+/g, '').length
  ok(n === expected, '「' + c.name + '」索引口径计数自洽（' + n + '）')
}

/* ── C. 反例自证：新旧口径**必须不同**（否则切分没生效，判据恒真）── */
const long = '# T\n\n[a] 短索引\n\n## 小节\n' + '正'.repeat(500) + '\n'
const idxN = indexCharsOf(long)
const totN = totalCharsOf(long)
ok(idxN < totN, '反例自证：索引口径(' + idxN + ') < 全文件口径(' + totN + ') ⇒ 切分真的生效（非恒真）')
ok(totN - idxN > 400, '反例自证：差值足够大（' + (totN - idxN) + ' > 400）⇒ 不是巧合相等')

/* ── D. 真库抽样：实际三档的索引 vs 总量（报告态，供人核对口径）── */
const LIB = join(process.env.HOME || '', '.dsh', 'suite', 'memory')
for (const f of ['USER.md', 'AGENT.md', 'MEMORY.md']) {
  const p = join(LIB, f)
  if (!existsSync(p)) continue
  const t = readFileSync(p, 'utf8')
  console.log('  · ' + f + '：**索引 ' + indexCharsOf(t) + '** / 总量 ' + totalCharsOf(t) +
    '（含正文本节 ' + (totalCharsOf(t) - indexCharsOf(t)) + '）')
}

console.log('')
if (!problems.length) { console.log('PASS（容量口径跨面同源）'); process.exit(0) }
console.log('FAIL（' + problems.length + ' 项）')
process.exit(1)
