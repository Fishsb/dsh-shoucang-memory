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
export type SecretCategory = 'api-key' | 'bearer' | 'jwt' | 'private-key' | 'assign' | 'cn-id';
/** 命中结果。 */
export interface SecretHit {
    category: SecretCategory;
    /** **遮蔽后的**命中文本（只留首尾各 4 字符）—— 供日志，不回显原值。 */
    masked: string;
    /** 原始长度（定位用，不泄内容）。 */
    length: number;
}
/**
 * 扫描文本，返回全部高置信命中（**单一实现**，供 gate 与测试共用）。
 *
 * @param text 待检查的写入内容（全文）。
 * @returns 命中列表（保序、去重按"原始串"）。
 */
export declare function findSecrets(text: unknown): SecretHit[];
/**
 * **就地脱敏**：把全部高置信凭据替换为其遮蔽形态（保留类别语境、去掉明文）。
 *
 * ## 为什么必须有这一件（2026-09-17 实测泄漏）
 *
 * 实测在守藏台账 `~/.dsh/suite/knowledge/audit/ledger.jsonl` 里发现**明文 API 密钥**：
 *   `distill-activation.ts` 写 `activation-step` 时用 `excerpt: text.slice(0, 60)` ——
 *   **原样截 60 字符**，而这条路径**没有走 `findSecrets`**（`distill-write.ts` 那条走了）。
 *   ⇒ 凭据随"审计摘录"落了盘。
 *
 * ## 为什么不能只靠 `findSecrets`
 *
 * `findSecrets` 只**报告**（`SecretHit` 不带偏移，无法就地替换）；
 *   而审计台账不能因检出凭据就整条丢弃（丢的是审计线索）。
 *   ⇒ 需要"遮蔽后仍保留记录"的形态，故在本模块（**单一实现**）补 `redactText`。
 *
 * ## ⚠ 顺序：必须**先脱敏、后切片**
 *
 * 若先 `slice(0, 60)` 再脱敏，落在边界的凭据会被截成**不匹配正则的残段**（如只剩 `sk-5d`）
 *   ⇒ 脱敏失效且明文残段照样落盘。故调用方一律 `redactText(x).slice(0, n)`。
 *
 * @param text 任意文本（非字符串返回空串）
 * @returns 脱敏后的文本（无命中则原样返回）
 */
export declare function redactText(text: unknown): string;
/** 命中即"含凭据"（供 gate 做准入判定的布尔快捷）。 */
export declare function hasSecret(text: unknown): boolean;
/** 供 gate 输出的告警文本（**不回显原值**，只给类别 + 遮蔽前缀）。 */
export declare function secretWarnings(hits: readonly SecretHit[]): string[];
