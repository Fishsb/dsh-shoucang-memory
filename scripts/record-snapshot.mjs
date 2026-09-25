#!/usr/bin/env node
// record-snapshot.mjs — 记录库**时点快照**（W2 前置 · 2026-09-23 圆桌会审）
//
// ## 为什么需要它（判因，非预防性设计）
// data 席审计实测：`.records/` **没有可用时点回滚点** —— 库内唯一备份是
//   `.records/backup-dedup-2026-09-13T16-55-25-885Z/`，**9 天前，且只含 4 个 notes md 的片段，
//   不含 `records.jsonl` 副本**。⇒ 方案档把「先补回滚点」列为 **W2（动真源）的硬前置**。
//
// ## 设计纪律（逐条对应本仓既有教训）
//   · **落在仓外**：`~/.dsh/backups/` —— 库是私人数据区（`gitignore`），仓内快照会**随仓公开**（隐私红线）。
//   · **写入前先算 sha256，写完逐一回验**：本仓已记账「先留档再改」「留档失败 ⇒ 整批拒改」的纪律
//     （`fact-supersede-apply` / `proposal-apply` 同一判据）——快照自身不满足即不可信。
//   · **只读源库**：绝不触碰 `.records/` 任何文件（`copyFileSync` 单向）。
//   · **`--rotate N` 保留最近 N 份**：缺省 10，防快照无穷增长（`0` = 不清理）。
//   · **幂等**：同秒重复跑会复用同一目录并按内容覆盖（不产生半截快照）。
//
// 用法：
//   node scripts/record-snapshot.mjs                 # 打一份快照（缺省库根）
//   node scripts/record-snapshot.mjs --rotate 5      # 打快照并只保留最近 5 份
//   node scripts/record-snapshot.mjs --list          # 只列出既有快照，不写
//   node scripts/record-snapshot.mjs --verify <dir>  # 校验某份快照与当前库是否一致
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const argOf = (name, dflt = null) => {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const has = (name) => process.argv.includes(name)

/** 库根：与 `src/targets.ts#memoryLibRoot()` 同口径（env 优先，其次 DSH_HOME，再其次 ~/.dsh） */
function memoryRoot () {
  if (process.env.MEMORY_ROOT) return process.env.MEMORY_ROOT
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'suite', 'memory')
}

const root = argOf('--root', memoryRoot())
const storeDir = join(root, '.records')
const backupRoot = argOf('--dest', join(homedir(), '.dsh', 'backups'))

/** 快照面：**记录库本体 + 环事件流 + 写时自证**（三者共同定义"这一刻的库状态"） */
const FILES = ['records.jsonl', 'ring-events.jsonl', 'shadow-stats.json']

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

function listSnapshots () {
  if (!existsSync(backupRoot)) return []
  return readdirSync(backupRoot)
    .filter((n) => n.startsWith('sc-records-snapshot-'))
    .map((n) => ({ name: n, dir: join(backupRoot, n), mtime: statSync(join(backupRoot, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
}

// ── --selftest（2026-09-23 · W1）────────────────────────────────────────
//   判据：快照工具必须**可自证**——它是 W2（动真源）的前置，若它自身坏掉，
//   则"我有回滚点"这句话就是假的（本仓最忌的"机制自证"型假绿）。
//   ⚠ 全部在 `mkdtemp` 合成库上做，**绝不触碰真库**（`--root` 显式指向夹具）。
if (has('--selftest')) {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { execFileSync } = await import('node:child_process')
  const self = fileURLToPath(import.meta.url)

  let pass = 0, fail = 0
  const ok = (c, n) => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}`) } }

  const work = mkdtempSync(join(tmpdir(), 'sc-snap-'))
  const fakeRoot = join(work, 'memory')
  const fakeStore = join(fakeRoot, '.records')
  const fakeDest = join(work, 'backups')
  mkdirSync(fakeStore, { recursive: true })
  writeFileSync(join(fakeStore, 'records.jsonl'), '{"id":"a","text":"合成记录"}\n', 'utf8')
  writeFileSync(join(fakeStore, 'ring-events.jsonl'), '{"op":"x"}\n', 'utf8')
  writeFileSync(join(fakeStore, 'shadow-stats.json'), '{"writes":1,"diverged":0}\n', 'utf8')

  const run = (args) => {
    try { return { code: 0, out: execFileSync(process.execPath, [self, ...args], { encoding: 'utf8' }) } } catch (e) { return { code: e.status, out: ((e.stdout || '') + (e.stderr || '')) } }
  }

  // ① 打快照成功 + 三件齐 + MANIFEST 落盘
  const r1 = run(['--root', fakeRoot, '--dest', fakeDest])
  ok(r1.code === 0, `① 合成库上打快照成功（exit ${r1.code}）`)
  const snaps = existsSync(fakeDest) ? readdirSync(fakeDest).filter((n) => n.startsWith('sc-records-snapshot-')) : []
  ok(snaps.length === 1, `② 产出恰好 1 份快照（实测 ${snaps.length}）`)
  const snapDir = snaps.length ? join(fakeDest, snaps[0]) : ''
  ok(snapDir && existsSync(join(snapDir, 'MANIFEST.json')), '③ MANIFEST.json 已落盘（可追溯来源与 sha256）')
  const mf = snapDir && existsSync(join(snapDir, 'MANIFEST.json')) ? JSON.parse(readFileSync(join(snapDir, 'MANIFEST.json'), 'utf8')) : { files: [] }
  ok(mf.files.length === 3 && mf.files.every((f) => f.verified === true), `④ MANIFEST 记 3 件且全部 verified=true（实测 ${mf.files.length}）`)
  // ⑤ 目录名格式正确（**不得含尾点** —— 实测踩过：slice 切进毫秒前的点，
  //   而 PowerShell `-Filter "…*."` 会因尾点被规范化而**匹配全部** ⇒ 曾误删全部快照）
  ok(snaps.length ? /^sc-records-snapshot-\d{14}$/.test(snaps[0]) : false, `⑤ 目录名恰为 14 位纯数字（实测 ${snaps[0] || '-'}）—— 防尾点`)
  // ⑥ --verify 对一致快照报 0
  const r2 = run(['--root', fakeRoot, '--dest', fakeDest, '--verify', snapDir])
  ok(r2.code === 0, `⑥ --verify 一致时 exit 0（实测 ${r2.code}）`)
  // ⑦ **反例**：库前进后 --verify 仍须 exit 0，但输出注明"与当前库不同"（不误报为损坏）
  writeFileSync(join(fakeStore, 'records.jsonl'), '{"id":"a","text":"改过了"}\n', 'utf8')
  const r3 = run(['--root', fakeRoot, '--dest', fakeDest, '--verify', snapDir])
  ok(r3.code === 0 && /与当前库不同/.test(r3.out), '⑦ 反例：库前进后 --verify 仍 exit 0 且注明"与当前库不同"（不误判为快照损坏）')
  // ⑧ 轮转：打 3 份后 --rotate 1 只留 1 份
  run(['--root', fakeRoot, '--dest', fakeDest, '--rotate', '0'])
  run(['--root', fakeRoot, '--dest', fakeDest, '--rotate', '0'])
  run(['--root', fakeRoot, '--dest', fakeDest, '--rotate', '1'])
  const after = readdirSync(fakeDest).filter((n) => n.startsWith('sc-records-snapshot-'))
  ok(after.length === 1, `⑧ 轮转 --rotate 1 后只留 1 份（实测 ${after.length}）`)
  // ⑨ 库不存在 ⇒ exit 3（诚实跳过，不假装成功）
  const r4 = run(['--root', join(work, 'nope'), '--dest', fakeDest])
  ok(r4.code === 3, `⑨ 库不存在时 exit 3（实测 ${r4.code}）—— 不凭空造快照`)

  rmSync(work, { recursive: true, force: true })
  console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass / ${fail} fail）`)
  process.exit(fail ? 1 : 0)
}

// ── --list ───────────────────────────────────────────────────────────────
if (has('--list')) {
  const snaps = listSnapshots()
  if (!snaps.length) { console.log('（无快照）'); process.exit(0) }
  console.log(`既有快照 ${snaps.length} 份（新 → 旧）：`)
  for (const s of snaps) {
    const files = FILES.filter((f) => existsSync(join(s.dir, f)))
    const rec = join(s.dir, 'records.jsonl')
    const info = existsSync(rec) ? `${statSync(rec).size} B` : '缺 records.jsonl'
    console.log(`  · ${s.name}  ${new Date(s.mtime).toISOString()}  ${files.length}/${FILES.length} 件 · ${info}`)
  }
  process.exit(0)
}

// ── --verify <dir> ───────────────────────────────────────────────────────
if (has('--verify')) {
  const dir = argOf('--verify')
  if (!dir || !existsSync(dir)) { console.error(`⛔ 快照目录不存在：${dir}`); process.exit(1) }
  let bad = 0
  for (const f of FILES) {
    const src = join(storeDir, f)
    const dst = join(dir, f)
    if (!existsSync(src)) { console.log(`  · ${f.padEnd(22)} 源不存在（跳过）`); continue }
    if (!existsSync(dst)) { console.log(`  ❌ ${f.padEnd(22)} 快照缺该件`); bad++; continue }
    const same = sha256(src) === sha256(dst)
    console.log(`  ${same ? '✅' : '⚠'} ${f.padEnd(22)} ${same ? '与当前库一致' : '**与当前库不同**（库已前进，属正常）'}`)
  }
  process.exit(bad ? 1 : 0)
}

// ── 打快照（主路径）────────────────────────────────────────────────────
if (!existsSync(storeDir)) { console.error(`⛔ 记录库不存在：${storeDir}\n   （库未建时无可快照；先确认 MEMORY_ROOT）`); process.exit(3) }

const ts = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..*$/, '').slice(0, 14)  // yyyymmddHHMMSS
const tag = `sc-records-snapshot-${ts}`
const dest = join(backupRoot, tag)
mkdirSync(dest, { recursive: true })

const manifest = []
for (const f of FILES) {
  const src = join(storeDir, f)
  if (!existsSync(src)) { console.log(`  · ${f} 不存在（跳过）`); continue }
  const dst = join(dest, f)
  copyFileSync(src, dst)
  const h = sha256(src)
  const h2 = sha256(dst)
  const okFlag = h === h2
  manifest.push({ file: f, bytes: statSync(src).size, sha256: h, verified: okFlag })
  console.log(`  ${okFlag ? '✅' : '❌'} ${f.padEnd(22)} ${String(statSync(src).size).padStart(10)} B  sha256=${h.slice(0, 16)}`)
  if (!okFlag) { console.error(`⛔ 快照回验失败：${f} —— 快照不可信，请重跑`); process.exit(1) }
}

writeFileSync(join(dest, 'MANIFEST.json'), JSON.stringify({ at: new Date().toISOString(), root, source: storeDir, files: manifest }, null, 2), 'utf8')
console.log(`\n快照完成：${dest}`)

// ── 轮转 ────────────────────────────────────────────────────────────────
const keep = Number(argOf('--rotate', '10'))
if (Number.isFinite(keep) && keep > 0) {
  const snaps = listSnapshots()
  const drop = snaps.slice(keep)
  if (drop.length) {
    for (const s of drop) { rmSync(s.dir, { recursive: true, force: true }); console.log(`  轮转删除：${s.name}`) }
  }
  console.log(`  保留最近 ${Math.min(keep, snaps.length)} 份`)
}
process.exit(0)
