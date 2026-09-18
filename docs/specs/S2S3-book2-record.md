# S2S3 册二 · 施工与验收记录（S3 转「审查 + 压缩」· 打开出口）

> **成对来源**：`docs/specs/S2S3-three-layer-plan.md` §3.2 / `docs/specs/S2S3-three-layer-acceptance.md` §2.1（H-①）。
> **授权**：用户指令「启用目标模式全部落地，不要让我决策自己检索信息」⇒ 落在已授权的 S2S3 五册内自主施工。
> **批次**：第一段（2026-09-19）= 三通道停产 + 影响账并入 `sleep-reports.jsonl`；**第二段** = `release` 接线两前置 + 接线本身。

---

## 1. 交付物

| # | 项 | 落点 | 形态 |
|---|---|---|---|
| 1 | **三通道停产**（第一段） | `src/deepsleep-apply.ts`（`PRODUCE_OFF_GATE='produce-off'`）+ `deepsleep-run.ts` 画像通道条件 + `scheduler.ts` 的 `s3Produce`（**缺省 false**） | 原则（add/replace）+ 画像同时关闭；台账上 `gate='produce-off'` + `attempted=N` + `added=0`（**「不产出」与「没跑」可分辨**）；维护动作不受影响 |
| 2 | **影响账并入**（第一段） | `src/sleep-report.ts` → `<kRoot>/audit/sleep-reports.jsonl`（`kind=impact`） | **不另开 `audit/impact/`**（会审裁定）；每 (file,section) 一行，`injected:'unknown'` 显式记 |
| 3 | **前置① 净减** | `runDeepSleep` **399 → 369 行**；抽出模块级 `writeDawnDelta` | 会审次序「先净减、再加线」；搬迁**逐字**、自由变量经参数传入 ⇒ 行为零变化 |
| 4 | **前置② 批准清单** | `reviewReleaseSemanticsBatched` 返回 `approvedRows` + `ops`（**同一份 plan**）+ `executable` | 原先只回 `sample`（5 条截断）+ `hashes` ⇒ 调用方无可执行清单 ⇒ 出口恒定零释放 |
| 5 | **接线本身** | `deepsleep-run.ts`：`import { applyRelease, releaseOpsFromPlan, RELEASE_MAX_PER_RUN }` + 模块级 `runRelease()` | **三重 fail-closed**（见 §2） |
| 6 | 判据件 | `scripts/test-release-wiring.mjs`（入 `CHECKS` · **155 件**） | 静态 5 项 + 行为 4 分支 |

## 2. 三重 fail-closed（本次接线的核心判据）

| 重 | 门 | 判据 | 为什么必须有 |
|---|---|---|---|
| ① | **默认关闭** | 只有 `SHOUCANG_RELEASE_AUTO=1` 才执行；不设 ⇒ 零写入 | 语义门自身的 `over-permissive` 警报写着「**不得据此接线自动执行**」（实测通过率曾达 100%）⇒ 自动改写用户库不能是默认行为 |
| ② | **语义门 `executable`** | 空交集 / `over-permissive` ⇒ `false`；**调用方不得自行推断** | 把"能不能执行"的判断留在**产生判据的那一层**（单一实现；防调用方各自解释） |
| ③ | **当下复核** | `applyRelease` 内部重跑 `planRelease` 逐条比对；"不在批准清单 ⇒ 不释放" | 不接受陈旧计划与调用方自报自足（会审的"双重 fail-closed"） |

归档**不自己实现**：走既有 `applyForgetOps`（叶子节 / cold / 非重复 stub 三守卫 + 归档目录可回滚 + 原位留 stub + **绝不直删** + 画像文件硬保护）。

## 3. 判据与先红

| 判据 | 检查方式 | 结果 |
|---|---|---|
| 接线不是"模块存在" | `test-release-wiring` **A1–A5** | import 含 `applyRelease` · 有 `applyRelease(` 调用点 · 有 `SHOUCANG_RELEASE_AUTO` · 有 `relReview.executable` · `otherChannels` **不含** `relRes` |
| fail-closed 行为 | **B1–B4**（真调 `applyRelease`） | B1 空清单 ⇒ 零释放零写入 · B2 批准清单不含该行 ⇒ 零释放 · **B3 显式批准 ⇒ 归档 1 条**（出口不是恒零）· B4 库状态变 ⇒ 复核拦下 |
| 净减真实发生 | `node scripts/audit-fnspan.mjs --gate --debt 0` | **最大 369 行（`runDeepSleep`）< 400**，债务 0/0 |
| **先红（留证）** | `git stash` 掉 `src/deepsleep-run.ts` 后跑本件 | **A1–A4 四条红**（无 import / 只 import 不调用 / 无开关 / 无 `executable` 门）⇒ 改后 10 PASS / 0 FAIL |

## 4. 落地差异与残留（**不谎报**）

1. **接线 ≠ 已启用**（本册交付时的状态）：生产上为零释放（默认关闭）；**2026-09-19 用户答「全部做」后已启用**（见 §5）。
   开启通道两条（同一判据，实时读取 ⇒ 改完即生效）：持久配置 `scheduler.json#releaseAuto` / env `SHOUCANG_RELEASE_AUTO=1`。
   启用后一旦语义门报 `over-permissive`，仍会**自动回到零释放**（第②重不受开关影响）。
2. **单轮上限 3**（`RELEASE_MAX_PER_RUN`）；被跳过项在 `kind=essence-release` 审计行的 `note` 与深睡日志行可见。
3. **口径提醒**：验收取数用 `kind=essence-release` 的 `released`（= `applyForgetOps.archived`，**归档数**）；
   **不是** `pv.release`（那是 graded-release 的放行布尔，语义完全不同，勿混）。
4. **册二其余余项**：
   · **执行 L2 提案 —— 已落地（默认关闭）**：新件 `src/proposal-apply.ts`（L2 提案流唯一消费者；逐字行级校正 +
     **先留档再改**（`rollback/<opHash>.json`）+ 幂等账 `applied.jsonl` + 路径穿越/陈旧/歧义三拒；未实现的
     `merge`/`demote` **逐条留理由**）。判据 = `scripts/test-proposal-apply.mjs`（静态 3 + 行为 6；**先红 A1–A3**）。
     启用 = 显式 `SHOUCANG_PROPOSAL_APPLY=1`（生产现状为零写入）。
   · **压缩执行**（按裁决的可回滚压缩）**仍为待办**：它依赖真实轮次的 `convergeOps`/`forgetOps` 裁决数据
     （本代理已裁定 §5-U5「可归档压缩、不删除」）；`release` 出口已接线（默认关闭），是同一族动作的执行面。

## 5. 用户授权后的收口（2026-09-19 · 用户答「全部做」）

| 项 | 动作（代理执行） | 复验证据 |
|---|---|---|
| **A 抬注入基线** | `node scripts/inject-baseline-diff.mjs --write` 重立 `_memory/audit/inject-baseline-pre-R0.json`（**仅 `_memory/`，不入公开树**） | 复验 `✅ PASS：3 个 case 逐字节一致`（此前 3/3 红；成因 = 块顺序漂移，**早于本册**） |
| **B 重指真库孤儿指针** | 经**唯一写入原语** `section-rewrite#editFileUnderLock`（库锁 + 唯一 tmp + 原子 rename + 写后回读）把 `MEMORY.md` 末段那行由 `§npm 失效与残留 shim 修复/junction 装配漂移` 改为 `§npm 失效与残留 shim 修复`；再 `mirrorAll(['MEMORY.md'])` 重镜像 + 库内 git 提交留回滚点 | 命中数=1 才改（否则拒改）· 改后指针 `exists` · `admitIndexRow.ok=true` · `check-section-refs` = **0/0/0/0 PASS** · `check-record-parity` = 镜像 5083/5083 **分歧 0** · `bank-git: committed（5 项）` |
| **C 启用两个自动执行开关** | 开关改**双通道**：`deepsleep-run#liveAutoSwitch` 逐轮**实时读** `scheduler.json`（同 `liveFailPolicy` 同法）∪ env；`scheduler.ts` 加 `releaseAuto`/`proposalApply` 两键（面板通道可见可写）；持久值置 `true` | 判据 `test-release-wiring` **A3b/A3c**（双通道 + schema 键）+ `test-proposal-apply` A3；读回 `persisted.releaseAuto=True` / `persisted.proposalApply=True` |

⚠ **口径**：C 的**执行**发生在**下一轮真实深睡**（本轮无轮次可跑）；判定代码每轮实时读配置，**无需重载**。
开关打开后仍受各自门禁约束：release 需 `executable`（空集 / over-permissive ⇒ 零释放）；提案执行需**逐字唯一命中**。
