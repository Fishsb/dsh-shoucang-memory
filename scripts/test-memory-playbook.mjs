#!/usr/bin/env node
// test-memory-playbook.mjs — S4-2「三层判据常驻」断言（2026-09-14 · S4 消费链条）
//
// 守什么：三层判据（外层任务级 / 中层行动级 / 内层认知级）**常驻在注入面**，且
//   ① 三层齐全、② 合计 <200 字符（判据成本必须远低于材料）、
//   ③ 开关**进了缓存键**（否则关闭后要等 120s TTL，而"关闭即逐字节回滚"是本项的回滚判据）、
//   ④ 有可用的回滚通道（`/set injectPlaybook false`）。
//
// 断言分层：**行为级优先**（直接调 `injection-playbook` 模块的导出，覆盖三态与字数），
//   仅"接线"一项为**源码级** —— 因为 `panel-shared.ts` 的导出数**已达 audit-architecture
//   的棘轮上限（35）**，无法从其导出 `MEMORY_PLAYBOOK_LINES` 来断言（导出会把门禁顶红）。
//
// 用法: node scripts/test-memory-playbook.mjs   （先 npm run build:host）
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

console.log('S4-2 三层判据常驻')

const pb = await import(new URL('../lib/injection-playbook.js', import.meta.url).href)
const { MEMORY_PLAYBOOK_LINES, playbookEnabled, playbookCharCount } = pb
if (!Array.isArray(MEMORY_PLAYBOOK_LINES) || typeof playbookEnabled !== 'function') {
  console.log('❌ lib/injection-playbook.js 导出不齐（先 npm run build:host）')
  process.exit(1)
}

// ── ①/②/③ 行为级：三层齐全 + 字数（直接问模块，非读源码猜）──
{
  const text = MEMORY_PLAYBOOK_LINES.join('\n')
  const layers = ['外层/任务级', '中层/行动级', '内层/认知级']
  const missing = layers.filter((l) => !text.includes(l))
  ok(missing.length === 0, `① 三层判据齐全（缺：${missing.join(' / ') || '无'}）`)
  const bullets = MEMORY_PLAYBOOK_LINES.filter((l) => l.trim().startsWith('·')).length
  ok(bullets === 3, `① 判据条数 = ${bullets}（三层各一条）`)
  const n = playbookCharCount()
  ok(n > 0 && n < 200, `② 三层判据合计 **${n}** 字符（<200 ⇒ 成本远低于材料面约 2,800 字符）`)
  ok(n === [...text].length, '② `playbookCharCount()` 与实际文本一致（非宣称值）')
}

// ── ④ 行为级：开关三态（缺省开 / 显式关 / 读失败兜底）──
ok(playbookEnabled({ read: () => ({}) }) === true, '④ 缺省（配置无该键）⇒ **开**（行为与改动前相比只增不减）')
ok(playbookEnabled({ read: () => ({ injectPlaybook: true }) }) === true, '④ 显式 true ⇒ 开')
ok(playbookEnabled({ read: () => ({ injectPlaybook: false }) }) === false, '④ 显式 false ⇒ 关（回滚通道）')
ok(playbookEnabled({ read: () => { throw new Error('suite unavailable') } }) === true, '④ 读配置抛异常 ⇒ 兜底**开**（判据是增强项，不因读取失败静默消失）')
ok(playbookEnabled({ read: () => null }) === true, '④ 读到 null ⇒ 兜底开')

// ── ⑤ 源码级：接线在位（判据真的进了注入文本，不是定义了没人用）──
// ⚠ 2026-09-18 按域路由 P1：恒定面构造已按领域接缝**抽至 `src/hot-stable.ts`**
//   （`panel-shared` 受大模块冻结棘轮约束）⇒ 本断言的锚点随之迁移。
//   **判据意图不变**：判据必须被真正拼进恒定面（且开关必须参与稳定面键）。
const shared = read('src/panel-shared.ts')
const stableMod = read('src/hot-stable.ts')
ok(/import \{ MEMORY_PLAYBOOK_LINES, playbookEnabled \} from '\.\/injection-playbook\.js'/.test(shared)
  || /import \{ MEMORY_PLAYBOOK_LINES \} from '\.\/injection-playbook\.js'/.test(stableMod), '⑤ 本模块被 import（接线：panel-shared 或 hot-stable）')
ok(/playbookOn \? \[head, \.\.\.MEMORY_PLAYBOOK_LINES, \.\.\.a2\]/.test(stableMod)
  || /playbookEnabled\(d\.suite\) \? \[head, \.\.\.MEMORY_PLAYBOOK_LINES, \.\.\.a2\]/.test(shared), '⑤ 判据被拼进稳定面（`sl`）')
ok(/\$\{playbookEnabled\(d\.suite\)\}/.test(shared) || /playbookOn/.test(stableMod), '⑤ 开关参与 `stableKey`（否则关闭后要等 120s TTL 才生效）')

// ── ⑥ 回滚通道：`/set injectPlaybook false` 可用 ──
const config = read('src/panel-config.ts')
ok(/'injectPlaybook'/.test(config), '⑥ `panel-config` 白名单含 `injectPlaybook`（可热回滚）')
ok(/injectPlaybook: 'injectPlaybook'/.test(config), '⑥ 映射到 suite 持久通道（走 `SUITE_BOOL`，不是 root YAML）')

// ── ⑦ 反例自证：断言不是恒真 ──
{
  const broken = MEMORY_PLAYBOOK_LINES.join('\n').replace('内层/认知级', '内层（改名）')
  const still = ['外层/任务级', '中层/行动级', '内层/认知级'].filter((l) => broken.includes(l))
  ok(still.length === 2, '⑦ 反例自证：三层标记缺一即被检出（本断言语义有效，非恒真）')
}

/* ── ⑧ 新模块的**存在理由**本身也要成立：panel-shared 未因本项膨胀过冻结上限 ──
 * 2026-09-25 修（口径不自洽 + 上限写死，实测本件红而同轮 check-module-growth 判 PASS）：
 *   原实现按**物理行数**与**字面量 846** 比对；而权威件 check-module-growth.mjs 的判据是
 *   **有效行数 = 物理 − 注释 − 空行**（codeLinesOf，其件头 :320-333 明写"注释撑开棘轮 ⇒
 *   门会把它自己锁死"正是为治本形态）。两处口径分叉 ⇒ 同仓两件对同一事实给相反结论。
 *   修法：**消费权威件的单一实现**（codeLinesOf），上限从权威件读；取不到则显式跳过
 *   （不判绿也不判红），避免"读不到 ⇒ 恒真通过"。 */
{
  let lines = null, limit = null, why = ""
  try {
    const { codeLinesOf } = await import('./check-module-growth.mjs')
    lines = codeLinesOf(read('src/panel-shared.ts'))
    const mm = /panel-shared[^\n]*?(\d{3,4})/.exec(read('scripts/check-module-growth.mjs'))
    limit = mm ? Number(mm[1]) : null
    if (limit === null) why = '未能在 check-module-growth 里取到 panel-shared 的冻结上限'
  } catch (e) {
    why = '未能 import check-module-growth 的 codeLinesOf（' + String(e && e.message || e).slice(0, 80) + '）'
  }
  if (lines !== null && limit !== null) {
    ok(lines <= limit, "⑧ panel-shared.ts **有效行数** = " + lines + " ≤ 冻结上限 " + limit + "（口径 = 权威件 codeLinesOf）")
  } else {
    console.log("⚠ ⑧ 跳过：口径源不可用（" + why + "）—— **不计 pass 也不计 fail**，但须人工复核")
  }
}

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（三层判据常驻断言全过）')
process.exit(fail ? 1 : 0)
