#!/usr/bin/env node
// check-injection-reach.mjs —「模块输出**是否抵达注入文本**」正面断言（S4-9 · 2026-09-14）
//
// 判因（G10）：`check-arch-sync` 的"接线"口径只要求**被 import 且被调用过**，**不要求输出真的进注入面**。
//   实测假绿：`supply-assembly` 被记为「已接线（P0a）」，而它在 `src/` 内唯一消费者是
//   `panel-shared.ts` 的 `supplyUsageMeta` —— 其产出 `kept`/`dropped`/`blocks.stable|dynamic|oneshot`
//   **只进 `/inject/stats` 诊断**，只有 `blocks.situation` 进注入面。
//   ⇒ **「接线」与「抵达」是两件事**；本仓所有架构门都是"负面约束"（不许有环/不许超行数），
//     缺一条**正面**断言问"这东西的输出到底有没有到用户眼前"。
//
// 本件把「抵达」写成可机检的申报 + 三条断言：
//   ② 申报的模块真实存在；
//   ③ 申报 `full` 者，其符号必须出现在**注入文本构造函数** `buildHotMemoryText` 体内；
//   ④ **专项锁**：注入文本当前**只并入 `situation` 块** —— 把 `supply-assembly` 的 `partial` 现状钉住，
//      任何"装配器接管主路径"的改动都会在此翻红，提醒同步本表与验收。
//
// 反例自证：把 `finalText` 改为并入装配器的其他输出（模拟接管），④ 必须红；还原则绿。
//
// 用法: node scripts/check-injection-reach.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

/**
 * 抵达申报表：模块 → 代表符号 → 抵达程度。
 *   `full`    产物**直接进注入文本**
 *   `partial` 部分进 / 或只作**输入**（自身不产生文本）
 *   `none`    不进注入面（诊断、或只影响"是否注入"）
 * **改这份表必须同步改代码注释与验收记录** —— 它是"输出到底到没到用户眼前"的唯一账。
 */
const REACH = [
  { module: 'injection-playbook', symbol: 'MEMORY_PLAYBOOK_LINES', reaches: 'full', path: 'panel-shared#buildHotMemoryText → sl（stable 段）' },
  { module: 'ring-supply', symbol: 'createRingSupplyApi', reaches: 'full', path: 'situation-supply#situationLinesOf（2026-09-17 自 panel-shared 抽出）→ panel-shared#buildHotMemoryText → situationBlock → finalText', note: '抽出式重构的**预期信号**：本符号不再字面出现在 panel-shared.ts，故判据 ③ 翻红。抵达链一字未改（panel-shared import situationLinesOf，后者调本符号）。此处如实改表即消解；**正面断言的价值正在于此**——若为省事把它降为 partial，就等于放弃了对该链的机器守护' },
  { module: 'situation-supply', symbol: 'situationLinesOf', reaches: 'full', path: 'panel-shared#buildHotMemoryText → situationBlock → finalText', note: '2026-09-17 新增：情境槽读侧供给（自 panel-shared 抽出）。它是 `createRingSupplyApi` 的**唯一**调用方，二者共同构成"环记录 → 注入面"的完整链' },
  { module: 'supply-assembly', symbol: 'budgetOf', reaches: 'partial', path: 'panel-shared#buildHotMemoryText → 三层额度（**决定裁多少**，不产生文本）', note: 'S4-1：口径统一的单一实现；它影响的是"哪些行进得来"，不是"文本长什么样"' },
  /* ★IR1 册三（2026-09-18）**申报表随实况更新**：影子装配退役 ⇒ `assembleSupply` 已不在注入链上
   *   （它只服务离线预览 CLI）；取而代之的是 `supplyMetaOf`（账）+ `takeSlotLines`（情境槽切割语义）。 */
  { module: 'supply-assembly', symbol: 'assembleSupply', reaches: 'none', path: '**已退出注入链**（旧：`supplyUsageMeta` 影子复算）；现仅服务离线 `scripts/supply-preview.mjs`', note: 'IR1 册三 C5：影子复算退役 —— 主路径不再有第二份装配。本表此前记它是 partial（"仅诊断"），那描述**已过期**' },
  { module: 'supply-assembly', symbol: 'supplyMetaOf', reaches: 'partial', path: 'panel-shared#buildHotMemoryText → `cache.usage`（账：六槽逐槽出账，含 `process`）', note: 'IR1 册三：账由**真实裁切结果**直出（不再重算）⇒ 它决定 `/inject/preview` 与 `/inject/stats` 的读数，不产生注入文本' },
  { module: 'supply-assembly', symbol: 'takeSlotLines', reaches: 'full', path: 'panel-shared#buildHotMemoryText → `sitTake.kept` → `finalText`（情境块）', note: 'IR1 册三：情境槽的切割语义与 `assembleSupply` 内部**同一实现**（单一实现），故它**直接决定注入文本的一段**' },
  { module: 'situation-key', symbol: 'cuesOf', reaches: 'partial', path: '提供情境线索（**输入**），自身不产生注入文本' },
  { module: 'vec', symbol: 'recallRanked', reaches: 'partial', path: '提供候选行（**输入**），经调用方渲染后才成文本' },
  { module: 'supply-ledger', symbol: 'rowFingerprint', reaches: 'none', path: '只决定"本会话是否已注入过"（**影响**注入，不产生文本）' },
  { module: 'content-types', symbol: 'createContentTypesApi', reaches: 'none', path: '仅供 `/content-types` 只读端点（面板诊断）' },
]

const shared = read('src/panel-shared.ts')
/** 注入文本的构造函数体（判定基准）：从 `function buildHotMemoryText(` 到下一个顶层 `function` */
const body = (() => {
  const i = shared.indexOf('function buildHotMemoryText(')
  if (i < 0) return ''
  const rest = shared.slice(i)
  const j = rest.indexOf('\nfunction ', 10)
  return j > 0 ? rest.slice(0, j) : rest
})()

console.log('注入抵达面（S4-9 正面断言）')
ok(body.length > 0, '① 找到注入文本构造函数 `buildHotMemoryText`（判定基准；找不到即无法判定任何"抵达"）')

const missingMod = REACH.filter((r) => !existsSync(join(root, 'src', `${r.module}.ts`))).map((r) => r.module)
ok(missingMod.length === 0, `② 申报的模块都在 src/（缺：${missingMod.join(', ') || '无'}）`)

const fulls = REACH.filter((r) => r.reaches === 'full')
/**
 * **判据 ③ 的扫描面 = 注入面构造文件 + 其直接依赖**（2026-09-17 修订）。
 *
 * 判因：原先只读 `panel-shared.ts` 一个文件，于是**任何"抽出式重构"都会假红** ——
 *   实测本轮把 `situationLinesOf` 抽到 `situation-supply.ts` 后，
 *   `ring-supply#createRingSupplyApi` 不再字面出现在 panel-shared，
 *   而抵达链**一字未改**（panel-shared import situationLinesOf → 后者调本符号）。
 *   ⇒ 门禁若坚持"只认一个文件"，就会**惩罚正确的模块化**，逼人把申报降级为 partial（= 放弃守护）。
 *
 * 修订后的语义**不放松守护力**：符号仍须出现在"注入面构造可达的近邻"里；
 *   放宽的只是"跨一层模块边界"这一形式。**离注入面更远的模块仍会红**（它们确实不构成抵达）。
 */
const depFiles = (() => {
  const out = ['src/panel-shared.ts']
  // 取 panel-shared 的 import 列表，把 `./x.js` 解析为 `src/x.ts`
  for (const m of shared.matchAll(/^import\s[^'"]*from\s+'\.\/([^'"]+)\.js'/gm)) {
    const f = join('src', `${m[1]}.ts`)
    if (existsSync(join(root, f))) out.push(f)
  }
  return out
})()
const sharedPlusDeps = depFiles.map((f) => read(f)).join('\n')
const notInFile = fulls.filter((r) => !sharedPlusDeps.includes(r.symbol)).map((r) => `${r.module}#${r.symbol}`)
ok(notInFile.length === 0, `③ 申报 full 者，符号出现在**注入面构造文件及其直接依赖**内（${depFiles.length} 件；缺：${notInFile.join(', ') || '无'}）`)
// 直接 vs 间接：不在 `buildHotMemoryText` 直体内者为"经调用间接抵达"—— **可见化**，不判失败
//   （例：`createRingSupplyApi` 在 `situationLinesOf` 内被调用，而后者被本函数调用）
const indirect = fulls.filter((r) => !body.includes(r.symbol)).map((r) => `${r.module}#${r.symbol}`)
if (indirect.length) console.log(`   · 其中**经调用间接抵达**（不在 buildHotMemoryText 直体内）：${indirect.join(', ')}`)

/* ④ **装配单出口**（IR1 册三 · 2026-09-18 改写）：注入文本的**账**必须由真实裁切直出，
 *   而不是"同批候选再装配一遍"。旧断言钉的是"只并入 situation 块"那个 partial 形态
 *   （当时 `assembleSupply` 是**影子**）；现影子已退役 ⇒ 判据改为**两条正面断言**：
 *   ① `panel-shared` **不得再出现** `assembleSupply(`（影子复算 ⇒ 必红）；
 *   ② 账必须走 `supplyMetaOf(`（六槽逐槽出账，含 `process`），且情境块并入走 `takeSlotLines(`。
 *   ⚠ 先红自证：把 `assembleSupply(` 写回 panel-shared（或删掉 `supplyMetaOf(`）⇒ 本组翻红。 */
const noShadowAssembly = !/assembleSupply\(/.test(shared)
ok(noShadowAssembly, '④ **主路径无第二份装配**：`panel-shared` 内无 `assembleSupply(`（影子复算已退役，C5）')
const metaSingle = /supplyMetaOf\(/.test(shared) && /takeSlotLines\(/.test(shared)
ok(metaSingle, '④′ 账走**单一实现**：`supplyMetaOf(`（六槽出账）+ `takeSlotLines(`（情境槽切割语义同源）')

/* ══ ⑤⑥ **深睡 prompt 材料抵达面**（H-1 根因修 · 2026-09-15）══════════════
 * 判因（实测）：prompt 的 P5 段写着「**材料若给出待回收的裁决**…就填 `outcomes[]`」，
 *   而 `gatherMaterials` **从未产出**该段 ⇒ 条件永不成立 ⇒ `outcomes` **结构性恒 0**
 *   （库内 49 条待回收裁决、历史只收过 1 条）。本仓有 `check-injection-reach` 守**注入文本**的抵达面，
 *   却**没有**守「**prompt 依赖的材料段是否真的产出并被拼接**」—— 这就是它能潜伏的结构性原因。
 * ⇒ 补两条**正面**断言（与既有 ③④ 同一风格，**不新开文件**）：
 *   ⑤ userInput 里引用的每个 `M.<key>` 都必须由 `gatherMaterials` 产出（**用了但没产出 = 假绿**）；
 *   ⑥ **通道锁**：prompt 声明的 P5 `outcomes` 通道，必须有材料段背书 **且** 已拼进 userInput。 */
const runSrc = read('src/deepsleep-run.ts')
const matSrc = read('src/deepsleep-materials.ts')
const coreSrc = read('src/deepsleep-core.ts')
/** 产出集：`gatherMaterials` 的 `return { … }` 里的键（**含 `counts`** —— 它也被 userInput 侧用于审计）
 *  ⚠ 解析要点（首版踩过）：`return {` 行**开头的 `{`** 必须剥掉，否则首个键被当作非法标识符丢弃；
 *    且 `counts: {…}` 是**嵌套对象**，需在它处**止步**（否则内层键会污染产出集）。 */
const produced = (() => {
  const lines = matSrc.split('\n')
  const i = lines.findIndex((l) => /^\s*return \{/.test(l))
  if (i < 0) return new Set()
  const set = new Set()
  /* S1R（2026-09-19）：原实现「遇到 `counts:` 即 break」⇒ **`counts` 之后新增的材料键看不见**
   *   （实测把新增的 `sectionRef` 判成「引用了但没产出」= 假红）。现改为**按花括号深度解析顶层键**：
   *   顶层逗号列表（`a, b, c`）与 `key: {…}` 两种写法都认，遇到 `{` 即止（内层键不污染产出集）。 */
  let depth = 0
  for (let k = i; k < lines.length; k++) {
    let t = lines[k].replace(/\/\/.*$/, '')
    if (k === i) t = t.replace(/^\s*return\s*\{/, '')
    const trimmed = t.trim()
    if (depth === 0) {
      if (/^\}/.test(trimmed)) break
      for (const tokRaw of t.split(',')) {
        const tok = tokRaw.trim()
        if (!tok) continue
        const beforeBrace = tok.split('{')[0].trim().replace(/:\s*$/, '')
        const m = tok.match(/^([A-Za-z_$][\w$]*)\s*:/) || (!tok.includes('{') ? tok.match(/^([A-Za-z_$][\w$]*)$/) : null)
        if (m && /^[A-Za-z_$][\w$]*$/.test(beforeBrace || m[1])) set.add(m[1])
        if (tok.includes('{')) break // 该 token 起进入嵌套对象 ⇒ 本行后续不再取顶层键
      }
    }
    for (const ch of t) { if (ch === '{') depth++; else if (ch === '}') depth--; if (depth < 0) break }
  }
  return set
})()
/** 使用集：`deepsleep-run.ts` 里出现的 `M.<key>` */
const used = new Set([...runSrc.matchAll(/\bM\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
const missingKeys = [...used].filter((k) => !produced.has(k))
ok(missingKeys.length === 0, `⑤ 深睡 userInput 引用的材料键**全部由 gatherMaterials 产出**（产出 ${produced.size} 键 · 引用 ${used.size} 键 · 缺：${missingKeys.join(', ') || '无'}）`)
const unusedKeys = [...produced].filter((k) => !used.has(k))
if (unusedKeys.length) console.log(`   · 产出但未被 userInput 引用（可见化，不判红）：${unusedKeys.join(', ')}`)
const declaresOutcomes = /outcomes/.test(coreSrc.slice(coreSrc.indexOf('P5'), coreSrc.indexOf('P5') + 400))
ok(!declaresOutcomes || (produced.has('pendingDecisions') && used.has('pendingDecisions')),
  `⑥ 通道锁：prompt 声明的 P5 \`outcomes\` 通道**有材料背书且已拼接**（材料段=${produced.has('pendingDecisions')} · 拼接=${used.has('pendingDecisions')}）`)

/* ══ ⑦⑧ **纪元日志（工具使用）抵达面**（S-P2c · 2026-09-16）══════════════
 * 判因：`harvest-access` 已把"当天用了哪些工具"落进 `audit/tool-usage.jsonl`（S-P2a），
 *   但**采集到 ≠ 抵达**：日志若从不进 `gatherMaterials`、或进了却未拼进 `userInput`，
 *   模型永远看不到工具维 ⇒ 那条产线等于没接（与 H-1「判据在、通道无」同族）。
 * ⑤⑥ 已守"用了但没产出"与 outcomes 通道锁；⑦⑧ 把同一纪律**扩到工具维**。 */
const producedTool = produced.has('toolUsage')
const usedTool = used.has('toolUsage')
ok(producedTool && usedTool,
  `⑦ 工具维抵达：材料段 \`toolUsage\` 产出=${producedTool} · 拼进 userInput=${usedTool}（任一为假 ⇒ 采集到的工具维到不了模型）`)
const declaresTools = /工具使用/.test(coreSrc) || /toolUsage/.test(coreSrc)
ok(declaresTools,
  '⑧ 通道锁：深睡 prompt 声明了工具维的处理策略（材料给了却无策略 = 模型不知道拿它做什么）')
/* ⑩ **跨粒度收敛通道锁**（S-P4b · 2026-09-16）：
 *   宿主侧校验器 `applyConvergeOps` 落地并接线（S-P4a）**不等于**该通道可达 ——
 *   若 prompt 从不声明它，**没有任何模型会产出 convergeOps** ⇒ 应用面为空（与 H-1「判据在、通道无」同族）。
 *   ⇒ 本断言同时要求：**prompt 声明** 且 **宿主接线**（任一为假 ⇒ 通道不可达）。 */
const declaresConverge = /convergeOps/.test(coreSrc)
const runCallsConverge = /applyConvergeOps\s*\(/.test(runSrc)
ok(declaresConverge && runCallsConverge,
  `⑩ 通道锁：跨粒度收敛 —— prompt 声明=${declaresConverge} · 宿主接线=${runCallsConverge}（任一为假 ⇒ 该通道应用面为空）`)
/* ⑪ **收敛候选抵达**（S-P4c′ · 2026-09-16）：真机实测发现 —— 光声明通道不够：
 *   要求模型**自己从全量材料里找**"同一知识的两版"⇒ 首发 **一条未提**（`otherTried:0`）。
 *   仓内既有分工是「**候选生成交向量，模糊判断交模型**」⇒ 宿主必须**预筛候选并下发**。
 *   ⇒ 本断言要求 `convergeCandidates` **被调用**且其产出确实**进入 userInput**（拼成材料段）。 */
const runBuildsCandidates = /convergeCandidates\s*\(/.test(runSrc)
const segsPushCandidates = /segs\.push\([^)]*跨粒度收敛候选/.test(runSrc) || /跨粒度收敛候选[\s\S]{0,400}segs\.push/.test(runSrc)
ok(runBuildsCandidates && segsPushCandidates,
  `⑪ 候选抵达：宿主预筛候选=${runBuildsCandidates} · 产出入 userInput=${segsPushCandidates}（缺 ⇒ 又把"找候选"推给模型，首发实测必空手）`)

/* ⑫ **时态剔除抵达面**（2026-09-20 · 本轮「读数/抵达」复查的产物）：
 *   判因（实测，**会掩盖其他问题**的那一类）：`supply-assembly#buildCandidates` 的注释声称
 *   「把『失效者不得入候选』变成**读侧的硬规则**」并称其为"读侧闭环"，但实测 `grep buildCandidates`
 *   的命中 = 定义处 + `scripts/supply-preview.mjs`（离线预览）+ 单测 ⇒ **`src/` 内零消费者**
 *   ⇒ 恒定面与相关性召回**都不经时态剔除**；而真库 `validTo` 非空 = **0/5777**（从未落库一条）。
 *   两个缺陷叠加 = 「机制在、通路无、样本零」，且**注释宣称与实况相反**（诊断者会据此以为已闭环）。
 *   ⇒ 本断言把**实况钉住**（正面：消费者集合就是那两个离线件；**反向**：一旦接线，本断言翻红并要求改表）。
 *   ⚠ `buildCandidates` 出现在 `ring-supply.ts` **仅注释**（`// 与 buildCandidates 同纪律`）⇒ 判据必须**先剥注释**，
 *     否则注释一条就"接线了"（仓内既有先例：`check-carriers` 的「先剥注释再匹配」）。 */
{
  /* ⚠ 工程坑（先红自证抓到的，记档）：本块首版写 `read(join(root, f))`，而 `read()` 内部已是
   *   `readFileSync(join(root, p))` ⇒ **root 被拼两次** ⇒ 每件都 ENOENT ⇒ `read` 的 try/catch
   *   把异常**吞成空串** ⇒ 扫描面恒空 ⇒ 断言**恒真**（且照样打印 ✅）。
   *   ⇒ 纪律：**先红自证不是形式**，它是唯一能抓到"恒真断言"的手段（本仓已有同类实证：
   *     `check-relevance-live` 的零命中断言三 case 全在 false 侧被验）。此处只传**相对路径**。 */
  const scanFiles = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`)
  const consumers = []
  for (const f of scanFiles) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    if (!src) { fail++; console.log(`  ❌ ⑫ 扫描面读不到文件（${f}）—— 读失败不得静默当作"无消费者"`); continue }
    if (/\bbuildCandidates\s*\(/.test(src) && !/export function buildCandidates/.test(src)) consumers.push(f)
  }
  const expected = []
  ok(JSON.stringify(consumers.sort()) === JSON.stringify(expected),
    `⑫ 时态剔除抵达面**如实登记**：\`buildCandidates\` 的 \`src/\` 内消费者 = [${consumers.join(', ') || '无'}]（\`validTo\` 到注入面**无通路**；真库样本 0/5777）—— 接线后此断言翻红 ⇒ 同步改本表与 OPEN-ITEMS`)
}
for (const r of REACH) console.log(`   · ${r.reaches.padEnd(7)} ${r.module}#${r.symbol} —— ${r.path}`)
const part = REACH.filter((r) => r.reaches !== 'full').length
console.log(`   合计 ${REACH.length} 项：full ${REACH.length - part} · partial/none ${part}`)

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（注入抵达面断言全过）')
process.exit(fail ? 1 : 0)
