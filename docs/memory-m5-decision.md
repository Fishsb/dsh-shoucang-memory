# M5 翻转决策记录（v2.2 · 2026-09-11）

> **性质**：证据记录（decision record）。**预注册判据 → 模拟测试 → 按数字翻转/不翻 → 回滚路径**，四步齐全。
> **引用原则**：`[原则] 结果验证重实证`（接口成功非达成——翻转必须看判据数字，而非"改了就算"）；`[路径] 深睡记忆蒸馏`（显式传参 + 判据达标才推进）。

## 1. 预注册判据（**先定判据，后跑测试**）

| 开关 | 翻转条件 | 理由 |
|---|---|---|
| `scoreWeights=v2` | 样本 ≥30 ∧ \|corr(importance,relevance)\| ≤0.9 ∧ **top-3 Jaccard ≥0.6** | 前两条防"新分量冗余"；第三条防"排序被大幅扰动"（用户可见行为，需最小惊讶） |
| `maturationEnforce=true` | 成熟度门**拦阻率 ≤50%** | 拦阻率过高 = 门过早，会冻结成长（与"宁缺毋滥"目标相反） |

## 2. 模拟测试（`scripts/shadow-sim.mjs`，**真实库行 79 行 × 合成检索样本 60 query**）

| α_imp | top-3 Jaccard | corr(imp,rel) | 扰动性质 | 判定 |
|---|---|---|---|---|
| 0.35（初始） | 0.56 ❌ | −0.293 | v2 换进**更重要**条目 | 扰动过大 → 不翻 |
| **0.25** | **0.68 ✅** | −0.293 | 同上（预期行为） | **达标 → 可翻** |
| 0.15 | 0.72 ✅ | −0.293 | 同上 | 达标但信息增益更小 |
| 0.05 | 0.91 ✅ | −0.293 | 同上 | 近乎不扰动（分量形同虚设） |

**结论**：*（a）* importance **不冗余**（corr=−0.293，远低于 0.9 冗余阈）→ **保留该分量**（R-2 判据通过）；*（b）* 初始 α_imp=0.35 扰动过大（>40% top-3 变化）→ **下调到满足判据的最大值 0.25**（Jaccard 0.68），兼顾"引入重要性信号"与"最小惊讶"。

## 3. 已执行的动作

| 动作 | 落点 | 证据 |
|---|---|---|
| 注册表 α_imp 0.35 → **0.25**（附证据说明） | `skill/engine/criteria.json#surface.score` | 投影 `criteria-gate.json: alphaImp=0.25` |
| 注册表 `score.mode` legacy → **v2** | 同上 | `/criteria` 返回 `mode=v2` |
| 运行时开关 `scoreWeights` legacy → **v2**（走配置通道 `/set`） | `~/.dsh/suite/scheduler.json` | 落盘 `scoreWeights="v2"`；`/config` 回读 `v2` |
| **翻转生效实证** | 影子日志 | `score-shadow.jsonl` 最新行 `mode:"v2"`（前一行 `legacy`）；v2 把 `rel 0.36 / imp 0.79` 的 env 行提入 top-3 = **换进更重要条目** |
| 真实数据交叉验证 | `memory-reconcile` ⑤ | 真实影子 22 样本 `corr=0.051` → ✅ 与模拟同向（都不冗余） |
| **`maturationEnforce` 保持 false** | 同上 | 拦阻率 **96.6%**（29 小节仅 1 个达 gate 0.5）→ 翻会冻结成长，**明确不翻** |

## 4. 回滚路径（任一异常一条命令回到今天之前的行为）

| 回滚项 | 命令 | 效果 |
|---|---|---|
| 打分公式 | `POST /api/shoucang-panel/set {key:"scoreWeights",value:"legacy"}` + 重载 | 回到 relevance+activity 排序 |
| 注册表意图 | `surface.score.mode` 改回 `legacy` + `npm run gen:criteria` | 投影与文档同步 |
| α 权重 | `surface.score.alphaImp` 改回 0.35（或任意值）+ 重生成 | 只影响 v2 分支 |
| P 层画像行 | `injectProfileRows=0` | 回到"画像行不注入" |
| 成熟度门 | 保持 `maturationEnforce=false`（当前即此） | 只记录不强制 |

## 5. 下一轮复评条件（何时才可翻 `maturationEnforce`）

1. `scripts/maturation-scan.mjs` 显示**拦阻率 ≤50%**（即 ≥半数小节已被跨日再现「养熟」）；
2. 或把 `maturation.gate` 由 0.5 下调到与真实日数分布匹配的值（**先用 `maturation-scan` 的分布定 gate，再翻 enforce**——同样是"先判据后动作"）；
3. 复评时重跑 `shadow-sim`，把新数字追加到本档（**错误/历史不删**）。

_建立 2026-09-11 · 依据：`scripts/shadow-sim.mjs` 模拟输出 + `audit/score-shadow.jsonl` 真实影子 + `memory-reconcile` ⑤ 段 + `/set` 落盘与 `/config` 回读。_
