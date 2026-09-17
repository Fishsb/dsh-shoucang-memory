#!/usr/bin/env node
/**
 * gen-i18n-dict-index — 生成词表索引（接缝③：**注册按目录自动发现**）
 *
 * ## 为什么必须有这一件（2026-09-17 圆桌会议 `arch` 成因 C 的结构性修法）
 *
 * 实测教训：`i18n-dict-cfg.js`(283键) / `-pane-run.js`(231) / `-pane-arch.js`(186)
 *   **只建了文件、从未被 import**（`body.js` 只 import NAV+MEM）⇒ 700 条英文词条从未注册，
 *   英文态下 **7/9 视图仍显示中文（752 串）**；而当时六条验收 + 135 件门禁**全绿**。
 *   根因不是「忘了写」，而是**注册无契约** —— 注册靠人记得改 `body.js` 那一行，且无任何机检守它。
 *
 * ## 修法
 *
 * 把「哪几份词表要被注册」从**手写 import 列表**改为**按目录扫描生成**：
 *   · 本脚本扫 `src-client/i18n-dict-*.js`，生成 `src-client/i18n-dict-index.generated.js`，
 *     内含全部词表的 import 与合并（单一事实源 = 目录本身）；
 *   · `body.js` 只 import 这一个生成物 ⇒ **新增词表文件无须改任何手写清单即自动生效**；
 *   · `--check` 模式只比对不落盘（供门禁判「生成物是否新鲜」）—— 生成物过期即翻红，
 *     与 `gen-panel-contract --check` 同一模式。
 *
 * 用法：
 *   node scripts/gen-i18n-dict-index.mjs           落盘
 *   node scripts/gen-i18n-dict-index.mjs --check   只比对（exit 1 = 过期）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const OUT = join(SRC, 'i18n-dict-index.generated.js')
const CHECK = process.argv.includes('--check')

if (!existsSync(SRC)) { console.log('gen-i18n-dict-index：无 src-client —— 跳过'); process.exit(0) }

/* ⚠ 必须排除生成物自身（其文件名同样匹配 `i18n-dict-*`）—— 实测漏排除会导致**自引用**：
 *  生成物 import 自己，esbuild 下该 export 求值为 undefined，`Object.assign` **静默跳过** ⇒
 *  **少装配一份词表却不报错**（正是本接缝要消灭的「静默回落」形态）。 */
const files = readdirSync(SRC).filter((f) => /^i18n-dict-.*\.js$/.test(f) && !/\.generated\./.test(f)).sort()
if (!files.length) { console.error('X 未找到任何 i18n-dict-*.js'); process.exit(1) }

const lines = []
lines.push('/* 本文件由 `scripts/gen-i18n-dict-index.mjs` 生成 —— **禁手改**。')
lines.push(' *')
lines.push(' * 接缝③（2026-09-17 圆桌会议 arch 成因 C 的结构性修法）：词表注册**按目录自动发现**。')
lines.push(' * 目录 ' + files.length + ' 份词表（' + files.map((f) => f.replace('i18n-dict-', '').replace('.js', '')).join(' · ') + '）。')
lines.push(' *')
lines.push(' * 判因：原实现把「哪几份词表要注册」写成 `body.js` 里的**手写 import 列表** ⇒ 新增词表文件')
lines.push(' *   必须记得去改那一行，漏改的后果是**静默回落成中文**（不是报错）—— 实测因此漏了 3 份 / 700 键。')
lines.push(' *   现改为扫目录生成 ⇒ **新增文件无须改任何清单即生效**；');
lines.push(' *   生成物新鲜度由 `check-i18n-registered.mjs` 判（过期即红）。 */')
lines.push('')
files.forEach((f, i) => lines.push("import { EN as D" + i + " } from './" + f + "'"))
lines.push('')
lines.push('/** 全部词表的英文值合并成一张（key = 中文原文） */')
lines.push('export var EN = Object.assign({}, ' + files.map((_, i) => 'D' + i).join(', ') + ')')
lines.push('')
const content = lines.join('\n')

const rel = 'src-client/i18n-dict-index.generated.js'
if (CHECK) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (cur !== content) {
    console.error('gen-i18n-dict-index：✗ **生成物过期** —— ' + rel + ' 与当前目录不一致。')
    console.error('  修法：npm run build:client（或 node scripts/gen-i18n-dict-index.mjs）后重试。')
    process.exit(1)
  }
  console.log('gen-i18n-dict-index：✅ 生成物新鲜（' + files.length + ' 份词表）')
  process.exit(0)
}
writeFileSync(OUT, content, 'utf8')
console.log('gen-i18n-dict-index：' + rel + '（' + files.length + ' 份词表 · ' + content.length + ' 字节）')
