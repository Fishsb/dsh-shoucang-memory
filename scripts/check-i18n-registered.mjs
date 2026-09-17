#!/usr/bin/env node
/**
 * check-i18n-registered — 词表**是否真的进了产物**（补「文件存在 ≠ 已注册」的假绿面）
 *
 * ## 为什么必须有这一件（2026-09-17 圆桌会议 `arch` 成因 C 的产物）
 *
 * 实测教训：`i18n-dict-cfg.js`(283键) / `-pane-run.js`(231) / `-pane-arch.js`(186)
 *   **只建了文件、从未被 import** ⇒ 700 条英文词条从未注册 ⇒ 英文态下 7/9 视图仍显示中文（752 串）。
 *   而当时**全套六条验收 + 135 件门禁全绿**，因为：
 *     · `check-i18n-keys` 断言 H 只对账「**目录 ⟷ 清单**」（文件是否存在），**不查是否被注册**；
 *     · `i18n-parity` 等验收件的 locale 替身**自己读词表文件**拼字典，**绕过真实注册路径**。
 *   ⇒ 「造出来就绿」。本件在**产物层**判「已注册」，是那一面的补丁。
 *
 * ## 判据
 *
 * 取每份 `src-client/i18n-dict-*.js` 的英文值（≥8 字符、含 ASCII 字母），
 * 逐条在 `lib/client.js` 里查存在性。**只统计英文值**是因为 esbuild 会把 CJK 转成 `\uXXXX`，
 * 中文键在产物里不可直接比对；而英文值不受该转义影响 ⇒ 是可靠探针。
 *
 * 命中率 < 50% 判该词表**未进产物**（实测未注册时命中率为 1%~3%，注册后 100%，
 * 阈值取 50% 有极大余量，不会因个别文案改动而抖动）。
 *
 * ## 退出码
 *
 * 0 = 全部词表均已进产物 · 1 = 有词表未进产物 · 3 = 前置缺失（无 src-client 或无产物）跳过
 *
 * 用法：node scripts/check-i18n-registered.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src-client')
const BUNDLE = join(ROOT, 'lib', 'client.js')

if (!existsSync(SRC)) { console.log('check-i18n-registered：无 src-client —— 跳过'); process.exit(3) }
if (!existsSync(BUNDLE)) { console.log('check-i18n-registered：无 lib/client.js（未构建）—— 跳过'); process.exit(3) }

/* 接缝③（阶段 4）：先判**生成物是否新鲜** —— 词表索引按目录生成，过期即红 */
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-i18n-dict-index.mjs'), '--check'], { stdio: 'pipe' })
} catch (e) {
  console.error('check-i18n-registered：❌ 词表索引生成物**过期**（目录新增/删除了词表但未重生成）')
  console.error('  修法：npm run build:client')
  process.exit(1)
}
const bundle = readFileSync(BUNDLE, 'utf8')
/* ⚠ 排除生成物自身（文件名同样匹配 `i18n-dict-*`）—— 否则会被当成第 6 份词表 */
const files = readdirSync(SRC).filter((f) => /^i18n-dict-.*\.js$/.test(f) && !/\.generated\./.test(f)).sort()
if (!files.length) { console.log('check-i18n-registered：未找到 i18n-dict-*.js —— 跳过'); process.exit(3) }

/** 解析词表的 `'key': 'en',` 行 */
function parseEn (f) {
  const t = readFileSync(join(SRC, f), 'utf8')
  const out = []
  const re = /^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm
  let m
  while ((m = re.exec(t)) !== null) out.push(m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\'))
  return out
}

const rows = []
let bad = []
for (const f of files) {
  /* ⚠ 探针只取**纯 ASCII** 英文值：含 CJK 的值（如 `文档 · Docs`）在产物里被 esbuild 转义成
   *   `\uXXXX` ⇒ 直接比对会**假性未命中**（实测把命中率从 100% 压到 73%，是假象）。
   *   纯 ASCII 值不受转义影响，是可靠探针。 */
  const vals = [...new Set(parseEn(f))].filter((v) =>
    v.length >= 8 && /^[\x20-\x7E]+$/.test(v) && /[A-Za-z]/.test(v))
  let hit = 0
  for (const v of vals) if (bundle.includes(v)) hit++
  const pct = vals.length ? Math.round((hit / vals.length) * 100) : 100
  rows.push({ f, probe: vals.length, hit, pct })
  if (vals.length && pct < 50) bad.push({ f, pct, hit, n: vals.length })
}

console.log('check-i18n-registered · 词表进产物核对（产物 ' + Math.round(bundle.length / 1024) + 'KB）')
console.log('  ' + '文件'.padEnd(28) + '探针值   产物命中   命中率')
for (const r of rows) {
  console.log('  ' + r.f.padEnd(26) + String(r.probe).padStart(6) + String(r.hit).padStart(11) + String(r.pct + '%').padStart(9))
}

if (bad.length) {
  console.error('')
  console.error('  ❌ 以下词表**未进产物**（命中率 <50%）⇒ 其词条在英文态会静默回落成中文：')
  for (const b of bad) console.error('     · ' + b.f + '（' + b.pct + '% · ' + b.hit + '/' + b.n + '）')
  console.error('  修法：在 `src-client/body.js` 的 import 区补该词表，并在 `attachLocale` 的')
  console.error('        `en: Object.assign({}, …)` 合并处并入（见 body.js 的成因 C 注释）。')
  process.exit(1)
}

console.log('')
console.log('  ✅ ' + rows.length + ' 份词表全部已进产物（' + rows.reduce((a, r) => a + r.hit, 0) + ' 条英文值可检出）')
process.exit(0)
