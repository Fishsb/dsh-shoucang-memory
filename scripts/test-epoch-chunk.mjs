#!/usr/bin/env node
// test-epoch-chunk.mjs — **材料分片**（S-P1c · 2026-09-15）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §5（R0 上限分片）+ 验收 AC-R0.3。
// 断言：
//   ① 贪心装片：每片 ≤ cap；**永不切开单段**（单段超 cap ⇒ 独占一片）
//   ② **保持段序**（顺序即材料优先级，不得打乱）
//   ③ **回归保护**：`cap <= 0` ⇒ **单片段**，与改造前逐字等价
//   ④ 边界：空段数组 / 空串 / 恰好等于 cap
//
// ⚠ **本册对方案册的一处偏离（已在注册表登记）**：
//   · 「按语义边界切」→ 由**结构**满足：材料本就按"面"装配（当天痕迹 / 现行清单 / 树节清单 …），
//     **段边界即语义边界**，故不再引入 embedding 去求相邻相似度低谷（那是没有现成分段时的做法）。
//   · 「水位按片推进」→ 改为「**全片落地才推进**」：单一时间戳水位表达不了片级进度，
//     片级推进会**永久排除失败片的材料**（G-16/G-19 两次修掉的静默丢料）。片级进度由 ledger 可见，
//     失败即整纪元回滚重试（写侧去重保证幂等）。
//
// 用法: node scripts/test-epoch-chunk.mjs
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitByCap } from '../lib/deepsleep-core.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

console.log('── S-P1c 材料分片（纯切分器）──')

const seg = (n) => 'x'.repeat(n)

// ① 贪心 + 每片 ≤ cap
{
  const segs = [seg(30), seg(30), seg(30), seg(30)]
  const chunks = splitByCap(segs, 100)
  ok(chunks.length === 2, `① 4×30 字节、cap=100 ⇒ 2 片（实测 ${chunks.length}）`)
  ok(chunks.every((c) => c.join('').length <= 100), '① 每片长度 ≤ cap')
  ok(chunks[0].length === 3 && chunks[1].length === 1, `① 贪心装填（首片 3 段、次片 1 段；实测 ${chunks[0].length}/${chunks[1].length}）`)
}

// ② 永不切开单段 + 保持段序
{
  const segs = [seg(10), seg(500), seg(10)] // 中间一段超 cap
  const chunks = splitByCap(segs, 100)
  ok(chunks.length === 3, `② 超 cap 的单段独占一片（实测 ${chunks.length} 片）`)
  ok(chunks[1].length === 1 && chunks[1][0].length === 500, '② 超限段**未被切开**（整段保留）')
  const flat = chunks.flat()
  ok(JSON.stringify(flat) === JSON.stringify(segs), '② 展开后与输入**逐段等序**（未打乱、未丢段）')
}

// ③ 回归保护：cap<=0 ⇒ 单片段
{
  const segs = [seg(10), seg(20), seg(30)]
  for (const cap of [0, -1, null, undefined, NaN]) {
    const chunks = splitByCap(segs, cap)
    const same = chunks.length === 1 && JSON.stringify(chunks[0]) === JSON.stringify(segs)
    ok(same, `③ cap=${String(cap)} ⇒ 单片段且逐段等于输入（与改造前等价）`)
  }
}

// ④ 边界
{
  ok(JSON.stringify(splitByCap([], 100)) === '[[]]', '④ 空段数组 ⇒ 单个空片（不产出 0 片，调用方不必特判）')
  const one = splitByCap([seg(100)], 100)
  ok(one.length === 1 && one[0].length === 1, '④ 恰好等于 cap ⇒ 一片装下（`>` 才换片）')
  const exact = splitByCap([seg(50), seg(50)], 100)
  ok(exact.length === 1, '④ 两段之和恰等于 cap ⇒ 仍为一片（边界取 `<=`）')
  const over = splitByCap([seg(50), seg(51)], 100)
  ok(over.length === 2, '④ 之和超出 1 字节 ⇒ 分两片')
  const withEmpty = splitByCap([seg(0), seg(10)], 5)
  ok(withEmpty.length === 2, '④ 空串段不阻止换片判定')
}

// ⑤ **接线层**：run 侧确实消费了 `materialChunkChars` 并调用切分器
//   ⚠ **诚实标注：这是源码文本断言**，强度弱于行为断言（仓内有 `test-wiring-gate` / `check-arch-sync` 先例）。
//   之所以取此形态：真跑一轮 `runDeepSleep` 需要 LLM 子代理 + 真实记忆库写入，单测不该有那种副作用。
//   行为级证据由**真机触发**补齐（见 OPEN-ITEMS S-P1c 的复验命令）。
{
  const run = join(root, 'lib', 'deepsleep-run.js')
  ok(existsSync(run), '⑤ 编译产物存在（lib/deepsleep-run.js）')
  const src = readFileSync(run, 'utf8')
  ok(/materialChunkChars/.test(src), '⑤ run 侧消费 `materialChunkChars`（否则 `check-field-usage` 会拦"声明 runtime 却无消费点"）')
  ok(/splitByCap\s*\(/.test(src), '⑤ run 侧调用 `splitByCap`（切分器真被接线，不是只写了个纯函数）')
  // 防"静默把计划当执行"：多片时必须**显式留痕**。
  //  ★2026-09-18 更新（IR1 附册 F1）：原判据找 `多轮执行尚未接线` 字样 —— 那是**计划态**的产物，而
  //    S-P1c-multi 早已接线 ⇒ 旧字样本身成了"自述与实况相反"的漂移源。现判据改为**接线证据在场**：
  //    ledger 行必须带 `wired`（true/false 皆可，**字段必须在**）与 `hasMore` ⇒ "计划了 N 片"与
  //    "跑了 N 片"在读数上**可分辨**（这才是原判据真正要守的东西）。
  ok(/wired:\s*(true|false)/.test(src) && /hasMore/.test(src), '⑤ 多片时显式留痕（`wired` + `hasMore` 在场 ⇒ 计划/执行可分辨）')
  ok(!/segs\.slice\(0,\s*chunkCap\)|userInput\.slice\(0,\s*chunkCap\)/.test(src), '⑤ **不截断**材料（未见按 cap 截断的写法）')
}

// ⑥ **S-P1c-multi 多轮协议（二次实现）**：续跑信号走 `state.epoch.pendingChunk`，**终判行原样不动**。
//   上一版用返回值传续跑信号，被 `test-wiring-gate` 判红（要求终判整行直接返回决策表裁定）⇒ 这里把
//   **两条形态判据**同时钉住：① 终判仍整行；② 续跑信号确实走 state 而非返回值。
{
  const run = readFileSync(join(root, 'lib', 'deepsleep-run.js'), 'utf8')
  const mach = readFileSync(join(root, 'lib', 'deepsleep-machine.js'), 'utf8')
  // ⚠ 必须容**可选分号**：编译产物是 `return pv.verdict;`
  ok(/^\s*return pv\.verdict;?\s*$/m.test(run), '⑥ 终判**整行**直接返回决策表裁定（不得包三元/加分支）')
  ok(!/return\s*'more'/.test(run), '⑥ 未在返回值里夹带 more（续跑信号不得走返回值）')
  ok(/epoch\.pendingChunk/.test(run), '⑥ run 侧**读/写** `state.epoch.pendingChunk`（续跑信号通道）')
  ok(/pendingChunk\s*!==\s*null/.test(mach), '⑥ 状态机按 `pendingChunk` 循环（不全片跑完不停）')
  ok(/wired:\s*true/.test(run), '⑥ 多片时如实标 `wired:true`（多轮已接线）')
  ok(/chunk:\s*chunkIdx,\s*totalChunks:\s*chunks\.length/.test(run), '⑥ 审计带 `chunk` + `totalChunks`（片级可追溯）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)