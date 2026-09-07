# 架构决策记录（ADR）

> 记录「为什么这样设计」的重大决策，供未来 agent / 人复用，避免重复决策或踩旧坑。
> 新增一条：`node <skill>/scripts/adr.mjs . "<决策标题>"`（自动编号 ADR-XXXX.md）。

| ADR | 标题 | 状态 | 日期 |
|---|---|---|---|
| ADR-0007 | 蒸馏固化执行权移交守藏（suite 单一蒸馏器，单飞切换） | accepted | 2026-09-06 |
| ADR-0006 | 文档树结构分离：私人记忆数据移出公开仓库根（_memory 集中 + MEMORY_ROOT） | accepted | 2026-09-06 |
| ADR-0005 | 知识整理核心抽离 + 双插件归属路由（泛用元记忆 vs 项目知识） | accepted | 2026-09-06 |
| ADR-0004 | 方案 E：蒸馏触发事件驱动化（session/event watcher 替代轮询扫描，消灭轮询/过滤/状态机补丁层） | accepted | 2026-09-05 |
| ADR-0003 | 方案 D：蒸馏固化收敛为 spawn 蒸馏子代理单通道（空闲时长唤醒判定 + 模型可配） | accepted | 2026-09-05 |
| ADR-0002 | 方案 C：归档裁决全自动闭环——插件 LLM 调度 + memory-append 安全阀自动入册（无人工环） | accepted | 2026-09-04 |
| ADR-0001 | 方案 B：会话级定时唤醒归档检测（archive-lib/timer 引擎 + daemon-loop 插件） | accepted | 2026-09-03 |
