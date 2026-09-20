#!/usr/bin/env node
/**
 * record-export.mjs — P4「存储解耦」前置件：Record 模型 + md 投影往返闸（2026-09-13）
 *
 * 背景（方案档 docs/context-supply-plan.md DS1 / §10）：
 *   P4 要把记忆库的事实源从「md 文件」迁到「Record 存储」，md 降为**投影**。
 *   迁移的**前置条件**是先能证明「同一 Record 集导出 md 必须逐字节重现」——否则切源即数据走形。
 *   本件就是这个前置闸：把三索引文件逐行解析为 Record（保留原文与行分隔符），再导出，
 *   与原文**逐字节**比对；同时输出 Record 清单统计（kind × subject × 标签分布），供 P4 计划用。
 *
 * 2026-09-13（P4 施工）：解析与渲染**改用 `lib/record-store.js` 单一实现**（本件原带一份私有解析器 +
 *   一份私有 P_TAGS/R_TAGS 名单 —— 正是「同一事实的第二份副本」，与 record-sync 会漂移）。
 *   现本件只做**前置闸**：调用库实现、判往返、报统计；同步/对账走 `scripts/record-sync.mjs`。
 *
 * 设计纪律：
 *   · 默认**只读**（不写任何文件）；`--json <out>` 才落一份 Record 清单；
 *   · 逐行保留原文与**每行自己的分隔符** ⇒ 即使文件混用 CRLF/LF 也能字节级还原；
 *   · 零依赖、零 spawn；不读网络。
 *
 * 用法：
 *   node scripts/record-export.mjs                # 默认 = 往返闸
 *   node scripts/record-export.mjs --json out.json
 *   node scripts/record-export.mjs --root <dir>   # 覆盖记忆库根（默认 $MEMORY_ROOT 或 ~/.dsh/skills/managing-memory）
 * 退出码：0 = 三文件全部逐字节一致（且统计输出正常）；1 = 存在不一致/读取失败；3 = 记忆库缺席（跳过）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const argOf = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const ROOT = argOf('--root', process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'memory'))
const JSON_OUT = argOf('--json', '')

const S = await import(new URL('../lib/record-store.js', import.meta.url).href)

if (!existsSync(ROOT)) {
  console.log(`⏭ 记忆库根缺席：${ROOT}`)
  process.exit(3)
}

let bad = 0
const all = []
const inventory = {}

for (const f of S.INDEX_FILES) {
  const abs = join(ROOT, f)
  if (!existsSync(abs)) { console.log(`⏭ ${f} 缺席（跳过）`); continue }
  const raw = readFileSync(abs, 'utf8')
  const records = S.parseRecords(raw, f)
  const exported = S.renderFile(records, f)
  const ok = exported === raw
  if (!ok) bad++
  const inv = S.inventoryOf(records)
  const byKind = inv.byKind
  const byTag = inv.byTag
  inventory[f] = { records: records.length, bytes: raw.length, byKind, byTag }
  console.log(`${ok ? '✅' : '❌'} ${f.padEnd(10)} 记录 ${String(records.length).padStart(3)} · ${String(raw.length).padStart(5)}B · 往返${ok ? '逐字节一致' : '**不一致**'} · ${Object.entries(byKind).map(([k, v]) => `${k}:${v}`).join(' ')}`)
  all.push(...records)
}

const inv = S.inventoryOf(all)
console.log(`\nRecord 合计 ${all.length} · subject 分布 ${Object.entries(inv.bySubject).map(([k, v]) => `${k}:${v}`).join(' · ')}`)
console.log(`空标签的记录（P4 迁移待归类项）＝ ${inv.untagged} 条`)
console.log(`生命周期分布 ${Object.entries(inv.byLifecycle).map(([k, v]) => `${k}:${v}`).join(' · ')}`)

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ root: ROOT, at: new Date().toISOString(), inventory, records: all }, null, 1), 'utf8')
  console.log(`清单已落：${JSON_OUT}`)
}

if (bad) { console.log(`\nFAIL（${bad} 个文件往返不一致 —— 切换事实源前必须先修平）`); process.exit(1) }
console.log('\nPASS（三索引往返逐字节一致 ⇒ P4 切换前置条件之一已满足）')
