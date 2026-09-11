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
/** 剥注释（块注释 + 整行 // ）：对源码做正则断言时必须区分「代码」与「散文」，否则注释里的旧写法会误报 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

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
// 2026-09-11：原断言 `/CARRIERS/.test(panel)` 是**假绿**——panel.ts 的注释里出现 CARRIERS 四个字母即通过，
//   与「是否真的消费注册表」无关。真正消费注册表的是层判据的单一实现 targets.ts，故改为断言它。
const targetsSrc = read('src/targets.ts')
chk(/import \{ CARRIERS \} from '\.\/criteria\.generated\.js'/.test(targetsSrc), '④targets.ts 消费 CARRIERS 注册表（层判据由注册表驱动）')
const gateJson = (() => { try { return JSON.parse(read('skill/engine/criteria-gate.json')) } catch { return null } })()
chk(!!gateJson?.carriers && !!gateJson?.maturation, '④脚本面参数含 carriers / maturation 投影')

try {
  execFileSync('node', [join(root, 'scripts', 'gen-criteria.mjs'), '--check'], { stdio: 'inherit', cwd: root })
  chk(true, '④生成投影与注册表一致')
} catch { chk(false, '④投影过期（重跑 npm run gen:criteria）') }

// ⑤ 写通道三方对齐（U3 教训机制化）：**每个 /set 白名单键都必须有映射**（SCHED_KEY 或 SUITE_BOOL 或 root-only）
//    否则会出现「白名单放了但写入 400」这类实测缺陷（scoreWeights 就踩过）
const schBlock = panel.slice(panel.indexOf('const SCHED_KEY'), panel.indexOf('const schedKey = SCHED_KEY'))
const boolBlock = panel.slice(panel.indexOf('const SUITE_BOOL'), panel.indexOf('if (SUITE_BOOL[key])'))
const allowedBlock = panel.slice(panel.indexOf('const allowed: Record<string, string[]> = {'), panel.indexOf('// 数值范围校验'))
const allowedKeys = [...allowedBlock.matchAll(/'([A-Za-z_.]+)':\s*\[/g)].map((m) => m[1])
const ROOT_ONLY = new Set() // 当前无 root-only 键（boards.* 已移除）；将来新增写 root YAML 的键在此登记
const unmapped = allowedKeys.filter((k) => !new RegExp(`'${k}':`).test(schBlock) && !new RegExp(`${k}: '`).test(boolBlock) && !new RegExp(`'${k}':`).test(boolBlock) && !ROOT_ONLY.has(k))
chk(allowedKeys.length >= 10 && unmapped.length === 0, `⑤/set 白名单 ${allowedKeys.length} 键全部有写通道映射（未映射 ${unmapped.length}${unmapped.length ? ' → ' + unmapped.join(',') : ''}）`)
// ⑤b **键类型分类**：每个 /set 键必须能归类为「枚举 / 数值(有 RANGE) / 字符串(在 STRING_KEYS)」——
//     否则会在 Number() 化时被吞（实测两次：recallFusion='rrf'→0、selfCheckRepo=<path>→0）
const enumKeys = new Set([...allowedBlock.matchAll(/'([A-Za-z_.]+)':\s*\[([^\]]*)\]/g)].filter((m) => m[2].trim().length > 0).map((m) => m[1]))
const rangeKeys = new Set([...panel.slice(panel.indexOf('const RANGE'), panel.indexOf('if (!(key in allowed))')).matchAll(/'([A-Za-z_.]+)':\s*\[/g)].map((m) => m[1]))
const stringKeys = new Set([...(panel.match(/const STRING_KEYS = new Set\(\[([^\]]*)\]\)/) || [])[1]?.matchAll(/'([A-Za-z_.]+)'/g) || []].map((m) => m[1]))
const unclassified = allowedKeys.filter((k) => !enumKeys.has(k) && !rangeKeys.has(k) && !stringKeys.has(k))
chk(unclassified.length === 0, `⑤b 每个 /set 键可归类为 枚举/数值/字符串（未归类 ${unclassified.length}${unclassified.length ? ' → ' + unclassified.join(',') : ''}；已归类 枚举 ${enumKeys.size} / 数值 ${rangeKeys.size} / 字符串 ${stringKeys.size}）`)
// ⑤/toggle 布尔键对账（覆盖边界说明）：下面是对**硬编码 6 键列表**做 SUITE_BOOL 映射核对——
//    它只覆盖「这 6 个键是否已映射」，**不覆盖**「/toggle 白名单新增了键却漏配映射」这类新键缺口
//    （既有弱点，非本次引入）。原此处另有 toggleBlock / toggleKeys 两变量，经 grep 全仓确认**零引用 = 死代码**
//    （其 matchAll 亦只是罗列 /toggle 块内的引号标识符，无法用于动态对账），已删除；如需真正动态对账应从
//    /toggle 白名单提取，但会牵动其它检查，本次不重构。
const toggleUnmapped = ['injectRelevance', 'bankGit', 'mclEnabled', 'mclAudit', 'shadowScore', 'maturationEnforce'].filter((k) => !new RegExp(`${k}: '`).test(boolBlock) && !new RegExp(`'${k}':`).test(boolBlock))
chk(toggleUnmapped.length === 0, `⑤/toggle 布尔键全部走 SUITE_BOOL（未映射 ${toggleUnmapped.length}${toggleUnmapped.length ? ' → ' + toggleUnmapped.join(',') : ''}）`)

// ⑥ **层执行**（2026-09-11 缺陷1 的机检补位——原①~⑤全是「声明侧」校验，对「只声明未执行」零覆盖）
//    缺陷原貌：契约全绿（P⇒always、R/E⇒gated 都在），但恒定注入面 `readCarrier` 的 index 分支只用
//    `/^\[.+\]/` 通配选取 ⇒ 76.1%（51/67）gated 行无差别进恒定预算。声明对了、执行没做，机检却全 PASS。
//    本道把「执行侧」钉死：恒定面必须走共享层判据，且判据唯一实现在 targets.ts、由注册表驱动。
const srcFiles = ['panel', 'targets', 'vec', 'mcl'].map((f) => read(`src/${f}.ts`)).join('\n')
chk(/indexRowInLayer\(l, 'always'\)/.test(panel), "⑥恒定注入面按层准入：panel 调 indexRowInLayer(l,'always')")
chk(/export function indexRowInLayer/.test(targetsSrc) && /indexCarrierSet/.test(targetsSrc), '⑥层判据单一实现在 targets.ts（indexRowInLayer / indexCarrierSet）')
const vecCode = stripComments(read('src/vec.ts'))
// 强断言：vec 侧不得再出现「逐行扫 `^\[tag\]` + 自己 push 成 RecallRow」的第二份副本
//   （行扫描特征 = `const rows/pool: RecallRow[]` 后紧跟 `match(/^\[`）——2026-09-11 前正是这个副本在漂移。
chk(/scanIndexRows/.test(vecCode) && !/tagM/.test(vecCode) && !/pool\.push\(\{/.test(vecCode), '⑥vec 融合池复用 scanIndexRows（无第二份逐行扫描副本：无 tagM / 无 pool.push）')
// 硬编码标签白名单 = 同一事实的第二份副本，会随注册表演进而静默漂移（mcl.ts 曾硬编码 /^\[(路径|原则)\]/）。
// 注意：只扫**代码**，先剥注释——否则「注释里引用旧写法」会被误报（本检查第一版就踩了这个坑，
//   与 ④ 的假绿同源：对源码做正则断言必须区分「代码」与「散文」）。
const codeOnly = ['panel', 'targets', 'vec', 'mcl'].map((f) => stripComments(read(`src/${f}.ts`))).join('\n')
const hardTag = codeOnly.match(/\/\^\\\[\(?[^\]\n]*?(路径|原则|经验|教训|环境|身份|偏好|习惯)/)
chk(!hardTag, `⑥src 代码无标签硬编码白名单正则（层判据一律走注册表）${hardTag ? ' → ' + hardTag[0] : ''}`)
// 反面：层判据必须真的被 panel 用到（防「加了函数没人调用」的空转修复）
const mclSrc = read('src/mcl.ts')
chk(/highConfCarrierSet|indexRowTag/.test(mclSrc), '⑥MCL 高置信判据走注册表（highConfCarrierSet）')

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（载体契约机检门全过）')
process.exit(fail ? 1 : 0)
