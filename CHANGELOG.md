# Changelog

> shoucang 更新日志。基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### Added
- **守藏迁入为独立集合中枢仓（2026-09-06）**：自 dsh-managing-memory/suite 迁入——UI（plugins/shoucang-panel，暂冻结）+ 调度执行器（plugins/shoucang-scheduler，4-Gate 降级复用为 suite 路由、G30 证据计数保留）+ scripts 合规扫描；配置模板 v2（`suite:` 成员注册表，archive:/boards:/lifecycle: 节删除）；README v4 重定义定位、HANDOVER 交接方案。已裁决事项见 `docs/map/facts.md`（蒸馏唯一权=记忆插件 watcher、旧三板块废弃、向量 UI 悬置、scnote 保留、零硬编码红线）

### Changed
- **治理重建（2026-09-06）**：部署 project-map-governance v3 治理（AGENTS/CLAUDE 入口 + docs/map 三层地图 + facts 用户事实 + ADR-0001 + pre-commit 地图门禁）；治理文档本地化（.gitignore 排除 AGENTS.md/CLAUDE.md/docs/map/）
- **scheduler 重定义 suite-manager 只读模块（2026-09-05，HANDOVER #2）**：`plugins/shoucang-scheduler` 从记忆归档调度（boards 三板块/R1-R5/W1-W3，已拍板废弃）重写为 `shoucang_suite` 装配检测工具——config 内嵌 suite 成员表（默认 memory/governance，对齐 example v2），比对注入器 registry（`$DSH_HOME/super-injector/registry.json`）+ profiles 装配清单（dependencies+bundles）双基准，输出每成员 injected/profile/both/missing 状态与 repo/role；零硬编码路径（运行时 env/home 探测）；v0.0.1→0.1.0；已注入运行（01d0ce4f）

### Added
- **shoucang_suite 工具（2026-09-05）**：只读装配检测，入参 member（过滤）/scope（all|injected|profile）
