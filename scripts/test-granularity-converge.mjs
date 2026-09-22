#!/usr/bin/env node
// test-granularity-converge.mjs — **跨粒度收敛**（S-P4 / R2-A · 2026-09-16）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §7（R2-A）+ 验收 AC-G.1/G.2/G.4。
// 判据（**行为级**，真临时库写入，非源码文本）：
//   ① **成对取证**：coarse 与 fine **都逐字命中** ⇒ applied；任一不逐字 ⇒ skipped（**AC-G.1 三组反例**）
//   ② 形态门：fine 必须**无标签** · coarse 必须**有标签** · 二者不同一行
//   ③ **配额 ≤3**：4 条提案只处理 3 条（**AC-G.4**）
//   ④ **归档可回滚**：`audit/converge/` 落**整行原文**（AC-G.2：绝不直删，可按原文贴回）
//   ⑤ **幂等**：同一条重复提交，第二次 skipped（line 已不在）
//   ⑥ file 越界（如 `notes/lessons.md`）⇒ skipped（本通道射程 = 两个画像文件）
//
// 用法: node scripts/test-granularity-converge.mjs
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyConvergeOps, CONVERGE_MAX_PER_RUN } from '../lib/sectionops.js'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

/* ⚠ 夹具用语（2026-09-21 隐私红线整改）：原为**真实记忆库原文**，而 `scripts/` 是公开树
 *   ⇒ 逐字与运行库画像文件重合 = 私人内容在公开面（`check-public-tree` 只按路径/模式扫，**不查正文语义**）。
 *   本件判据只关心**形状**（粗行有标签 + 有指针 / 细行无标签 / 二者不同行），与具体语义无关
 *   ⇒ 一律换**合成占位**，判据强度不变（下方每组正反例仍逐条跑）。 */
const COARSE = '[原则] 合成粗行甲 · 占位概况说明 → notes/合成.md §合成小节甲'
const FINE_X = '- 合成细行甲：占位替换文本。 ← 源: distill 0000000a'
const FINE_Y = '- 合成细行乙：占位替换文本。'
const FINE_Z = '- 合成细行丙：占位替换文本。'
const FINE_TAGGED = '- [边界] 合成细行带标签 · 占位 ← 源: notes/合成.md §合成小节乙'

const mkBank = (agentLines) => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-conv-'))
  writeFileSync(join(dir, 'AGENT.md'), agentLines.join('\n') + '\n', 'utf8')
  return dir
}
const readAgent = (dir) => readFileSync(join(dir, 'AGENT.md'), 'utf8').split(/\r?\n/)
const archLines = (dir) => {
  const p = join(dir, 'audit', 'converge')
  if (!existsSync(p)) return []
  const f = readdirSync(p).filter((x) => x.endsWith('.jsonl'))
  return f.length ? readFileSync(join(p, f[0]), 'utf8').split(/\r?\n/).filter(Boolean) : []
}

console.log('── S-P4 跨粒度收敛（行为级）──')

// ① 成对取证：都逐字 ⇒ applied；任一不逐字 ⇒ skipped
{
  const dir = mkBank([COARSE, FINE_X, FINE_Y])
  const r = await applyConvergeOps(dir, [
    { file: 'AGENT.md', coarse: COARSE, fine: FINE_X },                                    // 正例
    { file: 'AGENT.md', coarse: COARSE, fine: FINE_Y + '（改了字）' },                      // fine 不逐字
    { file: 'AGENT.md', coarse: COARSE + '（改了字）', fine: FINE_Z },                      // coarse 不逐字（且行不在）
  ])
  ok(r.applied === 1 && r.skipped === 2, `① 成对取证：1 applied / 2 skipped（实测 ${r.applied}/${r.skipped}）`)
  ok(!readAgent(dir).includes(FINE_X), '① 正例的细粒度行**已移除**')
  ok(readAgent(dir).includes(COARSE), '① 粗粒度行**保留**（收敛 ≠ 删除）')
  rmSync(dir, { recursive: true, force: true })
}

// ② 形态门：fine 带标签 / coarse 无标签 / 同一行 ⇒ 全 skipped
{
  const dir = mkBank([COARSE, FINE_TAGGED, FINE_Y])
  const r = await applyConvergeOps(dir, [
    { file: 'AGENT.md', coarse: COARSE, fine: FINE_TAGGED },   // fine 带标签
    { file: 'AGENT.md', coarse: FINE_Y, fine: FINE_Y },        // coarse 无标签 + 同行
  ])
  ok(r.applied === 0 && r.skipped === 2, `② 形态门：0 applied / 2 skipped（实测 ${r.applied}/${r.skipped}）`)
  ok(readAgent(dir).includes(FINE_TAGGED), '② 带标签的画像行**未被移除**（不在本通道射程）')
  rmSync(dir, { recursive: true, force: true })
}

// ③ 配额 ≤3
{
  const fine = (i) => `- 第 ${i} 条细粒度叙事行，内容各不相同以免被误判重复。`
  const dir = mkBank([COARSE, fine(1), fine(2), fine(3), fine(4)])
  const r = await applyConvergeOps(dir, [1, 2, 3, 4].map((i) => ({ file: 'AGENT.md', coarse: COARSE, fine: fine(i) })))
  ok(r.tried === CONVERGE_MAX_PER_RUN && r.applied === CONVERGE_MAX_PER_RUN,
    `③ 配额：4 条提案只处理 ${CONVERGE_MAX_PER_RUN} 条（tried=${r.tried} applied=${r.applied}）`)
  ok(readAgent(dir).includes(fine(4)), '④ 超配额的第 4 条**未被处理**（留到下轮）')
  rmSync(dir, { recursive: true, force: true })
}

// ④ 归档可回滚：整行原文 + 指向的粗粒度行都在
{
  const dir = mkBank([COARSE, FINE_X])
  await applyConvergeOps(dir, [{ file: 'AGENT.md', coarse: COARSE, fine: FINE_X }])
  const a = archLines(dir)
  ok(a.length === 1, `④ 归档写入 1 行（实测 ${a.length}）`)
  const rec = a.length ? JSON.parse(a[0]) : {}
  ok(rec.line === FINE_X, '④ 归档含**被移除行的整行原文**（可逐字贴回 ⇒ 可回滚）')
  ok(rec.into === COARSE, '④ 归档记下**并入的粗粒度行**（成对取证留痕）')
  rmSync(dir, { recursive: true, force: true })
}

// ⑤ 幂等：同一条重复提交 ⇒ 第二次 skipped
{
  const dir = mkBank([COARSE, FINE_X])
  const r1 = await applyConvergeOps(dir, [{ file: 'AGENT.md', coarse: COARSE, fine: FINE_X }])
  const r2 = await applyConvergeOps(dir, [{ file: 'AGENT.md', coarse: COARSE, fine: FINE_X }])
  ok(r1.applied === 1 && r2.applied === 0 && r2.skipped === 1,
    `⑤ 幂等：首轮 applied=1 · 次轮 applied=0/skipped=1（实测 ${r1.applied}/${r2.applied}/${r2.skipped}）`)
  rmSync(dir, { recursive: true, force: true })
}

// ⑥ file 越界
{
  const dir = mkBank([COARSE, FINE_X])
  const r = await applyConvergeOps(dir, [{ file: 'notes/lessons.md', coarse: COARSE, fine: FINE_X }])
  ok(r.applied === 0 && r.skipped === 1, '⑥ file 越界 ⇒ skipped（射程 = AGENT.md / USER.md）')
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
