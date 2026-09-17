/**
 * i18n-merge-dicts — 把翻译产物按**域**归并进 4 份词表模块（2026-09-17）
 *
 * 输入：`.i18n-merged.json`（形如 `{"中文原文": "English"}`，由 6 个翻译分片合并而来）
 * 输出：`src-client/i18n-dict-{nav,memory,pane-run,cfg}.js`
 *
 * 归并规则：按「**哪个源文件在用这个串**」归域——
 *   nav      ← body.js / ui-kit.js / derive.js（外壳、导航、共享件）
 *   memory   ← panes-memory.js / panes-memory-detail.js
 *   pane-run ← panes-overview.js / panes-arch.js / panes-observe.js / panes-suite.js
 *   cfg      ← panes-toggles.js / panes-settings.js / panes-config.js
 * （域只是**组织方式**；运行期四份被 Object.assign 合成一张表，故放错域不影响正确性，
 *  只影响可维护性。若某串在多域使用，归到**首次遇到**的域，避免重复键触发断言 C。）
 *
 * 用法：node scripts/i18n-merge-dicts.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const MERGED = join(ROOT, '.i18n-merged.json')

const DOMAIN_OF = {
  'body.js': 'nav', 'ui-kit.js': 'nav', 'derive.js': 'nav',
  'panes-memory.js': 'memory', 'panes-memory-detail.js': 'memory',
  'panes-overview.js': 'pane-run', 'panes-observe.js': 'pane-run',
  'panes-arch.js': 'pane-arch', 'panes-suite.js': 'pane-arch',
  'panes-toggles.js': 'cfg', 'panes-settings.js': 'cfg', 'panes-config.js': 'cfg',
}
const TITLE = {
  nav: '导航 / 面板外壳 / 共享件（body · ui-kit · derive）',
  memory: '记忆库 / 画像 / 详情（panes-memory · panes-memory-detail）',
  'pane-run': '运行总览 / 运行观测（panes-overview · panes-observe）',
  'pane-arch': '架构 / 插件集合（panes-arch · panes-suite）',
  cfg: '参数 / 设置 / 配置（panes-toggles · panes-settings · panes-config）',
}

if (!existsSync(MERGED)) { console.error('缺 .i18n-merged.json（先跑翻译合并）'); process.exit(2) }
const merged = JSON.parse(readFileSync(MERGED, 'utf8'))

/* 扫描各源文件实际使用的 tr("…") 单参串，按域归并 */
const buckets = { nav: {}, memory: {}, 'pane-run': {}, 'pane-arch': {}, cfg: {} }
const files = readdirSync(SRC).filter((f) => f.endsWith('.js') && !/\.bak-|\.generated\./.test(f) && !f.startsWith('i18n-dict'))
const assigned = new Set()
for (const f of files) {
  const src = readFileSync(join(SRC, f), 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const c = n.expression.getText(sf)
      if (/(^|\.)tr$/.test(c) && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0])) {
        const k = n.arguments[0].text
        if (merged[k] !== undefined && !assigned.has(k)) {
          const d = DOMAIN_OF[f] || 'nav'
          buckets[d][k] = merged[k]
          assigned.add(k)
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

/* 写词表模块 */
const esc = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
for (const [d, obj] of Object.entries(buckets)) {
  const keys = Object.keys(obj).sort()
  const body = keys.map((k) => `  ${esc(k)}: ${esc(obj[k])},`).join('\n')
  const content = `/**
 * i18n-dict-${d} — ${TITLE[d]}（英文词表）（2026-09-17）
 *
 * **形态：原文即键** —— 键 = 中文原文（\`tr("记忆库")\` 的单参形态），值 = 英文。
 *   四份词表在运行期由 body.js 用 Object.assign 合成一张表；分域只为可维护性。
 *   键集完整性由 \`scripts/check-i18n-keys.mjs\` 断言 A（双向键集一致）守。
 *
 * ⚠ 本文件由 \`scripts/i18n-merge-dicts.mjs\` 生成/更新，但**可以手工增补**——
 *   手工条目请保持同样的「键 = 中文原文」形态，否则断言 A 会红。
 *
 * @module dsh-shoucang-memory/client/i18n-dict-${d}
 */

/** 词表：中文原文 → 英文。 */
export var EN = {
${body}
}
`
  writeFileSync(join(SRC, `i18n-dict-${d}.js`), content, 'utf8')
  console.log(`  i18n-dict-${d}.js ← ${keys.length} 条`)
}

const total = Object.values(buckets).reduce((a, o) => a + Object.keys(o).length, 0)
const unassigned = Object.keys(merged).filter((k) => !assigned.has(k))
console.log(`i18n-merge-dicts ✓ 归属 ${total} / 合并产物 ${Object.keys(merged).length}`)
if (unassigned.length) {
  console.log(`  · 未归属 ${unassigned.length} 条（不在任何 tr("…") 单参调用点 —— 可能是双参形态或已删）`)
  unassigned.slice(0, 8).forEach((k) => console.log('      ' + JSON.stringify(k).slice(0, 70)))
}
