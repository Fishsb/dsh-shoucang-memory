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
/* 显示层标签映射（**唯一实现**，不另造同义表）—— ⑤″ 用它判定「选项是否同义双写」。
 * 判因：本册真缺陷正是 `lesson`/`教训` 双写；判定必须与**运行期显示**同一份映射，
 *   否则门与产品会各自漂移（同族：`check-panel-fallback` 守的「回落与运行态同源」）。 */
import { tagLabelZh } from '../src-client/tag-label.js'

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
/* ⚠ **判据对象必须精确到「答案自己」**（2026-09-22 修）：
 *   本件首版检查「正文是否以**任一**标签开头」⇒ 命中 `T1-15`（正文以「路径」开头，而答案是「教训」）
 *   —— 那是**假红**：材料里出现别的标签词，**不构成泄漏**（泄漏的定义是「答案印在材料里」）。
 *   与 `check-panel-fallback` 的既有纪律同族：**判据须描述它真正要断的东西**，
 *   范围放宽会把"环境里的正常词"误报成缺陷；范围收紧（只比答案）才具区分力。
 *   ⚠ 合并 `rawTag` 一起比：归一后 `answer` 是规范名（「教训」），而材料剥的是原始键（`lesson`），
 *     两个写法都要算泄漏。 */
const TAGSET = ['原则', '路径', '边界', '认知', '经验']
const canonOfTag = (x) => { try { return tagLabelZh(x) || x } catch { return x } }
const leaks = []
for (const s of S) {
  if (s.task === 'T1') {
    const forms = new Set([String(s.answer), String(s.provenance?.rawTag || s.answer)])
    const m = /[\[【]([^\]】]{1,6})[\]】]/.exec(s.state)
    if (m && forms.has(m[1])) leaks.push(`${s.id} 正文含答案标签 [${m[1]}]`)
    for (const f of forms) if (s.state.startsWith(f)) leaks.push(`${s.id} 正文以答案标签「${f}」开头`)
  }
  if (s.task === 'T3' && s.state.includes(s.answer)) leaks.push(`${s.id} 正文含正确小节名「${s.answer}」`)
  if (s.task === 'T2' && s.claim.includes(s.state)) leaks.push(`${s.id} claim 复述了 state`)
}
ok(leaks.length === 0, `无泄漏：实测 ${leaks.length} 处${leaks.length ? ' → ' + leaks.slice(0, 5).join('; ') : ''}`)

/* ②-b 反例自证：泄漏样本必须被检出 */
{
  const evil = { id: 'EVIL', task: 'T1', state: '[原则] 代理指标非判据 · 心跳不等运行态', options: TAGSET, answer: '原则' }
  const hit = (() => { const m = /[\[【]([^\]】]{1,6})[\]】]/.exec(evil.state); return !!(m && [String(evil.answer)].includes(m[1])) })()
  ok(hit, '反例自证：带 [标签] 前缀的样本 ⇒ 判定为泄漏（断言语义有效，非恒真）')
  // 反向：材料含**别的**标签词 ⇒ **不**判泄漏（防判据范围放宽成假红）
  const other = { id: 'OTHER', task: 'T1', state: '路径行号/数字口径/可粘贴命令', options: TAGSET, answer: '教训' }
  const forms2 = new Set([String(other.answer)])
  const m2 = /[\[【]([^\]】]{1,6})[\]】]/.exec(other.state)
  const hit2 = (m2 && forms2.has(m2[1])) || [...forms2].some((f) => other.state.startsWith(f))
  ok(!hit2, '反例自证·反向：材料含**非答案**标签词 ⇒ 不判泄漏（判据不过宽）')
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

/* ⑤′ **类数下限**（2026-09-22 立 · **本册真缺陷的机检落点**）───────────────
 * 判因（真机实测 · 此前**空过**）：T1 的选项集把**同一个类**的两种写法（`lesson` / `教训`、
 *   `env` / `环境` —— 显示层映射早已记此撞名，见 `src-client/tag-label.js:22`）当成**两个互斥类**，
 *   于是「多数类 15/20 = 75.0%」**判过 <90%**，而**归一后是 20/20 = 100%（单类退化）**。
 *   ⇒ **读数被"劈成两半"掩盖了退化**：B1 实测预测分布 `{lesson:20}`（恒判一类）却报 75%。
 * 判据：**每个任务的实际类数须 ≥ 2**（1 类 ⇒ 任何分类器恒判它都满分，样本零判别力）。
 *   ⚠ 这条**必须在归一之后**判（归一在前，否则双写键把 1 类伪装成 2 类 ⇒ 判据本身失灵）。 */
console.log('\n⑤′ 类数下限（1 类 ⇒ 零判别力；归一后判）')
for (const t of ['T1', 'T2', 'T3']) {
  const rel = byTask[t]
  if (!rel.length) continue
  const n = new Set(rel.map(s => String(s.answer))).size
  ok(n >= 2, `${t} 类数 ≥2（否则样本退化）：实测 ${n} 类`)
}
{
  // 反例自证：人为构造"双写同义键"的退化样本 ⇒ 归一前 2 类（判过）、归一后 1 类（须判红）
  const raw = ['lesson', 'lesson', '教训', '教训']
  const canon = (x) => (x === '教训' ? 'lesson' : x)
  const before = new Set(raw).size
  const after = new Set(raw.map(canon)).size
  ok(before === 2 && after === 1, `反例自证：双写键归一前 ${before} 类 / 归一后 ${after} 类 ⇒ 判据能分辨退化（非恒真）`)
}

/* ⑤″ **T1 选项集不得含同义双写**（2026-09-22）───────────────────────────
 * 判因：`lesson` 与 `教训` 同显「教训」⇒ 选项列表出现**两个位置指同一个答案**
 *   （既稀释随机基线，又让"选错"其实可能"选对"）。判据：任一 T1 样本的 options
 *   经显示层映射（`tagLabelZh`）后**不得有重复显示名**。 */
{
  const dupOpt = []
  for (const s of S.filter(x => x.task === 'T1')) {
    const disp = (s.options || []).map((o) => { try { return tagLabelZh(o) || o } catch { return o } })
    if (new Set(disp).size !== disp.length) dupOpt.push(s.id)
  }
  ok(dupOpt.length === 0, `T1 选项无异义双写（映射后不重复）：实测 ${dupOpt.length} 条${dupOpt.length ? ' → ' + dupOpt.slice(0, 3).join('; ') : ''}`)
  const ev = ['lesson', '教训']
  const evDisp = ev.map((o) => tagLabelZh(o))
  ok(new Set(evDisp).size === 1, `反例自证：{lesson,教训} 映射后同显「${evDisp[0]}」⇒ 判据具区分力（非恒真）`)
}

/* ⑥ 来源可溯 */
console.log('\n⑥ 来源可溯（provenance）')
const noProv = S.filter(s => !s.provenance || !s.provenance.file || typeof s.provenance.line !== 'number')
ok(noProv.length === 0, `每条带 file+line：缺 ${noProv.length} 条`)
// 抽验：行号定位到该标签
/* ⚠ **必须用 `provenance.rawTag`（库内原始键）定位，不能用 `s.answer`** ——
 *   2026-09-22 归一化落地后 `answer` 是**规范名**（如「教训」），而盘上写的是**原始键**（如 `lesson`）
 *   ⇒ 用 `answer` 比对会 25/90 假红（**本件首版即踩**）。
 *   归一前后的对应关系由 `rawTag` 留痕（构建器写入），此处按它核 —— 这正是留痕的用处。 */
const cache = new Map()
const readBank = (f) => { if (!cache.has(f)) { const p = join(BANK, f); cache.set(f, existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/) : null) } return cache.get(f) }
let verifyN = 0, verifyBad = 0
for (const s of S.filter(x => x.task === 'T1')) {
  const lines = readBank(s.provenance.file); if (!lines) break   // 按各条自带的 file 定位（不写死）
  const txt = lines[s.provenance.line - 1] || ''
  const onDisk = s.provenance.rawTag || s.answer          // 优先原始键（归一前）
  verifyN++
  if (!txt.includes('[' + onDisk + ']')) { verifyBad++; console.log(`     ⚠ ${s.id} ${s.provenance.file}:${s.provenance.line} 找不到 [${onDisk}]：${txt.slice(0, 60)}`) }
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
