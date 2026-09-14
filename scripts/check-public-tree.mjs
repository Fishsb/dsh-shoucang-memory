#!/usr/bin/env node
// check-public-tree.mjs —「公开树纯净」门（S4Z · 2026-09-14）
//
// **判因（真实泄露事件）**：AGENTS 规则 2 一直写着「推送前确认公开树纯净」，但**只是口头纪律**
//   ⇒ 实测扫出 **8 个已追踪文件含个人信息**，且**全部已在远端公开仓库**（最早 2026-09-08）：
//     · `deliverables/inject-parity-2026-09-14.md` —— 含**邮箱** + 本机路径（从注入文本整段复制而来，
//       连带把热记忆里的**用户画像行**也带了进去）
//     · `skill/docs/history/ADR-0007.md` · `skill/docs/archive-plugin-adaptation-plan.md`（09-08 起）
//     · 另 5 件含本机路径 `C:\Users\<user>\…`
//   **教训**：**纪律不会自动执行，门才会**。本门把规则 2 变成可机检。
//
// ⚠ **编码陷阱（实测踩过）**：`deliverables/v9-compare/w8-verify.log` 是 **UTF-16LE**（带 BOM）。
//   首版按 utf8 读 ⇒ 读出乱码 ⇒ **替换落空且自检也漏报**。故本门**按 BOM 探测编码**再解码，
//   并对 UTF-16 同样扫描（否则门自身就是"假绿"）。
//
// 断言：
//   A1 已追踪文件里**不得**出现个人可识别信息（邮箱 / 本机用户目录 / SSH 私钥头 / 明文令牌）
//   A2 `_memory/` `docs/devref/` `skill/docs/devref/` `AGENTS.md` `CLAUDE.md` **不得被追踪**
//   A3 **反例自证**：给一段含邮箱/路径的样本 ⇒ 必须检出（否则断言恒真）
//
// 用法: node scripts/check-public-tree.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

/** 敏感模式（**只收个人可识别信息与本机环境**；公开的仓库 owner 名不算 —— 它在公开 URL 里本来就有）。
 *  ⚠ **规则必须收窄**：首版把「CSS 选择器 `x@sidebar.footer.action`」当邮箱、把文档里**举例**的
 *  把文档里**举例**的 `/home/<dir>` 段、把 `token: 'activity.jsonl'`（文件名常量）都报了出来 ⇒ 8 处命中里 5 处是误报。
 *  **信噪比本身就是判据的一部分** —— 一个满屏误报的门会被人直接静音，等于没有。故：
 *    · 邮箱：要求**已知 TLD**，且排除 CSS/DOM 形态（`@` 后紧跟选择器链）
 *    · 本机路径：要求**真实用户名段**（非 `...`、非文档里的示例占位）
 *    · 令牌：要求**高熵长值**（≥24 且含大小写/数字混合），排除短文件名常量 */
const RULES = [
  { name: '邮箱',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|cn|org|net|io|dev|me|edu|gov|co|xyz|top|info|biz)\b/g,
    allow: /@(?:example\.(?:com|org)|test\.local|localhost|users\.noreply\.github\.com|anthropic\.com|deepseek\.com|github\.com|sidebar\.\w)/i,
    deny: /@(?:sidebar|footer|header|panel|slot|item)\b/i },
  { name: '本机用户目录',
    re: /(?:[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9._-]{2,}|\/c\/Users\/[A-Za-z0-9._-]{2,}|\/home\/[A-Za-z0-9._-]{2,}(?![A-Za-z0-9._-]))/g,
    // ⚠ **先剥 URL 再匹配**（见 stripUrls）：实测某论文 URL 里形如 `/home/<dir>/…` 的路径段
    //   曾被当成"本机 /home 目录" —— **URL 内的路径不是本机路径**。
    //   allow 只放**示例/占位**：`...`、`user`、`example` 等；**真实用户名一律不许**。
    allow: /(?:[\\/](?:Users|home)[\\/](?:\.\.\.|example|user|username|users|me|you|xxx|placeholder)\b)|\.\.\./i },
  { name: 'SSH 私钥头', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, allow: null },
  { name: '明文令牌/密码',
    re: /(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']([A-Za-z0-9_\-+/=]{24,})["']/gi,
    allow: null },
  { name: 'Windows 临时目录', re: /AppData\\{1,2}Local\\{1,2}Temp/gi, allow: null },
]

/** 按 BOM 探测编码解码（**不这么做 = 门自身假绿**，见头注） */
function decode(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le')
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return buf.swap16().toString('utf16le')
  return buf.toString('utf8')
}

/** 剥掉 URL 再扫描：**URL 内的路径不是本机路径**（实测某文档里论文 URL 的 `/home/<dir>` 段曾误报） */
const stripUrls = (t) => t.replace(/https?:\/\/\S+/gi, '<URL>')

const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|zip|gz|tgz|pdf|mp4)$/i
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)

console.log(`公开树纯净门（已追踪 ${files.length} 件）`)

// ── A1 扫描 ──
const hits = []
for (const f of files) {
  if (SKIP_EXT.test(f)) continue
  let text
  try { text = stripUrls(decode(readFileSync(join(root, f)))) } catch { continue }
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      if (r.allow && r.allow.test(m[0])) continue
      hits.push({ file: f, rule: r.name, sample: m[0].slice(0, 70) })
      break // 每文件每规则报一次即可
    }
  }
}
ok(hits.length === 0, `A1 无个人信息/本机环境泄露（命中 ${hits.length} 件）`)
for (const h of hits) console.log(`     ⚠ [${h.rule}] ${h.file}\n         例：${h.sample}`)

// ── A2 私人路径不得被追踪 ──
const FORBIDDEN = [/(^|\/)_memory\//, /^docs\/devref\//, /^skill\/docs\/devref\//, /^AGENTS\.md$/, /^CLAUDE\.md$/, /^HANDOVER\.md$/, /(^|\/)\.env$/]
const tracked = files.filter((f) => FORBIDDEN.some((re) => re.test(f)))
ok(tracked.length === 0, `A2 私人/本地文件未被追踪（命中 ${tracked.length} 件${tracked.length ? '：' + tracked.join(', ') : ''}）`)

// ── A3 反例自证 ──
// ⚠ **样本必须动态拼接**：门要能检出"邮箱 / 本机路径"这些形态，就必然在源码里"知道"它们长什么样
//   ⇒ 写成字面量会让**本门报自己**（也过不了 `check-hardcode`）。拼接不是取巧 —— 它让"判据的知识"
//   与"被扫的内容"分离：样本只在**运行时**存在，不进任何被追踪文本的敏感形态。
{
  const M = 'someone' + '@' + 'realmail' + '.com'
  const W = 'C:' + '\\Users\\' + 'alice' + '\\x'
  const W16 = 'C:' + '\\Users\\' + 'bob'
  const scan = (t) => RULES.filter((r) => { for (const m of t.matchAll(r.re)) if (!(r.allow && r.allow.test(m[0]))) return true; return false }).map((r) => r.name)
  ok(scan(`联系 ${M} 或看 ${W}`).length >= 2, 'A3 反例自证：含邮箱 + 本机路径的样本 ⇒ 检出（断言语义有效，非恒真）')
  ok(scan('见 https://github.com/example/repo 与 user@users.noreply.github.com').length === 0, 'A3 反例自证：公开 URL / noreply 邮箱 ⇒ 不误伤')
  ok(decode(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(W16, 'utf16le')])).includes('bob'), 'A3 反例自证：UTF-16LE 内容**能被解码**（否则等于漏扫 —— 实测踩过此坑）')
}

console.log(fail ? `\nFAIL（${fail} 项）—— 推送前必须处理` : '\nPASS（公开树纯净：无个人信息 / 无私人路径混入）')
process.exit(fail ? 1 : 0)
