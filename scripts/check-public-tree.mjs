#!/usr/bin/env node
// check-public-tree.mjs —「公开树纯净」门（S4Z · 2026-09-14；2026-09-17 加固）
//
// **判因（真实泄露事件）**：AGENTS 规则 2 一直写着「推送前确认公开树纯净」，但**只是口头纪律**
//   ⇒ 实测扫出 **8 个已追踪文件含个人信息**，且**全部已在远端公开仓库**（最早 2026-09-08）：
//     · `deliverables/inject-parity-2026-09-14.md` —— 含**邮箱** + 本机路径（从注入文本整段复制而来，
//       连带把热记忆里的**用户画像行**也带了进去）
//     · `skill/docs/history/ADR-0007.md` · `skill/docs/archive-plugin-adaptation-plan.md`（09-08 起）
//     · 另 5 件含本机路径 `<drive>:\Users\<user>\…`
//   **教训**：**纪律不会自动执行，门才会**。本门把规则 2 变成可机检。
//
// ⚠ **编码陷阱（实测踩过）**：`deliverables/v9-compare/w8-verify.log` 是 **UTF-16LE**（带 BOM）。
//   首版按 utf8 读 ⇒ 读出乱码 ⇒ **替换落空且自检也漏报**。故本门**按 BOM 探测编码**再解码，
//   并对 UTF-16 同样扫描（否则门自身就是"假绿"）。
//
// ⚠ **静默漏扫（2026-09-17 修 · 圆桌会审 I3）**：原实现「名单取 `git ls-files`、内容读**工作区**、
//   失败即 `catch { continue }`」⇒ 已跟踪但工作区已删的文件被**无条件跳过**，而门仍打印
//   「已追踪 654 件 · 命中 0 · PASS」（实测当时正好 3 件被跳过）。**跳过的对象必须可见**：
//   现改为「工作区读失败 ⇒ 回退读 `HEAD:<path>` ⇒ 两者都失败则计入 skip 并 **FAIL**」。
//
// ⚠ **未追踪面（2026-09-17 增 · A1b）**：`git add -A` 会把未追踪文件带进公开树 ⇒
//   本门同时扫 `git ls-files -o --exclude-standard`（**可被 add 进公开树的面**），命中即 FAIL。
//
// 断言：
//   A1  已追踪文件里**不得**出现个人可识别信息（邮箱 / 本机用户目录 / SSH 私钥头 / 明文令牌）
//   A1b 未追踪（但可被 add）文件同样不得含上述形态
//   A1c **读失败必须可见**：skip>0 ⇒ FAIL（不得静默跳过）
//   A2  `_memory/` `docs/devref/` `skill/docs/devref/` `AGENTS.md` `CLAUDE.md` `HANDOVER.md`
//       `MEMORY.md` `USER.md` `AGENT.md` **不得被追踪**
//   A2b **已跟踪却命中 .gitignore 的文件必须为 0**（ignore 规则对已跟踪文件零效力，
//       实测 `scripts/_tmp-noise.txt` 即此类：`git ls-files --ignored --exclude-standard -c` 唯一命中）
//   A3  **反例自证**：给一段含邮箱/路径的样本 ⇒ 必须检出（否则断言恒真）
//
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

const git = (args, opts = {}) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024, ...opts })

const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|zip|gz|tgz|pdf|mp4)$/i
const tracked = git(['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
/** A1b 未追踪面：**可被 `git add -A` 带进公开树**的文件（gitignore 已忽略者不算） */
const untracked = git(['ls-files', '-o', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean)

console.log(`公开树纯净门（已追踪 ${tracked.length} 件 · 未追踪可入库 ${untracked.length} 件）`)

const scanText = (text) => {
  const out = []
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      if (r.allow && r.allow.test(m[0])) continue
      out.push({ rule: r.name, sample: m[0].slice(0, 70) })
      break // 每文件每规则报一次即可
    }
  }
  return out
}

// ── A1 / A1b 扫描（含 A1c 读失败可见化）──
const hits = []
let skipExt = 0
const unreadable = []
for (const [face, list] of [['tracked', tracked], ['untracked', untracked]]) {
  for (const f of list) {
    if (SKIP_EXT.test(f)) { skipExt++; continue }
    let text = null
    try { text = decode(readFileSync(join(root, f))) } catch { /* 落到 HEAD 回退 */ }
    let src = 'worktree'
    if (text === null && face === 'tracked') {
      try { text = decode(git(['show', `HEAD:${f}`])); src = 'HEAD' } catch { text = null }
    }
    if (text === null) { unreadable.push(`${f}（${face}）`); continue }
    for (const h of scanText(stripUrls(text))) hits.push({ file: f, face, src, ...h })
  }
}
ok(hits.length === 0, `A1/A1b 无个人信息/本机环境泄露（命中 ${hits.length} 件）`)
for (const h of hits) console.log(`     ⚠ [${h.rule}] ${h.file}（${h.face}·读自${h.src}）\n         例：${h.sample}`)
ok(unreadable.length === 0, `A1c 全部文件可读（读失败 ${unreadable.length} 件${unreadable.length ? '：' + unreadable.join(', ') : ''}）`)
console.log(`     备注：按扩展名跳过 ${skipExt} 件（图片/字体/压缩包等，**显式计数**，不静默）`)

// ── A2 私人路径不得被追踪 ──
// 2026-09-17 补三项：`MEMORY.md` / `USER.md` / `AGENT.md` —— 实测三者**已入库且不在任何隐私门覆盖面**
//   （`git check-ignore` 对三者均无命中），而本仓根被登记为守藏 root 时画像/索引行会写进这三文件。
const FORBIDDEN = [/(^|\/)_memory\//, /^docs\/devref\//, /^skill\/docs\/devref\//, /^AGENTS\.md$/, /^CLAUDE\.md$/, /^HANDOVER\.md$/, /^MEMORY\.md$/, /^USER\.md$/, /^AGENT\.md$/, /(^|\/)\.env$/]
const bad2 = tracked.filter((f) => FORBIDDEN.some((re) => re.test(f)))
ok(bad2.length === 0, `A2 私人/本地文件未被追踪（命中 ${bad2.length} 件${bad2.length ? '：' + bad2.join(', ') : ''}）`)

// ── A2b 已跟踪却命中 .gitignore 的文件必须为 0 ──
// 判因：`.gitignore` 对**已跟踪文件零效力**。实测 `scripts/_tmp-noise.txt` 既是公开树成员、
//   又命中 `.gitignore:34 scripts/_tmp-*` ⇒「不入公开仓」的意图对它完全不成立。
//   规矩：新增 ignore 规则后必跑本判据，非空即未清干净。
let trackedIgnored = []
try {
  trackedIgnored = git(['ls-files', '-i', '-c', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean)
} catch { trackedIgnored = ['<git ls-files -i -c 执行失败>'] }
ok(trackedIgnored.length === 0, `A2b 已跟踪文件未命中 .gitignore（命中 ${trackedIgnored.length} 件${trackedIgnored.length ? '：' + trackedIgnored.join(', ') : ''}）`)

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
