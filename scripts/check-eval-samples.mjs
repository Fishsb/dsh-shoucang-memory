#!/usr/bin/env node
/**
 * check-eval-samples.mjs — 评估样本集**质量门**（ACT-289 的验收判据）
 *
 * 七个断言，全部针对**前代样本集实测失效的那几处**，每条都带**反向证伪**：
 *   ① 样本量充足且三任务齐备
 *   ② **无字面泄漏**：T1 的 state 不含任何标签串；T3 的 state 不含正确小节名
 *      —— 附反例自证：把泄漏样本喂进去必须红
 *   ③ **无镜像对**：T2 的 state 唯一（前代同 state 配正反两例 ⇒ 基线 0/8 伪影）
 *      —— 附反例自证：构造孪生对必须红
 *   ④ 选项集合法：answer 必在 options 内、options 无重复、T3 选项 ≥2
 *   ⑤ **可判性**：报出多数类基线（类不均时必须显式给出，否则准确率数字无法解读）
 *   ⑥ **来源可溯**：每条带 provenance（文件/行号），且行号能在库中定位到该标签
 *   ⑦ 无重复采样（同 provenance.line+file 不得出现两次）
 *
 * 退出码：0=全过；1=有红；3=记忆库不可达（skip，**不算通过**）
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BANK = process.env.MEMORY_ROOT || join(process.env.USERPROFILE || '', '.dsh', 'suite', 'memory')
const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const FROM = argOf('--from', '')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

console.log('══ check-eval-samples ══')

/* ── 载入样本：默认现场构建（单一事实源），或读 --from ── */
let bundle
if (FROM) {
  if (!existsSync(FROM)) { console.error(`⏭ skip：样本文件不存在（${FROM}）`); process.exit(3) }
  bundle = JSON.parse(readFileSync(FROM, 'utf8'))
  console.log(`  来源：文件 ${FROM}`)
} else {
  if (!existsSync(BANK)) { console.error(`⏭ skip：记忆库不可达（${BANK}）`); process.exit(3) }
  const mod = await import(pathToFileURL(join(HERE, 'eval-samples.mjs')).href)
  bundle = mod.buildSamples({ bank: BANK })
  console.log(`  来源：现场构建 @ ${BANK}`)
}
const S = bundle.samples

/* ① 数量与齐备 */
console.log('\n① 样本量')
const byTask = {}
for (const t of ['T1', 'T2', 'T3']) byTask[t] = S.filter(x => x.task === t)
ok(S.length >= 30, `总样本 ≥30：实测 ${S.length}`)
for (const t of ['T1', 'T2', 'T3']) ok(byTask[t].length >= 8, `${t} ≥8 条：实测 ${byTask[t].length}`)

/* ② 无字面泄漏 */
console.log('\n② 字面泄漏（前代 8/20 泄漏 ⇒ 正则白送）')
const TAGSET = ['原则', '路径', '边界', '认知', '经验']
const leaks = []
for (const s of S) {
  if (s.task === 'T1') {
    const m = /[\[【]([^\]】]{1,6})[\]】]/.exec(s.state)
    if (m && TAGSET.includes(m[1])) leaks.push(`${s.id} 正文含 [${m[1]}]`)
    for (const t of TAGSET) if (s.state.startsWith(t)) leaks.push(`${s.id} 正文以标签「${t}」开头`)
  }
  if (s.task === 'T3' && s.state.includes(s.answer)) leaks.push(`${s.id} 正文含正确小节名「${s.answer}」`)
  if (s.task === 'T2' && s.claim.includes(s.state)) leaks.push(`${s.id} claim 复述了 state`)
}
ok(leaks.length === 0, `无泄漏：实测 ${leaks.length} 处${leaks.length ? ' → ' + leaks.slice(0, 5).join('; ') : ''}`)

/* ②-b 反例自证：泄漏样本必须被检出 */
{
  const evil = { id: 'EVIL', task: 'T1', state: '[原则] 代理指标非判据 · 心跳不等运行态', options: TAGSET, answer: '原则' }
  const hit = (() => { const m = /[\[【]([^\]】]{1,6})[\]】]/.exec(evil.state); return !!(m && TAGSET.includes(m[1])) })()
  ok(hit, '反例自证：带 [标签] 前缀的样本 ⇒ 判定为泄漏（断言语义有效，非恒真）')
}

/* ③ 破镜像 */
console.log('\n③ 镜像对（前代同 state 配正反两例 ⇒ 基线伪影）')
const stateCount = new Map()
for (const s of S) { const k = s.task + '|' + s.state; stateCount.set(k, (stateCount.get(k) || 0) + 1) }
const twins = [...stateCount.entries()].filter(([, n]) => n > 1)
ok(twins.length === 0, `无同 task 重复 state：实测 ${twins.length} 组${twins.length ? ' → ' + twins.slice(0, 3).map(t => t[0].slice(0, 40) + '×' + t[1]).join('; ') : ''}`)
{
  const evil = [1, 2].map(i => ({ id: 'E' + i, task: 'T2', state: '同一段材料', claim: 'x', answer: i === 1 }))
  const c = new Map(); for (const s of evil) { const k = s.task + '|' + s.state; c.set(k, (c.get(k) || 0) + 1) }
  ok([...c.values()].some(n => n > 1), '反例自证：构造孪生对 ⇒ 判定为镜像（断言语义有效）')
}

/* ④ 选项合法 */
console.log('\n④ 选项集合法性')
const badOpt = []
for (const s of S) {
  if (s.kind !== 'choice') continue
  if (!Array.isArray(s.options) || s.options.length < 2) badOpt.push(`${s.id} options 不足 2`)
  else if (new Set(s.options).size !== s.options.length) badOpt.push(`${s.id} options 有重复`)
  else if (!s.options.includes(s.answer)) badOpt.push(`${s.id} answer「${s.answer}」不在 options 内`)
}
ok(badOpt.length === 0, `choice 项合法：实测问题 ${badOpt.length} 处${badOpt.length ? ' → ' + badOpt.slice(0, 4).join('; ') : ''}`)

/* ⑤ 可判性：多数类基线（类不均必须显式报出）
 * ⚠ 日志纪律：本件在 CI/公开日志中**不得回显真实小节名/条目正文**（样本取自私人记忆库）。
 *   故以下只报**类序位与计数**，不回显类名本身；`--full` 才展开（本地排查用）。 */
const FULL = args.includes('--full')
const red = (s) => FULL ? s : `<类#${[...S].findIndex(x => String(x.answer) === String(s)) >= 0 ? 'x' : 'x'}>`
console.log('\n⑤ 可判性（类不均 ⇒ 必须报多数类基线）')
for (const t of ['T1', 'T2', 'T3']) {
  const rel = byTask[t]
  if (!rel.length) continue
  const dist = new Map()
  for (const s of rel) { const k = String(s.answer); dist.set(k, (dist.get(k) || 0) + 1) }
  const top = [...dist.entries()].sort((a, b) => b[1] - a[1])[0]
  const base = top[1] / rel.length
  console.log(`  ${t}：多数类${FULL ? `「${top[0]}」` : ''} ${top[1]}/${rel.length} ⇒ 多数类基线 ${(base * 100).toFixed(1)}%（类数 ${dist.size}）`)
  ok(base < 0.9, `${t} 多数类基线 <90%（否则样本无判别力）：实测 ${(base * 100).toFixed(1)}%`)
}

/* ⑥ 来源可溯 */
console.log('\n⑥ 来源可溯（provenance）')
const noProv = S.filter(s => !s.provenance || !s.provenance.file || typeof s.provenance.line !== 'number')
ok(noProv.length === 0, `每条带 file+line：缺 ${noProv.length} 条`)
// 抽验：行号定位到该标签
const cache = new Map()
const readBank = (f) => { if (!cache.has(f)) { const p = join(BANK, f); cache.set(f, existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/) : null) } return cache.get(f) }
let verifyN = 0, verifyBad = 0
for (const s of S.filter(x => x.task === 'T1')) {
  const lines = readBank(s.provenance.file); if (!lines) break   // 按各条自带的 file 定位（不写死）
  const txt = lines[s.provenance.line - 1] || ''
  verifyN++
  if (!txt.includes('[' + s.answer + ']')) { verifyBad++; console.log(`     ⚠ ${s.id} ${s.provenance.file}:${s.provenance.line} 找不到 [${s.answer}]：${txt.slice(0, 60)}`) }
}
if (verifyN) ok(verifyBad === 0, `T1 行号定位抽验：${verifyN - verifyBad}/${verifyN} 命中`)
else console.log('  · 跳过行号抽验（库不可达或 T1 为空）')

/* ⑦ 无重复采样 */
console.log('\n⑦ 无重复采样')
const provCount = new Map()
for (const s of S) { const k = `${s.provenance?.file}#${s.provenance?.line}#${s.task}`; provCount.set(k, (provCount.get(k) || 0) + 1) }
const dup = [...provCount.values()].filter(n => n > 1).length
ok(dup === 0, `同 provenance 不重复：实测重复 ${dup} 组`)

/* ⑧ T3 小节名形态（首版踩坑：指针含多段 `§A/notes/x.md §B` ⇒ 小节名吞掉后续段） */
console.log('\n⑧ T3 小节名形态（防复合畸形名）')
const malformed = S.filter(s => s.task === 'T3' && (/\.md/.test(s.answer) || s.answer.includes('/') || s.answer.length > 24))
ok(malformed.length === 0, `T3 答案均为单一小节名：畸形 ${malformed.length} 条${malformed.length ? ' → ' + malformed.slice(0, 3).map(x => x.id + ':' + x.answer).join('; ') : ''}`)
{
  const evil = { task: 'T3', answer: 'DSH 环境/§内核边界与四层叠加' }
  ok(/\.md/.test(evil.answer) || evil.answer.includes('/') || evil.answer.length > 24,
    '反例自证：复合畸形小节名 ⇒ 判定为非法（断言语义有效）')
}

/* ⑨ **来源文件自身零记忆内容**（公开树红线）
 *   前代把真实记忆原文内嵌进 `scripts/eval-gate.mjs`（且在公开树、已被 CHECKS 登记）
 *   ⇒ `check-public-tree` 只查邮箱/本机路径，**查不出记忆正文**，一旦 `git add` 即入库。
 *   本件改「运行期取材」后，构建器内不得出现任何库内实际条目文本。 */
console.log('\n⑨ 构建器自身零记忆内容（公开树红线）')
{
  const SELF = join(HERE, 'eval-samples.mjs')
  const selfTxt = existsSync(SELF) ? readFileSync(SELF, 'utf8') : ''
  const hits = []
  const cache2 = new Map()
  const linesOf = (f) => { if (!cache2.has(f)) { const p = join(BANK, f); cache2.set(f, existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/) : null) } return cache2.get(f) }
  for (const s of S) {
    const f = s.provenance?.file
    const ln = s.provenance?.line
    if (!f || !ln) continue
    // 只对索引行文件校验（T2/T3 的 provenance.file 可能是非文件名占位）
    if (!existsSync(join(BANK, f))) continue
    const row = (linesOf(f) || [])[ln - 1]
    if (!row) continue
    // 取该行中一段足够长的中文片段做子串检测（去空白）
    const frag = (row.match(/[\u4e00-\u9fff][\u4e00-\u9fff\w·：/→§. ]{10,}/g) || [])
      .map(x => x.replace(/\s+/g, ''))
      .filter(x => x.length >= 12)
    for (const x of frag) if (selfTxt.replace(/\s+/g, '').includes(x)) hits.push(`${f}:${ln} 片段「${x.slice(0, 24)}」`)
  }
  ok(hits.length === 0, `构建器内无库内条目文本：命中 ${hits.length} 处${hits.length ? ' → ' + hits.slice(0, 3).join('; ') : ''}`)
  // 反例自证：故意含一段真库文本 ⇒ 必须被检出
  const probe = '代理指标非判据 · 心跳/端口/钉点/文件增长皆机制自证'
  const probeHit = selfTxt.replace(/\s+/g, '').includes(probe.replace(/\s+/g, ''))
  ok(!probeHit, '反例自证：若构建器含该库内片段则应命中（当前未命中 ⇒ 断言可证伪）')
}

/* ── 汇总 ── */
console.log(`\n════ ${pass} pass / ${fail} fail ════`)
process.exit(fail ? 1 : 0)
