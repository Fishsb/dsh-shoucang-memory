#!/usr/bin/env node
/**
 * check-record-parity.mjs — P4 事实源切换的**常驻门禁**（登记于 scripts/check-runner.mjs）
 *
 * 为什么需要它（仓内纪律）：方案档 §10 的对账判据是「同一 Record 集导出 md 必须逐字节重现；
 *   任一不一致 ⇒ 回滚 storeMode=md」。判据若只写在文档里就是口号——本项目已有"写了从未运行"前例。
 *   故把它做成**每次 npm test 都跑**的机检件。
 *
 * 三档判定（诚实分级，不把"没跑"显示成"通过"）：
 *   ① **往返闸**（恒跑）：md → Record → md 逐字节重现。这是切源的前置条件，与影子库是否存在无关。
 *   ② **对账闸**（影子库存在时）：影子库投影 ⟷ md 逐字节一致。
 *   ③ **开关一致性**：`storeMode`（读 ~/.dsh/suite/scheduler.json，与 liveCaps 同源）
 *      = `dual` 而影子库缺席 ⇒ **FAIL**（不是跳过）——启用即须有影子库，否则开关是死的。
 *
 * 用法：node scripts/check-record-parity.mjs [--root <dir>]
 * 退出码：0 = pass · 3 = skip（记忆库缺席，依赖缺失）· 1 = fail
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const argOf = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def }
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const ROOT = argOf('--root', process.env.MEMORY_ROOT || join(dshHome, 'suite', 'memory'))

const S = await import(new URL('../lib/record-store.js', import.meta.url).href)
const H = await import(new URL('../lib/record-shadow.js', import.meta.url).href)

if (!existsSync(ROOT)) {
  console.log(`⏭ 记忆库根缺席（${ROOT}）—— 本机未部署记忆库，对账跳过`)
  process.exit(3)
}

/** storeMode 与宿主同源读取（liveCaps 同款：scheduler.json 是自持持久通道） */
function storeModeOf() {
  try {
    const s = JSON.parse(readFileSync(join(dshHome, 'suite', 'scheduler.json'), 'utf8'))
    return typeof s.storeMode === 'string' ? s.storeMode : 'md'
  } catch { return 'md' }
}
const storeMode = storeModeOf()

// 载体面 = 索引三件 + `notes/*.md`（2026-09-13：切源前置要求**详情载体也有记录表示**，故往返/对账闸一并覆盖）
const files = H.carrierFiles(ROOT).filter((f) => existsSync(join(ROOT, f)))
if (!files.length) {
  console.log(`⏭ 三索引全缺席（${ROOT}）—— 对账跳过`)
  process.exit(3)
}

let bad = 0
console.log(`record-parity · 库=${ROOT} · storeMode=${storeMode}`)

// ① 往返闸（恒跑）
for (const f of files) {
  const raw = readFileSync(join(ROOT, f), 'utf8')
  const records = S.parseRecords(raw, f)
  const back = S.renderFile(records, f)
  const rt = back === raw
  if (!rt) bad++
  console.log(`${rt ? '✅' : '❌'} ${f.padEnd(10)} 往返 ${String(records.length).padStart(3)} 记录 / ${String(raw.length).padStart(5)}B ${rt ? '逐字节一致' : '**不一致**'}`)
}

// ② 对账闸（影子库存在时）
const storePath = H.recordStorePath(ROOT)
const hasStore = existsSync(storePath)
if (hasStore) {
  // ⚠ 2026-09-13 记：曾按"并发写竞态"假设在此加过**复跑容错**，后经定位**该假设不成立**
  //   （真实抖动源是 `test-forgetops.mjs`，且其为**夹具隔离**测试、不读真库）⇒ **已撤回**。
  //   纪律：**未证实的容错等于掩盖真漂移**——留在这里会把首次不一致静默抹掉。
  for (const r of H.parityOf(ROOT, files)) {
    if (!r.ok) bad++
    console.log(`${r.ok ? '✅' : '❌'} ${r.file.padEnd(10)} 对账 md ${r.mdBytes}B / store ${r.storeBytes}B${r.reason ? ` · ${r.reason}` : ''}`)
  }
  const inv = H.shadowInventory(ROOT)
  console.log(`· 影子库 ${inv.records} 记录 · kind ${Object.entries(inv.byKind).map(([k, v]) => `${k}:${v}`).join(' ')} · 无标签待归类 ${inv.untagged}`)
} else {
  if (storeMode === 'dual') {
    bad++
    console.log(`❌ storeMode=dual 但影子库缺席（${storePath}）—— 开关已启用却无影子库（死开关）`)
  } else {
    console.log(`· 影子库未建（storeMode=${storeMode}）—— 对账闸待启用；往返闸已证明可切换`)
  }
}

// ④ **切源就绪度**（2026-09-13 新增 · 只读报告，不判红）——
//    ①②③ 证明的是「索引载体的往返/对账无损」；但 `storeMode=record` 的**语义**是「**md 成为投影**」，
//    而投影的前提是**载体在 Record 里得有表示**。本段把它量出来：哪些载体有记录、覆盖多少字节。
//    ⚠ 分类必须诚实：**技能资产**（spec/契约/协议/CHANGELOG/README）是**技能本体、非记忆载体**，
//      计入覆盖率是口径错误（首版踩过：算出 7.2% 的误导数字）。
if (argv.includes('--coverage')) {
  // ⚠ 分类**不能**用 `files`（它现在是"索引 + notes"的全清单——首版踩过：全算成索引 ⇒ 报 19/19）。
  //   索引载体 = `INDEX_FILES`（三件）；其余 md 载体一律为**详情载体**。
  const idx = new Set(S.INDEX_FILES)
  const store = hasStore ? H.loadStore(ROOT).records : []
  const rows = files.slice().sort().map((f) => ({
    f, family: idx.has(f) ? 'index' : 'detail',
    n: store.filter((r) => r.file === f).length,
    bytes: existsSync(join(ROOT, f)) ? statSync(join(ROOT, f)).size : 0,
  }))
  const line = (fam) => {
    const g = rows.filter((r) => r.family === fam)
    const cov = g.filter((r) => r.n > 0)
    return `${cov.length}/${g.length} 有记录表示 · ${cov.reduce((s, r) => s + r.bytes, 0)}/${g.reduce((s, r) => s + r.bytes, 0)}B`
  }
  console.log(`\n切源就绪度（storeMode=record 的真实前置）：`)
  console.log(`  · **索引载体** ${line('index')}`)
  console.log(`  · **详情载体** ${line('detail')}`)
  for (const r of rows.filter((x) => x.family === 'detail' && !x.n)) console.log(`      ⚠ 无记录表示：${r.f}（${r.bytes}B）⇒ 切源后**无源可投**`)
  console.log(`  · 技能资产（spec/契约/协议/CHANGELOG/README…）**不计入** —— 技能本体，非记忆载体`)
}

// ③ **写时自证**（M3 · 2026-09-13）：镜像路径每次写入后自证「记录导出可逐字节还原 md」并把结果**累加落盘**。
//    为什么这是切源门：①② 证明的是「**此刻**能否还原」；本段回答的是「**生产里到底分歧过没有**」——
//    内存计数随进程消失，故必须落盘。**分歧 > 0 ⇒ 切源不得进行**（记录当前还原不了 md）。
{
  const st = H.readShadowStats(ROOT)
  if (st.writes) {
    console.log(`· 写时自证：镜像 ${st.writes} 次 · 可还原 ${st.verified} · **分歧 ${st.diverged}** · 末次 ${st.lastAt || '-'}（${st.lastFile || '-'}）`)
    if (st.diverged > 0) {
      bad++
      console.log(`❌ 写时自证出现 **${st.diverged} 次分歧**（末次 ${st.lastDivergedAt} · ${st.lastDivergedFile}）——**分歧未清零前不得切源**`)
    }
  } else {
    console.log(`· 写时自证：尚无计数（storeMode=${storeMode} 未走镜像路径，或本机还没写过）`)
  }
}

if (bad) { console.log(`\nFAIL（${bad} 项）`); process.exit(1) }
console.log('\nPASS（事实源切换前置条件成立）')
