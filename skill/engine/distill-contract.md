# 蒸馏裁决契约（distill-contract v7 · 判据注册表化 + 双域分离 + 观测量）

> **权威实现 = `src/distill.ts` 的 `DEFAULT_DISTILL_PROMPT`（摄取域）与 `DEEP_SLEEP_PROMPT`（巩固域）**。
> **判据唯一事实源 = `engine/criteria.json`** → 人读投影 `engine/criteria.md`（生成）→ 机检门 `node scripts/check-criteria.mjs`。
> 本档只保留「**字段语义 + 调用时序 + 宿主不变量**」；**判据正文不再在此复述**（避免第 N 份拷贝）。
> 与代码冲突时**以代码为准**，并请回改本档。
>
> 沿革（只留结论，历史见 `docs/history/ADR-0005` 等）：
> - v1–v3：双库粒度二分（记忆库 vs pmg 项目卡库）+ board=generic|project。
> - **v4（2026-09-08 单库化）**：pmg 整体移除 ⇒ **只有一个记忆库**；跨项目有用的细粒度条文也进 notes；项目专属事实直写
>   项目工作区 `docs/devref/shoucang/`；新增 `profiles` 双画像通道（USER/AGENT）。
> - **v5（2026-09-10）**：`appends` 条目可选 `rootCause`/`avoidWhen`（教训带 WHY 与不适用边界）。
> - **v5.1**：`profiles.target` 统一为 `USER.md`/`AGENT.md`（宿主另做归一化）。
> - **v6（2026-09-11 契约对齐）**：删 pmg 时代残留声明；路由编号按现码重排；补分段水位/落盘失败不推水位/深睡通道表。
> - **v7（2026-09-11 ADR-122 记忆核心 v2）**：① 判据段（R1–R4 + 四问 + Q2 画像判定）改为**生成投影** `INGEST_JUDGE`
>   （源=criteria.json）；② **四问降级为归属子判据组**；③ **删除「规则→SOUL.md」死支**（宿主无该写入通道）；
>   ④ 输出新增**可选 `judgement`**（L0 四维 + dup / evidence + cost）→ 宿主写 `judgement-ledger.jsonl` 供对账；
>   ⑤ **双域分离**：摄取域（会话→库）与巩固域（库→库）判据互不借词，接口=升格链状态机（spec §8）。

## 1. 顶层归属路由（蒸馏子代理第一步，逐条判定；**判据正文见 `engine/criteria.md`**）

```
R1 泛化方向指引？  这条知识 = 下次做类似任务时给 agent 大概方向（步骤轮廓/关键注意点/目标形态）
                    → route=memory（粗粒度是特性，不要把细节条文塞进记忆库）
R2 跨项目有用的细粒度条文？  官方规范/平台规则/工具用法（换项目仍成立）
                    → route=memory（归 notes/tools.md 或 notes/lessons.md，教程式浓缩）
R3 某项目专属事实？  项目结构 / 该项目用户拍板的决策 / 项目契约踩坑（只在单一项目语境有用）
                    → route=project（宿主直写该项目工作区 docs/devref/shoucang/）
R4 其余            一次性进度 / 可搜索公开知识 / 无实质 / <relevant-memories> 注入缓存 / 重复已有归属
                    → route=discard（skipped 给 ≤30 字理由）
```

- 同一条既像 R1/R2 又像 R3：跨项目可复用 → memory；只在单一项目成立 → project；既不跨项目也不属当前会话项目 → 丢弃。
- 拿不准 → `route=memory` 但 `appends` 留空 + skipped 记理由（宁缺毋滥）。
- `route=memory` 时续走四问：**Q0 已有归属？ → Q1 下周用得上？ → Q2 归谁（notes / USER.md / AGENT.md）→ Q3 能合并？**
  - Q2 画像判定：用户的稳定偏好/背景/禁忌 → `profiles` target=`USER.md`；agent 自身稳定做法/能力边界/常犯教训 → `AGENT.md`；一般知识 → `appends`。

## 2. 输出 JSON（单行，无 reasoning）

```json
{
  "route": "memory|project|discard",
  "appends":  [{"target":"notes/lessons.md","section":"<既有 ## 小节名 或 父/子 路径>","text":"目标：… 1. … 2. … 注意：…（≤120字）","rootCause":"≤30字 WHY（教训类可选）","avoidWhen":"≤30字 不适用场景（教训类可选）"}],
  "newIndex": [{"target":"MEMORY.md","line":"[tag] 主题 · 概况短语/短语/短语 → notes/x.md §小节"}],
  "profiles": [{"target":"USER.md|AGENT.md","section":"≤12字小节名","text":"≤80字一句话"}],
  "projectCards": [{"cardType":"how-to|reference|decision","title":"≤20字","text":"≤200字","source":"≤30字"}],
  "skipped":  [{"title":"...","reason":"≤30字"}],
  "judgement": {"reuse":"cross-task|cross-project|session-only","generality":"direction|contract-fact|detail","stability":"once|same-day-repeat|cross-day","conflict":"none|coexist|supersede","dup":"exact|approx|none","topic":"≤12字主题（对账用）"}
}
```

字段语义（**现码口径**）：

- `route`：整轮增量的**主**归属；混合内容以主要价值为准，其余进 `skipped`。
- route=memory → 填 `appends` / `newIndex` / `profiles`，`projectCards` 留空：
  - `appends.target` 白名单（宿主 `gateMemoryAppend`）= `notes/{env,tools,flows,lessons,release,user,agent}.md`；**提示词把 appends 引导到 5 类**
    （env/tools/flows/lessons/release），user/agent 走 `profiles`。
  - `appends.section`：**既有 `##` 小节名**，或「父/子」树状路径（子节不存在时宿主自动建 `###`）。
    **裂 `###` 判据（spec §8.1 分裂律）**：目标 `##` **子树正文 > 1000 字（R=一次读取单元）或同级条目 > 6 条（K，防横向膨胀）**
    → 裂子节并用「父/子」路径写；否则并入父节（宁并勿滥裂）。
  - `appends.text`：教程式三段「目标：… 1. … 2. … 注意：…」，只写方向指引级浓缩（目标形态/步骤轮廓/关键注意点），
    不搬细节条文；纯事实类可省步骤保留目标行。
  - `rootCause` / `avoidWhen`（v5 可选）：仅教训/踩坑类；宿主写入时自动追加「- 根因：…」「- 不适用：…」两行，`read_section` 原样返回。
  - `newIndex.line` **格式权威 = `memory-whitelist-spec.md §8`**：`[tag] 主题 · 概况/短语/短语 → notes/<file>.md §小节`；
    定界符 `·`=段界 `/`=短语界 `→`=指针；主题 ≤12 字名词性、禁冒号复合；概况 ≤30 字、高判别实词、禁日期/溯源元信息。
    **宿主对新增索引行有唯一性硬门**（同 标签+主题 已存在 → 拒收）。
  - `profiles`：0–2 条，须稳定画像而非一次性事实；与 route=memory 绑定。
- route=project → 填 `projectCards`（`cardType`：how-to=操作步骤 / reference=契约事实 / decision=架构决策），其余留空。
  宿主**不写卡库**（pmg 已移除）：`<workspace>/docs/devref/shoucang/` 直写；workspace 不可解 → 落
  `pending/<date>-project-defer-<slug>.md`，由入口 `flushDeferCards` 在后续轮次按卡内「源会话」反解 workspace 回流
  （**不再交 LLM 重裁决**）。
- route=discard → 除 `skipped` 全空。
- 与 route 不匹配的字段宿主拒收（`rejected`）。原 JSON 里的 `board` / `migrationHint` 字段**现码零处理**，请勿输出。

## 3. 宿主分流与水位语义（守藏蒸馏器职责）

1. **分段**：整窗增量按 `CHUNK_CHARS`/事件边界切段（不劈事件），单轮至多 `MAX_CHUNKS_PER_RUN` 段；`manifest` 承接段间查重上下文。
2. **段成功判据（v6 修正，A1）**：`stop === 'completed' && out && disp.failed === 0` 才推水位到该段 `endSeq`。
   - 条目级落盘失败（`disp.failed > 0`）→ **水位保留**，下一触发从本段起点续传；
   - 同一段连续失败满 `MAX_DISPATCH_RETRY`(=3) 次 → 强制推进 + 审计 `fclass='dispatch-failed-forced'`（丢失显式记账，不再静默）；
   - `stop≠completed` 或 `out=null`（JSON 解析失败）→ 本段不推进，下轮续传。
3. **claim 锁（A3）**：蒸馏入口统一 `tryClaim`（同 sid 在途 25min 内让位），结束/早退释放；扫尾只读判让位。
4. **路由落盘**：memory → `resolveTarget` + `loadWhitelist` + `gateMemoryAppend`（**进程内白名单门**）→
   `scripts/memory-append.mjs` 子进程（脚本自持白名单 + 容量门 + 写前备份 + `tmp+rename`）；
   profiles → 宿主 `writeProfileLine` 直写（小节防注入 / 单行 ≤160 / 容量 / 去重 / replace 须逐字命中）；
   project → 如上 §2；discard → 空跑。
5. **队列**：`pending/` 候选按文件粒度装填（预算 `CAND_BUDGET`），**排除 `-project-defer-` 卡**（后者归 `flushDeferCards`）；
   任一段 `added>0` 才把本轮装填的候选移入 `pending/.processed`。
6. **审计**：每段一行 `distill-run`（route/stop/fclass/llm/targetLib/added/rejected/failed/chunk/chunkStart/chunkEnd/totalChunks）；
   跳过落 `distill-skip`（below-min / prescan-no-signal / busy-subagent / claim-held）。

## 4. 深睡归纳契约（`DEEP_SLEEP_PROMPT` 为权威，此处仅列通道）

| 通道 | 形状 | 宿主不变量 |
|---|---|---|
| `principles` | `{action:add\|replace, match?, text}` — `[原则]`/`[路径]` 行写入 `AGENT.md` | 源指针须真实存在于痕迹；`[路径]` 具体值必须变量化 |
| `profileOps` | `{target:USER.md\|AGENT.md, action, section, text}` | 每条带 `← 源: notes/…`；无锚不写 |
| `pointerOps` | `{target, action:update, match, line}` | 只允许**原地替换**（禁增删索引行） |
| `treeOps` | `rename` / `merge` / `split`（把一个叶子 `##` 按逐字边界锚拆 ≤6 个 `###`） | 归档可回滚 / 锚存在 / 指针集内重写 / 无孤儿 / 幂等 |
| `forgetOps` | `{action:archive\|keep, file, section, reason?}` | **禁直删**；三守卫（叶子节 / activity 为 cold / 非 stub）；画像节（user/agent）硬保护；单轮上限 3 |
| `crossTopic` | `{action:add, text}` | **硬门**：源指针须覆盖 **≥2 个不同 §**；`enableRemPass` 开启才生效 |

## 6. 判据注册表与 judgement 台账（v7 新增）

- **唯一事实源**：`skill/engine/criteria.json`（L0 内核 / L1 摄取域 / L1 巩固域 / L2 代价 / 硬门与观测参数 / anti-scope）。
- **投影**（禁手写）：`src/criteria.generated.ts`（两个 prompt 的判据段 + judgement 提示 + 常量）· `skill/engine/criteria.md`（人读表）· `skill/engine/criteria-gate.json`（`memory_write_gate.mjs` / `memory_health_check.mjs` 读它）。
- **机检门**：`node scripts/check-criteria.mjs`（注册表自洽 + 投影最新 + 投影接线），纳入 `npm test`。改判据一律「改注册表 → `npm run gen:criteria` → 过门」。
- **台账**：每次决策一行写入 `~/.dsh/suite/knowledge/audit/judgement-ledger.jsonl`：
  `{at, criteriaVersion, domain:'ingest'|'consolidate', judgement?, l0After?|hostGates?, decision, result, enqueued}`。
- **对账**：`node scripts/criteria-audit.mjs [--days 7] [--json]` → 判据-结果一致率 / 两域冲突率 / 保守度 / 召回-判据样本量（字段缺失时返回 `n/a`，不编造）。
- **确定性裁决单一实现**：`src/criteria.ts` 的 `evaluateL0` / `promoteVerdict`（含 premise 硬门）/ `demoteVerdict`（三守卫 + 画像节保护 + 单轮上限）——两域共调，禁止在 prompt 或调用方再写一份。

## 7. 委派禁令（不变）

蒸馏/深睡子代理**独立完成，绝不 spawn/委派任何子代理**，深睡侧亦不使用任何工具；查重凭给定材料与自身知识。
