> ⛔ **本档已作废（2026-09-22）** —— 请读 `docs/capacity-gate-adjustment-plan.md`（调整方案）与 `docs/capacity-gate-acceptance-plan.md`（验收方案）。
>
> 作废原因：本档含 **3 处经实测订正的事实错误**，均已被新档 §0 纠正：
> ① 首拒时间记为 `09-15T22:46`（实为 AGENT.md `09-15T06:19:47Z`；22:46 是 USER.md）；
> ② `CHECKS` 记为 205 条（实为 208）；
> ③ 称 `scheduler.ts` 「789 行 vs 基线 578 ⇒ 塞键必红」（门禁口径实为**代码行 582**，余量 11 行）。
> ⚠ **2026-09-23 ACT-355 订正**：现值 **585 / 基线 578 / 水位 585**；且 `FREEZE` 条目形态已由裸数字改为 `{ base, hwm }` 双水位 ⇒ 本文 `: 578` 类**数字形态引用已过时**。**引用前现跑** `node scripts/check-module-growth.mjs`。
> 另：范围已按用户澄清重定为「设置页三个容量框」（画像二 + 记忆一），非特指画像。
> ⚠ **保留本档仅为留痕**，勿据其内容决策。

---

# 容量门开关化方案（capacity-gate-switch）

> 立项动因：用户 2026-09-22 诊断结论「画像不增长」+ 拍板口径「**容量门不是硬拒绝门槛，做成开关功能，要可以关闭硬拒绝门槛功能**」。
> 本档为**决策态产物（方案 + 验收成对）**，非施工授权。施工须用户具名（R1）。

---

## 0. 一句话结论

画像行（`USER.md`/`AGENT.md`）的容量门**是全仓唯一仍在"硬拒"的容量口**，且它已经**长期恒拒**：
`USER.md` 2967/3000（98.9%）· `AGENT.md` 9975/3000（332.5%）⇒ 首拒 `2026-09-15T22:46`，至 `2026-09-22T07:34` 累计 **167 次**
（轮转前账本 133 + 当前账本 34），**零成功**。本方案把它改造为**可关闭的开关**，使"超限不阻断"成为可配置语义，
与同库索引行既有口径统一。

---

## 1. 判因（三条，按「会掩盖其他问题」排序）

### G1 · 静默恒拒（最该先修）
`src/distill-write.ts:172`
```ts
if (body.length + ln.length + sec.length + 8 > cap) return { st: 'rejected', why: `容量超限（…）` }
// 容量门：超限拒绝，待画像间合并
```
- 注释写"待画像间合并"，但**全仓零命中任何画像合并实现**（`git grep 画像间合并|profileMerge|compactProfile|profileCompact` 仅命中这行注释自身 + 若干 CHANGELOG/UI 文案）。⇒ 注释许诺的出口**不存在**。
- 后果：**死锁**。不合并 ⇒ 不能写；不能写 ⇒ 永远触发不了合并。

### G2 · 同库两套语义（本方案的正当性依据）
| 口径 | 索引行（MEMORY.md） | 画像行（USER/AGENT.md） |
|---|---|---|
| 实现 | `skill/scripts/memory_write_gate.mjs:271-284` | `src/distill-write.ts:172` |
| 超限行为 | **exit 0，允许写入 + 告警**（`>150%` 强告警仍不阻断） | **拒绝**（`st:'rejected'`） |
| 依据 | 用户 2026-09-16 判定「直接拒绝不符合意图，提醒就可以」（`:272` 注释，含三次修正记录） | 无用户裁决记录（v15 上线即如此） |
> ⇒ 同一用户、同一库、同一件事（超容量），**两套相反语义**。这不是偏好差异，是**未收敛的历史残留**。

### G4 · 同一文件上两个写入者、两套容量语义（**2026-09-22 当场查实 · 本方案最重要的判因**）
`AGENT.md` 有**两个**写入者，走**两条**不同的门，容量语义**相反**：

| 写入者 | 落点 | 门 | 容量行为 | 实测后果 |
|---|---|---|---|---|
| 蒸馏 `profiles` 通道 | `writeProfileLine` | `distill-write.ts:172` **自持硬拒** | **拒** | 0 次成功（167 次拒绝） |
| 深睡 `principles` 通道 | `applyPrinciples` | `memory_write_gate.mjs:271-284` | **放行**（exit 0 + 告警） | 已写 112 行 |

> 实测证据：`AGENT.md` 内含 **112 行 `[原则]`/`[路径]` 行**（principles 通道所写）+ **13 行画像行**（profiles 通道所写，全部为 9/16 前的存量）。
> ⇒ `AGENT.md` 之所以能长到 **9975 字符 / 332%**，正是 **principles 通道一路放行**的结果；
> 而 `writeProfileLine` 还在同一个文件上死守 `容量 3000` —— **这就是那句"容量 3000"与文件实际 9975 字符长期并存的真因**（§5-O3 已查实，非旁路、非洞）。

**它同时解释了用户"特别是用户画像"的直觉，且比直觉更准**：
- `USER.md` 的写入者**只有一个**（`writeProfileLine`，无 principles 通道）⇒ **完全冻死**，9/16 后零变化。
- `AGENT.md` 有两个写入者 ⇒ 靠 principles 侧还能长，**.md 文件时间戳因此看起来"还在动"**，掩盖了 profiles 侧同样冻死的事实。
> ⇒ 用户观察到的"画像都不增加"实为**蒸馏画像通道单点冻死**；`AGENT.md` 的缓慢变化是**另一条通道**制造的假象。

### G3 · 失败不可观测（用户明确在意的一类）
1. `check-write-receipts.mjs` 只断言"回执带 `attempted` + `written` 字段"，**不断言 `written > 0`** ⇒ `verdict:"rejected", written:0` 每轮照发，**门恒绿**。
2. 轮转前账本 `write.profile` 回执行数 = **0**（该回执 2026-09-20 才补）⇒ `2026-09-15`–`2026-09-19` 的 133 次拒绝**连回执都没有**。
3. 全仓无任何判据覆盖"画像通道长期零落盘"。
4. 面板只显示容量占用率，**98.9% 与 100% 在 UI 上不可分辨**；`AGENT.md` 那句 `容量 3000` 与文件实际 9975 字符**长期并存**（下 §5-O3）。
> ⇒ 用户"很久没变化"的观察**只能靠人眼发现**，机制侧全盲。

---

## 2. 方案（**开关化**，非删除）

### 2.1 语义定义

| 态 | 行为 | 与现状关系 |
|---|---|---|
| `capacityGate: 'hard'` | 超限 ⇒ 拒写（**= 当前行为**） | 缺省值，逐字节回归 |
| `capacityGate: 'warn'` | 超限 ⇒ **照写** + 审计告警（**= 索引行既有语义**） | 新增 |
| `capacityGate: 'off'` | **不做容量判定**（= 门本身关闭） | 新增 |

> **为什么是 const union 而非 boolean**：`storeMode` 先例（`scheduler.ts:191-194`）——**注释里声称的约束不算约束，代码里的才算**；boolean 表达不了"关"与"提醒"两种降级，会把 `off` 挤成"用超大 cap 模拟"，那是**假关闭**（容量算式仍在跑，只是永不触发 ⇒ 与真关闭在审计上不可分辨）。

> ⚠ **`off` 与 `warn` 的真实差别（必须写清，否则是自欺）**：
> · `warn` 仍计算占用 ⇒ 面板百分比/告警有据；
> · `off` 不计算 ⇒ **面板容量条必须显式渲染"已关闭"**，不得回落到 0%（否则又是"假读数"）。
> 二者都**不作拒绝理由**，故对"能不能写进去"等价；差别只在**可观测性**。

### 2.2 缺省值（**这一项须用户拍板，见 §5-O1**）
建议缺省 **`'warn'`**（而不是 `'hard'`）：
- 理由：现状 `'hard'` 已致 167 次静默拒绝；缺省再置 `hard` 等于**修完之后默认仍坏**。
- 但缺省改 `warn` 会**立即改变运行行为**（`AGENT.md` 已 332%，会立刻开始增长）——属"用户可感知改动"，须知情。
- 若用户要求"零行为变化优先"，则缺省 `'hard'` + 立即手工置 `warn`，两步走。

### 2.3 落点清单（五处，缺一即假接线）

> 依据 `[教训] 配置键三处齐全 · schema/接口/默认映射/缺一即假接线`（`notes/lessons.md §假绿与实证`）+
> `[原则] 判定位随消费面定`（`notes/agent.md`）。**本仓已有两例"白名单加了、映射没加 ⇒ 400 假可控"**（`storeMode:350` 注释、`embedding.dimension:343`）。

| # | 文件 | 落点 | 说明 |
|---|---|---|---|
| ① | `src/capacity-config.ts`（**新建**） | schema + 接口 + 显式映射 + `decideCapacity()` 纯函数 | **必须新建而非塞 scheduler**：`scheduler.ts` **实测 789 行 vs 冻结基线 578**（`check-module-growth.mjs:110`），已远超容差，**塞进去必红**；抬基线属 R3 须拍板 ⇒ 走既有出路「按领域接缝抽出」（同 `model-config.ts` / `eval-config.ts` / `probe-config.ts` 三处先例） |
| ② | `src/scheduler.ts` | `...capacityConfigSchema` 展开 + `distillOptionsOf` 加 `...capacityOptionsOf(config)` | 展开 1 行 + 映射 1 行；**净增 ≤3 行**，须核对棘轮余量 |
| ③ | `src/distill-write.ts:172` | 把硬编码 `if (... > cap) return rejected` 换成 `decideCapacity(...)` 调用 | **唯一行为改动点**；`'hard'` 时逐字节等价于原式 |
| ④ | `src/panel-config.ts` | `/set` 白名单（`SET_SCALAR_KEYS`）+ `SCHED_KEY` 映射 + `allowed[]` 枚举 + 读数透出 | 三处都要；枚举键**原样写字符串**（不得落进 `Number(value) || 0`——已两度踩坑，见 `:355-363`） |
| ⑤ | `src-client/panes-toggles.js:196-198` + `i18n-*` | 三个容量门输入框旁加档位选择 + `off` 态显式文案 | 文案须含 "已关闭 · 不再阻断"；i18n 中英同步（`check-i18n-*` 守） |

### 2.4 回落规则（**单一实现**）
```ts
// capacity-config.ts —— 声明 / 映射 / 回落 同处一文件（防两处漂移）
export const resolveCapacityMode = (raw: unknown): CapacityMode =>
  raw === 'warn' || raw === 'off' ? raw : 'hard'   // 非法值 ⇒ 回落 hard（fail-safe：不知情时保守）
```
> ⚠ **不静默吞非法值**：`scheduler.json` 写入侧已由 zod 枚举挡（非法即抛），本函数只处理"历史坏值/手改文件"。
> 与 `storeMode` 的 `z.union` 同法。

---

## 3. 验收（方案与验收成对）

| # | 判据 | 类型 | 先红依据 |
|---|---|---|---|
| A1 | `'hard'` ⇒ `decideCapacity` 结果**逐字等于**原式（含 `why` 文案） | 单测·等价 | 改造后须重跑 |
| A2 | `'warn'` ⇒ `{ok:true, warn:...}`；`'off'` ⇒ `{ok:true, warn:null}` | 单测·行为 | **先红**：当前实现只有拒/过两态 |
| A3 | 非法值 / 缺键 ⇒ `'hard'` | 单测·回落 | — |
| A4 | `scheduler.json` 无该键时，面板读数 == 运行态缺省（**不得回落字面量**） | 机检 | `panel-config.ts:94-108` 已登记过**同类缺陷**（回落字面量落后于注册表 ⇒ 面板与运行态打架） |
| A5 | 白名单 / 映射 / 枚举**三处键名一致**（无映射 = 400 假可控） | 机检 | 先例两次 |
| A6 | `check-write-receipts`：**加**一条"`write.profile` 若 `attempted>0` 且 `written==0` 连续 N 次 ⇒ 报告" | 机检 | **补 G3-1 的盲区**；建议 N=5，报告态（非红） |
| A7 | `off` 态下 `AGENT.md` 能落盘（真机探针） | 真机 | 当前 `AGENT.md` 332% ⇒ 任何写入必拒 |

**门禁登记**：新增判据须登记进 `scripts/check-runner.mjs` 的 `CHECKS`（当前 **205 条**）。
**发布前置**：按 `AGENTS.md` 规则 7 六条（typecheck / build / check-runner / ui-geo-regress / 契约三向 / check-installed-features）。

---

## 4. 施工分册（按依赖序，`[路径] 多链条改造分册`）

| 册 | 内容 | 可逆 | 依赖 |
|---|---|---|---|
| **册一** | 新建 `capacity-config.ts`（schema/接口/映射/`decideCapacity` 纯函数）+ 单测 A1–A3 | ✅ 纯新增 | 无 |
| **册二** | `distill-write.ts:172` 换调用 + 等价回归 | ✅ git | 册一 |
| **册二′** | **（O3 查实后新增）** `applyPrinciples` 容量语义纳入同源 —— `AGENT.md` 两个写入者收敛为**一个判据** | ✅ git | 册一；须先答 O5 |
| **册三** | `scheduler.ts` 展开 + 闸门接线 + 机检 A4/A5 | ✅ git | 册二 |
| **册四** | 面板 + i18n + 契约表（`SET_SCALAR_KEYS` / `allowed[]` / `SCHED_KEY`）+ 契约三向门 | ✅ git | 册三 |
| **册五** | 补 G3 可观测（回执断言 A6 + 面板 `off` 显式渲染）+ **存量对齐**（见 §5-O2） | ⚠ 见下 | 册四 |

> ⚠ **册五含真源数据处置**（`AGENT.md` 已 332%）：**裁剪/下沉既有画像行属"改真源语义"⇒ R3 须拍板**。
> 本方案**默认不做**，只提供开关放行；存量如何收敛单列 O2。

---

## 5. 未决项（须用户拍板 — 每条均可一句话回答）

| # | 问题 | 选项 | 推荐 & 理由 |
|---|---|---|---|
| **O1** | 缺省档位取哪个？ | A `'hard'`（零行为变化）／B **`'warn'`**（修完即不再拒） | **B**：A 等于"修完默认仍坏"；但 B 是用户可感知改动，须知情后拍板 |
| **O2** | `AGENT.md` 332% / `USER.md` 98.9% 的**存量**怎么办？ | A 不动，靠开关放行并任其增长／B 一次人工下沉（把长小节移入 `notes/`，留指针）／C 单独一轮"画像瘦身"方案 | **C**：B 直接改真源且量大（`AGENT.md` 需砍 7000+ 字符），风险高；C 可先出方案再拍。⚠ A 会让 `AGENT.md` 继续无界增长 |
| **O3** | ~~`AGENT.md` 那句报错称 `容量 3000` 而文件实际 9975 字符，是否有旁路写入？~~ | — | ✅ **已查实（2026-09-22）**：**不是旁路**。`AGENT.md` 有两个写入者（`profiles` 走硬拒门 / `principles` 走放行门，见 §1-G4）。⇒ 本方案的**必须扩围**：只改 `writeProfileLine` 一处**不够**，须同时明确 `applyPrinciples` 侧的容量语义归属（见 O5） |
| **O5** | `principles` 通道的容量语义怎么定？ | A 纳入同一开关（一个档位管两处）／B 保持现状（永不放行拒）／C 独立第二档位 | **A**：两条通道写的是**同一个文件**（`AGENT.md`），容量口径**必须同源**——否则今天这个"两套语义打架"的缺陷会原样重演。⚠ 但 A 意味着改 `memory_write_gate` 的既有 `'warn'` 行为，须确认不违反用户 2026-09-16 判定（该判定本就是"不阻断"，故 A 与之**一致**，不冲突） |
| **O4** | `off` 态要不要保留**极高位**保险（如 10×）？ | A 真关／B 关但留保险 | **A**：留保险 = 假关闭（同 §2.1 的 `off`/`warn` 论证）；要保险就用 `warn` |

---

## 6. 边界（明确不做）

- ❌ **不删容量门**：只做"可关闭"。`capUser`/`capAgent`/`capMemory` 三键语义与范围**不动**。
- ❌ **不改索引行口径**：`memory_write_gate.mjs` 的 `'warn'` 既有行为**保持**（本方案是让画像**向它看齐**，不是反过来）。
- ❌ **不碰冻结棘轮基线**：不动 `check-module-growth` 的 `FREEZE` 表（`scheduler.ts: 578`）。
- ❌ **不动 `lib/`/`client.js`**：跨会话共享产物，属 R2④ 禁越界项；构建产物由构建链生成。
- ❌ **不修改真源数据**：`_memory/` / `audit/` / 笔记库只读（§5-O2 处置须拍板）。

---

## 7. 证据索引（每条结论的位置）

| 结论 | 位置 |
|---|---|
| 硬拒实现 | `src/distill-write.ts:172` |
| 索引行 warn 语义 + 用户 2026-09-16 判定 | `skill/scripts/memory_write_gate.mjs:271-284`（含三次修正记录） |
| 0 次画像合并实现 | `git grep 画像间合并` 仅命中注释自身 |
| 容量门 schema | `src/scheduler.ts:185-187` |
| 冻结棘轮 | `scripts/check-module-growth.mjs:110`（`scheduler.ts`: 578） |
| 域抽出三先例 | `src/model-config.ts` / `src/eval-config.ts` / `src/probe-config.ts` 各文件头 |
| 面板三处落点 | `src/panel-config.ts:255-380`（白名单/映射/类型） · `src/panel-contract.ts:53-68` |
| UI 落点 | `src-client/panes-toggles.js:196-198` |
| gate.caps 契约 | `skill/engine/criteria.json:348-368` |
| 双份脚本**已一致** | `memory_write_gate.mjs` / `memory-append.mjs` 两份 sha256 实测一致（无 parity 门覆盖，靠人工） |
| 拒绝次数与时间线 | `audit/ledger.jsonl`（34 次）+ `ledger.jsonl.1`（133 次），首拒 `2026-09-15T22:46:52Z` |
| 画像实际占用 | `USER.md` 2967 字符 / `AGENT.md` 9975 字符（文件实测） |
| **G4：AGENT.md 双写入者** | `deepsleep-run.ts:745-747`（`applyPrinciples` → `memory_write_gate`，放行）· `deepsleep-run.ts:751-759`（`writeProfileLine`，硬拒）· `distill-write.ts:524`（蒸馏 profiles，硬拒） |
| **G4 实测计数** | `AGENT.md` 内 `[原则]`/`[路径]` 行 **112** · 画像行 **13**（`← 源: notes` 5 + `← 源: distill` 8，均为 9/16 前存量） |

---

## 8. 态标签声明（R5 可回答性）

| 产物 | 态 | 授权 |
|---|---|---|
| 本方案档 `docs/capacity-gate-switch-plan.md` | **决策态** | 用户 2026-09-22 指令「整理一下调整方案」 |
| 全部诊断结论 | 只读取证 | 用户同轮指令「检查一下生产链」 |
| 代码 / 真源数据 | **未触碰** | — |

> 本档**无任何施工**。册一–册五开工须用户具名（R1）；§5 四条须用户拍板（R3）。
