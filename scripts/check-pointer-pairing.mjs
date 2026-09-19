// check-pointer-pairing.mjs — 册二机检：**段级成对裁决 + 未落地知识回退**（docs/pointer-supply-plan.md §4）
//
// 判因（方案 §2.2 G2，真机实测坐实）：同一批写入里 `appends` 落点失败（顶层节缺 ⇒ `memory-append` exit 2）
//   之后，`newIndex` 行**照写**——而且该行指针指向**合法存在**的小节
//   （实测行 `[env] 半落探针 … → notes/env.md §DSH 环境` 落盘、正文未落）
//   ⇒ 「行落了、知识没落」，且现有全部机检都在测**地址空间**，**没有一条**测"地址背后是否真有内容"。
//
// 本件锁四件（**只驱动纯函数，绝不触真库**：`writeDispatch` 会经 `resolveTarget()`/子进程写真库）：
//   ① 配对判定：同批 append 未落地 ⇒ 指向同一（文件+首段）的索引行判 `unpaired`（**行不落**）；
//   ② **阴性对照**：指向**别的**文件/小节的索引行**不受牵连**（不误伤合法产出行）；
//   ③ **反例自证（判别力）**：旧规则（不看配对）在同一夹具上会放行 ⇒ 新判定必须与之**结论不同**；
//   ④ 回退队列命名：`-knowledge-defer-` 前缀 + **幂等**（同 (源会话, 行) ⇒ 同路径）+ **且被候选过滤器排除**
//      （源码级断言：喂回 LLM 会与自己失败的成因形成重裁决死循环）。
// 先红：改造前 `unpairedPointersOf` 不存在、`writeDispatch` 无配对守卫 ⇒ 本件首跑 import 即失败（红）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unpairedPointersOf, pairKeyOf, knowledgeDeferFileOf } from '../lib/distill-write.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = []
let bad = 0
const ok = (name, cond, extra = '') => { P.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) bad++; return cond }
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// ── 夹具：一批 append 里 env.md 的「DSH 环境」未落地；另一文件 tools.md 正常 ──
const failedPairs = new Set([pairKeyOf('notes/env.md', 'DSH 环境')])
const failedFilesWide = new Set()
const LINE_HALF = '[env] 半落探针主题 · 概况短语/短语/短语 → notes/env.md §DSH 环境'
const LINE_OK_OTHER_FILE = '[tool] 正常主题 · 概况短语/短语/短语 → notes/tools.md §插件注入'
const LINE_OK_OTHER_SECTION = '[env] 另一主题 · 概况短语/短语/短语 → notes/env.md §权限模式'

// ── ① 配对判定（该行不落）──
{
  const u = unpairedPointersOf(LINE_HALF, failedPairs, failedFilesWide)
  ok('① 明细未落地的索引行 ⇒ 判 unpaired（行不落）', u.length === 1 && u[0] === 'notes/env.md§DSH 环境', JSON.stringify(u))
  ok('① 无失败配对时 ⇒ 同一行可落（对照）', unpairedPointersOf(LINE_HALF, new Set(), new Set()).length === 0)
}

// ── ② 阴性对照：不误伤 ──
{
  ok('② 指向**别文件**的行不受牵连', unpairedPointersOf(LINE_OK_OTHER_FILE, failedPairs, failedFilesWide).length === 0)
  ok('② 指向**同文件但不同首段**的行不受牵连', unpairedPointersOf(LINE_OK_OTHER_SECTION, failedPairs, failedFilesWide).length === 0, JSON.stringify(unpairedPointersOf(LINE_OK_OTHER_SECTION, failedPairs, failedFilesWide)))
  ok('② 文件级加宽（连小节都没有的失败）⇒ 该文件整行判 unpaired', unpairedPointersOf(LINE_OK_OTHER_SECTION, new Set(), new Set(['env.md'])).length === 1)
  ok('② 无指针的行（自然语言行）⇒ 不判 unpaired（不误杀）', unpairedPointersOf('[env] 无指针行 · 概况/短语/短语', failedPairs, failedFilesWide).length === 0)
}

// ── ③ 反例自证：旧规则会放行（判别力）──
{
  // 旧规则（改造前）= 完全不看配对 —— 它对本行**没有任何机制**
  const oldRuleUnpaired = () => [] // 旧实现里这个判定不存在，等价于"永不成对失败"
  ok('③ 反例自证：旧规则放行、新判定拦下（结论必须有别）', oldRuleUnpaired(LINE_HALF).length === 0 && unpairedPointersOf(LINE_HALF, failedPairs, failedFilesWide).length > 0)
  // 多指针行：只拦未落地的那一半（保留其余可落部分的能力由调用方决定 ⇒ 当前实现保守整行不落，此处断言判定集正确）
  const multi = '[tool] 多指针 · 甲/乙/丙 → notes/env.md §DSH 环境 · notes/tools.md §插件注入'
  const um = unpairedPointersOf(multi, failedPairs, failedFilesWide)
  ok('③ 多指针行只报未落地的那个指针', um.length === 1 && um[0] === 'notes/env.md§DSH 环境', JSON.stringify(um))
}

// ── ④ 回退队列：命名 + 幂等 + 被候选过滤器排除 ──
{
  const f1 = knowledgeDeferFileOf('/tmp/pend', 'session-abc', LINE_HALF)
  const f2 = knowledgeDeferFileOf('/tmp/pend', 'session-abc', LINE_HALF)
  const f3 = knowledgeDeferFileOf('/tmp/pend', 'session-abc', LINE_OK_OTHER_SECTION)
  ok('④ 命名含 `-knowledge-defer-` 前缀（可被识别/清理）', /-knowledge-defer-[0-9a-f]{10}\.md$/.test(f1.replace(/\\/g, '/')), f1)
  ok('④ 幂等：同 (源会话, 行原文) ⇒ 同路径', f1 === f2)
  ok('④ 不同行 ⇒ 不同路径', f1 !== f3)
  const agentSrc = stripComments(readFileSync(join(ROOT, 'src', 'distill-agent.ts'), 'utf8'))
  ok('④ 候选过滤器**排除** knowledge-defer（防重裁决死循环）', /-knowledge-defer-/.test(agentSrc) && /!f\.includes\('-knowledge-defer-'\)/.test(agentSrc))
  const writeSrc = stripComments(readFileSync(join(ROOT, 'src', 'distill-write.ts'), 'utf8'))
  ok('④ 写入面调用配对判定（接线 ≠ 仅定义）', /unpairedPointersOf\s*\(/.test(writeSrc))
  ok('④ 拒收逐条审计带**原因分类**（class=unpaired/missing/dup/format）', /class: 'unpaired'/.test(writeSrc) && /class: 'missing'/.test(writeSrc) && /class: 'dup'/.test(writeSrc) && /class: 'format'/.test(writeSrc))
}

for (const l of P) console.log(l)
console.log(bad ? `\n❌ check-pointer-pairing: ${bad} 条断言未通过` : '\n✅ check-pointer-pairing: 全绿')
process.exit(bad ? 1 : 0)
