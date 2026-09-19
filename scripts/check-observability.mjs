#!/usr/bin/env node
/**
 * check-observability.mjs — **观测流注册表 + 棘轮**（G0 DS4「单一事件源」的前置仪表 · 2026-09-13）
 *
 * 为什么需要它：方案档 DS4 要求「**一个** `events.jsonl`，现有 8 个 jsonl 降为**投影**」。
 *   但"现有几个"从来没数过——而**没有数字的目标等于没有目标**（本项目已有三次实证：
 *   快通道恒 0 无人知晓 · 惰性桥 6 条边没数过就拆不动 · 合规率没有分母就无从放行）。
 *   本件把运行时**观测流**登记成注册表，并**只许减不许增**：
 *     · 出现**未登记**的 `.jsonl` 字面量 ⇒ FAIL（新增观测流必须显式登记并说明为何不能并入）；
 *     · 登记项在源码里查不到 ⇒ 提示清理（陈旧登记同样是漂移）；
 *     · 流数 < 基线 ⇒ PASS 并**提示收紧基线**（合并后必须把基线降下来）。
 *
 * 口径（**显式分类，不用启发式**）：
 *   · 计入 = **运行时写出的 append-only 观测流**（审计/影子/水位/台账/存根）；
 *   · 豁免 = `session.jsonl`（宿主转录）· `records.jsonl`（Record **事实源**）·
 *            `.vector-cache.jsonl`（**可重建缓存**）· `judgement-ledger.jsonl`（**legacy 只读别名**）。
 *   ⇒ 豁免表本身也要在这里**写明理由**，不许默默略过。
 *
 * 用法：node scripts/check-observability.mjs [--selftest | --shape]
 *   --shape  读**真实数据**给逐流形态表（DS4 合并的前置；报告态 exit 0）
 *   --parsability  两库根 jsonl 的**可解析性强制项**（R2「读数口径四件套」；见下方长注释）
 *   --selftest-parsability  上项扫描器的**反例样本自证**（无此则该项断言恒真）
 * 退出码：0 = pass（≤ 基线）· 1 = fail（出现未登记流 / 读数真损坏）· selftest 下 0/1 表扫描器自证
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(repoRoot, 'src')
const SCRIPTS = join(repoRoot, 'scripts')

/**
 * **观测流注册表**（运行时写出、供审计/影子/水位/台账消费）。
 * 2026-09-13 实测 12 条；DS4 目标 = **1**（单一事件源，其余降为投影）。
 * 新增一条必须在此登记并写明理由——登记不是许可，是让它**可见**。
 */
/** 每项：`[流名, 家族, 说明, 域]`。
 *  **家族**决定"能不能并入单一事件源"；**域**决定"能不能并进**这个**台账"（2026-09-13 补）：
 *   · `suite` = suite 知识区（`<DSH_HOME>/suite/knowledge/audit/`）——**ledger 在此，可并**；
 *   · `bank`  = 记忆库（`<bank>/audit/` 或 `<bank>/.records/`）——**数据属库**，与运行时台账**分域**
 *     （仓内既有约定）⇒ **跨域并入是语义错误**，不是"还没做"。
 */
const STREAMS = [
  // ── 事件流 · **suite 域** —— DS4「单一事件源」的目标**只对这一族成立**
  // 2026-09-13 **DS4 合并第六刀**：蒸馏审计并入 `ledger.jsonl`（type=audit.*）⇒ 本流退役为 legacy 只读。
  // 2026-09-13 **第七刀（判定：不并）**：`distill-watermark` 的**读侧语义**是 `map.set(sessionId, o)`
  //   ⇒ **按 key 取最后一条**（键控状态），与"读侧把行当**事件**"（计数/聚合/取最近）**不同族**；
  //   且它在**热路径**（每 10min × roots 全量读，D7 已记为性能隐患）⇒ 并入会放大那次读。
  //   ⇒ 归 **keyed**（键控日志），**不并入事件台账**——这是读语义的分别，不是为了凑目标数。
  ['distill-watermark.jsonl', 'keyed', '蒸馏水位（**键控**：读侧 `map.set(sessionId,o)` 取每键最后一条；热路径全量读）', 'suite'],
  /* S2S3 册零（2026-09-19）**键控产物流**：`distill-manifest/<sid>.jsonl` —— 每段蒸馏一行（段末清单）。
   *  为何不并入台账：① **键控**语义（按 sid 取该会话全部段）与事件族不同；② 它是**蒸馏的中间产物**，
   *  给 L2 会话级复盘当材料（原先只在同轮内存、轮结束即消失）；③ 与上面 `distill-watermark` 同理由。 */
  ['distill-manifest/<sid>.jsonl', 'keyed', '蒸馏分段清单持久化（每段一行；**L2 会话级复盘的材料来源**之一）', 'suite'],
  /* S2S3 册一（2026-09-19）**L2 复盘的流**：这两条刻意**不并入台账**——
   *  ① `session-review-state.jsonl` 是**键控状态**（读侧"该 sid 末行生效"，与水位同族，故不能并入事件流）；
   *  ② `proposals-<sid>.jsonl` 是**待执行提案**（append-only、由 S3 下一轮消费），落在**库内** `audit/session-review/`
   *     ——它是"提案账"，语义是"还没执行的意图"，与"已发生的事实"（台账）分属两族。 */
  ['session-review-state.jsonl', 'keyed', 'L2 复盘水位（键控：该 sid 末行生效；**不并入 distill-watermark**——那条流会被 L1 每段一写冲掉）', 'suite'],
  ['proposals-<sid>.jsonl', 'keyed', 'L2 校正**提案流**（append-only，执行权留 S3；库内 `audit/session-review/`）', 'bank'],
  /* S2S3 册二「执行 L2 提案」（2026-09-19）：`applied.jsonl` 是**幂等账**——
   *  读侧语义 = 按键（`opHash`）取"是否已执行"（`Set` 成员判据），与事件流"读侧逐条"不同族；
   *  且它与提案流**同目录同生命周期**（提案 → 执行 → 记账），并入台账会把"哪条提案已执行"这一**键控状态**摊成事件。 */
  ['applied.jsonl', 'keyed', 'L2 提案**执行幂等账**（`(sid,opHash)` 已执行集合；"复跑即 no-op"的判据载体）', 'bank'],
  /* S2S3 册四（2026-09-19）**睡眠产物的两条流**：为何**不并入台账**（登记要求的理由）——
   *  ① `sleep-reports.jsonl` 读侧是**末条生效**（`sleep-report#latestDerivation` 取最后一条 `kind=sleep-round`
   *     复算「最近成长」；面板 `/sleep/issues` 同取 `lastRound`）⇒ 键控语义，与「读侧逐条」的事件族不同；
   *     它的**人读面**是 `reports/sleep/<date>.md`（append-only、永不删除），本流是它的机器可读孪生。
   *  ② `sleep-issues.jsonl` 是**问题队列**（`state:'open'` + `handled:'not-handled'`，用户口径"只标记不处置"）：
   *     同一 (file,section) 的后继行覆盖前行处置态（**只增不改历史行**）⇒ 同为键控族；
   *     它是"待处置标记"，与台账里"已发生的事实"分族。 */
  ['sleep-reports.jsonl', 'keyed', '睡眠汇报流（每轮一行 kind=sleep-round + 影响账并入 kind=impact）——**注入派生源**与面板只读面共读', 'suite'],
  ['sleep-issues.jsonl', 'keyed', '睡眠问题队列（只标记不处置：state=open / handled=not-handled；只增不改历史行）', 'suite'],
  /* G11「报告永不删除」的**判据载体**（2026-09-19）：每轮一行**整文件**指纹（sha256/bytes/lines/sections）。
   *  为何不并入台账：① 它是**产物的指纹**（被验对象是 `reports/sleep/<date>.md`），不是"发生了什么事件"；
   *  ② 读侧语义是"取该 dateFile 的最早/最新一行"（键控），与事件族不同。 */
  ['sleep-report-ledger.jsonl', 'keyed', '睡眠报告指纹账（整文件 sha256 + 字节/行/段数；"永不删除"= 行数单调 + 全覆盖 + 逐值相等）', 'suite'],
  ['ledger.jsonl', 'event', '统一台账（judgement + write 回执 + 各域并入流；**DS4 主干**）', 'suite'],
  // ── 事件流 · **bank 域**（数据属库）—— 与 suite 台账分域，**不并入**
  ['access-real.jsonl', 'event', '真实访问流水（由**库内脚本** harvest-access 增采；活性/遗忘/回想强度的真实信号源）', 'bank'],
  /* S-P2a（2026-09-16）**为何不能并入单一事件源**（登记要求的理由）：
   *  ① **主题不同**：`access-real` 记"读到了哪个 §"（记忆**消费**）；本流记"用了哪个工具 × 几次"（**行为**）——
   *     单位与消费者都不同（前者喂活性/遗忘模型，后者喂深睡材料的**工具维**）。
   *  ② **隐私契约更严且形态不同**：本流**明文禁止**落参数原文/路径，由 `check-journal-privacy` 三向守
   *     （含**字段白名单**：只允许 t/sid/tool/n）。并入会被稀释成"字段级约定"，而它需要**结构级**保证。
   *  ③ **同源同水位**：它**不是**第二遍遍历 —— 由 `harvest-access` 在**同一遍转录遍历、同一水位**里顺带聚合，
   *     故无"两份水位漂移"风险（这正是当初选择复用而非新建遍历器的原因）。 */
  ['tool-usage.jsonl', 'event', '工具使用聚合（工具名×次数×会话短码×日期；**零参数原文**；harvest-access 同遍历顺带聚合）', 'bank'],
  /* J5/U3（2026-09-16）**为何不能并入单一事件源**（登记要求的理由）：
   *  ① **主语不同**：`access-real` 记"读到了哪个 §"、`tool-usage` 记"用了什么工具"，
   *     本流记的是「**某一次注入之后模型做了什么**」—— 主语是"**一次注入**"，另两条都没有这个主语。
   *  ② **连接键是时间**：台账 `phase:'compliance'` 的 `at` × 转录 `tool/call` 的 `time`；
   *     并入任一条都得**重算时间连接**，而不是多一列。
   *  ③ **隐私契约更严**：本流**额外禁止** `topics`/`q`/`arguments`（`topics` 来自用户提问 ⇒
   *     落它等于把**查询内容**写进日志）—— 该禁令由 `check-journal-privacy` **机检**（不是只写注释）。
   *  ④ **同源同水位**：仍由 `harvest-access` 在**同一遍转录遍历**产出，无"两份水位漂移"。 */
  ['yield-rounds.jsonl', 'event', '收益取证（注入时刻 × 注入后工具名序列；**只落工具名，禁 topics/q/arguments**；同遍历顺带产出）', 'bank'],
  ['ring-events.jsonl', 'event', '环事件流（9 种 op · 重放可重建状态；落 `<bank>/.records/`）', 'bank'],
  // ── 状态表 / 投影（整体重写或按 key upsert）——**不是事件流，不能并入 append-only 台账**：
  //    追加进共享文件会破坏其"每 key 仅最后一条有效 / 每次扫描即快照"的语义；
  //    DS4 的「其余降为**投影**」对它们**已然成立**（本就是派生快照、可重建）。
  ['activity.jsonl', 'state', '活性状态表（`activity.ts` **原子替换**整表；非 append）', 'bank'],
  ['archive-progress.jsonl', 'state', '归档进度（`archive-lib.upsertMark` **按 sessionId upsert**）', 'bank'],
  ['maturation.jsonl', 'state', '成熟度快照（`maturation-scan` **每次扫描覆盖写**）', 'bank'],
]

/** **豁免**（不是观测流；豁免必须写明理由，不许默默略过） */
const EXEMPT = new Map([
  ['session.jsonl', '宿主会话转录（DSH 的资产，不是本插件观测面）'],
  ['records.jsonl', 'Record **事实源**（P4 存储解耦），不是观测流'],
  ['.vector-cache.jsonl', '**可重建缓存**（行向量；事实源是行文本本身，删了会自动重嵌）'],
  ['judgement-ledger.jsonl', '**legacy 只读别名**（v2.1 前封存批次，仅读兼容；新写入一律走 ledger.jsonl）'],
  ['score-shadow.jsonl', '**legacy 只读**（影子打分已并入 ledger.jsonl 的 type=score.shadow；本文件仅存历史批次）'],
  ['activation-shadow.jsonl', '**legacy 只读**（打扰度影子已并入 ledger.jsonl 的 type=activation.shadow；本文件仅存历史批次）'],
  ['stub.jsonl', '**legacy 只读**（裁决存根已并入 ledger.jsonl 的 type=stub；本文件仅存历史批次）'],
  ['episodes.jsonl', '**legacy 只读**（轻 episode 已并入 ledger.jsonl 的 type=episode；本文件仅存历史批次）'],
  ['mcl-audit.jsonl', '**legacy 只读**（认知环审计已并入 ledger.jsonl 的 type=mcl.*；本文件仅存历史批次）'],
  ['distill-audit.jsonl', '**legacy 只读**（蒸馏审计已并入 ledger.jsonl 的 type=audit.*；读侧一律走 audit-source 双源读，**单读台账会丢水位历史**）'],
])

/** 棘轮基线（**只许收紧**，**只对事件流计数**）：
 * 13（原含状态表）→ 12（score-shadow 并入）→ 11（activation-shadow 并入）→ **8**
 * 2026-09-13 **口径修正**：`activity` / `archive-progress` / `maturation` 三条**不是 append-only 事件流**
 *   （分别原子替换 / 按 key upsert / 每次扫描覆盖写）⇒ 归**状态表/投影**，不参与"合并为单一事件源"。
 *   依据：三条各自的写入器源码（`activity.ts` 原子替换 · `archive-lib.upsertMark` · `maturation-scan` 覆盖写）。
 * 2026-09-13 **第三刀**：`stub` 并入 ledger ⇒ 事件流 **8 → 7**。
 * 2026-09-13 **第四刀**：`episodes` 并入 ledger（保留期改由按 type 裁剪承担）⇒ 事件流 **7 → 6**。
 * 2026-09-13 **第五刀**：`mcl-audit` 并入 ledger（type=mcl.*；两个读取者改双源读）⇒ 事件流 **6 → 5**。
 * 2026-09-13 **补域口径**：`access-real`/`ring-events` 在**记忆库**（bank）而 ledger 在 **suite 知识区** ⇒
 *   **跨域并入是语义错误**（数据属库，与运行时台账分域）⇒ 棘轮只数 **suite 域事件流** = **3**（目标 1）。
 * 2026-09-13 **第六刀**：`distill-audit` 并入 ledger（type=audit.*；6 个读侧改**双源读**）⇒ suite 域事件流 **3 → 2**。
 * 2026-09-13 **第七刀（判定：不并）**：`distill-watermark` 读侧是 `map.set(sessionId,o)` ⇒ **键控语义**（取每键最后一条），
 *   与"事件流"（读侧逐条）**不同族**；且热路径全量读（D7）。⇒ 归 **keyed** 族，**不并入**。
 *   ⇒ **suite 域事件流 = 1（= ledger）· DS4 目标达成**。 */
const BASELINE = 1

/**
 * 从源码里抽出**引号内的 `.jsonl` 字面量**（**先剥注释**）。
 * ⚠ 只认**引号包裹的字面量**——不按"名字像 jsonl"做推导：本会话已实证
 *   「按名字推导 = 第二份事实源」，与真实用法一漂移就静默漏计/误计。
 * ⚠ **必须剥注释**（仓内先例：`check-carriers` 的「先剥注释再匹配」）：否则文档里提到的
 *   `events.jsonl`（DS4 的**目标名**，写在注释里）会被当成"未登记的观测流"⇒ 门禁对文档开火。
 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}
function streamsIn(src) {
  const out = new Set()
  for (const m of stripComments(src).matchAll(/['"`]([A-Za-z0-9._-]+\.jsonl)['"`]/g)) out.add(m[1])
  return out
}

if (process.argv.includes('--selftest')) {
  const cases = [
    ["const f = join(k, 'audit', 'mcl-audit.jsonl')", ['mcl-audit.jsonl']],
    ["readFileSync('ledger.jsonl')", ['ledger.jsonl']],
    ['const a = "ring-events.jsonl"\nconst b = `score-shadow.jsonl`', ['ring-events.jsonl', 'score-shadow.jsonl']],
    ["// 注释里提到 'events.jsonl' 但它是文档，不是代码", []],
    ["/* 块注释里的 'mcl-audit.jsonl' 同样不算 */", []],
    ["const s = 'session.jsonl'", ['session.jsonl']],
  ]
  let bad = 0
  for (const [src, want] of cases) {
    const got = [...streamsIn(src)].sort()
    const okCase = JSON.stringify(got) === JSON.stringify([...want].sort())
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} 抽 ${JSON.stringify(want)} → 得 ${JSON.stringify(got)}`)
  }
  console.log(bad ? `\nFAIL（${bad} 例）` : '\nPASS（观测流扫描器自证可用）')
  process.exit(bad ? 1 : 0)
}

/* `--selftest-parsability`：**反例样本自证**（读数口径四件套的第四件 —— 无此则该断言恒真）。
 * ⚠ 与主扫描**共用同一函数** `scanJsonlText`（自证验的必须是运行态那份逻辑，不是复制品）。 */
if (process.argv.includes('--selftest-parsability')) {
  const cases = [
    // [描述, 输入, 期望 {nonEmpty, ok, bad, hasBom}]
    ['正例·纯 JSON 两行', '{"a":1}\n{"b":2}\n', { nonEmpty: 2, ok: 2, bad: 0, hasBom: false }],
    ['**反例**·一行乱码 ⇒ 失败必须 = 1 且成功 = n−1', '{"a":1}\n鏈嶅姟涓庨噸鍚害鏉?\n{"b":2}\n', { nonEmpty: 3, ok: 2, bad: 1, hasBom: false }],
    ['**反例**·BOM 空文件', '\uFEFF', { nonEmpty: 0, ok: 0, bad: 0, hasBom: true }],
    ['正例·带 BOM 且剥后全可解析', '\uFEFF{"a":1}\n{"b":2}\n', { nonEmpty: 2, ok: 2, bad: 0, hasBom: true }],
    ['正例·空行不是坏行', '{"a":1}\n\n\n{"b":2}\n', { nonEmpty: 2, ok: 2, bad: 0, hasBom: false }],
    ['正例·人读行豁免 JSON 判', '[segment 1] route=memory appends=2\n', { nonEmpty: 1, ok: 1, bad: 0, hasBom: false }, { lineOnly: true }],
  ]
  let bad = 0
  for (const [label, input, want, opts] of cases) {
    const got = scanJsonlText(input, opts || {})
    const okCase = got.nonEmpty === want.nonEmpty && got.ok === want.ok && got.bad === want.bad && got.hasBom === want.hasBom
    if (!okCase) bad++
    console.log(`${okCase ? '✅' : '❌'} ${label} → ${JSON.stringify({ nonEmpty: got.nonEmpty, ok: got.ok, bad: got.bad, hasBom: got.hasBom })}`)
  }
  // **必须有一条真反例**（否则本自证自身也是"恒真断言"）
  const hasNegative = cases.some(([l]) => l.includes('反例'))
  if (!hasNegative) { bad++; console.log('❌ 自证不含反例样本 —— 恒真断言不得进验收') }
  console.log(bad ? `\nFAIL（${bad} 例）` : `\nPASS（可解析性扫描器自证可用：${cases.length} 例，含反例）`)
  process.exit(bad ? 1 : 0)
}

// ── `--shape`：**形态审计**（DS4 合并的前置）────────────────────────────────────
// 为什么：DS4 要把 13 条流并成 1 条，但合并**前提是形态一致**——否则并进去之后无法区分记录。
// 实测（2026-09-13）：判别字段三种写法（`ledger.type` / `mcl.distill.activation.kind` / `score-shadow.mode`），
//   会话键 `sid` vs `sessionId`，watermark 连判别字段都没有 ⇒ **不是机械可并**。
// 本模式读**真实数据**（不是源码字面量）给出逐流形态表 + 「可并入 / 需改造」计数。
// **报告态（exit 0）**：这是待办清单，不是当前红灯；改造逐条做、门禁随棘轮收紧。
if (process.argv.includes('--shape')) {
  const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
  const AUD = join(HOME, 'suite', 'knowledge', 'audit')
  let mergeable = 0, needWork = 0, noData = 0, stateRows = 0
  console.log(`观测流**形态审计**（真实数据） · ${AUD}`)
  console.log('  流名                          家族   行数  解析失败  时间字段  判别字段  会话键')
  for (const [name, kind] of STREAMS) {
    const p = join(AUD, name)
    if (!existsSync(p)) { noData++; console.log(`  ${name.padEnd(28)} ${kind.padEnd(5)} ——    条件写入；本机暂无数据（无法核对形态）`); continue }
    const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim())
    let bad = 0
    const keySets = []
    for (const l of lines) { try { keySets.push(Object.keys(JSON.parse(l))) } catch { bad++ } }
    const has = (k) => keySets.filter((ks) => ks.includes(k)).length
    const time = has('at') === keySets.length && keySets.length > 0 ? `at(${has('at')})` : `⚠ ${has('at')}/${keySets.length}`
    const disc = has('type') > 0 ? `type(${has('type')})` : has('kind') > 0 ? `kind(${has('kind')})` : has('mode') > 0 ? `mode(${has('mode')})` : '⚠ 无'
    const sess = has('sid') > 0 ? `sid(${has('sid')})` : has('sessionId') > 0 ? `sessionId(${has('sessionId')})` : '—'
    // 形态判据只对**事件流**成立（状态表整体重写、按 key upsert，"能不能并入 append-only 台账"对它不适用）
    if (kind === 'state') { stateRows++; console.log(`  ${name.padEnd(28)} ${kind.padEnd(5)} ${String(lines.length).padStart(5)}  ${String(bad).padStart(7)}  ${time.padEnd(9)} ${disc.padEnd(9)} ${sess}  · 状态表（不参与合并目标）`); continue }
    const ok = bad === 0 && !time.startsWith('⚠') && !disc.startsWith('⚠')
    if (ok) mergeable++; else needWork++
    console.log(`  ${name.padEnd(28)} ${kind.padEnd(5)} ${String(lines.length).padStart(5)}  ${String(bad).padStart(7)}  ${time.padEnd(9)} ${disc.padEnd(9)} ${sess}  ${ok ? '✅ 可并入' : '⚠ 需改造'}`)
  }
  console.log(`\n汇总：**事件流** 可并入 ${mergeable} · 需改造 ${needWork} · 状态表 ${stateRows} · 无数据 ${noData}（共 ${STREAMS.length}）`)
  console.log('改造口径（逐条做、做完把 `check-observability` 基线收紧一格）：')
  console.log('  · 判别字段统一为 `type`（现为 kind/mode/无）· 时间统一 `at` · 会话键统一 `sid`')
  console.log('  · 形态一致后，合并 = 追加到同一文件 + 读侧按 `type` 过滤（消费方逐条切）')
  console.log('  · ⚠ 本表读的是**历史数据**：代码侧修复（信封/判别字段）只对**之后**的写入生效 —— 故"需改造"计数会随新数据自然下降，不是没修。')
  process.exit(0)
}

/** 单件 jsonl 的可解析性扫描（**单一实现**：主扫描与 `--selftest` 反例共用同一函数 —— 否则自证验的是另一份逻辑）。
 *  返回：`{ nonEmpty, ok, bad, hasBom, firstBad, lineOnly }`。
 *  · 剥首字节 BOM（`EF BB BF` ⇒ `charCodeAt(0) === 0xFEFF`）后再解析，并**如实报出** `hasBom`；
 *  · 空行不计入失败（空行是排版，不是坏行）；
 *  · `lineOnly`（`distill-manifest`）按行可读性判，不做 `JSON.parse`。 */
function scanJsonlText(raw, opts = {}) {
  const hasBom = raw.length > 0 && raw.charCodeAt(0) === 0xFEFF
  const body = hasBom ? raw.slice(1) : raw
  const nonEmptyLines = body.split(/\r?\n/).filter((l) => l.trim() !== '')
  let ok = 0, bad = 0, firstBad = null
  for (const l of nonEmptyLines) {
    if (opts.lineOnly) { ok++; continue }
    try { JSON.parse(l); ok++ } catch { bad++; if (firstBad === null) firstBad = l }
  }
  return { nonEmpty: nonEmptyLines.length, ok, bad, hasBom, firstBad, lineOnly: !!opts.lineOnly }
}

if (process.argv.includes('--parsability')) {
  /* ══ 两库根 jsonl 的**可解析性强制项**（R2「读数口径四件套」）══════════════════════════
   * 判因（2026-09-20 实测 · 一次真实事故）：用 PowerShell `Get-Content`（**默认编码**，PS 5.1）读
   *   `suite/knowledge/audit/sleep-reports.jsonl`，**111 行**因中文段落名乱码致 JSON 引号被吃掉 ⇒
   *   **解析失败被静默丢弃**，报出的 `impact` 行数 = **246**；改显式 UTF8 重读 ⇒ 同一文件 362 行
   *   **全部解析成功**、`impact` = **357**。**同一文件、同一机器、同一会话，仅读取编码不同，分母少 23%**。
   *   而该文件是否决门3/门4 的**唯一事实源** ⇒ 错误读数会直接生成错误结论与假工作量。
   *   ⚠ 该规则本仓记忆库早有（`notes/lessons.md §编码坑`：「无 BOM 的 UTF-8 在 PowerShell 5.1 下按 GBK 解码」）
   *     —— 属「**已知规则在测量点未被强制执行**」，故只能靠机检兜住（本模式即该强制执行点）。
   *
   * 口径（**四件套**：谓词 + 分子/分母 + **解析失败行数** + 反例样本）：
   *   · 读取一律**显式 utf8**（`readFileSync(p,'utf8')` / `readAllLines(...,UTF8)`）；
   *   · **成功行与失败行两数同报**，失败 > 0 ⇒ 该文件读数判「**不可用**」；
   *   · 不按「空行」计入失败（空行不是坏行，是排版）。
   *
   * **两档判定**（2026-09-20 实测后分级，理由写在下面，不是为放水）：
   *   · **硬门**：剥掉首行 BOM 后**仍解析失败** ⇒ exit 1。这是真损坏，无标准一行修复，必须修。
   *   · **报告态**：文件带 **UTF-8 BOM**（首字节 `EF BB BF`）⇒ 只 ⚠ 报出**件名与行号**，不判红。
   *     理由：① BOM 有标准、无歧义的修复（剥首字节），且**本件自己已剥** ⇒ 不构成"行丢失"；
   *     ② 实测全库**仅 1 件**（`audit/secret-redaction-log.jsonl`，由 agent 手工落盘、**全仓零消费者**）
   *        ⇒ 属**潜在**风险（任何按 `JSON.parse(行)` 直读的消费方会丢首行），非当前故障；
   *     ③ 该文件在**审计台账**域，改动它属 R3（改真源语义）须具名授权 ⇒ 本件**不得替它做数据修复**。
   *     ⚠ 但**必须可见**：本项把 BOM 件逐件列出 —— 「降为报告态」不等于「不报」。
   *
   * 扫描面 = **两库根**（此前只扫 `suite/knowledge/audit`，库侧 4 个受审 jsonl 无解析失败账）：
   *   · suite 根 = `<DSH_HOME>/suite/knowledge`（含 `audit/`，含 `distill-manifest/<sid>.jsonl`）；
   *   · bank  根 = `memoryLibRoot()`（含 `audit/`、`.records/`）。
   *
   * ⚠ 已知豁免：`distill-manifest/<sid>.jsonl` **不是 JSONL**（是 `[segment N] route=… topics=…` 的
   *   人读行，`distill-infra#manifest` 直写字符串），故按**行可读性**判（非空行数 == 文件行数），
   *   不按 `JSON.parse` 判。**豁免必须写明理由，不许默默略过** —— 与上方 EXEMPT 表同纪律。
   * 反例样本：构造一行乱码 ⇒ 失败计数必须 = 1 且成功行 = n−1；构造首行 BOM ⇒ 必须被剥且计入 BOM 件数。 */
  const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
  const roots = [
    { name: 'suite', root: join(HOME, 'suite', 'knowledge') },
    { name: 'bank', root: process.env.MEMORY_ROOT || join(HOME, 'skills', 'managing-memory') },
  ]
  /** 非 JSONL 的人读行流（按行可读性判；豁免须写明理由） */
  const LINE_ONLY = /[\\/]distill-manifest[\\/]/
  const walk = (dir, out = []) => {
    if (!existsSync(dir)) return out
    let ents
    try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
    for (const e of ents) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p)
    }
    return out
  }
  console.log('两库根 jsonl **可解析性**（读数口径四件套：谓词 + 分子/分母 + 解析失败行数 + 反例样本）')
  console.log('  文件                                                          行数   成功   失败  判定')
  let files = 0, unusable = 0, totalBad = 0, bomFiles = 0
  const exemplars = []
  const bomList = []
  for (const { name, root } of roots) {
    for (const p of walk(root).sort()) {
      files++
      let raw
      try { raw = readFileSync(p, 'utf8') } catch { unusable++; totalBad++; console.log(`  ${p.padEnd(62)}   ——   ——   ——  ❌ 读取失败`); continue }
      const rel = p.replace(root, name)
      const r = scanJsonlText(raw, { lineOnly: LINE_ONLY.test(p) })
      const hasBom = r.hasBom
      if (hasBom) { bomFiles++; bomList.push(rel) }
      if (r.bad > 0) { unusable++; totalBad += r.bad; if (exemplars.length < 3) exemplars.push({ p: rel, l: r.firstBad }) }
      const tag = r.bad > 0
        ? '❌ **读数不可用**'
        : (r.bad === 0 && r.lineOnly ? '✅ 人读行（豁免 JSON 判）' : (hasBom ? '⚠ 可解析（**带 BOM**）' : '✅ 可解析'))
      console.log(`  ${rel.padEnd(62)} ${String(r.nonEmpty).padStart(5)} ${String(r.ok).padStart(6)} ${String(r.bad).padStart(6)}  ${tag}`)
    }
  }
  console.log(`\n汇总：文件 ${files} · 解析失败件数 ${unusable} · 失败行合计 ${totalBad} · **带 BOM 件数 ${bomFiles}**`)
  for (const e of exemplars) console.log(`  · 失败样本（${e.p}）：${String(e.l).slice(0, 120)}`)
  for (const b of bomList) console.log(`  · ⚠ 带 UTF-8 BOM（首行剥 BOM 后可解析；**任何直读 JSON.parse(行) 的消费方会丢首行**）：${b}`)
  if (unusable > 0) {
    console.log(`\n❌ FAIL：${unusable} 件读数**真损坏**（剥 BOM 后仍不可解析）—— 不得据其下任何结论；改用显式 utf8 重读后再判`)
    process.exit(1)
  }
  if (bomFiles > 0) {
    console.log(`\n✅ PASS（硬门）：无真损坏（失败 ${unusable} 件）。**但 ${bomFiles} 件带 BOM，见上方 ⚠** —— 属潜在风险，非当前故障；`)
    console.log(`   本件已剥首字节故不判红；⚠ **BOM 文件在审计台账域，数据修复属 R3 须具名授权，本件不代做**。`)
    process.exit(0)
  }
  console.log('✅ PASS：两库根 jsonl 全部可解析且失败行 = 0、无 BOM（读数口径四件套的「解析失败行数」项成立）')
  process.exit(0)
}

const files = [
  ...(existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith('.ts')).map((f) => join(SRC, f)) : []),
  ...(existsSync(SCRIPTS) ? readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs')).map((f) => join(SCRIPTS, f)) : []),
]
const seen = new Map() // 流名 → 引用它的文件数（全部）
const seenInSrc = new Map() // 仅 src/**（**运行时**写出的流）
for (const p of files) {
  const isSrc = p.startsWith(SRC)
  for (const s of streamsIn(readFileSync(p, 'utf8'))) {
    seen.set(s, (seen.get(s) ?? 0) + 1)
    if (isSrc) seenInSrc.set(s, (seenInSrc.get(s) ?? 0) + 1)
  }
}

const registered = new Set(STREAMS.map(([n]) => n))
// **棘轮只数 `event` 且 `suite` 域**（2026-09-13 补域口径）：bank 域与 suite 台账**分域**，跨域并入是语义错误；
//   状态表是投影，不参与该目标。三族各自打印，便于人核（也防"数字好看"）。
const eventStreams = STREAMS.filter(([, k, , d]) => k === 'event' && d === 'suite')
const keyedLogs = STREAMS.filter(([, k]) => k === 'keyed')
const bankEvents = STREAMS.filter(([, k, , d]) => k === 'event' && d === 'bank')
const stateTables = STREAMS.filter(([, k]) => k === 'state')
let bad = 0
console.log('观测流注册表 · 目标：**suite 域「事件流」→ 1**（事件＝读侧逐条语义；键控/库域/状态表各自成族）')
for (const [name, kind, why, domain] of STREAMS) {
  const refs = seen.get(name) ?? 0
  const stale = refs === 0
  const tag = kind === 'event' ? (domain === 'suite' ? '事件·suite' : '事件·bank ') : kind === 'keyed' ? '键控·suite' : '状态表  '
  if (stale) console.log(`  ⚠ [${tag}] ${name.padEnd(28)} 注册但源码中查不到（陈旧登记，应清理或改名）· ${why}`)
  else console.log(`  · [${tag}] ${name.padEnd(28)} 引用 ${refs} 处 · ${why}`)
}

// **口径分档（2026-09-13 实证修正）**：观测流的定义是「**运行时（src）写出**的 append-only 流」。
//   `scripts/` 里的 `.jsonl` 字面量多为**消费者**或**测试夹具**（实测：本门首版把测试夹具 `wm.jsonl`
//   判成"未登记观测流" —— 门禁没错，但口径过宽）。故：
//     · src 出现未登记流 ⇒ **FAIL**（运行时新增观测面，必须登记）；
//     · scripts 出现未登记流 ⇒ 只报 ⚠（消费/夹具，不判红）。
const unlisted = [...seenInSrc.keys()].filter((n) => !registered.has(n) && !EXEMPT.has(n)).sort()
const unlistedScripts = [...seen.keys()].filter((n) => !registered.has(n) && !EXEMPT.has(n) && !seenInSrc.has(n)).sort()
const exempted = [...seen.keys()].filter((n) => EXEMPT.has(n)).sort()
for (const n of unlisted) { bad++; console.log(`  ❌ 未登记的观测流（src 运行时写出）：${n}（新增观测流须在 STREAMS 登记并说明为何不能并入单一事件源）`) }
for (const n of unlistedScripts) console.log(`  · ⚠ scripts 引用了未登记名：${n}（消费/夹具；非运行时流，不判红——若确为运行时写出，请移入 src 并登记）`)
for (const n of exempted) console.log(`  · 豁免 ${n.padEnd(24)} —— ${EXEMPT.get(n)}`)

// **legacy 流引用清单棘轮**（2026-09-13 立）：
//   动机（**实证**）：DS4 第六刀改落点后，`test-event-envelope` 仍读 legacy `distill-audit.jsonl`
//   ⇒ **ENOENT 崩了才暴露**。"改了落点、忘了消费方"这一整类问题当时只能靠崩来发现。
//   本段：把**谁还在引用已并入的 legacy 文件**列出来，并要求引用集合 ⊆ **显式白名单**（新增引用即 FAIL）。
//   白名单须写明理由（多为"双源读的那一处实现"与"写入侧的历史路径常量"）。
const LEGACY_REF_ALLOW = new Map([
  // 自身：注册表必须写出流名 ⇒ 恒允
  ['score-shadow.jsonl', ['scripts/check-observability.mjs', 'scripts/memory-reconcile.mjs', 'src/panel-arch.ts' /* 面板仅展示该 legacy 流是否存在，不读内容 */, 'scripts/ui-geo-regress.mjs' /* 夹具模拟端点返回的 legacy 清单，不读文件 */]], // memory-reconcile：双源读（历史不丢）
  ['activation-shadow.jsonl', ['scripts/check-observability.mjs', 'src/panel-arch.ts' /* 面板仅展示该 legacy 流是否存在，不读内容 */, 'scripts/ui-geo-regress.mjs' /* 夹具模拟端点返回的 legacy 清单，不读文件 */]], // 仅注册表；已无其它读取者
  ['stub.jsonl', ['scripts/check-observability.mjs', 'scripts/test-event-envelope.mjs', 'src/panel-arch.ts' /* 面板仅展示该 legacy 流是否存在，不读内容 */, 'scripts/ui-geo-regress.mjs' /* 夹具模拟端点返回的 legacy 清单，不读文件 */]], // 测试夹具路径
  ['episodes.jsonl', ['scripts/check-observability.mjs', 'scripts/test-event-envelope.mjs', 'src/panel-arch.ts' /* 面板仅展示该 legacy 流是否存在，不读内容 */, 'scripts/ui-geo-regress.mjs' /* 夹具模拟端点返回的 legacy 清单，不读文件 */, 'scripts/migrate-episodes.mjs' /* P5（2026-09-14）**一次性迁移器**：把孤儿情景数据迁成 episode 记录；**只读**该 legacy 流、不写它，迁完即失效（原文件保留留档） */]], // 测试夹具路径
  ['mcl-audit.jsonl', [
    'scripts/check-observability.mjs',
    'scripts/mcl-calibrate.mjs', // 双源读（标定）
    'scripts/mcl-compliance.mjs', // 双源读（合规率）
    'scripts/recall-diagnose.mjs', // S4-6′（2026-09-14）双源读（零命中归因；与 mcl-calibrate 同口径：legacy ∪ 台账）
    'scripts/test-mcl.mjs', // 场景 N：断言默认钩子**不再**写 legacy
    'src/panel-observe.ts', // mclAuditRecent：双源读
  , 'src/panel-arch.ts' /* 面板仅展示该 legacy 流是否存在，不读内容 */, 'scripts/ui-geo-regress.mjs' /* 夹具模拟端点返回的 legacy 清单，不读文件 */]],
  ['distill-audit.jsonl', [
    'scripts/check-observability.mjs',
    'scripts/memory-reconcile.mjs', // 双源读
    'scripts/test-event-envelope.mjs', // 夹具路径常量
    'src/distill-paths.ts', // **写入侧的 legacy 路径常量**（读侧以它为锚推导台账路径）
    'src/panel-memory.ts', // 双源读（蒸馏统计/成长/周 diff）
    'src/panel-observe.ts', // 双源读（深睡明细）
  , 'src/panel-arch.ts' /* 面板仅展示该 legacy 流是否存在，不读内容 */, 'scripts/ui-geo-regress.mjs' /* 夹具模拟端点返回的 legacy 清单，不读文件 */]],
  ['judgement-ledger.jsonl', [
    'scripts/check-observability.mjs',
    'scripts/criteria-audit.mjs', // v2.1 前的兼容读
    'scripts/criteria-report.mjs', // 同上
    'scripts/memory-reconcile.mjs', // 同上
    'src/panel-observe.ts', // 同上（台账优先、legacy 兜底）
  , 'src/panel-arch.ts' /* 面板仅展示该 legacy 流是否存在，不读内容 */, 'scripts/ui-geo-regress.mjs' /* 夹具模拟端点返回的 legacy 清单，不读文件 */]],
])
{
  const refsOf = new Map()
  for (const p of files) {
    const text = stripComments(readFileSync(p, 'utf8'))
    for (const name of LEGACY_REF_ALLOW.keys()) if (text.includes(name)) {
      const arr = refsOf.get(name) || []
      arr.push(p.split(/[\\/]/).slice(-2).join('/'))
      refsOf.set(name, arr)
    }
  }
  console.log('legacy 流引用清单（棘轮：新增引用即 FAIL）')
  for (const [name, allow] of LEGACY_REF_ALLOW) {
    const refs = (refsOf.get(name) || []).sort()
    const extra = refs.filter((r) => !allow.includes(r))
    if (extra.length) { bad++; console.log(`  ❌ ${name} 出现**未登记引用**：${extra.join(' · ')}（若确为双源读/写入侧常量，请加入 LEGACY_REF_ALLOW 并写明理由）`) }
    else if (refs.length) console.log(`  · ${name} ← ${refs.join(' · ')}`)
    else console.log(`  · ${name} ← （无引用）`)
    // 过期白名单项（引用了但已不再出现）也提示，防白名单腐化
    const stale = allow.filter((a) => !refs.includes(a))
    if (stale.length) console.log(`    ⚠ 白名单过期项（已无引用）：${stale.join(' · ')}`)
  }
}

//   曾在 **6 处 / 5 个模块**出现（distill-infra ×4 · mcl · deepsleep-tree · treeops ×2 · vec）——
//   而它的展开顺序允许调用方用 `at: undefined` 覆盖注入值，`JSON.stringify` 又**静默丢弃** undefined 键
//   ⇒ 行里没有 `at`（实测 `distill-audit` 930 行里 1 行如此）。现全部收敛到 `src/event-envelope.ts`；
//   本断言把「源码中不再出现原始写法」钉住（**复现即 FAIL**）。
{
  const raw = files.filter((p) => /JSON\.stringify\(\{\s*at: new Date\(\)\.toISOString\(\),\s*\.\.\./.test(stripComments(readFileSync(p, 'utf8'))))
  if (raw.length) { bad++; console.log(`  ❌ 原始信封写法复现于 ${raw.length} 个文件：${raw.map((p) => p.split(/[\\/]/).pop()).join(', ')}（应统一走 src/event-envelope.ts 的 envelopeEvent）`) }
  else console.log('  ✅ 统一事件信封为**单一实现**（源码中无原始 `{ at, ...o }` 写法）')
}

// 2026-09-14（P7 · 治 D2）：**审计行必须显式标明阶段**。
//   动机（实证）：`mcl-step` 的 4 个审计站点里，注入阶段带 `injected`、而**合规阶段的 3 处不带任何体量字段**。
//   下游分析用 `Number(r.injected) > 0` 判断"是否注入"时，`undefined` 被**静默强转为 0** ⇒
//   实测把 25 条「材料确实在场、只是本步在审合规」的行误读成「零注入」，进而推出
//   「约一半 turn 首步零材料」这个**完全错误的结论**（真实参与率 130/158 = 82.3%）。
//   ⇒ 字段缺失不得再被读成零：每条 mcl-step 必须自带 `phase`（inject|compliance）。
{
  const src = stripComments(readFileSync(new URL('../src/mcl.ts', import.meta.url), 'utf8'))
  const parts = src.split("kind: 'mcl-step'").slice(1)
  const noPhase = parts.filter((chunk) => !/phase:/.test(chunk.slice(0, 300)))
  if (noPhase.length) { bad++; console.log(`  ❌ mcl-step 审计行缺 phase（${noPhase.length}/${parts.length} 处）——字段缺失会被下游读成「零」，实测已致一次错误结论`) }
  else console.log(`  ✅ mcl-step 审计行全部带 phase（${parts.length} 处：inject|compliance —— 阶段显式，杜绝「字段缺失 = 零」的误读）`)
}

// 2026-09-14（P7 · 治 D8/C2）：**「没跑」不得报成「通过」**。
//   动机（实证）：`sleep-selfcheck` 的裁决原为 `failed.length ? 'warn' : (adjustments.length ? 'adjust' : 'ok')`
//   —— **完全忽略 `skipped`**。而库侧三项需 `--repo`、不传时**恒跳过**，`shadow` 在库内布局下恒 exit 3 跳过
//   ⇒ 实测「跑了 2 项且都过」与「六项全绿」都报 `ok`（`ledger.jsonl` 里 107 行 `check.sleep` 全 `ok`）。
//   该缺陷早在 `deliverables/engineering-assurance/inject-recall-chain-2026-09-11.md` 第 9 项被记为
//   「verdict:\"ok\" 与缺陷并存 ⇒ 该 verdict 未反映链路健康」，记录后长期未修。
//   ⇒ 本断言钉住：裁决表达式**必须显式引用 `skipped`**（引入 `partial`），且必须输出 `coverage`。
{
  const sc = stripComments(readFileSync(new URL('../scripts/sleep-selfcheck.mjs', import.meta.url), 'utf8'))
  const verdictLine = (sc.match(/const verdict = [^\n]*/) || [''])[0]
  const hasSkipped = /skipped\.length/.test(verdictLine)
  const hasPartial = /'partial'/.test(verdictLine)
  const hasCoverage = /coverage:\s*\{/.test(sc)
  if (!hasSkipped || !hasPartial || !hasCoverage) {
    bad++
    console.log(`  ❌ sleep-selfcheck 裁决未反映「未跑」：skipped=${hasSkipped} partial=${hasPartial} coverage=${hasCoverage} ⇒ 「没跑」会被读成「通过」（已记录三周未修的已知缺陷）`)
  } else {
    console.log('  ✅ sleep-selfcheck 裁决**区分「未跑」**（`partial` = 有跳过且无失败）+ 输出 `coverage`（verdict=ok 只在 ran===total 时可信）')
  }
}

// 棘轮只对**事件流**计数（状态表是投影，不参与"合并为单一事件源"的目标）；两个数都打印，便于人核。
const cur = eventStreams.length
if (cur > BASELINE) { bad++; console.log(`\n❌ 事件流 ${cur} > 基线 ${BASELINE}（新增事件流须说明为何不能并入 ledger）`) }
else if (cur < BASELINE) console.log(`\n⚠ suite 域事件流 ${cur} < 基线 ${BASELINE} —— **请把基线收紧到 ${cur}**（合并后必须降基线）`)
else if (cur === 1) console.log(`\n✅ **suite 域事件流 ${cur} = 1（DS4 目标达成：单一事件源）** · 键控日志 ${keyedLogs.length}（读侧键控语义，不并入）· 库域事件流 ${bankEvents.length}（分域自持）· 状态表/投影 ${stateTables.length}`)
else console.log(`\n✅ suite 域事件流 ${cur}（= 基线；目标 1）· 键控日志 ${keyedLogs.length} · 库域事件流 ${bankEvents.length} · 状态表/投影 ${stateTables.length}`)

if (bad) { console.log(`\nFAIL（${bad} 项）`); process.exit(1) }
console.log('PASS（观测流已登记 · 未新增未登记流）')
