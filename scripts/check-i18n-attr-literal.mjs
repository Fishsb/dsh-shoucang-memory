#!/usr/bin/env node
/**
 * check-i18n-attr-literal — 扫「**该包 tr() 却裸写中文**」的属性/文本赋值
 *
 * ## 为什么必须有这一件（2026-09-17 实测发现）
 *
 * 修完成因 C（700 键未注册）后做英文态**真机出图**核对，发现参数页搜索框
 *   placeholder 仍是中文 —— 源码 `panes-toggles.js:54` 是**裸中文串、没包 tr()**。
 *   而当时 `i18n-parity` 报「en 全页无中文残留」**为真**：
 *   **它读的是文本节点，而 placeholder/title/aria-label 是属性** ⇒ 天然看不见。
 *   `i18n-coverage` 也只扫**已有 tr() 调用点**，扫不到「该包却没包」。
 *   ⇒ 两个面合起来正好漏掉这一类。本件补上。
 *
 * ## 判据
 *
 * 扫 `src-client/*.js`（排除词表与生成物、排除注释行）中形如
 *   `xxx.placeholder = '含中文' ` / `.title` / `.ariaLabel` / `.textContent` / `.innerText` / `.label`
 * 的**直接字面量赋值**。值为 tr(...) 调用、变量、模板串的**一律不报**（那可能是动态或已包）。
 *
 * ## 退出码
 *
 * 0 = 无裸中文属性字面量 · 1 = 存在（逐一列出文件:行号）· 3 = 跳过
 *
 * 用法：node scripts/check-i18n-attr-literal.mjs
 */
import { readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')

// ⚠ **扫描面守卫**（2026-09-23 · ACT-344 收口：**改为消费单一实现** `lib-scan-scope.mjs`）。
//   判因（修前实测）：`catch (e) { console.log('…无 src-client —— 跳过'); exit(3) }` —— `e` **被吞且未分类**
//     ⇒ 权限不足 / IO 错误 / 路径损坏**全都显示成"目录不存在"**，而人读到的结论（"正常跳过"）
//       与真实原因（"读不出来"）**不一致**。这是本仓「失败不可观测」族的标准形态。
//   ⚠ **改为消费库的理由**（用户当轮「避免打补丁」）：本段原为**手写三态**，而库已有同一语义的
//     **单一实现** —— 留两份就是"同一语义多处重实现"。
//   三态（由库统一裁定，语义见 `lib-scan-scope.mjs` 头注释）：
//     真不存在 ⇒ **skip(3)**（诚实跳过，**不算通过**）· 存在但读不出 ⇒ **判红(1)** · 0 个可扫件 ⇒ **判红(1)**。
//   ⚠ **位置**：在 `--selftest` 分支**之前**是对的 —— 本件的自证要用**真 `src-client`** 做三态验证
//     （见下方 selftest 的 ② 段），故它需要先确认目录可用性；这与 `check-bridges`（自证用合成样本、
//     守卫放其后）**形态不同，各自正确**。
const { guardScanScope } = await import('./lib-scan-scope.mjs')
{
  const sc = guardScanScope({
    dir: SRC,
    label: '`src-client/`',
    required: false,   // 按设计可缺：缺 ⇒ skip(3)，**不算通过**
    why: '本件判据建立在「src-client 下每个 .js 的中文属性字面量」之上；读不出或为空即结论不成立。',
    accept: (n) => n.endsWith('.js') && !/^i18n-dict-|\.generated\./.test(n),
  })
  if (sc.exitCode !== null) process.exit(sc.exitCode)
}
const files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !/^i18n-dict-|\.generated\./.test(f))

const RE = /\.(placeholder|title|ariaLabel|textContent|innerText|label)\s*=\s*(['"])((?:\\.|(?!\2)[^\\])*)\2/g
const CJK = /[\u4e00-\u9fff]/

// ── --selftest（2026-09-23 · 系统性空扫扫描轮）─────────────────────────────
//   判据两条：① 扫描器（RE × CJK）真能分辨"裸中文属性赋值"与"已包/无中文"；
//            ② **扫描面守卫三向正确**（不存在⇒skip 3 / 存在但空⇒判红 1 / 有文件⇒正常判）。
//   ⚠ ② 为本轮新增：修前 `catch` 吞掉一切错误并一律报"无 src-client"，
//     使「读不出来」与「目录不存在」**不可分辨**（本仓「失败不可观测」族）。
//   ⚠ **本段必须放在主路径 `process.exit` 之前**——首版置于文件末尾 ⇒ **永不可达**
//     （实测 `--selftest` 直接跑了主路径并 exit 0）。**"加了自证"≠"自证会跑"。**
if (process.argv.includes('--selftest')) {
  let pass = 0, fail = 0
  const ok = (c, n) => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}`) } }
  const scanLine = (ln) => {
    const out = []
    let m; RE.lastIndex = 0
    while ((m = RE.exec(ln)) !== null) if (CJK.test(m[3])) out.push(m[1])
    return out
  }
  ok(scanLine("el.placeholder = '请选择'").length === 1, '① 正例：裸中文属性赋值**必须**命中')
  ok(scanLine("el.placeholder = tr('请选择')").length === 0, '① 反例：已包 tr() **不得**命中')
  ok(scanLine("el.title = 'plain'").length === 0, '① 反例：无中文**不得**命中')

  const { mkdtempSync, mkdirSync, writeFileSync: wf, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { execFileSync } = await import('node:child_process')
  const self = fileURLToPath(import.meta.url)
  const work = mkdtempSync(join(tmpdir(), 'sc-i18nattr-'))
  const mk = (name, { dir, file }) => {
    const r = join(work, name)
    mkdirSync(join(r, 'scripts'), { recursive: true })
    copyFileSync(self, join(r, 'scripts', 'check-i18n-attr-literal.mjs'))
    // ⚠ **依赖也要一并复制**：本件现在 `import './lib-scan-scope.mjs'`，
    //   而夹具是独立目录 ⇒ 不复制就会 `ERR_MODULE_NOT_FOUND`（实测踩过，与 `check-bridges` 同型）。
    const dep = join(dirname(self), 'lib-scan-scope.mjs')
    if (existsSync(dep)) copyFileSync(dep, join(r, 'scripts', 'lib-scan-scope.mjs'))
    if (dir) mkdirSync(join(r, 'src-client'), { recursive: true })
    if (file) wf(join(r, 'src-client', 'x.js'), 'const a = 1\n', 'utf8')
    return r
  }
  const run = (r) => { try { execFileSync(process.execPath, [join(r, 'scripts', 'check-i18n-attr-literal.mjs')], { encoding: 'utf8', cwd: r, timeout: 60000 }); return 0 } catch (e) { return e.status } }
  ok(run(mk('no-dir', { dir: false, file: false })) === 3, '② 守卫：无 src-client ⇒ skip **3**（诚实跳过，不算通过）')
  ok(run(mk('empty', { dir: true, file: false })) === 1, '② 守卫：src-client 存在但空 ⇒ **判红 1**（空集不得判绿）')
  ok(run(mk('ok', { dir: true, file: true })) === 0, '② 守卫：有文件 ⇒ 正常判（0）')
  rmSync(work, { recursive: true, force: true })

  console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass / ${fail} fail）`)
  process.exit(fail ? 1 : 0)
}
const hits = []

for (const f of files) {
  const lines = readFileSync(join(SRC, f), 'utf8').split(/\r?\n/)
  let inBlock = false
  lines.forEach((ln, i) => {
    const tr = ln.trim()
    if (/^\/\*/.test(tr) && !/\*\//.test(tr)) { inBlock = true; return }
    if (inBlock) { if (/\*\//.test(tr)) inBlock = false; return }
    if (/^\s*(\/\/|\*)/.test(ln)) return
    let m
    RE.lastIndex = 0
    while ((m = RE.exec(ln)) !== null) {
      if (CJK.test(m[3])) hits.push({ f, line: i + 1, prop: m[1], val: m[3] })
    }
  })
}

if (!hits.length) {
  console.log('check-i18n-attr-literal：PASS（' + files.length + ' 个模块无裸中文属性字面量）')
  process.exit(0)
}

console.error('check-i18n-attr-literal：FAIL（' + hits.length + ' 处「该包 tr() 却裸写中文」）')
console.error('  这类串在英文态永远显示中文，且文本级残留检查看不见（属性不是文本节点）。')
for (const h of hits) console.error('   · ' + h.f + ':' + h.line + '  .' + h.prop + ' = "' + h.val.slice(0, 40) + '"')
console.error('  修法：包上 tr(...)，并在对应 i18n-dict-*.js 补英文值。')
process.exit(1)
