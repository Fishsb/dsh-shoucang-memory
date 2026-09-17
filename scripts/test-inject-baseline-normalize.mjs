#!/usr/bin/env node
// test-inject-baseline-normalize.mjs — 对拍门**归一化**的双向自证（2026-09-15 立）
//
// **为什么单独成件**：`inject-baseline-diff` 的 `normalize` 决定该门**在活跃系统里能不能用**：
//   · 归一化**太窄** ⇒ **假红**（记忆库是活的，内容天天变）—— 实测发生过两次：
//       首版只归一化 `- ` 记忆条目，**漏了 `[环·…]` 环记录段** ⇒ 环记录一写就假红。
//   · 归一化**太宽** ⇒ **假绿**（骨架真变了也不报）—— 那这门就白设了。
//   ⇒ 故须**双向**都锁住：内容/条数变**不报**、段增删与顺序变**必报**。
//
// **口径纪律**：本件从被测脚本里**原样提取** `normalize`（不是另写一份）——
//   否则"我测的是我抄的那份"，与真身可能已漂移。
//
// 退出码：0=pass · 1=fail
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

// ── 从被测脚本原样提取 normalize（保证测的是真身）──
const src = readFileSync(join(root, 'scripts', 'inject-baseline-diff.mjs'), 'utf8')
const m = /const normalize = \(t\) => \{[\s\S]*?\n\}/.exec(src)
if (!m) { console.log('❌ 未能从 inject-baseline-diff.mjs 提取 normalize'); process.exit(1) }
// eslint-disable-next-line no-eval
const normalize = eval('(' + '(t) => {' + m[0].slice(m[0].indexOf('{') + 1).replace(/\n$/, '') + ')')

const base = [
  '【守藏·三层判据】',
  '· 外层/任务级：开工前念一遍目标与红线',
  'agent 画像（AGENT.md）：',
  '- [原则] 结果验证重实证 · …',
  '- [原则] 变更先判因备份 · …',
  '用户画像（USER.md）：',
  '- [身份] 中文用户 · …',
  '[环·承诺] 我欠 用户：A',
  '[环·决策] P0 协议层落点',
  '（本步受预算 4000 字符约束省略 3 行）',
].join('\n')

console.log('对拍归一化 · 双向自证（内容变不报 / 骨架变必报）')

// ── A 方向：活的记忆内容变化 ⇒ **不报** ──
ok(normalize(base) === normalize(base.replace('- [原则] 结果验证重实证 · …', '- [原则] 换了一条原则 · …')),
  'A1 记忆条目换文本 ⇒ 不报（记忆库是活的）')
ok(normalize(base) === normalize(base.replace('[环·决策] P0 协议层落点', '[环·决策] 不同的决策\n[环·决策] 又新增一条')),
  'A2 **环记录增减** ⇒ 不报（此为该门首版的漏洞：`[环·…]` 段未归一化）')
ok(normalize(base) === normalize(base.replace('省略 3 行', '省略 27 行')),
  'A3 预算提示数字变 ⇒ 不报')
ok(normalize(base) === normalize(base.replace('用户画像（USER.md）：\n', '用户画像（USER.md）：\n- [偏好] 新增一行 · …\n')),
  'A4 段内新增条目 ⇒ 不报')
// A5（2026-09-17 补）：**预算省略提示「凭空出现」** ⇒ 不报。
//   判因（实测）：`panel-shared.ts:616` 的「另有 N 条知识索引未进入本步注入面」行**只在预算
//   丢弃记忆行时出现** —— 记忆库长到某点后该行凭空出现 ⇒ 旧归一化器未覆盖 ⇒ **门假红**
//   （实测 q="" 骨架不一致，行级 diff 证实唯一差异就是这一行）。本件锁住它不再复发。
ok(normalize(base) === normalize(base.replace(
  '（本步受预算 4000 字符约束省略 3 行）',
  '（另有 2 条知识索引未进入本步注入面，按需 get_file 读取）\n（本步受预算 4000 字符约束省略 3 行）')),
  'A5 预算省略提示凭空出现（`另有 N 条…未进入` 行）⇒ 不报')
// A6：**全部预算提示消失** ⇒ 仍须**报**（否则「省略提示被整体删除」这类结构变化会漏过）
ok(normalize(base) !== normalize(base.replace('\n（本步受预算 4000 字符约束省略 3 行）', '')),
  'A6 全部预算提示被删 ⇒ 报（防归一化过宽致假绿）')

// ── B 方向：结构骨架变化 ⇒ **必报** ──
ok(normalize(base) !== normalize(base.replace('用户画像（USER.md）：\n', '')),
  'B1 删段标题 ⇒ 报')
ok(normalize(base) !== normalize(base + '\n【新段】\n· 内容'),
  'B2 新增段 ⇒ 报')
{
  const swapped = base
    .replace('agent 画像（AGENT.md）：', '\u0000')
    .replace('用户画像（USER.md）：', 'agent 画像（AGENT.md）：')
    .replace('\u0000', '用户画像（USER.md）：')
  ok(normalize(base) !== normalize(swapped), 'B3 段顺序调换 ⇒ 报')
}
ok(normalize(base) !== normalize(base.replace('【守藏·三层判据】', '【守藏·别的标题】')),
  'B4 结构行文本变 ⇒ 报')

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（双向自证：内容变不报 / 骨架变必报）')
process.exit(fail ? 1 : 0)
