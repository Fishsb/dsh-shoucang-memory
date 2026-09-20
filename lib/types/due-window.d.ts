/**
 * due-window.ts — **期限窗口判据**（单一实现 · 2026-09-20 自 `ring-supply` 按领域接缝抽出）
 *
 * 为什么单独成件（**硬理由，不是风格**）：
 *   册三/册四（承诺结算链）要让 `relation-ring#trustOf` 统计"逾期仍 pending"的条数，
 *   而逾期判据**必须与注入面同口径**（同一个 7 天窗）——否则同一个 `due` 在"谁该被想起"
 *   与"谁算逾期"两处会给出不同答案（口径漂移的经典来源）。
 *   但 `relation-ring → ring-supply` 是**逆向**依赖（ring 纯函数层 → 读侧供给层）：
 *   实测它把运行时分层深度顶到 **13 > 10**（`audit-architecture --gate` 当场红）。
 *   ⇒ 按仓内既有出路「按领域接缝单独成件」（同 `probe-plan`/`trigger-plan`/`cue-space` 先例）：
 *     把这条判据下移到**双方都能依赖的低层**，而不是把依赖方向拧过来。
 *
 * 语义（与抽出前**逐字一致**，本件是纯移动）：
 *   `due` 是否「已到或临近」（`at` 起 `windowMs` 内）；**坏时间戳按"无 due"处理，不抛**。
 *   窗口缺省 7 天 —— "临近"的定义由此唯一，不在调用处各写一个数。
 *
 * 消费者（改本件即三者同步）：`ring-supply`（`why:'due'` 分组，**再导出**保持既有 API）
 *   · `relation-ring#trustOf`（逾期计数）· `content-types` 的 `due` 判据登记。
 */
/**
 * `due` 是否「已到或临近」（`at` 起 `windowMs` 内）。
 *
 * 判因（S4-4 · 2026-09-14，抽出时保留原注）：`ring-supply` 早已自述「过期的承诺/意图是
 *   **最该被想起**的（前瞻记忆的失败模式就是漏掉它们）」，但此前 `due` **只在"同组内"按 `dueRank` 排序**
 *   —— 一旦该条未命中情境线索，就落进**兜底组**，于是**永远排在所有命中者之后**（跨组优先级压过组内 due）。
 *   ⇒ 本函数把"到期/临近"提为**独立组**。
 *
 * 纪律（与 `dueRank` 同）：**坏时间戳按"无 due"处理，不抛**。
 */
export declare function dueSoon(meta: Record<string, string> | undefined, at: string, windowMs?: number): boolean;
