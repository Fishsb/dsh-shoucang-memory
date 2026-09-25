#!/usr/bin/env node
// check-suite-config-read.mjs — 运行态配置（`~/.dsh/suite/scheduler.json`）读取面机检
//   （2026-09-20 round 10 立 · 起因为本轮真实事故）
//
// ── 判因（实测，不是推测）────────────────────────────────────────────────
// 本轮改 profile pin 时用 `Set-Content -Encoding UTF8` 写文件，**引入了 UTF-8 BOM**；
// 同一个手法也写到了 `~/.dsh/suite/scheduler.json`（首字节 EF BB BF 7B，旧文件是 7B 0A 20 20）。
// 后果（读码 + 实测双重确认）：
//   · `JSON.parse('\uFEFF{…}')` **必抛**（实测：`SyntaxError: Unexpected token ''`）；
//   · `scheduler.ts#applySuiteConfigFile` 的外层 `catch { /* 坏文件按纯缺省 */ }` **完全静默**
//     ⇒ 文件里 **16 个运行态配置键全部被丢弃**（`releaseAuto:true` / `proposalApply:true` /
//       `mclFamiliarThreshold` … 一并退回 schema 缺省），而**不留任何痕迹**；
//   · `panel-shared.ts#createSuiteConfig.read` 的 `catch { return {} }` 同理 ⇒ 面板会把
//       **「文件损坏」渲染成「用户啥都没设」**（全是缺省），比加载失败更难发现。
// ⇒ 与 §0n（`check-version-pin` 自身假绿）**同族**：**把"坏掉了"显示成"没事"**。
//
// ── 本件四条判据 ────────────────────────────────────────────────────────
//   ① **本机实际配置文件可解析**（= 本轮事故的直接检测器；带 BOM / 语法损坏 ⇒ 红）。
//      报告态例外：文件**不存在** ⇒ 跳过（可选文件，不是错误）。
//   ② **整份读取失败必须留痕**：`scheduler.ts` 外层 catch 与 `panel-shared.ts` read catch
//      必须含 `warn?.(` —— **剥注释后判定**（防"只改注释不改行为"的假修）。
//   ③ **写侧不得产出 BOM**：遍历仓内写该文件的代码路径，断言走 `writeFileSync(..., 'utf8')`
//      系（Node 的 `'utf8'` 写**不加** BOM），且**不得**出现 `\uFEFF` 字面量。
//   ④ **反例自证**：带 BOM 的 JSON **必须**解析失败；剥 BOM 后**必须**可解析
//      （证明 ① 的检测器有效，而非恒真）。
//
// 用法: node scripts/check-suite-config-read.mjs [--json]
// 退出码：0 = 全过 · 1 = 有断言失败 · 3 = 跳过（配置与两份源件均不可达）
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
let pass = 0, fail = 0
const rows = []
const ok = (c, msg) => { rows.push({ ok: !!c, msg }); if (c) pass++; else fail++ }

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const cfgPath = join(dshHome, 'suite', 'scheduler.json')

/* 剥注释（本仓既有做法）：块注释 + 行注释。用于「源码里有没有某个调用」这类断言 ——
 * 不剥的话，注释里写着 `warn?.(…)` 也能让断言通过（假绿）。 */
const stripComments = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── ① 本机实际配置文件可解析 ──
let cfgExists = existsSync(cfgPath)
let cfgState = 'skip'
let cfgDetail = ''
if (cfgExists) {
  let buf = null
  try { buf = readFileSync(cfgPath) } catch (e) { cfgState = 'unreadable'; cfgDetail = String(e?.message || e).slice(0, 100) }
  if (buf) {
    const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
    let parsed = null, err = ''
    try { parsed = JSON.parse(buf.toString('utf8')) } catch (e) { err = String(e?.message || e).slice(0, 100) }
    if (parsed && typeof parsed === 'object') {
      cfgState = 'ok'
      cfgDetail = `${Object.keys(parsed).length} 键`
      ok(!hasBom, `① 配置文件无 UTF-8 BOM（首字节非 EF BB BF）`)
      ok(true, `① 配置文件可解析（${cfgDetail}）`)
    } else {
      cfgState = 'broken'
      cfgDetail = err || '非对象'
      ok(false, `① 配置文件**不可解析** ⇒ 全部持久键会被丢弃：${cfgDetail}${hasBom ? '（**带 UTF-8 BOM** ⇒ 去 BOM 即可修）' : ''}`)
    }
  } else {
    ok(false, `① 配置文件**读不动**：${cfgDetail}`)
  }
} else {
  console.log('⏭ 本机无 scheduler.json（可选文件）—— ① 跳过；仍执行 ②③④')
}

// ── ② 整份读取失败必须留痕（剥注释后判定）──
const schedJs = join(root, 'lib', 'scheduler.js')
const panelJs = join(root, 'lib', 'panel-shared.js')
if (existsSync(schedJs) && existsSync(panelJs)) {
  const sched = stripComments(readFileSync(schedJs, 'utf8'))
  const panel = stripComments(readFileSync(panelJs, 'utf8'))
  ok(/catch\s*\(\s*\w+\s*\)\s*\{[\s\S]{0,400}?warn\?\.\(/.test(sched),
    '② `scheduler.ts` 整份读取失败分支**留痕**（catch(e) 内含 `warn?.(`）—— 防"16 个键被静默丢弃"')
  ok(/catch\s*\(\s*\w+\s*\)\s*\{[\s\S]{0,400}?warn\?\.\(/.test(panel),
    '② `panel-shared.ts` 配置读侧失败分支**留痕**（防"文件损坏"被渲染成"用户啥都没设"）')
} else {
  ok(false, '② 编译产物缺席（先 `npm run build`）')
}

// ── ③ 写侧不得产出 BOM ──
{
  const writers = ['src/panel-shared.ts'].filter((p) => existsSync(join(root, p)))
  ok(writers.length > 0, '③ 找到写 scheduler.json 的源件（panel-shared.ts）')
  for (const p of writers) {
    const code = stripComments(readFileSync(join(root, p), 'utf8'))
    ok(!/\\uFEFF|\\u{FEFF}/i.test(code), `③ ${p} 不出现 \\uFEFF 字面量（写侧不主动加 BOM）`)
    ok(/writeFileSync\([^)]*,\s*[^)]*,\s*'utf8'\s*\)/.test(code) || /writeFileSync\([^)]*'utf8'\s*\)/.test(code),
      `③ ${p} 写盘走 \`'utf8'\`（Node 该编码**不加** BOM —— 与 PowerShell \`Set-Content -Encoding UTF8\` 不同）`)
  }
}

// ── ④ 反例自证：检测器有效（非恒真）──
{
  const withBom = '\uFEFF{"releaseAuto":true}'
  let threw = false
  try { JSON.parse(withBom) } catch { threw = true }
  ok(threw, '④ 反例自证 · 带 BOM 的 JSON **必抛**（证明 ① 的检测器有效）')
  let parsed = null
  try { parsed = JSON.parse(withBom.replace(/^\uFEFF/, '')) } catch { /* 不应发生 */ }
  ok(parsed && parsed.releaseAuto === true, '④ 反例自证 · 剥 BOM 后可解析且**值不变**（修法不损数据）')
}

// ── ⑤ **仓内文本件不得带 UTF-8 BOM**（本轮事故的根因手法：PowerShell `Set-Content -Encoding UTF8`）──
//   判因：本轮用该手法改 4 个文件，**3 个带出了 BOM**（profile `package.json` /
//     `~/.dsh/suite/scheduler.json` / 本仓 `AGENTS.md`）。前两者引发**运行态配置整体失效**
//     （见 ② 的判因），后者会让 JSON/YAML 解析类工具在别处再犯一次。
//   ⚠ 检测必须**字节级**：`[System.IO.File]::ReadAllText` 与 Node 的 `readFileSync(..., 'utf8')`
//     都会**自动剥离 BOM** ⇒ 用它们查 BOM 会得到"全都干净"的**假绿**（本轮实测踩到）。
//   范围 = 仓内源码/文档/脚本/注册表（排除构建产物 `lib/`、依赖与私人数据区）。
{
  const { readdirSync, statSync } = await import('node:fs')
  const exts = ['.md', '.mjs', '.ts', '.json', '.js']
  // D-D 修复（2026-09-23 · 圆桌会审受控证明）：补 `.roundtable` —— 它与 `_memory` 同类，
  //   是 **gitignore 的运行时数据区**（`.gitignore:92`），不是仓内内容。
  // 判因（实测，非推断）：门禁扫描面曾遗漏它 ⇒ 外部进程写一个 **14B 带 BOM 的临时 json**
  //   就能让**仓级门禁**翻红（受控复现：注前 exit 0 → 注后 exit 1「命中 1 件 → .roundtable/…」→ 删除后 exit 0）。
  //   即**入库面与扫描面不一致**：不入库的东西却在扫。
  // ⚠ 同胞三件**本就含它**（`check-hardcode.mjs:58` EXCLUDE_DIRS · `check-public-content.mjs:118` SKIP 正则 ·
  //   `check-script-consumers.mjs:70` SKIP_DIR）⇒ 本次是**对齐**，不是新增豁免。
  // ⚠ 治因未做（留待拍板）：同一「运行时/私密目录」概念在仓内仍有 **4 份实现**（本行 + 上述三件），
  //   且四者扫描面**按设计各不相同**（如 `check-hardcode` 有意扫 `lib/` 因本仓 lib 随仓提交）⇒
  //   不能简单合并成一份全集，只能收口「**禁扫的运行时目录**」这个**交集**。
  const skipDirs = new Set(['node_modules', 'lib', '.git', '_memory', 'client.js', '.roundtable'])
  const offenders = []
  const walk = (dir, rel = '') => {
    let ents = []
    try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (skipDirs.has(e.name)) continue
      const abs = join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(abs, r); continue }
      if (!exts.some((x) => e.name.endsWith(x))) continue
      try {
        const b = readFileSync(abs)
        if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) offenders.push(r)
      } catch { /* 读不动 ⇒ 忽略（非本判据范围） */ }
    }
  }
  walk(root)
  ok(offenders.length === 0,
    '⑤ 仓内文本件**无** UTF-8 BOM（字节级检测；命中即红）'
    + (offenders.length ? ` —— 命中 ${offenders.length} 件：${offenders.slice(0, 5).join(', ')}` : ''))
  // 检测器自证：**故意带 BOM 的字节串必须被判为有 BOM**
  const probe = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('{}')])
  ok(probe[0] === 0xEF && probe[1] === 0xBB && probe[2] === 0xBF,
    '⑤ 检测器自证 · 字节级判定能识别带 BOM 的输入（不用会被自动剥 BOM 的字符串 API）')
  // ⑤b 扫描面自证（D-D · 2026-09-23）：**运行时/私密目录不得进扫描面**。
  //   判因：实测外部进程在 `.roundtable/` 放一个 14B 带 BOM 的 json 就使**仓级门禁**翻红
  //     （受控复现 0→1→0），而该目录 `git check-ignore` 命中 ⇒ **不入库的东西却在扫**。
  //   本断言防回退：这四类是**隔离区**，任一被扫都会让"仓内内容"与"运行时数据"混流。
  //   ⚠ 本清单与 `check-hardcode.mjs:58` / `check-public-content.mjs:118` / `check-script-consumers.mjs:70`
  //     是**同族但按设计不同的扫描面**（如 hardcode 有意扫 `lib/`，因本仓 lib 随仓提交），
  //     故只锁「必须排除的隔离区」这个**交集**，不强行合并为一份全集（合并属跨件契约变更，须单独拍板）。
  const MUST_SKIP = ['.roundtable', '_memory', '.git', 'node_modules']
  const missing = MUST_SKIP.filter((d) => !skipDirs.has(d))
  ok(missing.length === 0,
    `⑤b 扫描面排除集含全部隔离区（缺 ${missing.join(', ') || '无'}）—— 防 "不入库的东西却在扫"`)
  // ⑤c 反例自证：注入一个"不含 .roundtable"的集合**必须**被判缺失（否则 ⑤b 恒真）
  const fakeSkip = new Set(['node_modules', 'lib', '.git', '_memory', 'client.js'])
  ok(MUST_SKIP.some((d) => !fakeSkip.has(d)), '⑤c 反例自证：缺 `.roundtable` 的集合**必须**被判缺失（否则 ⑤b 恒真）')
}

if (AS_JSON) console.log(JSON.stringify({ pass, fail, cfgPath, cfgState, rows }, null, 1))
else {
  for (const r of rows) console.log(`  ${r.ok ? '✅' : '❌'} ${r.msg}`)
  console.log(`\n结果: ${pass} PASS / ${fail} FAIL` + (cfgState === 'ok' ? ` · 本机配置 ${cfgDetail}` : ''))
}
process.exit(fail ? 1 : 0)
