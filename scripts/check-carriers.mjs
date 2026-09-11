#!/usr/bin/env node
// check-carriers.mjs — 载体契约机检门（v2.2 · ADR-130，纳入 npm test）
//
// 四道：
//   ① 契约自洽：layer ∈ {P,R,E} · form ∈ {index,profile,notes,audit} · inject ∈ {always,gated,none}
//      且层与可注入性一致（P ⇒ always；R/E ⇒ gated 或 none）
//   ② 渲染器全覆盖：**每个用到的 injectable 组合（always:index / always:profile / gated:index）都必须有渲染器声明**
//   ③ 标签覆盖：体检脚本 INDEX_FILES 里的全部标签都必须出现在 carriers.tags（防新增标签漏登记）
//   ④ 投影接线：生成投影含 CARRIERS 常量，且 panel.ts 确实按 carrier 渲染（readCarrier）
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const chk = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

const reg = JSON.parse(read('skill/engine/criteria.json'))
const tags = reg.carriers?.tags || {}
const renderers = reg.carriers?.renderers || {}

// ① 契约自洽
const LAYERS = new Set(['P', 'R', 'E'])
const FORMS = new Set(['index', 'profile', 'notes', 'audit'])
const INJECTS = new Set(['always', 'gated', 'none'])
let bad = 0
for (const [tag, c] of Object.entries(tags)) {
  if (!LAYERS.has(c.layer) || !FORMS.has(c.form) || !INJECTS.has(c.inject)) { console.log(`   ↳ 非法载体：${tag} = ${JSON.stringify(c)}`); bad++; continue }
  if (c.layer === 'P' && c.inject !== 'always') { console.log(`   ↳ P 层必须 always：${tag}`); bad++ }
  if ((c.layer === 'R' || c.layer === 'E') && c.inject === 'always') { console.log(`   ↳ R/E 层不得 always（否则与 P 层争恒定预算）：${tag}`); bad++ }
}
chk(bad === 0, `①载体契约自洽（${Object.keys(tags).length} 标签 · 非法 ${bad}）`)

// ② 渲染器全覆盖
const need = new Set()
for (const c of Object.values(tags)) if (c.inject !== 'none') need.add(`${c.inject}:${c.form}`)
const missing = [...need].filter((k) => !renderers[k])
chk(missing.length === 0, `②injectable 组合渲染器全覆盖（需 ${[...need].join(' · ')}；缺 ${missing.length}）`)
chk(Object.keys(renderers).length >= need.size, `②渲染器声明数 ${Object.keys(renderers).length} ≥ 需覆盖组合 ${need.size}`)
// 渲染器指向的实现必须真实存在
const implOk = Object.entries(renderers).every(([, v]) => {
  const m = String(v).match(/([\w./-]+\.(?:ts|mjs))(?:#([\w/]+))?/)
  if (!m) return false
  return existsSync(join(root, m[1]))
})
chk(implOk, '②每个渲染器都指向真实存在的实现文件')

// ③ 标签覆盖（与体检脚本的 INDEX_FILES 对齐）
const health = read('skill/scripts/memory_health_check.mjs')
const tagLists = [...health.matchAll(/tags:\s*\[([^\]]*)\]/g)].map((m) => m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))
const healthTags = new Set(tagLists.flat())
const uncovered = [...healthTags].filter((t) => !(t in tags))
chk(tagLists.length > 0 && uncovered.length === 0, `③体检标签全部登记（体检 ${healthTags.size} 个标签；未登记 ${uncovered.length}${uncovered.length ? ' → ' + uncovered.join(',') : ''}）`)
chk(Object.keys(tags).length >= healthTags.size, `③载体标签数 ${Object.keys(tags).length} ≥ 体检标签数 ${healthTags.size}`)

// ④ 投影接线
const generated = read('src/criteria.generated.ts')
chk(/export const CARRIERS = /.test(generated), '④生成投影含 CARRIERS 常量')
const panel = read('src/panel.ts')
chk(/readCarrier\s*=/.test(panel), '④panel.ts 实现 readCarrier（按载体渲染）')
chk(/CARRIERS/.test(panel), '④panel.ts 消费 CARRIERS 注册表（而非硬编码标签）')
const gateJson = (() => { try { return JSON.parse(read('skill/engine/criteria-gate.json')) } catch { return null } })()
chk(!!gateJson?.carriers && !!gateJson?.maturation, '④脚本面参数含 carriers / maturation 投影')

try {
  execFileSync('node', [join(root, 'scripts', 'gen-criteria.mjs'), '--check'], { stdio: 'inherit', cwd: root })
  chk(true, '④生成投影与注册表一致')
} catch { chk(false, '④投影过期（重跑 npm run gen:criteria）') }

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（载体契约机检门全过）')
process.exit(fail ? 1 : 0)
