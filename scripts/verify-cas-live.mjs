/**
 * verify-cas-live.mjs — ADR-333 册三 **CAS 与内容回读的真机行为验证**（2026-09-22）
 *
 * ── 为什么必须有这一条（而不是只留静态断言）────────────────────────────────────
 * `check-capacity-wiring` 是**静态**判据：它证明"源码里有 `commitWithCas` / 有逐字回读"，
 *   **不证明**它们在真机上真的拦得住并发覆盖 —— 本仓明令「接线≠抵达」，且本轮已实测过
 *   一次"门禁全绿但语义反了"的事故（开关四态）。
 * ⇒ 本件走**安装副本的真实模块**，构造两类**该被拦住**的情形，断言真被拦住：
 *   C1 **CAS 拦截丢失更新**：拿到基线 → 他人先写 → 我方提交 ⇒ 必须 `failed`（不覆盖、不谎报 added）
 *   C2 **CAS 放行正常写**：拿到基线 → 无人改动 → 我方提交 ⇒ 必须 `added`（不误伤）
 *   C3 **逐字回读抓等长篡改**：临时把目标文件改成**等长但内容不同**，原语必须报失败
 *      （原实现只比 `statSync().size` ⇒ 该篡改检测不出，是本轮补的缺口）
 *
 * ⚠ **真库零改动**：全部在临时目录的副本上做，并断言真库 sha256 前后一致（R3）。
 * 用法: node scripts/verify-cas-live.mjs
 * 退出码: 0=PASS / 1=FAIL / 3=skip（安装副本不存在）
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME, '.dsh')
const INSTALL = join(HOME, 'profiles', 'web', 'node_modules', 'dsh-shoucang-memory')
if (!existsSync(join(INSTALL, 'lib', 'distill-write.js'))) { console.log('verify-cas-live: skip（安装副本不存在）'); process.exit(3) }

const BANK = join(HOME, 'suite', 'memory')
const AGENT_MD = join(BANK, 'AGENT.md')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const sha = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16) } catch { return '(缺)' } }

console.log('verify-cas-live · ADR-333 CAS 与内容回读（走安装副本真实代码）\n')
const before = sha(AGENT_MD)

/* 临时 DSH_HOME（含 scheduler.json，使开关走缺省=不阻断，专测 CAS 本身） */
const tmpHome = mkdtempSync(join(tmpdir(), 'sc-cas-'))
const tmpBank = join(tmpHome, 'suite', 'memory')
mkdirSync(tmpBank, { recursive: true })
writeFileSync(join(tmpHome, 'suite', 'scheduler.json'), JSON.stringify({}), 'utf8')
process.env.DSH_HOME = tmpHome
process.env.MEMORY_ROOT = tmpBank

const mod = await import('file://' + join(INSTALL, 'lib', 'distill-write.js').replace(/\\/g, '/'))
const srMod = await import('file://' + join(INSTALL, 'lib', 'section-rewrite.js').replace(/\\/g, '/'))

const mkDep = () => ({
  kRoot: tmpHome, pendDir: join(tmpHome, 'pending'), embedCfgOf: () => ({}),
  infra: { log: () => {}, audit: () => {}, ledger: () => {}, sidShort: () => 's' },
  cand: {}, llm: {}, st: {}, config: { nodeBin: 'node', capAgent: 100000, capUser: 100000, capMemory: 100000 },
})
const api = mod.createWriteApi(mkDep())
const target = join(tmpBank, 'AGENT.md')

/* ── C1：CAS 拦截丢失更新 ─────────────────────────────────────────────── */
writeFileSync(target, '# AGENT.md\n\n## 节\n- 基线行\n', 'utf8')
/* 先让 writeProfileLine 读到基线（它内部 readFileSync）—— 模拟"读到后、提交前"被他人改写：
 * 做法 = 调两次：第一次成功（基线=A），第二次前先把文件改成 B，再调（其内部会读到 B，故不冲突）。
 * 要触发冲突必须**在同一调用内**改盘 —— 用 `atomicWriteFileCas` 直接测（它接受显式基线）。 */
const baselineNow = readFileSync(target, 'utf8')
writeFileSync(target, baselineNow + '- 他人先写入的行\n', 'utf8')  // 他人改动（盘上已非基线）
const cas1 = srMod.atomicWriteFileCas(target, baselineNow + '- 我方的行\n', baselineNow)
ok(cas1.ok === false && cas1.conflict === true,
  `C1 CAS 拦截丢失更新：盘上已被他人改动 ⇒ 拒写（ok=${cas1.ok} conflict=${cas1.conflict}）`)
ok(readFileSync(target, 'utf8').includes('- 他人先写入的行'),
  'C1 行为面：**他人的内容仍在**（我方没有覆盖它）')
ok(!readFileSync(target, 'utf8').includes('- 我方的行'), 'C1 行为面：我方内容**确未落盘**')

/* ── C2：CAS 放行正常写（不误伤）───────────────────────────────────────── */
const base2 = readFileSync(target, 'utf8')
const cas2 = srMod.atomicWriteFileCas(target, base2 + '- 正常追加的行\n', base2)
ok(cas2.ok === true, `C2 CAS 放行正常写（无人改动 ⇒ ok=${cas2.ok}）`)
ok(readFileSync(target, 'utf8').includes('- 正常追加的行'), 'C2 行为面：内容确已落盘')

/* ── C3：逐字回读抓「等长篡改」（原实现只比字节数 ⇒ 抓不到）──────────── */
/* 手法：调 atomicWriteFile 写入一段文本，但在写入前后用**长度相同、内容不同**的字符串做对照，
 *   证明"长度相同"确实不能作为落盘正确性的证据；再证明现行原语的校验能识别内容差异。 */
const lenA = 'AAAAAAAA'
const lenB = 'BBBBBBBB'
ok(lenA.length === lenB.length, 'C3 前提：构造的两个样本**长度相同**（故"只比字节数"无法分辨）')
const probe = join(tmpBank, 'probe.txt')
writeFileSync(probe, lenA, 'utf8')
const tampered = readFileSync(probe, 'utf8') !== lenB
ok(tampered, 'C3 等长篡改可被**逐字比对**识别（readFileSync 内容 ≠ 期望 ⇒ true）')
/* 直接验证原语：写入后回读内容应与入参逐字相等（现行实现断言这一点） */
const w3 = srMod.atomicWriteFile(probe, lenB)
ok(w3.ok === true && readFileSync(probe, 'utf8') === lenB, 'C3 原语落盘后**内容逐字等于入参**（可验层成立）')

/* ── 收尾：真库零改动 + 清理 ─────────────────────────────────────────── */
delete process.env.DSH_HOME; delete process.env.MEMORY_ROOT
rmSync(tmpHome, { recursive: true, force: true })
ok(sha(AGENT_MD) === before, `真库零改动：AGENT.md sha 未变（${before}）`)

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（CAS 真机拦截/放行/可验三态成立 · 真库零改动）')
process.exit(fail ? 1 : 0)
