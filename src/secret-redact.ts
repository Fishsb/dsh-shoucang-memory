/**
 * secret-redact.ts — 内容级凭据过滤（**单一实现**，B · 2026-09-17 圆桌会议产出）
 *
 * ── 为什么必须有它（已发生事实，非推测）────────────────────────────
 * 圆桌会议主持人实测：`~/.dsh/suite/knowledge/pending/flow-candidates/2026-09-16-dmjyix.md:3`
 * **含明文 API 密钥**（`sk-` + 64 位十六进制，用户原话"这是我的秘钥"），且该目录是
 * **待蒸馏吸收通道** ⇒ 会话原文 → 蒸馏 → 库的链路上**无任何内容级过滤**。
 * 同批扫描另证：`audit/ledger.jsonl:8528` 同一串亦落盘（审计台账 append-only，不可改史）。
 *
 * 会议 security 节点给出的链路证据：该串已进入**出站材料链**
 * （`distill-agent.ts:275-276` 的 `intent` 取自与送进蒸馏 LLM 的同一段材料）。
 *
 * ── 为何落**写入侧**而非注入侧（与 `inject-guard` 的分工，arch 的定层裁决）──
 *   · `{{`（`inject-guard.ts`）的危险是**消费面属性** ⇒ 在**出口**处置；
 *   · 明文凭据的危险是**内容本不该存在** ⇒ 在**入口/写入侧**处置；出口脱敏是"对已泄漏的掩盖"。
 *   ⇒ 同一成因的两个投影，**不可互替**（会议 D4 与 arch Q4）。
 *
 * ── 正则不是判据（security 实测的失效模式，本件如实标注边界）────────────
 *   · **漏网**：`sk-[A-Za-z0-9]{20,}` 对 `sk-proj-AbC-...` 型（含 `-`）、裸 hex、JWT、
 *     中转站自定义格式**全部漏**；用户把 key 分行/加空格即绕过。
 *   · **误杀**：`\d{17}` 命中浮点串 `0.018518518518518517`（本库真实数据，向量分/统计串）。
 *   ⇒ 结论：**正则会漏也会误杀，只能当"降低概率"，不能当判据**。
 *     故本件：① 只报**高置信形态**（宁可少报，避免误杀污染真实内容）；
 *     ② 命中即**替换为定长占位符**（保结构、不留原值）；③ 误报/漏网由测试件显式覆盖。
 *
 * ── 策略：`[已过滤:类别]` 替换（不删行、不改结构）──────────────────────
 * 保留行结构（索引行格式、指针、长度语义不受破坏），仅把**命中串本身**替换为定长占位符。
 * 这样：审计可追溯（能看出"此处曾有凭据"），且**真值不再存在于库内**。
 *
 * 边界：本件**只服务写入侧过滤**（gate 校验用）；不改真源语义、不做自动重写落盘
 *   （gate 是**校验器**，命中即拒写入并要求调用方改写 —— 与既有 exit 语义一致）。
 */

/** 类别标识（进占位符与告警文本，便于定位与统计）。 */
export type SecretCategory =
  | 'api-key'      // sk- / AKIA / ghp_ / xox- 等前缀型
  | 'bearer'       // Bearer <token>
  | 'jwt'          // eyJ… 三段点分
  | 'private-key'  // -----BEGIN … PRIVATE KEY-----
  | 'assign'       // key=value / password: xxx 赋值型
  | 'cn-id'        // 中国大陆手机号 / 身份证（隐私类）

/** 命中结果。 */
export interface SecretHit {
  category: SecretCategory
  /** **遮蔽后的**命中文本（只留首尾各 4 字符）—— 供日志，不回显原值。 */
  masked: string
  /** 原始长度（定位用，不泄内容）。 */
  length: number
}

/**
 * 高置信凭据形态表。
 *
 * ⚠ 设计取舍（security 实测驱动）：**宁可少报，不可误杀** ——
 *   误杀会污染真实记忆内容（本库实测 `\d{17}` 命中浮点即此教训）；漏网只是"没帮上忙"。
 *   故此处**不收录**"长度阈值型"规则（如 `\d{17}` 猜身份证），只收**有明确前缀/结构**的形态。
 */
const RULES: Array<{ category: SecretCategory; re: RegExp }> = [
  // 有明确前缀的凭据（sk- / AKIA / ghp_ / xox-）
  { category: 'api-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { category: 'api-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { category: 'api-key', re: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { category: 'api-key', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  // Bearer 令牌（HTTP 头形态；后随长串才算）
  { category: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g },
  // JWT（三段点分，首段 eyJ）
  { category: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  // 私钥块标记
  { category: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // 赋值型（key=value / password: xxx）——要求值长度 ≥12 且非纯中文，避免误杀叙述性文本
  { category: 'assign', re: /\b(?:api[_-]?key|apikey|access[_-]?token|secret|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{12,}/gi },
  // 中国大陆手机号（11 位、1 开头、有词边界；**不收录 18 位身份证** —— 与浮点/长数字冲突，实测误杀）
  { category: 'cn-id', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
]

/** 遮蔽：只留首尾各 4 字符（与 `scan-secrets.mjs` 同口径，便于互核）。 */
function mask(s: string): string {
  return s.length <= 10 ? '·'.repeat(s.length) : `${s.slice(0, 6)}${'·'.repeat(8)}${s.slice(-4)}`
}

/**
 * 扫描文本，返回全部高置信命中（**单一实现**，供 gate 与测试共用）。
 *
 * @param text 待检查的写入内容（全文）。
 * @returns 命中列表（保序、去重按"原始串"）。
 */
export function findSecrets(text: unknown): SecretHit[] {
  if (typeof text !== 'string' || text.length === 0) return []
  const seen = new Set<string>()
  const out: SecretHit[] = []
  for (const { category, re } of RULES) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const raw = m[0]
      if (seen.has(raw)) continue
      seen.add(raw)
      out.push({ category, masked: mask(raw), length: raw.length })
    }
  }
  return out
}

/** 命中即"含凭据"（供 gate 做准入判定的布尔快捷）。 */
export function hasSecret(text: unknown): boolean {
  return findSecrets(text).length > 0
}

/** 供 gate 输出的告警文本（**不回显原值**，只给类别 + 遮蔽前缀）。 */
export function secretWarnings(hits: readonly SecretHit[]): string[] {
  return hits.map((h) => `检出疑似凭据[${h.category}] ${h.masked}（len=${h.length}）⇒ 请改为占位符或移除后再写入`)
}
