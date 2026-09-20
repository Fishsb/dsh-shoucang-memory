#!/usr/bin/env node
// migrate-cue-keys.mjs — IR1 册二 **存量 cue 归一**（2026-09-18）
//
// 做什么：把 `.records/records.jsonl` 里 `meta.cues` 的键**过一遍唯一归一实现**（`src/cue-space.ts`），
//   让存量记录与**读侧产出的键形态**一致（旧存量的 `scope=workspace:<盘符>\<a>` 与读侧新形态不同 ⇒
//   字符串全等匹配**永不命中**：实测 218 / 729 条 scope 键未归一）。
//
// 纪律（**逐条可核**）：
//   · **只改 `meta.cues`** —— 正文、其它 meta 字段、id/createdAt 一律逐字不动（写前逐条比对，不一致即中止）；
//   · **备份先行**（`<records>.bak-cue-<ts>`，字节级复制）+ **原子写**（同目录 tmp → rename）；
//   · **幂等**：第二次运行报告 0 变更（归一函数幂等，由 `check-cue-space --selftest` 锁）；
//   · **未声明维不删**：只归一、不丢弃（丢弃属"删数据"，须单独拍板）；它们会被报告出来。
//
// 用法：
//   node scripts/migrate-cue-keys.mjs                 # dry-run（缺省：只报告，不写盘）
//   node scripts/migrate-cue-keys.mjs --apply         # 执行（备份 + 原子写）
//   node scripts/migrate-cue-keys.mjs --root <库根>    # 指定库根（缺省 MEMORY_ROOT 或 ~/.dsh/skills/managing-memory）
import { copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const APPLY = argv.includes('--apply')
const memRoot = argOf('--root', '') || process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory')
const recFile = join(memRoot, '.records', 'records.jsonl')

const { serializeCues, parseCues, normalizeCueKey, declaredCueDims } = await import(new URL('../lib/cue-space.js', import.meta.url).href)
if (typeof serializeCues !== 'function') { console.log('❌ lib/cue-space.js 导出不齐（先 npm run build:host）'); process.exit(1) }
const dims = declaredCueDims()

if (!existsSync(recFile)) { console.log(`❌ 记录文件不存在：${recFile}`); process.exit(3) }

const raw = readFileSync(recFile, 'utf8')
const lines = raw.split('\n')
let changed = 0, touchedKeys = 0, undeclared = 0, failed = 0
const out = lines.map((line) => {
  if (!line.trim()) return line
  let o
  try { o = JSON.parse(line) } catch { failed++; return line }
  const before = o?.meta?.cues
  if (!before) return line
  const keys = parseCues(before) // 已含归一
  const after = serializeCues(keys)
  undeclared += keys.filter((k) => !dims.includes(k.split('=')[0])).length
  if (after === String(before)) return line
  changed++
  touchedKeys += String(before).split('\n').filter(Boolean).length
  // **最小改动**：只替换 meta.cues 一处 —— 其余字段逐字保留（用 JSON 字符串替换而非重建对象，
  //   避免"重建对象"顺带改掉键序/数字格式，那会让 diff 无法逐条核对）。
  const patched = { ...o, meta: { ...o.meta, cues: after } }
  return JSON.stringify(patched)
})
const next = out.join('\n')

console.log(`cue 存量归一（${APPLY ? '**APPLY**' : 'dry-run'}）`)
console.log(`  库根：${memRoot}`)
console.log(`  记录 ${lines.filter((l) => l.trim()).length} 行 · 解析失败 ${failed} 行（保留原样）`)
console.log(`  待改记录 **${changed}** 条 · 涉及键 ${touchedKeys} 个 · 未声明维键 ${undeclared} 个（**只归一、不丢弃**）`)
console.log(`  声明维：[${dims.join(', ')}]`)

if (!changed) { console.log('✅ 无变更（幂等：本脚本可反复运行）'); process.exit(0) }
if (!APPLY) {
  console.log('（dry-run：未写盘。确认无误后加 `--apply` 执行；执行前会自动备份）')
  process.exit(0)
}
const bak = `${recFile}.bak-cue-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`
copyFileSync(recFile, bak)
const tmp = `${recFile}.tmp-${process.pid}`
writeFileSync(tmp, next, 'utf8')
// 写前**自证只改了 cues**：逐行比对"去掉 cues 后的 JSON"必须与原始一致
let diffOther = 0
{
  const a = raw.split('\n'), b = next.split('\n')
  if (a.length !== b.length) diffOther = -1
  else for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    const strip = (s) => { try { const o = JSON.parse(s); if (o?.meta) o.meta = { ...o.meta, cues: undefined }; return JSON.stringify(o) } catch { return s } }
    if (strip(a[i]) !== strip(b[i])) diffOther++
  }
}
if (diffOther !== 0) {
  try { writeFileSync(tmp, '') } catch { /* 清理失败无害 */ }
  console.log(`❌ **中止**：除 meta.cues 之外还有 ${diffOther === -1 ? '行数变化' : diffOther + ' 处差异'} ⇒ 不写盘（备份未生成后的现场保持原样）`)
  process.exit(1)
}
renameSync(tmp, recFile)
console.log(`✅ 已写盘：${recFile}（${statSync(recFile).size} B）· 备份 ${bak}`)
console.log('   复核：`node scripts/check-cue-space.mjs`（B1 应转绿）· 复跑本脚本应报"无变更"（幂等）')
