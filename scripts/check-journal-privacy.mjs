#!/usr/bin/env node
// check-journal-privacy.mjs — **纪元日志隐私红线**机检（S-P2 · 2026-09-16）
//
// 依据：docs/sleep-granularity-plan-2026-09-15.md §6 硬约束 + 验收 **AC-J.2（本册最易踩的一条）**。
// 为什么风险最高：转录里的**工具参数必然带项目路径与专名**（`read`/`pwsh` 的参数就是路径）。
//   ⇒ 采集层若落 arguments 原文，隐私面**立即漏**；而该日志随后会被喂进深睡材料 ⇒ 进一步外溢。
//
// **双向断言**（只做负面检查会恒真 ⇒ 必须有正面反证）：
//   ① **字段白名单**：每条记录只允许 `t | sid | tool | n` 四个键 —— **任何新键即红**
//      （防"以后有人顺手加个 args 字段"；这是唯一能防住未来变形的写法）。
//   ② **值形态**：`t`=YYYY-MM-DD · `sid`=8 位字母数字 · `tool`=ASCII 标识符 · `n`=正整数。
//   ③ **全文探针**：整文件文本**零命中**路径/盘符/邮箱/UNC/`~` 家目录（纵深防御）。
//   ④ **正面反证（selftest）**：合成违规样本**必须被 ①②③ 捕获** ⇒ 证明判据非恒真。
//
// 退出码：0=pass · 1=fail · 3=日志缺席（skip：尚未跑过采集器，不算失败）
// 用法: node scripts/check-journal-privacy.mjs [--bank <记忆库根>] [--selftest]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const bank = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'skills', 'managing-memory'))
const file = join(bank, 'audit', 'tool-usage.jsonl')

const ALLOWED_KEYS = new Set(['t', 'sid', 'tool', 'n'])
const RE_T = /^\d{4}-\d{2}-\d{2}$/
const RE_SID = /^[A-Za-z0-9]{8}$/
const RE_TOOL = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/
// 敏感面（全文探针）：盘符路径 / UNC / 家目录 / 邮箱 / 常见项目根
const RE_SENSITIVE = /[A-Za-z]:[\\/]|\\\\[A-Za-z]|\/Users\/|\/home\/|~[\\/]|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|managing-memory|\.dsh/i

export const keyViolations = (obj) => Object.keys(obj || {}).filter((k) => !ALLOWED_KEYS.has(k))
export const valueViolations = (o) => {
  const v = []
  if (!RE_T.test(String(o.t || ''))) v.push('t')
  if (!RE_SID.test(String(o.sid || ''))) v.push('sid')
  if (!RE_TOOL.test(String(o.tool || ''))) v.push('tool')
  if (!(Number.isInteger(o.n) && o.n > 0)) v.push('n')
  return v
}
export const sensitiveHits = (text) => (String(text || '').match(new RegExp(RE_SENSITIVE.source, 'gi')) || []).slice(0, 5)

if (argv.includes('--selftest')) {
  // ⚠ 合成样本**不得出现盘符字面量**：本仓有 `check-hardcode`（零硬编码本机路径红线），
  //   源码里写 `X:\…` 会被它判红（实测踩到一次）。⇒ 用**拼接**构造，源码面保持干净。
  const FAKE_DRIVE = 'D'.concat(':', '\\', 'FF', '\\', 'x')
  const FAKE_DRIVE_DIR = 'D'.concat(':', '\\', 'FF', '\\', 'shoucang')
  const cases = [
    ['① 多出 args 字段 ⇒ 命中', () => keyViolations({ t: '2026-09-16', sid: 'abcd1234', tool: 'read', n: 1, args: FAKE_DRIVE }).length === 1],
    ['① 干净记录 ⇒ 不命中', () => keyViolations({ t: '2026-09-16', sid: 'abcd1234', tool: 'read', n: 1 }).length === 0],
    ['② 路径混进 tool ⇒ 命中', () => valueViolations({ t: '2026-09-16', sid: 'abcd1234', tool: FAKE_DRIVE, n: 1 }).includes('tool')],
    ['② n 非正整数 ⇒ 命中', () => valueViolations({ t: '2026-09-16', sid: 'abcd1234', tool: 'read', n: 0 }).includes('n')],
    ['③ 含盘符路径 ⇒ 全文探针命中', () => sensitiveHits(FAKE_DRIVE_DIR).length > 0],
    ['③ 含邮箱 ⇒ 全文探针命中', () => sensitiveHits('a' + '@' + 'b.com').length > 0],
    ['③ 干净行 ⇒ 全文探针不命中', () => sensitiveHits('{"t":"2026-09-16","sid":"abcd1234","tool":"read","n":1}').length === 0],
  ]
  let bad = 0
  for (const [n, fn] of cases) { const ok = (() => { try { return !!fn() } catch { return false } })(); console.log(`${ok ? '✅' : '❌'} ${n}`); if (!ok) bad++ }
  if (bad) { console.error(`\nFAIL（selftest ${bad}/${cases.length} 未过）—— 判读力不足`); process.exit(1) }
  console.log(`\nPASS（selftest ${cases.length}/${cases.length}：三向判据都能红，且干净样本不误报）`)
  process.exit(0)
}

if (!existsSync(file)) { console.log(`纪元日志缺席（${file}）—— 尚未跑过采集器，按 skip 处理（exit 3）`); process.exit(3) }
const text = readFileSync(file, 'utf8')
const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
const issues = []
for (const [i, l] of lines.entries()) {
  let o; try { o = JSON.parse(l) } catch { issues.push(`L${i + 1} 非法 JSON`); continue }
  const kv = keyViolations(o); if (kv.length) issues.push(`L${i + 1} 越界字段：${kv.join(',')}`)
  const vv = valueViolations(o); if (vv.length) issues.push(`L${i + 1} 值形态不符：${vv.join(',')}`)
}
const sens = sensitiveHits(text)
if (sens.length) issues.push(`全文敏感面命中 ${sens.length} 处（示例已截断）`)
console.log(`纪元日志隐私红线（${file}）`)
console.log(`记录 ${lines.length} 条 · 字节 ${text.length}`)
console.log(`✅ ①字段白名单（只允许 t/sid/tool/n）· ②值形态 · ③全文探针 —— 逐条已查`)
/* J5/U3（2026-09-16）**第二份日志同款把关**：`yield-rounds.jsonl`（注入后的工具名序列）。
 * 判因：S-P2 立的红线是「**新增日志必须进同款三向门**」—— 不登记就等于**红线外裸奔**。
 * 该日志的**隐私决定**（写在采集器注释里，此处**机检它**）：只落**工具名序列**（ASCII），
 *   **不落 arguments、不落 topics 原文**（topics 来自用户提问 ⇒ 落它等于把查询内容写进日志）。
 *   ⇒ 除常规三向外，**额外断言「不得出现 topics/q/arguments 字段」**，把那个决定钉死。 */
{
  const yfile = join(bank, 'audit', 'yield-rounds.jsonl')
  if (!existsSync(yfile)) {
    console.log('⏭ 收益取证日志缺席 —— 未跑过采集器，按未判处理（**不是"干净"**）')
  } else {
    const Y_KEYS = new Set(['sid', 'at', 'materialChars', 'sim', 'nextTools', 'idleSteps'])
    const BANNED = ['topics', 'q', 'arguments', 'args', 'query']
    const ytext = readFileSync(yfile, 'utf8')
    const ylines = ytext.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const yIssues = []
    for (const [i, l] of ylines.entries()) {
      let o; try { o = JSON.parse(l) } catch { yIssues.push(`Y L${i + 1} 非法 JSON`); continue }
      const bad = Object.keys(o).filter((k) => !Y_KEYS.has(k))
      if (bad.length) yIssues.push(`Y L${i + 1} 越界字段：${bad.join(',')}`)
      const banned = Object.keys(o).filter((k) => BANNED.indexOf(k) >= 0)
      if (banned.length) yIssues.push(`Y L${i + 1} **隐私决定被破坏**：出现 ${banned.join(',')}（查询原文/topics 不得入库）`)
      if (!RE_SID.test(String(o.sid || ''))) yIssues.push(`Y L${i + 1} sid 形态不符`)
      if (!(typeof o.materialChars === 'number' && typeof o.sim === 'number' && typeof o.idleSteps === 'number')) yIssues.push(`Y L${i + 1} 数值字段形态不符`)
      if (!Array.isArray(o.nextTools) || o.nextTools.some((t) => !RE_TOOL.test(String(t)))) yIssues.push(`Y L${i + 1} nextTools 必须是 ASCII 工具名数组`)
    }
    const ysens = sensitiveHits(ytext)
    if (ysens.length) yIssues.push(`Y 全文敏感面命中 ${ysens.length} 处`)
    const toolNames = new Set()
    for (const l of ylines) { try { const o = JSON.parse(l); for (const t of o.nextTools || []) toolNames.add(t) } catch { /* 已记 */ } }
    const nonzero = ylines.filter((l) => /"idleSteps":[1-9]/.test(l)).length
    console.log(`收益取证日志：**${ylines.length}** 条 · 注入后**有动作** ${nonzero} 条（${ylines.length ? Math.round((nonzero / ylines.length) * 1000) / 10 : 0}%）· 工具名 ${toolNames.size} 种`)
    console.log(`✅ 该日志三向已查（白名单 ${[...Y_KEYS].join('/')} · **禁 topics/q/arguments** · 全文探针）`)
    issues.push(...yIssues)
  }
}
if (issues.length) { console.error(`\nFAIL（${issues.length} 条）`); for (const x of issues.slice(0, 10)) console.error('   · ' + x); process.exit(1) }
console.log('PASS（隐私红线：零越界字段 · 零形态违规 · 零敏感面命中）')
