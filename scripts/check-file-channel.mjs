#!/usr/bin/env node
// check-file-channel.mjs — **跨域「文件即通道」契约门**（阶段 0 · 2026-09-14）
//
// 为什么需要它（审核 `docs/eda-architecture-audit-20260914.md` §1.2 的实证）：
//   本仓**没有事件总线**（`EventEmitter|eventBus|publish(|subscribe(|.emit(` 全仓零命中），
//   跨模块通信的实质形态是「**产线落盘 → 消费块读文件**」。这是事实上的事件通道，但：
//     · **没有任何一处登记**它的写侧与读侧；
//     · 改任一侧都不会报错、不会红、不会告警 —— 纯粹的隐式契约。
//   实证代价：审核时派子代理找 `activity.jsonl` 的读侧，只找到 2 处，**实测有 5 处**
//   （panel-shared / vec / deepsleep-materials / panel-observe / treeops）。
//   **连专门去找都找不全，何况日常维护时记得住。** 这正是「同一事实 N 份副本」的同型病。
//
// 本件把这类隐性依赖变成**双向机检**（形态类比既有的 `check-panel-contract`）：
//   方向一（**登记 ⟶ 代码**）：登记的每个写侧/读侧模块，源码里必须还能找到该介质 token
//           ⇒ 路径改了而登记表没改，或反过来，都红。
//   方向二（**代码 ⟶ 登记**）：扫描 src 里**实际引用**该 token 的模块集合，
//           必须 ⊆ 登记表 ⇒ **新增一个读侧而没登记，立刻红**（这才是收口，不是装饰）。
//
// 口径声明：
//   · 扫描面 = `src/**/*.ts`（排除 `*.generated.ts`）；**先剥注释**再匹配
//     （只剥 `/* */` 块与「行首 //」整行 —— 不剥行内 `//`，否则 `https://` 这类字符串会被破坏）；
//   · `mentions` = 只是**文字提及**（常量定义处 / schema 描述文本），非真实读写。
//     它必须**逐条写理由**：宁可显式豁免，也不要静默放过。
//   · 与 `check-observability` 的分工：那件管**观测流**（13 条审计日志），
//     本件管**影响业务行为的跨域功能性介质**。二者不重叠，勿合并。
//
// 退出码：0 = pass · 1 = fail · 3 = skip（src 缺席）
// 用法: node scripts/check-file-channel.mjs [--selftest]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src')

/**
 * 通道登记表（**唯一声明处**）。增删介质必须同步改这里。
 * token = 源码里出现的最小唯一字面量（用**文件名**而非全路径：路径常由 join 拼接）。
 */
const CHANNELS = [
  {
    id: 'activity',
    token: 'activity.jsonl',
    what: '条目活性状态（warm/cold/retired）→ 召回降权 / 遗忘候选 / 深睡材料',
    writers: ['activity.ts'],
    // 2026-09-14 阶段 4：`treeops.ts` 的读侧随「主动遗忘」一块迁出 ⇒ 改登记 `forgetops.ts`。
    //   这正是本门方向二的价值——**拆模块时自动提醒"这条通道的读侧变了"**，不靠人记。
    readers: ['panel-shared.ts', 'vec.ts', 'deepsleep-materials.ts', 'panel-observe.ts', 'forgetops.ts', 'supply-stamp.ts'],
    mentions: [],
  },
  {
    id: 'warm-recall',
    token: 'warm-recall.json',
    what: '异步预热的融合召回结果 → 注入面同步读取（120s + recallKeyOf 校验）；IR1 册一起由**注入侧自预热**',
    // IR1 册一（2026-09-18）：**写侧增加 `relevance-supply.ts`** —— 预热不再只由 MCL 慢通道回合触发
    //   （实测多数回合无桥 ⇒ 动态面退位置式基线）；注入侧在 `agent/pre-step` 与 `/inject/preview`
    //   用**同一实现**按需预热。两个写者写**同一个键**（`recallKeyOf(q)`）⇒ 语义上互为补充，不是两套缓存。
    writers: ['mcl.ts', 'relevance-supply.ts'],
    // L5（2026-09-14）：动态面选行抽取至 `dynamic-select.ts`；IR1 册一（2026-09-18）：相关性面再迁至
    //   `relevance-supply.ts`（桥读取 + 分层配额 + 降级记账）⇒ 读侧随之迁移（通道本身未变）。
    readers: ['relevance-supply.ts'],
    mentions: [
      // IR1 册四（2026-09-18）：`supply-stamp` 只**stat** 该文件（取 `size:mtimeMs` 作**观测字段**），
      //   且该字段**不进失效键**（签它会「为 query B 的写入失效 query A 的缓存」而 A 输出不变）。
      { mod: 'supply-stamp.ts', why: '只取观测戳（warm 字段），**不参与缓存失效键** —— 见 `stampKeyOf`' },
    ],
  },
  {
    id: 'delta',
    token: 'delta.md',
    what: '深睡晨起摘要（行级 diff，≤3 行，48h 有效；永非事实源）',
    writers: ['deepsleep-run.ts'],
    readers: ['panel-shared.ts', 'panel-memory.ts', 'supply-stamp.ts'],
    mentions: [],
  },
  {
    id: 'ring-events',
    token: 'ring-events.jsonl',
    // 读写两侧都只 import 常量 `RING_EVENT_FILE`（字面量仅存在于 ring-events.ts 的定义处）
    alias: ['RING_EVENT_FILE'],
    what: '环事件流（9 op 可重放重建状态）—— 目前仅对账消费，无业务订阅',
    writers: ['ring-commit.ts'],
    readers: ['panel-observe.ts'],
    mentions: [
      { mod: 'ring-events.ts', why: 'RING_EVENT_FILE 常量的**单一定义处**（其余模块 import 它，不写字面量）' },
    ],
  },
]

// 剥注释：行首 // 整行 + 块注释。**不剥**行内 //（会破坏 URL 等字符串）。
//
// ⚠ 顺序**不可调换**：必须先剥行首 //，**再**剥块注释。
//   实测踩过：注释正文里出现 `audit/*.md`（`deepsleep-materials.ts:87`）——它含「斜杠 + 星号」。
//   若先剥块注释，它会被当成块注释起点，一路吃到下一个块结束符 ⇒ **吞掉大段真实代码**
//   （该文件实测被删 3059 字符，导致 :106 的真实读取点"消失"，门禁误报"已无 token"）。
//
// ⚠ 写法纪律（本件自己踩过一次，故用行注释而非块注释写这段说明）：
//   注释正文里**不得出现块注释结束符的字面量**——它会提前闭合注释段，
//   语法错报在**下一处语句**上（本件当时报在 `const CHANNELS = [`），极难定位。
export function stripComments(s) {
  return s.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 核心判定（纯函数，**可单测** —— `--selftest` 直接驱动它，不碰真实源码）。
 * @param {Record<string, string>} codeByMod 模块名 → 剥注释后的源码
 */
export function evaluate(codeByMod, channels = CHANNELS) {
  const errors = []
  for (const ch of channels) {
    const declared = new Set([
      ...ch.writers, ...ch.readers, ...(ch.mentions ?? []).map((m) => m.mod),
    ])
    // 匹配面 = token **或** 任一 alias。
    // 为什么需要 alias：部分通道在读写侧**只引用常量名**而不写字面量
    //   （`ring-events.jsonl` 在 ring-commit / panel-observe 里写作 `RING_EVENT_FILE`），
    //   只认字面量会把真实读写点判成"已无 token" ⇒ 反向误报。
    const pats = [ch.token, ...(ch.alias ?? [])]
    const hit = (code) => pats.some((p) => code.includes(p))
    // 方向一：登记的每个模块必须真引用 token
    for (const mod of declared) {
      const code = codeByMod[mod]
      if (code === undefined) { errors.push(`[${ch.id}] 登记模块 ${mod} 在 src/ 中不存在`); continue }
      if (!hit(code)) errors.push(`[${ch.id}] 登记模块 ${mod} 源码中已无「${pats.join(' | ')}」⇒ 通道被改而契约未同步（或该模块已不再参与此通道）`)
    }
    // 方向二：实际引用者必须都在登记表里
    for (const [mod, code] of Object.entries(codeByMod)) {
      if (!hit(code)) continue
      if (!declared.has(mod)) errors.push(`[${ch.id}] 模块 ${mod} 引用了「${ch.token}」但**未登记** ⇒ 请补进 writers/readers（或显式列 mentions 并写理由）`)
    }
    if (!ch.writers.length) errors.push(`[${ch.id}] 无写侧 ⇒ 登记表不完整`)
  }
  return errors
}

function loadCode() {
  const out = {}
  for (const f of readdirSync(SRC)) {
    if (!f.endsWith('.ts') || f.includes('.generated.')) continue
    out[f] = stripComments(readFileSync(join(SRC, f), 'utf8'))
  }
  return out
}

if (process.argv.includes('--selftest')) {
  // 反向证伪：证明**两个方向**都真的会红，不是一个永远绿的装饰
  const cases = [
    { name: '完全一致 ⇒ 无错', code: { 'a.ts': 'x activity.jsonl', 'b.ts': 'y activity.jsonl' },
      ch: [{ id: 't', token: 'activity.jsonl', what: '', writers: ['a.ts'], readers: ['b.ts'], mentions: [] }], want: 0 },
    { name: '登记模块里 token 消失 ⇒ 红（方向一）', code: { 'a.ts': 'x', 'b.ts': 'y activity.jsonl' },
      ch: [{ id: 't', token: 'activity.jsonl', what: '', writers: ['a.ts'], readers: ['b.ts'], mentions: [] }], want: 1 },
    { name: '出现未登记引用者 ⇒ 红（方向二）', code: { 'a.ts': 'x activity.jsonl', 'b.ts': 'y activity.jsonl', 'c.ts': 'z activity.jsonl' },
      ch: [{ id: 't', token: 'activity.jsonl', what: '', writers: ['a.ts'], readers: ['b.ts'], mentions: [] }], want: 1 },
    { name: 'mentions 显式豁免 ⇒ 不红', code: { 'a.ts': 'x activity.jsonl', 'm.ts': 'const F = "activity.jsonl"' },
      ch: [{ id: 't', token: 'activity.jsonl', what: '', writers: ['a.ts'], readers: [], mentions: [{ mod: 'm.ts', why: '常量定义处' }] }], want: 0 },
    { name: '注释中的提及不算引用（先过剥离）', code: { 'a.ts': 'x activity.jsonl', 'd.ts': stripComments('// 这里提到 activity.jsonl 但只是注释') },
      ch: [{ id: 't', token: 'activity.jsonl', what: '', writers: ['a.ts'], readers: [], mentions: [] }], want: 0 },
    // 这条**专门自证剥离顺序**：注释正文含 `audit/*.md`（`/*`），先剥块注释会吞掉紧随其后的真实代码
    //   （deepsleep-materials.ts 实测踩过 ⇒ 真实读取点被判"消失"）。顺序反了这条必红。
    { name: '注释里的 audit/*.md 不得吞掉紧随的真实代码（剥离顺序自证）',
      code: { 'a.ts': stripComments("// 此前该清单只写 audit/*.md 无人读\nconst f = join(root,'audit','activity.jsonl')") },
      ch: [{ id: 't', token: 'activity.jsonl', what: '', writers: ['a.ts'], readers: [], mentions: [] }], want: 0 },
    { name: 'alias（常量名）也算引用', code: { 'a.ts': 'import { RING_EVENT_FILE }', 'b.ts': 'join(d, RING_EVENT_FILE)' },
      ch: [{ id: 't', token: 'ring-events.jsonl', alias: ['RING_EVENT_FILE'], what: '', writers: ['a.ts'], readers: ['b.ts'], mentions: [] }], want: 0 },
  ]
  let bad = 0
  for (const c of cases) {
    const got = evaluate(c.code, c.ch).length
    const ok = got === c.want
    if (!ok) bad++
    console.log(`${ok ? '✅' : '❌'} ${c.name}（期望 ${c.want} 项错 · 实得 ${got}）`)
  }
  if (bad) { console.log(`\nFAIL（${bad} 条自证未过）`); process.exit(1) }
  console.log('\nPASS（selftest：双向判定均已自证）')
  process.exit(0)
}

if (!existsSync(SRC)) { console.log('check-file-channel: src/ 缺席 ⇒ skip（exit 3）'); process.exit(3) }

const code = loadCode()
const errors = evaluate(code)

console.log(`跨域文件通道契约 · ${CHANNELS.length} 条通道 · 扫描 src ${Object.keys(code).length} 模块（已剥注释）`)
for (const ch of CHANNELS) {
  console.log(`\n  ${ch.id}  「${ch.token}」`)
  console.log(`    写 ${ch.writers.join(', ') || '(无)'}`)
  console.log(`    读 ${ch.readers.join(', ') || '(无)'}`)
  if (ch.mentions?.length) console.log(`    提及（豁免）${ch.mentions.map((m) => m.mod).join(', ')}`)
}

if (errors.length) {
  console.log('')
  errors.forEach((e) => console.log('❌ ' + e))
  console.log(`\nFAIL（${errors.length} 项）`)
  process.exit(1)
}
console.log('\nPASS')
