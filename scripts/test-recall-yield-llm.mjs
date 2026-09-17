#!/usr/bin/env node
// test-recall-yield-llm.mjs — **J5 / U3 收益判定升级**（2026-09-16）
//
// 依据：docs/judge-layering-plan-2026-09-15.md §3.3（U3：候选由确定性产出，**判定交 LLM**；
//       "这次检索是否产生实质进展"是语义判断，被降维成 `zeroGain >= 2` 计数）。
//
// 判据（**行为级**，纯函数）：
//   ① **先红（差距实证）**：构造"计数法判该换向、而语义判『帮上了』"的样例 ⇒
//      两法结论**相反**；这正是计数法误判的形态（材料没被引用 ≠ 没帮上）。**钉成断言**。
//   ② 请求**必须写明"未被引用 ≠ 没帮上"**并给出后续动作 —— 否则 LLM 只会复述计数，等于没升级。
//   ③ 解析**严格**：必须 JSON **数组**、每项有数值 `i`、`helped` 只接受 true/false/null；
//      **任一项不合法 ⇒ 整体 null**（半批会静默改变换向链的长度）。
//   ④ 换向口径**保守**：只有明确 `false` 累积；`true` **或未判（null）都打断链** ⇒
//      宁可多试一次，也不因解析失败误换向（换向会丢掉当前来源的上下文）。
//   ⑤ 零 IO、可复现；且**原计数法保留**（确定性第一层仍用于筛候选）。
//
// 用法: node scripts/test-recall-yield-llm.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  shouldSwitchSource, buildYieldRequest, parseYieldJudgements, switchFromJudgements, SWITCH_THRESHOLD,
} from '../lib/recall-yield.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

const rounds = [
  { i: 0, injectedChars: 420, cited: false, nextTools: ['read', 'edit'], nextAction: '改用 grep 直接搜到目标段落并修好了配置' },
  { i: 1, injectedChars: 380, cited: false, nextTools: [], nextAction: '又试了一次同样的注入路径，仍然没解决问题' },
]

console.log('── J5 / U3 收益判定升级（行为级 · 纯函数）──')

// ① 先红：计数法 vs 语义判定 结论相反
{
  const counterSwitch = shouldSwitchSource(2)                    // 连续 2 次未引用 ⇒ 计数法判"该换向"
  const judged = [{ i: 0, helped: true, why: '材料给了方向，只是没直接引用' }, { i: 1, helped: false, why: '确实没帮上' }]
  const semSwitch = switchFromJudgements(judged)
  ok(counterSwitch === true && semSwitch === false,
    `① **先红（差距实证）**：同样两轮未引用 —— 计数法判 \`该换向=${counterSwitch}\`，语义判 \`该换向=${semSwitch}\` ⇒ **结论相反**（计数看不见"没引用但帮上了"）`)
}

// ② 请求必须写明关键前提 + 带后续动作
{
  const req = buildYieldRequest(rounds)
  ok(/未被引用\s*≠\s*没帮上/.test(req), '② 请求写明「**未被引用 ≠ 没帮上**」（否则 LLM 只会复述计数）')
  ok(req.includes('改用 grep 直接搜到目标段落'), '② 请求**带上后续动作**（判"有没有帮上"的唯一依据）')
  ok(req.includes('回合 0') && req.includes('旧信号(被引用)=否'), '② 请求带回合号与引用事实（可对回；文案为「旧信号(被引用)=否」）')
  ok(/\[{"i":0/.test(req), '② 请求写明输出格式（JSON 数组，可严格解析）')
  ok(/判不准[\s\S]{0,20}null/.test(req), '② 请求允许 `null`（**不逼模型猜**）')
  /* J5/U3-判定（2026-09-16）：取证信号已接上 ⇒ 请求**必须带"注入后调用了哪些工具"**，
   *   并**明确告知旧信号恒 false、没有判别力**（否则 LLM 仍会照着恒假信号复述计数）。 */
  ok(req.includes('read → edit'), '② **带注入后的工具名序列**（新取证信号 —— 判"有没有帮上"的主依据）')
  ok(/没有调用任何工具/.test(req), '② 无动作的回合**显式标出**（"注入后没动手"本身是强线索）')
  ok(/旧信号"未被引用"实测恒为 false/.test(req), '② **明确告知旧信号恒 false、无判别力**（否则 LLM 只会复述它）')
}

// ③ 严格解析
{
  ok(parseYieldJudgements('[{"i":0,"helped":true,"why":"a"}]')?.[0]?.helped === true, '③ 合法数组 ⇒ 解析成功')
  ok(parseYieldJudgements('前缀 [{"i":0,"helped":null,"why":""}] 后缀')?.[0]?.helped === null, '③ 允许 null（判不准）')
  ok(parseYieldJudgements('{"i":0,"helped":true}') === null, '③ **对象而非数组 ⇒ null**（不接受单对象）')
  ok(parseYieldJudgements('[{"i":0,"helped":"yes"}]') === null, '③ **helped 非布尔/null ⇒ null**（不接受字符串真值）')
  ok(parseYieldJudgements('[{"helped":true}]') === null, '③ **缺数值 i ⇒ null**（无法对回回合）')
  ok(parseYieldJudgements('[]') === null && parseYieldJudgements('不是JSON') === null, '③ 空数组/非 JSON ⇒ null（**不兜底成空判定**）')
  ok(parseYieldJudgements('[{"i":0,"helped":true},{"helped":false}]') === null, '③ **半批不合法 ⇒ 整体 null**（半批会静默改变换向链长度）')
}

// ④ 换向口径保守
{
  const need = SWITCH_THRESHOLD
  const falses = Array.from({ length: need }, (_, k) => ({ i: k, helped: false, why: '' }))
  ok(switchFromJudgements(falses) === true, `④ 连续 ${need} 个明确 false ⇒ **换向**`)
  ok(switchFromJudgements([{ i: 0, helped: false, why: '' }, { i: 1, helped: true, why: '' }, { i: 2, helped: false, why: '' }]) === false,
    '④ `true` **打断链**（三次里夹一次帮上 ⇒ 不换向）')
  ok(switchFromJudgements([{ i: 0, helped: false, why: '' }, { i: 1, helped: null, why: '' }, { i: 2, helped: false, why: '' }]) === false,
    '④ **未判（null）也打断链** ⇒ 宁可多试一次，也不因"没判出来"误换向')
  ok(switchFromJudgements([{ i: 0, helped: null, why: '' }]) === false, '④ 全未判 ⇒ 不换向')
  ok(switchFromJudgements([]) === false, '④ 空序列 ⇒ 不换向（**不是 true**）')
}

// ⑤ 原计数法保留（确定性第一层仍用于筛候选）+ 零 IO
{
  ok(shouldSwitchSource(1) === false && shouldSwitchSource(2) === true, '⑤ **原计数法保留且行为不变**（确定性第一层，用于筛"疑似零收益"回合）')
  const src = readFileSync(join(root, 'src', 'recall-yield.ts'), 'utf8')
  ok(!/node:fs|readFileSync|require\(/.test(src), '⑤ 本件**零 IO**（纯函数：不读文件、不发请求）')
  ok(!/judgeKind/.test(src), '⑤ 不打判据机制标记（调用点仍待接线 ⇒ 标了就是"假旋钮"）')
  const a = buildYieldRequest(rounds), b = buildYieldRequest(rounds)
  ok(a === b, '⑤ 同输入同输出（可复现）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
console.log('⚠ 边界（写进结论、不进断言）：**LLM 调用点未接线** —— 本件只实现"请求构造 + 严格解析 + 语义换向判定"三件纯函数；')
console.log('   与 J3 同一节奏：先落纯三件（可证），再接调用点（下一轮）。')
process.exit(fail ? 1 : 0)
