# S1R · 小节寻址收口验收记录（2026-09-19）

> 配套：`S1R-section-ref-plan.md`（方案册）· `S1R-section-ref-acceptance.md`（验收册）· `S1-library-recheck-2026-09-19.md`（检查报告）。
> **授权**：用户「目标模式全部落地，任何问题自己想办法检索信息决策不要打扰我，直到全部完成为止」⇒ R1 具名授权（全部四册）。
> **结论**：**P0–P3 全部落地 · G1–G8 逐条取读数**；落地差异 **6 条**如实并陈（§6）。

---

## 1. G1–G8 逐条读数

| G | 判据 | 实测（可复现命令见 §5） | 结论 |
|---|---|---|---|
| **G1** | 两处实现逐例同结论 + 反例自证 | `check-section-ref-parity`：夹具 **44 例**差异 0 · 语义契约 **12 例**全中 · 索引行准入 **6 例**一致 · **反例自证 3 组**（硬编码 missing / 候选集截断 / exact 抹平，均被检出）· **先红证据**：旧两实现（多命中⇒判不存在 ↔ 任一命中⇒判存在）在本夹具上**分歧 6 例** | ✅ |
| **G2** | 正确性与容量正交 | 同一文件双跑：`SHOUCANG_CAP_MEMORY=5000` ⇒ **exit 2** 列出悬空指针（改造前 **exit 0 且一字不提**）；`SHOUCANG_GATE_LEGACY=1` ⇒ exit 0（回退开关可用）。`test.mjs` 新增用例「门禁-超容量+悬空指针 ⇒ exit 2」 | ✅ |
| **G3** | 三条写入路径一致收口 | ① `memory-append --new`：隔离库先红（旧行为 **exit 0 落盘**）→ 改造后 **exit 2**（`test.mjs` 固化该用例）② 深睡 `pointerOps` / 面板 `edit` 走写门 ⇒ **同一 `issues` 判定**，且正交化后 >100% 容量也报 ③ 写门容量分支不再早退（逐条见 G2） | ✅ |
| **G4** | 巡检在册 + 棘轮 | `check-section-refs` 已入 `CHECKS`；`--selftest` **4 项**（检出悬空/歧义/同名 + 干净夹具**零误报**）；基线由 `36/14/32/3` **收紧至 `0/0/0/0`** | ✅ |
| **G5** | 同名小节消除 | 真库同名重复 **3 → 0**（`env.md` 4 处 + `lessons.md` 1 处标题改名；见 §2） | ✅ |
| **G6** | 存量归零 | **spec 级：missing 36 → 0 · partial 14 → 0 · ambiguous 32 → 0 · 同名 3 → 0**（58 处指针改写，逐条留痕见 §2） | ✅ |
| **G7** | 材料侧不再静默 | `deepsleep-materials` 改三态：`missing` ⇒ 剔除**并计数**、`ambiguous` ⇒ **保留并标注**；审计新增 `sectionRefDropped` / `sectionRefAmbiguous` / `sectionRefAmbiguousSample` / `sectionRefMissingSample`（真机读数见 §3） | ✅ |
| **G8** | 七层全局门零回归 | 见 §4 | ✅ |

**G1 附注（诚实）**：本锁落地时两侧由我**同批**收敛，故不存在"改造前锁翻红"的现场；先红以**历史分歧复现**（6 例）+ **反例自证 3 组**补足——这三组是"如果两侧再分叉，锁会不会红"的实证。

---

## 2. P2 存量处置（58 处改写 + 5 处改名，全部留痕）

**执行器**：`scripts/section-ref-reanchor.mjs`（**先在临时区预演**、逐条记录、幂等、整库备份、原子写）。
**备份**：`~/.dsh/backups/sc-s1r-2026-09-18T17-08-06/`（首轮）· `…T17-10-23/`（残留轮）。

| 处置档 | 处数 | 说明 |
|---|---|---|
| **改名**（同名冲突） | **5** | `env.md`：「插件注入」（###）→`装配路径与 ctx 能力`、「Windows npm 执行策略」（###）→`npm 失效与残留 shim 修复`、「…（2026-08-16）」（##）→`命令判定与 CLI 路径`、「Windows npm 执行策略」（##）→`受限沙箱装包`；`lessons.md`：「服务与重启约束」（其一）→`插件态实证与端口冲突` |
| **显式重指**（逐条人工裁决，带证据） | **34** | 含跨文件（`tools.md §DSH 端到端验收/*` → `env.md §客户端交付链验证`；`tools.md §会话开头注入` → `env.md §插件注入`；`lessons.md §决策与施工边界` → `flows.md §决策与施工边界`）与逐行覆盖 4 处 |
| **前缀收敛**（`§父/子` → `§父`） | **14** | 子节从未创建/已改名；读侧本来就回落父节，归一只是**把回落写实** |
| **降级为文件级指针** | **9** | 主题在**全库 notes 零命中**（只在 `INDEX.md` 台账登记、详情从未落盘）⇒ 去 § 段；知识仍在索引行内，按需 grep 文件 |

**"详情从未落盘"的根因（本轮新发现，登记为后续项）**：蒸馏的 `appends` 通道要求**顶层 `##` 锚须先存在**，缺锚即 `exit 2`；而**索引行仍被写入**（P1 之前无准入）⇒ 产生"有行无节"的孤儿指针。审计可见其痕迹：`distill-run` 记录带 `fclass:"dispatch-failed"` 与 `failed:N`（实测最近一轮 `failed:2`）。**P1 已把"全不可解析"的索引行挡在写入侧**，但"appends 被拒 ⇒ 详情缺失"这条**上游**链路尚未做联动（见 §6-差异 6）。

---

## 3. 真机与运行态证据

| 项 | 读数 |
|---|---|
| 热重载 | `dev_reload_package` → 清缓存 **83 模块**、重建 1 fiber、`before/after: [active]` |
| 装副本 | `deploy-installed` → 341 件一致；`check-installed-sync --strict` → **254/254 逐件 sha1 一致**；面2 运行期必需件 **10 件齐备** |
| 特性探针 | `check-installed-features` → **53 项标记齐全**（本轮新增 6 项 S1R 标记：三态裁决 / 准入 / 多指针提取 / 材料侧计数 / 歧义保留 / 深睡审计） |
| 库往返 | `check-record-parity` → **全部逐字节一致**（P2 改写后用 `record-sync --import` 重镜像影子库：diff 增 63/删 62，与本次 P2 改写数吻合；写时自证 4483 镜像/分歧 0） |
| 注入面 | `inject-baseline-diff` → **3 case 逐字节一致**（基线已重立，§6-差异 5） |
| 渲染级 | `ui-geo-regress` → **103 PASS / 0 FAIL**（本方案零 UI 改动，作零回归证明） |
| 真库巡检 | `check-section-refs` → `exists 538 · partial 0 · ambiguous 0 · missing 0 · 同名 0` |

---

## 4. G8 七层全局门

| 层 | 命令 | 读数 |
|---|---|---|
| ① 仓内绿 | `npm run typecheck && npm run build && node scripts/check-runner.mjs` | typecheck/build 零错；全量 runner 见 §5 日志（本轮件数 143 → **145**，新增两件机检） |
| ② 部署同步 | `deploy-installed` + `check-installed-sync --strict` | 254/254 一致 |
| ③ 运行态 | `dev_reload_package` | active（83 模块重建） |
| ④ 功能探针 | `check-installed-features` | 53 项齐全 |
| ⑤ 云端 + pin | `git push` → `git status -sb` → profile pin | 见 §7（推送/pin 结果） |
| ⑥ 板块门禁 | `--only check-content-types,check-ring-coverage,check-record-parity,check-cue-space,check-memory-write-path,check-carriers,check-field-usage,audit-architecture,audit-wiring,audit-fnspan,check-shared-fn,check-arch-sync,check-injection-reach` | 全 pass |
| ⑦ 注入面 | `inject-baseline-diff` | 3/3 逐字节一致 |

---

## 5. 复现命令（逐条可核）

```sh
LIB="$USERPROFILE/.dsh/skills/managing-memory"

node scripts/check-section-ref-parity.mjs          # G1（44 例 + 12 契约 + 6 准入 + 3 反例 + 历史分歧 6 例）
node scripts/check-section-refs.mjs                # G4/G5/G6（棘轮，现为 0/0/0/0）
node scripts/check-section-refs.mjs --selftest     # 先红 + 阴性对照
# G2 双跑（同一文件、只差容量门值）
MEMORY_ROOT="$LIB" SHOUCANG_CAP_MEMORY=5000   node "$LIB/scripts/memory_write_gate.mjs" MEMORY.md "$LIB/MEMORY.md"   # ⇒ exit 2
MEMORY_ROOT="$LIB" SHOUCANG_CAP_MEMORY=5000 SHOUCANG_GATE_LEGACY=1 node "$LIB/scripts/memory_write_gate.mjs" MEMORY.md "$LIB/MEMORY.md"  # ⇒ exit 0（回退开关）
# G3 索引行准入（隔离库；勿对真库）
MEMORY_ROOT=/tmp/sc-x node scripts/memory-append.mjs MEMORY.md - --new "[env] 探针 → notes/lessons.md §不存在的小节"
node scripts/section-ref-reanchor.mjs --dry        # P2 决策表（终态读数；幂等）
node scripts/record-sync.mjs --diff                # md→影子库 差异（P2 后为 0）
node scripts/inject-baseline-diff.mjs              # 注入面
```

---

## 6. 落地差异（**6 条，不谎报**）

| # | 方案册怎么写的 | 实况怎么做的 | 理由（实证） |
|---|---|---|---|
| 1 | 语义为**三态** | 增补 **spec 级第四态 `partial`** | 实测 51 组悬空里**主模式是「父在子缺」**（子节名由模型生成、从未建节）；若把 partial 当 missing，生产链会大面积误拒（丢知识）。`partial` 只影响准入策略，名字级判定仍是三态 |
| 2 | Q3 处置档为「改指 / 建节 / 废弃」 | 实做「改指 / 前缀收敛 / **降级为文件级**」，**未建任何空壳小节** | ①写门 v17 把空壳小节视为缺陷；②9 处主题在**全库零命中**，无内容可搬 ⇒ 降级比"造空节"诚实 |
| 3 | P2a「**合并**同名小节」 | 实做「**改名** + 逐行重指」 | 三处同名**内容互不相同**（不是重复），合并会丢内容（实测：`### Windows npm 执行策略` 讲 npm/PATH 修复，`## …` 讲命令判定与 CLI 路径、受限沙箱装包） |
| 4 | 门禁/测试**不由本方案改动** | 改了 4 处：`check-injection-reach` ⑤ 解析器、`test.mjs` 3 条旧断言（+2 条新先红用例）、`deploy-installed` 面2 白名单、`check-shared-fn` 表 | ①⑤ 原实现"遇 `counts:` 即 break" ⇒ 新增材料键看不见（假红）；②`test.mjs` 3 条断言**编码的是旧缺陷行为**（容量分支吞掉正确性）；③新件静默不部署（`section-ref.mjs` 首轮就踩到）；④新增共享语义件须登记 |
| 5 | 注入面**不改文本**（P0/P1） | P2 **改了索引行指针文本** ⇒ 注入基线**重立**一次 | P2 的目标就是修索引行；重立前已逐字核对差异构成：**块序变化来自 IR1/域路由落地**（`hot-stable.ts`/`panel-shared.ts`/`panel-inject.ts` **git 未被我改动**，末次提交 `307da99`/`67cd535`）+ 我的指针改写（归一化面）。非"掩盖回归" |
| 6 | P1 收口"写入侧" | 上游链路**只做登记、未做联动** | `appends` 因缺顶层锚被拒 ⇒ 详情缺口；联动（append 失败 ⇒ 跳过对应 newIndex 行）会改蒸馏裁决语义，须单独先红 ⇒ 已登记（见 §8） |

---

## 7. 版本与云端（五层，缺一层即未同步）

| 层 | 读数 |
|---|---|
| ① 仓内绿 | `typecheck`/`build` 零错；全量 `check-runner` **PASS（145 pass · 0 xfail · 0 skip）** |
| ② 部署同步 | `deploy-installed` → 341 件一致；`check-installed-sync --strict` → **254/254 逐件 sha1 一致** |
| ③ 运行态 | `dev_reload_package` → active（重建 83 模块） |
| ④ 功能探针 | `check-installed-features` → **53 项标记齐全** |
| ⑤ 云端 + pin | 直连 `git push` 失败（`Recv failure: Connection was reset`）⇒ 走**本机代理**（`127.0.0.1:10808`，实测在听）成功：**`3339116..7c24283 master -> master`**（含 IR1 未推的那一枚），随后 `7c24283..f8b2b4d`；`git status -sb` 无 ahead；**profile pin 已改 `#3339116` → `#f8b2b4d`**（纯文本，未跑 `pnpm install`；pin = 本轮**代码终态提交**，其后**仅文档提交**不改变包内容） |

**库侧 git**：`~/.dsh/skills/managing-memory` 提交 `3c7c25a`（P2/P3 的 58 处指针改写 + 5 处改名 + 工具链 + 备份出库）。
**仍存的一处不一致（如实记）**：`check-version-pin` 报 `package.json 7c24283 / lock 与 .modules.yaml 3339116` ——
后者只在宿主**重新物化**（`pnpm install`）时重生成；该动作会触发宿主批量删除保护 ⇒ **宜择时手动**（报告态，exit 0）。
⇒ 宿主若不物化则**不影响当前运行**（当前运行的是已部署副本，②③④ 三层已证）。

---

## 8. 遗留与后续（已登记）

| # | 项 | 判据 / 复现 |
|---|---|---|
| **S1R-F1** | **appends 缺锚 ⇒ 详情缺口未联动**：蒸馏 `appends` 因顶层 `##` 不存在被拒（`exit 2`），而对应 `newIndex` 行仍写入（P1 前）⇒ 孤儿指针 | 审计 `distill-run` 带 `fclass:"dispatch-failed"` + `failed:N`；修法（待做）：append 失败 ⇒ 该主题的 newIndex 行不入库（或自动建顶层锚，须先定口径） |
| **S1R-F2** | 9 处**降级为文件级指针**的索引行：主题详情仍未落盘 | `check-section-refs` 现为 0（降级后不计悬空）；若要恢复精度需**建节 + 补详情**（内容须来自会话/审计，库内已无） |
| **S1R-F3** | 容量只报不拦（MEMORY 520% / AGENT 250%） | 登记事实；口径变更须单独拍板 |

---

_记录 2026-09-19 · 施工与验收：本会话自主推进（用户「目标模式全部落地」具名授权，R1）。_
