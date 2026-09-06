# Changelog

> shoucang 更新日志。基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### Added
- **守藏迁入为独立集合中枢仓（2026-09-06）**：自 dsh-managing-memory/suite 迁入——UI（plugins/shoucang-panel，暂冻结）+ 调度执行器（plugins/shoucang-scheduler，4-Gate 降级复用为 suite 路由、G30 证据计数保留）+ scripts 合规扫描；配置模板 v2（`suite:` 成员注册表，archive:/boards:/lifecycle: 节删除）；README v4 重定义定位、HANDOVER 交接方案。已裁决事项见 `docs/map/facts.md`（蒸馏唯一权=记忆插件 watcher、旧三板块废弃、向量 UI 悬置、scnote 保留、零硬编码红线）

### Changed
- **panel 入口双显示修复（2026-09-06）**：0.1.2 契约下 React slot 按钮（`slots.register` 第二参数组件）与 DOM 直插入口（`mountSidebarEntry`）同时显示为两个侧栏入口——暂禁用 slot 按钮（`ENABLE_SLOT_BUTTON = false`），只保留 DOM 直插真实入口；React 组件改按 0.1.2 契约传 register 第二参数（`options.component` 已不被读取，对照 dsh 0.1.2-alpha.3 brand-official 用法）；如需恢复改回 `true`
- **panel 记忆展示补齐审查缺口（2026-09-06）**：记忆板块补渲染 MEMORY.md 46 行知识索引（标签 tag pill 着色 env/tool/flow/lesson/release… + 主题 + notes 指针，点击直达详情小节）；蒸馏 stat 卡从「N 条记录」改为最近蒸馏时刻 + lastSeq + 会话 id，新增「待归档会话」卡（queue.undone，archive-progress 未 done 计数）；notes 小节展开加 ▸/▾ 箭头与高亮状态；画像板块补 USER/AGENT 容量卡并对齐 tag-pill 行结构。统计口径经核验与 memory-append.mjs 同源（去空白计字符，容量 89% 无误）
- **panel 记忆展示接通记忆库事实源（2026-09-06）**：`plugins/shoucang-panel` 画像板块/记忆板块重定义（F-003 落地）——不再读 root 指向的 Obsidian 仓库，改读记忆插件蒸馏 watcher 唯一事实源 `~/.dsh/skills/managing-memory/`（host 运行时探测 DSH_HOME，零硬编码）。host 新增只读端点 `/api/shoucang-panel/memory/overview`（三索引 MEMORY/USER/AGENT 解析 + 容量水位 + pending 计数/最近 + 蒸馏水位 + notes 小节索引）与 `/memory/sections`（notes 白名单按 ## 切片正文，path traversal 防护）；client「画像板块」= USER.md/AGENT.md 指针行（点击直达 notes 小节）、「记忆板块」= 记忆库仪表盘（容量进度条 / stat 卡 / pending 队列 / notes 小节浏览，只读），wiki 导航标注「旧 vault」保留兼容（deprecated）。构建墙修复：原 `.tsbuild` tsc 路径失效 → 以现成 typescript（dsh-temp-janitor node_modules）重编 host + build:client 复制，已热重载生效
- **治理重建（2026-09-06）**：部署 project-map-governance v3 治理（AGENTS/CLAUDE 入口 + docs/map 三层地图 + facts 用户事实 + ADR-0001 + pre-commit 地图门禁）；治理文档本地化（.gitignore 排除 AGENTS.md/CLAUDE.md/docs/map/）
- **scheduler 重定义 suite-manager 只读模块（2026-09-05，HANDOVER #2）**：`plugins/shoucang-scheduler` 从记忆归档调度（boards 三板块/R1-R5/W1-W3，已拍板废弃）重写为 `shoucang_suite` 装配检测工具——config 内嵌 suite 成员表（默认 memory/governance，对齐 example v2），比对注入器 registry（`$DSH_HOME/super-injector/registry.json`）+ profiles 装配清单（dependencies+bundles）双基准，输出每成员 injected/profile/both/missing 状态与 repo/role；零硬编码路径（运行时 env/home 探测）；v0.0.1→0.1.0；已注入运行（01d0ce4f）

### Added
- **shoucang_suite 工具（2026-09-05）**：只读装配检测，入参 member（过滤）/scope（all|injected|profile）
- **shoucang_verify 回归（2026-09-05，HANDOVER #5）**：G30 证据计数（claims≤evidence 只信工具实证），输出对齐记忆审计 §8 第三问（route 分流质量抽验：route/project_cards/落点），config.verify_enabled 控制
- **shoucang_migrate 工具（2026-09-05，HANDOVER #4）**：migrationHint 消费——尾读记忆插件日志（$DSH_HOME/super-injector/dsh-managing-memory.log）解析「迁移调度提示」行（近 24h 计数 + 明细），读目标项目 devref/pending 积压（≥3 张过阈值），输出 pmg devcard 派发命令（目标=参数 project 或 config default_project，运行时探测 pmg 引擎路径，零硬编码）；只读不代执行写卡（守藏只调度，写卡归 pmg）
- **panel「插件集合」视图（2026-09-05，HANDOVER #3）**：host 增 GET /api/shoucang-panel/suite（registry+profiles 双基准扫描，与 scheduler 同算法）；client VIEWS 增「插件集合」页（成员卡片：id/包名/状态/repo/role），旧「板块与管线」页标 deprecated（F-003 对齐）

### Changed
- **panel client 迁移到 slot 契约（2026-09-05，解冻前置）**：client.js 注入声明加 `'slots'`，入口从直插侧栏 footArea DOM 改为注册 `sidebar.footer.action` 插槽按钮（无 slots 环境保留直插兜底）；host+client 已注入运行（ef85e372），构建产物 lib/ 重建
