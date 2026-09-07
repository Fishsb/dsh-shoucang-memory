# dsh-shoucang-memory

DeepSeek Harness (DSH) 记忆插件。**让 DSH 拥有跨会话长期记忆**：

- 🧠 **长期记忆库** — 知识索引 + 画像索引 + 详情库三层结构，每次会话自动加载，越用越懂你
- 🏭 **会话蒸馏** — 会话空闲后自动唤醒，LLM 子代理裁决「什么值得记」，教程式浓缩写回记忆库
- 🖥️ **设置面板** — 侧栏入口：记忆库浏览、蒸馏统计、配置原文编辑，无需改文件
- 🛡️ **白名单门禁** — 写入过闸：不符白名单一律不存，宁缺毋滥

## 🧠 长期记忆库

记忆库分**索引层**与**详情层**：会话开始只加载轻量索引，详情按指针按需召回，不占上下文。

| 索引 | 内容 |
|---|---|
| `MEMORY.md` | 知识索引 — 工具用法 / 工作流 / 教训 / 环境事实，一行一条指向详情 |
| `USER.md` | 画像索引 — 你的偏好、习惯、协作约定 |
| `AGENT.md` | 行为索引 — Agent 自身的工作纪律 |

详情按主题分文件（`notes/tools.md` / `notes/flows.md` / `notes/lessons.md` / `notes/env.md` / `notes/release.md`），容量水位超 85% 触发审计重组，永不无限膨胀。

## 🏭 会话蒸馏（自动沉淀）

会话结束空闲约 10 分钟后自动运行：扫描本轮增量 → 信号词预筛（零 LLM 成本跳过无关会话）→ LLM 子代理按记忆契约裁决 → 过白名单门禁写回记忆库。

- **粒度判定锚** — 只收「下次做类似任务给方向」的粗粒度指引，细碎条文宁可不存
- **拒收留痕** — 被门禁拒绝的条目写审计日志，蒸馏次数 / 入册数 / 拒收分布面板可见
- **断点安全** — 水位推进 + 在途并发守卫，宿主重启不重复蒸馏

## 🖥️ 设置面板

DSH 网页侧栏入口（Obsidian 风格纯 DOM 面板）：

- **记忆库浏览** — 三索引容量卡、notes 分类浏览、小节直达
- **蒸馏统计** — 蒸馏次数、最近时刻、memory/project/discard 路由分布
- **配置管理** — 登记多个守藏根目录、配置原文编辑（备份先行）、布尔项一键开关

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

## 📚 文档

- [CHANGELOG](CHANGELOG.md)
- [记忆规格与纪律](skill/memory-whitelist-spec.md) — 白名单门禁 / R0 路由 / 容量规则
- [蒸馏契约](skill/engine/distill-contract.md)

> 🔒 **隐私**：记忆库全部数据只存本机，不随仓库发布、不上报任何数据。

## 🛠️ 开发

```sh
npm install --legacy-peer-deps
npm run typecheck && npm run build
```

---

License: [Apache-2.0](LICENSE)
