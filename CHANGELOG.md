# Changelog

> shoucang 更新日志。基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### Fixed
- **阶段 2 复审修正（2026-09-06，切换前全面审查）**：① **补回并发守卫**——迁移时遗漏记忆插件原版 `distilling` Set（同会话蒸馏在途标记），蒸馏在途（最长 10min）内再次 turn/end 会重武装定时器导致双写/竞态，已补回（add/finally.delete 配对）；② **pmg 写门双部署口径统一**——skills 副本与 plugins/engine 两处 devref-card.mjs 并存（pmg 治理双部署同步约定），targets.ts `pmgScriptsRoot()` 改双路径探测回退（skills 优先/engine 兜底），index.ts migrate 工具同源引用，消单点漂移；③ 审计双条（writeDispatch 明细 + distillAgent 汇总）保留为有意设计；pending 候选正则放宽为 `\d{4}-\d{2}-\d{2}-*.md`（有意，覆盖 R2 回退文件）。修复后 E2E 6/6 复验通过

### Added
- **ADR-0002 阶段 2 蒸馏器落地（2026-09-06）**：`shoucang-scheduler` 新增 `src/distill.ts`——自记忆插件迁入事件驱动蒸馏机器（session/event turn/end → idle 定时器 → snapshotEvents 水位增量 → 信号词预筛 → spawn 蒸馏子代理 maxDepth=1+persona 委派禁令+toolFilter → JSON 裁决 route=memory|project|discard），**写入分发重接 targets.ts**：动态路由 + 各库白名单门禁（不符合不存、拒收写审计）+ 零拷贝写入（memory-append 经 MEMORY_ROOT 切区 / devref-card 派发 / pmg 缺席落 pending 积压兜底）；水位迁 `suite/knowledge/audit/distill-watermark.jsonl`，新增蒸馏审计 `distill-audit.jsonl`（UI 统计卡数据源）；补强 LLM 路由连败≥2 弃用指定 provider 回落继承（坑位卡原缺陷）。config 增 distill 节（enableDistill 缺省 false——单飞切换时开启）；inject 扩 ['tools','llm','subagents','agents']。验证：**E2E 隔离自测 6/6**（临时 DSH_HOME + mock 子代理驱动全链：事件→增量→预筛→spawn 契约→路由→白名单放行/拒收→真实 memory-append 写入→水位推进→审计留痕）；**连带发现并归一修复记忆插件 runAsync2 退出码恒 0 缺陷**（安全阀拒写被计成功，主仓 commit 1d4d178）
- **ADR-0002 阶段 1 目标层落地（2026-09-06）**：`shoucang-scheduler` 新增 `src/targets.ts`——R0 动态目标路由（memory→记忆插件库→守藏本地三索引；project→pmg 卡库→本地 pending，装配探测复用 registry+profiles 双基准）+ 白名单门禁（各库数据根 `whitelist.json` 自治、蒸馏器只读消费、不符合不存、缺文件回退内建缺省并标注来源）+ `shoucang_targets_probe` 只读自测工具（组合矩阵 4 行 + 现网实测 + 门禁抽样）。守藏本地知识区建成 `$DSH_HOME/suite/knowledge/`（三索引+notes 七类+INDEX 注册表+pending+audit+whitelist.json，与记忆库同构）；维护工具零拷贝复用记忆仓 scripts 验证通过（`MEMORY_ROOT` 指向本地知识区：体检 exit 0 健康、写门 exit 0 允许）。验收：组合矩阵 4/4、门禁抽样 3/3、typecheck 零错误；reload 信号已写（生效待宿主重启/手动注入）
- **ADR-0002 蒸馏固化唯一权迁入守藏 + 阶段 0.5 技术查证（2026-09-06）**：产品原则拍板「守藏必须安装、守藏+任意一个成员插件=自循环」——蒸馏执行权（事件 watcher+spawn LLM 子代理+路由）自记忆插件迁入 scheduler；双库定位（记忆库=泛用元记忆、pmg 卡库=项目知识库分项目/通用两板块）；白名单门禁双端（各库 config 自治、不符合不存、拒收写审计日志）；R0 动态目标路由+降级链（守藏本地三索引兜底，位于 `$DSH_HOME/suite/knowledge/`，维护工具零拷贝复用记忆仓 scripts+MEMORY_ROOT）；UI 读时拉取+蒸馏统计卡；单飞切换。阶段 0.5 查证结论：无需 daemon 形态升级（scheduler 扩 `inject=['tools','llm','subagents','agents']` + `ctx.on` 即可，官方 cordis 契约）；spawn 契约/迁移单元（≈260 行蒸馏机器）/坑位防御清单/白名单跨读候选（倾向库目录 whitelist.json）已落 ADR-0002；F-002 superseded→F-008
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
