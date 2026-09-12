// 阶段 C-1 后半：从 registerDistill 摘掉已迁出的定义，插入 API 装配，并把调用点改到句柄上。
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'
import { renameInSource } from './_tmp-rename.mjs'

const F = 'src/distill.ts'
let text = readFileSync(F, 'utf8')
const sf = ts.createSourceFile(F, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const lineOf = (p) => sf.getLineAndCharacterOfPosition(p).line + 1
let fn = null
for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name?.text === 'registerDistill') fn = st

const MOVED = {
  // ── 阶段 C-2c ──
  bank: ['bankGitScript', 'runSelfCheck', 'bankSnapshot'],
  embed: ['embedCfgOf'],
}
const MOVED_ALL = new Set(Object.values(MOVED).flat())
// C-1 已把可变状态搬进 newDistillState()，本轮不再有需要删除声明的状态字段
const STATE_FIELDS = []

// 每个语句：名字 + 原文 + 是否迁出
const stmts = fn.body.statements.map((st) => {
  let name = null
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) name = d.name.text
  else if (ts.isFunctionDeclaration(st) && st.name) name = st.name.text
  return { name, from: lineOf(st.getFullStart()), to: lineOf(st.getEnd()), text: st.getFullText(sf), moved: !!name && MOVED_ALL.has(name) }
})

const SNIPPETS = {
  bank: `  const bank = createBankApi({ kRoot, infra, config })`,
  embed: `  const embed = createEmbedApi({ config })`,
}

// 调用点改到句柄上（顺序：先长名后短名，防前缀误伤）
const RENAME = []
for (const [api, names] of Object.entries(MOVED)) for (const n of names) RENAME.push([n, `${api}.${n}`])
RENAME.sort((a, b) => b[0].length - a[0].length)
const rename = (t) => renameInSource(t, [
  ...RENAME,
  ...STATE_FIELDS.map((n) => [n, `st.${n}`]),
])

// 装配片段插在**该组最后一个被摘掉的定义**处：插在第一个会得到
//   「episodeFile 在声明前被使用」（本轮实锤：infra 组首个定义 ledger 在 334，episodeFile 在 344）
const lastIdx = {}
stmts.forEach((s, i) => { if (s.moved) lastIdx[s.name] = i })
const groupOf = (n) => Object.keys(MOVED).find((g) => MOVED[g].includes(n))
const lastOf = (g) => Math.max(...MOVED[g].map((n) => lastIdx[n] ?? -1))

// ① 摘掉迁出的定义（保留的先改名）；② 在锚点插入装配片段（**改名后再插**，否则片段里的
//    `log: infra.log` 会被当成调用点再替换一次 ⇒ `infra.log: infra.infra.log`）
const out = []
const inserted = new Set()
stmts.forEach((s, i) => {
  // 状态字段的声明整体删除：它们已搬进 newDistillState()（否则会得到 `const st.distilling = …` 这种非法语句）
  if (s.name && STATE_FIELDS.includes(s.name)) return
  if (!s.moved) { out.push(rename(s.text)); return }
  const g = groupOf(s.name)
  const anchor = g === 'agent' ? Math.min(...MOVED[g].map((n) => lastIdx[n] ?? -1)) : lastOf(g)
  // embed 走下方 splice 统一插入（插在 cand 之前），此处跳过，避免重复声明
  if (g && g !== "embed" && !inserted.has(g) && i === anchor) { out.push(SNIPPETS[g]); inserted.add(g) }
})
// embed 依赖为 0，但被 cand/write/act/agent 消费 ⇒ 必须装配在它们之前（其原定义位置在它们之后）
{
  const ci = out.findIndex((t) => t.includes('const cand = createCandApi('))
  if (ci >= 0) out.splice(ci, 0, SNIPPETS.embed)
  else console.log('⚠ 未找到 cand 装配行，embed 未插入')
}
const body = out.join('\n')

// ④ 组装新函数：保留原签名 + 新函数体
const sig = text.slice(fn.getStart(sf), fn.body.getStart(sf) + 1)
const rest = text.slice(fn.body.getEnd())
const head = text.slice(0, fn.getStart(sf))
// ⑤ 补 import
const imp = [
  "import { createBankApi } from './distill-bank.js'",
  "import { createEmbedApi } from './distill-embed.js'",
].join('\n')
writeFileSync(F, head + sig + '\n' + body + '\n}\n' + rest)
// import 插到最后一个 import 之后
let out2 = readFileSync(F, 'utf8')
const lines2 = out2.split('\n')
let lastImp = -1
for (let i = 0; i < lines2.length; i++) if (/^import /.test(lines2[i])) lastImp = i
lines2.splice(lastImp + 1, 0, imp)
writeFileSync(F, lines2.join('\n'))
console.log(`rewrote ${F}`)
