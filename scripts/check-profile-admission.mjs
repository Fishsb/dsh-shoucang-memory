// check-profile-admission.mjs — 册三机检（第二件）：**画像行的 § 准入**（docs/pointer-supply-plan.md §5-2，补 G4）
//
// 判因（方案 §2.2 G4）：索引行（`MEMORY.md`）已有**唯一强制点** `admitIndexRow`，而**画像通道**
//   （`USER.md`/`AGENT.md` 行内的 `← 源: notes/x.md §y`）**无任何判据** —— 真库实测该口**存量 10 行**
//   （AGENT 5 / USER 5），当前 **0 悬空** ⇒ 属**潜在口**（不是已发生的事故）。本件把它补上并机检。
//
// 本件锁四件：
//   ① 悬空源指针 ⇒ **拒写**（`writeProfileLine` 返回 rejected）且**文件未被修改**（零副写）；
//   ② 阴性对照：**合法**源指针 ⇒ 照常 `added`（不误杀，且确实落盘）；
//   ③ **存量不动**：真库 AGENT/USER 里带 `← 源: notes/` 的**每一行**都必须 `admitIndexRow.ok === true`
//      （口径：只堵新口，不动存量；数目显式打印，库不可读则**显式跳过**而非冒充 0）；
//   ④ 判据判别力（反例自证）：同一条 `admitIndexRow` 对悬空行判 false、对合法行判 true ⇒ 不是恒真。
// 先红：改造前 `writeProfileLine` 里没有 § 判据 ⇒ ① 会**落盘**（rejected 变 added）。用例见本件（对真实现驱动）。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createWriteApi } from '../lib/distill-write.js'
import { admitIndexRow } from '../lib/section-ref.js'
import { newDistillState } from '../lib/distill-state.js'
import { memoryLibRoot } from '../lib/targets.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }
const note = (m) => P.push(`NOTE  ${m}`)

const root = mkdtempSync(join(tmpdir(), 'profile-adm-'))
mkdirSync(join(root, 'notes'), { recursive: true })
writeFileSync(join(root, 'notes', 'lessons.md'), ['# lessons', '', '## 存在的小节', '正文', ''].join('\n'), 'utf8')
writeFileSync(join(root, 'AGENT.md'), ['# AGENT.md', '', '## 边界', '- [边界] 既有行 · 概况 ← 源: notes/lessons.md §存在的小节', ''].join('\n'), 'utf8')
const AGENT = join(root, 'AGENT.md')

const api = createWriteApi({
  kRoot: root, pendDir: join(root, 'pending'), embedCfgOf: () => ({ enabled: false }),
  infra: { log: () => {}, audit: () => {}, ledger: () => {}, sidShort: (s) => String(s).slice(0, 8), recordStub: () => {}, manifest: () => {}, recordEpisode: () => {} },
  cand: { intentTokens: () => [], cardTokens: () => [], cardSimilar: () => 0 },
  llm: {}, st: newDistillState(), config: { capAgent: 3000, capUser: 3000, capMemory: 5000 },
})

// ── ① 悬空源指针 ⇒ 拒写 + 零副写 ──
{
  const before = readFileSync(AGENT, 'utf8')
  const r = api.writeProfileLine(root, 'AGENT.md', '边界', '- [边界] 探针甲 · 概况短语 ← 源: notes/lessons.md §根本不存在的节')
  const after = readFileSync(AGENT, 'utf8')
  ok('① 悬空源指针 ⇒ rejected（拒写）', r.st === 'rejected', JSON.stringify(r))
  ok('① 拒绝原因指明悬空指针（可操作）', r.st === 'rejected' && /悬空/.test(r.why) && /根本不存在的节/.test(r.why), r.st === 'rejected' ? r.why : '')
  ok('① 拒写时**文件未被修改**（零副写）', after === before)
}

// ── ② 阴性对照：合法指针照常落盘 ──
{
  const r = api.writeProfileLine(root, 'AGENT.md', '边界', '- [边界] 探针乙 · 概况短语 ← 源: notes/lessons.md §存在的小节')
  const after = readFileSync(AGENT, 'utf8')
  ok('② 合法源指针 ⇒ added（不误杀）', r.st === 'added', JSON.stringify(r))
  ok('② 且确实落盘', after.includes('探针乙'))
  ok('② 幂等：同内容再写 ⇒ dedup（既有语义未破）', api.writeProfileLine(root, 'AGENT.md', '边界', '- [边界] 探针乙 · 概况短语 ← 源: notes/lessons.md §存在的小节').st === 'dedup')
}

// ── ③ 真库存量：只堵新口、不动存量 ──
{
  const bank = memoryLibRoot()
  const rows = []
  for (const f of ['AGENT.md', 'USER.md']) {
    const p = join(bank, f)
    if (!existsSync(p)) continue
    for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) if (l.includes('← 源: notes/')) rows.push(l.trim())
  }
  if (!rows.length) note('③ 真库存量检查跳过（库不可读或该口 0 行）—— 显式跳过，不冒充"全绿"')
  else {
    const bads = rows.filter((l) => !admitIndexRow(bank, l).ok)
    ok(`③ 真库存量全部可通过同判据（${rows.length} 行）`, bads.length === 0, bads.slice(0, 2).join(' | '))
    note(`③ 存量口读数：${rows.length} 行（AGENT/USER 合计）`)
  }
}

// ── ④ 判别力（反例自证）：同一实现，悬空 false / 合法 true ──
{
  const lineBad = '- [边界] X · Y ← 源: notes/lessons.md §根本不存在的节'
  const lineGood = '- [边界] X · Y ← 源: notes/lessons.md §存在的小节'
  ok('④ 判据有判别力（悬空 false / 合法 true）', admitIndexRow(root, lineBad).ok === false && admitIndexRow(root, lineGood).ok === true)
  const src = readFileSync(join(ROOT, 'src', 'distill-write.ts'), 'utf8')
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const fnAt = body.indexOf('const writeProfileLine')
  const fnBody = fnAt >= 0 ? body.slice(fnAt, fnAt + 4000) : ''
  ok('④ 画像写入路径**真的**调用同一判据（接线 ≠ 仅注释）', fnBody.includes('admitIndexRow('))
}

for (const l of P) console.log(l)
console.log(bad ? `\n❌ check-profile-admission: ${bad} 条断言未通过` : '\n✅ check-profile-admission: 全绿')
process.exit(bad ? 1 : 0)
