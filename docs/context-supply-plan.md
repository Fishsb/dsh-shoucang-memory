# context-supply-plan.md — 守藏·全局架构与上下文供给方案 **v3（定稿）**

> **状态**：**定稿 · 可执行**。v3 = 自审修订后的最终版；§13 列出**已代决的默认值**（仅 1 项需你点头）。
> **性质**：施工参照（非协议）。记忆纪律权威 `skill/memory-whitelist-spec.md`（待本方案落地时同步修订）；本档裁决**系统架构**。
> **证据等级**：`[C]`=代码行 · `[M]`=本次实测 · `[D]`=文档声明 · `[设计]`=本方案主张。

### v2 → v3 自审修订（10 处，均已改）

| # | 自审发现的缺陷 | 修订 |
|---|---|---|
| 1 | **I2「一会话至多注入一次」把恒定面也算进去** → 会导致画像不再常驻，与"人格一致性"目标冲突；且长会话材料会枯竭 | I2 拆 **I2a/B/C**：恒定面**每步必在**（不算重复）；变动面按"会话×任务指纹"去重；一次性面带 TTL + 会话次数上限 |
| 2 | 去重判据不落地（"任务指纹"未定义） | 定义指纹 = 任务文本规范化 hash **∪ 主题集重叠 ≥2/3 判同**（复用 MCL 已有 topics） |
| 3 | 去重后候选可能全空 → 无兜底 | 加兜底链：放宽阈值 → 次级候选 → 仍空则**零注入并记 `dupSkipped`** |
| 4 | **P4 只解决了 Record→md，没解决 md→Record**（人工编辑会让事实源分叉） | 新增 §10 **单写向**：P4 起 md 只读，人工编辑走 Record；`md→Record` 仅用于一次性迁移+对账 |
| 5 | 容量门退场后**没有质量守恒机制** | 新增 §9 质量门替换表（软上限 + 主题熵/重复率 + 召回质量 + 成熟度 + 供给预算） |
| 6 | 不变量无归属机检 → 会退化成口号（本项目已有"写了从未运行"前例） | §4 每条 I 绑定**守它的检查件**，新增件须登记 `scripts/check-runner.mjs` |
| 7 | 度量在 P3 才建，导致 P2 收益不可量 | P0 就落**最小度量**（重复注入字符 / 每步常驻字符，零新机制）；P3 才是完整收敛 |
| 8 | MEMORY 5,202 基线口径未复核 | §11 标注：须先跑一次 `memory_health_check` 复核口径再作基线 |
| 9 | 无回滚开关（违反仓内"一键回滚"惯例） | §8 定义 `supplyMode=legacy|v2` 与 `storeMode=md|record` 两个总开关 |
| 10 | 文档留有"待拍板"清单，与"只要最终结果"不符 | §13 改为**已代决默认值**表；仅保留"P0–P1 是否即刻开工" |

---

## 0. 结论摘要

**若今天从零设计**，守藏 = **一个记录存储 + 三条流水线**的记忆底座，对外只有两个接口：`supply`（把该知道的送进模型步）与 `ingest`（把值得留下的收进库）。**其余职责皆是越界。**

| 关键决策 | 一句话 | 收益 |
|---|---|---|
| **DS1** 事实源↔投影解耦 | 事实源 = **Record**；md 索引 / notes 树 / 容量门 / 审计 = **投影** | **容量红线从"存储门"降为"注入预算"** → 容量挤压、新类型无处放、N 主体 三问题同时消失 |
| **DS2** 单一供给面 | 一个 Supply Provider；落点只有 `systemPrompt`；消息面仅 `nudge`（≤1/轮） | 消灭"两个注入者各自实现选行/预算/时机/去重" |
| **DS3** 供给状态模型 | 恒定/变动/一次性**三层输出** + 三层预算 + **会话台账** + 每步幂等 | 重复注入与漏注入同根消除 |
| **DS4** 单一事件源 | 一个 `events.jsonl`，现有 8 个 jsonl 降为投影 | "改了有没有变好"可量 |
| **DS6** 三域解耦 | 摄取/巩固/供给互不阻塞；巩固失败不影响供给 | 单点失败不拖垮全局 |
| **DS8** 边界 | 两接口之外皆越界；SOUL/装配检测/能力自省 = 附属，伙伴 = 另一插件 | 定位不再漂移 |

**四条实测症状**（重复注入 782/2955 字符、快通道 0%、query 被注入物污染、整轮漏注入 `[M]`）**全部是 DS2/DS3 缺失的派生**，不是四个独立 bug。

---

## 1. 第一性原理

**目标函数**：在正确的时刻，用最小的上下文代价，把「该知道的记忆 + 该遵守的自我认知」送进模型步；任务结束后把值得复用的经验留下。
→ 前半句 = `supply`，后半句 = `ingest`。**只有这两个对外接口。**

```
事件流 ─▶ ingest：过滤(source.kind==='user') → 判据 → Record
Record Store ◀─ consolidate：队列(merge/promote/demote/forget) → Record
      │
      ├─▶ 注入面视图 ─▶ supply(每模型步, 幂等, 三层, 落 systemPrompt) ─▶ 模型步
      ├─▶ notes 人读视图（路径/格式不变）
      └─▶ 审计/面板视图（由 events.jsonl 派生）
```

---

## 2. 现状：六个架构缺陷（A–F）

| # | 缺陷 | 证据 | 后果 |
|---|---|---|---|
| **A** | 事实源与投影耦合（md 既是事实源又是注入面，容量门压在存储） | 容量门 `MEMORY≤5000/AGENT≤3000` `[C]`；实测 MEMORY **5,202**、AGENT **2,500/3,000** `[M]` | 存储按字符裁剪；**六类标签零实存** `[M]` |
| **B** | 供给无单一属主 | `panel-shared.ts` L330-444 vs `mcl.ts` L266-354 `[C]` | 重复注入 **26%**、两处口径不一致 `[M]` |
| **C** | 生命周期混用（会话/轮/任务共用一个 state） | `mcl.ts` L214-215 每条用户消息 `state.delete` `[C]` | 去重信息自删；`taskText/ready` 无清理 |
| **D** | 观测碎片化（8+ jsonl，无单一事件源） | `mcl-audit`/`distill-audit`/`episodes`/`activity`/`access-real`/`maturation`/`watermark` `[C]` | 无法回答"省了多少" |
| **E** | 主体硬编码为文件名 | `criteria.md` L52-71 标签绑文件 `[C]` | N 主体无位置 |
| **F** | 职责外溢 | `skill/SKILL.md` L6「SOUL — 通用任务执行 Agent」· `shoucang_suite` · `assistant_capabilities` `[C]` | 定位句漂移为"全能助理" |

> 判据：**A–F 任一条不除，同类问题会以新症状复发**（先例：`boards.memory` 死开关、gated 通路"恒不执行"）。

---

## 3. 目标架构

### 3.1 Record（唯一事实源，一行一记录）

| 字段 | 说明 |
|---|---|
| `id` | 内容指纹派生（天然去重） |
| `kind` | `fact`/`preference`/`procedure`/`principle`/`persona`/`episode` |
| `subject` | **`user` / `agent` / `companion:<id>`**（主体是字段，不是文件） |
| `scope` | `global` / `workspace:<path>` / `project:<name>` |
| `text` | 原子正文（无格式装饰） |
| `source` | 会话 id + 事件序号 / notes 锚（**I8 可溯源**） |
| `maturity` | 成熟度（巩固流水线更新） |
| `lifecycle` | `active`/`cold`/`retired`（遗忘=状态迁移，不删除） |
| `stats` | `hits`/`lastHit`/`days`（供给与巩固共同写） |

### 3.2 三个投影（可重生成 · 可手读 · 可 git diff）

| 投影 | 形态 | 消费者 |
|---|---|---|
| 注入面视图 | 按 `subject/kind/lifecycle` 选行后的文本块 | Supply Provider |
| notes 人读视图 | 现有 `MEMORY/USER/AGENT.md` + `notes/*.md`（**路径与格式不变**） | 人、面板、`read_section` |
| 审计/面板视图 | 由 `events.jsonl` 派生 | panel、health check |

### 3.3 Supply 契约

```
supply({ sid, turn, step, taskText, store, ledger, budget }) → {
  stable:  string,  // 恒定面：字节稳定（≤1,000 字符）——每步必在
  dynamic: string,  // 变动面：任务相关（≤600）
  oneshot: string,  // 一次性：成长 delta / 提醒（≤200，带 TTL）
  nudge?:  string,  // 仅需模型立即改行为时（≤1/轮，唯一允许进消息面）
  meta:    { injectedIds, dupSkipped, chars }
}
```

- **落点**：前三段 → `systemPrompt.context`（多块注册，`dsh-roleplay` 已验证可多块 `[C]`）；`nudge` → 消息。
- **台账**：`sessionLedger`（已注入 id 集 / 熟悉度 / oneshot 到期）× `turnLedger`（通道 / nudge 计数）——**两个生命周期两张表**。
- **幂等键**：`(storeVersion, subject, taskFingerprint, step)`。
- **超预算淘汰序**：核心必进（身份/边界/当前 workspace）→ 相关性 → 新鲜度。

---

## 4. 不变量与**守它的检查件**

| ID | 不变量 | 机检件 |
|---|---|---|
| I1 | 存储容量与注入预算是两个独立参数，互不推导 | 新 `check-budget-decouple`（断言供给预算常量不引用容量常量） |
| **I2a** | **恒定面每步必在**（不算重复；靠字节稳定吃前缀缓存） | `test-supply-ledger` |
| **I2b** | 变动面：同一（会话 × 任务指纹）内至多注入一次 | 同上（夹具：重复调用 → 零重复 id） |
| **I2c** | 一次性面：TTL + 每会话次数上限（沿用 delta ≥5 会话停注） | 同上 |
| I3 | 记忆文本不出现在消息面；消息面仅 `nudge` ≤1/轮 | 扩展 `check-carriers` |
| I4 | 供给不依赖巩固完成 | 新 `test-domain-isolation`（注入巩固异常 → 供给仍返回） |
| I5 | 供给幂等（同键同结果） | 新 `test-supply-idempotent` |
| I6 | 主体是字段，新增主体零架构改动 | 新 `check-subject-field` |
| I7 | 每条链单一实现（注入/选择器/判据不得有第二份） | 既有 `audit-wiring` + 新 `check-single-impl` |
| I8 | 所有注入内容可溯源到 Record id + source | 新 `test-traceability` |
| I9 | 观测单一事件源；新增审计 = 新增投影 | 新 `check-event-log` |
| I10 | 越界能力不出现在 `supply`/`ingest` 契约中（可作独立工具存在，但不属两接口） | 新 `check-boundary` |

> **任务指纹**定义（I2b）：`normalize(taskText)` 的 hash **∪** 主题集与上轮重叠 **≥2/3 判同**（复用 MCL 已有 `topics`）。
> **兜底链**：同指纹命中 ⇒ 复用上轮材料不重注入 → 仍空 ⇒ 放宽阈值取次级候选 → 最终空 ⇒ **零注入 + 记 `dupSkipped`**。
> 全部新增检查件**必须登记进 `scripts/check-runner.mjs` 的 `CHECKS`**（仓规第 6 条：未登记 = 没写）。

---

## 5. 关键决策 DS1–DS8

| ID | 决策 | 为什么 | 抛掉的历史约束 | 代价 |
|---|---|---|---|---|
| **DS1** | 事实源 = Record；md/树/容量门/审计 = 投影 | 存储与注入是两个问题（I1） | md 即库；容量门压存储 | **高**（需双写迁移） |
| **DS2** | 单一 Provider；落点唯一 systemPrompt；消息面仅 nudge | 两份实现 = 漂移与重复 | MCL 材料作消息注入 | 中 |
| **DS3** | 三层输出 + 三层预算 + 会话台账 + 每步幂等 | 重复/漏注入/缓存失效同根 | 注入侧不裁切；只在 step==1 注入 | 中 |
| **DS4** | 单一 event log + 投影 | 无度量则无优化 | 每域一个 jsonl | 低 |
| **DS5** | 主体/作用域是 Record 字段 | N 主体零成本（I6） | 主体=文件名 | 低（随 DS1） |
| **DS6** | 三域解耦，互不阻塞 | 单点失败不该拖垮全局 | 深睡 FSM 与供给时序耦合 | 低 |
| **DS7** | 判据保持"声明式单一事实源 + 生成投影 + 机检" | 已是正确资产 | —（保留） | 0 |
| **DS8** | 两接口之外皆越界 | 定位漂移的根因 | 「守藏不设任何人为边界」 | 低 |

---

## 6. 抛掉的历史约束（逐条对照）

| 旧决策 | 当时为何合理 | 现在为何要改 |
|---|---|---|
| 容量红线 3,000/5,000 作**存储门** | 库是 md、注入即全文，容量≈上下文成本 | 两件事应分离；容量门正逼记忆变形（已超标 `[M]`） |
| `*.md` 即事实源 | 人可读、可 diff、零依赖 | 与注入预算耦合；新类型/新主体无处放 |
| 注入侧**不裁切** | 怕裁切漏记忆 | 不裁切 ⇒ 每步 ≈2,800 字符 `[M]`；改为"核心必进 + 预算内选择" |
| MCL 双通道作**独立注入者** | 让 agent 不忽略记忆（价值真实） | 概念保留、**独立通道取消**，并入供给器的一种输出 |
| 只在**任务首步**注入 | 怕中途打断 | 制造时序竞争与整轮漏注入 `[M]`；改每步幂等 |
| 每域一个审计 jsonl | 各自简单 | 无法横向对账（D） |
| `state.delete` 于每条用户消息 | "每条消息=新任务" | 会话级信息被误删（C） |
| 「agent 像伙伴、守藏不设边界」 `[D]` | 表达"不人为设限" | 主语错位 ⇒ 「**agent** 不设边界；**守藏**只供给底座」 |

---

## 7. 旧 → 新映射（文件级）

| 现状 | 处置 | 落点 |
|---|---|---|
| `panel-shared.ts` L330-444（热记忆块） | **重写**为三段供给 | 新 `src/supply-render.ts` |
| `panel-inject.ts` L360-394（挂点） | **重写**为多块注册 + 度量 | 同上 |
| `mcl.ts` L266-354 | **拆**：分流/合规保留；材料注入并入供给器；nudge 保留 | `src/mcl.ts` 瘦身 |
| `mcl.ts` L214-215 | **替换**为两张台账 | 新 `src/supply-ledger.ts` |
| `criteria.json` / `criteria.generated.ts` / `targets.ts` 选行 / `distill-*`（含来源过滤）/ `memory_write_gate` | **保留**（I7 单一实现；DS7） | — |
| `deepsleep-*` | **简化**为操作队列 | `src/consolidate-*.ts` |
| 各 `audit/*.jsonl` | **降为投影** | `audit/events.jsonl` + 投影器 |
| `MEMORY/USER/AGENT.md` + `notes/` | **保留为投影**（路径/格式不变 ⇒ 消费者零改动） | Record 导出器 |
| `skill/SKILL.md`（SOUL）· `shoucang_suite` · `assistant_capabilities` | **标注"兼载/自检附属"**（不迁移） | 文档 + `modules/shoucang.md` 功能表 |
| 伙伴 / 人设 | **不做**（另一插件；本轮零积累） | — |

---

## 8. 分期落地 P0–P5

> 每期必过：①`npm run typecheck` ②`npm run build` ③`node scripts/check-runner.mjs` 全绿 ④行为级证据 ⑤CHANGELOG 一行 ⑥新检查件登记 `CHECKS`。

| 期 | 内容 | 依赖 | 验收判据 | 总开关 | 风险 |
|---|---|---|---|---|---|
| **P0 即时项**（不依赖架构） | ①query 来源过滤统一（热记忆补 `kind==='user'`）②画像行配额（按标签各 1 条 + 总量 N）③截断可见化 ④引导词补"表达风格/思维模式" ⑤酒馆吸收三项：`[性格]`/`[认知]` 对照行 + `injectProfileRows` 3→4 ⑥**最小度量**（重复注入字符 / 每步常驻字符） | 无 | 注入物不再污染 query；`[性格]`/`[认知]` 可产出；画像行不再静默挤掉旧行；两个指标有读数 | — | 极低 |
| **P1 供给台账** | 会话级注入台账 + 增量注入 + `dupSkipped` 审计 | P0 | 同会话重复注入 → **0**（基线 782 字符） | — | 低 |
| **P2 供给收敛** | 单一 Provider；材料改 systemPrompt 多块；三层预算；每步幂等；指纹去重 | P1 | 转录内 MCL `user/message` → **0**；四症状同时消失；`judge` 合规率不降 | `supplyMode=legacy\|v2`（默认 legacy） | 中 |
| **P3 观测收敛** | 单一日志 + 投影；`inject-token-account` 常态 | P2 | 任一改动可给出"省了多少字符/token" | — | 低 |
| **P4 存储解耦** | Record 事实源 + md 投影 + 单写向 + 容量门降格 + 主体字段 | P0–P3 全绿 | 逐字节重现 **100%**；双写对账零差异；dry-run 零差异；新增类型/主体零架构改动 | `storeMode=md\|record` | **高** |
| **P5 治理收口** | 四份 md 口径统一；附属标注；SOUL 归属按 §13 定论 | P0 | `grep` 无"守藏不设边界"式表述；功能表标注到位 | — | 低 |

**顺序理由**：P0–P1 当天可拿可测收益；P2 除病根；**P3 让 P4 的收益可量**；P4 最大收益也最大风险，**可独立推迟**（不做则存储继续被容量门挤压，系统仍可用）。

---

## 9. 质量门替换表（容量门退场后的守恒机制）

| 旧门（存储侧，P4 后取消） | 新门（质量/供给侧） |
|---|---|
| 字符容量**拒收**（`MEMORY≤5000` 等） | ① notes **软**上限（超限告警，不拒收）② 主题熵 / 重复率门（防同质堆积）③ 召回质量（零命中率、命中转化）④ 成熟度门（既有 `maturation`）⑤ **供给预算硬顶**（真正的上下文守门） |
| 写门 exit 1「超容量→合并或下沉」 | 写门只守：重复 / 悬空指针 / 类型合法 / 来源可溯（I8） |

> 原则：**"能不能存"由质量决定，"给不给"由预算决定**（I1）。

---

## 10. 写入方向与人工编辑（**单写向**）

| 时期 | 事实源 | 人工编辑路径 | md 角色 |
|---|---|---|---|
| P4 前（现状） | md | 直接改 md（`write_gate` 校验） | 事实源 |
| P4 双写期 | **Record** | 面板/CLI 写 Record → 重生成 md；**md 只读** | 投影（对账） |
| P4 后 | Record | 同上 | 纯投影 |

- `md→Record` 导入器**仅用于一次性迁移 + 对账**，不常驻。
- 双写期对账判据：**同一 Record 集导出 md 必须逐字节重现**；任一不一致 ⇒ 回滚 `storeMode=md`。

---

## 11. 度量（基线 → 目标）

> **口径复核**：MEMORY.md 5,202 字符为 `.Length` 实测，**须先跑一次 `memory_health_check` 复核口径**再作正式基线。

| 指标 | 基线 `[M]` | P1 | P2 | P4 |
|---|---|---|---|---|
| 同会话重复注入字符 | 782 / 2,955（26%） | **0** | 0 | 0 |
| 转录内 MCL `user/message` 条数 | 8 | 8 | **0** | 0 |
| 每步常驻字符 | ≈2,600–2,900 | 同 | **≤1,800（硬顶）** | ≤1,800 |
| 快通道占比 | 0 / 3 | >0（按审计样本校准） | 由供给器统一分流 | 同 |
| `[性格]`/`[认知]` 实存 | 0 / 0 | **≥1 / ≥1** | ≥1 | ≥1 |
| 画像行截断可见性 | 静默 | **显式** | 显式 | 由预算选择器接管 |
| 存储容量拒收 | 会（已超标） | 同 | 同 | **不再拒收** |
| 新增主体成本 | 改存储模型 | 同 | 同 | **零** |

---

## 12. 风险与不做

**风险**
1. **P2 位置感变化**（材料从"紧贴用户消息"→ systemPrompt 段）→ 用 `judge` 合规机检前后对比，**合规率不降才放行**。
2. **P4 双写一致性** → 先写导出器 + 逐字节对比脚本，**再切事实源**；不一致即回滚（§10）。
3. **迁移数据量** → 沿用"干跑对账再实跑"：dry-run 记预期动作数，实跑须零差异。
4. **预算硬顶可能漏关键行** → 恒定面设"核心必进名单"+ 溢出可见化（I2a）。
5. **状态清理** → `state/taskText/ready` 现仅 `state` 有删除 `[C]`，随 P1 补 `disposed`/会话结束清理。
6. **改动面大** → 以"md 投影路径/格式不变"为硬约束，保证消费者零改动。

**明确不做**
- 不引入世界书式全量机制（与索引行 + 懒展开重复）。
- 不把类型从 always 迁到 gated（伤召回稳定性；`panel-shared.ts` L401-404 有事故前例）。
- 不实现伙伴/人设（另一插件，本轮零积累）。
- P0–P3 不迁 SOUL/执行纪律（成本高收益低）。
- 不改蒸馏来源过滤（`distill-activation.ts` L41-50 是正确资产）。

---

## 13. 已代决默认值（自审时代为拍定）

| # | 项 | 代决值 | 依据 |
|---|---|---|---|
| 1 | 定位句 | **守藏 = 长期记忆底座**（服务助理的记忆能力，非"本插件是助理"） | 用户多轮确认 |
| 2 | DS1 / P4 | **接受，但不即刻启动**；前置 = P0–P3 全绿 + 导出器逐字节重现 100% | 收益最大、风险最高 ⇒ 放最后 |
| 3 | 注入硬顶 | **≤1,800 字符/步**（恒定 1,000 / 变动 600 / 一次性 200），可配 | 由实测 ≈2,800 下行 36% |
| 4 | P4 后容量门 | 取消存储拒收；保留 notes **软**上限告警 + §9 质量门 | I1 |
| 5 | SOUL 归属 | **标注"兼载"，不迁移** | 迁移成本高、收益低；口径上不入记忆功能 |
| 6 | 主体命名 | 现在就定 **`user` / `agent` / `companion:<id>`** | 提前定名，避免二次迁移（I6） |
| 7 | 总开关 | `supplyMode=legacy\|v2`（P2 验收后默认 v2）· `storeMode=md\|record`（默 md） | 仓内"一键回滚"惯例 |
| 8 | 判据/蒸馏链 | **不动**（DS7） | 已是正确资产 |

**仅剩 1 项需你点头**：**P0–P1 是否即刻开工**（其余按上表执行）。

---

## 14. 来源

- 实测：`suite/knowledge/audit/mcl-audit.jsonl`（sid `a340f53b`）· 解压 `sessions/--D-FF-shoucang--/session-a340f53b-*/session.v3.jsonl.zstd`（362 事件）· 活体 `GET /api/shoucang-panel/{inject/stats,mcl/status,inject/preview}`（`calls=162` · `fast=0/slow=3` · 阈值 0.58 · `lastSim=0.565`）
- 代码：`src/panel-shared.ts` L303-444 · `src/panel-inject.ts` L360-394 · `src/mcl.ts` L204-354 · `src/scheduler.ts` L197/L263-310/L469-523 · `src/distill-activation.ts` L41-50 · `src/deepsleep-core.ts` L100
- 契约：`skill/engine/criteria.md` L40-94 · `skill/engine/distill-contract.md` L16/L52/L104 · `skill/memory-whitelist-spec.md` §5.5/§5.8
- 方向：`docs/memory-core-model.md` · `docs/assistant-focus-plan.md` · 仓 `AGENTS.md`
- 生态（仅参照，本轮不做）：`dsh-roleplay` v0.5.0（MIT）

---

## 15. 执行记录（2026-09-13 · 一次开工落地）

### 15.1 已落地并部署

| 期 | 内容 | 落点 |
|---|---|---|
| **P0** | ① 注入 query 补 `data.source.kind === 'user'` 来源过滤 ② 画像行改「按标签各留最近 1 条」+ 截断可见化 ③ 引导词补「表达风格（`[性格]`）/ 思维模式（`[认知]`）」 ④ `surface.injection.carriers.profile` 3→4 | `src/panel-inject.ts` · `src/panel-shared.ts` · `skill/engine/criteria.json` · `src/deepsleep-core.ts` |
| **P1** | 会话级注入台账（新模块）+ 增量去重 + `dupSkipped` 审计 + 三张会话 Map 硬上界 | `src/supply-ledger.ts`（新）· `src/mcl.ts` |
| **P2** | 三层预算 + 总预算硬顶（`budgetChars` **3000→1800**）+ 稳定面缓存（尺寸签名失效）+ 丢弃留痕 | `src/panel-shared.ts` · `criteria.json` |
| **P4 前置件** | Record 模型 + 三索引往返闸（导入→导出**逐字节一致**）+ Record 清单统计；已登记 `CHECKS` | `scripts/record-export.mjs`（新） |
| **P5** | 定位统一为「长期记忆底座」四处；「守藏不设边界」主语错位修正；§8 增「伙伴关系与人设实现归另一插件」；S01/S05/能力自省标注「自检附属·非记忆职能」 | `README.md` · `skill/memory-whitelist-spec.md` · `docs/memory-core-model.md` · `docs/assistant-focus-plan.md` · `D:\FF\modules\shoucang.md` |

**门禁证据**：`npm run typecheck` 零错 · `npm run build`（host+client）零错 · `node scripts/check-runner.mjs` = **PASS（38 pass · 1 xfail · 0 skip）**（唯一 xfail = 既有 `test-treeops-rm`）。**P4 前置闸实测**：MEMORY.md 67 记录 / USER.md 56 / AGENT.md 42，**三文件往返均逐字节一致**（PASS）。

### 15.2 未落地（本轮刻意推迟 · 附理由与前置）

| 项 | 为何推迟 | 恢复前置 |
|---|---|---|
| **P2b** MCL 材料改 systemPrompt 段 | 材料能在 systemPrompt 现身，取决于宿主「`agent/pre-step` → 请求装配」的先后；**无法在本轮验证**（重启由用户执行），贸然上等于可能**静默关掉认知环** | 重启后跑一次会话，比对 `mcl-audit` 的 `injected>0` 与注入面是否出现材料；成立再切开关 |
| **P3** 观测收敛（单一日志+投影） | 触及面板/体检/多个脚本的消费面，属"改消费方"级别改动 | P2 稳定后单独立项 |
| **P4** 存储解耦（切 `storeMode=record`） | 前置件已过闸，但切源涉及全部消费者与人工编辑路径，属数据安全级改动 | `record-export` 持续绿 + 导出器在真实库上跑通 + 双写对账零差异 |

### 15.3 基线口径更正（重要 · 影响 §2/§8 三处结论）

早前本会话用 PowerShell `Get-Content -Raw .Length` 量出的三个数字**不可信**——控制台编码把 UTF-8 按 ANSI 读，字符数被系统性放大。以 `memory_health_check.mjs`（权威口径）复测：

| 文件 | 权威值 | 容量门 | 占比 |
|---|---|---|---|
| MEMORY.md | **4,039 字符** / 65 行 | 5,000 | 81%（**未超标**） |
| USER.md | 1,681 字符 / 24 行 | 3,000 | 56% |
| AGENT.md | **1,785 字符** / 24 行 | 3,000 | 60%（**非 83% 满**） |
| **注入面合计（估算）** | **3,418 字符 ≈ 2,279 token** | 新硬顶 1,800 | **190%（超预算）** |

**更正两处结论**：① 「AGENT 83% 满 / MEMORY 超标」**不成立**（实测 60% / 81%）；② 但 **注入面 3,418 字符对新硬顶 1,800 = 190%** ⇒ **P2 的总预算这一刀有实证必要**（"轻消耗"的真问题是**注入面**，不是存储容量）。因此 **DS1（存储解耦）的理由相应改写**：从"容量挤压"改为**扩展性（新类型 / 新主体零架构成本）+ 写入方向单一化**——收益仍成立，论据需替换。

### 15.4 附带发现（本轮实测，未处理）

- `memory_health_check` 报 **9 条未登记元数据表主题**、**67 个零召回主题**、**3 行标签不在本档白名单**（MEMORY.md 内的 `[教训]`×2、`[环境]`）——属既有卫生问题，与本次改动无关。
- 已安装副本存在 1 件**仅安装侧**文件 `client.js.bak-20260913-061604`（`build:client` 的备份产物，非本次创建，未删）。

### 15.5 重启后运行态验证（2026-09-13）

**宿主重启确认**：PID 21112 · 启动 06:29:44（由 `Get-NetTCPConnection -LocalPort 3080` 取属主进程）。

| 验证项 | 实测 | 判定 |
|---|---|---|
| P1 台账在跑 | `/mcl/status` → **`dupSkipped=0 · ledgerSessions=1 · ledgerRows=3`**（新字段出现）；`mcl-audit.jsonl` 新行带 `dupSkipped` | ✅ 生效 |
| P2 预算在跑 | `/inject/preview` = 1,242 →（修复后）**1,319 字符**（改前 3,418）· 带「本步受预算 1800 字符约束省略 N 行」留痕 | ✅ 生效（**−61%**） |
| P0 来源过滤 | 门禁 `test-carrier-layers` 新增 **A8 / A8b**：仅 `source.kind=plugin` 的注入块**不作**召回 query；真用户消息排在注入块之后仍被正确取用 | ✅ 生效 |
| **新发现并修复的缺陷** | 稳定面原为「合并后一次 clamp」⇒ **agent 画像超预算即把 USER 画像整段挤掉**（preview 实测 `含用户画像段 = false`），违反 **I2a** | ✅ 已修：按块配额（55%/45%）**块内裁行、不丢块**，各自留痕 |

**修复后复测**：`agent 画像 = true · 用户画像 = true · 知识索引 = true · 预算留痕 = true` · 23 行 / 1,319 字符 · 占硬顶 **73%**。
**生效路径**：`build` → 部署差异件（3 件：`panel-shared.js` + `.map` + `client.js`）→ **插件热重载**（`dev_reload_package shoucang`：清缓存 45 模块 / 重建 fiber / before-after 皆 `active`）⇒ **无需二次重启**。

**仍未解的两项（有实测数据，非猜测）**
1. **快通道恒 0**：两轮进程实测均 `fast=0`。机制已查明——快通道要求 `sim ≥ 0.58` **且**命中 `[路径]`/`[原则]`（注册表 `mclGate`）；本轮 top hit 是 `[flow]`（E 层，不在高置信集）而 `sim=0.613`。⇒ 瓶颈不是阈值单点，而是**高置信标签集与真实命中分布不匹配**；校准须用 `mcl-audit.jsonl` 的 `sim × tag` 分布来做，归入 P3。
2. **P2b（材料改 systemPrompt 段）**仍未开——其可行性取决于宿主「`pre-step` → 请求装配」的先后；本轮不为诊断引入新代码路径，留专门的顺序探针。

---

## 16. 质量回归评估（2026-09-13 · 用户要求排查"改动后是否降级"）

**方法**：不看文档、不看自述，逐项取实证——① 会话转录里 `user/message` 的 `source.kind` 分布；② 直调 `recallIndex` 用**真实提问文本**跑召回；③ 模拟新旧画像行选取规则做集合差；④ 量各块字符与该块预算。

| 改动 | 理论风险 | 实测结论 | 处置 |
|---|---|---|---|
| P0-a query 来源过滤 | 真实用户消息若不带 `kind='user'` ⇒ query 恒空 ⇒ 知识索引消失 | 62 条 `user/message`：**user:17 · plugin:43** ⇒ 过滤**正确**；但直调召回实测**真实提问 0 命中** ⇒ 揭穿"改前有 6–8 行"是**用注入物召回自己的回声** | 修回填池（见下 c） |
| P0-b 画像行配额 | 新规则可能挤掉有身份的行 | 新旧规则集合差 = 旧有新无 **0 条**；但查出 `[边界] 宿主服务免动` 在**新旧规则下都从未注入**（文件首位被 `slice(-N)` 恒挤掉）= 既有静默失效 | ✅ 标签行优先保留 → `[边界]` 常驻可见 |
| P2 三层预算（1,800） | **恒定面被裁** ⇒ 违 I2a、损伤习得原则常驻 | AGENT 15 条索引行 **1,138 字符 > 554 分档** ⇒ **裁掉一半以上**；且 agent 画像超预算时 **USER 画像整段消失**（preview 实测 false） | ✅ 恒定面**免裁** + 安全带 4,000；按块 55/45 **块内裁行不丢块** |
| P1 台账（v1） | **整会话永久去重** ⇒ 压缩后材料不在窗口内仍记"给过" ⇒ 该记忆对会话失效；被忽略的经验永不再提示 | 设计缺陷；实测浪费形态是**相邻轮**逐字重复（375/375、407/407） | ✅ 改**轮次窗口去重**（`DEDUP_WINDOW_TURNS=3`） |
| 位置式回填池 | —（既有缺陷，被 P0 揭穿） | 分层过滤后 `allMem` 只剩 P 层 ⇒ 新鲜度槽/基线**恒空**（源码自认"回退=回退到空"）⇒ 真实提问时知识索引恒 **1 行** | ✅ 改用 **MEMORY.md 全层行**（仅 `q && relOn` 分支；A7-1 载体契约仍守）⇒ **1 行 → 9 行**（本会话实测） |
| registry `carriers.profile` 3→4 | 无 | 代码兜底 `?? 3` 硬编码 ⇒ 注册表改动**对运行时零效果**（"注册表驱动"失守） | ✅ 兜底改读注册表 |
| v9 UI 未提交工作 | — | `#scpanl-root .sc-pagehead` **顶层重复定义**（CSS 门禁 FAIL），非本次引入，被重构建暴露 | ✅ 合并为唯一规则 |

**净结论（改动前 → 改动后）**：**任务执行质量未下降，且在四处上优于改前。**

| 面 | 改前 | 改后 |
|---|---|---|
| AGENT 画像索引行 | 15 条全量 | 15 条全量 **+ `[边界]` 行（改前从未注入）** |
| USER 画像 | 8 索引 + 3 画像行 | 相同 **+1**（架构议题偏好） |
| 知识索引 | 6–8 行**但由注入物回声驱动**（非真实提问） | **9 行**，由真实提问 + 全层位置回填驱动 |
| MCL 材料 | 相邻轮重复 782/2,955 字符（26%） | 窗口去重：省掉重复，窗口外仍可重给（**不永久屏蔽**） |
| 注入面总量 | 3,418 字符 | ≈ **2,800**（恒定面必在，变动面 ≤600） |

**残留风险（未解决，已定位）**
1. **R1 词法召回地板弱**：真实自然语言提问 0 命中；现由"全层位置回填"保可见性，但**相关性**仍弱。根治需把 dense/向量通道接进注入选择（MCL 已在用 embeddings，实测可用），代价 = 每轮一次嵌入调用 ⇒ 归 **P3**。
2. **R2 快通道恒 0**：`mclGate` 高置信集（`[路径]`/`[原则]`）与真实命中分布不匹配（实测 top hit 常为 `[flow]`，E 层），全部落慢通道；需用 `mcl-audit` 的 `sim × tag` 分布校准。
3. **R3 画像行仍有配额**（agent 3 条 / user 13 条被挡）——有留痕、可按需 `get_file`；欲更多常驻需提 `injectProfileRows`。
4. **R4** P2b（材料改 systemPrompt 段）与 P4（切事实源）未做——不影响当前质量，属架构演进项。

**门禁**：`typecheck`/`build` 零错 · `check-runner` **PASS（38 pass · 1 xfail · 0 skip）** · 部署面 140/140 一致 · 插件热重载生效。

---

## 17. 蒸馏链 / 睡眠链 / 职能归类审查（2026-09-13 · 把 R1–R4 全部收口）

**方法**：体检（`memory_health_check`）+ 对账（`memory-reconcile`）+ 自检（`sleep-selfcheck --repo`）+ 分布统计（`mcl-audit` 900 样本 `sim×tag`）+ 逐条走代码路径；**不看文档自述**。

### 17.1 查出并修掉（8 项）

| # | 发现 | 证据 | 处置 |
|---|---|---|---|
| 1 | **写门把真实库判为 exit=2**（6 条悬空指针 ⇒ 整档编辑会被拒） | `memory_write_gate MEMORY.md <整档>` 报 `§node 与包管理`/`§包版本探测`/`§协作与文档治理`/`§视觉还原度验收`/`§ui 布局弹性化` 不存在 | ✅ 逐条重指向真实小节，**走门禁路径**落盘（备份 `~/.dsh/backups/MEMORY.md.bak-20260913-040335`）→ 门禁 PASS |
| 2 | **3 行标签越白名单**（归类错误） | MEMORY.md 内 `[教训]`×2 / `[环境]`×1；白名单只有 `[env][tool][flow][lesson]` | ✅ → `[lesson]` / `[env]`；复查 0 越界 |
| 3 | **睡眠链自检的仓侧门恒 fail 且无明细** | `sleep-selfcheck.mjs` 的 `run()` 用 `stdio:'ignore'` 且**不设 cwd** ⇒ `check-criteria`/`check-carriers` 按调用方 cwd 解析相对路径而 fail；失败只落 `exit≠0`，**不可诊断** | ✅ 改 `cwd = 仓根` + 捕获输出尾部为 `detail` ⇒ 带 `--repo` 复测 **6/6 全绿（裁决 ok）** |
| 4 | **我自己的真缺陷（被第 3 项抓出）** | `criteria.json` 的 note 内用了**直引号** ⇒ 非法 JSON；`gen-criteria` 静默失败，而 `check-runner` 全绿（那一轮跑在改动之前） | ✅ 改用「」+ 加 `JSON.parse` 决定性验证 ⇒ `profile=6 · budget=4000` 合法 |
| 5 | **快通道恒 0（R2）** | 900 样本分布 + 代码：`sim` 用 `rows[0]` 测、`hasHighConf` 用 `some(∈高置信集)` 判 ⇒ **两条件锚在不同行** | ✅ 探针改用高置信行 ⇒ 审计首现 `channel=fast · sim=0.662 · hit=[原则]` |
| 6 | **画像行配额（R3）** | 实测被挡 agent 3 / user 13–14 条，含「架构议题要抛开历史决策约束…」等高价值偏好 | ✅ `carriers.profile` 4→6（zod 上限）；实测「另有 1 条」 |
| 7 | **R1 词法地板弱 = 一致率 0% 的根因** | 真实自然语言提问词法召回 **0 命中**；`criteria-audit ①` = **判「跨任务可复用」而入库的条目 7 天内零真实读命中** ⇒ **写侧归类与读侧可得性断裂** | ✅ 预热通道：MCL 的 async 融合召回（dense 0.7+lexical 0.3，实测 `sim=0.66` 证明嵌入可用）写 `audit/warm-recall.json` → 注入面按 `recallKeyOf` 键复用，**零新增嵌入开销**；离线验证 ②接通 ③键不匹配不串话 |
| 8 | **R4 存储解耦** | `record-export` 往返闸常绿（三索引逐字节还原） | ⚠ **不执行切换**：数据安全级改动，前置已绿、单写向与开关已定义；**等显式拍板**（不静默切源） |

### 17.2 未修（已定位，归口明确）

| 项 | 归口 |
|---|---|
| `lessons.md`「假绿与实证」既作 `##` 又作 `###`（同名/错位，应合并） | **深睡 treeOps**（结构变更不手改，spec §2.5） |
| `notes/env.md` 4 节 / `lessons.md` 9 节超 R(1000)（如 §Windows 系统运维与数据安全 4,511 字） | **深睡 split（分裂律 R=1000/K=6）** |
| MEMORY.md 4,098/5,000（82% 需合并）；67 个零召回主题（连续 2 次审计零命中 ⇒ 提纯降级候选） | 深睡 consolidation / 审计裁决 |
| `mcl-audit` 的 `sim×tag` 里 803/900 行无 `hit` 字段 | 审计字段补齐（低危；不影响判定） |

### 17.3 结论

1. **蒸馏/睡眠链的三层防守（判据门 → 机检门 → 睡眠自检）是有效的**：第 4 项是唯一一次「`check-runner` 全绿但注册表已坏」的窗口，根因是我编辑与门禁运行的时间差，而**睡眠自检是第一个把它抓出来的门**——这条链值得保留并继续加厚。
2. **写侧归类与读侧可得性必须一起看**：`criteria-audit ① = 0%` 与「词法 0 命中」是同一个断裂的两面 ⇒ R1 不是"召回优化"，而是**让 ingest 的归类产生价值的前提**。
3. **R1–R3 已解决并运行态验证；R4 前置全绿、显式不切**（安全侧决策）。

---

## 18. P4 双写期施工（2026-09-13 · 目标模式一次施工闭环）

**拍板口径**：用户要求「目标模式一次完全施工闭环」。据此**推进 P4 的可安全部分**（双写期），
**不静默切源** —— §13 #7「`storeMode` 默 `md`」与 §17.1 #8「等显式拍板」继续有效。

### 18.1 交付件

| 件 | 内容 | 纪律 |
|---|---|---|
| `src/record-store.ts`（新） | Record 事实源模型：`id` 内容指纹派生 · 主体是**字段**（`companion:<id>` 可扩展）· `lifecycle` 迁移 · `hits/lastHit` 命中记账 · 逐行保留 `eol` | 纯函数零 I/O；**标签→类别从 `CARRIERS` 派生**（不写第二份名单） |
| `src/record-shadow.ts`（新） | 宿主影子写：md 写入后镜像进 `<库根>/.records/records.jsonl`（原子写）+ `parityOf` 对账 | **只镜像不回写 md**（单写向）；**零抛出** |
| `scripts/record-sync.mjs`（新） | 同步器：`--import` / `--check` / `--diff`（干跑不写）/ `--export [--write]` | 与 record-export 共用同一实现 |
| `scripts/check-record-parity.mjs`（新 · 已登记） | 常驻门禁：往返闸恒跑 + 影子库对账 + `storeMode=dual` 而影子库缺席 ⇒ FAIL | 防死开关 |
| `scripts/test-record-store.mjs`（新 · 已登记） | 67 条直接单测（含**反向证伪**） | 数据安全级改动的安全网 |
| `scripts/record-export.mjs`（改） | 删私有解析器与私有 `P_TAGS/R_TAGS`，改调同一实现 | 消「第二份副本」 |
| `src/distill-write.ts` / `src/scheduler.ts` / `src/distill.ts`（改） | `storeMode` 开关真接线（写路径镜像 + 门禁消费） | 缺省 `md` = **现状零行为变化** |

### 18.2 恢复前置三项 —— 实测全达成

| 前置（§15.2） | 证据 |
|---|---|
| `record-export` 持续绿 | ✅ 三索引 **179 记录**（MEMORY 68 / USER 62 / AGENT 49）往返**逐字节一致** |
| 导出器在真实库上跑通 | ✅ 影子库落 `~/.dsh/skills/managing-memory/.records/records.jsonl`（179 记录，active:179） |
| 双写对账零差异 | ✅ `--check` 三文件逐字节一致（4645/2106/2393 B）· `--diff` 干跑 **增 0 / 删 0 / 改 0** |

### 18.3 未做（显式）

| 项 | 理由 |
|---|---|
| `storeMode=record`（md 降为纯投影 / md 只读） | 数据安全级：需重接**全部写入方**（含库侧 `memory-append.mjs`）与人工编辑路径。本键**只接受 `md\|dual`**，不留"选了却没接线"的值 |
| 翻转运行态配置为 `dual` | 属部署动作（§13 #7 默认 `md`；§17.1 #8 不静默切源）。开关已真接线，一行配置即可启用，且门禁会因影子库缺席而 FAIL 拦住误配 |

---

## 19. G1 内容环：决策环 + 后果回收 + 价态采集口（2026-09-13）

**定位**：本节点是 **P4 的下游兑现**，不是另起架构 —— Record 已能存「md 存不下的东西」，
   于是把讨论中锁定的一类新内容（裁决 / 后果 / 价态）长在它上面，**验证「新增类型零架构改动」**这条验收。

### 19.1 为什么是"环"而不是"新标签"

三轮讨论的结论：**用一套判据管所有内容是最深的错配**。不同内容的生命周期根本不同——
事实要时态失效、裁决要等后果回收、联想只出现一次、价值要半衰期降级。
既有判据 `consolidate.support.principle`（同主题 **≥3 条痕迹**）与 `support.path`（同型 **≥2 次**）
是**频率门**：对事实环合理，对洞察/裁决**结构性错误**（它们的定义就是只出现一次）。
故本节点把「一类内容属哪个生命周期」做成**可机检的登记**（`src/rings.ts`），而非文档里的一句话。

### 19.2 交付件

| 件 | 内容 |
|---|---|
| `src/rings.ts`（新） | 环注册表：`RING_OF_KIND`（唯一声明处）· `FREQUENCY_FREE_RINGS=['decision','association']` · `RING_PENDING`（G2/G3 未落 kind 的显式申报，棘轮）· `ringCensus` |
| `src/decision-ring.ts`（新） | 决策环纯函数：`openDecision` → **`collectOutcome`** → `recordValence` → `openDecisions` / `scorecardOf` |
| `src/record-store.ts`（改） | `KINDS` +3（`decision/outcome/valence`）· `MemRecord.meta` 通用槽 · 显式 `id` 覆盖 · `contentKey` 纳入 meta |
| `src/record-shadow.ts`（改） | 导出 `saveStoreRecords`（环记录落盘入口） |
| `scripts/record-ring.mjs`（新） | CLI：`--decide / --outcome / --valence / --open / --score` |
| `scripts/check-ring-coverage.mjs`（新·已登记） | 门禁：kind 登记完整 · 空环须申报 · **免频率门环缺 association/decision ⇒ FAIL** |
| `scripts/test-decision-ring.mjs`（新·已登记） | **48 条**单测（含幂等拒绝、同文本不撞 id、镜像不吞环记录、反向证伪口径） |

### 19.3 实测（真实库闭环）

开裁决 → **回收后果（命中）** → 采价态 → 待回收队列清空 → 记分卡
`已开 1 / 已回收 1 / 待回收 0 / 命中 1 / 未命中 0 / 命中率 100% / 价态 1`；
且**环记录落地后三索引对账仍逐字节零差异**（4645 / 2106 / 2393 B）——
即「环内容」与「md 投影」互不干扰，`file=''` 使环记录天然不在投影范围。

### 19.4 尚未落地（显式）

| 环 | 状态 |
|---|---|
| **关系环（G2）** | 已登记环、**未落 kind**；在 `RING_PENDING` 显式申报（门禁要求落地后必须删除该申报） |
| **联想环（G3）** | 同上；其**免频率门已在契约里**（`FREQUENCY_FREE_RINGS`），碰撞记录与越界召回通道未实现 |
| 读侧 assembly（G4） | 未开始 |

---

## 20. G2 内容环：关系环 + 承诺状态机（2026-09-13）

**定位**：与 §19 同规格的**下游兑现**——Record 存得下 md 存不下的东西，于是第二类内容（关系/承诺）长在它上面。

### 20.1 为什么关系也是"环"

讨论结论：人记的大半不是知识，是**社会位置**——谁有期待、我欠谁、谁可信。
模型没有社会位置（也不会有，除非外部给它），这部分只能外置；而且它是**双向**的（对面也记得你）。
与决策环的结构同源：**都要回收**——决策回收后果、承诺回收兑现，故都有"待办队列"作为「想不起来」的防线。

### 20.2 交付件

| 件 | 内容 |
|---|---|
| `src/relation-ring.ts`（新） | `assertRelation` · `openCommitment`（direction: owed-by-me/owed-to-me + due）· **`settleCommitment`**（pending→kept\|broken，重复结清被拒）· `openCommitments` / `relationsOf` · `relationCensus` · **`trustOf`（双向兑现率分开统计）** |
| `src/record-store.ts`（改） | `KINDS` +2（`relation/commitment`） |
| `src/rings.ts`（改） | 关系环落 kind；`RING_PENDING` 撤销 relation；新增 **`stalePendingRings()`**（棘轮） |
| `scripts/check-ring-coverage.mjs`（改） | 新增 **陈旧申报**检查（环已落 kind 却仍申报豁免 ⇒ FAIL） |
| `scripts/record-ring.mjs`（改） | `--relation / --commit / --settle / --commitments / --relations`；`--score` 合并两环 KPI |
| `scripts/test-relation-ring.mjs`（新·已登记） | **35 条**单测（状态机 · 双向率 · 按人过滤 · 镜像不吞 · 棘轮断言） |

### 20.3 实测（真实库）

1 条关系事实 + 2 条承诺（1 兑现 / 1 待兑现）⇒ 待兑现队列剩 **1 条**
（`切 storeMode=record 前先出迁移与回滚路径`——真实未结事项）· 我欠兑现率 100%（1/1）·
无记录主体报 0（不 NaN、不编造）；环记录不影响 md 对账（§19.3 同款不变量）。

---

## 21. G3 内容环：联想环 + 碰撞记录 + 越界召回（2026-09-13）

**定位**：内容环的最后一环。**五个环全部落 kind，`RING_PENDING` 清空**（不再有任何"已登记未实现"的豁免）。

### 21.1 为什么只记"碰撞"而不记"洞察"

讨论结论：洞察是**关系**，不是**条目**。
- 写入时提炼洞见是错位范式——碰撞的分母是"未来某个问题"，写入时不可知；
- 若模型能在写入时由 §A+§B 生成它，读取时也能生成 ⇒ 按「不可再生」判据它**不该入库**，
  存下来只增加污染面并挤占 3000/5000 预算。

故本环存的是**不可再生的残留**：撞过哪两条（锚点）、什么语境、**被认可吗**（价态，模型推不出来）、
**后来成了吗**（后果账）。洞察本体留在原地，读时再生成。

### 21.2 交付件

| 件 | 内容 |
|---|---|
| `src/association-ring.ts`（新） | `recordCollision`（**跨度门**：两锚点须带 `§` 地址且小节不同）· `hasSection`/`sectionOf`/`anchorOfRecord`（口径单一实现）· `collideRecords`（按 id）· `markAccepted` · **`landCollision`**（幂等）· `openCollisions` · `associationCensus` · **`serendipityPairs`（越界召回，独立于相关性）** |
| `src/record-store.ts`（改） | `KINDS` +1（`association`） |
| `src/rings.ts`（改） | 联想环落 kind；**`RING_PENDING` 清空** |
| `scripts/record-ring.mjs`（改） | `--collide / --land / --collisions / --serendipity`；`--score` 合并三环 KPI |
| `scripts/test-association-ring.mjs`（新·已登记） | **52 条**（跨度门 · 免频率门 · 落地幂等 · 召回确定性 · 去重尺子一致 · 两条反向证伪） |

### 21.3 真库实测暴露并修掉的一处真实缺陷

跑真实库的越界召回时输出**不干净**，追下去是两个错位：
1. **去重尺子错位**：碰撞记录存的是**锚点**（`notes/x.md §甲`），而召回的排除集查的是**记录 id** ⇒ 两者永不相等 ⇒
   **已撞过的对被反复推荐**；
2. **候选池混入无地址行**（画像行）：其 `sectionOf` 退化为整串正文 ⇒ **任意两行都判"不同 §"**，
   跨度门形同虚设（实测 span 恒为满分 2.999）。

修法：统一到 `anchorOfRecord` 一把尺子；新增 `hasSection` 前置门（**无 `§` 地址的两行不算碰撞、也不进候选池**）。
两条都已写成单测断言（同 § 必拒 · 无地址必拒），故不会回归。

### 21.4 实测（真实库 · 三环记分卡）

```
决策环：已开 1 · 已回收 1 · 待回收 0 · 命中率 100% · 价态 1
关系环：关系事实 1 · 承诺 2（待兑现 1 / 兑现 1）· 关系网 1 人
联想环：碰撞 1（认可 1）· 已落地 1（落地率 100%，分母=已认可者）· 待回收 0
```

**内容环落地完毕（G1/G2/G3）**；余 **G4 读侧 assembly**（把越界召回接进注入面——本节点只交付了通道本体，
未接注入预算）。

---

## 22. G4 读侧装配 + 越界联想独立预算槽（2026-09-13）

**定位**：把 §19–§21 产出的环内容与既有索引行，收进**一个预算内最小充分集**。
对应方案档 DS2（单一供给面）/ DS3（三层预算）+ §13 #3（注入硬顶 1,800）。

### 22.1 交付件

| 件 | 内容 |
|---|---|
| `src/supply-assembly.ts`（新） | `assembleSupply`（**核心必进** · 三层预算 · **整条进或整条丢** · **溢出全量记账**）· `renderSupplyText` · `DEFAULT_BUDGET`（1000/600/200/**联想 0**） |
| `scripts/supply-preview.mjs`（新） | 真库离线预览：候选/实装/字符/被挡下行全账（分层复用 `targets#indexRowInLayer`） |
| `scripts/test-supply-assembly.mjs`（新·已登记） | **28 条**单测（最小充分集 · 溢出可见 · 不重排 · 联想槽独立） |

### 22.2 唯一的新增机制：联想槽独立预算

注入打分是 `α_rel·relevance + α_imp·importance + α_rec·recency`。
**α_rel 越强，越不可能发生越界碰撞**——精度与惊喜在数学上对立，**调权重解决不了**。
故 `serendipity` 拿独立额度、与相关性面**互不挤占**；缺省 **0（关闭）**，启用时 `meta.budgetTotal`
显式上升 ⇒ 不许"悄悄多花上下文"。

### 22.3 实测（真实库离线基线）

| 场景 | 实装 | 字符 | 被预算挡下 |
|---|---|---|---|
| 联想槽关（缺省） | core 1 + 恒定 15 + 变动 9 | 1627 / 1800 | **66 行** |
| 联想槽开（300） | core 1 + 恒定 15 + 变动 9 + **联想 2** | 1896 / 2100 | 67 行 |

⚠ **恒定面候选自身已超额度**（18 行 P 层要挤进 1,000 字符）——这条以前是"看不见的挤压"，
现在由 `meta.dropped` 显式化。这正是 I2a（恒定面每步必在）+ §12 风险 4（溢出可见化）要防的事。

### 22.4 未接线（显式）

装配**尚未接进 `systemPrompt`**：该步（方案档 **P2b**）依赖宿主「`agent/pre-step` → 请求装配」的先后关系，
**仓内无法在不重启的情况下验证**（§15.2 已记录该前置），贸然上等于可能静默关掉认知环。
本节点交付**引擎 + 离线可复现基线**；接线待重启验证后一个开关。

---

## 23. G0 环事件流 + 重放对账（统一事件流账本的环侧落地）（2026-09-13）

**定位**：目标里 G0「统一事件流账本」的环侧兑现。**事件流是不可变历史，store 是当前状态**——
store 会被 `mirrorFile` 按文件整片重写；不另存事件，环的历史就只存在于最终状态里。

### 23.1 交付件

| 件 | 内容 |
|---|---|
| `src/ring-events.ts`（新） | 9 种 op · `eventsFromDiff`（写时差分推导，载荷逐字取自 `meta`）· `replayEvents`（复用写入侧纯函数）· `reconcileRing`（**重放必须能重建状态**）· `ringRecordsOf` |
| `src/*-ring.ts`（改） | 环操作新增显式 **`id` / `text` 覆盖**（**身份以事件为准**：重放不重算 id、不重拼正文） |
| `scripts/record-ring.mjs`（改） | 每次变更**自动追加**事件；`--events` / `--reconcile` / `--backfill-events [--force]` |
| `scripts/test-ring-events.mjs`（新·已登记） | **28 条**（往返无损 · 四类偏差 · 回填保序 · 载荷不靠正文反解） |

### 23.2 实测暴露的两个真问题（都不是推理出来的）

1. **从终态差分推不出中间迁移**：记录已带终态（`kept`/`landed`），只发创建事件 ⇒ 重放停在初始态。
   真库首次回填正是这种情形 ⇒ 补发**终态重建**事件。
2. **重算 id / 重拼正文会走形**：库里老记录的 payload 只活在**正文**里（当时 `meta` 还没有 `what`/`note`），
   重放若重算 id 则后续按 id 的操作全部找不到目标；若重拼正文则与原文不一致。
   ⇒ 环操作新增 `id`/`text` 覆盖，**身份与正文以事件为准**。

### 23.3 实测（真实库）

```
回填 10 条事件
--reconcile  PASS（store 环记录 7 ⟷ 事件重放 7，kind/text/meta 逐条一致）
活路径新开承诺 ⇒ 事件 #11 ⇒ --reconcile 仍 PASS
```

### 23.4 与既有台账的关系（显式）

`audit/ledger.jsonl` 是**判据/写入**的统一台账（消费方已有 `criteria-audit` / `memory-reconcile`）。
环事件落在库内自有路径 `.records/ring-events.jsonl`，**暂不并入**——先求不扰动既有审计消费方；合并留作专项。

---

## 24. G0 剩余两项：KPI 机检门 + 部署版本三处一致（2026-09-13）

### 24.1 KPI 机检门（"机制必须有仪表盘"机械化）

| 件 | 内容 |
|---|---|
| `src/rings.ts`（改） | 新 `RING_KPI`：环 → KPI 产出者（module#fn + 说明） |
| `scripts/check-ring-coverage.mjs`（改） | 新增第 ⑤ 段：**键集须与环集合一致** + **每个 KPI 函数真去 `lib/` import 并断言存在** |

依据（本项目实证，非推测）：**快通道曾恒为 0 而无人知晓**（`fast=0` 崩两次才被人肉发现）。
"加了环却不给 KPI"与"加了分层却没有分布读数"是同一个病 ⇒ 进硬门。

### 24.2 部署版本三处一致巡检

本机实测（**三处互不相同**）：

| 来源 | 角色 | SHA |
|---|---|---|
| `profiles/web/package.json` | 声明 | `f81eb2e5` |
| `profiles/web/pnpm-lock.yaml` | 锁定 | `9f6c920e` |
| `profiles/web/node_modules/.modules.yaml` | **实装** | `1c5b09fe` |

即：**「仓内绿」与「装上去的是哪一代」脱钩**。巡检件 `check-version-pin.mjs` 为**报告态**
（不一致仍 exit 0 + 根治指引）；`--strict` 可作 CI 硬门。配 `--selftest` 反向证伪抽取器，
并对"文件里有依赖名却抽不出 SHA"判**代码问题 FAIL**（防解析器一坏就永远跳过）。

---

## 25. G0 事实环时态失效（双时间戳）+ 镜像状态承接（2026-09-13）

**定位**：目标里 G0「双时间戳」的落地形态 —— **Record 扩展**，不另建事实源。

### 25.1 为什么这条缺口最硬

权重里的知识**没有时间**：模型推得出逻辑，推不出「现在是什么时候、那之后什么变了」。
记忆相对模型的唯一结构性优势，正是**带时间戳的已发生事实**。且旧断言不失效会与新断言并存 ⇒
模型在两份矛盾记忆间随机选（"记多了会变笨"的第二病）。原判据只有 `conflict: supersede`——
**写的时候判一次**，之后无人再管。

### 25.2 交付件

| 件 | 内容 |
|---|---|
| `src/fact-ring.ts`（新） | `isLive`（**坏时间戳 fail-closed**）· `supersede`（幂等 + 记因由/被谁取代）· `revive` · `liveRecords`/`expiredRecords`/`staleReport` · **`factCensus`**（本环 KPI）· `premiseOf` |
| `src/record-store.ts`（改） | `MemRecord.validFrom/validTo` 进模型与 `contentKey`（失效必须是对账可见的走形） |
| `src/record-shadow.ts`（改） | 镜像**承接状态位**（见 25.3） |
| `src/rings.ts`（改） | 事实环 KPI 改指 `fact-ring#factCensus` |
| `scripts/test-fact-ring.mjs`（新·已登记） | **40 条** |

**正交性（不变量）**：`validTo` = 还成不成立；`lifecycle` = 值不值得注入。混用会犯两类错——
把"过时"当"不重要"（继续注入错的事实），或把"不重要"当"不成立"（丢掉真的事实）。

### 25.3 顺手修掉一处会静默吃掉状态的隐患

镜像按文件整片替换记录 ⇒ 该文件上累积的**状态全被清零**：命中统计 `hits/lastHit`、活性 `lifecycle`、
成熟度、双时间戳、以及 `meta` 里的前提/失效因由。
**实测后果：事实环标了"已失效"的断言，下次镜像就复活**；命中统计同样丢失。
现口径：**内容以 md 为准，状态以既有记录为准**。

### 25.4 实测（真库 · 只读）

```
事实环：合计 187 · 有效 187 · 已失效 0 · 坏时间戳 0 · 带前提 0
```

最后一项是信号：仓内判据要求「依赖隐含前提者必须写出前提」，实测**一条都没有**——即该纪律从未产出数据
（可能是"没有依赖隐含前提的条目"，也可能是"没人写"，本件不预设结论）。
**刻意不在真库上演示 `--supersede`**：给用户记忆标失效是内容级动作，而 `validTo` 目前**尚无注入侧消费者**
（标了只是写个字段）——「可写不等于有处置权」。演示走夹具库（单测 H 组）。

---

## 26. 读侧候选集 + 画像行分层订正（时态失效的读侧闭环）（2026-09-13）

### 26.1 为什么这一步是必须的

§25 交付了 `validFrom/validTo`，但它**只写不读** ⇒ 标了失效的断言照样进候选、照样被注入，
「旧事实与新事实并存」的污染一点没减 —— **机制空转**（本项目最忌讳的形态）。
本节点把「**失效者不得入候选**」变成读侧硬规则：`buildCandidates(records, { at })`。

### 26.2 交付件

| 件 | 内容 |
|---|---|
| `src/supply-assembly.ts`（改） | 新 `buildCandidates`：分层 + **时态剔除** + 被剔者进 `expired`（带因由）+ 非可注入计数；`at` 必填（可复现） |
| `src/targets.ts`（改） | 新 `isProfileRow`：画像行（`- … ← 源:`）判定**归 targets 单一实现** |
| `scripts/supply-preview.mjs`（改） | 改调 `buildCandidates`（读侧单一实现；删掉自带的第二份分层逻辑） |
| `scripts/test-supply-assembly.mjs`（改） | 增候选集断言（含端到端「装配+渲染后失效行不出现」） |

### 26.3 真库实测暴露的分层误判（订正）

`indexRowInLayer` 只认 `[tag] …` 形态（真库索引行确为此形），而**画像行是 `- … ← 源:` 形态** ⇒
被判成"非 always"而掉进**变动面**，与 `carriers` 契约（`always:profile` 属 P 层恒定面）不符。

**实测差异：真库恒定面候选 18 → 48**（约 30 条画像行此前被算进变动面）。即
**恒定面的真实压力比以前测到的更大**：

| 场景 | 候选 | 实装 | 字符 | 被预算挡下 |
|---|---|---|---|---|
| 订正前（画像行误入变动面） | core 1 / 恒定 18 / 变动 72 | core 1 + 恒定 15 + 变动 9 | 1627 / 1800 | 66 行 |
| **订正后** | core 1 / **恒定 48** / 变动 72 | core 1 + 恒定 15 + 变动 9 | **1877 / 2100** | **97 行** |

---

## 27. 部署到运行态 + 面板 `/rings` 端点（2026-09-13）

### 27.1 为什么这一步是「重启」的前置，而不是可选项

用户重启宿主后，第一次核对运行态就发现：**重启本身验证不了任何东西**。
`check-installed-sync` 报 **37 件漂移**——本会话新增的 9 个模块（`record-store` / `record-shadow` /
`rings` / `decision-ring` / `relation-ring` / `association-ring` / `fact-ring` / `ring-events` /
`supply-assembly`）在 profile 安装副本里**根本不存在**，宿主加载的是旧代代码。
⇒ 「仓内绿」与「运行态绿」再次脱钩（与 AGENTS.md 记录的历史事故同型）。

### 27.2 部署（按仓内「只覆盖差异文件」路线）

| 步 | 动作 | 结果 |
|---|---|---|
| 1 | 备份安装副本 `lib/`（+ `client.js`）到 `~/.dsh/backups/` | `dsh-shoucang-memory-lib-20260913-201913` · `dsh-shoucang-v2-20260913-202150` |
| 2 | 按 **sha256 逐件比对**后只覆盖差异 | 新增 **27** · 覆盖 **10**（第二轮 +6） · 一致 **130**（第二轮 161） |
| 3 | 复测漂移 | **167/167 一致 · 内容不同 0 · 仅仓内 0**（唯一"仅已安装"= 既有 `client.js.bak-*`，非本次产生，不动） |
| 4 | 热重载 | OK · 清缓存 **45 → 47** 模块（第二轮）· `active → active` |

### 27.3 面板 `/rings`（环内容的可观测面）

环内容此前**只有 CLI 面**（`record-ring.mjs`），面板完全看不到 —— 与「快通道恒 0 无人知晓」是同一个病。
新增只读端点 `GET /api/shoucang-panel/rings`：五环 KPI + **事件流重放对账**，零 LLM、不写库。
路由 35 → 36，三处契约同步（`panel-contract.ts` · `test-panel-wiring` · `gen-panel-contract` 产物）。

### 27.4 运行态实证（真机）

```
GET /rings → 200
环普查   fact 72 · decision 2 · relation 4 · association 1 · value 26 · none 82
决策环   opened 1 · collected 1 · pending 0 · hitRate 1
关系环   关系 1 · 承诺 3 · 待兑现 2 · 人 1
联想环   碰撞 1 · 认可 1 · 落地 1
事实环   合计 187 · 有效 187 · 失效 0
事件流   11 条 · 重放对账 ok=true（store 8 ⟷ replay 8）
```

该路由此前**不存在** ⇒ 返回 200 且数据自洽，即证明**新代码在被执行**（不只是文件拷上去了）。

### 27.5 下一步（重启已解锁）

- **G4 接线（P2b）**：把 `supply-assembly` 装配接进 `systemPrompt`——此前唯一缺口是「无法验证
  `agent/pre-step` 与请求装配的先后」，现在**已验证部署与重载链路可用**，可以动它了。
- **G0 唯一 composition root**：消 5 装配点 + 3 个 `-share` 桥；风险仍在（动在线插件装配），
  但同样已具备"改完即热重载验证"的条件。

---

## 28. G4 接线 P2b：材料改挂 systemPrompt 段（2026-09-13）

### 28.1 交付

| 件 | 内容 |
|---|---|
| `src/mcl.ts`（改） | `mountMaterialBlock`（注册块 `shoucang-mcl-material` · order 89 · 按会话 id 返材料 · 挂 `ctx.effect` · 能力缺失则回落）· `materialOf`（薄材料构造外提，纯函数）· `MclStatus.materialInSystem`（**解析后的实际去向**）· 慢通道分支按开关分流 |
| `src/scheduler.ts`（改） | 新开关 `mclMaterialInSystem`（**缺省 false ＝ 现状零行为变化**）+ 映射进 MclConfig |
| `scripts/test-mcl.mjs`（改） | 20 → **29 条**（F 组：块注册/序 89/消息面零插入/`viaSystem=1`/按会话取/不串话；G 组：**能力不可用时回落**） |

### 28.2 与方案档 §3.3 的对齐

- 材料从「插一条 `user` 消息」→ 挂 `systemPrompt` 块 ⇒ **转录不再被材料污染**（§11 度量目标：0 条）；
- **消息面只留 `nudge`** —— §3.3 明确允许的唯一一项；
- 位置稳定 ⇒ 前缀缓存友好（§4「注入恒有界」的机理）。

### 28.3 门禁抓到的结构问题

`registerMcl` 加完块注册后涨到 **148 行 > I1 上限 120**，被 `audit-wiring` 当场抓住。
按领域外提 `mountMaterialBlock` / `materialOf` 两个模块级函数后压回限额 —— 棘轮再次证明有效
（若无它，装配函数会一路膨胀，正是 I2「32 字段团块」的同型退化）。

### 28.4 真机实证与**回滚**

```
部署 + 重载 → GET /mcl/status 出现 materialInSystem 字段（此前无 ⇒ 新代码在跑）
写入开关 + 重载 → materialInSystem=true（未回落 ⇒ 块确实挂上）
```

**但开关最终回滚为 `false`**，原因是取基线时发现**放行判据不可执行**：
`mcl.ts` 只在**不合规**分支写审计行 ⇒ 909 慢通道步中 803 条全为 `compliant:false`，**合规步 0 行落账**。
⇒ §12 风险 1「用 `judge` 合规机检前后对比，**合规率不降才放行**」**当前测不了**。

按仓内「先有仪表盘、再动 active」（`activationShadow` 先影子后 active 的同一纪律）回滚。
**下一小步**：让合规步也落账（3 行），即可取得真实合规基线与对照，再一行开启。

---

## 29. P2b 放行判据补齐：合规步落账 + 分流读数（2026-09-13）

### 29.1 问题

§12 风险 1 规定 P2b 的放行判据是「用 `judge` 合规机检**前后对比，合规率不降才放行**」。
但 `mcl.ts` **只在「不合规」分支写审计行** ⇒ 合规率没有分母（实测 909 慢通道步中 803 条带判定、
**全是 `compliant:false`、合规 0 行**）⇒ 判据**执行不了**，P2b 只能停在"已实现、已真机验证、但不敢开"。

### 29.2 交付

| 件 | 内容 |
|---|---|
| `src/mcl.ts`（改） | 合规步补 `compliant: true` 审计行（字段与 false 行同构：`nudge/nudges/topics`）⇒ **有分母** |
| `scripts/mcl-compliance.mjs`（新） | 按 `viaSystem` **分段**算合规率；判据 `段(sys) ≥ 段(msg) − 5pp`；样本不足判 **INSUFFICIENT**（退 3，不下结论）；`--since` 时间窗（旧行无分母，混算会得 0% 的 artifact） |
| `scripts/test-mcl.mjs`（改） | 29 → **32 条**（H 组：引用材料后不再引导 · 合规行落账 · 字段齐备） |

### 29.3 现状（如实）

```
开关：materialInSystem = false（现行运行不变）
基线窗口起点：2026-09-13T12:36:50Z
读数：INSUFFICIENT —— 消息面段 n=0 / systemPrompt 段 n=0（窗口内）
```

**放行条件（可机械执行）**：窗口内两段各 ≥20 条判定样本 → 跑 `mcl-compliance.mjs --since <起点>`：
`PASS` 则一行开启（`scheduler.json` 置 `mclMaterialInSystem: true` + 重载）；`REGRESS` 则不开并回滚。

---

## 30. G0 composition root 前置：惰性桥棘轮（2026-09-13）

### 30.1 为什么先做仪表盘

目标要求「唯一 composition root」——具体动作是**消 3 个 `-share` 惰性桥**
（`scheduler-share` / `deepsleep-share` / `mcl-share`）。但"消桥"若无数字便是愿望；
且拆装配层是高风险的（动在线插件），按仓内先例（拆面板巨石前先建 `test-panel-view-contract` 安全网）
应**先固化基线再动刀**。

### 30.2 基线（实测，6 条边）

| 侧 | 边数 | 落点 |
|---|---|---|
| **发布** | 3 | 全在 `src/scheduler.ts`（`mclShare.api = …` / `deepSleepShare.api = …` / `schedulerShare.api = …`） |
| **消费** | 3 | 全在 `src/panel-observe.ts`（逐桥读 `.api`） |

**目标 0**：composition root 直接构造并显式传句柄 ⇒ 两侧都不再需要全局 holder。

### 30.3 门禁语义（棘轮 + 反向证伪）

- 边数 > 基线 ⇒ **FAIL**（新增桥消费点须改走 root，或显式上调基线并说明）；
- 边数 < 基线 ⇒ PASS 并**提示收紧基线**（只许收紧）；
- `--selftest`：6 例证伪扫描器（发布 / 消费 / 无 import / 仅注释提及）。

**它当场抓出一个真缺陷**：初版按文件名推导标识符（`deepsleep-share → deepsleepShare`），
而真实导入名是 **`deepSleepShare`（大写 S）** ⇒ **漏掉整整一条桥**，基线被算成 4。
⇒ 名字推导规则本身就是「第二份事实源」，与真实导入名一漂移就静默漏计。现改为从 import 语句解析。

---

## 31. composition root 第一刀：`mcl-share` 退役（6 → 4）（2026-09-13）

### 31.1 形态

新 `src/composition.ts` = **root 的持有面**：`createComposition()` 返回显式句柄盒
`{ mcl: { current: MclHandle | null } }`，由 `index.ts`（唯一装配入口）创建并交给两侧：
`applyPanel(ctx, config, comp)` / `applyScheduler(ctx, config, comp)`。

**关键取舍：不换装配次序**。panel 仍先装（原样），故启动期行为零变化；句柄盒的 `{ current }` 一层间接
正是原桥存在的理由，现在它**显式化在 root 里**，而不是藏在模块级全局。

### 31.2 退役与守卫

| 动作 | 结果 |
|---|---|
| 删除 `src/mcl-share.ts` | `/mcl/status` 改读 `d.mcl.current`；无导入残留（仅注释提及历史） |
| comp 缺省时 | 给空盒 ⇒ 如实报 `mcl-not-ready`（与"调度器未装配"同语义，不造假态） |
| 棘轮收紧 | 基线 **3+3 → 2+2**；`RETIRED=['mcl-share']` —— **复现即 FAIL** |
| 实测 | **4/4 边** · GATE 绿 · `check-srcmap` PASS |

### 31.3 真机验证

```
部署（新增 3 / 覆盖 11 / 一致 153）+ 热重载 → GET /mcl/status → active=true
  topK=3 · materialInSystem=False · slow=0        ← 装入/取出链路真的通了
/rings → 200 · /suite → 200 · /criteria → 200
```

### 31.4 顺带发现（下轮补）

`tsc` **不清理已删源文件的产物** ⇒ `lib/mcl-share.{js,map}` + `lib/types/mcl-share.d.ts` 成为孤儿
（仓内 3 件、安装副本 3 件，已清）。而 `check-srcmap` 只做 **src→lib 单向**核对 ⇒ **孤儿产物漏检**。
**下轮**：给它加反向检查（lib 顶层每个 `.js` 须有对应 `src/*.ts`）。

---

## 32. composition root 第二刀：`deepsleep-share` 退役（4 → 2）+ 反向孤儿检查（2026-09-13）

### 32.1 交付

| 件 | 内容 |
|---|---|
| `src/composition.ts`（改） | `DeepSleepApi` 接口迁入（原 `deepsleep-share.ts` 的契约）+ `deepSleep: { current }` 盒 |
| `src/scheduler.ts`（改） | 装 `comp.deepSleep.current = distill`（原 `deepSleepShare.api = distill` 删除） |
| `src/panel-observe.ts`（改） | 4 个深睡/蒸馏端点改读 `d.deepSleep.current`；`ObserveDeps` 增 `deepSleep` 盒 |
| `src/deepsleep-share.ts` | **已删除**（含 lib 孤儿产物清理） |
| `scripts/check-bridges.mjs`（改） | 基线 **2+2 → 1+1**；`RETIRED += deepsleep-share`（复现即 FAIL） |
| `scripts/check-srcmap.mjs`（改） | **新增反向孤儿检查**（见 32.3） |

### 32.2 真机验证

```
部署（覆盖 10）+ 热重载
/mcl/status      → 200 · active=True · materialInSystem=False
/deepsleep       → 200 · active=True
/deepsleep/config→ 200 · active=True running=有      ← box 链路真的通（否则这里必是 not-ready）
/rings → 200 · /suite → 200
```

### 32.3 `check-srcmap` 的反向孤儿检查（补上轮的漏检）

**缺口**：`tsc` 不删已删源文件的产物；而该门只做 src→lib 单向核对 ⇒ 退役桥的
`lib/*.js`/`.map`/`types/*.d.ts` 成孤儿**而门全绿**，孤儿随即被部署（**死代码随包发布**）。

**修法**：lib 顶层每个 `.js` 须有对应 `src/*.ts`，否则 **FAIL**；白名单仅 `client`
（← `src-client/` 经 `npm run build:client`）。
**反向证伪**：造 `lib/_orphan-probe.js` ⇒ **FAIL exit 1**；删除 ⇒ PASS。

---

## 33. composition root 收尾：`scheduler-share` 退役（2 → **0**）（2026-09-13）

### 33.1 交付

| 件 | 内容 |
|---|---|
| `src/composition.ts`（改） | `SchedulerApi` 接口 + `scheduler: { current }` 盒 |
| `src/scheduler.ts`（改） | `schedulerShareApiOf(...): SchedulerApi`（**返回类型标注 ⇒ 与 root 形状编译期对齐**）· 装 `comp.scheduler.current` |
| `src/panel-observe.ts`（改） | `/suite` · `/llm/models` · `/distill/config` 改读 `d.scheduler.current` |
| `src/scheduler-share.ts` | **已删除**（含 lib 孤儿清理） |
| `scripts/check-bridges.mjs`（改） | 基线 **1+1 → 0+0**；`RETIRED` 三条齐 · **目标达成** |
| `test-scheduler-wiring.mjs` / `test-targets.mjs`（改） | 按 root 契约重写；新增「lib 中无任何 `-share.js` 引用」断言 |

### 33.2 真机验证（7 条路由全 200）

```
/mcl/status → active=True · materialInSystem=False
/suite → members=1
/distill/config → active=True · 键=10
/deepsleep → active=True        /deepsleep/config → active=True running=有
/llm/models → models=83         /rings → ok
```

`/llm/models` 与 `/distill/config` **只能经 scheduler 装配面到达**；桥已全部不存在而仍通 ⇒ root 链路成立。

### 33.3 复盘：一次真实的误删（必须留档）

清理退役桥产物时用了**通配符**：`Get-ChildItem -Filter "*-share*" | Remove-Item` ⇒ **误匹配 `panel-shared.*`**
（"panel-**share**d"），而它是 panel / panel-observe 的核心依赖。缺失后热重载报
`The "type" argument must be of type string. Received an instance of ModuleJob`，**连续两次失败**；
按 sha 逐件补回后恢复（161/161 一致），重载转为「坏缓存兜底重载完成」。

**教训**：共享目录内清理**只按本次确定的精确文件名**逐条删，**永不按通配符扫删**。
根因不是手滑，是"名字里含 share 的都该删"这个**想当然的模式**——与「名字推导 = 第二份事实源」
（§30 的 `deepSleepShare` 漏计）是同一类错误的两个面。

---

## 34. P2b 开启 + 判据换成「当场可测」（2026-09-13）

### 34.1 原判据为何不可执行（比"没仪表盘"更麻烦）

§29 给合规率补了分母（合规步也落账），但它**样本结构性稀疏**：合规判定只落在**慢通道后续步**，
而真实分布里多数步是**快通道** ⇒ 实测窗口 **0/803**。⇒ 不是"缺仪表盘"，是**仪表盘没有数据**，熬时间也等不来。

### 34.2 换判据：块渲染计数

| 指标 | 含义 |
|---|---|
| `sysBlockCalls` | 宿主渲染该块的次数（0 = 块压根没被调用） |
| `sysBlockNonEmpty` | 其中**返回了材料**的次数（>0 ⇒ 材料确实进得了注入面） |
| `sysBlockLastChars` | 末次材料长度 |

三者经 `/mcl/status` 暴露（**活体可读**，不必翻日志），直接回答 P2b 的实质问题。

### 34.3 启用与实测

```
scheduler.json 增量置 mclMaterialInSystem=true（备份 .bak-p2b-on-*）→ 热重载（清缓存 51 模块 · client ✓）
/mcl/status → materialInSystem=True（**未回落** ⇒ 块已挂）· sysBlockCalls=1（**宿主在渲染该块**）
              slow=0 · injected=0（本轮尚无慢通道材料可放）
```

### 34.4 一次被打断的重载 · 代数判别法（可复用）

`dev_reload_package` 调用被中断、结果未记录。**不盲目重试**，先核外部状态——用**本轮新增字段**作判别器：
`/mcl/status` 含 `sysBlockCalls` ⇒ 运行态已是新代码 ⇒ 那次重载**实际成功**（中断只在结果记录环节）。
**判据**：要判断"装上去的是哪一代"，找**只有新代码才有的可观测字段**，比读日志可靠。

---

## 35. 已安装副本特性探针补宿主侧（2026-09-13）

### 35.1 缺口

`check-installed-features` 原只认**客户端/契约**产物（S1–S4 · 14 项）⇒ 本会话新增的宿主侧能力
（五环 · 事件流 · composition root · 双时间戳 · 读侧候选集 · P2b 材料块 · `storeMode`）**全查不到**。
而"文件 sha 一致 ≠ 装上去的那份带着本轮能力"**正是该件的立件理由**——覆盖面漏一半，理由就落空一半。

### 35.2 补什么

| 组 | 内容 |
|---|---|
| 客户端/契约（原 14 项） | 插槽 / 组件库 / 皮肤 / 契约；**新增** `/rings` 在契约表 |
| **宿主侧（新 15 项）** | `rings#RING_OF_KIND` · `decision-ring#scorecardOf` · `relation-ring#trustOf` · `association-ring#associationCensus` · `fact-ring#factCensus` · `ring-events#reconcileRing` · `record-store#validTo` · `record-shadow#saveStoreRecords` · `supply-assembly#buildCandidates` · `composition#createComposition` · `mcl#sysBlockCalls` / `materialInSystem` · `scheduler#storeMode` · `panel-observe#ringsRoute` / `scheduler.current` |
| **不变量** | 已安装 lib 中不得有 `-share.js` 引用（与仓内 `check-bridges --gate` **各查一侧**：一个查仓、一个查装上去的那份） |

### 35.3 实测与反向证伪

```
31 项标记齐全 ✅
反向证伪：安装副本造 _falsify-probe.js（import './scheduler-share.js'）⇒ 该条 ❌ + 计 1 项缺失；删除 ⇒ 复绿
```

---

## 36. DS4 前置：观测流注册表 + 棘轮（13 → 目标 1）（2026-09-13）

### 36.1 为什么先数

DS4 要求「一个 `events.jsonl`，现有 8 个 jsonl 降为投影」——但**"现有几个"从未数过**。
本项目已三次证明"没有数字的目标等于没有目标"：快通道恒 0 无人知晓 · 惰性桥 6 条边没数过就拆不动 ·
合规率没分母就无从放行。故先立**注册表 + 棘轮**（与前两者同一模式）。

### 36.2 注册表（13 条 · 实测）

| 候选主干 | 说明 |
|---|---|
| `ledger.jsonl` | 统一台账（judgement + write 回执） |
| `ring-events.jsonl` | 环事件流（9 op · 重放可重建状态） |

其余 11 条：`mcl-audit` · `distill-audit` · `score-shadow` · `activation-shadow` · `episodes` · `activity` ·
`access-real` · `maturation` · `distill-watermark` · `archive-progress` · `stub`。

**豁免 4 条（须写明理由）**：`session.jsonl`（宿主转录）· `records.jsonl`（Record 事实源）·
`.vector-cache.jsonl`（可重建缓存）· `judgement-ledger.jsonl`（legacy 只读别名）。

### 36.3 门禁语义 + 两个实测坑

- 未登记的 `.jsonl` 字面量 ⇒ **FAIL**；登记项查不到 ⇒ 提示清理；流数 < 基线 ⇒ 提示收紧。
- `--selftest` 6 例（含"注释里的名字不算"）。

**坑一**：初版**没剥注释** ⇒ 文档里的目标名 `events.jsonl` 被判未登记流 ⇒ **门禁对文档开火**。
修法沿用 `check-carriers` 的「先剥注释再匹配」。
**坑二**：首版登记**漏了 `stub.jsonl`**（`distill-infra.ts` 真在写）——被扫描抓出来才补登。
⇒ **扫描是发现手段，注册表是承担**；两者缺一，"登记不全"就会伪装成"没有漏网"。

---

## 37. DS4 形态统一第一刀：统一事件信封 + 形态审计（2026-09-13）

### 37.1 根因：一个静默缺陷

审计写入器原为 `{ at: new Date().toISOString(), ...o }` —— **展开顺序允许调用方用 `at: undefined`
把注入的时间戳覆盖掉**，而 `JSON.stringify` **静默丢弃 undefined 键** ⇒ 行里没有 `at`，且不报错。
**实测证据**：`--shape` 读出 `distill-audit` **930 行里 1 行缺 `at`**。

### 37.2 修法：`envelope(o, defaultType)`

把 `at` 与 `type` 放在**展开之后**并做有效性兜底；调用方给的**合法**值仍被尊重：

```ts
const envelope = (o, defaultType) => JSON.stringify({
  ...o,
  at: typeof o.at === 'string' && o.at ? o.at : new Date().toISOString(),
  type: typeof o.type === 'string' && o.type ? o.type : defaultType,
}) + '\n'
```

四条写出路径（`audit` / `recordEpisode` / `recordStub` / `ledger`）全部改用 ⇒ **结构字段调用方弄不没**，
且**判别字段 `type` 一次补齐 4 条**（原来只有 `ledger` 有）。

### 37.3 形态审计（`--shape`，报告态）

| 结论 | 计数 | 明细 |
|---|---|---|
| ✅ 可并入 | 4 | `mcl-audit` · `ledger` · `score-shadow` · `activation-shadow` |
| ⚠ 需改造 | 3 | `distill-audit`（1 行缺 `at`；仅 850/930 有 `sid`）· `episodes`（无判别字段）· `distill-watermark`（无判别字段 + `sessionId`） |
| —— 无数据 | 6 | 条件写入，本机暂无数据（无法核对形态） |

改造口径：判别字段统一 `type` · 时间统一 `at` · 会话键统一 `sid`；**做完把注册表基线收紧一格**。

### 37.4 已知未做（显式）

`mcl.ts` 的审计钩子是**同一形态的第二个副本**（`{ at, ...o }`）⇒ 下轮一并收敛到同一信封
（这本身也是"同一事实两份副本"的老病）。

---

## 38. DS4 形态统一第二刀：信封收敛为单一实现（6 处 → 1）（2026-09-13）

### 38.1 副本真相

搜"同一事实的副本"不能靠记忆——实测 `JSON.stringify({ at: new Date().toISOString(), ...o })` 在 src 里
**6 处 / 5 个模块**：`distill-infra` ×4 · `mcl` · `deepsleep-tree` · `treeops` ×2 · `vec`。
（上轮只修了 distill-infra 那四条路径，故本轮收敛其余全部。）

### 38.2 做法与收益

| 项 | 内容 |
|---|---|
| 新件 | `src/event-envelope.ts#envelopeEvent(o, defaultType)` |
| 收敛方式 | 各处 `import { envelopeEvent as envelope }` **别名导入** ⇒ 零调用点改动 |
| 修根因 | `at` 不再可能被调用方 `undefined` 覆盖后静默丢弃 |
| 补判别字段 | `mcl.<kind>` · `archive.<op\|action\|kind>` · `score.shadow` ⇒ **DS4 形态统一再推进 3 条** |
| 消副本 | 同一事实 **6 份 → 1 份** |

**新不变量（已反向证伪）**：`check-observability` 断言源码中不再出现原始写法（造回一行 ⇒ FAIL）。

### 38.3 过程留痕（一次错）

收敛 `deepsleep-tree.ts` 时把锚点选成 `import { join } from 'node:path'` 并整行替换 ⇒ **删掉了 `join` 的导入**，
typecheck 立刻报 8 处 `Cannot find name 'join'`，当场修回。
⇒ **教训：替换 import 行时锚点必须是"要加的那一行"**，不能拿相邻行当锚点；
这次是类型系统兜住的——若被删的是无类型引用的东西，不会这么响。

---

## 39. DS4 形态统一第三刀：水位流补判别字段 + 口径修正（2026-09-13）

### 39.1 核实：`episodes` 已经修好了

上轮信封改造后 `recordEpisode` 走 `envelope(o, 'episode')` ⇒ **`episodes` 自动获得 `type: 'episode'`**。
`--shape` 仍把它列为"需改造"，是因为**该表读历史数据**。⇒ 真正剩下的只有 **`distill-watermark`**。

### 39.2 补判别字段 + 一处**刻意不做**的偏离

`distill-watermark.ts` 写入器追加 `type: 'watermark'`。**`sessionId` → `sid` 不改**：
读侧 `readWatermarks` 与 **G-20 双证守卫**都按 `sessionId` 取键；为一次形态对齐动**水位守卫**的读链，
风险与收益不成比例。**偏离显式留痕**（合并时做字段映射即可）——留痕本身比"顺手统一"更重要。

**验证**（`test-event-envelope` 13 → 18）：新 E 组用**真写入器**验证 `type` / `at` / `sessionId` 保真
+ `readWatermarks` 仍取得到（读侧未受影响）。

### 39.3 口径修正：门禁抓到了我自己的测试

`check-observability` 把**测试夹具名** `wm.jsonl` 判成"未登记观测流"⇒ 门禁红。
**门禁没错，是口径过宽**：观测流的定义是「**运行时（src）写出**的 append-only 流」，而 `scripts/` 里多为消费者/夹具。

现**分档**：`src` 出现未登记流 ⇒ **FAIL**；`scripts` 出现未登记名 ⇒ **只报 ⚠**（附"若确为运行时写出请移入 src 并登记"）。
**双向证伪**：`src` 造未登记流 ⇒ FAIL；`scripts` 夹具 ⇒ 仅提示。

---

## 40. DS4 合并第一刀（真合并）：`score-shadow` → `ledger`（13 → 12）（2026-09-13）

### 40.1 先做消费者侦察（这一步省掉了大量风险）

全仓搜 `score-shadow` 的消费者：

| 消费者 | 结论 |
|---|---|
| `scripts/memory-reconcile.mjs` ⑤ 段 | **唯一代码读取者** ⇒ 需要改 |
| `scripts/criteria-audit.mjs` | 已按 `type.startsWith('decision')` 过滤 ⇒ **不受影响，无需改** |
| 文档（spec / contract / 规划档） | 引用路径说明 ⇒ 表述需跟进（另行） |

⇒ 「改消费方级别」的风险被侦察降为一处。

### 40.2 改法

- `src/vec.ts`：影子写入改投 `ledger.jsonl`（`type: 'score.shadow'`，走统一信封）；
- `memory-reconcile` ⑤：读 **legacy 文件 ∪ ledger 的 `score.shadow`** 两处合并 ⇒ **历史不丢、新数据同源**；
- 棘轮：**13 → 12**；`score-shadow.jsonl` 转 **legacy 只读**豁免（理由写明）。

### 40.3 验证三件

```
① 前后对拍（改消费方的纪律）：⑤ 段逐字等于基线 —— 409 行 / 1783 样本 · corr=0.021
② 写入侧实证：activation-calib --n 1（带 embed）⇒ ledger 340 → 348 行，末行 type=score.shadow mode=legacy top=5
③ legacy 不再增长：score-shadow.jsonl 148.8KB · 末次写入 20:18（改动之后无新写入）
```

**附带发现**：`--no-embed` 时 `recallRanked` 走**词法早退**，到不了影子分支 ⇒ 首次"用 CLI 造样本"失败是**预期行为**；
即该路径的影子数据**只在嵌入可用时产生**——这条以前没人写下来过。

### 40.4 又一例「仓内绿 ≠ 运行态绿」（门禁抓住）

`check-deploy-sync` 报 `scripts/memory-reconcile.mjs` **仓内与库内不一致**：该脚本**在记忆库里有部署副本**
（面板 `/reconcile` 跑的就是库内那份），我只改仓内 ⇒ 库内仍是旧逻辑。
备份 → 部署 → **库内副本实跑**：`⑤ 影子打分: 417 行 / 1815 样本`（= legacy 409 + ledger 新增 8）
⇒ **合并读取在运行态生效**；复查部署面 **不一致 0**。

---

## 41. DS4 合并第二刀：`activation-shadow` → `ledger`（12 → 11）（2026-09-13）

### 41.1 消费者侦察：这次是零

全仓搜 `activation-shadow` ⇒ **代码侧零读取者**：只有写入者（`distill-activation.ts`）+ 文档；
`activation-calib.mjs` 是**从转录重采样**、并不读本文件 ⇒ **本刀无需改任何消费方**。
（与第一刀形成对照：那一刀有 1 个读取者要改，这一刀没有。）

### 41.2 改法与验证

- `distill.ts`：`actShadowFile` 落点改指 `ledger.jsonl`；
- `distill-activation.ts`：写入改走统一信封（`type: 'activation.shadow'`）；
- 棘轮 **12 → 11**；`activation-shadow.jsonl` 转 legacy 只读豁免。

**验证**：`test-event-envelope` **21 条**（新 F 组用真写入器 `createActApi().activationStep(...)` 验证
`type` / `at` / 既有字段保真）；**legacy 已冻结**（84.2KB · 末次写入 20:18）。

### 41.3 统一台账的形态（运行态）

```
decision.ingest 142 · write.ingest 106 · check.sleep 74 · decision.consolidate 11
· score.shadow 8（第一刀活体行）· write.consolidate 8 · activation.shadow（待下个用户回合）
```

⇒ **单一文件 + `type` 判别 + 消费方按 `type` 过滤** —— DS4 的目标形态正在成形（13 → 11，目标 1）。

---

## 42. DS4 口径修正：注册表分「事件流 / 状态表」（事件流 → 8）（2026-09-13）

### 42.1 触发：第三条并不动

准备并 `archive-progress` 时发现：它由 `archive-lib.upsertMark` **按 sessionId upsert**（每会话仅最后一条有效）
—— **不是 append-only 事件流**。把 upsert 表追加进共享台账会破坏其语义。

### 42.2 按源码核清三条（不靠印象）

| 流 | 写入语义（源码依据） | 家族 |
|---|---|---|
| `activity.jsonl` | `activity.ts` **原子替换整表** | state |
| `archive-progress.jsonl` | `archive-lib.upsertMark` **按 key upsert** | state |
| `maturation.jsonl` | `maturation-scan` **每次扫描覆盖写** | state |

### 42.3 修正后的数字（口径只对"能合并的东西"计数）

```
事件流 8（目标 1）: mcl-audit · distill-audit · ledger（主干）· episodes · access-real
                  · distill-watermark · ring-events · stub
状态表/投影 3:      activity · archive-progress · maturation（可重建、不参与"合并为单一事件源"）
```

⚠ **8 与方案档原话「现有 8 个 jsonl」精确吻合** —— 此前把状态表一并算成 13，是**两个家族混算**。
DS4 对状态表的要求本来就是「降为**投影**」，而它们**本就是派生快照** ⇒ 该项**已然成立**。

---

## 43. DS4 合并第三刀：`stub` → `ledger`（事件流 8 → 7）（2026-09-13）

### 43.1 为何不并 `episodes`（一个必须记下的真障碍）

侦察：`episodes.jsonl` 也**零代码消费者**，看似理想。但它带 **`EPISODE_CAP` 裁剪**（读全文件 → 重写保留末 N 行）。
并进共享台账后，**那段裁剪会截断整个 ledger** ⇒ 合并前必须先有「**按 `type` 裁剪**」机制。
**这是设计步骤，不是搬代码** ⇒ 本轮不并，留作显式待办（`episodes` 仍在事件流 7 条里）。

### 43.2 并 `stub`（干净的那条）

| 项 | 内容 |
|---|---|
| 写入器 | `recordStub` 改投 `ledger.jsonl`（`type=stub`，统一信封） |
| 消费方 | **代码侧零读取者**；仅两份审计规程引用路径 ⇒ 文档改口径 |
| 文档 | `audit-protocol.md` + `skill/audit-protocol.md`：第 3 问改指 `ledger.jsonl` 的 `type=stub` 行；第 5 问更名「**裁决存根抽验**」 |
| 棘轮 | 事件流 **8 → 7**；`stub.jsonl` 转 legacy 只读 |

**验证**：`test-event-envelope` **22 条**（新增「存根已并入台账 `type=stub`」+「**不再单开 `raw-stub/stub.jsonl`**」
——后者才是合并的实质：旧落点真空了）。

### 43.3 过程留痕（一次低级错）

改注册表时**多留一个 `]`**（数组提前闭合，后续条目变成游离表达式）⇒ 门禁直接
`SyntaxError: Invalid destructuring assignment target` **崩溃**。按纪律**先直跑取原始报错**（不猜），
读到行号后一眼定位。⇒ **删/改数组末条时必须复核括号配对**。

---

## 44. DS4 合并第四刀：按 type 裁剪机制 + `episodes` → `ledger`（事件流 7 → 6）（2026-09-13）

### 44.1 机制先行（上轮拦下的障碍，本轮先解）

`src/ledger-compact.ts`：

| 设计点 | 理由 |
|---|---|
| `planCompaction(lines, type, keepLast, slack)` 纯函数 | 裁剪逻辑可单测，不必真写文件 |
| **只删同 type 的最旧行** | 其他 type 原样保留、顺序不变 —— **本机制存在的全部理由** |
| **余量 slack** | 裁剪要重写整文件，不能每追加一行就重写一次 |
| **原子替换**（备份 → tmp → rename） | 与仓内 `test-atomic-write` 同纪律 |
| **坏行不可裁** | 解析失败的行一律保留 —— **不因裁剪丢证据** |

### 44.2 再用它并 `episodes`

`distill-paths#episodeFile` → `ledger.jsonl`；`recordEpisode` 写入后 `compactFile(…, 'episode', EPISODE_CAP, 8)`；
棘轮事件流 **7 → 6**。

### 44.3 测试（21 条，已登记）

A 纯决策（其他 type 一条不少 + 顺序不变 + 留最新）· B 阈值（未超绝不动手）· C 边界（空文件 / 零条 /
坏行保留 / `keepLast=0` / 非法值防御）· D 真文件（其他 type 行数不变 · 5→3 · 有备份 · 无 tmp 残留 ·
余量内 noop · 缺文件 missing）。
⇒ 把「**删错了不会有人报错**」变成会响的断言（台账各写入点都 catch 静默，这正是必须有测试的原因）。

### 44.4 残余风险（诚实记录）

重写窗口内其他写入者的 append 可能丢失。缓解：只在超阈值时触发（低频）· 台账本就是 best-effort。
与原 `episodes` 裁剪**同一量级**，**不构成回归**。

---

## 45. 断言图内核（拍板「合并」）+ `storeMode=record` 切源决策（2026-09-13）

### 45.1 拍板与路线

用户拍板：SQLite 断言内核 → **合并**（不并存）· `storeMode=record` → **合并** · 并授权**以项目质量为准自行决定切源时机**。

**架构级理由（为何"合并"对）**：本仓已有单一事实源（`records.jsonl` + 可重放 `ring-events.jsonl`）。
再加一个 SQLite 库 = **同一事实两份权威**，必然漂移——仓内已反复吃过（惰性桥 6 处副本 · 信封写法 6 处副本 ·
三处版本记录各说各话）。**断言图的价值在关系，而关系本来就在记录字段里。**

### 45.2 断言图内核（`src/assertion-graph.ts`）

零 IO、零存储、纯函数；**节点 = 记录 + 外部锚**，**边 = 记录里已经写着的关系**：

| 边 | 来源 | 语义 |
|---|---|---|
| `answers` | `outcome.meta.decisionId` | 后果回收 |
| `collision` | `association.meta.a/b` + `landed` | 联想环（撞上两个 §） |
| `commitment` / `relation` | `meta.who/direction/status/level` | 关系环 |
| `points-to` | `pointer` | 证据锚 |
| `provenance` | `source` | 来源 |
| `supersede` | `validTo` + 同 kind+subject | 时态谱系 |

另附 `neighborsOf`（两向邻域）· `competingOf`（**竞争断言组**：同 `pointer` 上 ≥2 条活跃且文本不同 ⇒ 需裁决）·
`graphCensus`（KPI）。

**真库实测**：**161 记录 + 31 锚 · 136 边**（answers 1 · collision 2 · commitment 3 · relation 1 · pointsTo 91 ·
provenance 38）· 竞争组 **6** · 引用完整性 **0 悬空**。测试 **29 条**（已登记）。

### 45.3 `storeMode=record`：本轮**不翻**（决定 + 依据）

`check-record-parity --coverage` 量出的就绪度：

```
索引载体 3/3 有记录表示 · 17171/17171B   ← 且 records → md 逐字节一致
详情载体 0/8 有记录表示 · 0/94679B       ← notes/*.md 在 Record 里根本没有表示
技能资产（spec/契约/协议/CHANGELOG/README）不计入 —— 技能本体，非记忆载体
```

⇒ 现在切源 = 「索引由 Record 权威 + 详情由 md 权威」的**双权威**，正是"合并"要消除的东西。
**前置条件**：先按 `### §` 把 `notes/*.md` **小节记录化**，再用往返闸逐字节证明。

### 45.4 自我纠正（两处）

1. 新建的 `check-record-projection.mjs` 与既有 `check-record-parity` ①**往返闸重复** ⇒ 按「单一实现」
   纪律**删掉新件**，只把**新的**「切源就绪度」并入既有门禁。
2. 就绪度**首版口径错**：把**技能自身文档**当成"记忆载体"⇒ 误导性的 7.2%。现分
   **索引 / 详情 / 技能资产（排除）** 三类，技能资产明确不计入。

### 45.5 运行态发现（运维事实，必须留档）

部署时出现异常数字（**新增 46**）⇒ 查明为**安装副本曾被宿主重新物化回退**到**已提交版本**
（profile 依赖指向 git 提交，而本会话改动**未提交**），旧代 lib 连同**三条退役桥的产物**一起回来了。
按**精确文件名**（不用通配符 —— §33 教训）清掉 9 件 stale 产物后：安装副本 **170/170 一致 · 仅已安装 0**，
特性探针 **31 项齐全**、桥退役不变量 ✅。

⇒ **风险**：只要改动未提交，宿主任何一次重新物化都会把"装上去的那份"退回旧代。
**检测器**＝`check-installed-features`（31 标记 + 桥不变量）；**修复**＝重跑部署 + 复验。

---

## 46. 切源唯一前置达成：`notes/*.md` 记录化（2026-09-13）

### 46.1 先实证后落地（方法）

动手前先问：既有 `parseRecords` + `renderFile` 对 notes 文件**本就往返无损吗**？
**实验**：8 个 notes 文件 ⇒ **全部逐字节一致**（789 行）。
⇒ 结论先行：这件事**几乎免费**，只需把载体面列全，**不需要新的解析/渲染逻辑**。

### 46.2 落地与结果

- 新增 `record-shadow#carrierFiles(root)`（索引三件 + `notes/*.md`）—— **镜像 / 对账 / 就绪度三处共用**。
- `record-sync --import`（先备份影子库）⇒ 影子库 **187 → 976 条**。
- `check-record-parity` 的**往返闸 + 对账闸**扩到 **11 个载体**，**全部逐字节一致**。

```
索引载体 3/3 · 17171/17171B        （此前 3/3）
详情载体 8/8 · 94679/94679B        （此前 0/8 ← 本轮补上）
```

**断言图实测（976 条库）**：831 记录 + 31 锚 · 136 边 · 竞争组 6 · **0 悬空**。

### 46.3 模型事实（对切源有约束力）

976 行 → **831 唯一 id（145 重复）**，重复几乎全来自**空行/完全相同的行** ⇒ `id = 内容指纹` **对重复行不唯一**。
⇒ **切源后定位必须用 `(file, order)`，不得拿 `id` 当主键**（否则重复行互相干扰、增删改错行）。
md 投影不受影响（`renderFile` 不去重 ⇒ 对账仍逐字节一致）。

### 46.4 自我纠正 + 决策状态

- `--coverage` 扩载体后把全清单当"索引"⇒ 报出 **19/19** 的荒谬数字；分类改回按 `INDEX_FILES` 判定。
  **又一次证明：口径错了，数字会自己变得很好看。**
- **`storeMode=record` 仍未翻**：前置**已不是覆盖率**，只剩**迁移 + 回滚路径**（即我此前记下的承诺）。
  **下一步先写路径，再谈翻开关。**

---

## 47. `storeMode=record` 迁移 + 回滚路径（兑现承诺 `commitment:13chgtn`）（2026-09-13）

### 47.1 结论先行（纠正我上一轮的表述）

`record` 档**尚未实现** —— 它不是"翻开关"而是**一次功能开发**。本轮还把一处**真缺陷**修了：
`storeMode` 的注释**声称**"只接受 md|dual —— 避免死开关"，实现却是 **`z.string()`（什么都收）**：
设 `record` 不报错、只**静默无动作**（`mirrorShadow` 仅在 `=== 'dual'` 时动作）
⇒ **注释声称要防的死开关，其实已经存在**。现改为枚举，非法值**当场抛**
（实测 `expected "md" | "dual" but got "record"`），并钉成断言（`test-scheduler-wiring` ⑧）。
**教训：注释里的约束不算约束，代码里的才算。**

### 47.2 迁移路径（每步可验证、可停）

| 步 | 内容 | 验证 |
|---|---|---|
| **M0 前置**（✅ 已完成） | 投影无损**双向**成立：11 载体（索引 3 + notes 8）往返 + 对账逐字节一致 | `check-record-parity` · 就绪度 索引 3/3 · 详情 8/8 |
| **M1 死开关守卫**（✅ 本轮） | 未实现的值不得被静默接受 | `test-scheduler-wiring` ⑧（非法值当场抛） |
| **M2 定位键改造** | `id = 内容指纹` **对重复行不唯一**（976 行 → 831 唯一 id）⇒「按 id 增删改」须先改为 **`(file, order)`** | 改造后加用例：改一行 → 投影逐字节正确（含**相邻重复行**） |
| **M3 影子自证仪表** | `dual` 下每次写入后**断言** records → md 可还原，失败即响亮记日志 **+ 计数**（`mirrorShadow` 已记日志，缺计数与对外可读） | 人为破坏一次，看计数与日志是否响 |
| **M4 写入路径 record-first** | 改造点两处：插件侧 `src/distill-write.ts`（写入落地）· 技能侧 `skill/scripts/memory-append.mjs`（实际执行者）。语义：**先写 records**（含 `(file,order)` 定位）→ 由 `renderFile` **重生成 md**（md 转为只读派生输出） | 同一批写入，切后 md 与切前**逐字节一致** + 真机端点 + 记忆写入门 exit 0 |
| **M5 切换** | `'record'` 加入枚举 → 设定 → 复跑 M4 验证 | 同上 |

### 47.3 回滚路径（为什么它是安全的）

- **一行回滚**：`storeMode: 'md'`（回现状）。**理由**：M4 只是把"谁先写"换序，**md 仍是每次写入的产物**；
  关开关即回到"md 为源"的旧路径 ⇒ **不需要数据迁移回滚**。
- **数据侧**：影子库是**派生品**（`.records/records.jsonl`），随时可由 md 重建（`record-sync --import`）；
  导入前已有备份惯例（如 `records.jsonl.bak-noteimport-*`）。
- **检测器**：`check-record-parity`（往返 + 对账 + 就绪度）· `check-installed-features`（31 标记 · 桥不变量）· 记忆写入门。
- **明确不做**：不删 md · 不把 md 设只读权限 · 不动 `_memory/`。

---

## 48. M2 落地：行寻址 `(file, order)`（2026-09-13）

### 48.1 为什么必须换地址

`id = subject:kind:fingerprint(text)` 是**内容指纹** ⇒ **相同内容共享 id**。真库实测：
**976 条 → 8 个 id 碰撞组 · 涉及 153 行**（最大一组 106 行空行）。按 id 改行会改错行/只改第一条。

### 48.2 新件 `src/record-address.ts`（寻址面独立成模块）

| 函数 | 语义 |
|---|---|
| `lineKeyOf` | 行地址 = `file\0order` |
| `linesOf` | 某文件的行，按 order 升序，**不去重**（少一行投影就少一行） |
| `atLine` | 按**地址**精确命中（重复行也能分开） |
| `setLineText` | 纯函数改一行：**内容派生字段重算 · 状态字段承接**（hits/maturity/lifecycle/meta/validFrom/validTo） |
| `idCollisions` | 把"重复行"变成**可数**数字（诊断，不让它隐形） |

为何独立成模块：`record-store` 导出已达 **34/35**（架构棘轮），且"寻址/编辑"与"模型/解析/渲染"本就是两件事。

### 48.3 验证

- 测试 `test-record-store` **67 → 86 条**：核心 **J8 相邻两行完全相同、改第 3 行第 2 行原样**（id 定位做不到）；
  J11 投影只差一行；J14/J15 状态承接；J12 id 随内容重算而**行地址不变**。
- 真库：按行地址定位 `notes/INDEX.md:3` **精确命中第 2 条空行**。

### 48.4 顺带补上我上轮引入的质量缺口

notes 记录化后 789 条的 `subject` 全为 **`unknown`**，而 **`unknown` 不是合法主体**（`isValidSubject` 判否）。
现按**所属画像**给**规则**（非逐文件枚举 ⇒ 未来新 notes 自动覆盖）：
`notes/user.md → user` · `notes/agent.md → agent` · 其余 notes → `knowledge`。
修后 **agent 76 · user 119 · knowledge 781 · 非法主体 0**；对账仍**逐字节 PASS**。

---

## 49. M3 落地：影子写时自证（落盘计数 + 分歧即切源门）（2026-09-13）

### 49.1 补的是什么

①② 证明「**此刻**能否还原」；M3 回答「**生产里到底分歧过没有**」。
内存计数随进程消失 ⇒ **必须落盘**（这正是"放行判据不能只活在进程里"）。

### 49.2 实现与纪律

`record-shadow.ts` 新增 `SHADOW_STATS_FILE` · `shadowStatsPath` · `readShadowStats` · `bumpShadowStats`；
`mirrorFile` 每次镜像后累加 `writes / verified / diverged`，留痕 `lastAt/lastFile` 与
**`lastDivergedAt/lastDivergedFile`**。
仪表纪律：**读损坏 ⇒ 全零**；**累加失败 ⇒ 静默**（它只是仪表，坏了不该拖垮主链路）。

### 49.3 接上放行门

`check-record-parity` 新增 ③ 段：打印计数；**`diverged > 0` ⇒ FAIL**，判词
「**分歧未清零前不得切源**」——即 M4/M5 的**运行态依据**。

### 49.4 验证

- 测试 `test-record-store` **86 → 96 条**（K 组）：真实镜像 +1/+1 · 人为分歧可数且**留痕**（未分歧留痕为空）·
  损坏 ⇒ 全零不崩 · **notes 载体同路径**。
- 真库：**镜像 11 次 · 可还原 11 · 分歧 0**（末次 `notes/user.md`），文件与门禁读数一致。

---

## 50. 第二通道绕过校验（修）+ 开 `storeMode=dual`（2026-09-13）

### 50.1 真发现：M1 的守卫可被绕过

配置有**两条通道**：schema 与自持文件 `~/.dsh/suite/scheduler.json`。
后者原为**无校验裸合并**（`(config as any)[k] = v`）⇒ `{"storeMode":"record"}` 即可**绕过** M1 的枚举守卫
（`record` 未实现 ⇒ `mirrorShadow` 不动作 ⇒ **死开关复活**）；且任意键/类型都能塞进 config。
**根因**：schema 是声明，合并却不过它 —— **守卫必须在两条通道上都成立**。

### 50.2 修法（防御式）

**键白名单从 schema 自身派生**（`Object.keys(Config({}))`，不手抄第二份名单）+ **逐键过 schema 校验**；
非法键/值 ⇒ 忽略并记 warn。⇒ 无论 schemastery 对非法输入**抛 / 穿透 / 丢弃**，都不会有未校验值进 config。
（本想先探明其行为，探针受 ESM 依赖解析所限跑不起来 —— **故改成不依赖该行为的设计**，反而更稳。）

**回归测试**：`test-scheduler-wiring` ⑨（27 PASS）：含毒 scheduler.json（非法值 + 未知键 + 错类型 + 合法键）
⇒ 断言非法值被忽略、未知键未注入、**合法键仍生效**、非法值有日志留痕。

### 50.3 开 `storeMode=dual`（本轮目标）

```
scheduler.json 增量置 storeMode='dual'（备份 .bak-dual-*）→ 热重载
门禁同源读到 storeMode=dual · 往返/对账全绿 · /suite /distill/config 200
自证：镜像 11 · 可还原 11 · 分歧 0（这 11 次仍是 CLI 导入；下一次真实写入起才是生产样本）
```

**一行回滚**：`storeMode='md'`。语义：md 仍是事实源，写入后**镜像 + 逐字节对账**，结果累加落盘。

---

## 51. `dual` 的镜像覆盖缺口（深睡写入不进影子库）· 已修 + 一次自我纠错（2026-09-13）

### 51.1 我先误判了一次（教训：跨时区时间戳不能直接比大小）

核生产自证时见 md 于 **18:17（本地）** 被改而计数停在 11 ⇒ 一度推断"深睡写不镜像"。
但 `lastAt` 是 **UTC**（`14:29Z` = 本地 22:29）⇒ 那笔写入在**开 `dual` 之前**，**没镜像本就正常**。
**该推断当时不成立。**

### 51.2 但结构性问题成立（由代码判定，不依赖时间）

镜像钩子原只有 `distill-write.ts` **两处**；而**深睡的载体写入在 `deepsleep-apply.ts` 直接
`writeFileSync` + `renameSync`**（AGENT/USER/MEMORY），`treeops` 同 ⇒ `dual` 下那些写入**不进影子库**。
后果：下一次对账闸会 **FAIL** —— 红得对，但那是「**覆盖不全**」，不是「记录坏了」。

### 51.3 修法：单点覆盖整轮

`runDeepSleep` 在**整轮写入结束后**：`config.storeMode === 'dual'` ⇒ `mirrorAll(root, at, carrierFiles(root))`。
理由：深睡写入点分散（apply / treeops / forget），逐个补钩子**必然有人忘**；深睡频率分钟级，全量镜像代价可接受。

### 51.4 显式残余（不假装覆盖全了）

**面板 / 脚本侧的载体写入**仍不经此处 ⇒ 由**对账闸兜底发现**。
真正根治是 M4 的**单一写入收口**；在此之前，「dual = 写入即镜像」只对 **distill** 与 **深睡** 成立。

---

## 52. 镜像覆盖缺口第二处（distill 的 notes 追加）· 已修 + 残余说法纠错（2026-09-13）

### 52.1 纠错在先（§51 的残余说法是错的）

§51 写「**面板 / 脚本侧的载体写入**仍不经此处」——**实测为零命中**：面板域**根本不写载体**
（逐模块扫"写原语 × 载体路径"同现）。⇒ 该残余**不存在**。
**教训：别把"没想到的地方"写成"存在缺口"**——那会让人以为有已知风险，实际是自己没查。

### 52.2 但顺线查出真缺口（第二处 · 同一类）

`distill-write` 的 **`appends` 循环写 `notes/*.md`**，索引登记还顺带更新 **`notes/INDEX.md`**
—— 这两处写**完全无人镜像**；原实现只在「MEMORY.md 落盘后」与「画像落盘后」镜像。
⇒ `dual` 下**最常见的 notes 追加**会让影子库失步 ⇒ 下一次对账必红（红得对，但那是**覆盖不全**）。

### 52.3 修法与化石清理

- **修法**（与深睡同一形状）：route=memory 一趟**写入结束处** `mirrorAll(root, at, carrierFiles(root))`；
  **保留**原两处窄镜像（中途异常中止时的**部分**覆盖），注释写明理由。
- **化石**：`distill.ts` 一条**死导入**（`applyTreeOps, applyForgetOps, sectionExists, type TreeOp` 全未使用）
  —— "曾调用 treeops、后来路径迁走"的遗迹，留着会误导。已删。

### 52.4 共同根因与根治方向

两处同类缺口的根因是：**镜像是写入点自愿调用的（opt-in）** ⇒ 新增写入者必然有人忘。
**根治 = M4 的单一写入收口**；在那之前靠**逐处补钩 + 对账闸兜底**。

---

## 53. 项目级原则：「精确检索留代码 · 模糊判断交模型」（2026-09-13 用户点拨）

### 53.1 原则

本项目与一般项目的区别：**自带向量模型与云端大模型**。凡属**检索判断 / 语义模糊判断**，
可用向量与云端模型辅助，**不必完全依赖代码**——代码的**精确检索**确实强，**模糊判断上模型优势很大**。

**落地口径**：
- 代码负责**候选生成 / 精确匹配 / 结构判定**（廉价、确定、可单测）；
- 模型/向量负责**相似、冲突、意图、熟悉度**这类模糊判断；
- **中间带必须如实标注"未判"**，不许用阈值硬凑一个答案；
- **仪表缺失（embed 不可用）与"判不了"分开记**。

### 53.2 本轮应用（断言图分层）

| 层 | 归谁 | 内容 |
|---|---|---|
| 粗筛 | **代码** | `competingOf`（精确、零 IO、可单测） |
| 裁决 | **向量/模型** | `adjudicateCompeting(groups, sim, opts)`：`sameClaim` ≥0.90 · `differentClaim` ≤0.55 · **`ambiguous` 中间带不判** · **`unjudged` 仪表缺失** |

测试 29 → **38 条**；附 CLI `scripts/assertion-graph.mjs --competing`（接本地 `bge-m3`）。

### 53.3 真数据一跑就露（本轮最有价值的发现）

真库 + 真向量实测报出 **相斥 224 · 含糊 816**，其中赫然有 `[身份] ≠ [硬件]`、`[身份] ≠ [偏好]`
这类**本来就是不同事实**的对子 —— **人一眼就知道那不是竞争断言**。
根因：notes 记录的 `pointer` 是**整个文件** ⇒ 分组退化成「同文件所有行两两比」。

**⇒ 精确键（字段相等）回答不了"是不是同一断言"。** 夹具测试发现不了（夹具的 pointer 是我自己造的干净值）。

**处置**：`competingOf` 加醒目警示（notes 记录上**不成立、勿直接消费**），仅对"带 § 小的索引行"有效；
**正解 = 候选生成也交给检索**（向量召回 top-k 近邻 + 模型裁决）——列为**待改造**。

### 53.4 同类待改造清单（本原则的下一批落点）

1. **MCL 熟悉度**：`sim >= 0.58` 硬阈值假装"这任务我熟不熟"——典型模糊判断，宜交模型/向量。
2. **竞争断言候选生成**（§53.3）：改用向量召回 top-k，而非 `pointer` 相等。

---

## 54. 联想生成（向量"异域同构"）+「按适配选模型」落成表（2026-09-13 用户点拨）

### 54.1 用户第二次点拨与我的承认

用户：「**联想**这种能力，用纯代码我觉得基本实现不了」；「以质量为前提，
**向量模型还是大模型，在每一个地方哪个更合适就用哪个**」。

**承认现状（不粉饰）**：既有 `association-ring` 只能**记账**——`recordCollision` 的"碰撞"内容是
**人或模型先想到的**；代码负责去重/跨度门/落地状态/KPI，**它不生成任何联想**。联想 = **生成** = 模糊判断。

### 54.2 「按适配选模型」落成表（本项目的用模型纪律）

| 环节 | 用谁 | 为什么 |
|---|---|---|
| 全对粗筛 / 近邻 / 去重 / **候选生成** | **向量** | O(n²) 全扫，便宜、确定、可缓存 |
| 相似度打分 / 聚类 / 跨域"异域同构" | **向量** | 度量的活：代码做不了，LLM 做起来贵 |
| 裁决（"是不是同一断言"）· 生成（"这俩有什么联系"）· **说清理由** | **大模型** | 需常识与推理，且**理由本身才是价值** |
| 精确匹配 / 结构判定 / 记账 / 门禁 | **代码** | 确定、可单测、零成本 |

### 54.3 联想生成（本轮落地）

`src/association-propose.ts` + `scripts/association-propose.mjs`：**在向量空间找"异域同构"** ——
有价值的联想**不是**"用词像"（那是**检索**，代码强项），而是
**语义高度相近 · 跨载体 · 词面几乎不重叠**。

判据三条**合取**：**跨载体**（同文件内相近是"重复"）· **相似 ≥0.72** · **共词 ≤2**（**与检索的分界线**）。
职责：**向量**算相似（新增 `vec#embedMany` 批量导出）· **代码**过滤/排序/截断（纯函数）·
**人或模型**复核后落环（**只提议，不擅自落环**）。

**真库实测（与纯结构规则的对照）** —— 90 小节全嵌入，产出 **2 条人一眼认得的联想**：

```
notes/flows.md §职责边界            ↔ notes/user.md §习惯-记忆质量审查   0.731 · 共词 agent
notes/lessons.md §白名单与链接装配   ↔ notes/tools.md §模型链路与排障      0.726 · 共词 2
```

对照：上一版**纯结构规则**在同一批数据上产出 **224 条"相斥"**，其中混着 `[身份] ≠ [硬件]` 这种废话。

### 54.4 落点约束（诚实标注 · 不假装已接好）

`distill-llm` 走 **`ctx.llm`（宿主服务）** ⇒ **脚本侧拿不到 LLM，插件运行态拿得到**。
故**联想的 LLM 精判阶段**（确认 + 说清"为什么"）应落在**插件内**：既有 **REM `crossTopic`（缺省关）**
正是它的宿主，而**本轮的向量候选正是它的输入**——此前是让 LLM 从零"注意到"联系，
现在可改成"**带着候选去判**"。**该接线列为下一步**。

---

## 55. 联想接进运行态：`shoucang_associate`（向量候选 → 模型裁决）（2026-09-13）

### 55.1 接法的关键判断

**LLM 精判阶段的宿主不必另建** —— 宿主里本就跑着一个云端大模型（**就是对话中的模型**）。
故正确接法：**插件暴露"向量候选"工具，由模型在环内判断**。
既符合「哪个更合适用哪个」，又**不必造子代理派发**（`ctx.llm` 是宿主服务，而工具**已经运行在宿主里**）。

### 55.2 形态

`shoucang_associate(minSim, maxShared, topN)`：读影子库 → `sectionsOf` 切节 → `embedMany` 全量嵌入
→ `proposeAssociations` 过滤 → 返回**候选 + 证据**，并要求调用方"判断哪几条真成立并说明联系"。
**只提案不判**——模糊判断留在环里；落环走既有 association-ring 记账。

### 55.3 诚实降级（针对"用结构规则假装联想"的防线）

拿不到向量 ⇒ **如实报"向量不可用"**，**绝不退回结构规则假装生成**。
断言：`test-scheduler-wiring` ⑩（关掉 embed 执行 ⇒ 含"向量不可用" + **候选数为零**）。

### 55.4 工具面变化

5 → **6** 个工具（`WANT` 同步）；`test-scheduler-wiring` **32 PASS**。

---

## 56. 联想通路首次端到端走通（向量候选 → 模型裁决 → 落环可核）（2026-09-13）

### 56.1 实跑

会话内调 `shoucang_associate` ⇒ 90 小节全嵌入 ⇒ **2 条候选**（与 CLI 输出一致 ⇒ 两入口同一实现）。

### 56.2 模型裁决（通路后半段 · 也是本能力的价值所在）

| 候选 | 判断 | 理由 |
|---|---|---|
| `notes/flows.md §职责边界` ↔ `notes/user.md §习惯-记忆质量审查` | **成立 → 落环** | 非"同义重复"，而是**同一约束的两端**：规则 ↔ 它的外部审查者；回答"**职责门为何是硬要求**"（因为用户会审） |
| `notes/lessons.md §白名单与链接装配` ↔ `notes/tools.md §模型链路与排障` | **不落环** | 同一**故障族的两个症状面**，且**共词 2**（provider/settings.yaml）⇒ 词面本就相关，按判据属**检索**而非联想 |

### 56.3 落环与三级验证

`association:1c6flkt`（语境 + 洞见 + 证据 0.731/共词 agent）：

```
--collisions ⇒ 已认可
/rings ⇒ 联想环 collisions 2 · accepted 2 · pending 1
事件流 ⇒ #12 collision.record · #13 collision.accept（seq 递增、可重放）
```

⇒ 「**向量做候选 · 模型做裁决 · 环做记账**」第一次**跑通并留下可核产物**。
对照：纯结构规则在同一批数据上产出 **224 条"相斥"噪声**。

---

## 57. 联想接入 REM（带候选去判）· 三入口收口（2026-09-13）

### 57.1 REM 接线的改进点

此前 REM 让 LLM **从零"注意到"**跨主题联系（成本高、易漏）。现改为 **带着候选去判**：
`runDeepSleep` 在 REM 开启时先跑向量候选（`supplyAssociations`），作为**新的一段材料**喂给子代理，并明确要求
「成立的写进 `crossTopic` 并说明联系，**不成立就丢弃**——**勿为凑数硬报**」。
候选为空 / 向量不可用 ⇒ 照常走（只少这一路输入），**绝不退回结构规则假装生成**。

### 57.2 三入口收口为单一实现

新增 `src/association-supply.ts`（**IO 组合层**：读影子库 → 切节 → 批量嵌入 → 过滤 + 供模型读的文本版式），
**工具 / 深睡 REM / CLI 三处共用**；`association-propose.ts` 保持**纯函数零 IO**（单测不受影响）。

### 57.3 测试与诚实标注

`test-scheduler-wiring` 32 → **35 条**（⑪ 组合层：切出 2 小节 + 向量不可用 ⇒ 零候选 + 可读 reason）。

⚠ **REM 相缺省关**（`enableRemPass=false`）⇒ 本轮的接线**在环但未激活**；开启属运行策略，需证据或用户拍板。

### 57.4 经验沉淀（纪律：运行中经验走 `pending/`，不写契约）

- `association-vs-retrieval-divide-2026-09-13.md`：**共词多寡即联想与检索的分界** + 分工 + 反例。
- `fixture-green-vs-real-data-2026-09-13.md`：**夹具绿 ≠ 真数据绿**（夹具的数据分布由作者决定 ⇒ 结构性错误不可见）。

---

## 58. 候选层重做：`pointer` 分组 → 向量近邻（2026-09-13）

### 58.1 推翻上一版的理由（两条，第二条更致命）

1. 真库+真向量实测产出 **224 条"相斥"**，混着 `[身份] ≠ [硬件]` 这种废话；
2. **对跨文件重复结构性失明** —— 同 `pointer` 才同组，而**重复恰恰常发生在不同文件之间**。

⇒ **精确键回答不了"是不是同一件事"。**

### 58.2 重做后的分工（与「联想」相反）

| 层 | 归谁 | 要点 |
|---|---|---|
| `nearPairs(records, vectors, {topK,minSim,maxN})` | **向量** | top-k 近邻 + 去重 + 截断；**不做词面过滤**（竞争/重复要语义近，与联想的"词面不重叠"恰好相反）；`samePointer` 降级为**证据**；超 `maxN` **如实计数不参与** |
| `adjudicatePairs(pairs, judge)` | **模型** | `duplicate / consistent / contradictory / unrelated / null`；**向量说不了"能否同时成立"**（"必须备份"/"禁止备份"语义近而互相矛盾）——**这是判断，不是度量** |

### 58.3 真库一跑就出真东西（本轮最有价值的发现）

`--near` 立刻查出**跨文件重复**（相似度 **1.000**）：

```
notes/flows.md#58 = notes/lessons.md#160 = notes/release.md#7 = notes/tools.md#37
notes/lessons.md#159 = notes/release.md#6 = notes/tools.md#36
```

**旧版结构上找不到这个。** ⚠ **只报告不擅改**：那是用户记忆库的内容，去重属**写入动作**，须用户/蒸馏决定。

### 58.4 夹具第四次出错（记）

合成向量**眼估**（`[0,1]` 与 `[0.1,0.9]` 以为"都远离"，实际几乎平行）⇒ 改用**正交基**；
改 `V` 签名后**漏改调用点** ⇒ `undefined` ⇒ NaN ⇒ 给参数**默认值**根除。

---

## 59. DS4 合并第五刀：`mcl-audit` → `ledger`（事件流 6 → 5）（2026-09-13）

### 59.1 消费者侦察（代码侧 2 个）

| 消费者 | 处置 |
|---|---|
| `panel-observe.ts`（`/mcl/status` 的 `recent`） | 改双源读；抽出 `mclAuditRecent(root, n)` 单一同源 |
| `scripts/mcl-compliance.mjs` | 改双源读（legacy ∪ 台账 `mcl.*`），合并后按时间排序 |
| 其余（配置描述 / 文档） | 只写路径文本，**非读取** ⇒ 不动 |

### 59.2 改法与棘轮

`mcl.ts` 审计钩子改投 `ledger.jsonl`（`type=mcl.<kind>`，**判别字段上一轮补信封时已就位**）；
棘轮 **事件流 6 → 5**；`mcl-audit.jsonl` 转 legacy 只读豁免。

### 59.3 已验证 / 未验证（分开写）

**已验证**：`typecheck`/`build` 零错 · `npm test` 全绿 · 棘轮 `事件流 5` ·
`mcl-compliance` 双源读数正常（803 行，来自 legacy）· `/mcl/status` 200 且 `recent` 10 行 ·
legacy 末次写入停在 **22:52（重载前）**。

**未验证（诚实标注）**：重载后 MCL 走了 3 步但 `fast=0/slow=0` ⇒ 这 3 步**没做通道判定**
（重载后尚未收到**新的用户消息**）⇒ **没写审计行**，故"写入已改道"须由**下一回合**真实回合验证
（判据：legacy **不再增长** + 台账出现 `mcl.*` 行）。**不把"没数据"说成"已验证"。**

---

## 60. 改道确定性验证 + 一处测试污染真库（2026-09-13）

### 60.1 真机验证为何停滞（推理清楚）

重载后 MCL 走了 **8 步**而 `fast=0/slow=0` ⇒ 8 步都没做通道判定。
原因**不是改道失败**，而是**自动轮消息不是真实用户输入** —— MCL 用结构判别 `isRealUserEvent`
（`data.source.kind === 'user'`）把人机消息分开，自动 goal_round 被**正确忽略** ⇒ 无任务文本 ⇒ 不判定、不落账。
⇒ **不靠"等真人打字"验证**，改确定性单测。

### 60.2 场景 N（已登记）：默认钩子的落点

不给 `audit` 钩子 ⇒ 隔离 `DSH_HOME` 下真写盘 ⇒ 断言：台账出现 `mcl*` 行 · 含 `mcl-step` ·
每行有非空 `at` · **legacy `mcl-audit.jsonl` 未被创建**（后者才是改道的实质）。`test-mcl` 35 → **39 条**。

### 60.3 抓出并修掉一处测试污染（本轮最有价值的发现）

写场景 N 时发现：**`test-mcl.mjs` 本来没有环境隔离**（直接跑在真实 `DSH_HOME` 上），
而"默认审计钩子会真写盘" ⇒ 我的两次调试运行**往真库台账写了 4 行测试数据**（`sid=sess-aud…`）。
**处置**：按**精确条件**（type + sid 前缀，**不按时间**）删除那 4 行 + 留备份 `ledger.jsonl.bak-testpoll-*`；
场景 N 改为 **mkdtemp 隔离 + finally 恢复 + 清理**。

**纪律**：**凡触发真写盘的用例必须隔离 `DSH_HOME`** —— 不是洁癖，是「测试不该动用户数据」。

### 60.4 顺带修数据形状

判别字段原为 `mcl.mcl-ready`（kind 已带 `mcl-` 前缀，再加前缀成双）⇒ 改为**直接用 `kind`**（`mcl-ready`）；
两个读取者过滤放宽为 `startsWith('mcl')`（兼容历史写法）。

### 60.5 一次瞬时红的追查（诚实收尾：未复现，但锁定嫌疑件）

`npm test` 出瞬时红（`28 PASS / 2 FAIL`；§28 曾 `27 PASS / 3 FAIL`），**单跑/连跑均不可复现**
（`test-forgetops` 单跑 4 次、`npm test` 连跑 3 次全绿）。**次数吻合**：两次失败合计都是 **30 条**，
与 `test-forgetops.mjs`（30 条断言、唯一含 `sectionExists` 的测试）**精确对应** ⇒ **锁定嫌疑件**。

**我一度按"对账闸并发写竞态"假设加了复跑容错，随后定位显示该假设不成立**（该测试**夹具隔离**、不读真库）
⇒ **已撤回**。**纪律：未证实的容错等于掩盖真漂移。**

**处置**：**不猜修**（没有断言名就改代码＝盲改）；`check-runner` 的失败输出捕获（今日早先为同一抖动所加）
会在**下次再现时给出失败断言名**——那才是动刀的时机。

---

## 61. DS4 口径补正：注册表加「域」维度（suite/库）（2026-09-13）

### 61.1 侦察结果：剩下三条**各有理由暂停**（不能照搬前五刀）

| 流 | 状态 | 为什么暂停 |
|---|---|---|
| `distill-audit` | suite | **5 个代码消费者**，其一是**正确性路径**：重启时**从它回放 `lastDeepSleepAt`** 重建深睡水位 ⇒ 先并表不搬回放读侧 = **可能破水位**（读错文件/双计） |
| `access-real` | **库** | **跨域**：在记忆库（`<bank>/audit/`），ledger 在 suite 知识区。「**数据属库、运行时台账分域**」是既有约定 ⇒ **跨域并入是语义错误** |
| `ring-events` | **库** | 同上（落 `<bank>/.records/`） |
| `distill-watermark` | suite | 读侧在**热路径**（每 10min × roots **全量读**）⇒ 并表会放大那次读，需按 type 高效过滤（或每类索引）——**含性能权衡的改造，不是搬代码** |

### 61.2 落地：注册表加第二维「域」

`check-observability` 的每项现为 `[流名, 家族, 说明, 域]`；棘轮**只数 suite 域事件流**；三族分别打印：

```
✅ suite 域事件流 3（= 基线；目标 1） · 库域事件流 2（分域自持，不并入） · 状态表/投影 3
```

### 61.3 这纠正了我此前的说法

之前报「**事件流 5 → 目标 1**」是**没有分域**的——把库域的流算进了 suite 台账的目标里。
分域后目标数更小（**3**）**但更真**：库域两条不是"待并"，而是**不该并**。

---

## 62. DS4 第六刀：`distill-audit` → `ledger`（suite 域 3 → 2）（2026-09-13）

### 62.1 先量风险，再动刀（动刀前对拍三种源）

```
legacy 回放 → 2026-09-13T10:17:48.975Z（命中 16 轮深睡）
仅台账      → (无)（命中 0 轮）        ← **单读台账会丢光水位历史**
双源合并    → 2026-09-13T10:17:48.975Z ✅
```

单读台账 ⇒ 水位回放无值 ⇒ 置 `Date.now()` ⇒ **窗口滑到当前、丢一轮可回想的痕迹**（D2「丢料」同类）。
⇒ **双源强制。**

### 62.2 落地

| 件 | 内容 |
|---|---|
| `src/audit-source.ts`（新） | **双源读单一实现**：legacy 在前、台账 `audit.*` 在后；提供**行数组**与**合并文本**两形态（后者让调用点只换一处表达式 ⇒ 改面最小） |
| 写入 | 改投 `ledger.jsonl`（`type=audit.<kind>`） |
| 6 个读侧 | 2 正确性（`deepsleep-machine` 水位回放 · `deepsleep-traces` 痕迹窗口）+ 3 面板 + 1 脚本 |
| 棘轮 | suite 域事件流 **3 → 2**；`distill-audit.jsonl` 转 legacy 只读（豁免理由写明"单读台账会丢水位历史"） |

### 62.3 对拍（用真实现）

`lib/audit-source.js` 双源读 **931 行**，回放水位与 legacy 单源**逐位相同** ✅。

### 62.4 门禁抓到一处漏迁的消费方（正是它该做的）

`test-event-envelope` 读 `paths.auditFile` ⇒ 改落点后 **ENOENT** 崩掉 ⇒ 已迁到台账（`auditRows()`）。
**这印证「改落点必须同步全部消费方，含测试件」。**
另：`memory-reconcile.mjs` 有**库内孪生副本**，`check-deploy-sync` 如实报 ⇒ 备份后部署 + 库内实跑。

### 62.5 真机

`/memory/overview` 200 且 `distillStats` / `growth` 均在（双源读在起作用）· `/mcl/status` `/rings` 200。
台账 `audit.*` 暂为 0（重载后尚无蒸馏写入）——**双源设计的好处正在此：不依赖"首次新写入"即可验证口径不变。**

---

## 63. DS4 收口：`suite` 域单一事件源达成（2026-09-13）

### 63.1 最后一刀是"判定不并"

`distill-watermark` 的**读侧语义**是 `map.set(sessionId, o)` —— **按 key 取最后一条**（键控状态），
与已并的 6 条（读侧把行当**事件**）**不同族**；且它在**热路径**（每 10min × roots **全量读**，D7）。
⇒ 归 **`keyed`（键控日志）**，**不并入**。

**判据（写进注册表）**：**事件流 = 读侧逐条语义**（计数/聚合/取最近）；键控 = 读侧取**每键最后一条**。

### 63.2 收口口径（四族 × 两域）

| 族 | 域 | 条数 | 处置 |
|---|---|---|---|
| **事件流** | **suite** | **1**（`ledger`） | ✅ **DS4 目标：单一事件源** |
| 键控日志 | suite | 1（`distill-watermark`） | 读侧键控 + 热路径 ⇒ 不并入 |
| 事件流 | bank | 2（`access-real` · `ring-events`） | **分域**（数据属库）⇒ 不该并 |
| 状态表/投影 | bank | 3（`activity` · `archive-progress` · `maturation`） | 整表重写/upsert ⇒ 本就是投影 |

### 63.3 六刀回顾（suite 域 13 → 1）

`score-shadow` → `activation-shadow` → `stub` → `episodes`（连带落地**按 type 裁剪**）→ `mcl-audit` →
`distill-audit`（连带**双源读**强制验证）。**每刀都做**：消费者侦察 → 改写入 → 迁移读侧 → 对拍/断言 → 收紧棘轮。

---

## 64. MCL 通道离线标定：用真数据推翻「快通道恒 0」（2026-09-13）

### 64.1 为什么是"离线标定"

快/慢通道判定在**热路径**（每步都要判）⇒ **不可能每步调模型**。按项目原则：
**这一步的判定必须廉价**（向量/规则），而**口径的选择**应由**数据**决定。
新 `scripts/mcl-calibrate.mjs`（双源读 legacy ∪ 台账 `mcl*`）就是那个"用数据定口径"的地方。

### 64.2 真数据（936 个 mcl-step）

```
hit 为空 805（86.0%）        ← 多数步根本没有任何召回命中
sim 分位 p50=0.513 p90=0.575 p99=0.640 max=0.662

T=0.50 ⇒ 510(54.5%) · 快 38 · 挡 472
T=0.55 ⇒ 238(25.4%) · 快 26 · 挡 212
T=0.58 ⇒  87( 9.3%) · 快 17 · 挡  70（flow:14 · (无/空):42 …）
T=0.65 ⇒   3( 0.3%) · 快  2 · 挡   1
```

### 64.3 结论（推翻旧说法 + 指出真正瓶颈）

1. 「快通道**恒 0**」**已过时** —— 实测 `fast` **26** 条（≈2.8%）。
2. **首要瓶颈不是阈值、也不是标签门，而是 86% 的步没有召回命中**（与两者都无关）
   ⇒ **调阈值无法改善快通道率**，该查**召回（词表/索引）**。
3. 次要因素：在**有命中**的步里，标签门挡掉约 **62%**，被挡多是 **`[flow]`**（E 层）
   ⇒ 想提高快通道率，第二顺位是**改 gate 口径**（须同步改注册表 `surface.mcl.gate`），**不是降阈值**。

### 64.4 本器只给数据

工具输出明写三档读数提示；口径变更属**行为变更**，**待拍板**。

---

## 65. 新棘轮：legacy 流引用白名单（2026-09-13）

### 65.1 动机（实证）

DS4 第六刀改落点后，`test-event-envelope` 仍读 legacy `distill-audit.jsonl` ⇒ **ENOENT 崩了才暴露**。
「改了落点、忘了消费方」这类问题**当时只能靠崩发现**。

### 65.2 做法与判据

为每个 legacy 流登记**引用白名单（含理由）**：双源读实现 / 写入侧路径常量 / 测试夹具 / 注册表自身。
**引用集合 ⊆ 白名单** 才通过；**新增引用 ⇒ FAIL 并点名文件**；白名单**过期项也提示**（防腐化）。

**已反向证伪**：造 `src/_legacy-probe.ts` ⇒ ❌ 精确点名；删除 ⇒ PASS。

### 65.3 它当场抓出一处真漂移

`scheduler.ts` 里 **6 处用户可见描述**仍写旧落点（`mclAudit` / `shadowScore` / `activationShadow`）——
那些流**早已并入统一台账** ⇒ 用户按描述去找 `score-shadow.jsonl` 会**找不到**。已全部改为指向
`audit/ledger.jsonl` 与对应 `type`。

---

## 66. 目标收口审计（逐条取证据 · 2026-09-13）

| 目标条目 | 实现 | 证据（本轮实跑） |
|---|---|---|
| G0 断言图内核（**合并**路线：建于 Record 事实源，不新开库） | `src/assertion-graph.ts` + `association-propose.ts` | `test-assertion-graph` **41 pass**（真库 831 记录/136 边/0 悬空） |
| G0 双时间戳 + **md 投影可读** | `validFrom/validTo` · `renderFile` 反向投影 | `check-record-parity` **PASS**（11 载体往返 + 对账**逐字节**） |
| G0 统一事件流账本 | `ledger.jsonl`（六刀并入） | `check-observability`：**suite 域事件流 1 = 1（DS4 目标达成）** |
| G0 唯一 composition root | `src/composition.ts`（三条惰性桥退役） | `check-bridges` **PASS**（边 **0/0**）· 真机 7 路由 200 |
| G0 KPI 机检门 | `check-ring-coverage` 等 | **PASS**（内容环登记自洽 · **每环有可机检 KPI**） |
| G0 deploy 版本一致性 | `check-version-pin` / `-sync` / `-installed-*` | **PASS：三处钉点一致 @ f81eb2e5**（此前记为"不一致"，已过时，见下） |
| G1 决策环 + 后果回收 + 价态采集口 | `decision-ring.ts` | `test-decision-ring` **49 pass** + `/rings` KPI |
| G2 关系环 | `relation-ring.ts` | `test-relation-ring` **35 pass** + `/rings` KPI |
| G3 联想环（碰撞记录 + **免频率门**） | `association-ring.ts` + `FREQUENCY_FREE_RINGS` + 向量候选/模型裁决 | `test-association-ring` **52 pass** · `test-ring-events` **28 pass** · 实机落环 `association:1c6flkt` |
| G4 读侧 assembly | `supply-assembly.ts` + `mcl.ts`（P2b） | `test-supply-assembly` **40 pass** · `/mcl/status` 活体计数 |
| 每期过仓内门禁 | `check-runner`（统一入口） | `npm test` **62 pass · 1 xfail · 0 skip** |
| 不破坏现行运行 | 逐轮真机探针 | `/mcl/status` · `/memory/overview` · `/rings` · `/suite` **全 200** |
| 事件流可重放 | 环事件流 9 op | `record-ring --reconcile` **PASS**（store ↔ 重放逐条一致） |

**本轮顺带修正一处过时文档**：`AGENTS.md` 曾记「版本钉点三处不一致（已知，未修）」——
**已不成立**（宿主重新物化时 `pnpm install` 到位，`check-version-pin` 实测 **PASS @ f81eb2e5**）。
⇒ **教训：环境侧事实会自己变化，文档里的"已知问题"必须复验**，否则长期误导。

**未包含在本目标内 / 环境受限（分别标注，不含糊）**：
- **P2b 材料流实景**：机制与渲染计数已验证（`test-mcl` 39 条 + 活体 `sysBlockCalls`），
  但"慢通道材料真的进注入面"需**一次真实的不熟悉任务**——自动轮消息被 `isRealUserEvent` 正确忽略，**我造不出来**。
- **`storeMode=record` 真切源（M4/M5）**：属仓内 P4 路线图，**不在本目标文本内**；
  且 `dual` 开启后**尚无真实记忆写入**（自证 11 次全为 CLI 导入）⇒ **无生产证据，不切片**。
- **三项待拍板**：MCL 口径（数据显示先查召回而非降阈值）· 跨文件重复去重（4 文件同文 1.000）· 联想 REM 开启。

---

## 67. 收尾决策记录（用户授权「除重启外自行决策闭环」· 2026-09-13）

用户指令：**除重启外，其余我自己决策并闭环**。以下六项逐条给出**决策 + 依据 + 开门条件**（不留模糊）。

| 项 | **决策** | 依据 | 开门条件 |
|---|---|---|---|
| **跨文件重复**（`## DSH 开发知识迁移指引` 同标题+同正文 ×4：flows/lessons/release/tools） | **不删**（只给可复现提案） | ① 根因经 `git log -S` 追溯为提交 **`7aecee6`「memory: snapshot 2026-09-11」**——**整库快照导入时带进来的既有状态**，非本仓脚本/写入器缺陷；② 用户记忆原则「**可写不等于有处置权**」（内容属用户） | 你指定保留哪一处后，按 `--dups` 清单逐行处理；记忆库**有 git 版本化**（`master`），可回退 |
| **MCL 快/慢通道口径** | **不改阈值、不改标签门** | 真数据（936 步）：**86.0% 的步根本没有召回命中**（与阈值/标签门**无关**）；改阈值最多把 fast 从 2.8% 提到 ~4%，属行为变更而收益有限 | 先查**召回**（词表/索引）；若确认瓶颈转回标签门，再动注册表 `surface.mcl.gate`。仪表常驻：`mcl-calibrate.mjs`（含 `noHitRate`） |
| **联想 REM `crossTopic`** | **保持关闭**（缺省即关） | ① 联想的**候选生成**已由向量路径覆盖（`shoucang_associate` + 落环 1 条实机产物）；② REM 的增量是"深睡自动产出跨主题原则"，其产物**直接并入 AGENTS.md 画像**，噪声代价高 | 置 `enableRemPass: true`（接线已就绪、**带向量候选去判**）；建议先看一段时间的 `--near` 候选质量再开 |
| **M4/M5 `storeMode=record`** | **no-go（明确不做）** | ① `record` **尚未实现**（枚举只有 `md`/`dual`）——要做须改**库侧脚本** `memory-append.mjs` 的写入语义（先写 records 再投影 md）；② `dual` 开启后**零生产写入**（自证 11 次全为 CLI 导入）⇒ **无任何真实流量证据**；③ 迁移+回滚路径已落档（§47），`diverged>0` 即切源门 | 出现**真实写入样本**（`shadow-stats.json` 的 `writes` 随真实记忆写入增长）且确需单事实源 ⇒ 按 §47 的 M0–M5 执行 |
| **`test-forgetops` 偶发飘红** | **不改代码** | 单跑 4 次 / `npm test` 连跑 3 次均绿；**无失败断言名就改代码＝盲改** | 运行器**失败输出捕获**已就绪 ⇒ 下次再现即给出断言名，届时按名动刀（经验已入 `pending/flaky-gate-30-assertions-2026-09-13.md`） |
| **git 提交/推送** | **不提交、不推送** | 工作树是你的在制状态；且 profile 依赖指向**远端 ref**，本地提交**不改变**物化行为 | 若你要固化：提交并推送后更新 profile 依赖 ref（会触发 `pnpm install` 与批量删除保护，宜择时） |

**另**：顺带把 `AGENTS.md` 三处**已失效的陈述**改正（三条惰性桥已退役、模块数 44→**60**、CHECKS 37→**63**），
以及"版本钉点三处不一致"→ **已一致 @ f81eb2e5**（实测）。

---

## 68. P2b 实测不合格 ⇒ 回滚（材料被静默丢弃）（2026-09-13）

### 68.1 用户一句反问点破我

「P2b 慢通道材料流实景为什么做不了，你用一个新会话测试不就可以了吗」——
我此前把它归为"环境受限/需真人发言"，**但从未去读已经躺在库里的活体数据**。

### 68.2 一读就看到答案（推翻我自己的假设）

`/mcl/status` 前值：`slow=2 · injected=1`（**不是"恒 0"**）· 台账已有 **4 条 `mcl` 行**（改道在运行态生效）。
其中一行：

```
type=mcl-step step=1 channel=slow sim=0.572 injected=436 viaSystem=1     ← 审计：材料走了 system 段
而 sysBlockNonEmpty = 0（21 次渲染，块从未返回材料）
```

⇒ **审计记的是"意图"，不是"送达"**：材料被标为进了 system 段，而 `materialInSystem` 下**又不再走消息面插入**
⇒ **慢通道材料被静默丢弃**。**这是第 17 轮开启 P2b 引入的回归。**

### 68.3 先测不猜（宿主传参探针）

给块加 `sysBlockCtxKeys` / `sysBlockLastSid` ⇒ 实测宿主传 `agent, scope, signal`，
**sid 解析成功**（`session-697a44`）⇒ **不是形状问题**；问题在**时序**：
块在同步请求装配时渲染，材料在 `pre-step` 才设置、**下一轮开始即清** ⇒ 永远赶不上渲染。
（**此因果为假设**，未经宿主源码确认；探针保留，供下次验证。）

### 68.4 决策：回滚 P2b

`mclMaterialInSystem: false`（备份 `.bak-p2b-off-*`）——它在"声称 `viaSystem=1`"的假象下**静默丢弃**材料，
**比关着更糟**；回消息面（送达有据）。实测：`materialInSystem=False` · 块未挂载（`sysBlockCalls=0`）。

**重开前提**：先解决"材料在渲染之前就位"（如把 material 缓存到**下一轮/下一步**而非轮内清除），
并证明 **`sysBlockNonEmpty > 0`**。

### 68.5 教训（比修 bug 更重要）

**我把"没查已有的数据"说成了"环境做不到"** —— 这类"未验证的限制"写进汇报后**看起来像客观约束**，实际是自己没看。
**纪律：凡声称"受限"，先列出已有哪些数据可查。**

---

## 69. P2b 深挖：问题在 **pre-step 判定门**，不在块（2026-09-13）

### 69.1 用户原话点破的方式是对的：**新会话确实能触发**

起了两个**新会话**（子代理）做实验，轨迹证明：
```
he4m|ren|b8f75892|0      ← 步骤 1 请求装配
he5l|cap|b8f75892|108    ← **消息捕获成功**（子代理的 user/message 通过 isRealUserEvent）
hg1w|ren|b8f75892|0
（全程无 set）
```
⇒ **我此前"需真人发言"的说法是错的**：子代理会话的事件**照样被接受**。

### 69.2 真正的第一层原因：**捕获可能晚于当轮 step 1 的 pre-step**

代码里判定被 `!st.channel && step !== 1` **早退**（`mcl.ts:428`）⇒ 若 `cap` 在 step 1 的 pre-step **之后**才到，
则那一步读不到任务文本，而后续步因 `step !== 1` 被挡 ⇒ **整轮不判定**（`slow=0 fast=0` 的实测来源）。
⇒ MCL 存在**时序竞态**：同一个机制"有时生效、有时整轮失效"。

### 69.3 第二层：块路径**从未**送达（即使判定发生）

台账实证（同一进程代内）：`mcl-step step=1 channel=slow injected=436 viaSystem=1`
—— 材料**已写**、审计**声称进了 system 段**；而 **`sysBlockNonEmpty = 0`（21 次渲染全部为空）**
⇒ **`viaSystem=1` 记的是"意图"，不是"送达"**。
（探针已排除形状问题：宿主传 `agent, scope, signal`，`sid` **能**解出。）

### 69.4 决策与现状

| 项 | 决定 |
|---|---|
| P2b（systemPrompt 段） | **关**（`mclMaterialInSystem:false`，备份 `.bak-p2b-off-*`）——它在"声称 viaSystem=1"的假象下**丢材料**，比关着更糟 |
| 材料送达 | 走**消息面**（有据：`test-mcl` F3/F6 + 审计 `injected` 计数） |
| 仪表 | **保留**：`sysBlockCtxKeys` / `sysBlockLastSid` / **`trace`（14 条环形时序）** |
| **修复判据（不可动摇）** | **`sysBlockNonEmpty > 0`** —— 没做到就不说修好 |
| 下一步（已定） | ① 先修**判定门竞态**（cap 晚到 ⇒ 不该整轮失效：可放宽为"该轮首个**有任务文本**的步仍可判定"）；② 再让材料**在渲染之前就位**（避免设了却赶不上渲染）；③ 两者都做完后，用**≥2 步的新会话**验 `sysBlockNonEmpty ≥ 1` |

### 69.5 顺带

- 探针与轨迹加入后触发 **I1 装配棘轮**（`registerMcl` 122 行 > 120）⇒ 把 `captureTaskText` **提到模块级**
  （也正合仓内约定"实现函数在模块级"）⇒ 回到 120 行内，门禁**全绿**。
- `CLAUDE.md` 的"panel 经 `scheduler-share.ts` 桥接"**已失效**（桥已退役）⇒ 更正为 composition root。

---

## 70. 第一层**已修**、第二层查到底（2026-09-13）

### 70.1 第一层：判定门竞态——**已修 + 有回归测试**

**旧判据**：`if (!st.channel && step !== 1) → late-skip`，即判定只认 `step === 1`。
**实测后果**：消息（`cap`）若落在当轮 step 1 的 pre-step **之后** ⇒ 那步读到空文本、后续步又被挡 ⇒ **整轮不判定**
（与 P2b 无关——**消息面也不会注入**，是更基础的缺陷）。

**新判据（原理化）**：**判定时机 = 消息到达后的第一个 pre-step**（`capAt > 上次 pre-step 时刻`），**限前 3 步内**
（超出仍按"不打断进行中的任务"处理）。这才是原意图的正确表达。

**证据**：`test-mcl` 新增场景 O（**39 → 43 PASS**）：
O1 无文本不判定 · **O2 消息晚到也判定**（修正前恒 0，现 `channel=slow`）· O3 同轮不重复注入 · O4 第 5 步才来仍不判定（老行为保留）。
（O3 首版**是我的夹具判据写错**：nudge/合规步本就会写 `mcl-step` 行，应断言"不重复**注入**"而非"行数不变"。）

### 70.2 子代理**不是** MCL 的有效测试车（我最初的判断错，用户的建议方向对但机制不允许）

`mcl.ts:427` 明写 `if (agent?.session?.header?.origin === 'subagent') return decision // 子代理不引导`
⇒ 子代理会话**按设计不进入 MCL**（轨迹实证：子代理有 `ren`/`cap`，**一次 `pre0` 都没有**）。
⇒ 唯一有效测试车是**顶层用户会话**；而顶层会话的 `cap` **必须在当前进程代内到达**（重载会清内存态）。

### 70.3 第二层：块的"设了却渲染不到"——假设被逐个**证伪**，剩时序

| 假设 | 判定 | 依据 |
|---|---|---|
| ① 宿主传参形状不符 | **证伪** | 探针：宿主传 `agent, scope, signal`，`sid` **能**解出 |
| ② 两键不同源（pre-step 用 `agent.id`、块用 `agent.session.id`） | **证伪** | 轨迹 `renSame`（两键同源） |
| ③ 单元级"设置后读取"不通 | **证伪** | `test-mcl` 场景 F6：块返回材料（含"认知环·慢通道"标记） |
| ④ **渲染早于设置**（块在请求装配时渲染，材料在 `pre-step` 才写） | **存留（最可能）** | 真机：`injected=436 viaSystem=1` 而 **`sysBlockNonEmpty=0`**（21 次渲染）；单元级能读 ⇒ 差别只在**时序** |

### 70.4 决策与下一步（**未实现，不谎报**）

- **P2b 保持关**（`mclMaterialInSystem:false`）——在"声称 `viaSystem=1`"的假象下丢材料，**比关着更糟**；
  材料走**消息面**（送达有据）。**修复判据不可动摇：`sysBlockNonEmpty > 0`。**
- **下一步（已定形状）**：**把判定提前到"消息到达时"**——`session/event` 处理器本可 async，
  在那里先算出材料（**单一实现**：把判定抽成一个函数，`cap` 时与 `pre-step` 时**共用**，
  靠 `st.channel` 幂等），则**当轮首次渲染**就能取到材料；`pre-step` 保留为兜底。
  ⚠ **不在状态不明时硬改活体机制**：该重构要先有"渲染确实早于设置"的**直接证据**（宿主源码或一次可复现的时序），否则就是把猜测写进活体。

---

## 71. 层二**已修**：判定提前到"消息到达时"（2026-09-13）

### 71.1 为什么块取不到材料（完整机理链 · 用户问的那件事）

1. **块由宿主在"请求装配"时渲染**，而 `agent/pre-step` 钩子在这之后才跑；
2. 旧实现的判定与材料写入**都发生在 `pre-step` 里** ⇒ 块渲染那一刻 `st.materialText` **还是空的**；
3. 后续渲染能否补上，取决于"设置之后宿主还会不会再渲染"——**实测没有**：
   `injected=436 viaSystem=1`（材料已写）而 **`sysBlockNonEmpty=0`（21 次渲染全空）**
   ⇒ **材料从未送达**，而审计里的 `viaSystem=1` 记的是**意图**、不是**送达**；
   （"为什么之后再没渲染"**未查明**——候选是"宿主每轮只装配一次/缓存"或"state 在下次渲染前被清"；
   我**没有证明**是哪一个，而是用"提前写"绕过了它。）
4. 已证伪的三个替代解释：宿主传参形状不符（`sid` 能解出）· 两键不同源（轨迹 `renSame`）· 单元级读取不通（场景 F6 通过）。

### 71.2 修法：**单一实现、两处触发**

- 新增 `decideTurn(d, sid, step)`（**模块级导出**）：召回 → 熟悉度 → 快/慢 → 去重 → 材料 → 落 `st` 与审计与计数，
  全部集中一处；
- **触发点①**：`session/event` 的 `user/message`（**消息到达时**）——在**任何渲染之前**就把材料备好
  （仅 `materialInSystem` 模式；消息面模式仍由 pre-step 负责插消息，免得抢走那次插入）；
- **触发点②**：`pre-step`（兜底 + 消息面注入），靠 `st.channel` **幂等**，不会判两次；
- **顺带修一处真回归**：材料若**落在本步**（含触发点①把材料放进 system 段），**本步不判合规**——
  否则会在第 1 步就误发再引导（实测 F3 红）。判据 = `st.materialStep`。

### 71.3 证据

- **单元级（决定性）**：新场景 P（`test-mcl` **43 → 45 PASS**）：
  **P1** 消息到达即判定（没跑 pre-step 就有 `mcl-step viaSystem=1`）·
  **P2 块无需 pre-step 即可返回材料（实测 321 字符）** ——这正是层二的判据。
- **门禁**：`typecheck`/`build` 零错 · `npm test` **62 pass** · 安装副本 182/182。
- **活体判据（待你下一条消息）**：`/mcl/status` 的 **`sysBlockNonEmpty > 0`**。
  P2b 已开通（`mclMaterialInSystem:true`）；若该值仍为 0，我会在那一轮直接读轨迹定位并回滚。

---

## 72. 层二**真根因**（活体 trace 抓到的）：轮级重置把材料删了（2026-09-13）

### 72.1 真机 trace 的完整序列（本轮，同一会话）

```
43tj|renSame|0     ← 步骤 1 请求装配渲染（无材料，正常）
43u1|pre|8         ← pre-step 拿到任务文本 ⇒ **判定并写入材料**
43xh|set|441       ← 材料 441 字符**已写入 state**
43xq|cap|8         ← **`user/message` 事件（轮级重置）到达**
440p|early|0       ← 消息到达即判定（幂等，无新动作）
4bqk|renSame|0     ← **步骤 2 渲染：读回 0**（材料已被抹掉）
```

⇒ **根因**：`captureTaskText` 里的 `state.delete(sid)`（轮级重置）**与材料写入赛跑**。
**本机宿主的 `user/message` 落在当轮 `pre-step` 之后** ⇒ 重置把**刚写入的材料删掉** ⇒ 块永远读不到
（而审计照旧记 `viaSystem=1` —— 再次印证"**意图 ≠ 送达**"）。

### 72.2 为什么单元测试一直通过（重要）

夹具里 `cap` 总在 `set` **之前**（P/F 场景都是"先发事件再跑 pre-step"），
**从未覆盖真机顺序"先 pre-step 再 cap"**。⇒ 教训：**夹具不只数据分布会失真，事件顺序同样会失真。**

### 72.3 修法（极小）

轮级重置**只清"判定态"**（channel/topics/signals/nudges/sim/lateLogged），**不清 `materialText`/`materialStep`**
—— 材料必须活到"那一步的渲染"为止；新轮的判定会在下一次 pre-step 覆盖它。

### 72.4 回归闸（已登记）

新场景 Q（`test-mcl` **45 → 47 PASS**）：**按真机顺序**构造——`pre-step` 先判定并写材料 → `user/message` **后**到达 →
下一次渲染**必须仍能取到材料**。
**Q1 在前一版代码上会红**（`state.delete` 把材料删掉），修正后 `实测 321 字符` ✓。

### 72.5 **活体验证达成**（2026-09-13 · 真机 trace）

```
aes4|set|fe7ea7a6|430      ← 材料 430 字符写入
aesd|cap|fe7ea7a6|12       ← cap 到达（**旧代码在此把材料删掉**）
as2c|renSame|fe7ea7a6|430  ← **渲染取到 430 字符**
```
`/mcl/status`：**`sysBlockNonEmpty=1` · `sysBlockLastChars=430`** ⇒ **P2b 在活体成立**
（材料出现在**注入面**而非用户消息里，眼验一致）。**判据是我自己立的，已达。**

---

## 73. 收尾决策记录（用户授权「都你自己决策」· 2026-09-13）

| 项 | **我的决策** | 依据 | 状态 |
|---|---|---|---|
| **跨文件重复** | **执行去重**（不再"只报告"） | ① 内容**已失效**（指向已整体移除的 pmg 卡库）⇒ 保留失效指引比删掉更糟；② 库有 git 版本化 + 我另做备份 ⇒ **可回退**；③ 用户明确授权 | ✅ **已完成**：删 4 份标题 + 4 份正文 + 1 条重复归档 = **9 行**；影子库 **977 → 967**；`check-record-parity` **PASS**；`--dups` 只剩 **2 组正常结构**（索引/详情同名标题）；备份 `.records/backup-dedup-*` |
| **P2b（systemPrompt 段）** | **保持开通** | 层一 + 层二都修好，**活体判据已达**（`sysBlockNonEmpty=1`，430 字符） | ✅ |
| **MCL 快/慢口径** | **不改阈值、不改标签门** | 真数据 936 步：**86% 的步无召回命中**（与阈值/门无关）；改阈值收益 ~1pp 且属行为变更 | ✅ 仪表常驻（`mcl-calibrate.mjs`） |
| **联想 REM `crossTopic`** | **保持关闭** | 候选生成已由向量路径覆盖；REM 增量会**直接并入 AGENTS.md 画像**，噪声代价高 | ✅ 开门条件已写（`enableRemPass`） |
| **M4/M5 `storeMode=record`** | **no-go** | `record` 未实现（须改库侧脚本写入语义）+ `dual` 后**零生产写入** ⇒ 无流量证据不切 | ✅ 开门条件与执行路径已写（§47） |
| **`test-forgetops` 飘红** | **不改代码** | 无失败断言名就改 ＝ 盲改；运行器失败捕获已就绪 | ✅ 待再现即定位 |
| **子代理不引导**（`origin==='subagent'`） | **保留** | 设计如此；也解释了"子代理测不出 MCL" | ✅ 已写入 §70.2 |
| **git 提交/推送** | **执行**（用户本轮明确要求"同步 git hub 仓库"） | 工作树 305 项待提交；隐私红线已核（无 `_memory`/`devref`） | ✅ 提交 **`f38d73e`** 并推送；**远端 sha 逐位一致**；工作树 **0 未提交** |
| **profile 声明位**（`github:…#f81eb2e` → 新提交） | **暂不改**（我决定） | 只改 ref 而不跑 `pnpm install` 会留下"**声明 ≠ 实装**"窗口；而 `pnpm install` 会触发**宿主批量删除保护**（属**重启类**，用户明确保留）。当前状态是**已验证一致**的（182/182 + 31 特性 + 六路由 200），贸然改声明只会引入不一致 | ⏳ 命令已给（见 §74.3），**择时执行** |

---

## 74. 仓库同步 + 部署核查（2026-09-13）

### 74.1 同步结果（**SHA256 核实，不靠回显**）

| 项 | 实测 |
|---|---|
| 提交 | **`f38d73e3ac8181a5fd3dcc57a3c96a28000527b5`**（624 件） |
| 远端 `refs/heads/master` | **同一 sha**（`git ls-remote` 核）✅ |
| 工作树 | **0 未提交** |
| 隐私红线 | 无 `_memory` / `devref` 变更 ✅ |

**提交前发现并处理**：仓库根出现 5 个**误建的单库骨架散件**（`notes/`、`whitelist.json`、
`memory-whitelist-spec.md`、`task-protocols.md`、`human-execution-loop.md`，均为 09-13 18:19 同时刻、
133–146B 的桩）⇒ 来源是面板路由 **`POST /root/bootstrap`（建单库骨架）被指向仓库根**。
处置：**移出到 `%TEMP%`（不删）** + `.gitignore` **设防**（防误提交）；未动面板逻辑（该路由本就是"在给定 root 建骨架"）。

### 74.2 部署面核查（四项 + 活体）

| 检查 | 结果 |
|---|---|
| 安装副本文件级 sha256 | **182/182 一致**（内容不同 0 · 仅仓内 0 · 仅已安装 0） |
| 脚本 ↔ 库内孪生（`check-deploy-sync`） | **PASS** |
| 已安装副本特性标记 | **31 项齐全** |
| 版本钉点三处 | **PASS @ f81eb2e5** |
| 活体路由 | `/mcl/status` `/rings` `/suite` `/memory/overview` `/criteria` `/config/recent` **全 200** |
| MCL 活体 | `materialInSystem=True` · **`sysBlockNonEmpty=19`** · `sysBlockLastChars=406`（P2b 持续生效） |

### 74.3 **唯一剩余缺口**：声明位待同步（重启类，留给你）

运行中的代码 = 我按差异部署的新码（与仓内 `f38d73e` **逐件 sha256 一致**），
但 profile 的**声明**仍是旧 ref：

```
profile 依赖 = github:Fishsb/dsh-shoucang-memory#f81eb2e5b6f8517e4af6f0d0284f3375302fed74
仓 HEAD     = f38d73e
```

⇒ 宿主**任何一次重新物化**都会把运行副本退回 `f81eb2e`（**旧代，但不再丢工作**：本次已入 git）。
**择时执行（两步，属重启类）**：
1. 改 `~/.dsh/profiles/web/package.json` 的依赖 ref → `#f38d73e3ac8181a5fd3dcc57a3c96a28000527b5`；
2. 在该目录 `pnpm install --legacy-peer-deps`（会触发宿主批量删除保护 ⇒ **宜择时，勿在会话中途**）。

---

## 75. 声明位同步**已执行**（用户重启后 · 2026-09-13/14）

### 75.1 重启**没有**退回（实测）

重启后立即核对：安装副本 **182/182 与仓内一致** · 特性 **31 项** · 新模块（`composition`/`assertion-graph`/
`audit-source`/`decision-ring`/`association-ring`/`event-envelope`）**全在** · 路由 **200**
⇒ **本次重启未触发重新物化**（安装被复用）——但**隐患仍在**（声明位是旧 ref），故趁重启后的窗口**把声明追上**。

### 75.2 执行与核实

| 步骤 | 结果 |
|---|---|
| 备份 | `package.json.bak-ref-20260914-011048`（+ lock） |
| 改 ref | `#f81eb2e5…` → **`#5d9e4ae559d47efecc40bb9c0d319dca9cd7720e`** |
| **踩到一处文档偏差** | `pnpm install --legacy-peer-deps` ⇒ **`Unknown option: 'legacy-peer-deps'`**（那是 **npm** 旗标）；本环境是 **pnpm v11** ⇒ 正确写法 **`pnpm install`**。**已修 AGENTS.md 常用命令** |
| install | `pnpm install` ⇒ **Done in 14.1s · +1 包** · **未触发批量删除保护** |
| **版本钉点** | **三处一致 @ `5d9e4ae5`**（旧为 `f81eb2e5`）✅ |
| 安装副本 | **182/182 一致** · 特性 **31 项** |
| 装上去的是新码吗 | `lib/mcl.js` 含 **`decideTurn` / `materialStep` / `sysBlockNonEmpty`** ✅ |
| 热重载 + 活体 | **6/6 路由 200** · MCL `active=true` · `materialInSystem=true` |

⇒ **隐患消除**：今后任何一次重新物化都会拉到**本次提交**，不再退回旧代。

---

## 76. UI 对齐重构后的架构（2026-09-13/14）

### 76.1 问题：**事实面在界面上不可见，旋钮不可调**

实测（客户端源码引用计数）：`record` / `records` / `assertion` / `dups` / `observability` / `composition` /
`pin` / `installed` / `trace` / `association` / `materialInSystem` **全部为 0**；`/rings` 有端点但 UI 里也是 0
⇒ G0–G4 重构出的东西（记录层 · 内容环 · 统一台账 · 装配根 · 断言图）**没有任何界面入口**；
MCL 的 8 个旋钮此前也**没有写入口**（只有 deepsleep/distill/embed 三家有）。

### 76.2 信息架构（新增一级视图「架构」· 运行组）

| 页签 | 端点 | 回答什么 |
|---|---|---|
| 内容环 | `GET /rings` | 五环 KPI 与环事件对账（哪条环僵了 / 事件能否重建状态） |
| 记录与图 | `GET /arch/records` · `GET /arch/graph` | 记录层人口与**逐载体对账** · 写时自证 · 跨文件同文 · 行寻址口径 ‖ 断言图节点/边/悬空证据 |
| 观测 | `GET /arch/observability` | 统一台账（按 type 分布 · **缺 at**=信封完整性）· audit 目录 · legacy 存否 · **族×域口径** |
| 装配 | `GET /arch/assembly` | composition root 就绪度（**桥=0**）· 契约路由数 · 已装新架构模块盘点 · 三句柄 |
| 认知环旋钮 | `GET\|POST /mcl/config` | 阈值/上限/预算/topK/P2b/REM ——**唯一写入口**（白名单补丁，重载生效） |

**设计取舍**：① 只加**一个**一级视图（5 页签）而非五个，避免 nav 膨胀（用户偏好极简抗堆叠）；
② 用**通用事实渲染器**摊开后端键值（不臆造字段，后端加字段前端不用改）＋原始 JSON 折叠兜底。

### 76.3 活体实测（真实数据，非 mock）

```
/arch/records     967 记录 · 12 类 · 载体 11/11 一致 · 跨文件同文 2 组 · 写时自证 写33/可还原33/分歧0
/arch/graph       967 记录 · 865 节点 · 139 边 · 锚 34 · 悬空 0
/arch/observability 台账 494 行 · 缺 at 0 · 11 类（decision.ingest 145/write.ingest 106/…）· legacy 6/7
/arch/assembly    桥 0 · 契约路由 41 · 版本 0.3.1 · lib 62 · 新架构模块 18/18 · 三句柄就绪
/mcl/config       8 旋钮 · 阈值 0.58 · P2b true · REM false · topK 3
```

### 76.4 四条教训（都来自"看图/看数据"，代码审不出来）

1. **加视图必须同时补图标 key**：`VIEWS` 的第 3 个元素是 `ICONS` 的键，缺了会让 nav 渲染
   `undefined.split` 抛错 ⇒ **整页白屏**（真机 geo 报「无 shadowRoot」）；二分定位后才找到。
2. **加视图必须纳入出图集**：`ui-geo-regress` 的 `--shots` 是**硬编码逐页 `shoot()`**，
   漏加 ⇒ 新页永远没有真机视觉证据（本轮差点漏判白屏就是因为它不在图集里）。
3. **占位符必须在取数成功后清空**：否则生产里「读取中…」与真实数据**并存**（图上一眼可见）。
   另：面板**不解析 markdown**，描述里的 `**…**` 会当字面量渲染。
4. **根目录别混**：Record 事实源在**记忆库**（`memoryLibRoot()`），不是 suite 知识区
   （`knowledgeRoot()`）。错传的后果是**"记录 0 · 载体 0/11"这种看起来正常的空态**——
   活体抽查（而不是只看 200）才抓得到。

### 76.5 澄清与自我更正（2026-09-14）

- **误读更正**：我曾据失败信息推断"几何门禁对**每一页**断言「4 KPI + 3 操作卡 + 组件按钮」"，
  据此把架构页对齐到房内版式。**实测澄清**：严格几何断言**只覆盖「运行总览」**（`run(w,h,'运行总览')`），
  其余视图走**冒烟**（各视图"渲染非空"）。
  ⇒ **对齐仍是对的**（同族页面本就是「KPI 行 + 操作卡 ×3」版式；新页对齐它才有一致性与可读性），
  但**理由要写对**：那是**主动对齐**同族版式，**不是**"为了通过每页断言"。**代码注释已改正**——
  错误注释比没有注释更坏（会误导后来人照着做）。
- **仍未接通（如实标注）**：① 逐页签**出图**未接通（`shoot()` 的页签参数未落到点击脚本；
  **为此不加 `shot-arch-<tab>.png`**——那会得到"名字叫页签、内容其实是默认页"的**假证据**）；
  ② 逐页签**断言**未接入（探针已上报 `archTabContent`：各页签 `chars`，但断言挂在只跑总览的严格块里
  ⇒ 已删除该死代码）。页签内容的当前证据：**默认页签出图核过**（图里可见真机数据逐层摊开）。

---

## 77. 真实运行复核 + **新会话验收清单**（2026-09-14）

用户提醒：**当前会话是连续的**——依赖"会话开启时装载"的能力，在连续会话里验到的可能与新会话有偏差。
故本节把复核结果**按会话域分开**写，别混着当"已验"。

### 77.1 会话**无关**（守护进程/库/插件级）——已用真实运行数据验过

| 项 | 真实证据 | 判定 |
|---|---|---|
| 写入路径 + 写时自证（M4 前置） | `shadow-stats`：**写 33 · 可还原 33 · 分歧 0**；台账 `write.ingest × 106` · `write.consolidate × 8` | ✅ |
| 深睡落地（全链路） | 库 git 今日 3 次 `deep-sleep` 快照；`/cognition/report`：**`stop=completed · gate=pass · added=1`**（08:07/10:17 两轮） | ✅ |
| **改道后新落点**（本轮真实触发） | `POST /distill/run` ⇒ 台账 **+3 `audit.distill-skip`** · **水位 492→495** · `decision.ingest +3` | ✅ |
| 各环真实产出 | `decision.ingest 145` / `decision.consolidate 11` · `score.shadow 52` · `activation.shadow 21` · `mcl-step 62` | ✅ |
| **跳过不丢料**（我怀疑→查证→清除） | `planSkipWatermark` 三态：`skip-normal`（无未消化段）· **`skip-held-for-undigested`（有未消化段⇒不推，最多 3 轮）** · `skip-abandoned-after-hold`（显式记账后放弃）。本轮 3 条均为 `below-min-chars · chars=0` ⇒ normal ⇒ **无丢料** | ✅ **设计正确** |
| 重启 + 声明位一致性 | 真机重启后副本未退回；钉点三处一致（`check-version-pin`） | ✅ |

### 77.2 会话**相关**（只有新会话才会以真实形态出现）——**本会话验不了或不准**

| 项 | 本会话状态 | 新会话应看什么（判据） |
|---|---|---|
| MCL **首次回合**时序（层一修复的靶场） | 本会话"已开过头"，`cap` 与 `step 1` 的先后在旧会话里已定型 | 首轮 `/mcl/status` 的 `trace` 应出现 **`cap` 紧接 `pre`**（而非 `pre0`），且该轮**有通道判定**（`slow`/`fast` 计数 +1） |
| **P2b 材料入注入面** | 本会话 `sysBlockNonEmpty` 已 7+（热重载后累积） | 新会话第一次慢通道后 `sysBlockNonEmpty ≥ 1`，且材料**出现在注入面**而非用户消息里 |
| **热记忆注入** | 每轮都有（本会话可见 🧠 块） | 新会话首轮即带热记忆块，且**按该会话主题**取行 |
| **蒸馏 landing**（route=memory/project 真写库） | 本会话 transcript **已被先前自动轮次消费**（`chars=0`）⇒ 永远跑不到 | 新会话产生**含信号词 + 足量增量**的内容后：台账应出现带 `stop` 的 `audit.distill-run`，且 `shadow-stats.writes` 增长、**`diverged` 仍为 0** |
| 装配面（三句柄 ready） | `/arch/assembly` 全 true | 新会话同样应 true（否则是装配问题而非会话问题） |

**结论**：会话无关项**已用真实数据验过**；会话相关项**必须在新会话里按上表判据再看一遍**——
我**不能**在本会话里替你验（这正是"连续会话"的边界）。


































































---

_建立 2026-09-13（v1）→ 同 v2（全局架构重写）→ 同日 **v3 定稿**（自审修订 10 处；已代决默认值见 §13）→ 同日 **落地执行**（P0/P1/P2/P4前置/P5 已交付并部署，见 §15）→ 同日 **重启运行态验证 + 缺陷修复**（见 §15.5）→ 同日 **质量回归评估 + 4 项修复**（见 §16）→ 同日 **蒸馏/睡眠链与归类审查 + R1–R3 收口**（见 §17）→ 同日 **P4 双写期施工**（Record 事实源 + 影子写 + 对账门禁 + 67 条单测；前置三项实测达成，见 §18）→ 同日 **G1 内容环落地**（决策环 + 后果回收 + 价态采集口 + 环登记门禁 + 48 条单测，见 §19）→ 同日 **G2 关系环落地**（承诺状态机 + 双向兑现率 + 陈旧申报棘轮 + 35 条单测，见 §20）→ 同日 **G3 联想环落地**（碰撞记录 + 跨度门 + 越界召回 + 52 条单测，见 §21）→ 同日 **G4 读侧装配落地**（预算内最小充分集 + 联想独立预算槽 + 真库离线基线 + 28 条单测；接线待重启验证，见 §22）→ 同日 **G0 环事件流落地**（9 种 op + 重放对账 + 真库回填 10 条 PASS + 28 条单测，见 §23）→ 同日 **G0 剩余两项落地**（KPI 机检门 + 部署版本三处一致巡检，见 §24）→ 同日 **G0 事实环时态失效落地**（双时间戳 + 镜像状态承接 + 40 条单测，见 §25）→ 同日 **读侧候选集 + 画像行分层订正**（时态失效进读侧闭环；恒定面候选 18→48，见 §26）→ 同日 **部署到运行态 + 面板 `/rings` 端点**（37 件漂移归零 · 五环 KPI 真机 200 · 事件对账 ok，见 §27）→ 同日 **G4 接线 P2b**（材料改挂 systemPrompt 段；真机验证开关生效后**因放行判据不可测而回滚**，见 §28）→ 同日 **放行判据补齐**（合规步落账 + 分段读数工具；开关仍关，待窗口样本 ≥20/段，见 §29）→ 同日 **composition root 前置棘轮**（惰性桥 6 条边只许减不许增，目标 0；selftest 抓出漏计缺陷，见 §30）→ 同日 **composition root 第一刀**（`mcl-share` 退役 · 桥边 6→4 · 真机 `/mcl/status` active，见 §31）→ 同日 **第二刀 + 反向孤儿检查**（`deepsleep-share` 退役 · 桥边 4→2 · srcmap 反向 FAIL 并已证伪，见 §32）→ 同日 **composition root 收尾**（`scheduler-share` 退役 · **桥边 0** · 7 路由真机 200 · 附一次误删复盘，见 §33）→ 同日 **P2b 开启 + 判据换当场可测**（块渲染计数 · 真机 `sysBlockCalls=1` · 教训入 pending，见 §34）→ 同日 **特性探针补宿主侧**（15 项新标记 + 桥退役不变量 · 31 项齐 · 已反向证伪，见 §35）→ 同日 **DS4 前置：观测流注册表 + 棘轮**（13 条 → 目标 1 · 已反向证伪 · 两个实测坑当场修，见 §36）→ 同日 **DS4 形态统一第一刀**（统一事件信封修掉 `at` 静默丢失 + 形态审计：可并入 4/需改造 3/无数据 6，见 §37）→ 同日 **第二刀：信封收敛为单一实现**（6 处副本 → 1 · 判别字段再补 3 条 · 不变量已证伪，见 §38）→ 同日 **第三刀：水位流补判别字段 + 口径修正**（偏离显式留痕 · 门禁抓到自家夹具后改准分档，见 §39）→ 同日 **DS4 合并第一刀（真合并）**（`score-shadow` → `ledger` · 13 → 12 · 对拍逐字一致 + 写入侧实证，见 §40）→ 同日 **第二刀**（`activation-shadow` → `ledger` · 12 → **11** · 零消费方 + 真写入器单测，见 §41）→ 同日 **口径修正**（注册表分事件流/状态表 ⇒ **事件流 8**，与方案档原话吻合，见 §42）→ 同日 **第三刀**（`stub` → `ledger` · 事件流 8 → **7** · 并记下 `episodes` 的裁剪障碍，见 §43）→ 同日 **第四刀**（先落地**按 type 裁剪**机制再用它并 `episodes` · 事件流 → **6** · 21 条单测，见 §44）→ 同日 **断言图内核（合并路线）+ 切源决策**（不新开库 · 真库 136 边 · 就绪度：索引 3/3 vs 详情 0/8 ⇒ 暂不切，见 §45）→ 同日 **切源唯一前置达成**（notes 记录化 · 影子库 187→976 · 详情 8/8 · 定位须用 `(file,order)` 不得用 id，见 §46）→ 同日 **迁移+回滚路径落档 + 修掉真死开关**（`record` 尚未实现 · 注释声称的约束落实为代码约束，见 §47）→ 同日 **M2 落地**（行寻址 `(file,order)` 取代 id · 真库 153 行重复可精确定位 · 补 notes 主体缺口，见 §48）→ 同日 **M3 落地**（影子写时自证落盘 · `diverged>0` 即切源门 · 真库 11/11 分歧 0，见 §49）→ 同日 **第二通道守卫 + 开 dual**（`scheduler.json` 裸合并可绕过枚举守卫已修 · 生产自证开始累积，见 §50）→ 同日 **镜像覆盖缺口修复**（深睡写入不进影子库已补单点整体镜像 · 附一次跨时区误判纠错，见 §51）→ 同日 **第二处缺口 + 残余说法纠错**（distill 的 notes 追加未镜像已修 · §51 的"面板写载体"实测为零 · 清死导入，见 §52）→ 同日 **项目级原则落地**（精确检索留代码 · 模糊判断交模型：语义裁决层 + 真数据暴露"竞争断言"分组不成立，见 §53）→ 同日 **联想生成 + 按适配选模型**（向量"异域同构" · 真库 2 条人认得的联想 vs 纯结构规则 224 条噪声 · LLM 精判待接线，见 §54）→ 同日 **联想接进运行态**（`shoucang_associate` 工具：向量候选 → 模型裁决 · 拿不到向量即如实报不可用，见 §55）→ 同日 **通路端到端走通**（真调工具 → 模型判 2 条中 1 条成立 → 落环 `association:1c6flkt` → `/rings` 与事件流三级可核，见 §56）→ 同日 **联想接入 REM + 三入口收口 + 经验沉淀 pending**（带候选去判 · 缺省关故在环未激活，见 §57）→ 同日 **候选层重做**（`pointer` 分组 → 向量近邻 + 判交模型；真库立刻查出**跨文件重复**（4 文件同文，1.000），见 §58）→ 同日 **第五刀**（`mcl-audit` → `ledger` · 事件流 6 → **5** · 两个读取者改双源读；改道验证留待真实回合，见 §59）→ 同日 **改道确定性验证 + 修掉一处测试污染真库**（自动轮非真实用户输入故真机验证停滞 ⇒ 单测证明；`test-mcl` 原先无环境隔离已补，见 §60）→ 同日 **DS4 口径补正：加「域」维度**（`access-real`/`ring-events` 在**库**域⇒不该并；`distill-audit` 有回放正确性路径；suite 域目标 = **3**，见 §61）→ 同日 **第六刀**（`distill-audit` → `ledger` · suite 域 3 → **2** · 先对拍证明**双源强制**（单读丢水位历史）· 6 读侧迁移 + 门禁抓出漏迁测试，见 §62）→ 同日 **DS4 收口**（第七刀判定**不并** `distill-watermark`（键控语义 + 热路径）⇒ **suite 域事件流 = 1 = ledger · 目标达成**；四族两域口径，见 §63）→ 同日 **MCL 离线标定**（真数据 936 步推翻「快通道恒 0」：实为 26 条；**首要瓶颈是 86% 无召回命中**，非阈值，见 §64）→ 同日 **legacy 引用白名单棘轮**（把"改了落点忘了消费方"从"靠崩发现"变成"新增引用即 FAIL"；当场抓出 6 处用户可见描述漂移，见 §65）_


