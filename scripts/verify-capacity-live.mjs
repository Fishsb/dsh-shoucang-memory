/**
 * verify-capacity-live.mjs — ADR-333 **真机生效性验证**（走安装副本的真实代码路径）
 *
 * 为什么需要它（`[原则] 结果验证重实证`）：`check-installed-features` 查的是"文件里有没有标记"
 *   ——那是**代理指标**（文件里有 ≠ 运行时会走那条路）。本件走**真机库 + 真安装副本代码**，
 *   实测「开关两态的判决差异」，且**只写副本、真库零改动**。
 *
 * 判据：
 *   V1 缺省（未设键）⇒ 不阻断 ⇒ 超限画像行**能写进去**（这是用户报的"画像不增长"的直接解药）
 *   V2 开关置 true ⇒ 同一行**被拒**（恢复改造前行为）
 *   V3 真库前后 sha256 不变（R3：不改真源）
 *
 * 用法: node scripts/verify-capacity-live.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const INSTALL = join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'profiles', 'web', 'node_modules', 'dsh-shoucang-memory')
const LIB = join(INSTALL, 'lib', 'distill-write.js')
if (!existsSync(LIB)) { console.log('verify-capacity-live: skip（安装副本不存在）'); process.exit(3) }

const HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME, '.dsh')
const BANK = join(HOME, 'suite', 'memory')
const AGENT_MD = join(BANK, 'AGENT.md')

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const sha = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16) } catch { return '(缺)' } }

console.log('verify-capacity-live · ADR-333 真机生效性（走安装副本真实代码）\n')
const before = sha(AGENT_MD)
ok(existsSync(AGENT_MD), `真库 AGENT.md 存在（sha=${before}）`)

/* ── 复刻宿主调用面：用**安装副本的真实模块**，配一个只读真库的最小 dep ──────────────
 * 关键：`writeProfileLine` 经 `createWriteApi(dep)` 绑定。dep 的 config 由本件按场景构造，
 *   `liveCapacityEnforce` 读的是 `~/.dsh/suite/scheduler.json`（真文件）——
 *   故本件**不改那个文件**，而用 `DSH_HOME` 指向临时目录来模拟两态（零副作用）。 */
const tmpHome = mkdtempSync(join(tmpdir(), 'sc-live-'))
const tmpBank = join(tmpHome, 'suite', 'memory')
mkdirSync(tmpBank, { recursive: true })
// 造一份**超限**的 AGENT.md 副本（去空白 > 3000，确保落在容量判定区间）
//   ⚠ 首版用了 40 行 ⇒ 去空白仅 1883 字符，**样本不足** ⇒ V2/V3 全假绿（探针自己抓出来的）。
//     现按**目标字符数机械生成**并在断言里复核，杜绝"样本没到位导致判据恒真"。
const targetChars = 3600
let bigBody = '# AGENT.md\n\n## 大节\n'
let i = 0
while (capacityCharsOfLocal(bigBody) < targetChars) {
  bigBody += `- [原则] 填充行 ${i} · 用于触发容量判定的样本内容 → notes/lessons.md §假绿与实证\n`
  i++
  if (i > 500) break
}
function capacityCharsOfLocal(t) { return String(t || '').replace(/\s+/g, '').length }
writeFileSync(join(tmpBank, 'AGENT.md'), bigBody, 'utf8')
writeFileSync(join(tmpBank, 'USER.md'), '# USER.md\n', 'utf8')

const tmpSched = join(tmpHome, 'suite', 'scheduler.json')
process.env.DSH_HOME = tmpHome
process.env.MEMORY_ROOT = tmpBank

const mod = await import(new URL('file://' + LIB.replace(/\\/g, '/')).href)
const { capacityCharsOf } = await import(new URL('file://' + join(INSTALL, 'lib', 'budget-override.js').replace(/\\/g, '/')).href)

const mkDep = () => ({
  kRoot: tmpHome, pendDir: join(tmpHome, 'pending'), embedCfgOf: () => ({}),
  infra: { log: () => {}, audit: () => {}, ledger: () => {}, sidShort: () => 's' },
  cand: {}, llm: {}, st: {}, config: { nodeBin: 'node', capAgent: 3000, capUser: 3000, capMemory: 5000 },
})
const PROFILE_HEADER = {}
const api = mod.createWriteApi(mkDep())

const line = '- [原则] 真机探针行 · 超限态下应可写入 ← 源: distill probe 2026-09-22'
const bodyChars = capacityCharsOf(bigBody)
ok(bodyChars + capacityCharsOf(line) + 4 + 8 > 3000, `样本确属超限（去空白 ${bodyChars} + 行 ⇒ > 3000）`)

/* ── V1：缺省（scheduler.json 无 capacityEnforce）⇒ 不阻断 ───────────────────── */
writeFileSync(tmpSched, JSON.stringify({}), 'utf8')
const r1 = api.writeProfileLine(tmpBank, 'AGENT.md', '探针节', line)
ok(r1.st === 'added', `V1 缺省（未设键）⇒ 超限**照写**（st=${r1.st}）—— 这正是"画像不增长"的解药`)
const after1 = readFileSync(join(tmpBank, 'AGENT.md'), 'utf8')
ok(after1.includes('真机探针行'), 'V1 行为面：该行**确实落进文件**（不是只返回 added）')

/* ── V2：置 true ⇒ 拒写（恢复改造前） ─────────────────────────────────────── */
writeFileSync(tmpSched, JSON.stringify({ capacityEnforce: true }), 'utf8')
const r2 = api.writeProfileLine(tmpBank, 'AGENT.md', '探针节2', '- [原则] 第二条探针 · true 档应被拒 ← 源: distill probe2 2026-09-22')
ok(r2.st === 'rejected', `V2 enforce=true ⇒ 超限**被拒**（st=${r2.st}）—— 开关真的能双向控制`)
ok(/容量超限/.test(String(r2.why || '')), `V2 拒因文案：${String(r2.why || '').slice(0, 40)}…`)

/* ── V3：非法值回落 true（fail-safe） ─────────────────────────────────────── */
writeFileSync(tmpSched, JSON.stringify({ capacityEnforce: 'typo' }), 'utf8')
const r3 = api.writeProfileLine(tmpBank, 'AGENT.md', '探针节3', '- [原则] 第三条探针 · 非法值应回落 true ← 源: distill probe3 2026-09-22')
ok(r3.st === 'rejected', `V3 非法值 'typo' ⇒ 回落 true（st=${r3.st}，保守不擅自放宽）`)

/* ── 清理 + 真库零改动终检 ────────────────────────────────────────────────── */
delete process.env.DSH_HOME; delete process.env.MEMORY_ROOT
rmSync(tmpHome, { recursive: true, force: true })
ok(sha(AGENT_MD) === before, `V3 真库零改动：AGENT.md sha 未变（${before}）`)

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（真机两态可双向控制 · 真库零改动）')
process.exit(fail ? 1 : 0)
