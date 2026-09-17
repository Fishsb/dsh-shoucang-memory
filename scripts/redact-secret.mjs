/**
 * redact-secret.mjs — T1 一次性遮蔽工具（**按需运行，非常驻门禁**）
 *
 * 依据：圆桌会议「守藏整体方案会审」converge 裁定 ⑤ —— T1 分文件、分动作：
 *   · `pending/flow-candidates/*` → **遮蔽**（候选暂存，会被蒸馏消费 ⇒ 留着＝把密钥再传播进库）
 *   · `audit/ledger.jsonl`        → **保留原行不改**（append-only；删行/改行＝改史，且
 *                                    `~/.dsh/suite/knowledge` 无 .git ⇒ 改坏不可回退）
 *
 * 纪律：
 *   · **先记后改**（R2）——调用方须先落 `audit/secret-redaction-log.jsonl` 再运行本件；
 *   · **备份是唯一回滚**（knowledge 无 git）——调用方须先 `Copy-Item` 到
 *     `audit/backup-secret-redact-<stamp>/`；
 *   · 只按**精确串**替换，不做正则模糊匹配（避免误伤）；
 *   · 本件**不回显密钥正文**，只打印长度变化与计数。
 *
 * 用法（密钥经环境变量传入，不落命令行历史）：
 *   $env:SC_SECRET="sk-..."; node scripts/redact-secret.mjs <目标文件绝对路径>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const target = process.argv[2]
const secret = process.env.SC_SECRET
const MASK = 'sk-[已遮蔽:凭据]'

if (!target) { console.error('用法：node scripts/redact-secret.mjs <文件路径>（密钥经 SC_SECRET 传入）'); process.exit(3) }
if (!secret || secret.length < 20) { console.error('SC_SECRET 未设置或过短 ⇒ 拒绝运行（防误伤）'); process.exit(3) }
if (!existsSync(target)) { console.error(`目标不存在：${target}`); process.exit(3) }

const before = readFileSync(target, 'utf8')
const hits = before.split(secret).length - 1
if (hits === 0) { console.log('未命中目标串 ⇒ 不写入（幂等）'); process.exit(0) }

const after = before.split(secret).join(MASK)
writeFileSync(target, after, 'utf8')

// 复核：写后不应再有该串；且长度必须严格减少（证明确有替换发生）
const recheck = readFileSync(target, 'utf8')
const stillThere = recheck.includes(secret)
console.log(`遮蔽完成：命中 ${hits} 处 · 已被替换=${!stillThere} · 字符 ${before.length} → ${after.length}`)
process.exit(stillThere ? 1 : 0)
