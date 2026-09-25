#!/usr/bin/env node
// check-index-parse-cr.mjs — 索引行解析**必须容忍行尾空白**（2026-09-24 · 真机缺陷驱动）
//
// ── 判因（真机实测 · 「静默吞行」型，与失败不可观测同族）────────────────────────
// 真库 `MEMORY.md` 实测带**多枚行尾 CR**：597 行是 `\r\r\r\r`、268 行是 `\r\r\r`，
//   仅 21 行是干净 `\n`（合计 892 行 / 120685 B）。
// 而 `src/panel-memory.ts#parseIndexLines` 的正则是 `/^\[([^\]]+)\]\s+(.+?)\s*→\s*(.+)$/`：
//   · `.` **不匹配** `\r`；  · `$` 在**非 multiline** 下要求**真行尾**。
//   ⇒ 残留的 `\r` 让**整行失配**。后果不是报错，而是：
//     面板 `/memory/overview` 的 `lines.length` 从 **890 → 21**（吞吐 **2.4%**），
//     且**无任何异常提示** —— 前端 `panes-memory-detail.js` 该处**无空态守卫**，
//     用户只看到"知识索引 21 条"。
//
//   同份数据在库内**另有两处口径**（均先 `trim`，故天然容忍）：
//     · `src/targets.ts#scanIndexRows`（`check-shared-fn` 在册的单一实现）
//     · `scripts/count-memory-lines.mjs`（「一条」的规范计数口径，口径 = 含 `→ notes/`）
//   ⇒ 三处对**同一文件**给出 `21 / 884 / 890` 三种数 ⇒ 典型「同一事实多份实现」。
//
// ── 本件守什么（可机检，**不 grep 源码判绿**）──────────────────────────────────
//   ① **行为面**：直接 `import` 编译产物 `lib/panel-memory.js` 的解析出口，
//      用**合成夹具**（形状对、非真库原文 —— 遵 `check-public-content` 隐私红线）逐例断言：
//        · 干净行 ⇒ 解析出正确三字段；
//        · 行尾 `\r` / `\r\r\r` / `\r\r\r\r` / 尾随空格 ⇒ **结果与干净行逐字段相等**；
//        · 行首缩进的行 ⇒ **仍不得命中**（防"宽容行尾"被实现成"宽容行首"）。
//   ② **真库对照（可选，库不可达则 skip 该项而不判 PASS）**：真库 MEMORY.md 的解析条数
//      必须等于规范计数口径（`→ notes/` 行数）——两者**独立实现**，相等才算同源。
//   ③ **变异自证**：把编译产物临时改回**不容忍**的旧正则 ⇒ 本件必须翻红；
//      跑完**按原始字节复原**并复验 sha 相同（`[路径] 判据变异验证` 的四步）。
//
// 用法: node scripts/check-index-parse-cr.mjs [--selftest]
// 退出码：0=PASS  1=FAIL  3=构建产物缺席（先 `npm run build`；**不假装通过**）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const sha = (b) => createHash('sha256').update(b).digest('hex')

const LIB = join(root, 'lib', 'panel-memory.js')
if (!existsSync(LIB)) {
  console.log('⏭ lib/panel-memory.js 缺席 ⇒ 无法判定行为面（先 `npm run build`；**不假装通过**）')
  process.exit(3)
}

/* ── 合成夹具（**形状对即可，绝不用真库原文** —— 见 check-public-content）──
 * 三行同内容、仅行尾不同；一行行首带缩进作为**反向**用例。 */
const BASE = '[env] 合成主题 · 概况甲/概况乙 → notes/env.md §合成小节'
const FIXTURES = [
  { name: '干净 \\n',        text: BASE,                want: true,  why: '基准：正常行必须命中' },
  { name: '尾随空格',        text: BASE + '   ',        want: true,  why: '行尾空格不得影响（\\.+ 贪婪已覆盖）' },
  { name: '行尾 1×CR',       text: BASE + '\r',         want: true,  why: '真机 268 行是 3×CR，最少情形' },
  { name: '行尾 3×CR',       text: BASE + '\r\r\r',     want: true,  why: '**真机实测形态**（268 行）' },
  { name: '行尾 4×CR',       text: BASE + '\r\r\r\r',   want: true,  why: '**真机实测形态**（597 行）' },
  { name: 'CR+空格混合',     text: BASE + '\r\r  ',     want: true,  why: 'CR 与空格交错' },
  { name: '行首缩进',        text: '  ' + BASE,         want: false, why: '**反向**：只许宽容行尾，不得宽容行首' },
  { name: '无标签',          text: BASE.replace('[env] ', ''), want: false, why: '**反向**：无标签不得命中' },
  { name: '无指针',          text: '[env] 合成主题 · 无箭头概况', want: false, why: '**反向**：缺 → 指针不得命中' },
]

const mod = await import(new URL('../lib/panel-memory.js', import.meta.url).href)
const parse = mod.parseIndexLines
if (typeof parse !== 'function') {
  console.log('❌ lib/panel-memory.js 未导出 parseIndexLines ⇒ 无法判定行为面（导出面缺失）')
  process.exit(1)
}

console.log('索引行解析容忍行尾空白（真机 CR 缺陷回归锁）')
console.log('── ① 行为面（合成夹具逐例）──')
for (const f of FIXTURES) {
  const got = parse(f.text).length
  const pass = f.want ? got === 1 : got === 0
  ok(pass, `${f.name} ⇒ 解析 ${got} 条（期望 ${f.want ? 1 : 0}）· ${f.why}`)
}
// 字段级等价：污染行与干净行必须**逐字段相等**（不是"都命中"就够）
{
  const clean = parse(BASE)[0]
  const dirty = parse(BASE + '\r\r\r\r')[0]
  const same = clean && dirty && clean.tag === dirty.tag && clean.subject === dirty.subject && clean.pointer === dirty.pointer
  ok(same, '字段级等价：4×CR 行与干净行 tag/subject/pointer **逐字段相等**' +
    (same ? '' : ` —— clean=${JSON.stringify(clean)} dirty=${JSON.stringify(dirty)}`))
  ok(!!clean && clean.tag === 'env' && clean.pointer === 'notes/env.md §合成小节',
    '字段切分正确：tag=env / pointer=notes/env.md §合成小节（防"命中但切错"）')
}
// 多行文件：21 干净 + 865 污染 ⇒ 必须全数解析（真机形状的合成复刻）
{
  const cleanN = 21, dirtyN = 865
  const text = [...Array(cleanN).fill(BASE), ...Array(dirtyN).fill(BASE + '\r\r\r\r')].join('\n') + '\n'
  const got = parse(text).length
  ok(got === cleanN + dirtyN, `真机形状复刻：${cleanN} 干净 + ${dirtyN} 污染 ⇒ 解析 ${got} 条（期望 ${cleanN + dirtyN}）`)
}

console.log('── ② 真库对照（规范口径独立实现）──')
{
  const bank = process.env.MEMORY_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'suite', 'memory')
  const f = join(bank, 'MEMORY.md')
  if (!existsSync(f)) {
    console.log('   ⏭ 真库不可达 ⇒ 本项 **skip**（skip ≠ 通过；不参与 PASS 判定）')
  } else {
    const text = readFileSync(f, 'utf8')
    const parsed = parse(text).length
    // 规范口径（与 count-memory-lines.mjs 同义：含 `→ notes/` 的非空行）
    const canonical = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes('→ notes/')).length
    ok(parsed === canonical, `真库解析 ${parsed} 条 == 规范口径 ${canonical} 条（两独立实现须同数）`)
  }
}

console.log('── ③ 变异自证（判据必须可证伪）──')
if (SELFTEST) {
  const before = readFileSync(LIB)
  const beforeSha = sha(before)
  const src = before.toString('utf8')
  // 变异：把 tolerant 版本退回旧的不容忍正则
  const mutated = src.replace(/raw\.trimEnd\(\)\.match\(/, 'raw.match(')
  if (mutated === src) {
    ok(false, '变异注入失败：未在编译产物中找到 `raw.trimEnd().match(` ⇒ 自证无法执行（可能已改名/已构建旧版）')
  } else {
    try {
      writeFileSync(LIB, mutated)
      // 子进程重跑行为面（Cache 已污染，必须换进程）
      const { execFileSync } = await import('node:child_process')
      let red = false
      try {
        execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: 'pipe' })
      } catch { red = true }
      ok(red, '变异后（不容忍 CR）本件**翻红** —— 判据非恒真')
    } finally {
      writeFileSync(LIB, before)   // 按原始字节复原
    }
    ok(sha(readFileSync(LIB)) === beforeSha, `变异后**按原始字节复原**（sha 相同：${beforeSha.slice(0, 16)}）`)
  }
} else {
  console.log('   · 跳过（加 --selftest 执行变异自证）')
}

console.log(fail ? `❌ FAIL（${fail} 项）` : '✅ PASS')
process.exit(fail ? 1 : 0)
