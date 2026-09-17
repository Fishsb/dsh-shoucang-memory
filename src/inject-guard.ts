/**
 * inject-guard.ts — 注入边界文本防护（**单一实现**，S-P5 · 2026-09-17）
 *
 * ── 为什么必须有它（根因，非自述）────────────────────────────────────
 * 宿主 `@deepseek-ai/dsh-system-prompt` 的 `interpolate()` 对**每个**
 * section / context 文本做严格 `{{variable}}` 插值，且三处一律 **throw**：
 *   · L158：`{{` 后不成组、**且**其后存在 `}}` ⇒ malformed
 *   · L164：组成立但名不合法（`{{BadName}}` / `{{ orphan }}`）⇒ malformed
 *   · L167：名合法但未注册（`{{name}}`）⇒ unknown
 * throw 直接冒泡到 `system-prompt/assemble` ⇒ **该轮请求整体失败**。
 *
 * ⚠ **精确触发条件（2026-09-17 圆桌会议 verify 节点推翻主持人口径后实测确认）**：
 *   **不是**「含裸 `{{` 即炸」。逐行读宿主 `lib/index.js:151-175` 的循环：
 *   `{{` 之后 `GROUP_AT` 不匹配时，若**无** `}}` 则走 L159-161 **原文透传、不抛**。
 *   只有**完整 `{{...}}` 组**（或 `{{` 与后续 `}}` 并存）才触发三处 throw。
 *   ⇒ 真实引信形态是 `{{.Architecture}}`（docker inspect --format）、
 *     `{{DSH_TOOLS_VERSION}}`（模板命令）这类**成组**串，
 *     而记忆库的写入源正是**用户对话原文**（蒸馏沉淀）。
 *
 * ── 伤害路径（为何本仓会中）────────────────────────────────────────
 * 用户随口跑一次 `docker inspect --format '{{.Architecture}}'` → 蒸馏把该行原文
 * 写进索引行/画像行 → 注入回调把它交给宿主 ⇒ **该会话每轮 assemble 必抛，
 * 且记忆永久在库 ⇒ 会话永久不可用、无法自修**（重启也不恢复）。
 * 取证（2026-09-17 会议）：`~/.dsh/skills/managing-memory` 实测已有 **5 处 `{{`
 * 命中 / 4 文件**，其中 `docs/devref/.../community-repo-deep-dive.md` 那处是
 * **完整 `{{DSH_TOOLS_VERSION}}` 组 = 真 throw 形态**，当前仅因该路径被
 * `.gitignore` 忽略且不在注入面而幸免。
 *
 * ── 为何在**注入出口**处置，而非写入侧（与脱敏的分工）────────────────
 *   ① `{{` 的危险性是**消费面的属性**，不是内容的属性 —— 同一段记忆进消息面 /
 *      面板 / 审计 / 检索都无害，**只有进宿主 interpolate 才有害**；
 *   ② 写入侧转义会**污染真源**（`{{.Architecture}}` 是用户命令原文，转义不可逆），
 *      且会同时改坏 4+ 个消费面（`/inject/preview`、审计台账、检索、深睡材料）；
 *   ③ 注入出口必然**同步且无 IO**：宿主 `assemble` 以同步 `map` 调用本回调
 *      （`dsh-system-prompt/lib/index.js:344-347`）⇒ 此处只能做纯变换。
 *
 * ── 处置策略：打断每一对相邻 `{`（与灵枢 escapePromptBraces 同思路）────
 * 依据宿主 `interpolate` 以 `text.indexOf("{{")` 为**唯一扫描锚点**：
 * 破坏 `{{` 序列后循环不进入该处，文本走 `text.slice(last)` 原样返回。
 *   · `}}` 无需处理 —— 它只在 `{{` 成组时参与解析，锚点已破即无意义；
 *   · 逐对打断（而非 `split('{{').join(...)`）：后者对 `{{{a}}}` 产出 `{ {{a}}}`，
 *     新锚点仍在（相邻 `{` 重新合成）⇒ **不幂等、不安全**；
 *   · **不用零宽字符**：显示上"看起来一样"但复制会带入不可见字符（终端粘贴即出错）
 *     —— 诚实性优先，宁可让改写**可见**（`{{` → `{ {`）。
 *
 * 幂等：结果中不存在 `{{`，重复调用结果不变（有自证用例）。
 * 边界：本函数**只服务注入到宿主 prompt 的文本**；记忆真源、工具返回原文、
 *       面板回显一律不动（`/inject/preview` 保持原文，见下 `guardInjectedText`
 *       的 `preview` 语义 —— 观测面必须与真注入面区分，否则即为假绿）。
 *
 * 单一实现：本件是**唯一**实现点，`panel-inject.ts` 与 `mcl.ts` 两处注入出口
 *   共用（本仓「单一实现」约定；两处各写一份 = 漂移源头）。
 */

/** 宿主严格模板的扫描锚点。 */
const TEMPLATE_OPEN = '{{'

/**
 * 把文本中每一对相邻的 `{` 打断（插入半角空格），使其不再包含 `{{`。
 *
 * 不含 `{{` 的文本**逐字节原样返回**（零改写、保真）。
 * 例：`{{.Architecture}}` → `{ {.Architecture}}`；`{{{a}}}` → `{ { {a}}}`。
 *
 * @param text 即将交给宿主 `assembly.contexts` 的文本；非字符串按空串处理（防御）。
 */
export function guardContextText(text: unknown): string {
  if (typeof text !== 'string' || text.length === 0) return typeof text === 'string' ? text : ''
  if (!text.includes(TEMPLATE_OPEN)) return text
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    out += ch
    // 该 `{` 与下一个字符构成锚点 ⇒ 立即插入空格打断
    if (ch === '{' && text.charAt(i + 1) === '{') out += ' '
  }
  return out
}

/**
 * 判定一段文本是否**会触发**宿主 interpolate 的 throw 路径。
 *
 * 口径与宿主 `lib/index.js:151-175` 逐条对齐（三分支），用于测试与自检：
 *   · 存在完整 `{{name}}` 组（名合法与否都会走 L164/L167）⇒ true
 *   · 存在 `{{` 且其后再有 `}}`（组不成立，走 L158）⇒ true
 *   · 只有落单的 `{{`（其后无 `}}`）⇒ false（宿主透传）
 *
 * ⚠ 本函数**只用于断言与诊断**，不参与注入路径（注入路径只做无条件的打断，
 *   因为"是否成组"依赖宿主变量表，判不准就该一律防）。
 */
export function wouldThrowHostInterpolation(text: unknown): boolean {
  if (typeof text !== 'string' || !text.includes(TEMPLATE_OPEN)) return false
  for (let open = text.indexOf(TEMPLATE_OPEN); open >= 0; open = text.indexOf(TEMPLATE_OPEN, open + 2)) {
    // 分支一：`{{` 之后能立刻闭合成简单组 `{{...}}`（无嵌套花括号）
    const rest = text.slice(open)
    const group = /^\{\{([^{}]*)\}\}/.exec(rest)
    if (group) return true
    // 分支二：组不成立，但其后存在 `}}` ⇒ L158 throw
    if (text.indexOf('}}', open + 2) >= 0) return true
  }
  return false
}
