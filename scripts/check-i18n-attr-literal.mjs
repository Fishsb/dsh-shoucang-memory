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
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
let files
try { files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !/^i18n-dict-|\.generated\./.test(f)) } catch (e) {
  console.log('check-i18n-attr-literal：无 src-client —— 跳过'); process.exit(3)
}

const RE = /\.(placeholder|title|ariaLabel|textContent|innerText|label)\s*=\s*(['"])((?:\\.|(?!\2)[^\\])*)\2/g
const CJK = /[\u4e00-\u9fff]/
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
