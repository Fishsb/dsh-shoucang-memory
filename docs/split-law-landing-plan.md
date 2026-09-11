# §8.1 指针树分裂律 · 落地方案

> 目标：让「不停向下分裂」真正跑起来。
> 依据：§8.1 是**模型规范**（memory-core-model §2.7.2：结构决策=模型，宿主只守不变量）⇒ 落地 = **给模型的判据句 + 宿主的可观测**，不是加硬拦。
> 核对日期 2026-09-11：底层机制已就绪，**唯一堵点在蒸馏契约句**。

## 一、现状核对

| 环节 | 状态 |
|---|---|
| `skill/scripts/memory-append.mjs` 路径定位 | ✅ 已支持 `父/子/孙`，深层不存在自动建 `###`，顶层 `##` 须锚 |
| `src/distill.ts` → `memAppend()`（约 695 行） | ✅ 已把 section 透传给 memory-append |
| **`src/distill.ts` 契约句**（约 271 行） | ❌ `section 必须既有 ## 小节名` ⇒ **写侧没有「裂 `###`」的出口** |
| `src/distill.ts` 去重键 `sec`（约 111 行） | ⚠️ `.slice(0, 12)` 整体截断，路径会撞键 |
| `src/treeops.ts` 操作集 | ⚠️ 只有 `rename \| merge`，无 `split` |
| `skill/scripts/memory_health_check.mjs`（111-117 行） | ✅ 已算 `sections` / `maxSec`，可直接加超 R 提示 |

结论：**能力全在，只是契约没放开** —— 这正是「不停向下分裂」目前在代码里走不通的唯一原因。

## 二、P0 · 打通分裂出口（唯一实质改动）

`src/distill.ts` 两处：

1. **契约句**：`section 必须既有 ## 小节名` → `section = 既有 ## 名，或 父/子 路径（子节不存在时宿主自动建 ###）`；
   同处补**分裂判据句**（= §8.1）：`自身正文 > R(1000) 或 同级条目 > K(6) → 裂 ###；否则并入`。
2. **去重键**：`sec` 的 `.slice(0, 12)` 不能整体截断路径 → 路径场景取「父 + 子」各 ≤12（或全路径 hash），防同一父下不同子撞键。

- **验收**：造一个 >R 的 `##` → 跑一次蒸馏 → 产出 `section:"父/子"` → `memory-append.mjs` 落新 `###`；`npm run typecheck && npm run build` 零错。
- **风险**：低（放开已有能力 + 修去重键）。**回退**：`git revert`。

## 三、P1 · 可观测（零行为变更）

`skill/scripts/memory_health_check.mjs`：notes 段加一行「超 R(1000) 节: N 个 → 列表」。**只提示不 exit**（R 是内容律不是硬门，与 `NOTES_WARN` 同策略）。

- **验收**：现网跑出 `lessons §DSH 自托管约束` 6059、`env §DSH 环境` 5888 等 6 节。

## 四、P2 · 深睡 treeOps 扩 split（结构整编自动化）

`src/treeops.ts`：action union 加 `'split'` —— 宿主按模型给定分点把一个 `##` 切成 N 个 `###`，**沿用 v1 rename/merge 的同一套不变量**（指针集内重写 / 无孤儿 / 归档可回滚 / 幂等）。`DEEP_SLEEP_PROMPT` 的 treeOps 判据句对齐 §8.1。

- **验收**：玩具副本自测（split 后指针改写、无孤儿、重名回滚），仿 treeops v1 测试套路。

## 五、不做（拍了也不做）

| 项 | 理由 |
|---|---|
| `write_gate` 硬拦超 R | 违反 §2.7.2「宿主只守不变量」；会把「该裂」变成「写不进」——正是要避免的堆叠式限制 |
| K / 深度 硬上限拦截 | 本次教训即「指针不该限制树」；K=6 是目标值、12 只是 Fano 上限，都不作门禁 |
| 指针长度校验 | 同上；44 只管「一跳直达」，与树无关 |

## 六、顺序

**P0（打通）→ P1（看得见）→ P2（自动整编）**。P0 是唯一让分裂真正发生的改动，2 处小改。

---

## 七、执行进度（2026-09-11，P0/P1/P2 已落地）

| 档 | 状态 | 落点 |
|---|---|---|
| **P0** | ✅ | `src/distill.ts`：① 契约句放开「父/子」路径 + 补 §8.1 分裂判据（>R 或 >K → 裂）；② 去重键改逐段截断（`split('/').map(s=>s.slice(0,12))`，防同父下不同子撞键） |
| **P1** | ✅ | `skill/scripts/memory_health_check.mjs`：加「超 R(1000) 节 N 个」提示（`##` 按子树、`###` 按自身），**只提示不 exit**。现网实测：env 4 个 / flows 1 个 / lessons 6 个 |
| **P2** | ✅ | `src/treeops.ts` 加 `split`（叶子 `##` → ≤6 个 `###`，边界锚逐字匹配须唯一；非叶子/锚缺失/锚歧义/同层重名 → 跳过；幂等；归档可回滚；**指针不改写**——父 `##` 仍在）。`src/distill.ts`：`DEEP_SLEEP_PROMPT` 授 split 判据 + 新增材料段「待拆候选节正文」（top 3 超 R 叶子 `##`，每个 ≤60 行） |

**验收证据**
- `scripts/test-treeops-split.mjs`（玩具副本，不碰真库）：**18 PASS / 0 FAIL** —— 覆盖落盘/lead 留父/锚点定位/幂等/非叶子跳过/锚缺失跳过/同层重名跳过/参数门（<2、>6、缺 start）/索引未改写/归档留痕。
- `npm run typecheck` + `npm run build` 零错；`node scripts/check-hardcode.mjs .` 通过。
- 产物实证：`lib/treeops.js`、`lib/distill.js` 与生效包 sha 一致；插件热重载后仍 active。

**未开**：`###` → `####`（等 §2.7「不建 `####`」拍板；见 spec §8.1 待拍板 ①）。

