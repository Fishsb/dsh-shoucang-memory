# @dsh-external/shoucang-scheduler

守藏调度执行器 DSH 适配器：注册 shoucang_route / shoucang_verify 工具，实现 G0-G3 门状态机 + boards 板块开关联动 + G30 证据计数

由 dsh-super-injector dev_scaffold_plugin 生成。

## 构建与注入

```bash
DSH_CHECKOUT=<checkout> bash scripts/build.sh
# 注入器环境内：dev_inject_plugin <本目录>
```
