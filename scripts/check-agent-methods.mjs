#!/usr/bin/env node
/**
 * check-agent-methods.mjs — **绑定句柄调用形态**门禁（2026-09-14 立）
 *
 * 判据：`createXxxApi(dep)` 生成的**绑定句柄**（形态 `name: (...a: Tail<Parameters<typeof fn>>) => fn(dep, ...a)`）
 *   是「注入面方法」——只能经依赖对象以**点号链**调用（`dep.dom.distill.handler(...)`）。
 *   **不得**写成宿主对象上的方法：`agent.handler(...)` / `session.handler(...)`。
 *   宿主（DSH 内核）与任何插件都不提供这些方法 ⇒ 运行时 TypeError。
 *
 * 缘起（2026-09-14 实锤，非假想）：`distill-hooks.ts` 里 `agent.armIdleTimer(agent)` 是 2026-09-12
 *   C-2b 重构（闭包本地函数调用 → 模块级函数）时写坏的：`armIdleTimer` 被抽成 `(dep, agent)` 并纳入
 *   `createAgentApi` 导出，**调用点却改成了宿主 agent 的方法**。此后每次 turn/end 在此抛 TypeError，
 *   被紧随其后的 `catch { /* 事件回调零抛出 *​/ }` 吞掉 ⇒ **空闲蒸馏全链失效**（实际靠 10 分钟周期
 *   兜底扫尾勉强跑，且只覆盖 live root 会话），而 typecheck / 单测 / wiring 门禁**全绿**——
 *   它们都不覆盖该调用点（"导出函数接了线 ≠ 有效"，见 AGENTS.md 规则 6）。
 *
 * 判法：先收集全部绑定句柄名，再扫调用点；**接收者是宿主对象**（agent/session/ctx/child/event…）即判违规。
 *   插件自建的依赖袋/句柄（`d.log(...)` / `deps.audit(...)` / `dep.dom.x.y(...)`）是**正常形态**——
 *   它们本来就是用来装注入面的，不在此列；点号链同样天然豁免。
 *
 * 用法：node scripts/check-agent-methods.mjs [--selftest]
 * 退出码：0 通过 / 1 违规 / 3 用法错 / 1（selftest 失败）
 */
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

/** 绑定句柄生成形态（与 src/*.ts 的 createXxxApi 约定一致） */
const BINDING_RE = /^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:[ \t]*\(\.\.\.a:[ \t]*Tail<Parameters<typeof[ \t]+([A-Za-z_$][\w$]*)/gm
/** 方法调用点：接收者必须是**裸标识符**（前面不是 `.`／词字符） */
const CALL_RE = /(^|[^.\w$])([A-Za-z_$][\w$]*)[ \t]*\.[ \t]*([A-Za-z_$][\w$]*)[ \t]*\(/g
/**
 * **宿主对象**接收者名单：从宿主（DSH 内核）拿到、由本插件**不可自己定义**的对象。
 *   插件自有方法挂在这类对象上，宿主一定没有 ⇒ 运行时 TypeError。
 *   ⚠ 反向边界：插件自建的依赖袋（`d` / `dep` / `deps` / `io` / `dom` / `env` / `hooks` …）**不在**此名单——
 *   它们本来就是装注入面的容器，`d.log(...)` 是正常形态（2026-09-14 首版把规则取成"裸标识符一律判红"，
 *   实测 31 处假阳性，全部是依赖袋 ⇒ 收紧为本名单）。
 */
const HOST_RECEIVERS = new Set(['agent', 'session', 'ag', 'sess', 'ctx', 'child', 'proc', 'event', 'ev', 'payload', 'req', 'res'])

function sourceFiles(dir) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.ts'))
    .map((n) => join(dir, n))
}

/** 收集绑定句柄名（全仓 src 汇总，避免"本文件没定义就漏判"） */
function collectBoundHandles(files) {
  const set = new Set()
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(BINDING_RE)) set.add(m[1])
  }
  return set
}

/** 扫违规：绑定句柄被裸标识符接收者调用 */
function scan(files, bound) {
  const out = []
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const lines = text.split('\n')
    for (const m of text.matchAll(CALL_RE)) {
      const method = m[3]
      if (!bound.has(method)) continue
      if (!HOST_RECEIVERS.has(m[2])) continue // 依赖袋/句柄上的调用是正常形态
      const idx = m.index + m[1].length
      const line = text.slice(0, idx).split('\n').length
      // 注释行豁免：注释里出现该形态是**记录**（本仓大量"负面形态"注释），不是调用
      const raw = lines[line - 1] || ''
      if (/^\s*(\/\/|\*|\/\*)/.test(raw)) continue
      out.push({ file: relative(root, f).replace(/\\/g, '/'), line, receiver: m[2], method, text: raw.trim().slice(0, 120) })
    }
  }
  return out
}

if (SELFTEST) {
  // 反向证伪：造夹具证明"改坏了会翻红"，而不是一个永远绿的门禁
  const tmp = mkdtempSync(join(tmpdir(), 'sc-agent-methods-'))
  try {
    const bad = join(tmp, 'bad.ts')
    writeFileSync(bad, [
      'export function createFooApi(dep: any) {',
      '  return {',
      '    armIdleTimer: (...a: Tail<Parameters<typeof armIdleTimer>>) => armIdleTimer(dep, ...a),',
      '  }',
      '}',
      'export function wire(agent: any) {',
      '  agent.armIdleTimer(agent)',            // ← 应判违规
      '}',
    ].join('\n'), 'utf8')
    const good = join(tmp, 'good.ts')
    writeFileSync(good, [
      'export function createFooApi(dep: any) {',
      '  return {',
      '    armIdleTimer: (...a: Tail<Parameters<typeof armIdleTimer>>) => armIdleTimer(dep, ...a),',
      '  }',
      '}',
      'export function wire(dep: any, agent: any) {',
      '  dep.dom.distill.armIdleTimer(agent)',   // ← 点号链，应通过
      '  dep.session.hasActiveSubagents("x")',   // ← 点号链内层，应通过
      '  deps.audit({})',                        // ← 依赖袋，应通过（首版曾误判）
      '}',
    ].join('\n'), 'utf8')
    const files = [bad, good]
    const bound = collectBoundHandles(files)
    const hits = scan(files, bound)
    const onBad = hits.filter((h) => h.file.endsWith('bad.ts'))
    const onGood = hits.filter((h) => h.file.endsWith('good.ts'))
    const ok = bound.has('armIdleTimer') && onBad.length === 1 && onGood.length === 0
    if (!ok) {
      console.error(`❌ selftest 失败：绑定名收集=${bound.has('armIdleTimer')} 应红命中=${onBad.length} 应绿命中=${onGood.length}`)
      process.exit(1)
    }
    console.log('✅ check-agent-methods --selftest：坏形态判红 1 处、好形态 0 命中（门禁非恒绿）')
    process.exit(0)
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 清理失败无害 */ }
  }
}

/* 空作用域拆两态（2026-09-17 修 M3）：**目录不存在**＝无法判定(exit 3)；
 *  **目录存在但 0 模块**＝作用域为空，必须判 FAIL(exit 1) ——
 *  原实现两态都退 3，与自家标准相反（`check-srcmap.mjs:124-128` 明写「0 模块必须判 FAIL」）。 */
const srcDir = join(root, 'src')
let srcExists = false
try { srcExists = statSync(srcDir).isDirectory() } catch { srcExists = false }
if (!srcExists) { console.error(`⏭ src/ 不存在（${srcDir}）⇒ 无法判定，exit 3`); process.exit(3) }
const files = sourceFiles(srcDir)
if (!files.length) { console.error(`❌ src/ 存在但 0 个 .ts 模块（${srcDir}）⇒ 作用域为空，"无问题"是空集上的真命题`); process.exit(1) }
const bound = collectBoundHandles(files)
if (bound.size < 20) {
  // 自证：绑定句柄名收集器若因重构换了写法而失效，本件会静默变成"永远绿" ⇒ 必须自检
  console.error(`❌ 绑定句柄收集异常：仅 ${bound.size} 个（<20）——收集正则可能已被重构改坏，本门禁不可信`)
  process.exit(1)
}
const hits = scan(files, bound)
if (hits.length) {
  console.error(`⛔ 绑定句柄被当作宿主对象方法调用 — ${hits.length} 处（宿主不提供这些方法 ⇒ 运行时 TypeError）：`)
  for (const h of hits) console.error(`  ${h.file}:${h.line}: ${h.receiver}.${h.method}(...)  → 应经注入面调用（点号链）`)
  process.exit(1)
}
console.log(`✅ 绑定句柄调用形态通过（收集 ${bound.size} 个句柄，src/${files.length} 件，0 处宿主形态调用）`)
