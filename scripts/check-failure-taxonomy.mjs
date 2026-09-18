// check-failure-taxonomy.mjs — 册三机检：**失败三态与水位记账**
//
// 判因（真机实测）：一个 `failed` 原先同时承载四类东西（I/O 异常 / 模型侧格式不合规 / 地址缺失 /
//   册零新增的孤儿指针拒收），而水位规则是 `failed > 0 ⇒ 不推`（`distill-agent.ts` A1 分支）
//   ⇒ ②③④ 都能**永久锁住水位**：实测近 1h `distill-run` **30/30 = 100%** 带 `failed>0`，
//   同一段被反复重蒸（水位冻在 2 / 808 / 0）。
//
// 本件锁四件：
//   ① `planSegmentWatermark` 决策表（三态 × advance/hold/forced 穷举，含反例感知）；
//   ② `classifyMemFailure` 三态映射（`顶层小节不存在` ⇒ needsAnchor · `标签非法/指针悬空` ⇒ rejected ·
//      未知 ⇒ undigested —— **未知必须保守落 undigested**，不许静默丢料）；
//   ③ 接线：`distill-agent.ts` 用 `planSegmentWatermark` 且**不再**以 `disp.failed > 0` 当水位闸；
//      写侧不再有裸 `failed++`（全部分流到三态 marker）。
//   ④ 台账：`needsAnchor` 落 `type=anchor-needed`（并入统一台账，不新开观测流）。
//
// 反例自证：把 `classifyMemFailure` 的 missing-section 分支改成 `undigested`，或把
//   `planSegmentWatermark` 的 `u === 0` 分支改成 `advance:false` ⇒ 本件必红（断言不是恒真）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planSegmentWatermark } from '../lib/deepsleep-core.js'
import { classifyMemFailure } from '../lib/distill-write.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }

// ── ① 决策表 ──
const out = (o) => ({ added: 0, rejected: 0, undigested: 0, needsAnchor: 0, ...o })
{
  const r = planSegmentWatermark(out({ added: 3 }), 0, 3)
  ok('① 全落盘 ⇒ 推进（digested）', r.advance === true && r.forced === false && r.reason === 'digested', `reason=${r.reason}`)
}
{
  const r = planSegmentWatermark(out({ rejected: 5 }), 0, 3)
  ok('① 只有拒收 ⇒ **仍推进**（内容已裁决）', r.advance === true && r.reason === 'digested-with-rejects', `reason=${r.reason}`)
}
{
  const r = planSegmentWatermark(out({ needsAnchor: 4 }), 0, 3)
  ok('① 只有需建锚 ⇒ **仍推进**（不锁水位）', r.advance === true && r.reason === 'digested-with-anchors', `reason=${r.reason}`)
}
{
  const a = planSegmentWatermark(out({ undigested: 1 }), 0, 3)
  const b = planSegmentWatermark(out({ undigested: 1 }), 1, 3)
  const c = planSegmentWatermark(out({ undigested: 1 }), 2, 3)
  ok('① 未消化 ⇒ 保留重试且计数递增', a.advance === false && b.advance === false && a.attempt === 1 && b.attempt === 2, `a=${a.attempt} b=${b.attempt}`)
  ok('① 第 3 次 ⇒ **强制推进**（有界）', c.advance === true && c.forced === true && c.reason === 'forced-after-retries', `attempt=${c.attempt}`)
  ok('① 未消化 + 拒绝/需锚混合 ⇒ 仍按未消化扣水位', planSegmentWatermark(out({ undigested: 1, rejected: 9, needsAnchor: 9 }), 0, 3).advance === false)
}
{
  ok('① 上限 1 ⇒ 首次即强制（边界不越）', planSegmentWatermark(out({ undigested: 1 }), 0, 1).forced === true)
  ok('① 计数异常输入不炸（负数/NaN ⇒ 归 0）', planSegmentWatermark(out({ undigested: 1 }), Number.NaN, 3).attempt === 1 && planSegmentWatermark(out({ undigested: 1 }), -5, 3).advance === false)
}

// ── ② 分类器三态映射 ──
{
  const cases = [
    ['顶层小节「先查后造」不存在（顶层 ## 需人工建锚，不自动建散落大节）。可用小节：', 'needsAnchor'],
    ['新索引行标签非法: [路径] 避免重复开发 · 先查后造/模块索引', 'rejected'],
    ['指针目标节不存在（拒写，防孤儿）', 'rejected'],
    ['索引行重复（sem 教训/正则计数假绿），保留原指针', 'rejected'],
    ['EACCES: permission denied, open notes/flows.md', 'undigested'],
    ['', 'undigested'],
    ['未知错误 XYZ', 'undigested'],
  ]
  for (const [text, want] of cases) {
    const got = classifyMemFailure(text).kind
    ok(`② 分类：${want} ← ${JSON.stringify(String(text).slice(0, 26))}`, got === want, `got=${got}`)
  }
  ok('② 未知与空输入**保守落 undigested**（不许静默丢料）', classifyMemFailure('随便什么')?.kind === 'undigested')
}

// ── ③ 接线（源码级；"接线 ≠ 抵达"型断言）──
//    ⚠ 断言前**去注释**：本仓源码习惯在注释里引用"旧写法"作为判因（实测：首次跑本件时
//      `// 旧实现用 disp.failed > 0 …` 这类说明被裸正则当成代码命中 ⇒ 3 条假红）。
//      判据只对**可执行代码**成立（与 `test-deepsleep-wiring ⑦` 的"可执行代码不得出现该字面量"同口径）。
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const srcAgent = stripComments(readFileSync(join(ROOT, 'src', 'distill-agent.ts'), 'utf8'))
const srcWrite = stripComments(readFileSync(join(ROOT, 'src', 'distill-write.ts'), 'utf8'))
ok('③ distill-agent 调用 planSegmentWatermark（唯一水位判据）', /planSegmentWatermark\s*\(/.test(srcAgent))
ok('③ distill-agent **不再**以 `disp.failed > 0` 当水位闸', !/disp\.failed\s*>\s*0/.test(srcAgent))
ok('③ distill-agent 的推进闸用 `disp.undigested === 0`', /disp\.undigested\s*===\s*0/.test(srcAgent))
ok('③ 写侧**无裸 `failed++`**（全部经三态 marker）', !/\bfailed\+\+/.test(srcWrite), `裸 failed++ 命中 ${(srcWrite.match(/\bfailed\+\+/g) || []).length} 处`)
ok('③ 三态 marker 齐备（undigested/rejected/anchor）', /markUndigested\s*\(/.test(srcWrite) && /markRejected\s*\(/.test(srcWrite) && /markAnchorNeeded\s*\(/.test(srcWrite))
ok('③ 分类**唯一入口** markByText（不散落 if 链）', /markByText\s*\(/.test(srcWrite) && /classifyMemFailure\s*\(/.test(srcWrite))
ok('④ needsAnchor 落统一台账 type=anchor-needed（不新开观测流）', /'anchor-needed'/.test(srcWrite))
ok('④ 审计行带三态字段', /undigested,\s*needsAnchor/.test(srcAgent) || /undigested:\s*disp\.undigested/.test(srcAgent))

// ── ⑤ 反例自证（判别力）：旧规则与新判据在同一输入上**结论必须不同** ──
//    旧规则（改造前）= `failed > 0 ⇒ 不推`，而 `failed` 是四类混一的那个数。此处把两条规则
//    并排跑同一组三态输入：只要有人把新判据改回"看 failed"，本组立刻红。
{
  const oldGate = (disp) => !(disp.undigested > 0) // 新口径下的"真失败"数
  const oldRuleHolds = (mixed) => (mixed.rejected + mixed.needsAnchor + mixed.undigested) > 0 // 改造前的 failed>0 语义
  const samples = [
    { added: 0, rejected: 6, undigested: 0, needsAnchor: 0 }, // 全是拒收：旧规则扣水位，新判据推进
    { added: 0, rejected: 0, undigested: 0, needsAnchor: 9 }, // 全需建锚：同上
    { added: 1, rejected: 0, undigested: 1, needsAnchor: 0 }, // 真 I/O 失败：两者都扣
  ]
  const diverged = samples.filter((s) => planSegmentWatermark(s, 0, 3).advance !== !oldRuleHolds(s))
  ok('⑤ 反例自证：旧规则与新判据在 2/3 样本上结论不同（断言有判别力）', diverged.length === 2, `分歧样本=${diverged.length}`)
  ok('⑤ 真 I/O 失败上两者一致（不误放行）', planSegmentWatermark(samples[2], 0, 3).advance === false && oldRuleHolds(samples[2]) === true)
  ok('⑤ 旧口径的"真失败"提取（新字段口径）与 undigested 同义', samples.every((s) => oldGate(s) === (s.undigested === 0)))
}

for (const l of P) console.log(l)
console.log(bad ? `\n❌ check-failure-taxonomy: ${bad} 条断言未通过` : '\n✅ check-failure-taxonomy: 全绿')
process.exit(bad ? 1 : 0)
