# 用户确定事实（User-Confirmed Facts）

> 记录用户在本项目开发过程中拍板确定的事实。**active 事实 = 已确认的开发约束——禁止破坏**；
> 开发与事实冲突 → 停下升级用户决策；用户方向变动 → 同步评估受影响事实、询问用户后更新。
> 状态：`active` ｜ `superseded`；superseded 必须保留冲突处理记录（用户决策历史，勿删）。
> 每条建议带「约束范围」（反引号路径/模块/关键词）供 check 检测变更是否触及。

## 事实

<!-- 模板：
### [F-001] 事实标题
- 状态：active
- 确认日期：YYYY-MM-DD
- 约束范围：`<路径或模块>`、`<关键词>`
- 事实：<用户确定的内容，禁止破坏>
- 冲突处理：（active 留空；superseded 填：原由 / 新方向 / 用户决策）
-->

### [F-001] 守藏定位=插件集合中枢，不抢业务
- 状态：superseded
- 确认日期：2026-09-06
- 约束范围：`docs/map/facts.md`、关键词 `suite`、`集合中枢`
- 事实：守藏（Shoucang）= UI + 全部集合插件设置界面 + 协调调度中枢；装守藏=获得集合入口，成员插件（记忆插件/pmg/未来…）独立可装可用。守藏不抢业务：知识裁决归记忆插件（R0 路由），项目治理归 pmg——守藏只管「装没装、状态如何、迁移派发」。定位权威=README + 本表；改动定位须经本表登记。
- 冲突处理：2026-09-07 用户拍板记忆栈整体退役（ADR-0003）——守藏插件从 dsh-web 下线归档（软链删除，仓库保留），「集合中枢」定位随插件退役转历史；本事实 superseded，本仓冻结为归档仓。

### [F-002] 归档蒸馏唯一权归记忆插件 watcher
- 状态：superseded
- 确认日期：2026-09-06
- 约束范围：`docs/map/facts.md`、`shoucang.config.example.yaml`、关键词 `archive:`、`idle-review`、`蒸馏`
- 事实：idle-review 归档蒸馏方向**废弃**（原 archive:/boards:/lifecycle: 配置节已删）；蒸馏唯一权=@dsh-external/dsh-managing-memory 事件驱动 watcher（ADR-0004 方案 E），守藏只做迁移派发（migrationHint 消费），绝不重复实现蒸馏。代码层禁止在守藏任何插件恢复蒸馏/归档链路。
- 冲突处理：2026-09-06 用户拍板产品原则「守藏必须安装、守藏+任意一个成员插件即自循环」，现网「守藏+pmg 无记忆插件=无法知识积累」直接违背该原则——蒸馏执行权整体迁入守藏（watcher+LLM 子代理+路由），机械引擎零拷贝复用记忆仓 scripts，R0 目标动态路由，单飞切换。详见 ADR-0002；新事实见 F-008。

### [F-008] 蒸馏固化唯一权归守藏（suite 单一蒸馏器），守藏+任意一个成员插件即自循环
- 状态：superseded
- 确认日期：2026-09-06
- 约束范围：`docs/map/decisions/ADR-0002.md`、`docs/map/facts.md`、关键词 `蒸馏唯一权`、`单一蒸馏器`（2026-09-06 收窄：原全路径 `plugins/shoucang-scheduler` 命中即拦，ADR-0002 授权的阶段实现代码被误拦——按协作宪章「拦截即升级用户拍板」，用户已拍板 ADR-0002 及其阶段计划，实现代码为执行事实而非破坏；收窄后语义敏感面=ADR-0002 决策 1-5 方向与本表事实内容，行为纪律由 ADR 状态门禁+地图 check 承担）
- 事实：蒸馏执行权（事件 watcher 触发 + spawn LLM 子代理裁决 + distill-contract 路由）归守藏 scheduler，**任一时刻全系统只有一个活跃蒸馏器**。机械引擎（archive-lib/check/candidate_grep）零拷贝复用记忆仓 scripts（不搬代码）。**双库定位**：记忆库=泛用元记忆（画像/教训/工作流，非项目绑定）；pmg 卡库=项目知识库分两板块（项目板块=绑定被治理项目、通用板块=跨项目规则/资料文档）。**白名单门禁双端**：各库白名单配置归各插件自己（记忆插件 config / pmg config），守藏蒸馏器只读消费——蒸馏产出判归属后过目标库白名单校验，**不符合不存**（拒收不回退他库，写审计日志）。R0 目标动态路由：memory→记忆插件库→守藏本地三索引；project→pmg 卡库（项目/通用板块）→守藏本地待办区。守藏本地知识区=与记忆库同构轻量三索引。蒸馏配置（空闲唤醒时长缺省 10min、子代理模型缺省跟随会话）归守藏 config `distill:` 节。验收=组合矩阵（守藏+记忆／守藏+pmg／三者全装）；守止单装不作验收场景。切换=单飞（先关记忆 watcher 再开守藏）。设计权威=ADR-0002。
- 冲突处理：2026-09-07 用户拍板记忆栈整体退役（ADR-0003）——守藏 scheduler 与蒸馏器随插件下线，suite 知识区转只读；蒸馏唯一权语境消失，本事实 superseded。若未来重启蒸馏，须先比对 suite 水位与 dsh-auto-memory 沉淀防重复。

### [F-003] 旧记忆三板块（画像/记忆/wiki）废弃
- 状态：active
- 确认日期：2026-09-06
- 约束范围：`docs/map/facts.md`、关键词 `板块与管线`、`boards.memory`、`boards.wiki`
- 事实：panel 内画像/记忆/wiki 三板块功能本体废弃——已由记忆库（managing-memory）+ pmg 卡库（devref-card）承接；panel 后续按集合需求重建视图（新增「插件集合」视图；旧记忆板块路由标 deprecated-候选），不得恢复旧三板块业务（导航可保留 deprecated 标记的兼容页，不得重建 boards.memory/wiki 开关链路）。
- 冲突处理：

### [F-004] 4-Gate 降级复用为 suite 路由，G30 证据计数保留
- 状态：active
- 确认日期：2026-09-06
- 约束范围：`docs/map/facts.md`、`shoucang.config.example.yaml`、关键词 `boards:`、`R1-R5`、`shoucang_route`
- 事实：scheduler 原 4-Gate 记忆归档门状态机降级复用为 suite 路由（G0 bypass/G1 读状态/G2 写编排/G3=G30 验证），原记忆归档路由（boards 三板块/R1-R5/W1-W3）退役；**G30 证据计数保留**（对接记忆审计 §8 验收器）。代码层禁止恢复旧 boards/R1-R5 记忆归档路由语义。
- 冲突处理：

### [F-005] 向量检索 UI 悬置，scnote 保留
- 状态：active
- 确认日期：2026-09-06
- 约束范围：`docs/map/facts.md`、关键词 `向量检索`、`vector/status`、`model/list`
- 事实：向量检索 UI **悬置**（后端接记忆检索另立项目，不在守藏内复活；面板内既有向量/模型只读页保留但不得重建后端链路）；scnote 功能**保留**。
- 冲突处理：

### [F-006] 零硬编码本机路径红线（开源合规）
- 状态：active
- 确认日期：2026-09-06
- 约束范围：`scripts/check-hardcode.mjs`、`shoucang.config.example.yaml`、关键词 `硬编码`
- 事实：沿袭原仓红线——代码与配置模板零硬编码本机路径（Windows 盘符/用户目录）；`scripts/check-hardcode.mjs` 为机检执行器，违规即 CI 失败。治理文档（AGENTS/CLAUDE/docs/map）本地化不入发布仓（.gitignore 强制）。
- 冲突处理：

### [F-007] 配置模板为 v2：suite 成员注册表，禁止复活旧节
- 状态：active
- 确认日期：2026-09-06
- 约束范围：`shoucang.config.example.yaml`、关键词 `suite`、`archive:`、`boards:`、`lifecycle:`
- 事实：`shoucang.config.example.yaml` 已是 v2——`suite:` 节（成员注册表）为现行结构；`archive:`/`boards:`/`lifecycle:` 节已删除（拍板废弃），禁止恢复。
- 冲突处理：
