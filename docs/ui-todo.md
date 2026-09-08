# UI 待办清单（守藏面板）

> 用户拍板登记（2026-09-08）：以下两项**后续**做 UI，本轮只做内核与数据接口，不动样式。

## T1 · 会话状态机可视化（内核已就绪，等 UI）

- 状态：内核 `src/distill.ts` 已实现「会话活跃状态机」，`registerDistill()` 返回 `getDeepSleepStatus()` 快照接口。
- 数据契约（`DeepSleepStatus`）：

| 字段 | 含义 | UI 用法 |
|---|---|---|
| `enabled` / `idleMs` / `probeAfterMs` | 开关与阈值（毫秒） | 面板显示「深度睡眠 开 · 停滞阈值 180min · 探测 180min」 |
| `lastActivityAt` / `lastDeepSleepAt` | 最近有效活动时刻 / 上次入睡时刻 | 显示「已停滞 X 分钟」「上次归纳：时间」 |
| `nextEligibleAt` | 最早可再次触发时刻 | **倒计时**：「预计 X 分钟后入睡」 |
| `running` / `ended` / `probing` / `stalled` | 各状态会话计数 | 四个状态徽章 |
| `sessions[]` | `{ sid, state, lastEventAt, lastEndAt, probeResult }` | 会话列表：状态色点 + 停滞时长 + 探测结论（long-run/stall/exit/no-transcript） |

- 状态配色建议：`running` 绿（活跃）、`ended` 灰（已结束）、`probing` 蓝闪烁（探测中）、`stalled` 红（疑似卡住，需人工确认）。
- `probeResult` 取值与 UI 文案：`long-run`=正常长任务（不睡）、`stall`=疑似卡住（不阻塞，告警）、`exit`=异常退出（正常睡）、`no-transcript`=探针不可用（无法确认→正常睡，提示排查探针）、`error`=探测异常（正常睡）。**只有 `long-run` 会拦住睡眠**。
- 接线点：panel 侧需拿到 `registerDistill` 返回值（当前 scheduler 未接收返回值，`applyScheduler` 里 `registerDistill(...)` 直接丢弃，接线时改为保存引用并挂到 HTTP RPC）。

## T2 · 睡眠/唤醒时间判断的可视化与可调（等 UI）

- 展示：停滞阈值、探测阈值、下次预计触发时间、上次触发结果与产出条数（审计 `kind='deep-sleep'` 的 added/replaced/skipped）。
- 可调：`enableDeepSleep` / `deepSleepIdleMs` / `deepSleepProbe` / `deepSleepProbeAfterMs` / `deepSleepProbeWindowMs` 五个键（自持配置通道 `~/.dsh/suite/scheduler.json` 已支持）。
- 手动：面板「立即归纳一次」按钮（复用 `runDeepSleep` 语义，需暴露触发入口）+ 「暂停到明天」开关（`enableDeepSleep=false`）。
- 告警：审计里 `kind='deep-sleep-probe', result='stall'` 的条目要在面板显著提示（疑似卡住的会话）。

## 关联文档

- 内核设计：`src/distill.ts`（SessRec 状态机注释 + DEEP_SLEEP_PROMPT 契约）
- 规范口径：`skill/audit-protocol.md` §5、`skill/memory-whitelist-spec.md` §5.8
- 路线图：`docs/human-loop-roadmap.md`
