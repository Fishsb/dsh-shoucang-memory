// injection-playbook.ts — S4-2（2026-09-14）：**三层判据常驻块**（消费链条）
//
// 判因（`docs/specs/S4-consumption-plan.md` §3.2）：三层判据（外层预见 / 中层监控 / 内层检索）
//   此前**只写在提示词里**（`skill/human-execution-loop.md`），由模型自愿执行 ⇒ **消费链条影响不到它**
//   （`mcl.ts` 头注自述的"材料在场、认知动作不在"）。而材料却按"像不像"铺满注入面（实测约 2,800 字符）。
//   ⇒ 判据**常驻**（三层合计 **147 字符**，成本远低于材料），材料仍按层按需取。
//
// **为什么单独成件**：`panel-shared.ts` 受 `check-module-growth` 的**大模块冻结棘轮**约束
//   （基线 831 行 / 容差 15 ⇒ 上限 846）—— 内联本块会把该模块顶到 **866 行并当场 FAIL**。
//   该门禁给出的出路之一即「**新功能落新模块**」，本件按此办理（不是为拆而拆：判据与装配本属两件事）。
//
// 零依赖（只吃一个 `suite.read` 句柄）、零 IO、无副作用 —— 可独立断言。
// 回滚：`/set injectPlaybook false`（热生效；关闭后注入文本**逐字节**回到改动前）。

/** 三层判据文本行（**常驻注入面**；共 4 行 = 1 标题 + 3 层，合计 147 字符） */
export const MEMORY_PLAYBOOK_LINES: readonly string[] = [
  '【守藏·三层判据（何时该做什么）】',
  '· 外层/任务级：开工前念一遍**目标与红线**；收尾时归因并沉淀。',
  '· 中层/行动级：**连续 2 次无实质进展即停下回溯**；线索变弱即换向；承诺到期主动提。',
  '· 内层/认知级：**先按情境找**（在哪/在做什么/涉及谁），再按内容相似找；证据冗余即停。',
]

/**
 * 开关读取（缺省**开**）。任何异常都按"开"处理 ——
 *   判据是**增强项**（成本 147 字符），读取失败不该让它静默消失；宁可多注入一行，不可无声丢失判据。
 *
 * ⚠ **调用方必须把本开关纳入注入缓存键**（`panel-shared#stableKey` 已如此）——
 *   否则 `/set injectPlaybook false` 后要等 120s TTL 才生效，而"关闭即**逐字节**回到改动前"
 *   正是本项的**回滚判据**（缓存不失效就验不出来）。该注释刻意留在本件而非调用处：
 *   调用方受 `check-module-growth` 冻结棘轮约束，**每行都要省**。
 */
export function playbookEnabled(suite: { read: () => unknown }): boolean {
  try {
    const cfg = suite.read() as { injectPlaybook?: boolean } | null | undefined
    return cfg?.injectPlaybook !== false
  } catch { return true }
}

/** 判据文本字数（供机检与面板显示；**实测值**而非宣称值） */
export function playbookCharCount(): number {
  return [...MEMORY_PLAYBOOK_LINES.join('\n')].length
}
