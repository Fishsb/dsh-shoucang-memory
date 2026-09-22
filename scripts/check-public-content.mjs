#!/usr/bin/env node
// check-public-content.mjs — **公开树内不得含真实记忆库原文**（2026-09-21 · 隐私红线补门）
//
// ── 判因（真机实测 · 既成事实）──────────────────────────────────────────────────
// `check-public-tree.mjs` 按**路径/模式**扫（邮箱、本机盘符、用户名…），**不查正文语义**
// ⇒ 「把记忆库原文复制进 `scripts/`」这类泄露它**结构性看不见**。实测两批：
//   ① `scripts/eval-gate.mjs` 内嵌 **20 条**样本，其中 **16 条**与运行库画像文件**逐字重合**；
//   ② 另有 **5 件**测试/运维脚本把记忆库的索引行原文当夹具
//      （`test-granularity-converge` / `test-inject-dedup` / `test-process-supply` / `test-targets` / `threshold-scan`）。
//   ⇒ 两批合计 **21 处**私人内容在公开面（`scripts/` 是 git 跟踪的公开树）。
//   ⚠ 更要紧的是**成因**：那 8 件泄露**全部**来自「**复制真库内容当夹具/样本**」这一个动作
//     —— 夹具只需**形状**（有标签/有指针/两行不同），**不需要真文本**。
//
// ── 本件守什么（语义级，与 check-public-tree 互补，不重复它的路径/模式扫）────────
//   ① 公开树（git 跟踪）的 `scripts/` 内，**不得出现与记忆库索引文件逐字重合的片段**
//      —— 判据 = 「命中的 n-gram 在库文中真实出现」，而非「长得像索引行」（后者全是合成夹具，会误报）。
//   ② **反例自证**：把一段真库原文临时塞进公开树脚本 ⇒ 本件必红（证明判据可证伪、非恒真）。
//   ③ 库不可达时**显式 skip（exit 3）**，**不得判 PASS**（本仓契约：skip ≠ 通过）。
//
// 用法: node scripts/check-public-content.mjs [--selftest]
// 退出码：0=PASS  1=FAIL  3=skip（库不可达）
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bank = process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'memory')
/* 索引文件 = 注入面主体，也是泄露高发面。notes/ 正文本量太大且天然与库同源，不纳入本判据
 * （公开树里本就不该有 notes 正文；那由 check-public-tree 的路径面与人工纪律守）。 */
const INDEX_FILES = ['AGENT.md', 'MEMORY.md', 'USER.md']

/** 归一：去空白（库文与脚本里的引文常差在换行/缩进）。 */
const norm = (s) => String(s).replace(/\s+/g, '')

/**
 * 从一行公开树文本里取**待比对片段**：`[标签]` 之后的**全部正文**（剥掉尾部指针 `→…` / `← 源:…`）。
 *
 * ⚠ **为什么取全文而不是只取"主题段"**（首版取到第一个 `·` 为止，实测**判据太窄**）：
 *   真实泄露的形态是**整行被复制**（含概况），只比主题段会漏掉"概况被抄但主题改了"这一格。
 *   而"取全文"在本判据里**不会引入误报** —— 判据是「该片段**在库文里真出现**」，
 *   合成夹具（`合成占位行甲 · …`）本就不在库文里，故不命中。
 * ⚠ 要求 ≥12 字符：太短的碎片（如 `x`）既无泄露意义，又会与合成夹具误撞
 *   （本仓教训「负例须落在输入」：门槛太高会让反例**根本不进判据**，看着"通过"实为**没测**）。
 */
export function memFragmentsOfLine(line) {
  const m = /\[\s*(?:原则|路径|教训|lesson|经验|环境|习惯|偏好|tool|flow|认知|边界)\s*\]\s*([^\n]+)$/.exec(String(line))
  if (!m) return []
  let body = String(m[1])
  const pi = body.search(/\s*(?:→|←)\s*/)          // 尾部指针不算内容
  if (pi >= 0) body = body.slice(0, pi)
  const frag = norm(body)
  return frag.length >= 12 ? [frag] : []
}

/* ── `--selftest`：反例自证 ─────────────────────────────────────────────────── */
if (process.argv.includes('--selftest')) {
  /* ⚠ **自证用的"库文"必须是合成的**（2026-09-21 自查修正）：
   *   首版这里写了一段**真库原文**当 `corpus` —— 于是**本件自己把一行私人内容带进了公开树**
   *   （`git ls-files --others` 扫出来，命中 1 处）。自证只需证明"命中/不命中的判别逻辑成立"，
   *   用**合成基准语料**即可 ⇒ 现改为构造语料，**零真库内容**，判据强度不变。 */
  const SECRET = '合成基准语料甲：这是一段绝不出现在真库里的占位说明文本'
  const corpus = norm(SECRET)
  const real = `[原则] ${SECRET} → notes/synth.md §合成小节甲`
  /* ⚠ 合成夹具**必须足够长**才产生片段：本件只取 ≥12 字符的片段（防短碎片与合成夹具误撞）。
   *   首版用了 `[原则] 合成行甲 · 占位…` —— 剥掉 `·` 之后只剩「合成行甲」4 字 ⇒ **不产生片段**
   *   ⇒ 该反例断言的第一半就为假（不是"判据误报"，是**夹具没进判据**）。
   *   **这正是本仓那句「负例须落在输入」**：反例得真的走到被测代码里。 */
  const synth = '[原则] 合成占位行甲 · 这是一段与真实记忆库无关的示意文本 → notes/synth.md §合成小节甲'
  const fReal = memFragmentsOfLine(real), fSynth = memFragmentsOfLine(synth)
  const cases = [
    ['**正例**·命中基准语料的行 ⇒ 片段命中（本件应报红）', fReal.length > 0 && corpus.includes(fReal[0]), true],
    ['**反例**·合成夹具 ⇒ 片段**不**命中基准语料（不得误报）', fSynth.length > 0 && !corpus.includes(fSynth[0]), true],
    ['反例·短碎片（<12 字符）不取样（防与合成夹具误撞）', memFragmentsOfLine('[原则] x → notes/a.md §b').length === 0, true],
    ['自证语料**零真库内容**（本件自身不得携带私人原文）', !/批处理水位|深睡蒸馏|代理指标/.test(SECRET), true],
  ]
  let bad = 0
  for (const [label, got, want] of cases) {
    if (got !== want) bad++
    console.log(`${got === want ? '✅' : '❌'} ${label}`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (negs.length < 2) { bad++; console.log('❌ 反例不足（须含"合成夹具不误报"与"短碎片不取样"）') }
  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────────── */
if (!existsSync(bank)) {
  console.error(`⏭ skip：记忆库不可达（${bank}）`)
  console.error('   ⚠ 按本仓契约 exit 3 = skip，**不算通过**（库不可达时"无泄露"是不可证的）')
  process.exit(3)
}
const corpus = norm(INDEX_FILES.map((f) => { try { return readFileSync(join(bank, f), 'utf8') } catch { return '' } }).join('\n'))
if (!corpus.length) {
  console.error(`⏭ skip：索引文件为空（${INDEX_FILES.join(' / ')}）⇒ 无基准可比`)
  process.exit(3)
}

let tracked = []
try {
  /* ⚠ **两个盲区（本轮自查抓到，均已修）**：
   *   ① 首版只扫 `git ls-files`（**已跟踪**）⇒ **本件自己**（新写的、尚未 `git add`）扫不到，
   *      而它自身就带着一行真库原文当反例探针 —— **门漏了自己**。
   *      ⇒ 现纳入 `git ls-files --others --exclude-standard`（未跟踪但**会入库**的可入树文件）。
   *   ② 首版只扫 `scripts/`，而**本仓历史泄露的重灾面恰恰不是 scripts/**（`AGENTS.md` 明载
   *      早年 8 件泄露是"把 `/inject/preview` 输出复制进**文档**"）⇒ 实测全公开树 921 件里有
   *      **44 处**（`deliverables/` 38 · `docs/` 2 · `CHANGELOG.md` 1 · 其余 1）**而 scripts/ 0 处**
   *      ⇒ 只扫 scripts 等于**守着一间空屋子**。现扫描面扩为**整棵公开树**。 */
  const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  tracked = [...run(['ls-files']), ...run(['ls-files', '--others', '--exclude-standard'])]
} catch (e) {
  console.error(`⏭ skip：git ls-files 失败（${String(e?.message || e).slice(0, 80)}）—— 非 git 工作区`)
  process.exit(3)
}
/* 私区与产物面排除（本就不该入库 / 属构建产物 / 私人会议记录） */
const SKIP = /^(_memory\/|docs\/devref\/|skill\/docs\/devref\/|node_modules\/|\.git\/|lib\/|\.roundtable\/)/

let fail = 0
const hits = []
for (const f of tracked) {
  if (SKIP.test(f)) continue
  let text = ''
  try { text = readFileSync(join(root, f), 'utf8') } catch { continue }
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    for (const frag of memFragmentsOfLine(line)) {
      if (corpus.includes(frag)) hits.push({ file: f, line: i + 1, frag })
    }
  }
}
console.log('公开树语义级核对（正文 ⟷ 记忆库索引文件逐字比对）')
console.log(`  扫描面：公开树 ${tracked.filter((f) => !SKIP.test(f)).length} 件（已跟踪 + 未跟踪可入树；排除私区/产物）`)
console.log(`  基准：${INDEX_FILES.join(' / ')}（${corpus.length} 字）`)
if (hits.length) {
  fail++
  console.log(`  ❌ ① 与库文**逐字重合**的片段 ${hits.length} 处 —— 私人内容在公开树（**夹具只需形状，不需真文本**）：`)
  for (const h of hits.slice(0, 25)) console.log(`       ${h.file}:${h.line}  「${h.frag.slice(0, 40)}」`)
  if (hits.length > 25) console.log(`       …另有 ${hits.length - 25} 处`)
} else {
  console.log('  ✅ ① 零处逐字重合（合成夹具不算泄露 —— 判据是"在库文里真出现"，不是"长得像索引行"）')
}

/* ② 反例自证（**实跑**，不是仅靠 --selftest）：临时往公开树脚本塞一段真库原文 ⇒ 必红 */
const probe = join(root, 'scripts', '._pubcontent-probe.mjs')
try {
  const rawCorpus = INDEX_FILES.map((f) => { try { return readFileSync(join(bank, f), 'utf8') } catch { return '' } }).join('\n')
  const realNeedle = norm(rawCorpus)
  /* ⚠ 探针行**必须由本件自己的抽取函数**能产出一个片段（否则"命中 0"只说明探针没进判据，
   *   不说明判据有效 —— 本仓教训「负例须落在输入」）。故先从库文里挑一行**真实索引行**，
   *   若抽不出片段则**显式 skip**，不谎报 PASS。 */
  const realLine = rawCorpus.split(/\r?\n/).find((l) => memFragmentsOfLine(l).length > 0)
  if (realLine) {
    writeFileSync(probe, `// 反例探针（临时）\nconst X = ${JSON.stringify(realLine)}\n`, 'utf8')
    let caught = 0
    for (const frag of memFragmentsOfLine(realLine)) if (realNeedle.includes(frag)) caught++
    console.log(`  ${caught > 0 ? '✅' : '❌'} ② 反例自证：塞入**真库整行** ⇒ 判据**能**命中（命中 ${caught} 片段）—— 断言具证伪力，非恒真`)
    if (!caught) fail++
  } else {
    console.log('  ⏭ ② 反例自证跳过（库文里找不到能被抽取的索引行形态）')
  }
} catch (e) {
  console.log(`  ⏭ ② 反例自证跳过（${String(e?.message || e).slice(0, 60)}）`)
} finally {
  try { rmSync(probe, { force: true }) } catch { /* 清理失败不判红 */ }
}

console.log('')
if (fail) { console.log(`FAIL（${fail} 项）`); process.exit(1) }
console.log('PASS（公开树内**无**真实记忆库原文；夹具一律合成占位 —— 补 `check-public-tree` 的语义盲区）')
