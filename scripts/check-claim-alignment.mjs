#!/usr/bin/env node
// check-claim-alignment.mjs — IR1 附册（F1/F2/F3）：**自述 ↔ 实况**对齐（2026-09-18）
//
// 判因（**实测，不是假想**）：本仓源码注释里自称"未接线 / 无消费者"的地方，调用图与审计行证明
//   **早已接线**——首轮 IR1 审查就被这类注释骗过（把已接线的归因/收益链路判成"未接线"）。
//   根因：**注释可以独立于事实书写，且没有任何门禁对齐它**。故立此门。
//
// 三条判据（对应验收册 F）：
//   **F1** 源码中「未接线 / 无消费者」类断言条数 **==** 注册表 `wiring.pending` 条数（现 0 == 0）；
//   **F2** `compliant` 字段**要么真、要么无** —— 源码不得再发布该键（改名为诚实的 `topicEcho`），
//          若将来重新发布，则真机台账必须出现 `true > 0`（否则又是"恒 false 的假信号"）；
//   **F3** 归因/收益链路**真机可达**：调用点必须在源码里（静态断言）+ 台账有真机行（证据打印）。
//
// 用法：node scripts/check-claim-alignment.mjs [--selftest]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 「接线自称」词表（F1）——只收**断言接线状态**的措辞；"条件式说明"（如"未接线时行为不变"）由豁免表处理 */
const CLAIM_RE = /(尚未接线|未接线|无消费者|没有消费者|无人消费|未被消费)/
/**
 * **豁免表**（每条必须写清理由；**过期即红** —— 豁免项不再匹配任何行 ⇒ 说明它已 stale，必须删）。
 * 判据：这些行**不是对本模块接线状态的断言**，而是①描述门禁要检测的形态 ②条件式/数据条件表述。
 */
const EXEMPT = [
  { mod: 'content-types.ts', re: /reachable:true.*未接线/, why: '描述**门禁要检测的假绿形态**本身（"契约声明 reachable 但通路未接线"），非对本模块的断言' },
  { mod: 'distill-infra.ts', re: /未接线时行为与改前/, why: '条件式说明（开关关闭态的行为等价），非断言' },
  { mod: 'distill-watermark.ts', re: /未被消费/, why: '描述**数据条件**（序号挪位后的事件未被消费），非接线断言' },
  { mod: 'panel-observe.ts', re: /通路未接线清单/, why: '描述面板暴露的**诊断字段名**（假绿检测项），非断言' },
]

/** 递归列 `src/` 下所有 `.ts`（排除生成物：生成物禁手写，改它没有意义） */
const srcFiles = () => {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.ts') && e.name !== 'criteria.generated.ts') out.push(p)
    }
  }
  walk(join(root, 'src'))
  return out
}

/** F1 的核心计数（**导出以便 --selftest 用同一实现**）：返回未豁免的断言清单 */
export function claimsIn(files) {
  const hits = []
  for (const f of files) {
    const mod = f.mod || f.split(/[\\/]/).pop()
    const lines = String(f.text ?? readFileSync(f, 'utf8')).split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!CLAIM_RE.test(lines[i])) continue
      const ex = EXEMPT.find((e) => (e.mod === mod) && e.re.test(lines[i]))
      if (ex) continue
      hits.push({ mod, line: i + 1, text: lines[i].trim().slice(0, 120) })
    }
  }
  return hits
}

// ── `--selftest`：**先红**证明（不读真实源码的豁免面，直接喂合成样本）──
if (process.argv.includes('--selftest')) {
  console.log('check-claim-alignment · --selftest（判据自证）')
  const fake = [{ mod: '(selftest)', text: '// 本件当前只实现纯函数，LLM 真实调用点尚未接线' }]
  ok(claimsIn(fake).length === 1, '① 合成断言「尚未接线」⇒ 计数 1（**这正是本门要抓的形态**）')
  const clean = [{ mod: '(selftest)', text: '// 接线状态以调用点为准（见 scripts/check-claim-alignment.mjs）' }]
  ok(claimsIn(clean).length === 0, '② 合规写法（指向调用图/门禁）⇒ 计数 0（**不误报**）')
  const exempt = [{ mod: 'content-types.ts', text: '   * 契约声明 reachable:true，但其判据对应的通路未接线或未登记。' }]
  ok(claimsIn(exempt).length === 0, '③ 豁免项仍按豁免处理（豁免表用**行级 re**，不是整文件豁免）')
  console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（判据双向可证）')
  process.exit(fail ? 1 : 0)
}

// ── 注册表：`wiring.pending` 是**接线的唯一登记口** ──
const critPath = join(root, 'skill', 'engine', 'criteria.json')
const criteria = existsSync(critPath) ? JSON.parse(readFileSync(critPath, 'utf8')) : {}
const pending = Array.isArray(criteria?.wiring?.pending) ? criteria.wiring.pending : null
if (pending === null) { console.log('❌ 注册表读取失败或缺 `wiring.pending`（本门的事实源不可缺）'); process.exit(1) }

console.log('IR1 附册 · 自述 ↔ 实况对齐')
console.log(`  注册表 wiring.pending = ${pending.length} 条${pending.length ? '（' + pending.map((p) => p.id || p).join(', ') + '）' : '（**零豁免：任何接线自称都必须能对上它**）'}`)

// ── F1 ──
const files = srcFiles()
const claims = claimsIn(files)
ok(claims.length === pending.length, `F1 源码接线自称 ${claims.length} 条 == 注册表 ${pending.length} 条`)
for (const c of claims) console.log(`      · ${c.mod}:${c.line}  ${c.text}`)
// 豁免表**过期即红**（否则它会悄悄变成"永久免检区"）
for (const e of EXEMPT) {
  const f = files.find((p) => p.endsWith(e.mod))
  const alive = f && e.re.test(readFileSync(f, 'utf8'))
  ok(!!alive, `F1′ 豁免项未过期：${e.mod} · ${e.why.slice(0, 40)}…`)
}

// ── F2 ──
{
  const writes = []
  for (const f of files) {
    const t = readFileSync(f, 'utf8')
    if (/compliant\s*:\s*(true|false)/.test(t)) writes.push(f.split(/[\\/]/).pop())
  }
  if (!writes.length) {
    ok(true, 'F2 `compliant` 键已停止发布（改名为诚实的 `topicEcho`）—— 字段**已删**分支')
  } else {
    const led = join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl')
    let yes = 0, no = 0
    try {
      for (const l of readFileSync(led, 'utf8').split('\n')) {
        if (l.includes('"compliant":true')) yes++
        else if (l.includes('"compliant":false')) no++
      }
    } catch { /* 台账不可读 ⇒ 计入下方判据（真阳性无法证实） */ }
    ok(yes > 0, `F2 仍发布 \`compliant\`（${writes.join(',')}）⇒ 台账须有真阳性（true=${yes} / false=${no}）`)
  }
}

// ── F3：调用点静态在场 + 真机证据（打印）──
{
  const run = existsSync(join(root, 'src', 'deepsleep-run.ts')) ? readFileSync(join(root, 'src', 'deepsleep-run.ts'), 'utf8') : ''
  // 只断言**真在调用链上**的符号（`agreementRate` 是供对账/测试的纯函数，不在运行链上 —— 不得写进本断言，
  // 否则就是把"库里有这个函数"当成"链路可达"，属本门最忌的那种假绿）。
  const need = ['buildAttributionRequest', 'parseAttribution', 'calibrationVerdictOf', 'samplesFromMclRows', 'judgeYieldRounds']
  const missing = need.filter((n) => !run.includes(n + '('))
  ok(!missing.length, `F3 归因/收益调用点在场（deepsleep-run.ts：${need.join(' / ')}）${missing.length ? ' 缺：' + missing.join(',') : ''}`)
  const led = join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl')
  let attr = 0, yld = 0
  try {
    const t = readFileSync(led, 'utf8')
    attr = (t.match(/"attributionVerdict"/g) || []).length
    yld = (t.match(/"yieldJudged"/g) || []).length
  } catch { /* 台账不可读 */ }
  console.log(`  真机证据（打印 · 台账 ${led}）：attributionVerdict 行 ${attr} · yieldJudged 行 ${yld}`)
  ok(attr + yld > 0, 'F3′ 台账含真机行（自述不得当证据：以调用图 + 审计行为准）')
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（自述 == 实况）')
process.exit(fail ? 1 : 0)
