# 开发场景矩阵（规则 5b 配套）

> 改动 daemon / 插件蒸馏链路 / 引擎（archive-*）后，**必过本矩阵**再交付。
> 每个场景 = 一个历史爆雷点；新增爆雷场景随时补录（补录本身计入 CHANGELOG）。
> 状态标记：✅ 已验证 ｜ ⬜ 未覆盖（列为待办）｜ 🔵 不适用（说明原因）

## 场景清单（8+2，2026-09-05 建）

| # | 场景 | 历史爆雷 | 验证方法 | 方案 E 状态 |
|---|---|---|---|---|
| 1 | 会话活跃（turn 进行中 / mtime 新鲜） | 活跃保护 rearm 逻辑反复改 | 观测 turn/end 后 timer 重置、不蒸馏 | ✅ 事件驱动天然（timer 重置即活跃保护） |
| 2 | 会话静默 ≥ idleWakeMs | 唤醒判定三轮改（780s→idleWake 未接线→10min 生效） | turn/end 后停止交互 idleWakeMs → distill 触发 | ✅ 03:08 实测 |
| 3 | 跨天（日期硬编码类） | 候选文件名写死 2026-09-04 | 水位/候选名用运行时日期 | ✅ 通用正则 + 运行时日期 |
| 4 | 宿主重启 / 会话冷存 | resume 报错；冷会话不可 spawn | 重启后 roots() adopt + 水位读回；冷会话走 CLI 兜底 | ✅ adopt 实测（roots=2）；冷会话 CLI 兜底 SKILL 已注 |
| 5 | **reload 多代 fiber 并存** | 幽灵 tick / 双蒸馏 / interval 叠加 | reload 后观察：启动行次数、due tick 是否停、旧 timer 是否清 | ⬜ **部分覆盖**——effect 清理依赖 cordis dispose 语义，实测出现过 4 次启动行并存；待 inject 器 dispose 语义确认（待办） |
| 6 | subagent 会话（origin=subagent） | 蒸馏子代理递归（每 60s API 彻夜） | origin 判据单行过滤 + 事件架构无扫描器 | ✅ 事件架构天然 + spike 实证 |
| 7 | provider/模型故障 | 路由传染 3 连空响应；NO_ADAPTER | listProviders 启动校验 + agentOptions 空=继承 | ✅ 校验已内建；继承语义 spike 实测 |
| 8 | 大转录 / 树过大 | spawnSync 冻结 120s；isSubagentSession 9.4s/个 | 全异步 runAsync；事件架构零扫描 | ✅ 机制性根除（插件零 spawnSync） |
| 9 | 蒸馏子代理委派行为 | 核查员子代理（maxDepth 单跳 + toolFilter 不拦 spawn） | persona 禁委派令 | ✅ persona 已加（软防线）；硬防线=DSH 无跨代 depth 继承（已知边界） |
| 10 | 蒸馏子代理挂死/aborted | 互斥卡死；aborted 误 done 丢内容 | 10min 超时 race + 仅 completed 推水位 | ✅ 方案 E 内建 |

## 待办（构建验证闭环补全，规则 5c）

- [ ] 插件 devDependencies 自包含（npm install：typescript/tsdown/@types/node），`npm run typecheck` 进改动流程
- [ ] src 单源生成 lib（tsdown build 修复 DSH_CHECKOUT 依赖），手写 lib 编辑废弃
- [ ] 引擎 test.mjs 补「会话发现 1 FAIL」基线修复（环境扰动归因）
- [ ] 方案 E watcher 单测（事件注入模拟 turn/end → timer → 蒸馏）

## 已知边界（非缺陷，记录防误判）

- 冷会话（宿主重启前）无事件 → 不自动蒸馏；`archive-timer --due/--drain` CLI 手动兜底
- turn/end 非 completed（error/max-tokens）不触发蒸馏 → 内容滞留至下个 completed turn
- 蒸馏子代理可能单层委派（DSH 无跨代 depth 继承）→ persona 禁令软防线；出现即属模型不遵从 persona，观察记录
- session/event 对注入插件可达（spike 实证），但 scope-filtered 语义随 DSH 版本可能变化 → 升级 DSH 后重跑场景 2/6
