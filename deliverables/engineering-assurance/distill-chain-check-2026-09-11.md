# 蒸馏链状态检查报告（shoucang / dsh-shoucang-memory）

**日期**：2026-09-11
**工作流**：工作流 1（全面代码审查，扩展为「代码 + 运行态 + 测试 + 文档」四路核查）
**参与成员**：Cody（代码审查师）· Rex（SRE 工程师）· Tessa（测试专家）· Docu（技术文档师）
**主理人**：甄宇航（Zhen）· 工程督导

---

## 📌 TL;DR（执行摘要）

- **整体结论**：蒸馏链**健康且在线运行**。五道机检门全过、四套单测全绿（24+30+18+18 = 90 PASS / 0 FAIL）、构建零错、部署副本 sha1 15/15 全一致。链路的「摄取 → 裁决 → 落盘 → 巩固」四段均有实证活动痕迹（`distill-audit.jsonl` 18:26、`ledger.jsonl` 18:32 仍在写入）。
- **严重度分布**：🔴 严重 **0** 项 / 🟠 高 **2** 项 / 🟡 中 **5** 项 / 🟢 低 **6** 项
- **阻塞 / 非阻塞**：**无阻塞项**。两个 🟠 高危均为「机制层隐患」，当前未造成实际损失，但**建议在下一轮迭代修掉**——一是 MCL 慢通道合规提示长期无效（159 步中合规率趋近 0），二是判据台账口径分叉（`ledger.jsonl` 与 `judgement-ledger.jsonl` 并存且后者已成僵尸文件）。
- **最重要的一条**：蒸馏链**没有静默停摆**。这是本次检查最需要证伪的假设，实际证据表明它仍在正常出活（今日已有深睡成功落盘 `added=1 gate=pass`，即 08:50:59 那轮）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 **有条件通过**（功能健康，存在 2 项机制层高危待修） |
| 阻塞项数量 | **0** |
| 关键行动项 | **6** 条（P0 ×2 / P1 ×3 / P2 ×1） |
| 建议下一步 | 优先修 MCL 慢通道合规失效 + 统一判据台账口径，二者都属「机制空转」型隐蔽缺陷 |

---

## 🔍 审查发现（按严重度排序，已去重合并四路结论）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议修复 | 来源 |
|---|--------|------|------|---------|---------|------|
| 1 | 🟠高 | 正确性/机制空转 | `src/mcl.ts` + `mcl-audit.jsonl` | **MCL 慢通道「有界再引导」形同虚设**：实测 159 条 `mcl-step` 记录中，`compliant:false` 长期为常态（如 sid `62ff2c81` 连续 step 16–25 全为 `slow` / `sim:0.609` / `compliant:false` / `nudges:1`），说明再引导 1 次后模型并未引用材料主题词，**引导未达成目的却无升级/退出机制**，退化为纯开销。 | 引入「再引导失败计数」观测指标；若 N 轮连续 non-compliant，降级为静默（避免每步注入无效材料）；同时校准 `mclFamiliarThreshold`（0.65 对当前库是否偏高，导致绝大多数会话被判慢通道） | Rex（实测）+ Cody（代码） |
| 2 | 🟠高 | 一致性/僵尸文件 | `skill/engine/distill-contract.md:115` | **判据台账口径分叉**：契约 L10/L21 声明统一台账为 `audit/ledger.jsonl`，但 L115 仍写 `audit/judgement-ledger.jsonl`。实测两者并存——`ledger.jsonl` 58 行且活跃（末行 18:32 `check.sleep`），`judgement-ledger.jsonl` 仅 6 行且停在 13:49（`criteriaVersion":"v2.0.0"`，而当前 `/criteria` 已报 **v2.2.0**）。**即旧台账已停止写入，成为无人消费的僵尸文件，而契约仍有一处在指它。** | 删除或显式标注 `judgement-ledger.jsonl` 为历史遗留；修正契约 L115 指向 `ledger.jsonl`；`criteria-audit.mjs` 复核是否仍读旧路径（若读，则对账结果失真） | Docu（文档）+ Rex（实测）+ 主理人复核 |
| 3 | 🟡中 | 可测性 | `scripts/` 测试面 | **关键不变量缺测试**：深度睡眠状态机非法转移、`applyForgetOps` 三守卫（叶子节/cold/非重复 stub）的绕过路径、判据升格/降格**边界值（阈值 ±1）**、MCL 分流阈值两侧行为，均无对应用例。现有 90 个断言集中在正常路径。 | 按 Tessa 补测计划补 P0 用例（见下「测试覆盖评估」） | Tessa |
| 4 | 🟡中 | 文档一致性 | `AGENTS.md` / `README.md` 模块表 | `src/` 实际 14 模块与文档描述存在**职责粒度偏差**（如 `criteria.generated.ts` 的「生成物禁手写」约束在 AGENTS.md 有、README 未同步），且 `lib/` 产物 mtime 与 CHANGELOG 条目日期需人工比对才能确认覆盖。 | 以 `check-criteria.mjs` 已覆盖的投影一致性为准，补齐 README 侧描述 | Docu |
| 5 | 🟡中 | 观测面 | `audit/activity.jsonl` | 活性台账 42 行，`lastHit` 时间戳集中在同一批次（`1789070782229`），**cold 判定依赖的 `hits30/days30` 与真实使用存在时间窗错位风险**；注入侧冷热降权此前曾因 § 名提取正则在空格处截断而全链路失效（已修，但无回归用例固化）。 | 为「§ 名含空格」加一条回归用例，防止同类正则在未来改动中复发 | Cody + Tessa |
| 6 | 🟡中 | 工程债 | `src/distill.ts`（219 KB） | **单文件体量过大**：`distill.ts` 219 KB / `panel.ts` 115 KB，超出可维护阈值。虽项目有「架构单一实现」约定，但单文件承载摄取域+巩固域+状态机+水位管理，阅读与变更成本高。 | 若后续再做功能追加，考虑按域拆分（摄取/巩固/状态机），但**不建议为拆而拆**（当前无功能阻塞） | Cody |
| 7 | 🟡中 | 可观测性 | `~/.dsh/suite/knowledge/audit/` | `judgement-ledger` 停写无人告警 ⇒ 说明**台账新鲜度无监控**。若未来 `ledger.jsonl` 也静默停写，将无法及时发现。 | 在 `sleep-selfcheck` 增加「台账新鲜度」检查项（末行时间距当前 > N 小时即告警） | Rex |
| 8 | 🟢低 | 卫生 | `~/.dsh/profiles/web` | 计划任务 `dsh-web-user` / `dsh-bge-embed-user` 因非管理员权限删除被拒（CHANGELOG 已登记）；后者目标脚本本身不存在，属无效任务。 | 提权终端执行 `schtasks /delete /tn dsh-web-user /f` 清理 | Rex |
| 9 | 🟢低 | 一致性 | `check-deploy-sync.mjs` | 检查 38 件，一致 24 / 库内缺失 14（未部署，非错误）/ 不一致 0。**「缺失 14」需人工判断是否为有意未部署**（当前无告警，属设计如此）。 | 保持现状，但在报告中显式说明「14 件未部署」是预期行为，避免误读为缺口 | Rex |
| 10 | 🟢低 | 文档 | `HANDOVER.md` | 交接文档中的蒸馏链状态描述早于本轮 ADR-122/130 落地，存在滞后。 | 下一轮交接前刷新 | Docu |

---

## 🏗️ 架构与健康度评估（主理人复核）

**已实证的健康面**（均为主理人或成员实测，非文档声称）：

| 核验项 | 命令/方法 | 结果 |
|--------|----------|------|
| 判据机检门 | `node scripts/check-criteria.mjs` | ✅ PASS（五处投影与注册表一致） |
| 载体契约门 | `node scripts/check-carriers.mjs` | ✅ PASS（/set 24 键全映射，未归类 0） |
| 字段角色门 | `node scripts/check-field-usage.mjs` | ✅ PASS（32 项字段角色一致） |
| 硬编码红线 | `node scripts/check-hardcode.mjs .` | ✅ 通过（开源红线守住） |
| 部署同步 | `node scripts/check-deploy-sync.mjs` | ✅ 一致 24 / 不一致 **0** |
| CHANGELOG 结构 | `node scripts/check-changelog.mjs` | ✅ 正常（147 条） |
| 类型检查 | `npm run typecheck` | ✅ exit 0 |
| 单测（4 套） | `test-layering` / `test-forgetops` / `test-treeops-split` / `test-mcl` | ✅ 24 + 30 + 18 + 18 = **90 PASS / 0 FAIL** |
| 投影新鲜度 | 重新执行 `gen-criteria.mjs` 后 diff | ✅ **字节级无变化** ⇒ 生成物未被手写篡改、无漂移 |
| 部署副本一致性 | 逐文件 `sha1sum` 对比 | ✅ **MATCH=15 / MISMATCH=0** ⇒ 复核并证实 AGENTS.md 的声称 |
| 构建新鲜度 | `src/distill.ts` 18:23 → `lib/distill.js` 18:24 | ✅ 产物新于源码，且与安装副本同尺寸同时间 |
| 运行态活动 | `distill-audit.jsonl` / `ledger.jsonl` | ✅ 末行 18:26 / 18:32 ⇒ **链路在线，未静默停摆** |

**深睡产出时间线**（`distill-audit.jsonl`，关键三连）：

```
08:32  attempted=3  added=0  gate=all-rejected   （格式门全拒）
08:48  attempted=1  added=0  gate=exit 4         （路径箭头歧义）
08:50  attempted=1  added=1  gate=pass gateExit=0 ✅ 成功落盘
```

这条 A/B/C 三连是**链路闭环有效的最佳证据**：判据收紧后确实能拦住低质产出，且修好判据后立刻恢复产出。

**一处「看似故障、实为设计」的澄清**：`distill-audit` 中 `gate-reject` 断言 77 条、`below-min-chars` 44 条、`workspace 反解失败` 53+42 条——初看像是大面积失败。经核对，`workspace 反解失败 → 降级 pending 待认领（不丢弃）` 是**设计内降级**（F-1 转录命名漂移问题已于今日修复，修复后实测 `写入 0/保留 4` → `写入 4/保留 0`）；`below-min-chars` 是预筛正常拦截。**这两类不构成缺陷**，但暴露出「失败语义与降级语义在审计里混用同一 `reason` 字段」的可读性问题。

---

## 🧪 测试覆盖评估

**现有防线**：90 个断言 + 7 道机检脚本，覆盖了正常路径与投影一致性，**结构性回归防线扎实**（`check-runner` → `npm test` 已把机检接入）。

**关键缺口**（按风险排序，详见行动清单）：

| 缺口 | 现状 | 风险 | 需要的用例 |
|------|------|------|-----------|
| 深睡状态机非法转移 | 无测 | 状态漂移可能静默损坏结构 | 构造非法转移 → 断言被拒 + 留痕 |
| `applyForgetOps` 守卫绕过 | 部分测（30 PASS） | 绕过 = **误删记忆**（最不可逆） | 三守卫各自的「命中/未命中断言」+ 尝试直删必须失败 |
| 判据升降格边界值 | 无测 | 阈值 ±1 误判导致错误升格 | 阈值-1 / 阈值 / 阈值+1 三点断言 |
| MCL 分流阈值 | 无测（仅测了注入行为） | 阈值漂移导致全走错通道 | 阈值两侧各一例，断言通道归属 |
| § 名含空格正则 | 无测 | 同类正则曾致降权全链路失效 | 以 `§DSH 环境` 为夹具断言提取完整 |

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | **修 MCL 慢通道合规失效**：为 `compliant:false` 连续 N 轮加降级/退出机制，并重新校准 `mclFamiliarThreshold`（当前 0.65 疑似偏高致慢通道泛滥） | 宿主开发 | P0 | 下一轮迭代 |
| 2 | **统一判据台账口径**：修正 `distill-contract.md:115` 指向 `ledger.jsonl`；处置僵尸文件 `judgement-ledger.jsonl`；复核 `criteria-audit.mjs` 读取路径 | 宿主开发 + Docu | P0 | 本日内 |
| 3 | **补 P0 测试用例**：`applyForgetOps` 三守卫绕过、深睡非法转移、判据升降格边界值（阈值 ±1） | Tessa 指导 / 宿主开发 | P1 | 本周 |
| 4 | **加台账新鲜度监控**：`sleep-selfcheck` 增加「末行时间距当前超阈值即告警」，防止未来静默停写 | Rex / 宿主开发 | P1 | 本周 |
| 5 | **补 § 名含空格回归用例**：固化「`§([^/→]+)`」正确性，防同类缺陷复发 | Tessa | P1 | 本周 |
| 6 | 刷新 `HANDOVER.md` 与 README 侧模块描述；清理无效计划任务（需提权） | Docu / Rex | P2 | 下个交接周期前 |

---

## ⚠️ 待完善 / 已知局限

- **本次检查为「链状态」快照，非「链质量」评测**：能回答「蒸馏链是否健康运行」，不能回答「蒸馏出的记忆是否真的有价值」——后者需 `recall-eval` 类长期 A/B 数据积累。
- **实测覆盖范围有限**：运行态证据集中在 2026-09-11 当日；跨日趋势（如深睡成功率的周级波动）未纳入。
- **两处成员自报的「无法核验项」**：① 验证过程中环境权限受限处（计划任务删除需提权）未能实测；② 部分端点需鉴权（`/health`、`/targets` 返回 `unauthorized`），改用无鉴权端点（`/selfcheck`、`/mcl/status`、`/criteria`）取证。
- **未做破坏性验证**：为守「数据先问」红线，未对真实库构造故障注入（如故意损坏 JSON、强制状态机非法转移），故状态机的**容错行为未在真库上实测**，仅通过单测夹具间接验证。

---

## 📚 数据来源 & 成员产出索引

**主理人独立复核**（不依赖成员转述）：
- 机检/单测/typecheck 全量实跑（见上「已实证的健康面」表）
- 逐文件 `sha1sum` 对比：仓 `lib/` ↔ `~/.dsh/profiles/web/node_modules/dsh-shoucang-memory/lib/`，MATCH=15 / MISMATCH=0
- `gen-criteria.mjs` 重生成后 diff：字节级无变化
- 台账双文件实测：`ledger.jsonl` 58 行活跃 vs `judgement-ledger.jsonl` 6 行僵尸
- 契约 L10/L21 与 L115 的台账口径矛盾定位

**成员产出**：
- Cody（代码审查师）：蒸馏链核心链路审查，覆盖 `distill.ts` / `criteria.ts` / `treeops.ts` / `mcl.ts` / `targets.ts`，输出按严重度排序的发现表与「单文件体量过大」等结构性观察
- Rex（SRE 工程师）：运行态取证——机检/单测实跑、构建新鲜度、`_memory/` 产物时间线、部署 sha1 对比、MCL 合规率实测（159 条 `mcl-step`）
- Tessa（测试专家）：逐文件测试盘点（24/30/18/18）+ 机检防线盲区分析 + P0-P2 补测计划
- Docu（技术文档师）：`distill-contract.md` v9 逐条对实现核对，定位到 L115 台账口径分叉这一实质不一致

**关键证据文件**：
- `~/.dsh/suite/knowledge/audit/distill-audit.jsonl`（731 行，末行 18:26）
- `~/.dsh/suite/knowledge/audit/ledger.jsonl`（58 行，末行 18:32）
- `~/.dsh/suite/knowledge/audit/mcl-audit.jsonl`（159 行）
- `~/.dsh/suite/knowledge/audit/selfcheck-latest.json`（verdict: ok）
- `skill/engine/distill-contract.md`（v9）

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
