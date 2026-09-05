# @dsh-external/shoucang-scheduler

守藏调度执行器（suite-manager 只读模块）：注册 `shoucang_suite` 工具——装配检测：扫注入器 registry + profiles 装配清单 vs suite.config members，报 injected/profile/both/missing 状态。

由 dsh-super-injector dev_scaffold_plugin 生成；2026-09-05 由记忆归档调度重定义为 suite-manager（HANDOVER #2）。

## 构建与注入

```bash
# 编译（需类型依赖：junction 接宿主 node_modules 或 DSH checkout）
node <typescript>/bin/tsc -p tsconfig.json
# 注入器环境内：dev_inject_plugin <本目录>
```
