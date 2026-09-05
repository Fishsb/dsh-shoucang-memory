# suite 整合交接方案（给守藏工作区重建治理用）

> 2026-09-06 整合执行记录。本文档是**交接说明**：你将在 `suite/` 重新建立治理方案，
> 本文告诉你：现状是什么、裁决了什么、接什么活、边界在哪。

## 一、suite 现状（迁移完成态）

| 项 | 状态 |
|---|---|
| 代码 | `plugins/shoucang-panel`（UI 192KB 冻结）+ `plugins/shoucang-scheduler`（17KB 骨架）+ `scripts/` |
| 配置模板 | `shoucang.config.example.yaml` **v2**：新增 `suite:` 成员注册表；`archive:/boards:/lifecycle:` 节已删除（废弃拍板） |
| 未迁移 | 旧治理文档（AGENTS/CHANGELOG/CONTRIBUTING 留冻结仓）、docs/ 设计稿（留在冻结仓） |
| node_modules | 已清除（junction 需重建：见下） |
| 旧仓 | D:\lk\FF\shoucang @ c1b607e 冻结存档（README 有声明） |

## 二、定位（已拍板，写进 README v4）

**守藏 = UI + 全部集合插件设置界面 + 协调调度中枢**
- 装守藏 = 获得集合入口；成员（记忆插件/pm g/未来）独立可装
- 守藏不抢业务：知识裁决归记忆插件（R0），项目治理归 pmg
- **UI 暂冻结**（后续适配；先做 scheduler 侧 suite-manager）

## 三、已裁决事项（勿反复）
1. idle-review 归档蒸馏 **废弃**（蒸馏唯一权 = 记忆插件 watcher，协作宪章）
2. 三板块（画像/记忆/wiki）本体 **废弃**（已由记忆库+pmg 卡库承接）
3. 4-Gate **降级复用**为 suite 路由；**G30 证据计数保留**（对接记忆审计 §8）
4. 向量检索 UI **悬置**（后端接记忆检索另行立项）；scnote **保留**

## 四、下一步（建议顺序）
1. **重建治理**（你的活）：`node <pmg-skill>/scripts/init.mjs "D:\FF\shoucang（本仓）"`——注意 suite 是主仓的**子目录**，init 以 suite 为项目根独立成图；或与主仓合并治理（二选一，建议独立，主仓 sync 已把 suite 排除在模块外——见主仓 docs/map）
2. suite-manager 只读模块：scheduler 加 `shoucang_suite` 工具（装配检测：扫 profile 插件清单 vs suite.config members）
3. panel 解冻时：新增「插件集合」视图（成员卡片/状态/一键装）
4. migrationHint 消费：读记忆插件日志（`~\.dsh\super-injector\dsh-managing-memory.log` 的「迁移调度提示」行）→ UI 提示 → 派发 pmg devref-card
5. G30 对接：记忆审计 §8 的核验器

## 五、协调契约速查（与双插件的关系）
- **协作宪章**（裁决序/角色/门禁等价）→ 主仓 `SKILL.md §协作宪章` + pmg `AGENTS.md 规则5`（suite 不重复定义，只消费）
- **蒸馏契约 v2.1**（R0 路由/migrationHint）→ 主仓 `engine/distill-contract.md`
- **卡库写门**（迁移执行端）→ pmg `engine/scripts/devref-card.mjs`

## 六、环境重建备忘
- node_modules：`shoucang-panel`/`shoucang-scheduler` 各自 `npm install`（或沿用原 junction 方式接宿主）
- 插件注入：`dev_inject_plugin` 指向 `suite/plugins/shoucang-panel`（尚未注入运行）
- 构建墙：panel/scheduler 有 tsconfig + scripts/build.sh（原仓 CI 体系），typecheck 先行
