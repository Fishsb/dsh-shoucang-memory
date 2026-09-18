#!/usr/bin/env node
// section-ref-reanchor.mjs — S1R · P2「存量小节寻址收口」执行器（2026-09-19）
//
// 判因（实测 82 处）：库内索引指针有三类寻址失效 ——
//   ① **同名小节**（`## A` 与 `### A` 并存 ⇒ matchSection 宁缺毋滥返回 null，而读侧仍可读）
//      实测 env.md「插件注入」「Windows npm 执行策略」· lessons.md「服务与重启约束」；
//   ② **路径部分悬空**（`§父/子` 父在子缺）—— 读侧回落父节，巡检计 partial；
//   ③ **全不可解析** —— 行内概况所述知识**未落到任何小节**（蒸馏 appends 因缺顶层锚被拒 ⇒ 行落了、详情没落）。
//
// 处置（S1R 方案册 §7-Q3：改指真实小节 → 建节 → 废弃/降级）：
//   · ①同名 ⇒ **改名**（按正文语义命名；保留与多数指行匹配的那一份原名）⇒ 同名的指针自动恢复可解析；
//   · ②partial ⇒ **收敛为最长可解析前缀**（读侧本就这样回落，归一只是写实）；
//   · ③missing ⇒ 先查**显式重指表**（人工裁决）；再按**同文件正文包含度** ≥ 阈值重指；
//     否则**降级为文件级指针**（去 § 段；知识仍在索引行里，按需 grep 文件）。
//     ⚠ **不建空壳小节**：写门把空壳小节视为缺陷。
//
// 纪律：**只改标题行与指针段，正文一字不动**；**先在临时区预演**（dry 报告即终态读数）；
//   APPLY 前整库备份到 `~/.dsh/backups/sc-s1r-<ts>/`，写回用 tmp+rename；幂等（重跑 no-op）。
// 用法: node scripts/section-ref-reanchor.mjs [--root <库根>] [--min 0.5] [--dry|--apply] [--json]
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, mkdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const LIB = argOf('--root', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const MIN = Number(argOf('--min', '0.95')) // ⚠ 缺省 0.95 = **关闭通用自动重指**：实测 0.5 阈值会产出
// 「看似合理但错位」的锚（大节包含度虚高：`§本地版本管理` 被指到「Windows 系统运维与数据安全」）
// ⇒ 只信**逐条人工裁决**（REPOINTS）+ 前缀收敛 + 降级；自动匹配仅作证据展示（--json 里带 evidence）。
const APPLY = argv.includes('--apply')
const AS_JSON = argv.includes('--json')
const DOCS = ['MEMORY.md', 'USER.md', 'AGENT.md']

const sr = await import(pathToFileURL(join(HERE, '..', 'skill', 'scripts', 'section-ref.mjs')).href)

/** **改名表**（同名冲突的人工裁决；保留原名的那一份**不进此表**） */
const RENAMES = [
  { file: 'env.md', level: 3, title: '插件注入', to: '装配路径与 ctx 能力' },
  { file: 'env.md', level: 3, title: 'Windows npm 执行策略', to: 'npm 失效与残留 shim 修复' },
  { file: 'env.md', level: 2, title: 'Windows npm 执行策略（2026-08-16）', to: '命令判定与 CLI 路径' },
  { file: 'env.md', level: 2, title: 'Windows npm 执行策略', to: '受限沙箱装包' },
  { file: 'lessons.md', level: 3, title: '服务与重启约束', to: '插件态实证与端口冲突' },
]

/** **显式重指表**（人工裁决优先；每条都有**逐字证据**，见 S1R 验收记录 §P2） */
const REPOINTS = {
  // env.md（改名后原名不复存在）→ 该行概况「ps1→cmd/受限沙箱装包」对应此节正文「目标：受限沙箱装包。1. npm pack EPERM…」
  'notes/env.md §Windows npm 执行策略': 'notes/env.md §受限沙箱装包',
  // tools.md 的子节从未落盘；内容实存于 env.md（line 347「证客户端插件真送达 ①boot ②preload ③client.js 200+字节」
  //   与 line 349「不杀浏览器取已认证首页 自签 cookie v1.payload.HMAC」）⇒ **跨文件**重指
  'notes/tools.md §DSH 端到端验收/免登取认证页': 'notes/env.md §客户端交付链验证',
  'notes/tools.md §DSH 端到端验收/投递核验': 'notes/env.md §客户端交付链验证',
  // tools.md §会话开头注入（3 行）内容实存于 env.md「## 插件注入」（line 328「注入段须进系统提示词节点 0 才免压缩」/
  //   line 331「内容恒定 ⇒ 零重写…恒定在场才换来节点 0 抗压缩」）⇒ 跨文件重指
  'notes/tools.md §会话开头注入': 'notes/env.md §插件注入',
  // tools.md/lessons.md/env.md 的语义近邻（据标题清单逐条核对；**不靠包含度**）
  'notes/env.md §ZCode 环境': 'notes/env.md §ZCode 配置',                 // 行概况「双档 provider_config.json/api.headers」
  'notes/tools.md §圆桌会审协议': 'notes/tools.md §圆桌会审主持',           // 行概况「总纲拼接/角色删重复/逐条核验」
  'notes/lessons.md §本地版本管理': 'notes/lessons.md §本地仓库卫生',       // 行概况「先写 .gitignore/首提核体积/误提交清历史」
  'notes/lessons.md §仓库与版本控制': 'notes/lessons.md §本地仓库卫生',     // 行概况「git 建仓防误提交 · 先写 .gitignore 挡缓存」
  'notes/lessons.md §虚假归因清除': 'notes/lessons.md §归因先量占比',       // 行「全源码零命中可证/部分非全称」⇒ 归因方法论
  'notes/lessons.md §本地仓库卫生': 'notes/lessons.md §本地仓库卫生',
  // —— 逐条语义近邻（据标题清单 + 行内概况核对；每条都在下行注明对应关系）——
  'notes/lessons.md §决策与施工边界': 'notes/flows.md §决策与施工边界',        // 跨文件**同名**（原同文件无此节）
  'notes/tools.md §插件生态与对标': 'notes/tools.md §DSH 插件生态调研（2026-09-03）',
  'notes/lessons.md §编辑安全与字节核验': 'notes/lessons.md §行号与字节核验',   // 行「批改前先核字节/行号口径不可靠」
  'notes/lessons.md §会话性能与上游': 'notes/lessons.md §会话性能归因',         // 行「越跑越慢错觉/耗时由输出量解释」
  'notes/lessons.md §重构完整性验证': 'notes/lessons.md §完整性核验',           // 行「字段层/职责层双重核对」
  'notes/tools.md §Ollama 本地模型': 'notes/env.md §本地模型显存',              // 行「显式 num_ctx/冷热分离/MLA 压缩 KV」
  'notes/tools.md §插件与配置/本地模型接入': 'notes/env.md §本地模型显存',
  'notes/tools.md §preset 热更新语义': 'notes/env.md §preset 遮盖规则',
  'notes/tools.md §Node 服务与超时': 'notes/env.md §Node HTTP 超时语义',        // 行「requestTimeout 限收请求/无响应天花板」
  'notes/flows.md §文件改写/字节级原子替换': 'notes/lessons.md §文本文件字节级改写',
  'notes/tools.md §DSH 注入/通道与豁免': 'notes/tools.md §注入与压缩豁免',
  'notes/lessons.md §缓存与性能': 'notes/env.md §缓存与压缩',                  // 行「换模型废 prompt cache」
  'notes/lessons.md §插件注入/提示词转义': 'notes/lessons.md §内联脚本转义',
  'notes/lessons.md §环境与通道': 'notes/lessons.md §通道与代理（GitHub raw / ghproxy）', // 行「git 推送与代理回退」
  'notes/tools.md §圆桌会审插件族': 'notes/tools.md §圆桌会审主持',
  // `§A/§B` 字面形（第二个 §）—— 改名后 A 已不存在，按语义重指
  'notes/env.md §DSH 环境/Windows npm 执行策略': 'notes/env.md §npm 失效与残留 shim 修复',
  'notes/lessons.md §版本控制与上游协作/分支切换与未提交文件': 'notes/lessons.md §本地仓库卫生',
}

/** **逐行覆盖表**（同一 spec 下不同行要去向不同 ⇒ 只能按行内容裁决）。
 *  依据：这 3 行的主题在**全库 notes 里零命中**（只在 INDEX 台账登记、详情从未落盘）⇒ 降级为文件级；
 *  「日志轮转辨现状」有实体（lessons.md:73 在 §插件态实证与端口冲突 内）⇒ 重指。 */
const ROW_OVERRIDES = [
  { match: '日志轮转辨现状', to: 'notes/lessons.md §插件态实证与端口冲突' },
  { match: '能力嵌于将被删RPC', to: 'notes/lessons.md' },
  { match: '压缩阈值守卫', to: 'notes/lessons.md' },
  { match: '会话换模型即缓存失效', to: 'notes/lessons.md' },
]

const read = (p) => readFileSync(p, 'utf8')
const writeAtomic = (p, text) => { const tmp = p + '.tmp-s1r'; writeFileSync(tmp, text, 'utf8'); renameSync(tmp, p) }
const metaOf = (line) => line.trim().replace(/^\[[^\]]+\]\s*/, '').split('→')[0].trim()
const bi = (s) => { const t = String(s).replace(/\s/g, '').toLowerCase(); const o = []; for (let i = 0; i < t.length - 1; i++) o.push(t.slice(i, i + 2)); return o }
/** **包含度**：探针的二元组有多少落在候选行里（非对称 —— 概况是压缩件，正文是展开件） */
const containment = (probe, cand) => {
  const A = bi(probe); const B = new Set(bi(cand))
  if (!A.length) return 0
  let hit = 0; for (const x of A) if (B.has(x)) hit++
  return hit / A.length
}

// ── 预演区（dry 与 apply 走同一条路；apply 才写回真库）──
const STAGE = mkdtempSync(join(tmpdir(), 'sc-s1r-'))
mkdirSync(join(STAGE, 'notes'), { recursive: true })
for (const f of readdirSync(join(LIB, 'notes'))) if (f.endsWith('.md')) copyFileSync(join(LIB, 'notes', f), join(STAGE, 'notes', f))
for (const d of DOCS) if (existsSync(join(LIB, d))) copyFileSync(join(LIB, d), join(STAGE, d))

const decisions = []
const record = []

// 1) 改名（预演区内）——**幂等**：若该文件已出现目标标题，视为已改（否则第二次运行会误改下一个同名节）
for (const r of RENAMES) {
  const p = join(STAGE, 'notes', r.file)
  if (!existsSync(p)) { decisions.push({ kind: 'rename', file: `notes/${r.file}`, from: r.title, to: r.to, status: 'skipped-no-file' }); continue }
  const ls = read(p).split(/\r?\n/)
  const headOf = (lvl, t) => new RegExp('^#{' + lvl + '}[ \\t]+' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$')
  if (ls.some((l) => headOf(r.level, r.to).test(l))) { decisions.push({ kind: 'rename', file: `notes/${r.file}`, from: r.title, to: r.to, status: 'skipped-already-renamed' }); continue }
  const idx = ls.findIndex((l) => headOf(r.level, r.title).test(l))
  if (idx < 0) { decisions.push({ kind: 'rename', file: `notes/${r.file}`, from: r.title, to: r.to, status: 'skipped-no-match' }); continue }
  ls[idx] = ls[idx].replace(r.title, r.to)
  writeAtomic(p, ls.join('\n'))
  decisions.push({ kind: 'rename', file: `notes/${r.file}`, level: r.level, from: r.title, to: r.to, line: idx + 1, status: APPLY ? 'staged' : 'dry' })
}

/** 全库小节索引（预演区口径） */
function allSections() {
  const out = []
  for (const f of readdirSync(join(STAGE, 'notes')).filter((x) => x.endsWith('.md') && x.toLowerCase() !== 'index.md')) {
    const ls = read(join(STAGE, 'notes', f)).split(/\r?\n/)
    const heads = []
    ls.forEach((l, i) => { const m = l.match(/^(#{2,3})[ \t]+(.*)$/); if (m) heads.push({ i, lvl: m[1].length, t: m[2].trim() }) })
    heads.forEach((h, k) => {
      const end = (heads.slice(k + 1).find((x) => x.lvl <= h.lvl) || { i: ls.length }).i
      out.push({ file: f, title: h.t, lvl: h.lvl, lines: ls.slice(h.i + 1, end).filter((l) => l.trim().length > 8) })
    })
  }
  return out
}
const SECS = allSections()
const bestMatch = (probe, sections) => {
  let best = null
  for (const s of sections) {
    let sc = 0; let ev = ''
    for (const l of s.lines) { const d = containment(probe, l); if (d > sc) { sc = d; ev = l.trim() } }
    if (!best || sc > best.score) best = { file: s.file, title: s.title, lvl: s.lvl, score: sc, evidence: ev }
  }
  return best
}

// 2) 指针改写（预演区内；解析口径 = 预演区 ⇒ dry 报告即终态读数）
for (const doc of DOCS) {
  const p = join(STAGE, doc)
  if (!existsSync(p)) continue
  const lines = read(p).split(/\r?\n/)
  let changed = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ptrs = sr.pointersOfRow(line)
    if (!ptrs.length) continue
    let newLine = line
    for (const ptr of ptrs) {
      const oldSpec = `notes/${ptr.file} §${ptr.spec}`
      // ⚠ 行内字面形可能是 `§A/§B`（带第二个 §）⇒ 用**正则匹配实际片段**替换，
      //   不能靠 `includes('§A/B')`（初版因此漏改 4 处，留成 partial/missing）。
      const pat = new RegExp(
        'notes/' + ptr.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        + '[ \\t]*§' + ptr.spec.split('/').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[ \\t]*/[ \\t]*§?'),
      )
      if (!pat.test(newLine)) continue
      const { agg, parts } = sr.resolveSectionSpec(STAGE, ptr.file, ptr.spec)
      const probe = metaOf(line)
      const bm = bestMatch(probe, SECS.filter((s) => s.file === ptr.file))
      // **逐行覆盖先于一切**（含 agg=exists 的"能解析但锚错"行——错锚比文件级指针更糟）
      const ov = ROW_OVERRIDES.find((o) => line.includes(o.match))
      if (ov && ov.to !== oldSpec) {
        newLine = newLine.replace(pat, ov.to)
        changed++
        record.push({ doc, agg, action: ov.to.includes('§') ? 'row-repoint' : 'row-downgrade', from: oldSpec, to: ov.to, score: Number(bm.score.toFixed(3)), evidence: bm.evidence.slice(0, 110) })
        continue
      }
      if (agg === 'exists') continue
      let action; let newSpec
      if (REPOINTS[oldSpec]) { action = 'explicit-repoint'; newSpec = REPOINTS[oldSpec] }
      else if (agg === 'partial') {
        const keep = []
        for (const q of parts) { if (q.res.state === 'missing') break; keep.push(q.name) } // **最长可解析前缀**
        if (keep.length) { action = 'truncate'; newSpec = `notes/${ptr.file} §${keep.join('/')}` }
      }
      if (!newSpec) {
        if (bm && bm.score >= MIN) { action = 'repoint'; newSpec = `notes/${bm.file} §${bm.title}` }
        else { action = 'downgrade'; newSpec = `notes/${ptr.file}` }
      }
      newLine = newLine.replace(pat, newSpec)
      changed++
      record.push({ doc, agg, action, from: oldSpec, to: newSpec, score: Number((bm ? bm.score : 0).toFixed(3)), evidence: bm ? bm.evidence.slice(0, 110) : '' })
    }
    if (newLine !== line) lines[i] = newLine
  }
  if (changed) writeAtomic(p, lines.join('\n'))
  decisions.push({ kind: 'pointers', file: doc, changed, status: changed ? (APPLY ? 'staged' : 'dry') : 'no-op' })
}

// 3) APPLY：整库备份 → 写回真库
let backup = null
if (APPLY) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  backup = join(homedir(), '.dsh', 'backups', `sc-s1r-${ts}`)
  mkdirSync(join(backup, 'notes'), { recursive: true })
  for (const f of readdirSync(join(LIB, 'notes'))) if (f.endsWith('.md')) copyFileSync(join(LIB, 'notes', f), join(backup, 'notes', f))
  for (const d of DOCS) if (existsSync(join(LIB, d))) copyFileSync(join(LIB, d), join(backup, d))
  for (const f of readdirSync(join(STAGE, 'notes'))) {
    if (read(join(STAGE, 'notes', f)) !== read(join(LIB, 'notes', f))) writeAtomic(join(LIB, 'notes', f), read(join(STAGE, 'notes', f)))
  }
  for (const d of DOCS) if (existsSync(join(STAGE, d)) && read(join(STAGE, d)) !== read(join(LIB, d))) writeAtomic(join(LIB, d), read(join(STAGE, d)))
}

// ── 输出 ──
console.log(`小节寻址存量收口（S1R · P2）${APPLY ? '【APPLY】' : '【DRY·终态读数】'} · 库=${LIB} · 包含度阈值 ${MIN}`)
for (const d of decisions) console.log('  · ' + JSON.stringify(d))
const byAction = {}
for (const r of record) byAction[r.action] = (byAction[r.action] || 0) + 1
console.log(`  指针改写 ${record.length} 处：${JSON.stringify(byAction)}`)
for (const r of record) console.log(`   [${r.action}] ${r.doc} ${r.from} ⇒ ${r.to}  (包含度 ${r.score})`)
if (backup) console.log(`  备份：${backup}`)
if (AS_JSON) console.log(JSON.stringify({ decisions, record, backup }, null, 2))
rmSync(STAGE, { recursive: true, force: true })
console.log(APPLY ? '\nAPPLY 完成' : '\nDRY 完成（未写入真库；加 --apply 生效）')
