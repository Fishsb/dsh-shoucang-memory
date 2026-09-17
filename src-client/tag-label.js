/**
 * tag-label.js — 索引小节标签的**唯一映射点**（2026-09-17）
 *
 * **设计裁决（用户拍板：方案 B「全部纳入中英文切换，统一标准化」）**：
 *   标签在库里是**原始键**（`env` / `环境` / `身份` …），本模块只在**渲染那一刻**
 *   把它映射成显示名。**库内数据一行不改**——`_memory/**`、`criteria.json#carriers.tags`、
 *   蒸馏/深睡写入路径、`shoucang_recall` 的标签匹配全部保持原样。
 *
 * **为什么是显示层而不是词表规范化**（data-semantics 裁决）：
 *   标签是**注册表键**，扇出面 = criteria.json#carriers.tags(18) → CARRIERS 投影
 *   → targets/mcl/criteria 三层消费，且有 `check-carriers` 明文禁硬编码标签白名单。
 *   规范化要穿透注册表 + 生成物 + 四道机检门 + 两份数据区 + 写入路径 ⇒ 属独立库结构变更
 *   （须 ADR + 迁移器 + 回滚），不在 i18n 范畴。显示层映射同样满足「统一标准化」且零数据风险。
 *
 * **不变式（谁必须吃原始 tag）**：
 *   · idxHue(tag) 色相 —— 否则切语言同一行换色，破坏空间记忆
 *   · TAG_ORDER.indexOf(tag) 排序
 *   · tagCount[tag] 统计
 *   · host 侧 panel-memory.ts 的 `m[1] === '原则'`（数据侧统计，红线禁触）
 *   本模块因此**只导出显示名**，绝不导出「可回流当键」的东西（映射严格单向）。
 *
 * **1:N 撞名（实测）**：`env` 与 `环境` 同显 Environment/环境；`lesson` 与 `教训` 同显 Lesson/教训。
 *   ⇒ 显示名绝不回流当数据键；且渲染方须在**同列表内撞名时**用 originalTag 兜底区分。
 *
 * @module dsh-shoucang-memory/client/tag-label
 */

/**
 * 标签映射表：原始键 → [中文显示名, 英文显示名]。
 *
 * **覆盖面契约**：键集必须 ⊇ `criteria.json#carriers.tags`(18) ∪ `TAG_ORDER`(7)
 *   （实测并集 = 21 键：env/tool/flow/lesson/release/user/agent +
 *    身份/使命/边界/性格/认知/演化/偏好/习惯/原则/路径/经验/教训/环境/硬件）。
 *   由 `scripts/check-i18n-keys.mjs` 断言 D 机检守恒；注册表新增 tag 而未同步本表 ⇒ 红灯。
 */
var TAG_LABELS = {
  // —— agent 索引侧（英文键）——
  env: ['环境', 'Environment'],
  tool: ['工具', 'Tool'],
  flow: ['流程', 'Flow'],
  lesson: ['教训', 'Lesson'],
  release: ['发布', 'Release'],
  user: ['用户', 'User'],
  agent: ['智能体', 'Agent'],
  // —— 用户索引侧（中文键）——
  '身份': ['身份', 'Identity'],
  '使命': ['使命', 'Mission'],
  '边界': ['边界', 'Boundary'],
  '性格': ['性格', 'Trait'],
  '认知': ['认知', 'Cognition'],
  '演化': ['演化', 'Evolution'],
  '偏好': ['偏好', 'Preference'],
  '习惯': ['习惯', 'Habit'],
  '原则': ['原则', 'Principle'],
  '路径': ['路径', 'Task path'],
  '经验': ['经验', 'Experience'],
  '教训': ['教训', 'Lesson'],
  '环境': ['环境', 'Environment'],
  '硬件': ['硬件', 'Hardware'],
}

/**
 * 把原始 tag 译成当前语言的显示名。
 *
 * **兜底三条**（v2.1 §五）：
 *   1. 未知 tag → **原样显示原始 tag**（不折「其他/Other」——那会掩盖新标签漏登记，
 *      与 `renderIndexRows` 既有的「异常可见而不静默」口径一致）
 *   2. 空 / null / undefined → `'?'`（保持现状 `String(tag || '?')`）
 *   3. 映射 miss 时打 Log.warn（开发侧可观测；由调用方注入 logger，避免本模块依赖业务）
 *
 * @param tag 原始 tag
 * @param loc 语言 id（'zh' 表示中文；缺省中文）
 * @param onMiss 可选：miss 回调（用于开发侧告警）
 * @returns 显示名
 */
export function tagLabel (tag, loc, onMiss) {
  var t = String(tag == null ? '' : tag).trim()
  if (!t) return '?'
  var row = TAG_LABELS[t]
  if (!row) {
    if (typeof onMiss === 'function') { try { onMiss(t) } catch (e) { /* noop */ } }
    return t                       // 兜底 1：未知 tag 原样显示（不静默折叠）
  }
  return loc === 'zh' ? row[0] : row[1]
}

/**
 * 是否为本表已登记的 tag（供渲染方判断「是否需要在撞名时附原始键」）。
 * @param tag 原始 tag
 */
export function isKnownTag (tag) {
  return Object.prototype.hasOwnProperty.call(TAG_LABELS, String(tag == null ? '' : tag).trim())
}

export function tagLabelKeys () {
  return Object.keys(TAG_LABELS)
}

/** 中文显示名（供机检断言 D 校验「显示名非空且中英两端齐备」）。 */
export function tagLabelZh (tag) { return tagLabel(tag, 'zh') }

/** 英文显示名。 */
export function tagLabelEn (tag) { return tagLabel(tag, 'en') }
