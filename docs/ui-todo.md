# UI 待办清单（守藏面板）——已归档：实现记录

> 状态（2026-09-08 续做）：**T1 + T2 均已落地**。内核数据接口（registerDistill 三函数）+ 跨插件共享引用（deepsleep-share.ts）+ panel 三路由（/deepsleep、/deepsleep/trigger、/deepsleep/config）+ client.js「深度睡眠」视图全部打通，typecheck/build/check-hardcode ✅。下面为原始契约与实现记录。

## 实现记录（2026-09-08）

- **接线**：`index.ts` 先 `applyPanel` 后 `applyScheduler`（共用 ctx）。新增 `src/deepsleep-share.ts` 模块级 `deepSleepShare.api` 惰性桥接：scheduler 启动期写入，panel RPC 请求时读取（读不到=未激活）。无运行时循环依赖（仅 type-only 引 `DeepSleepStatus`）。
- **T1**：client.js 五态徽章（running 绿/ended 灰/probing 蓝闪/suspect 蓝/stalled 红）+ 会话明细（色点 + 停滞时长 + 探测结论 `DS_PROBE_TEXT` 文案）。
- **T2**：计时（已停滞 / 下次入睡倒计时 `dsFmtCountdown` / 上次入睡）+ 控制（立即归纳一次 `POST /deepsleep/trigger` 带 confirm / 暂停到明天 `enableDeepSleep=false`）+ 阈值可调（四个滑块写 `/deepsleep/config` → `~/.dsh/suite/scheduler.json`，原子+备份，重载生效）+ 卡住红告警（`stalled` 或 `probeResult==='stall'` 时显示）。

- **踩坑修复（P0 线上故障）**：`/deepsleep/config` 的 GET 与 POST 曾拆成两次 `route()` 注册，宿主按路径去重 → 抛 `duplicate exact route` → **整个守藏插件树加载失败**（面板/蒸馏/深度睡眠全挂）。已合并为单 handler 按 `req.method` 分发，并在 `route()` 加已注册路径兜底（重复注册仅告警忽略）。

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
- `probeResult` 取值与 UI 文案：`long-run`=正常长任务（**唯一拦睡**）、`suspect`=待复核（阻塞睡眠）、`conflict`=证据冲突（状态活跃但无输出增长，阻塞睡眠待复核）、`stall`=已确认卡住（不阻塞，红告警请人工确认）、`exit`=异常退出（正常睡）、`no-transcript`=探针不可用（重试后仍失败→正常睡，提示排查探针）、`error`=探测异常（正常睡）。
- 计数新增 `suspect`（与 `probing` 同属「未决/阻塞」），UI 上两者都显示为待定色（蓝），`stalled` 红色、`ended` 灰、`running` 绿。
- 可展示末次证据 `probeEvidence`（rounds/samples/deltaBytes/alive/active）与 `stallRound`/`probeRound`，便于排查误判。
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
