# 蒸馏裁决契约（distill-contract v3 · 粒度判定锚）

> 蒸馏子代理 persona 的唯一权威定义。各插件 spawn 蒸馏子代理时以本文档「裁决提示词模板」为事实源（可整段内嵌，注明来源）。
> v1（ADR-0004 内嵌）→ v2：加第一层归属路由 → v3（2026-09-06 用户拍板）：判定锚从类别改为粒度——两库的区别不是主题类别，而是粒度与功能：记忆库=粗粒度方向指引，项目卡库=细粒度规范/事实 → **v3.1（2026-09-06 用户拍板）：格式传递**——`newIndex`/`appends.text` 内嵌记忆库 spec §8 教程式与索引行模板（**条目格式权威 = memory-whitelist-spec.md §8**），蒸馏产出不再凭示意自由发挥。
> **v4（2026-09-08 用户拍板，单库化）：pmg 项目卡库已随治理插件整体移除，守藏只有一个记忆库。** 守藏执行宿主已升级 v4（src/distill.ts DEFAULT_DISTILL_PROMPT 为权威实现）——R2 跨项目细粒度条文改入 notes（原 generic 板块承接）；R3 项目专属事实直写项目工作区 `docs/devref/shoucang/`（workspace 由会话转录反解，反解不到=无归属如实丢弃）；新增 `profiles` 双画像通道（USER/AGENT，Q2 归谁落地）。本文档其余章节保留作 v3 沿革，与 v4 冲突处**以 v4 为准**。
> **v5（2026-09-10 用户拍板，WikiSkill 借鉴：结构化教训留痕）**：`appends` 条目新增**可选** `rootCause`/`avoidWhen`（各 ≤30 字）——教训/踩坑类浓缩（notes/lessons.md 或 [lesson] 语境）带根因 WHY 与「不适用」场景才可复用，宿主写入时自动追加「- 根因：…」「- 不适用：…」两行（正文小节级，read_section 原样返回供检索端判适用性）；`newIndex`/`profiles`/其余字段与判定语义不变，**v4 旧输出（无此二字段）照常受理**。守藏执行宿主已升级 v5（src/distill.ts DEFAULT_DISTILL_PROMPT 为权威实现）。
> **树层义（2026-09-10，文档先行）**：分裂判据链语义= memory-core-model §2.7（并入 L1 vs 裂 L2 分面 vs 子面提级新 L1，禁跳层）；`###` 经 `父/子` 路径自动建、`##` 需锚；读取走二级展开协议（L1 正文 → L2 标题清单 → 选面展开）。DEFAULT_DISTILL_PROMPT 判据句与此对齐列为后续档。
> **树由模型自动维护（2026-09-10 拍板）**：结构决策归模型——蒸馏写侧并入/裂 L2；深睡 treeOps 通道（契约档·待落地）允许模型输出 split/merge/rename/move/attach-clone 结构操作 JSON，宿主只守不变量（锚/指针不悬空/无孤儿/归档可回滚/write_gate/health/幂等）。层义为模型规范非硬白名单。v5.4"深睡不新建/不合并小节"禁令在 treeOps 落地时解除（当前蒸馏写侧照旧）。
> v1（ADR-0004 内嵌）→ v2：加第一层归属路由 → v3（2026-09-06 用户拍板）：判定锚从类别改为粒度——两库的区别不是主题类别，而是粒度与功能：记忆库=粗粒度方向指引，项目卡库=细粒度规范/事实 → **v3.1（2026-09-06 用户拍板）：格式传递**——`newIndex`/`appends.text` 内嵌记忆库 spec §8 教程式与索引行模板（**条目格式权威 = memory-whitelist-spec.md §8**），蒸馏产出不再凭示意自由发挥。

## 归属路由（第一层，先于四问）

**判定锚（v3，用户拍板 2026-09-06）：两库不是按主题分类，是按粒度分工。**

- **记忆库 = 泛化元记忆**（人脑类比）：执行任务时提供**大概方向**——类似任务做过，记忆里存的是「这类任务大概有哪些步骤、哪些关键点要注意、完成目标是什么」这类**泛化阶段目标指引**。粒度不需要细，宁粗勿细。
- **pmg 项目卡库 = 细粒度承载**，内分两板块：
  - **通用板块（board=generic）**：官方性/规范性文档级信息——DSH 开发规范、官方规则、平台规则、工具用法资料等**外部权威规则**。
  - **项目板块（board=project）**：项目事实、开发过程中**用户拍板的决策**、某项目专属的开发契约/踩坑细节。

对每条候选知识，按顺序判定：

```
R1 泛化方向指引？
   这条知识的作用 = 下次做类似任务时给 agent 一个大概方向（步骤轮廓/关键注意点/目标形态）？
   是 → route=memory（进四问，落记忆库）。粒度粗是特性不是缺陷，不要把细节塞进记忆库。
R2 细粒度开发知识？
   官方规范/平台规则/开发规范条文（→ board=generic）
   或 某项目的事实/用户决策/开发契约/踩坑细节（→ board=project，绑定 workspace 项目）
   是 → route=project（落卡库；目标不可达时落 pending 带标记）
R3 其余
   一次性进度 / 可搜索公开知识 / 无实质 / <relevant-memories> 注入缓存
   → route=discard（skipped，给 ≤30 字理由）
```

- **超出 R1/R2 范围的一律不存**；R2 且无承接插件（pmg 缺席）→ **丢弃**（discard，不回退记忆库）。
- 同一条知识同时像 R1 和 R2 时，按**粒度**取舍得舍：能浓缩成一句方向指引的价值 → R1；必须保留细节条文才有用 → R2。两边都塞 = 双写漂移，禁止。
- 拿不准 → 降级 route=memory 但 appends 留空、记 skipped 理由（宁缺毋滥）。

## 四问（route=memory 时续用，不变）

Q0 已有归属？（已被 skill/项目治理文档承载 → 不写）→ Q1 下周用得上？→ Q2 归谁（MEMORY/USER/AGENT）→ Q3 能合并？

## 输出 JSON（单行，无 reasoning）

```json
{
  "route": "memory|project|discard",
  "appends":   [{"target":"notes/lessons.md","section":"<既有 ## 小节名>","text":"教程式浓缩：目标一句+编号步骤+注意，≤120字","rootCause":"≤30字 WHY 根因（教训类可选）","avoidWhen":"≤30字 不适用场景（教训类可选）"}],
  "newIndex":  [{"target":"MEMORY.md","line":"[tag] 主题 · 概况短语/短语/短语 → notes/x.md §小节"}],
  "projectCards": [{"cardType":"how-to|reference|decision","board":"generic|project","title":"≤20字","text":"≤200字","source":"≤30字"}],
  "migrationHint": "<仅 route=project 时填：若正文显示该项目开发知识密集（如连续踩坑/多契约），≤30字提示宿主安排卡库迁移复核>",
  "skipped":   [{"title":"...","reason":"≤30字"}]
}
```

字段语义：

- `route`：**主判定**（对整轮增量的主导归属；混合内容以主要价值为准，其余进 skipped）。
- route=memory → 填 `appends`/`newIndex`（target 白名单 notes/tools|flows|lessons|env|release.md；section 必须既有小节名；无可写则空数组）：
  - **`appends.text`（v3.1 教程式浓缩）**：`目标：… 1. … 2. … 注意：…` 三段式——只写**方向指引级**（目标形态/步骤轮廓/关键注意点），不搬细节条文；纯事实类可省步骤保留目标行；≤120 字。
  - **`rootCause` / `avoidWhen`（v5 可选）**：仅教训/踩坑类条目（notes/lessons.md 或 [lesson] 语境）使用——WHY 根因与不适用场景（对标 WikiSkill pattern 双记 + When NOT to Apply）；宿主写入小节正文时自动追加「- 根因：…」「- 不适用：…」两行，read_section 原样返回；缺省省略，v4 旧输出无此字段照常受理。
  - **`newIndex.line`（v3.1 格式权威 = spec §8）**：`[tag] 主题 · 概况短语/短语/短语 → notes/<file>.md §小节`——定界符三分工（`·`段界 `/`短语界 `→`指针）；主题 ≤12 字名词性禁冒号复合；概况名词短语 `/` 分隔、≤30 字、高判别实词（专名/数值/路径关键词）、禁日期/溯源/维护元信息。
- route=project → 填 `projectCards`：
  - 卡类型：how-to=操作步骤 / reference=契约事实 / decision=架构决策
  - **`board`（v3 新增）：generic=官方规范/平台规则（落通用知识库）；project=项目事实/用户决策（落当前项目卡库）。缺省按 project 处理（宿主兼容无 board 字段的旧输出）。**
  - 项目库未就绪时宿主落 pending 带标记，不得直写记忆 notes。
- `migrationHint`：**调度信号**（协作宪章 v2：守藏=调度中枢+单一蒸馏器，ADR-0007）——宿主（守藏蒸馏器）收到后检查该项目 pending 积压，≥3 张或 >24h 时提示 agent 调 pmg `devref-card` 迁移。
- route=discard → 全空 + skipped 理由。
- `projectCards`/`newIndex`/`appends` 与 route 不匹配的条目宿主拒收。

## 宿主分流（守藏蒸馏器职责，ADR-0007）

1. route=memory → memory-append 安全阀入册（走各库白名单；守藏本地知识区/记忆库按 R0 动态路由）。
2. route=project → 按 `board` 分发：
   - board=project → devref-card 写 workspace 项目卡库（不可达 → pending `[route:project]`）
   - board=generic → devref-card 写通用知识库宿主（config `generic_project`，即 pmg 权威仓 docs/devref；未配置 → pending `[board:generic]`）
3. route=discard → 仅日志。
4. 裁决 JSON 解析失败/无 route 字段 → 按旧语义处理（视作 memory，宁缺毋滥由 appends 空数组兜底）。

## 委派禁令（不变）

蒸馏子代理独立完成，**绝不 spawn/委派任何子代理**；查重凭给定正文与自身知识。
