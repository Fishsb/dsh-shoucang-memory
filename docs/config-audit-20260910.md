# 参数与配置体系开源视角审查报告（2026-09-10）

> 审查动机（用户提出）：① 参数调节界面有无需收敛处；② 每个调节项是否真实有效；③ 执行链条有无缺陷/实测效果；
> ④ **面向开源用户**——默认新装 DeepSeek Harness + 本插件，除默认工具外全需自行配置；⑤ 向量换模型后索引如何重建；
> ⑥ 根目录使用中切换会怎样。
> 方法：逐控件→后端键→消费端全链核对；对照"当前环境（开发机已就绪）"与"全新安装用户"两种假设。

## 0. 一句话结论

**存在一套「幽灵配置层」**：参数调节里相当一部分键（archive/lifecycle/merge 组）写的 YAML 只有 panel 自己读，
真正的蒸馏/深睡/向量根本不读它——消费端是 v15 单库化前遗留的 `_meta/*.py` 链路（已不随包分发）。新用户改这些
= 改了空气。同时真链路（scheduler.json/vec.ts）缺换模型重建入口。**这是开源用户会踩的头号坑。**

## 1. 三条配置通道现状（混淆根源）

| 通道 | 载体 | 谁写 | 谁读（真消费） |
|---|---|---|---|
| **A 面板 root config** | 登记的根目录 `shoucang.config.yaml` | 参数调节 UI（/set /toggle） | 仅 panel 注入（boards/injection 组）；**archive/lifecycle/merge 组无 src 消费**（旧 py 已不分发） |
| **B scheduler.json** | `~/.dsh/suite/scheduler.json` | /distill/config /deepsleep/config /embed/config | scheduler.ts（蒸馏/深睡/向量 Config）——**真链路** |
| **C 记忆库** | `~/.dsh/skills/managing-memory` | 蒸馏/深睡写门 | 注入读取——**固定全局，与 root 无关** |

> ⚠️ 注入配置（persona/level/max_tokens 等 A 组）挂在 **root config** 上，但记忆数据在 **C 全局**——
> root 切换 → 注入配置变、记忆不变，语义分裂（见 §6）。

## 2. 参数调节逐项审查（A 通道控件 → 是否真有效）

| 控件 | 键 | 真消费端 | 结论 |
|---|---|---|---|
| persona 四档 | injection.persona | panel 注入 ✓ | ✅ 有效 |
| 热记忆强度 | injection.level | panel 注入 ✓ | ✅ 有效 |
| 总预算 max_tokens | injection.max_tokens | panel 注入 ✓ | ✅ 有效 |
| 三板块上限 *_max_chars | injection.* | panel 注入 ✓ | ✅ 有效 |
| 5 个布尔 SWITCH_KEYS | boards.*/hot_memory/archive.enabled/lifecycle.enabled/merge.enabled | 部分：boards/hot_memory 有效；**archive/lifecycle/merge.enabled 无消费** | ⚠️ 部分死键 |
| 蒸馏空闲 idle_review_ms | archive.idle_review_ms | 仅 60s 心跳 consolidateRound（死链路） | ❌ 死键（真蒸馏 idleWakeMs 在 B 通道） |
| 归档模式/时间/时长 | lifecycle.archive.* | 无（旧 py） | ❌ 死键 |
| 指纹/补充阈值 | merge.* | 无（旧 py） | ❌ 死键 |
| 蒸馏节流组 6 键 | B 通道 | scheduler.ts ✓ | ✅ 有效（改需重载） |
| 深睡阈值 5 键 | B 通道 | scheduler.ts ✓ | ✅ 有效 |
| 向量开关/provider | B 通道（/embed/config） | vec.ts ✓ | ✅ 有效 |
| 旧「向量检索（召回面）」区 | A 通道（/model/* /vector/build） | **死链路**（vector_search.py/model_manager.py 不随包分发） | ❌ 整区死 UI |

**收敛建议**：
- 删「向量检索（召回面）」整区（死链路 UI，U6 的「当前链路」节已是替代）——或标 deprecated
- 参数调节中 archive/lifecycle/merge 组控件若保留须标「历史兼容/仅演示」；**建议移除**（真归档链路已无）
- 三通道要收敛：面板主显 B+C 通道真项，A 通道只留 injection 组

## 3. 执行链条缺陷

| 缺陷 | 证据 | 影响 |
|---|---|---|
| 60s 心跳空转 | `setInterval(consolidateRound, 60000)` 但 meta 空（_meta 不随包分发）→ 每轮静默跳过 | 白跑定时器；新用户无实际功能但常驻 |
| 死 UI 调死链路 | /vector/status|build、/model/* 全走 `_runPy(meta/vector_search.py)`，meta 空 | 新用户点这些 = 报 no-active-root 或静默失败 |
| 双蒸馏概念 | A 通道 archive.idle_review_ms（旧） vs B 通道 distill idleWakeMs（真）同名语义 | 用户改错地方无效 |

## 4. 实测效果（当前环境 vs 新装）

| 链路 | 当前环境（开发机） | 新装用户 |
|---|---|---|
| 蒸馏/深睡（B） | ✅ 实测（35 PASS、audit 有产出） | ✅ 缺省即生效（Config 全 true）——**这条是新装可用的** |
| 注入（A injection 组） | ✅ 实测（热记忆注入可见） | ✅ 缺省 smart/3000/both 即生效 |
| 向量（B /embed） | ✅ GPU 服务已固化 | ❌ **需自配**：无 bge 服务/模型/key → 自动降级词法（可用但无语义） |
| 记忆库（C） | ✅ 已蒸馏有数据 | ✅ 首次空库正常（有引导） |
| archive/lifecycle/merge（A 死键） | 无效果（假） | 无效果（假）——**改了没反应** |
| 面板登记 root | ✅ 我登记了 D:\FF\shoucang | ❌ 新用户首开是空 root 视图——**需手动登记**（无引导） |

## 5. 向量换模型 → 索引重建（审查 C 核心缺口）

**现状缺陷**：vec.ts 缓存 `.vector-cache.jsonl` 按 **行文本 hash**（`lineHash`）惰性命中——**不含 embedding 模型指纹**。
切换模型（bge-m3 → 云端）后，旧模型生成的向量仍被当有效复用 → **新旧向量混用，语义召回失真**。
且**无清缓存/重建 UI**（旧 /vector/build 是死链路；vec.ts 缓存无清除端点）。

**必须补**：
1. 缓存行加 `model` 字段（写入时带 cfg.model）→ loadCache/命中时校验 model 一致，不一致自动失效重嵌（惰性自愈）
2. UI（U6「当前链路」节）加「清缓存重建」按钮 → 新端点 POST /vector/cache/clear（删 .vector-cache.jsonl + 内存 cache）

## 6. 根目录切换影响（审查 D）

| 受 root 影响 | 不受影响（固定全局） |
|---|---|
| 面板读的注入配置（persona/level/max_tokens——root config A） | 记忆库 C、蒸馏/深睡/向量 B、注入数据本身 |

**语义分裂**：root 切换 → 注入**配置**变但记忆**数据**不变。用户会困惑（"这插件记的东西不跟着我的项目走？"）。
**建议决策**：
- **方案 1（推荐）**：注入配置迁到 B 通道（scheduler.json，全局）——注入与记忆都全局，root 仅作"面板工作区"概念（浏览哪个项目的 vault）
- 方案 2：明确 root=「记忆作用域」——但当前记忆库本就全局，改造大

## 7. 建议修复优先级

| 优先级 | 项 | 说明 |
|---|---|---|
| **P0** | 参数调节删死键（archive/lifecycle/merge 组 + 旧向量区）或标 deprecated | 开源用户头号困惑源 |
| **P0** | vec 缓存加 model 指纹 + 清重建按钮/端点 | 换模型失真，必须补 |
| **P1** | root config 概念收敛（注入配置迁全局 or 文档明示作用域） | 消语义分裂 |
| **P1** | 移除 60s 心跳死代码（consolidateRound 或改 gate） | 白跑定时器 |
| **P2** | 新用户首开引导：无 root 时提示「登记根目录 or 用默认」 | 降低上手门槛 |
| **P2** | settings-guide 重写为三通道清晰版（哪些真有效/哪些 deprecated） | 文档对齐 |

## 8. 明确不变（避免误伤）

- 蒸馏/深睡/注入/向量（B+C 真链路）**全部有效**，缺省对新用户即开——核心价值在
- 记忆库容量/画像/蒸馏产出一律不动
- 面板 6 视图框架保留（只清死项，不重构）

---
_建立 2026-09-10；证据：panel.ts /set|toggle 白名单(L509/529) + buildHotMemoryText(L253) + consolidateRound(L1240) + _runVector/_runModel(L1325/1347) + package.json files(无 _meta) + vec.ts lineHash(L53) + memoryHomeOf/suiteHomeOf(L597/604)_
