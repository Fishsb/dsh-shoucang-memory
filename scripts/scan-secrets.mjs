/**
 * scan-secrets.mjs — 记忆库敏感串只读扫描（**报告态**，不入 CHECKS）
 *
 * 用途：T1 密钥清理前的**穷尽定位**——只报「文件 + 行号 + 命中形态」，
 *       **绝不回显密钥正文**（本件输出会被贴进对话，回显等于二次泄露）。
 *
 * 为什么单开一件而不塞进 check-runner：它是**运维定位**工具，不是常驻门禁；
 *   常驻门禁（`check-journal-privacy.mjs`）守的是纪元日志字段白名单，职责不同。
 *
 * 用法：node scripts/scan-secrets.mjs [--root <目录>] [--json]
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 高置信凭据形态（宁可多报，由人裁定；**不做自动改写**）。
 *
 * D7（2026-09-17 圆桌会议裁定）：**合并重复 pattern** —— 原 `sk-长串`
 * （`sk-[A-Za-z0-9_-]{20,}`）与 `sk-hex64`（`sk-[0-9a-fA-F]{32,}`）对**同一串各报一次**
 * （实测：`ledger.jsonl:8528` 与 pending 候选各被两条命中 ⇒ 报 5 处实为 3 处）。
 * 因 hex 字符集 ⊂ alnum 字符集，**前者完全覆盖后者** ⇒ 删 `sk-hex64`，语义零损失。
 */
const PATTERNS = [
  { id: 'sk-长串', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { id: 'sk-proj-', re: /sk-proj-[A-Za-z0-9_-]{16,}/g },
  { id: 'AWS-AKIA', re: /AKIA[0-9A-Z]{16}/g },
  { id: 'ghp_', re: /ghp_[A-Za-z0-9]{20,}/g },
  { id: 'xox-', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: '私钥块', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: '赋值型', re: /(api[_-]?key|apikey|password|passwd|pwd|access[_-]?token|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{12,}/gi },
]

const args = process.argv.slice(2)
const roots = []
if (args.includes('--root')) roots.push(args[args.indexOf('--root') + 1])
else {
  roots.push(join(homedir(), '.dsh', 'suite', 'knowledge'))
  roots.push(join(homedir(), '.dsh', 'suite', 'memory'))
}
const asJson = args.includes('--json')

const SKIP_DIR = /^(\.git|node_modules|\.vector-cache|backup-|\.internal)$/
const MAX_BYTES = 8 * 1024 * 1024

/** 遮蔽：只留首尾各 4 字符，中间以 · 代替 —— 足够定位，不足以复用。 */
const mask = (s) => (s.length <= 10 ? '·'.repeat(s.length) : `${s.slice(0, 6)}${'·'.repeat(Math.min(12, s.length - 12))}${s.slice(-4)}`)

const hits = []
let scannedFiles = 0
const walk = (dir, depth = 0) => {
  if (depth > 6) return
  let entries = []
  try { entries = readdirSync(dir) } catch { return }
  for (const e of entries) {
    const p = join(dir, e)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) { if (!SKIP_DIR.test(e)) walk(p, depth + 1); continue }
    if (st.size > MAX_BYTES) continue
    if (!/\.(md|json|jsonl|txt|mjs|js|ts|log|yml|yaml)$/.test(e)) continue
    let txt
    try { txt = readFileSync(p, 'utf8') } catch { continue }
    scannedFiles++
    const lines = txt.split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const { id, re } of PATTERNS) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(lines[i])) !== null) {
          hits.push({ file: p, line: i + 1, kind: id, masked: mask(m[0]), len: m[0].length })
        }
      }
    }
  }
}
for (const r of roots) if (existsSync(r)) walk(r)

if (asJson) {
  console.log(JSON.stringify({ scannedFiles, roots, hits }, null, 2))
} else {
  console.log(`scan-secrets: 扫描 ${scannedFiles} 文件 · 命中 ${hits.length} 处（正文已遮蔽）`)
  const byFile = new Map()
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, [])
    byFile.get(h.file).push(h)
  }
  for (const [f, hs] of [...byFile.entries()].sort()) {
    console.log(`  ${f.replace(homedir(), '~')}`)
    for (const h of hs) console.log(`     L${h.line}  [${h.kind}]  ${h.masked}  (len=${h.len})`)
  }
}
process.exit(hits.length ? 4 : 0)
