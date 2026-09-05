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
- **shoucang_verify 回归（2026-09-05，HANDOVER #5）**：G30 证据计数（claims≤evidence 只信工具实证），输出对齐记忆审计 §8 第三问（route 分流质量抽验：route/project_cards/落点），config.verify_enabled 控制
- **shoucang_migrate 工具（2026-09-05，HANDOVER #4）**：migrationHint 消费——尾读记忆插件日志（$DSH_HOME/super-injector/dsh-managing-memory.log）解析「迁移调度提示」行（近 24h 计数 + 明细），读目标项目 devref/pending 积压（≥3 张过阈值），输出 pmg devcard 派发命令（目标=参数 project 或 config default_project，运行时探测 pmg 引擎路径，零硬编码）；只读不代执行写卡（守藏只调度，写卡归 pmg）
- **panel「插件集合」视图（2026-09-05，HANDOVER #3）**：host 增 GET /api/shoucang-panel/suite（registry+profiles 双基准扫描，与 scheduler 同算法）；client VIEWS 增「插件集合」页（成员卡片：id/包名/状态/repo/role），旧「板块与管线」页标 deprecated（F-003 对齐）

### Changed
- **panel client 迁移到 slot 契约（2026-09-05，解冻前置）**：client.js 注入声明加 `'slots'`，入口从直插侧栏 footArea DOM 改为注册 `sidebar.footer.action` 插槽按钮（无 slots 环境保留直插兜底）；host+client 已注入运行（ef85e372），构建产物 lib/ 重建
