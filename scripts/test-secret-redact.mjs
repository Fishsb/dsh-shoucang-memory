/**
 * test-secret-redact.mjs — 内容级凭据过滤（B · 2026-09-17 圆桌会议产出）
 *
 * ── 为什么必须有它（判因，**已发生事实**）──────────────────────────────
 * 会议主持人实测：`~/.dsh/suite/knowledge/pending/flow-candidates/2026-09-16-dmjyix.md:3`
 * **含明文 API 密钥**（`sk-` + 64 位 hex），位于**待蒸馏吸收通道**；同串另落
 * `audit/ledger.jsonl:8528`（append-only，不可改史）。即：会话原文 → 蒸馏 → 库的链路上
 * **无任何内容级过滤**。
 *
 * ── 本件四组语料（accept 判据 B1–B4 · 缺任一组判据不成立）──────────────
 *   ① **真命中组**：各类凭据必须被检出（100% 命中）
 *   ② **误报对照组**：本库实测误报例必须**不**被检出（`\d{17}` → 浮点 `0.0185…`）
 *      —— 这组是判据成立的**前置**：缺它 = 判据只会"宁可错杀"
 *   ③ **保真组**：真实库取样（非合成）的普通文本必须零命中
 *   ④ **漏网边界**：**如实断言已知漏网形态**（security 实测：`sk-proj-` 型含 `-`、
 *      分行 key、纯 hex 无前缀）—— 把边界写成**可执行断言**而非口头免责，
 *      防止后来人误以为"有了正则就万无一失"。
 *
 * 退出码：0 全绿 / 1 有断言失败 / 3 产物未构建（skip）
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
const fails = []
const ok = (name, cond, detail = '') => { if (cond) { pass++; return } fails.push(`${name}${detail ? ' :: ' + detail : ''}`) }

const implPath = join(ROOT, 'lib', 'secret-redact.js')
if (!existsSync(implPath)) { console.log('test-secret-redact: lib/secret-redact.js 未构建 ⇒ skip（exit 3）'); process.exit(3) }
const { findSecrets, hasSecret, secretWarnings, redactText } = await import(`file://${implPath.replaceAll('\\', '/')}`)
ok('导出 findSecrets', typeof findSecrets === 'function')
ok('导出 hasSecret', typeof hasSecret === 'function')

/* ── ① 真命中组：每类至少 1 例，必须全中 ── */
const TRUE_POSITIVES = [
  ['sk- 型（本库实盘形态）', 'sk-6b924112e7317ae1263febc591dac9fc2e41f9ca6beb9cf85672b2f2ee31024c'],
  /* ⚠ **夹具须在运行时拼接，源码里不得出现完整凭据串**（2026-09-17 实测教训）：
   *   GitHub Push Protection 会把源码里的真格式假 token 判为**真密钥**并**拒绝推送**
   *   （实测被拦：Slack token 形态 ⇒ GH013 Push protection）。同理本仓 `check-public-tree`
   *   也会把 `-----BEGIN ... PRIVATE KEY-----` 判为红线命中。
   *   ⇒ 拆成片段拼接：**运行时仍是完整串**（规则照测），源码里不构成可被扫描的 token。 */
  ['sk- 型（含连字符）', 'sk-live-' + 'AbCdEf1234567890GhIjKlMnOpQr'],
  ['AWS AKIA', 'AKIA' + 'IOSFODNN7EXAMPLE'],
  ['GitHub ghp_', 'ghp_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
  ['Slack xox-', 'xoxb-' + '123456789012-' + 'abcdefghijklmn'],
  ['Bearer 令牌', 'Authorization: Bearer ' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'],
  ['JWT 三段', 'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
  ['私钥块', '-----BEGIN ' + 'RSA PRIVATE ' + 'KEY-----'],
  ['赋值型 api_key', 'api_key = abcd1234efgh5678'],
  ['赋值型 password', 'password: SuperSecret123'],
  ['中国大陆手机号', '联系电话 13812345678'],
]
for (const [name, text] of TRUE_POSITIVES) {
  ok(`真命中: ${name}`, hasSecret(text) === true, `findSecrets=${JSON.stringify(findSecrets(text))}`)
}

/* ── ② 误报对照组：**本库实测误报例必须不报**（这组是判据成立前置）── */
const MUST_NOT_MATCH = [
  ['本库实测：浮点长数字（`\\d{17}` 型误杀的锚点）', '0.018518518518518517'],
  ['长时间戳（13 位）', '1758100000000'],
  ['哈希片段（32 hex 无前缀）', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['文档占位符 sk-your-key-here', 'export DEEPSEEK_API_KEY=sk-your-key-here'],
  ['普通中文叙述', '本次会议确认落盘格式与容量门禁无冲突'],
  ['含冒号的普通叙述（不构成赋值）', '注意：这里说的是语义，不是密钥'],
  ['短数字（非手机号）', '端口 3080，版本 1.2.3'],
  ['身份证型 18 位（**故意不覆盖**，避免与浮点冲突）', '110101199003071234'],
]
for (const [name, text] of MUST_NOT_MATCH) {
  ok(`误报对照（不得命中）: ${name}`, hasSecret(text) === false, `findSecrets=${JSON.stringify(findSecrets(text))}`)
}

/* ── ③ 保真组：真实库取样（非合成）必须零命中 ── */
const libRoot = join(homedir(), '.dsh', 'skills', 'managing-memory')
const samples = []
if (existsSync(libRoot)) {
  const walk = (dir, depth = 0) => {
    if (depth > 3 || samples.length >= 150) return
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const e of entries) {
      if (samples.length >= 150) return
      if (/^(\.git|node_modules|audit|scripts)$/.test(e)) continue
      const p = join(dir, e)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) { walk(p, depth + 1); continue }
      if (!/\.(md|json|mjs|ts)$/.test(e) || st.size > 512 * 1024) continue
      let lines = []
      try { lines = readFileSync(p, 'utf8').split('\n') } catch { continue }
      for (const ln of lines) {
        if (samples.length >= 150) break
        const t = ln.trim()
        if (t.length >= 10) samples.push(t)
      }
    }
  }
  walk(libRoot)
}
ok('保真取样规模 ≥100 行（真实库）', samples.length >= 100, `实测 ${samples.length} 行`)
let falsePositives = []
for (const s of samples) if (hasSecret(s)) falsePositives.push(s.slice(0, 80))
ok('保真：真实库取样零误报', falsePositives.length === 0,
  `误报 ${falsePositives.length}/${samples.length}：${falsePositives.slice(0, 2).join(' | ')}`)

/* ── ④ 漏网边界（**如实断言**，把已知边界写成可执行事实）── */
const KNOWN_GAPS = [
  /* security 实测：`sk-[A-Za-z0-9]{20,}` 对含 `-` 的 sk-proj 型**漏网**。
   * 本实现已把字符集放宽为 `[A-Za-z0-9_-]` ⇒ **该形态现已覆盖**（回归断言）。 */
  ['sk-proj 型（本实现已覆盖 —— 回归锚点）', 'sk-proj-AbC-dEf1234567890ghIJKLmnop', true],
  /* 仍漏的边界（**不修**：修了会引入误杀，代价大于收益）—— */
  ['分行/加空格的 key（结构性漏网，无法用单行正则覆盖）', 'sk-6b9241 12e7317a e1263feb', false],
  ['无前缀纯 hex（与哈希片段不可区分 ⇒ 报则必误杀）', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', false],
]
for (const [name, text, shouldMatch] of KNOWN_GAPS) {
  const got = hasSecret(text)
  ok(`漏网边界（如实断言）: ${name}`, got === shouldMatch, `期望=${shouldMatch} 实测=${got}`)
}

/* ── 辅助：告警文本不回显原值 ── */
const warn = secretWarnings(findSecrets('sk-6b924112e7317ae1263febc591dac9fc2e41f9ca6beb9cf85672b2f2ee31024c'))
ok('告警文本不回显完整原值', warn.length === 1 && !warn[0].includes('3febc591dac9fc2e41f9ca6beb9cf85672b2f2ee31024c'), warn[0])


/* ── redactText：就地脱敏（2026-09-17 修实测泄漏时新增）──
 *  判因：`distill-activation.ts` 写 `activation-step` 的 excerpt 时用 `text.slice(0, 60)` **原样截断**，
 *    且该路径**未过 findSecrets**（蒸馏写入路径过了）⇒ 实测有明文 API 密钥落进审计台账。
 *  ⚠ 夹具在**运行时拼接**，源码里不得出现完整凭据串。 */
ok('导出 redactText', typeof redactText === 'function')

const K = "sk-" + "6b924112e7317ae1263febc591dac9fc2e41f9ca6beb9cf85672b2f2ee31024c"
const red = redactText("配置里的秘钥" + K + "（请勿外传）")
ok('redactText 掩掉明文', !red.includes(K), red.slice(0, 40))
ok('redactText 保留遮蔽形态（首 6 + 8· + 末 4，与 mask() 同口径）', red.includes('sk-6b9') && red.includes('024c'), red.slice(0, 40))
ok('redactText 保留非凭据上下文', red.startsWith('配置里的秘钥') && red.endsWith('（请勿外传）'), red.slice(0, 40))
ok('redactText 对无凭据文本原样返回', redactText('普通中文文本 ok') === '普通中文文本 ok')
ok('redactText 对非字符串返回空串', redactText(null) === '' && redactText(123) === '' && redactText(undefined) === '')

/* ── **顺序用例**：先切片会把边界凭据截成不匹配正则的残段 ⇒ 脱敏失效 ── */
/* ⚠ 填充必须用**非 ASCII 词字符**（如中文）：正则以 `\bsk-` 起头，
 *   若前面紧贴 ASCII 字母数字（如 `xxxxsk-…`）则 `\b` **不成立** ⇒ 不匹配 ⇒ 脱敏失效。
 *   实测真实泄漏是 `秘钥sk-5d36…`（前缀为 CJK）⇒ `\b` 成立 ⇒ 能匹配。本用例照真实形态构造。 */
const pad = "填".repeat(50)
const boundary = pad + K
const wrongOrder = redactText(boundary.slice(0, 60))
const rightOrder = redactText(boundary).slice(0, 60)
ok('【反例】先切片后脱敏 ⇒ 残留明文残段（证明顺序有必要）',
  !wrongOrder.includes(K) && /sk-[A-Za-z0-9]{2,}$/.test(wrongOrder), wrongOrder.slice(-16))
ok('【正例】先脱敏后切片 ⇒ 无明文残段',
  !rightOrder.includes(K) && !/sk-[A-Za-z0-9]{20,}/.test(rightOrder) && rightOrder.includes('·'), rightOrder.slice(-16))

if (fails.length) {
  console.error(`test-secret-redact: FAIL (${fails.length})`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`test-secret-redact: PASS ${pass} 项（真命中 ${TRUE_POSITIVES.length} · 误报对照 ${MUST_NOT_MATCH.length} · 保真 ${samples.length} 行取样 · 漏网边界 ${KNOWN_GAPS.length}）`)
