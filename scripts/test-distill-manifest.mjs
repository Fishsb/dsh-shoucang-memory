#!/usr/bin/env node
// test-distill-manifest.mjs — S2S3 册零：**分段清单持久化**（2026-09-19）
//
// 判据（四要素）：
//   ① 判据：每段蒸馏（completed / forced）都把该段的**清单行**追加到 `<kRoot>/audit/distill-manifest/<sid>.jsonl`，
//      即「本会话 L1 全产出」在**轮结束后仍可读**（原先只在同轮内存里，轮结束即消失 ⇒ L2 复盘拿不到）。
//   ② 检查方式：直接调 `lib/distill-infra.js` 的 `manifest()`（模块级实现，可单测）；断言落盘路径、逐行累积、sid 归一。
//   ③ 阈值：3 次调用 ⇒ 文件 3 行且逐行等于输入；目录自动创建；`session-` 前缀被归一。
//   ④ 失败退回：写失败 ⇒ 走 `onWriteFail` 留痕（**不抛**，不阻塞蒸馏）——本件同时断言"失败可见且不抛"。
//
// **先红**：改造前 `lib/distill-infra.js` 无 `manifest` 导出 ⇒ 本件首跑即 FAIL（"接口不存在"），非恒真。
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✅ ' + m) }
const bad = (m) => { fail++; console.log('  ❌ ' + m) }

const mod = await import(new URL('../lib/distill-infra.js', import.meta.url).href)
const kRoot = mkdtempSync(join(tmpdir(), 'sc-manifest-'))
const ledgerFile = join(kRoot, 'audit', 'ledger.jsonl')

if (typeof mod.createInfraApi !== 'function') {
  bad('lib/distill-infra.js 缺 createInfraApi（未构建？）')
} else {
  const api = mod.createInfraApi({
    logFile: join(kRoot, 'audit', 'distill.log'),
    auditFile: ledgerFile,
    ledgerFile,
    episodeFile: ledgerFile,
    stubDir: join(kRoot, 'audit', 'stubs'),
    kRoot,
    EPISODE_CAP: 3,
    LEDGER_FILE: 'ledger.jsonl',
    onWriteFail: (kind) => { failures.push(String(kind)) },
  })
  const failures = []
  if (typeof api.manifest !== 'function') {
    bad('InfraApi 缺 manifest() —— 分段清单仍只存在内存里（先红成立）')
  } else {
    const sid = 'session-abcdef12-3456-7890-abcd-ef1234567890'
    api.manifest(sid, '段1 · route=memory · added=2')
    api.manifest(sid, '段2 · route=memory · added=1')
    api.manifest(sid, '段3 · route=discard · added=0')
    const f = join(kRoot, 'audit', 'distill-manifest', 'abcdef12-3456-7890-abcd-ef1234567890.jsonl')
    if (!existsSync(f)) bad(`清单文件未落盘：${f}`)
    else {
      const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean)
      lines.length === 3 ? ok(`清单逐段累积：3 段 ⇒ 3 行（${f.slice(-28)}）`) : bad(`行数 ${lines.length} ≠ 3`)
      lines[0] === '段1 · route=memory · added=2' && lines[2].startsWith('段3') ? ok('逐行内容与输入一致（append-only，不覆盖）') : bad(`内容不符：${JSON.stringify(lines)}`)
    }
    !existsSync(join(kRoot, 'audit', 'distill-manifest', 'session-abcdef12-3456-7890-abcd-ef1234567890.jsonl'))
      ? ok('sid 已归一（`session-` 前缀剥离，文件名与台账 sid 口径一致）') : bad('sid 未归一')
    // 失败可见且不抛：把目录指向一个**文件**，令 mkdir 必失败
    const badRoot = mkdtempSync(join(tmpdir(), 'sc-manifest-bad-'))
    const api2 = mod.createInfraApi({
      logFile: join(badRoot, 'x.log'), auditFile: join(badRoot, 'audit'), ledgerFile: join(badRoot, 'audit', 'ledger.jsonl'),
      episodeFile: join(badRoot, 'audit', 'e.jsonl'), stubDir: join(badRoot, 'audit', 's'), kRoot: badRoot,
      EPISODE_CAP: 3, LEDGER_FILE: 'ledger.jsonl', onWriteFail: (k) => { seen.push(String(k)) },
    })
    const seen = []
    // 把 audit 建成**文件**（跨平台可靠地让 mkdirSync(dir,{recursive:true}) 失败）
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(badRoot, 'audit'), 'x', 'utf8')
    let threw = false
    try { api2.manifest('session-zzz', '行') } catch { threw = true }
    !threw ? ok('写失败不抛（不阻塞蒸馏主链路）') : bad('写失败抛异常 ⇒ 会中断蒸馏')
    seen.includes('manifest') ? ok('写失败经 onWriteFail 留痕（kind=manifest，非静默）') : bad(`写失败未留痕：${JSON.stringify(seen)}`)
    rmSync(badRoot, { recursive: true, force: true })
  }
  failures.length === 0 ? ok('本件无写失败上报（正常路径零噪音）') : bad(`正常路径出现写失败：${failures.join(',')}`)
  rmSync(kRoot, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
