#!/usr/bin/env node
// deploy-installed.mjs — 「只覆盖差异文件」部署（仓 → 已安装副本 + 记忆库面）· 2026-09-14（P7 · D11）
//
// **为什么补这个脚本（实测教训）**：此前部署一直是**手工 ad-hoc**（node 一行命令 / 各人自己的写法），
//   而我的写法只比 `.js` / `.d.ts` ⇒ **19 个 `.js.map` 静默漂移了 6 轮无人发现**（功能面零漂移，
//   但「装上去的那份」与仓内不再逐件一致）。`check-installed-sync --strict` 一开就把它们全抓了出来。
//   ⇒ 部署必须是**一条命令、全扩展名**，不能靠每次现场手写。
//
// 语义（与 `scripts/check-deploy-sync.mjs` 对齐，**不另立一份口径**）：
//   · 面 1：仓 `lib/**` → 已安装 `<profile>/node_modules/<pkg>/lib/**`（**全扩展名**；缺失者补建）
//   · 面 2：仓 `scripts/` · `skill/scripts/` · `skill/engine/` · `skill/docs/` → 记忆库同名路径
//     （**只覆盖库内已存在者**——`check-deploy-sync` 把"库内缺失"判为「未部署，非错误」，本脚本同口径）
//   · **只复制差异件**（不整目录覆盖：`pnpm install` 会触发宿主批量删除保护）
//
// 用法: node scripts/deploy-installed.mjs [--dry]
// 退出码: 0 = 已同步（或无需同步）· 3 = 未探测到已安装副本（诚实跳过）
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
/** 删除传播开关：**缺省关**（保守）。装副本是纯派生物，剪枝安全；库面永不剪枝。 */
const PRUNE = argv.includes('--prune')
const argOf = (k) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : null }
const PKG_NAME = 'dsh-shoucang-memory'
const sha1 = (p) => createHash('sha1').update(readFileSync(p)).digest('hex')

/** 递归列文件（返回相对路径 → 绝对路径）。**不按扩展名过滤**——半吊子部署正是这么来的。 */
function walk(dir, rel = '') {
  const out = new Map()
  let names = []
  try { names = readdirSync(rel ? join(dir, rel) : dir) } catch { return out }
  for (const n of names) {
    const r = rel ? `${rel}/${n}` : n
    let st = null
    try { st = statSync(join(dir, r)) } catch { continue }
    if (st.isDirectory()) { for (const [k, v] of walk(dir, r)) out.set(k, v); continue }
    out.set(r, join(dir, r))
  }
  return out
}

function probeInstalled() {
  const explicit = argOf('--installed')
  if (explicit) return existsSync(explicit) ? [explicit] : []
  const base = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles')
  const hits = []
  try {
    for (const prof of readdirSync(base)) {
      const p = join(base, prof, 'node_modules', PKG_NAME)
      if (existsSync(p)) hits.push(p)
    }
  } catch { /* 无 profiles/ ⇒ 诚实跳过 */ }
  return hits
}

let copied = 0, same = 0
const plan = []
/**
 * `createIfMissing` 是**两面语义的分水岭**：
 *   · **安装面**（lib）＝ 宿主实际加载的那份，**必须完整** ⇒ 缺失要补建；
 *   · **库面**（scripts/engine/docs）＝ `check-deploy-sync` 把「库内缺失」判为「未部署，非错误」
 *     ⇒ **只覆盖已存在者**，不擅自往私人数据区新增文件。
 * （初版对两面用同一语义 ⇒ 3 个缺失的 `.js.map` 补不上、`--strict` 仍红——正是"一处语义套两面"的典型失手。）
 */
function planCopy(src, dst, label, createIfMissing) {
  const exists = existsSync(dst)
  if (!exists && !createIfMissing) return
  if (exists && sha1(src) === sha1(dst)) { same++; return }
  plan.push({ src, dst, label, isNew: !exists })
}

// ── 面 1：lib/**（全扩展名；**缺失补建**）──
// ⚠ **范围说明（2026-09-17 实测留痕，防重踩）**：本面**不含仓根 `client.js`**，且这是**正确**的 ——
//   · **加载面是 `lib/client.js`**：`package.json` 的 `sideEffects: ["./lib/client.js"]` 自述
//     「面向宿主加载器的发布提示」；`build-client.mjs:6` 亦写明「产物 = 仓根 `client.js`（IIFE）→
//     **再复制到 `lib/client.js`（沿用「lib/client.js 即 client bundle」契约）**」。
//   · ⇒ 仓根 `client.js` 是**构建中间产物**；其副本滞后**无害**（实测四者曾同时字节一致）。
//   · 故**勿**为"补齐仓根 client.js"而加面 —— 那是复制冗余件的堆叠（与仓内极简约定冲突）。
//     仅当将来 `sideEffects` / 构建契约改为指向根件时，才需要把根件纳入本面。
const repoLib = join(root, 'lib')
const targets = probeInstalled()
if (!existsSync(repoLib)) { console.log('⏭ 跳过：仓内 lib/ 不存在（先 npm run build）'); process.exit(3) }
if (!targets.length) { console.log(`⏭ 跳过：未探测到已安装副本（~/.dsh/profiles/*/node_modules/${PKG_NAME}）`); process.exit(3) }
//   ⚠ **patch 与 skill/ 必须纳入安装面**（2026-09-21 实测缺陷）：原先只同步 `lib/` ⇒ 仓内改了
//   `cordis.patch.yml`（含 2026-09-21 新增的 `bundledSkillDir` skill 自注册条目）**装上去的那份不变**，
//   `dev_reload_package` 也只会重载 lib ⇒ **配置改动静默不生效**（"仓内绿 ≠ 运行态绿"的又一实例）。
//   实证：安装副本 patch 停在单条 `dsh-shoucang-memory`，而仓内已是 2 条。skill/ 同理：
//   `bundledSkillDir` 指向的正是**安装副本内**的 `skill/`，不同步 ⇒ 注册到的是旧规则档。
//   ⚠ 与本面上方的「勿纳入仓根 client.js」**不冲突**：那件是**构建中间产物**（`lib/client.js` 才是加载面）；
//     本处两者皆为**随包发布件**（`package.json#files` 含 `"skill"` 与 `cordis.patch.yml`），非冗余副本。
const FACE1_EXTRA = ['cordis.patch.yml']
for (const extra of FACE1_EXTRA) {
  const src = join(root, extra)
  if (existsSync(src)) for (const tgt of targets) planCopy(src, join(tgt, extra), extra, true)
}
for (const [rel, src] of walk(join(root, 'skill'))) {
  for (const tgt of targets) planCopy(src, join(tgt, 'skill', rel.split('/').join(sep)), `skill/${rel}`, true)
}
for (const tgt of targets) {
  const instLib = join(tgt, 'lib')
  for (const [rel, src] of walk(repoLib)) planCopy(src, join(instLib, rel.split('/').join(sep)), `lib/${rel}`, true)
}
/** 面2 **运行期必需件**白名单（**新增运行期依赖件时必须在此登记**）。
 *  判因（2026-09-19 实测）：面2 缺省「只覆盖库内已存在者」⇒ **新件静默不部署**——
 *  `skill/scripts/section-ref.mjs` 落地时库内不存在 ⇒ 库侧 `read_section.mjs` / `memory_write_gate.mjs`
 *  的 `import './section-ref.mjs'` 在**运行期** ERR_MODULE_NOT_FOUND（仓内绿、装上去跑不了）。
 *  故：白名单内**缺失即补建**（属部署完整性，不是往私人数据区塞新东西）；白名单外维持「只覆盖」。 */
const FACE2_REQUIRED = new Set([
  'section-ref.mjs', 'bank-lock.mjs', 'read_section.mjs', 'memory_write_gate.mjs', 'memory-append.mjs',
  'memory_health_check.mjs', 'memory-reconcile.mjs', 'archive-lib.mjs', 'bank-git.mjs', 'harvest-access.mjs',
  'vendor/fzstd.cjs',
])
// ── 面 2：记忆库面（**只覆盖库内已存在者** + 白名单缺失补建）──
const bank = argOf('--bank') || process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'memory')
//   ⚠ **顶层规则档（skill/*.md）必须显式列出**（2026-09-21 实测缺陷）：它们**不在**任何 srcDir 下，
//   原先只由 `panel-shared#bootstrapDefaults` 的 `copyFileIfAbsent` 播种（**只建不缺**）⇒
//   仓内升级**永不抵达**活库。实证：`audit-protocol.md` 活库停在 09-10（写已退役的
//   `audit/raw-stub/stub.jsonl`），仓内 09-13 已升级为 `ledger.jsonl` 的 `type=stub`，**漂移 3 天无人知**
//   （六件其余五件因恰好未被改过而"看起来一致"，属偶然而非机制保证）。
//   与 `bootstrapDefaults` 的六件清单保持同一集合：新增加顶层规则档须**两处同步**。
const FACE2_TOP_FILES = ['SKILL.md', 'audit-protocol.md', 'human-execution-loop.md', 'memory-whitelist-spec.md', 'task-protocols.md', 'README.md']
for (const f of FACE2_TOP_FILES) {
  const src = join(root, 'skill', f)
  if (!existsSync(src)) continue
  planCopy(src, join(bank, f), `skill/${f}`, false)
}
for (const [srcDir, bankDir] of [['scripts', 'scripts'], ['skill/scripts', 'scripts'], ['skill/engine', 'engine'], ['skill/docs', 'docs']]) {
  const d = join(root, srcDir)
  if (!existsSync(d)) continue
  for (const [rel, src] of walk(d)) {
    if (!src.endsWith('.mjs') && !src.endsWith('.json') && !src.endsWith('.md') && !src.endsWith('.cjs')) continue // 与 check-deploy-sync 的 exts 对齐（+.cjs：库侧 archive-lib 依赖 vendor/fzstd.cjs）
    const required = FACE2_REQUIRED.has(rel.split('/').join('/'))
    planCopy(src, join(bank, bankDir, rel.split('/').join(sep)), `${srcDir}/${rel}`, required)
  }
}
// ── 面2 完整性复核（白名单件必须真的在库内；缺失 ⇒ FAIL，不再靠人肉发现）──
//   ⚠ 必须**在复制之后**求值（初版在计划期求值 ⇒ 刚补建的件仍被报"缺失"，自造假红）。
const missingRequired = () => [...FACE2_REQUIRED].filter((rel) => !existsSync(join(bank, 'scripts', rel.split('/').join(sep))))

// ── 删除传播（**仅安装面**；2026-09-14 补）──
// 为什么必须补：本件原先**只复制差异、不传播删除** ⇒ 仓内删掉的文件会永远留在装副本里。
//   实测：删除死件 `record-address` 后，`check-installed-sync --strict` 立刻报
//   「漂移 1 个（**合计 0 件**）」—— 0 是因为那句汇总只算 differ+onlyRepo，**漏算 onlyInst**（已一并修）。
// **为什么只对安装面做**：`<profile>/node_modules/<pkg>/lib/` 是**纯派生物**（完全由仓内 lib/ 生成）；
//   而**库面不是**（`~/.dsh/skills/managing-memory/` 是用户私有数据区，含库侧自有的聚合产物）
//   ⇒ 库面**永不剪枝**，与用户原则一致：「在共享目录中删除只按本次自己创建的确切文件名，永不按通配符扫删」。
const orphans = []
for (const tgt of targets) {
  const instLib = join(tgt, 'lib')
  const repoFiles = walk(repoLib)
  for (const [rel] of walk(instLib)) {
    if (!repoFiles.has(rel)) orphans.push({ dst: join(instLib, rel.split('/').join(sep)), label: `lib/${rel}` })
  }
}

console.log(`部署（只覆盖差异文件 · 全扩展名）`)
console.log(`  已安装副本：${targets.length} 个 · 一致 ${same} 件 · **待部署差异 ${plan.length} 件**`)
if (orphans.length) {
  console.log(`  ${PRUNE ? '待剪枝' : '⚠ 装副本有仓内已删除的残留'} ${orphans.length} 件（**仅安装面**；库面永不剪枝）：`)
  for (const o of orphans.slice(0, 12)) console.log(`     ${PRUNE ? '−' : '·'} ${o.label}`)
  if (orphans.length > 12) console.log(`     … 另有 ${orphans.length - 12} 件`)
  if (!PRUNE) console.log('     ⇒ 要一并清掉请加 `--prune`（不加则保留，`check-installed-sync --strict` 会因此报漂移）')
}
if (!plan.length && (!PRUNE || !orphans.length)) { console.log('\nPASS（无需同步）'); process.exit(0) }
if (DRY) {
  plan.slice(0, 20).forEach((p) => console.log(`  (dry) ${p.label}`))
  if (plan.length > 20) console.log(`  … 另有 ${plan.length - 20} 件`)
  console.log('\nPASS（dry-run：未写入）')
  process.exit(0)
}
for (const p of plan) {
  try { mkdirSync(dirname(p.dst), { recursive: true }); copyFileSync(p.src, p.dst); copied++ }
  catch (e) { console.error(`  ❌ 复制失败 ${p.label}：${String(e.message).slice(0, 100)}`) }
}
let pruned = 0
if (PRUNE) for (const o of orphans) { try { unlinkSync(o.dst); pruned++ } catch (e) { console.error(`  ❌ 剪枝失败 ${o.label}：${String(e.message).slice(0, 100)}`) } }
console.log(`  已复制 ${copied}/${plan.length} 件${PRUNE ? ` · 已剪枝 ${pruned}/${orphans.length} 件` : ''}`)
if (missingRequired().length) {
  console.error(`  ❌ 面2 运行期必需件仍缺 ${missingRequired().length} 件：${missingRequired().join(', ')}`)
  console.error('     ⇒ 库侧 import 会在运行期 ERR_MODULE_NOT_FOUND；请在 FACE2_REQUIRED 复核后补齐')
  process.exit(1)
}
console.log(`  面2 运行期必需件 ${FACE2_REQUIRED.size} 件齐备`)
console.log('\n下一步：① `node scripts/check-installed-sync.mjs --strict` 复核 ② 宿主热重载（dev_reload_package）')
console.log('PASS（部署完成）')
