#!/usr/bin/env node
// check-write-primitive.mjs — S2S3 册零：**写入原语收敛棘轮**（2026-09-19）
//
// 判据（四要素）：
//   ① 判据：库内文件的写入必须走**唯一原语** `src/section-rewrite.ts`（唯一 tmp 名 + 原子 rename + 回读校验）。
//      反例形态 = 源码里出现**固定 tmp 名**写法：`p + '.tmp'` / `file + '.tmp'` / `+ '.ui-tmp'` / `+ '.tmp'`，
//      它们在两写者并发时**互踩**（一方 rename 走另一方半截的 tmp / unlink 掉对方的 tmp）。
//   ② 检查方式：扫 `src/*.ts`（剔注释）里固定 tmp 名的出现次数；与 `BASELINE` 比。
//   ③ 阈值：**棘轮——只许减不许增**（新增即 FAIL）；已收编的文件必须为 0（`COLLECTED` 名单）。
//   ④ 失败退回：新增固定 tmp ⇒ 改为调用原语或显式登记到 `BASELINE` 并写明理由（**不得静默抬基线**）。
//
// 为什么要有本件：本册的做法是"先收编高频点、残留同型点用棘轮钉住、只许往下走"——
//   没有棘轮时，"唯一原语"会随新代码慢慢退化成"其中一种写法"（本仓已有此类教训：纪律不机检=会腐化）。
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/** 残留基线（2026-09-19 收口后 **0 处**）——**只许下调**（已到底 ⇒ 新增即红）。
 *  收编路径留痕：批次一等 sectionops/panel-inject/deepsleep-apply(pointerOps)/treeops.atomicWrite/distill-write 画像行；
 *  批次三等 activity/record-shadow/deepsleep-tree/distill-write 索引元数据表；
 *  批次四清掉 deepsleep-apply 的 gateText 试算 tmp（改**唯一名** `principlesTmp`，语义是"留待 commitPrinciples 改名"
 *  ⇒ **不能**用 gatedWriteFile，那个会立即改名）与 narrative 落盘、treeops `rewriteOneIndex`（改走 `gatedWriteFile`）。 */
const BASELINE = 0
/** 已收编文件（这些文件里**不允许**再出现固定 tmp 名）。 */
const COLLECTED = [
  'sectionops.ts', 'panel-inject.ts', 'section-rewrite.ts', 'bank-lock.ts',
  'activity.ts', 'record-shadow.ts', 'deepsleep-tree.ts', 'distill-write.ts',
  'deepsleep-apply.ts', 'treeops.ts',
]

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/** **字面量**固定 tmp 名（`+ '.tmp'` / `+ '.ui-tmp'`）——**这才是反例**。
 *  ⚠ 不要连 `${...}` 插值一起抓：`+ \`.tmp-${pid}-${seq}\`` 正是原语要的**唯一名**（首版正则误伤自己，实测 2 处假红）。 */
const TMP_LITERAL = /['"`](?:\.tmp|\.ui-tmp)['"`]/g

let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.includes('.generated.'))
const hits = []
for (const f of files) {
  const t = stripComments(readFileSync(join(SRC, f), 'utf8'))
  const n = (t.match(TMP_LITERAL) || []).length
  if (n) hits.push({ f, n })
}
const total = hits.reduce((a, h) => a + h.n, 0)
console.log(`扫描 ${files.length} 个 src 模块 · 固定 tmp 名写法：${total} 处（基线 ${BASELINE}）`)
for (const h of hits.sort((a, b) => b.n - a.n)) console.log(`    ${h.f} × ${h.n}`)

// ① 原语存在且被导出（没有它，"唯一原语"无从谈起）
const prim = readFileSync(join(SRC, 'section-rewrite.ts'), 'utf8')
const hasPrim = prim.includes('export function atomicWriteFile') && prim.includes('export function editFileUnderLock')
hasPrim
  ? ok('唯一写入原语就位（atomicWriteFile / editFileUnderLock）')
  : bad('section-rewrite.ts 缺原语导出')

// ② 棘轮：只许减
total <= BASELINE
  ? ok(`棘轮：${total} ≤ 基线 ${BASELINE}（只许下调）`)
  : bad(`棘轮越线：${total} > 基线 ${BASELINE} ⇒ 新增了固定 tmp 写法；请改走原语，或写明理由后显式抬基线`)

// ③ 已收编文件必须为 0
const dirty = hits.filter((h) => COLLECTED.includes(h.f))
dirty.length === 0
  ? ok(`已收编 ${COLLECTED.length} 件全部为 0（${COLLECTED.join(' · ')}）`)
  : bad(`已收编文件仍有固定 tmp：${dirty.map((d) => `${d.f}×${d.n}`).join(', ')}`)

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
