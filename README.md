# dsh-shoucang-memory

**[简体中文](README.md) | [English](README.en.md)**

![License](https://img.shields.io/badge/license-Apache--2.0-green) ![DSH](https://img.shields.io/badge/DSH-0.1.2--rc.1-blue) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)

DeepSeek Harness (DSH) 记忆插件。**让 DSH 拥有跨会话长期记忆**：

- 🧠 **长期记忆库** — 画像索引 + 知识索引 + 详情层分层结构，每次会话自动加载，越用越懂你
- 🏭 **会话蒸馏** — 会话空闲后自动唤醒，LLM 子代理裁决「什么值得记」，教程式浓缩写回记忆库
- 🌙 **深度睡眠** — 全部会话停滞后自动归纳「习得原则」进 agent 画像——像人睡前反思：认识自己，也认识用户
- 👤 **成长型 agent 画像** — AGENT.md（角色定位/稳定做法/能力边界/教训/**习得原则**）+ USER.md（用户画像），蒸馏与深睡双入口持续维护
- 🖥️ **设置面板** — 侧栏入口：记忆库浏览、蒸馏统计、参数调节、深度睡眠视图，深浅色跟随宿主主题
- 🛡️ **白名单门禁** — 写入过闸：不符白名单一律不存，宁缺毋滥

> 守藏（shoucang）：取「善于收藏、守而不忘」之意。记忆插件的终态 = 一个**能一直学习、反思、迭代的 agent 助理角色**：蒸馏=学习，深度睡眠=反思，replace 更新=迭代。

## 🧠 长期记忆库

记忆库分**索引层**与**详情层**：会话开始只加载轻量索引，详情按指针按需召回，不占上下文。

| 层 | 内容 |
|---|---|
| `AGENT.md` | agent 自我画像（成长档案）— 角色定位 / 学习史 / 稳定做法 / 常犯错误 / **`[原则]` 习得原则**（深度睡眠归纳的跨任务通用经验，v16 并入此文件），容量 3,000 字符 |
| `MEMORY.md` | 知识索引 — 工具用法 / 工作流 / 教训 / 环境事实，一行一条指向详情 |
| `USER.md` | 用户画像索引 — 你的偏好习惯，蒸馏 + 深睡双通道维护 |
| `notes/*.md` | 详情层（L2）— 按主题分文件（tools / flows / lessons / env / release / user / agent） |

详情容量水位超 85% 触发审计重组；长期零召回的条目自动**降级提纯**（细节下放、经验上收），永不无限膨胀。

## 🏭 会话蒸馏（自动沉淀）

会话结束空闲约 10 分钟后自动运行：扫描本轮增量 → 信号词预筛（零 LLM 成本跳过无关会话）→ LLM 子代理按蒸馏契约裁决 → 过白名单门禁写回记忆库。

- **粒度判定锚** — 只收「下次做类似任务给方向」的粗粒度指引，细碎条文宁可不存
- **项目事实直写工作区** — 项目专属经验直写 `<workspace>/docs/devref/shoucang/`，跨工作区红线隔离
- **拒收留痕** — 被门禁拒绝的条目写审计日志，蒸馏次数 / 入册数 / 拒收分布面板可见
- **断点安全** — 水位推进 + 在途并发守卫，宿主重启不重复蒸馏

## 🌙 深度睡眠（记忆巩固）

全部会话停滞 ≥ 3 小时（可配）自动运行一次归纳 pass：自上次归纳以来的新痕迹（无痕迹则本轮不睡）→ 归纳子代理提炼「习得原则」与画像更新 → write_gate 校验 → 以 `[原则]` 索引行原子写入 `AGENT.md`（**反思双通道**：认识自己 + 认识用户，同步维护 USER 画像）。

- **会话活跃状态机** — RUNNING / ENDED / PROBING / SUSPECT / STALLED 五态，多轮采样 + 多信号交叉区分「正常长任务 / 卡住 / 异常退出」，除长任务外一律正常睡
- **失败可重试** — 瞬时故障回滚水位，重启回放不重复、不丢痕迹

## 🖥️ 设置面板

DSH 网页侧栏入口（纯 DOM 面板，深浅色跟随宿主主题）：

- **记忆板块** — 三索引容量卡、notes 分类浏览、小节直达、蒸馏统计与趋势
- **画像板块** — USER / AGENT 画像指针行，点击直达详情小节
- **参数调节** — 注入档位滑块、布尔开关一键切换，改动即时写回（备份先行）
- **深度睡眠视图** — 五态徽章、会话明细、停滞计时、手动归纳、阈值可调
- **插件集合 / 配置原文** — suite 装配状态、根目录管理、配置 YAML 原文编辑

## 🚀 安装

```sh
dsh plugin --profile web add github:Fishsb/dsh-shoucang-memory
```

安装后重启 DSH（`dsh web`），侧栏出现守藏入口即安装成功。

> 需本机已装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。记忆库数据区默认在 DSH 技能目录下，可经 `MEMORY_ROOT` 环境变量自定义位置。

## ⚙️ 配置

插件配置为扁平单层（面板或 config 文件均可改）：

| 配置项 | 说明 |
|---|---|
| `state_path` | 面板 root 登记表存储位置（默认 `~/.dsh/storages/`） |
| `members` | suite 外部成员注册表（默认空；单插件自足） |
| `enableDistill` | 蒸馏器开关（默认开） |
| `idleWakeMs` | 空闲唤醒阈值（默认 10 分钟） |
| `distillPrescan` | 信号词预筛（默认开，无关会话零成本跳过） |
| `llmProvider` / `llmModel` | 蒸馏子代理指定模型（缺省跟随主会话） |
| `enableDeepSleep` / `deepSleepIdleMs` | 深度睡眠开关与停滞阈值（默认开 / 3 小时） |
| `deepSleepProbe*` | 长任务探测：采样次数 / 确认轮数 / 重试 / 兜底时长 |

## 📚 文档

- [CHANGELOG](CHANGELOG.md)
- [记忆规格与纪律](skill/memory-whitelist-spec.md) — 白名单门禁 / R0 路由 / 四级层级 / 双画像写入口径
- [蒸馏契约](skill/engine/distill-contract.md)

> 🔒 **隐私**：记忆库全部数据只存本机，不随仓库发布、不上报任何数据。

## 🛠️ 开发

```sh
npm install --legacy-peer-deps
npm run typecheck && npm run build
```

---

License: [Apache-2.0](LICENSE)
