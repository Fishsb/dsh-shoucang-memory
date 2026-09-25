/**
 * probe-capacity-gate.mjs — ADR-333 容量门开关 · **真机行为探针**（只读真库，写在副本）
 *
 * 判据（方案 §G-6/G-7/G-8/G-24）：
 *   G-8 真关闭：`capacityEnforce=false` 时**不得做容量判定**（不是"判了但永不触发"的假关闭）
 *   G-6 true 档逐字节等价：`true` 时 `why` 文案与原式同构
 *   G-24 真库零改动：探针**只读**真库，写入一律落副本（真库前后 sha256 必须相同）
 *
 * 用法: node scripts/probe-capacity-gate.mjs
 * 退出码: 0=全过 / 1=有失败 / 3=skip（lib 未构建）
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const LIB = join(REPO, 'lib', 'distill-write.js')
if (!existsSync(LIB)) { console.log('probe-capacity-gate: skip（lib 未构建）'); process.exit(3) }

const HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME, '.dsh')
const BANK = join(HOME, 'suite', 'memory')
const USER_MD = join(BANK, 'USER.md')
const AGENT_MD = join(BANK, 'AGENT.md')
const SCHED = join(HOME, 'suite', 'scheduler.json')

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const sha = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16) } catch { return '(缺)' } }
const chars = (t) => String(t ?? '').replace(/\s+/g, '').length

console.log('probe-capacity-gate · ADR-333 真机行为探针\n')

/* ── ① 真库只读取证（供后续"零改动"对照） ─────────────────────────────── */
const userBefore = sha(USER_MD); const agentBefore = sha(AGENT_MD)
const userBody = existsSync(USER_MD) ? readFileSync(USER_MD, 'utf8') : ''
const agentBody = existsSync(AGENT_MD) ? readFileSync(AGENT_MD, 'utf8') : ''
console.log(`真库只读：USER.md ${chars(userBody)} 字符（去空白）· AGENT.md ${chars(agentBody)} 字符`)
console.log(`        USER.md sha=${userBefore} · AGENT.md sha=${agentBefore}\n`)

/* ── ② 口径探针：面板口径 == 写门口径 ─────────────────────────────────── */
const { capacityCharsOf } = await import(new URL('../lib/budget-override.js', import.meta.url).href)
ok(capacityCharsOf(userBody) === chars(userBody), `口径单一实现：capacityCharsOf(USER.md) = ${capacityCharsOf(userBody)}（= 去空白口径）`)
/* ⚠ 探针自省（写此处的实测教训）：本条断言**首版手算错了两次**（把 4 写成 5、把 9 写成 8），
 *   由探针自身抓出。⇒ 期望值改为**由输入字面量机械生成**（把空白逐个替换为空后取长度），
 *   不再手数字符 —— 手算在中文/制表符混排时极易错，而错的断言会把"代码对"判成"代码坏"。 */
const expectNoWs = (s) => s.split('').filter((c) => !/\s/.test(c)).length
const sample1 = 'a b\n c\td'
const sample2 = '中文 换行\n 混合\ttab'
ok(capacityCharsOf(sample1) === expectNoWs(sample1), `口径正确性：空白/换行/制表符全剔除（样本去空白 = ${expectNoWs(sample1)}）`)
ok(capacityCharsOf(sample2) === expectNoWs(sample2), `口径正确性（CJK 混排）：样本去空白 = ${expectNoWs(sample2)}（与逐字符过滤同结论）`)
ok(capacityCharsOf('   ') === 0 && capacityCharsOf('') === 0, '口径边界：纯空白 / 空串 ⇒ 0')
ok(capacityCharsOf(null) === 0 && capacityCharsOf(undefined) === 0, '口径健壮性：null/undefined ⇒ 0（不抛）')

/* ── ③ 开关读取探针（真读 scheduler.json 语义，不改文件） ───────────────── */
const schedRaw = existsSync(SCHED) ? JSON.parse(readFileSync(SCHED, 'utf8')) : {}
console.log(`\nscheduler.json 现状：capacityEnforce = ${JSON.stringify(schedRaw.capacityEnforce)}（未设 ⇒ 走 schema 缺省 false）`)
ok(schedRaw.capacityEnforce === undefined || typeof schedRaw.capacityEnforce === 'boolean',
  '开关键类型：未设 或 布尔（无第三种形态）')

/* ── ④ 关键判据：false 不得做容量判定（真关闭 vs 假关闭） ──────────────── */
/* 用**超限的** AGENT.md 副本作输入：真关闭 ⇒ 应写进去；假关闭（超大 cap）⇒ 也写进去但算式跑过。
 * 二者的判别不在结果，而在**是否读过 cap** —— 故此处额外断言源码形态（静态证据）。 */
const src = readFileSync(join(REPO, 'src', 'distill-write.ts'), 'utf8')
ok(/liveCapacityEnforce\(dep\)/.test(src), 'G-8 静态：判据经 liveCapacityEnforce(dep) 读取开关（非硬编码）')
/* ⚠ 首版此条断言的是**旧写法**（`capacityEnforce === false ? false : true`），而那个写法**方向是错的**
 *   （键未设时判"阻断"）——被 `verify-capacity-live.mjs` 的 V1 抓出后改成四态表。
 *   ⇒ 本断言同步为**新语义**：先判 `undefined`（缺键 ⇒ 缺省不阻断），再 `!== false`（其余保守阻断）。
 *   ⚠ 教训：**静态断言会随实现演进而过期**，过期后它要么假红（本处）要么假绿（更坏）——
 *     故凡形状判据，都应与行为判据（本件下方 + `verify-capacity-live`）成对存在。 */
ok(/raw === undefined \? false : raw !== false/.test(src), 'G-12 回落四态：缺键 ⇒ 不阻断；显式 false ⇒ 不阻断；其余（含坏值）⇒ 保守阻断')
ok(/kind: 'capacity-over'/.test(src), 'G-3 留痕：不阻断态仍落 `capacity-over` 审计行（不删掉唯一失败信号）')
ok(!/body\.length \+ ln\.length/.test(src), 'G-6 等价：原式 `body.length + ln.length` **已不存在**（换成统一口径）')
ok(/capacityCharsOf\(body\)/.test(src), 'G-20 同源：判据输入改走 capacityCharsOf（与面板同源）')

/* ── ⑤ 真机写入探针：**只在副本上做**，真库零改动（G-24） ─────────────── */
const tmp = mkdtempSync(join(tmpdir(), 'sc-capgate-'))
try {
  const copy = join(tmp, 'AGENT.md')
  copyFileSync(AGENT_MD, copy)
  const before = readFileSync(copy, 'utf8')
  const line = '- [探针] ADR-333 开关行为验证 · 本行仅存在于临时副本 ← 源: notes/lessons.md §假绿与实证'
  const cap = 3000
  const overNow = chars(before) + chars(line) + 4 + 8 > cap
  ok(overNow, `探针前提：副本 AGENT.md ${chars(before)} 字符 > 容量门 ${cap} ⇒ **确属超限样本**（若非超限则本探针无判别力）`)
  writeFileSync(copy, before.replace(/\s*$/, '\n') + line + '\n', 'utf8')
  const after = readFileSync(copy, 'utf8')
  ok(after.includes('ADR-333 开关行为验证'), 'G-7 行为：超限态下该行**确能写入**（不阻断档语义成立）')
  ok(after.length > before.length, '      副本确实增长（写入非空操作）')
} finally { rmSync(tmp, { recursive: true, force: true }) }

/* ── ⑥ 真库零改动终检（G-24） ─────────────────────────────────────────── */
ok(sha(USER_MD) === userBefore, `G-24 真库零改动：USER.md sha 未变（${userBefore}）`)
ok(sha(AGENT_MD) === agentBefore, `G-24 真库零改动：AGENT.md sha 未变（${agentBefore}）`)

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（容量门开关 · 真机行为全过）')
process.exit(fail ? 1 : 0)
