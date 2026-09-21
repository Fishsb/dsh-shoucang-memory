#!/usr/bin/env node
/**
 * eval-samples.mjs — 评估通道**样本集构建器**（单一事实源，运行期从真库取材）
 *
 * ── 判因（ACT-289）─────────────────────────────────────────────────────────
 * 前代样本集（`eval-gate.mjs` 内嵌 SAMPLES）实测三处失效，故重建：
 *   ① **字面泄漏**：T1 的材料以 `[原则]` 开头而答案就是 `原则` ⇒ 一条正则 8/8。
 *      实测：20 条里 8 条泄漏。G2 报的 95% 中这 8 条是白送的，测不出任何东西。
 *   ② **镜像对**：T2 同一 state 配一正一反两条 claim。词袋基线被 state 主导，
 *      留一时必然预测出**孪生兄弟的标签**（实测 6/8 精确命中）⇒ 基线 0/8 是伪影而非实力。
 *   ③ **样本量**：真正独立的只剩 T3 的 4 条，推不出任何结论。
 *   另：前代把**真实记忆库原文**内嵌进 `scripts/`（公开树）且该文件已被 git 跟踪候选
 *       ⇒ 本件改为**运行期读取**，文件内零记忆内容。
 *
 * ── 三个子任务（与方案 §3 册二「三通道准入」对齐：答案可枚举才是该层该做的）──
 *   T1 choice 标签归类 —— 给索引行**去掉标签前缀后**的正文，判它属哪个标签
 *   T2 noul  概况归属 —— 给某行的**概况**（已剥离主题），判它是否属于所声称的主题
 *   T3 choice 小节归属 —— 给某行的**概况**，判它属哪个真实小节
 *
 * ── 三条防退化设计（机检由 check-eval-samples.mjs 守）──
 *   去泄漏：T1 剥离 `[tag]` 且校验正文不再含标签串；T3 校验概况不含正确小节名
 *   破镜像：T2 每条 state 只用一次，正/负例的**主题不同源**，不构造孪生对
 *   可判性：报告**多数类基线**（库本身类不均：AGENT.md 原则 82/路径 17/边界 2/认知 1/经验 1）
 *          —— 不报它的准确率数字是自欺
 *
 * ⚠ 样本含真实记忆内容 ⇒ 产物落 `_memory/audit/`（已 gitignore），**绝不入公开树**。
 *   本文件自身零内容，可公开。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** 解析索引行：`[tag] 主题 · 概况 → 指针` / `← 源: …` 尾注 */
export function parseIndexRows(text) {
  const out = []
  const lines = String(text).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const m = /^\s*(?:-\s*)?\[([^\]]{1,8})\]\s*(.+?)\s*$/.exec(raw)
    if (!m) continue
    const tag = m[1].trim()
    let body = m[2]
    // 尾注：→ 指针 / ← 源
    let pointer = ''
    const pmi = body.search(/\s*(?:→|←)\s*/)
    if (pmi >= 0) { pointer = body.slice(pmi).trim(); body = body.slice(0, pmi).trim() }
    // 主题 · 概况
    const dot = body.indexOf(' · ')
    const topic = dot >= 0 ? body.slice(0, dot).trim() : body.trim()
    const summary = dot >= 0 ? body.slice(dot + 3).trim() : ''
    if (!topic) continue
    out.push({ line: i + 1, tag, topic, summary, pointer, raw })
  }
  return out
}

/**
 * 从指针串中取**首个** `文件 §小节` 对。
 * 指针文法实测为可含多段：`→ notes/agent.md §A/notes/lessons.md §B`
 *   ⇒ 必须按下一个 `文件.md` 边界截断，否则小节名会吞掉后续段
 *   （本件首版即踩此坑：产出 `DSH 环境/适配器路由字段` 这类畸形名，使 T3 整列失效）。
 * 括注日期去除：`假绿与实证（干跑对账）` → `假绿与实证`。
 */
export function firstRefOf(pointer) {
  const p = String(pointer || '')
  const arrow = p.search(/→|←/)
  const body = arrow >= 0 ? p.slice(arrow + 1) : p
  // 截断到第二个 .md 之前（即只保留首段）
  const mdAll = [...body.matchAll(/[^\s§]*\.md/g)]
  const end = mdAll.length > 1 ? body.indexOf(mdAll[1][0]) : body.length
  const first = body.slice(0, end)
  const fm = /([^\s§]*\.md)/.exec(first)
  const sm = /§\s*([^/§]+?)\s*$/.exec(first.replace(/[。，,]\s*$/, ''))
  return {
    file: fm ? fm[1] : null,
    section: sm ? sm[1].replace(/（[^）]*）\s*$/, '').trim() : null,
  }
}
export function sectionOf(pointer) { return firstRefOf(pointer).section }
export function fileOf(pointer) { return firstRefOf(pointer).file }

const norm = (s) => String(s).replace(/\s+/g, '')

/**
 * 构建样本集。
 * @param {{bank:string, seed?:number, limits?:object}} opts
 */
export function buildSamples(opts) {
  const bank = opts.bank
  const seed = opts.seed ?? 20260921
  // 默认量取自 `_memory/audit/pool-census.mjs` 实测池：T1③ 637 · T2 746 · T3 552
  // capPerClass 防多数类碾压（T1 类不均：lesson 306 vs 经验 2）
  const lim = { t1: 90, t1cap: 15, t2: 90, t3: 90, ...(opts.limits || {}) }
  let s = seed >>> 0
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }

  const read = (f) => { const p = join(bank, f); return existsSync(p) ? readFileSync(p, 'utf8') : null }
  const agent = read('AGENT.md'), memory = read('MEMORY.md'), user = read('USER.md')
  // ⚠ 来源文件**在构造时打标**（不从 `raw` 反推：索引行文本本身从不含文件名，
  //   首版用 `raw.includes('AGENT.md')` 判定 ⇒ file 恒为 '(索引行)'，既不可溯
  //   又让 ⑦ 的去重键在跨文件同行号时误撞。由 check-eval-samples ⑥⑦ 守。）
  const tagFile = (rows, f) => rows.map(r => ({ ...r, file: f }))
  const rowsAgent = agent ? tagFile(parseIndexRows(agent).filter(r => r.summary || r.topic), 'AGENT.md') : []
  const rowsMemory = memory ? tagFile(parseIndexRows(memory).filter(r => r.summary || r.topic), 'MEMORY.md') : []
  const rowsUser = user ? tagFile(parseIndexRows(user).filter(r => r.summary || r.topic), 'USER.md') : []
  const warnings = []
  const samples = []

  /* ── T1 标签归类：去标签正文 → 判标签 ──────────────────────────────
   * 2026-09-21 扩样（ACT-289 A）：**改用 MEMORY.md 词表**。
   *   判因：AGENT.md 池仅 103 行且**多数类基线 79.6%**（原则 82/103）⇒ 样本一多就碾压，
   *   而 MEMORY.md 有 637 行、7 类、基线 48.0%，且是**真实使用面**（注入的就是它）。
   *   实测其分类按"带主题·概况 vs 短促断言"可分：类内相似 0.033 vs 类间 0.010（truth-audit）。
   * ⚠ 类不均（lesson 306 vs 经验 2）⇒ 每类**封顶** `lim.t1cap`，使多数类不碾压；
   *   未用满的额度补给小类之外的最大类，并如实报基线。 */
  {
    const byTag = new Map()
    for (const r of rowsMemory) { if (!byTag.has(r.tag)) byTag.set(r.tag, []); byTag.get(r.tag).push(r) }
    const universe = [...byTag.keys()].sort((a, b) => byTag.get(b).length - byTag.get(a).length)
    const picked = []
    const isPicked = (r) => picked.some(p => p.r === r)
    // 第一轮：每类至多 cap
    for (const t of universe) {
      const take = Math.min(lim.t1cap, byTag.get(t).length, lim.t1 - picked.length)
      if (take > 0) picked.push(...shuffle(byTag.get(t)).slice(0, take).map(r => ({ r, tag: t })))
    }
    // 第二轮：不足则放宽 cap 至 2×（仍按类序，防单类独大）
    // ⚠ 必须排除**已入第一轮的**条目（否则产生同 provenance 重复 —— 扩样首版即踩，
    //   由 check-eval-samples ⑦ 拦下）
    if (picked.length < lim.t1) {
      for (const t of universe) {
        if (picked.length >= lim.t1) break
        const used = picked.filter(p => p.tag === t).length
        const more = shuffle(byTag.get(t).filter(r => !isPicked(r)))
          .slice(0, Math.min(lim.t1cap * 2 - used, lim.t1 - picked.length))
        picked.push(...more.map(r => ({ r, tag: t })))
      }
    }
    for (const { r, tag } of picked) {
      const state = r.summary || r.topic           // ← 已剥主题与指针 ⇒ 无标签可循
      samples.push({
        id: `T1-${samples.length + 1}`, task: 'T1', kind: 'choice', label: '标签归类',
        state, options: universe.slice(),
        answer: tag,
        provenance: { file: 'MEMORY.md', line: r.line, tag, method: 'strip-tag-prefix' },
      })
    }
    warnings.push(`T1 取 MEMORY.md 词表（${universe.length} 类，池 ${rowsMemory.length} 行，每类封顶 ${lim.t1cap}）`)
  }

  /* ── T2 概况归属：判「概况 ↔ 主题」是否成立 ────────────────────────
   * 正例＝该行自己的主题；负例＝**同文件内**另一行的主题（同域，非跨域易判）。
   * 每条 state 只用一次 ⇒ 无孪生对。 */
  {
    const pool = [...rowsMemory, ...rowsAgent].filter(r => r.summary && r.topic)
    const picked = shuffle(pool).slice(0, lim.t2)
    const half = Math.floor(picked.length / 2)
    picked.forEach((r, i) => {
      const isTrue = i % 2 === 0
      let claimed = r.topic
      if (!isTrue) {
        const others = pool.filter(o => o.topic !== r.topic)
        claimed = others.length ? others[Math.floor(rnd() * others.length)].topic : r.topic
      }
      samples.push({
        id: `T2-${samples.length + 1}`, task: 'T2', kind: 'noul', label: '概况归属',
        state: r.summary,
        claim: `该概况正好描述了「${claimed}」这件事。`,
        answer: isTrue || claimed === r.topic,
        provenance: { file: r.file, line: r.line, topic: r.topic, claimed, method: isTrue ? 'self-topic' : 'transplant-same-source', subjectTag: r.tag },
      })
    })
    if (picked.length < lim.t2) warnings.push(`T2 只够 ${picked.length}/${lim.t2} 条`)
  }

  /* ── T3 小节归属：概况 → 真实小节名（选项＝同文件真实小节 + 1 正确）──
   * 概况不含正确小节名（机检守）。选项含正确项在内的 4 个真实小节。 */
  {
    const withSec = rowsMemory.filter(r => sectionOf(r.pointer) && fileOf(r.pointer) && r.summary)
    const byFile = new Map()
    for (const r of withSec) { const f = fileOf(r.pointer); if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(r) }
    // 每文件**只取一次**（首个池即用尽额度）：跨轮取会让同一行两度入样（⑦ 守）
    const picked = []
    for (const [f, rs] of byFile) {
      if (picked.length >= lim.t3) break
      const secs = [...new Set(rs.map(r => sectionOf(r.pointer)))]
      if (secs.length < 3) continue
      for (const r of shuffle(rs)) { if (picked.length >= lim.t3) break; picked.push({ r, secs, file: f }) }
    }
    for (const { r, secs, file } of picked) {
      const correct = sectionOf(r.pointer)
      const distract = shuffle(secs.filter(x => x !== correct)).slice(0, 3)
      samples.push({
        id: `T3-${samples.length + 1}`, task: 'T3', kind: 'choice', label: '小节归属',
        state: r.summary,
        options: shuffle([correct, ...distract]),
        answer: correct,
        provenance: { file, line: r.line, section: correct, method: 'section-of-summary', notesFile: r.file },
      })
    }
    if (picked.length < lim.t3) warnings.push(`T3 只够 ${picked.length}/${lim.t3} 条（需同文件 ≥3 个可辨小节）`)
  }

  return { samples, warnings, source: bank, builtAt: new Date().toISOString(), seed }
}

/* ── CLI：--emit <out.json> --bank <记忆库> ── */
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('eval-samples.mjs')) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
  const bank = arg('--bank', join(process.env.USERPROFILE || '', '.dsh', 'suite', 'memory'))
  const out = arg('--emit', '')
  if (!existsSync(bank)) { console.error(`⏭ skip：记忆库不存在（${bank}）`); process.exit(3) }
  const r = buildSamples({ bank })
  console.log(`样本 ${r.samples.length} 条 · 来源 ${bank}`)
  for (const t of ['T1', 'T2', 'T3']) {
    const rel = r.samples.filter(x => x.task === t)
    console.log(`  ${t} (${rel[0]?.label || '-'}): ${rel.length} 条`)
  }
  if (r.warnings.length) { console.log('  ⚠ 采样告警：'); for (const w of r.warnings) console.log(`     ${w}`) }
  if (out) { const { writeFileSync } = await import('node:fs'); writeFileSync(out, JSON.stringify(r, null, 2), 'utf8'); console.log(`已写出 ${out}`) }
}
