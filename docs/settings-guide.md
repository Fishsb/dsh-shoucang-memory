# 守藏设置项总说明（2026-09-09）

> 回答「都有哪些设置项、在哪改、改了管什么、改完怎么生效」。按调节通道分三大面板 + 一类隐性键 + 一类固定常量。
> 消费点均经源码核验（src/panel.ts、src/distill.ts、src/scheduler.ts、default-vault-template 内 _meta/*.py、client.js）。

## 0. 快速导览：三个调节入口

| 入口 | 文件 | 怎么改 | 怎么生效 |
|---|---|---|---|
| **面板·参数调节页** | `<面板根目录>/shoucang.config.yaml` | 布尔开关 / 滑块 / 下拉，写前自动备份 `.bak-*` | 注入类立即生效；蒸馏/归档类下一轮触发时读取 |
| **面板·深度睡眠页** | `~/.dsh/suite/scheduler.json` | 5 个滑块 + 立即归纳按钮 + 暂停到明天 | **需重载插件/重启宿主生效** |
| **面板·参数调节页（蒸馏节流组）** | `~/.dsh/suite/scheduler.json` | 蒸馏节流 6 键：开关 / 预筛 / 空闲分钟 / 最少字符 / 模型 provider+model | 同上，重载生效 |
| **手写 JSON** | `~/.dsh/suite/scheduler.json` | 深度睡眠探测参数等无 UI 键手写 | 同上，重载生效 |

---

## 1. 面板 YAML 设置项（shoucang.config.yaml）

### 1.1 boards.* —— 面板板块显隐

| 键 | 缺省 | 作用 |
|---|---|---|
| boards.persona | true | 画像板块（USER/AGENT 指针）显示 |
| boards.memory | true | 记忆板块显示；**同时是热记忆注入的总闸**（关了它，hot_memory 开着也不注入） |
| boards.wiki | false | 旧 vault 导航（deprecated，保留兼容） |

### 1.2 injection.* —— 每轮热记忆注入（指针式：agent 画像 + 用户画像 + 知识索引）

> v16 起注入面=**agent 画像（AGENT.md，含 [原则] 习得原则）+ 用户画像（USER.md）+ 知识索引（MEMORY.md）**；PRINCIPLES.md 独立原则层已退役（并入 AGENT.md）。

| 键 | 缺省 | 范围/枚举 | 作用与消费点 |
|---|---|---|---|
| hot_memory | true | 布尔 | 总开关。关=本轮提示词不带任何守藏记忆（画像与知识索引全不带）。panel.ts buildHotMemoryText |
| level | smart | off\|low\|medium\|high\|smart | MEMORY.md 知识索引热取行数：off=0 / low=2 / medium=4 / high=8 / smart=10。画像索引不受档位限制 |
| persona | both | off\|me\|you\|both | ✅ **v16 已接通生效**：off=不注入画像 / me=只注入 agent 画像 AGENT.md / you=只注入用户画像 USER.md / both=双画像（默认）。面板四档滑块 |
| max_tokens | 3000 | 100–8000 | ✅ **v16 已接通生效**：注入总预算（token，中文粗估 ~2 字符/token），超出整体裁切 |
| agent_max_chars | 0 | 0–20000 | ✅ v16 新增：AGENT.md（含 [原则] 行）注入字符上限，逐行裁切不切半行；**0=不裁**（默认，靠容量门 3,000 兜底），裁切发生时注入尾注提示 |
| user_max_chars | 0 | 0–20000 | ✅ v16 新增：USER.md 注入字符上限；0=不裁（默认，容量门 2,000 兜底） |
| memory_max_chars | 0 | 0–20000 | ✅ v16 新增：MEMORY.md 注入字符上限（在档位行数基础上二次裁切）；0=不裁（默认） |

### 1.3 archive.* —— 空闲巩固轮（会话静默后的自动蒸馏+结算心跳）

| 键 | 缺省 | 范围 | 作用与消费点 |
|---|---|---|---|
| enabled | true | 布尔 | 心跳总开关（面板可 toggle） |
| idle_review_ms | 600000 | 60000–3600000（1–60 分钟） | 会话静默满此时长触发一轮巩固（蒸馏最新会话 + 到期结算）；**0=禁用**。panel.ts consolidateRound |
| ttl_multiplier | 1（模板 2） | 0.5–10 | 归档保留时长 = 来源层档位时间 × 本值，到期销毁。→ _meta/lifecycle_settle.py archive-sweep |

### 1.4 lifecycle.* —— 结算（日记忆成熟归档 / 过期销毁）

| 键 | 缺省 | 范围 | 作用与消费点 |
|---|---|---|---|
| enabled | true | 布尔 | 结算总开关 |
| interval_hours | 24 | 1–168 | 结算运行间隔；**0=禁用**。panel.ts consolidateRound 结算步 |
| archive.apply_confirm | true | 布尔 | **开**=蒸馏附带归档只出 DRY 报告（需显式 --apply）；**关**=随蒸馏直接归档落盘。→ explicit_facts_extractor.py / lifecycle_settle.py |
| archive.min_confidence | 60（模板 50） | 0–100 | 置信度达标才归档，低分留日记忆继续 decay。→ lifecycle_settle.py |
| archive.age_days | 7（模板 1） | 0.1–30 | 日记忆中至少停留天数（成熟时长）。→ lifecycle_settle.py |
| archive.mode | age | age\|fixed | age=按成熟时长触发；fixed=每日固定时刻触发 |
| archive.fixed_time | "21:30" | HH:MM | mode=fixed 时生效（须带引号防 YAML 时间对象）。→ lifecycle_settle.py |

### 1.5 merge.* —— 合并写门（同名入库时的判定）

| 键 | 缺省 | 范围 | 作用与消费点 |
|---|---|---|---|
| enabled | true | 布尔 | 归档移动时启用规则层合并去重 |
| fingerprint_threshold | 0.85 | 0.1–1 | 正文指纹 Jaccard ≥ 此值 = 完全重复（并入元数据，不新建）。→ merge_check.py |
| complement_floor | 0.3（模板 0.4） | 0.05–0.9 | 指纹低于阈值但 ≥ 此值 = 补充合并（正文 append「## 补充」）；低于此值 = 视为改版/矛盾走时序 supersede。→ merge_check.py |

### 1.6 其他

| 键 | 缺省 | 作用 |
|---|---|---|
| idle.sessions_dir | ""（空） | 空闲巩固轮读的会话文件目录；**空=自动探测** `$DSH_HOME/sessions`（或 env SHOUCANG_SESSIONS_DIR） |
| embedding.base_url / model / dimension / api_key | 部署自动写入 | 向量检索端点。**禁手工编辑**（模型部署/导入时自动写入，2026-08-27 拍板）；api_key 仅模板有，端点需鉴权时填 |

---

## 2. scheduler.json 设置项（深度睡眠 + 蒸馏器，自持持久通道）

> 面板「深度睡眠」页 5 键可滑块调节，「参数调节」页底部「蒸馏节流」组 6 键可调（2026-09-09 接通）；其余只能手写 `~/.dsh/suite/scheduler.json`（键名即下表键名）。改动均需**重载插件/重启宿主**生效。

### 2.1 面板可调（5 键）

| 键 | 缺省 | 作用 |
|---|---|---|
| enableDeepSleep | true | 深度睡眠归纳总开关（全部会话停滞 ≥ 阈值 → 自动提炼 `[原则]` 习得原则写入 AGENT.md，**反思双通道**同步维护 USER 画像）；关=即「暂停到明天」按钮效果 |
| deepSleepIdleMs | 10800000（3h） | 无任何会话活动持续满此时长 → 触发归纳 |
| deepSleepProbe | true | 输出增长探测开关：running 会话长时间无事件时，采样转录文件区分「长任务」还是「卡住」 |
| deepSleepProbeAfterMs | 10800000（3h） | running 无事件满此时长发起探测 |
| deepSleepProbeWindowMs | 60000（60s） | 探测采样间隔 |

### 2.2 面板可调 · 蒸馏节流组（6 键，2026-09-09 接通）

> 位置：面板「参数调节」页底部「蒸馏节流（运行时通道）」分组，经 `GET/POST /distill/config` 读写同一 `scheduler.json`。
> 此 6 键此前只有插件 Config（schemastery UI 改了不持久），只能手写 JSON —— 现已全部面板化。**改动需重载插件/重启宿主生效**（写的是自持配置文件，scheduler 启动时才覆盖 Config 缺省）。

| 键 | 缺省 | 作用 |
|---|---|---|
| enableDistill | true | 守藏蒸馏器总开关。关=不注册蒸馏器（/suite 等只读视图仍可用） |
| distillPrescan | true | 零成本预筛：spawn 前扫增量信号词 + pending 候选，皆无则跳过（不唤醒 LLM） |
| idleWakeMs | 600000（10min） | turn 结束后空闲满此时长才蒸馏（面板按**分钟**输入，≥1 分钟）——控制触发频率 |
| minTurnChars | 200 | 本轮新增正文少于此字符数跳过蒸馏（水位仍推进）；0=不设限 |
| llmProvider / llmModel | ""（继承主会话） | 蒸馏/归纳子代理指定模型；留空=继承主会话模型（连败 ≥2 次自动回落继承） |

### 2.3 无 UI（手写 JSON）

| 键 | 缺省 | 作用 |
|---|---|---|
| deepSleepProbeSamples | 3 | 每轮探测采样次数，任一次检出增长即判长任务 |
| deepSleepProbeConfirm | 2 | 判「卡住」需连续无增长的轮数，首轮落 suspect 阻塞待复核 |
| deepSleepProbeRetries | 2 | 探针异常重试次数 |
| deepSleepProbeMaxMs | 600000（10min） | 单轮探测总时长兜底（防悬挂） |
| deepSleepDaemonParent | false | 无会话场景兜底：自建守护 parent 承载归纳子代理（**未验证路径，保持关**） |
| distillPrompt | "" | 蒸馏子代理 persona 覆盖（空=内建 v4 契约），高级键 |
| verify_enabled | true | shoucang_verify 回归工具开关 |
| members | [] | suite 外部成员表（结构性配置，非调节属性） |

---

## 3. 隐性设置键（模板 YAML 有、面板白名单没有，脚本实际消费）

> 位于面板根目录 shoucang.config.yaml，可手改（无 UI、无备份保护），_meta 脚本运行时读取。

| 键 | 缺省 | 消费点 | 作用 |
|---|---|---|---|
| distill.llm.enabled / base_url / model / api_key | false / 空 | explicit_facts_extractor.py | 空闲轮事实提取走 OpenAI 兼容端点（不配=纯规则提取） |
| distill.activity.* | — | explicit_facts_extractor.py | 提取活动门槛（0=关闭该门槛） |
| archive.staging.memory_daily_dir / archive_dir / direct_write_types | 记忆/日记忆 / 归档 / [persona,pre_skill,note] | 写路由 | memory 类暂存终点与免暂存直写类型 |
| merge.apply / merge.llm_fallback | false / false | merge_check.py | 全局落笔默认关；模型层合并可插拔 |
| lifecycle.tiers.daily.dir / decay | 记忆/日记忆 / 5 | lifecycle_settle.py | 日记忆层目录与衰减档位 |
| lifecycle.expire.confidence_floor / zero_hit_cycles | 10 / 2 | lifecycle_settle.py | 过期销毁判据（低置信 + 连续零命中轮数） |
| lifecycle.archive.default_dir | 参考 | lifecycle_settle.py | 未知 subtype 的默认长期目录 |

> v16 注：模板 YAML 原 `injection.smart.*` 残留节（零消费）已被替换为上述新增的容量上限键，不再存在。

---

## 4. 固定常量（不可调节，列此备查）

| 常量 | 值 | 位置 | 说明 |
|---|---|---|---|
| 注入档位→行数 | low 2 / medium 4 / high 8 / smart 10 | panel.ts | 仅限 MEMORY 知识索引；画像板块由 persona 档位与 max_chars 上限控制 |
| 注入预算 max_tokens | 3000 token（≈6000 字符裁切线） | panel.ts | v16 接通；超出整体裁切加提示尾注 |
| MAX_PY_PER_ROUND | 24 | panel.ts | 单轮巩固 py 调用配额（风暴防护） |
| MAX_WRITES_PER_RUN | 15 | panel.ts | 单轮落笔上限（2026-08-27「101 条垃圾入库」教训产物） |
| DEEP_SLEEP_CHECK_MS | 10min | distill.ts | 深度睡眠巡检间隔（入睡检测粒度） |
| 画像容量 PROFILE_CAP | 3000（AGENT）/ 2000（USER） | distill.ts | 画像直写容量门（v16 AGENT 扩容） |
| 写门容量 LIMITS | MEMORY 3000 / USER 2000 / AGENT 3000 字符 | memory_write_gate.mjs | spec v16 协议容量（PRINCIPLES 已退役） |
| 容量警戒线 | 85% | memory_health_check.mjs | 超线体检告警 |
| 遗忘降级判据 | 连续 2 次审计零命中 | audit-protocol §5 | spec §7 协议常量 |

---

## 5. 漂移警示（v16 已修复 3 键，余 1 项为文档级差异）

1. ~~injection.persona~~ ✅ **v16 已接通生效**（off|me|you|both 真实控制画像注入构成）。
2. ~~injection.max_tokens~~ ✅ **v16 已接通生效**（总预算从硬编码改为读配置，缺省 3000 行为不变）。
3. ~~injection.smart.\*~~ ✅ **v16 已移除**（模板残留节替换为容量上限键）。
4. 模板与 example 其余缺省差异（complement_floor 0.4/0.3、min_confidence 50/60、age_days 1/7、boards.wiki true/false）仍存在——新建根目录走模板值。
5. 既有根目录（v16 前建的）YAML 里没有 agent_max_chars 等新键——面板改这三个值会报「未定位到配置行」，需先在「配置原文」编辑器把三行补进 injection 节（或在 example 复制）。

## 6. 常见调节场景速查

| 想做什么 | 改哪 |
|---|---|
| 少注入省 token | injection.level → low/medium（或 hot_memory=false 全关）；细调走 max_tokens / *_max_chars |
| 控制画像是否注入 | persona 档位（me=只 agent 画像 / you=只用户画像 / off=都不注） |
| 限某个板块膨胀 | 对应 *_max_chars 设正数（如 agent_max_chars=2000） |
| 别自动归档 | lifecycle.archive.apply_confirm=true（只出报告不落盘）；彻底停：lifecycle.enabled=false 或 interval_hours=0 |
| 觉得蒸馏太频繁 | 参数调节页「蒸馏节流」组：调大 idleWakeMs / 调大 minTurnChars / distillPrescan=true（重载生效） |
| 蒸馏想换模型 | 参数调节页「蒸馏节流」组：llmProvider + llmModel（留空=继承主会话模型） |
| 临时停掉蒸馏 | 参数调节页「蒸馏节流」组：enableDistill 关（重载生效；只读视图仍可用） |
| 关闭深度睡眠 | 深度睡眠页 enableDeepSleep 关（=暂停到明天） |
| 卡住误判长任务 | 深度睡眠页调大 deepSleepProbeAfterMs；或手写 deepSleepProbeConfirm=3 |
| 归档太激进/太保守 | archive.age_days 调大/调小；min_confidence 调高/调低 |
| 重复合并太敏感 | merge.fingerprint_threshold 调低（更容易判重复）；补充合并边界 complement_floor |
| 开/关语义召回 | 参数调节页「向量与模型·当前链路」：embedEnabled 开关（**重载生效**）；provider/缓存/召回状态同节可见 |
| 向量换云端 | 手写 scheduler.json：embedBaseUrl / embedModel / embedApiKeyEnv（本地 bge-m3 免 key；云端须设 key env） |
| 改画像/记忆条目 | 画像板块行尾「编辑」按钮（走 write_gate 门禁，exit 0 才落盘）；删除由同一写通道后端支持 |
| 处理候选队列 | 记忆板块 pending 行「批准/忽略」（移 .processed；内容由后续蒸馏正常入册） |
