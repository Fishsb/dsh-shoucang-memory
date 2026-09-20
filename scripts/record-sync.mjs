#!/usr/bin/env node
/**
 * record-sync.mjs — P4「存储解耦」同步器（Record 事实源 ⟷ md 投影）
 *
 * 与 `record-export.mjs` 的分工：record-export 是**前置闸**（只证往返可重现）；
 *   本件是**同步器**（真落/真读影子库 + 对账 + 干跑），两者共用 `lib/record-store.js` 的**单一实现**，
 *   不各自维护一份解析器（抄一份就是第二份副本 —— 仓内 ADR-130 明令禁止的漂移源）。
 *
 * 子命令（缺省 = --check）：
 *   --import          md → 影子库（三索引整片镜像；写 `<root>/.records/records.jsonl`）
 *   --check           对账：影子库投影 ⟷ md 逐字节一致（只读；影子库缺席 ⇒ exit 3 诚实跳过）
 *   --diff            干跑：报告 import 会产生的动作数（增/删/改），**不写任何文件**
 *   --export [--write] 影子库 → md（缺省只打印差异；`--write` 才落盘，落盘前写 `.bak-record-sync`）
 *   --json <out>      附落一份机器可读报告
 *
 * 用法：node scripts/record-sync.mjs [--root <dir>] [--json out.json]
 * 退出码（仓内契约）：0 = pass · 3 = skip（依赖缺失）· 1 = fail
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const argOf = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def }

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = argOf('--root', process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'memory'))
const JSON_OUT = argOf('--json', '')
const at = new Date().toISOString()

const S = await import(new URL('../lib/record-store.js', import.meta.url).href)
const H = await import(new URL('../lib/record-shadow.js', import.meta.url).href)

const mode = has('--import') ? 'import' : has('--diff') ? 'diff' : has('--export') ? 'export' : 'check'
const report = { root: ROOT, at, mode, files: [], verdict: 'pass' }

if (!existsSync(ROOT)) {
  console.log(`⏭ 记忆库根缺席：${ROOT}`)
  process.exit(3)
}

// 载体面 = 索引三件 + `notes/*.md`（2026-09-13 切源前置：notes 也必须有记录表示）
const files = H.carrierFiles(ROOT).filter((f) => existsSync(join(ROOT, f)))
if (!files.length) {
  console.log(`⏭ 三索引全缺席（${ROOT}）`)
  process.exit(3)
}

if (mode === 'import') {
  const res = H.mirrorAll(ROOT, at, files)
  for (const r of res) {
    report.files.push(r)
    console.log(`${r.ok ? '✅' : '❌'} ${r.file.padEnd(10)} 记录 ${String(r.records).padStart(3)} · ${String(r.bytes).padStart(5)}B · 往返${r.roundTrip ? '逐字节一致' : '**不一致**'}${r.error ? ` · ${r.error}` : ''}`)
    if (!r.ok || !r.roundTrip) report.verdict = 'fail'
  }
  const inv = H.shadowInventory(ROOT)
  console.log(`\n影子库：${H.recordStorePath(ROOT)}`)
  console.log(`记录合计 ${inv.records} · kind ${Object.entries(inv.byKind).map(([k, v]) => `${k}:${v}`).join(' ')} · lifecycle ${Object.entries(inv.byLifecycle).map(([k, v]) => `${k}:${v}`).join(' ')} · 无标签待归类 ${inv.untagged}`)
} else if (mode === 'check') {
  if (!existsSync(H.recordStorePath(ROOT))) {
    console.log(`⏭ 影子库未建（${H.recordStorePath(ROOT)}）——先跑 --import；对账跳过`)
    process.exit(3)
  }
  const rows = H.parityOf(ROOT, files)
  for (const r of rows) {
    report.files.push(r)
    console.log(`${r.ok ? '✅' : '❌'} ${r.file.padEnd(10)} 对账${r.ok ? '逐字节一致' : '**不一致**'} · md ${r.mdBytes}B / store ${r.storeBytes}B${r.reason ? ` · ${r.reason}` : ''}`)
    if (!r.ok) report.verdict = 'fail'
  }
} else if (mode === 'diff') {
  // 干跑：影子库当前内容 vs 现 md 应产生的 Record 集（按 id 差分；不写任何文件）
  const cur = H.loadStore(ROOT)
  if (cur.error) { console.log(`❌ 影子库损坏：${cur.error}`); process.exit(1) }
  let wouldAdd = 0, wouldRemove = 0, wouldChange = 0
  for (const f of files) {
    const parsed = H.parseMdFile(ROOT, f, at)
    if (!parsed) continue
    const sub = cur.records.filter((r) => r.file === f)
    const d = S.diffRecords(sub, parsed.records)
    wouldAdd += d.added.length; wouldRemove += d.removed.length; wouldChange += d.changed.length
    report.files.push({ file: f, added: d.added.length, removed: d.removed.length, changed: d.changed.length })
    console.log(`· ${f.padEnd(10)} 将增 ${d.added.length} / 删 ${d.removed.length} / 改 ${d.changed.length}`)
  }
  console.log(`\n干跑合计：增 ${wouldAdd} / 删 ${wouldRemove} / 改 ${wouldChange}（未写任何文件）`)
} else {
  // export：影子库 → md（缺省只报差异；--write 才落盘）
  const cur = H.loadStore(ROOT)
  if (cur.error) { console.log(`❌ 影子库损坏：${cur.error}`); process.exit(1) }
  const write = has('--write')
  for (const f of files) {
    const rendered = S.renderFile(cur.records, f)
    const raw = readFileSync(join(ROOT, f), 'utf8')
    const same = rendered === raw
    report.files.push({ file: f, same, mdBytes: raw.length, storeBytes: rendered.length })
    if (!same && write) {
      copyFileSync(join(ROOT, f), join(ROOT, f) + '.bak-record-sync')
      writeFileSync(join(ROOT, f), rendered, 'utf8')
      console.log(`✍️  ${f.padEnd(10)} 已由影子库重写（备份 .bak-record-sync）· ${raw.length}B → ${rendered.length}B`)
    } else {
      console.log(`${same ? '✅' : '⏸'} ${f.padEnd(10)} ${same ? '一致（无需导出）' : `存在差异（${raw.length}B ≠ ${rendered.length}B）—— 加 --write 才落盘`}`)
    }
  }
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 1), 'utf8')
  console.log(`\n报告已落：${JSON_OUT}`)
}

if (report.verdict === 'fail') { console.log('\nFAIL（双写对账未零差异 —— 切换事实源前必须先修平）'); process.exit(1) }
console.log('\nPASS')
