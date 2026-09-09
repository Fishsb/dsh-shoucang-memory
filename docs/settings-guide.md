# 守藏设置项总说明（2026-09-10 三通道版）

> 回答「都有哪些设置项、在哪改、改了管什么、改完怎么生效」。
> 2026-09-10 大收敛：**archive/lifecycle/merge 组与旧向量区已从面板移除**（消费端为 v15 单库化前旧 Python
> 链路，不随包分发，改了无效）；**注入配置迁全局 scheduler.json**（不再挂 root config——切 root 不影响注入）。
> 设置键分**两条真通道**（全局 scheduler.json + 面板 root YAML 仅显示项），无第三条死通道。

## 0. 快速导览：两条真通道

| 入口 | 载体 | 管理什么 | 生效方式 |
|---|---|---|---|
| **面板·参数调节**（主） | `~/.dsh/suite/scheduler.json` | 注入配置（persona/level/预算/三上限/hot_memory）+ 向量开关 | 注入类即时；蒸馏类下一轮触发读取 |
| **面板·深度睡眠页** | `~/.dsh/suite/scheduler.json` | 深睡 5 键 | 重载插件生效 |
| **面板·参数调节（蒸馏节流组）** | `~/.dsh/suite/scheduler.json` | 蒸馏 6 键 | 重载插件生效 |
| **面板·参数调节（向量与模型）** | `~/.dsh/suite/scheduler.json` | 向量开关/provider + 清缓存 | 重载生效（清缓存即时） |
| **面板·配置原文（root YAML）** | 登记的根目录 `shoucang.config.yaml` | 仅 `boards.memory` 显示开关 | 即时 |
| 手写 JSON | `~/.dsh/suite/scheduler.json` | 深睡探测细节等无 UI 键 | 重载生效 |

> ⚠️ **root config 不再是注入配置源**（P1-2 迁全局）。新装用户**不登记 root 也能完整使用**注入/蒸馏/深睡/记忆——
> root 仅管「记忆板块显示开关」这一显示项（可选）。

## 1. 全局注入配置（scheduler.json，参数调节页 · 2026-09-10 迁入）

> 键：`injectPersona` / `injectLevel` / `injectAgentMaxChars` / `injectUserMaxChars` /
> `injectMemoryMaxChars` / `hotMemory`。参数调节页对应控件：
> persona 四档滑块、热记忆强度五档、hot_memory 开关、三板块上限数值框。
> 注入内容 = 双画像（AGENT.md 含 [原则]/[路径] + USER.md）+ 知识索引 MEMORY.md 指针行；
> 参数调节页显示**当前直接注入 ≈ N token** 实时统计（每轮随提示词注入）。
> 2026-09-10 起**无总预算**（注入为薄行指针，不需整体预算裁切；各板块上限独立控）。

| 键 | 缺省 | 范围/枚举 | 作用 |
|---|---|---|---|
| injectPersona | both | off\|me\|you\|both | 画像注入范围：off=不注 / me=只 agent 画像 AGENT.md / you=只用户画像 USER.md / both=双画像 |
| injectLevel | smart | off\|low\|medium\|high\|smart | MEMORY 知识索引热取行数：0/2/4/8/smart=10 |
| hotMemory | true | 布尔 | 注入总闸（关=任何画像与索引都不注入） |
| injectAgentMaxChars | 实际文件量 | 0–20000 | AGENT.md 注入字符上限；**默认=当前实际量（全量）**，设更小才逐行裁切 |
| injectUserMaxChars | 实际文件量 | 0–20000 | USER.md 注入字符上限；同上 |
| injectMemoryMaxChars | 实际文件量 | 0–20000 | MEMORY.md 注入字符上限（档位行数后二次裁切）；同上 |

改动即时反映到下一轮注入（缓存作废）；面板写回自动备份。

## 2. scheduler.json 设置项（蒸馏 + 深睡 + 向量，自持持久通道）

### 2.1 深度睡眠页可调（5 键）
| 键 | 缺省 | 作用 |
|---|---|---|
| enableDeepSleep | true | 深睡归纳总开关（全部会话停滞 ≥ 阈值 → 提炼 [原则] 入 AGENT.md） |
| deepSleepIdleMs | 3h | 无会话活动满此时长触发归纳 |
| deepSleepProbe | true | 输出增长探测（区分长任务/卡住） |
| deepSleepProbeAfterMs | 3h | running 无事件满此时长发起探测 |
| deepSleepProbeWindowMs | 60s | 探测采样间隔 |

### 2.2 参数调节·「蒸馏/深睡模型」卡 + 蒸馏节流组
> **模型配置（2026-09-10 用户拍板：LLM 直接用 Harness 宿主模型体系）**：参数调节页「蒸馏/深睡模型」卡——
> 蒸馏与深睡**各自独立**选宿主模型（Provider→Model 两级下拉，含「继承主会话」空选项）。数据源=宿主模型
> 枚举（先在 Harness 配好模型，这里直接选）。选模型写 scheduler.json，**重载生效**。

| 键 | 缺省 | 作用 |
|---|---|---|
| distillProvider / distillModel | "" | 蒸馏子代理指定宿主 provider/model（空=回落 llmProvider/llmModel→继承主会话） |
| sleepProvider / sleepModel | "" | 深睡归纳子代理指定宿主 provider/model（同上回落） |
| llmProvider / llmModel | "" | 共用回落键（distill/sleep 未单独指定时用；空=继承主会话） |

**节流组**（同区下方）：enableDistill / distillPrescan / idleWakeMs / minTurnChars 见原表（模型项已移至上方卡）。

### 2.3 参数调节·向量与模型（embed 组，2026-09-09）
> UI（2026-09-10 M2 改造，仿 AnythingLLM/Open WebUI）：**Provider 预设卡**（本地 bge-m3 / Ollama / LM Studio /
> 自定义云端 OpenAI 兼容）点选自动填服务地址 → **浏览器直连探测并列出可用模型下拉**（选 Ollama 自动列已装模型；
> 选 bge 类无 /models 的服务自动降级 /health 显示固定模型）→ 选模型保存。对小白：不用手填地址+模型名，点选即可。
| 键 | 缺省 | 作用 |
|---|---|---|
| embedEnabled | true | 语义召回开关（关=纯词法） |
| embedBaseUrl | http://127.0.0.1:9915/v1 | 本地 bge-m3 GPU 或云端 OpenAI 兼容（/v1 根） |
| embedModel | bge-m3 | 嵌入模型（1024d）；**换模型/换服务后点「清缓存重建」**（缓存带 model+baseUrl 指纹，自动失效不混用） |
| embedApiKeyEnv | EMBED_API_KEY | 云端 key 所在环境变量名（本地免 key） |

### 2.4 无 UI（手写 JSON）
| 键 | 缺省 | 作用 |
|---|---|---|
| deepSleepProbeSamples/Confirm/Retries/MaxMs | 3/2/2/10min | 探测细节 |
| deepSleepDaemonParent | false | 无会话兜底守护（未验证路径，保持关） |
| verify_enabled | true | shoucang_verify 回归工具开关 |
| members | [] | suite 外部成员表（结构性配置） |

## 3. 面板 root YAML（shoucang.config.yaml）——仅显示项

> 2026-09-10 后注入键已迁 scheduler.json；root YAML 仅剩 `boards.*` 显示开关（记忆板块显示）。

| 键 | 缺省 | 作用 |
|---|---|---|
| boards.memory | true | 记忆板块显示开关（不控注入内容——注入由 scheduler.json hotMemory 控） |

> 历史遗留：root YAML 里的 `shoucang.injection.*` / `archive.*` / `lifecycle.*` / `merge.*` 段**已退役**
> （旧 Python 链路消费端不随包分发）。若旧 root config 含这些段，面板注入会**回落读取**（兼容迁移），
> 但改它们无效——请用 scheduler.json 注入键。可安全删除这些段。

## 4. 固定常量（不可调节，列此备查）

| 项 | 值 | 说明 |
|---|---|---|
| memoryHome | `~/.dsh/skills/managing-memory` | 记忆库根（固定全局，与 root 无关） |
| suiteKnowledge | `~/.dsh/suite/knowledge` | 蒸馏事实源（固定全局） |
| 容量红线 | MEMORY≤3000 / USER≤2000 / AGENT≤3000 字符 | write_gate 强制 |
| 向量缓存 | `~/.dsh/suite/knowledge/.vector-cache.jsonl` | 行向量缓存（非事实源，可清重建） |

## 5. 已移除（2026-09-10 审查清理，防误导）

- 参数调节：archive/lifecycle/merge 组（归档模式/成熟时长/指纹阈值等）+ 旧「向量检索（召回面）」区
- API：/idle/status /idle/consolidate /vector/status /vector/build /model/list|pull|progress|import|deploy
- 60s 空闲巩固轮心跳（consolidateRound 调 _meta/*.py，已不随包分发）
- 以上消费端均为 v15 单库化前旧 Python 链路；真蒸馏由 distill.ts（turn 结束 idleWakeMs）+ scheduler 驱动

## 6. 常见调节场景速查

| 想做什么 | 改哪 |
|---|---|
| 少注入省 token | 参数调节页：injectLevel → low/medium（或 hotMemory 关）；细调 injectMaxTokens / *_MaxChars |
| 控制画像注入 | 参数调节页 persona 档位（me=只 agent / you=只用户 / off=都不注） |
| 觉得蒸馏太频繁 | 蒸馏节流组：调大 idleWakeMs / minTurnChars / distillPrescan=true（重载生效） |
| 蒸馏换模型 | 蒸馏节流组：llmProvider + llmModel（空=继承主会话） |
| 开/关语义召回 | 向量与模型节：embedEnabled（重载生效） |
| 向量换模型/云端 | 向量与模型节：改 embedModel/baseUrl + **点清缓存重建**（model 指纹防混用） |
| 关闭深睡 | 深度睡眠页 enableDeepSleep 关 |
| 改画像/记忆条目 | 画像板块行尾「编辑」（走 write_gate）；pending 行批准/忽略 |
| 新装上手 | 零配置：注入/蒸馏/深睡/记忆全部缺省可用；root 登记可选（只管 boards 显示开关） |

---
_2026-09-10 三通道重写：死键移除、注入迁全局、旧链路退役对齐；消费点均经源码核验（panel.ts/scheduler.ts/distill.ts/vec.ts）_
