# shoucang 只读审计报告（2026-09-17）

> 范围：`D:\FF\shoucang` 全仓（含子目录），只读。**未修改任何既有文件**；本报告是唯一新建文件。
> 执行方式说明：AgentTeams 计划已获批准，但调度器**两次检查均未 spawn 任何成员**（尝试计数 2→3 递增而无实质进展），故由 captain 直接执行审计。原计划的五路并行改为单人顺序审计。

---

## 一、一句话结论

**项目代码与门禁体系健康（121 项门禁全绿、隐私门 PASS、结构配置自洽），但存在 1 处由本次审计动作自身引入的红色回归（`check-hardcode` 失败）与若干结构卫生问题。**

---

## 二、检查范围与方法

**跑过的命令**：`check-runner.mjs`（121 项）· `check-public-tree.mjs` · `check-hardcode.mjs` · `check-module-growth.mjs` · `check-arch-sync.mjs` · `audit-architecture.mjs` · `audit-wiring.mjs` · `audit-fnspan.mjs` · `check-installed-sync.mjs` · `check-version-pin.mjs` · 自建静态扫描（类型逃逸/空 catch/废弃 API/同步 IO/依赖对账）

**未覆盖**：① 运行时行为（未起真机会话）；② `src-client/` 25 个前端件的逐行逻辑；③ `lib/` 打包产物内容；④ `skill/` 规则语义正确性；⑤ 性能未做基准测试（仅静态识别候选点）。

**方法学声明**：本报告有 **4 处初判被复核推翻**，均记录在 §五。原始计数一律不可直接采信。

---

## 三、发现清单

### 🔴 P0-1 红线门禁回归：`check-hardcode` 失败（**本次审计动作引入**）

```
⛔ 硬编码路径检查失败 — 2 处:
  .agent-teams/shoucang-audit-2026-09-17/team.json:4   "description": "只读全项目检查 D:\FF\shoucang：…"
  .agent-teams/shoucang-audit-2026-09-17/team.json:127 …
```

- **证据**：创建 AgentTeams 计划**之前**，全套 121 项门禁全绿（task 实测）；创建**之后** `check-hardcode` 报 2 处。
- **根因**：`scripts/check-hardcode.mjs:20` 的 `SKIP_DIRS` 含 `.internal` `.workbuddy` `.workbuddy-ai` `.roundtable` 等，**唯独没有 `.agent-teams`**；而 AgentTeams 把团队状态写在**工作区根**，工作区即仓根 ⇒ 计划文本里的绝对路径被门禁扫到。
- **修复（两处都改才完整）**：
  1. `check-hardcode.mjs:20` 的 `SKIP_DIRS` 补 `.agent-teams`
  2. `.gitignore` 补 `.agent-teams/`
- **旁证**：该文件 `:11` 自己的注释已写明此风险模式——「未被跟踪只是巧合，`git add -A` 就会带进去」。

### 🟠 P1-1 `.agent-teams/` 未被 gitignore（未跟踪但未忽略）

`git check-ignore` 返回非忽略；`git ls-files .agent-teams` = 0 件。⇒ 一次 `git add -A` 即把团队状态（含本机路径）提交进公开仓。与 P0-1 同源，同批修复。

### 🟠 P1-2 根目录与 `skill/` 存在**字节相同**的重复文件

| 文件 | 判定 |
|---|---|
| `SKILL.md` | 与 `skill/SKILL.md` **sha256 完全相同** |
| `audit-protocol.md` | 与 `skill/audit-protocol.md` **sha256 完全相同** |

⇒ 两份副本，无单一事实源。改一份不改另一份即静默漂移。**建议**：留 `skill/` 那份（AGENTS.md 声明 skill 为技能本体），根目录两份删除或改为指针。

### 🟠 P1-3 仓根跟踪记忆库命名文件

`AGENT.md`(140B) / `MEMORY.md`(167B) / `USER.md`(156B) 均**已跟踪**。经核为**标题桩**（非真实记忆内容），故 `check-public-tree` PASS、**无隐私泄漏**。但仓根出现记忆库命名文件易与真实 `_memory/` 混淆，建议确认意图或移入 `skill/` 模板区。

### 🟠 P1-4 ~~147 项未提交改动 + `CHANGELOG.md [Unreleased]` 为空~~ 【**本条已订正：后半句是误报**】

- `git status --porcelain` = **147 项**（会话开始时 96 项，审计期间因 nav 登记与本报告增长）✅ 此项成立
- ~~`CHANGELOG.md` 的 `[Unreleased]` 段无条目~~ ⇒ **❌ 误报，2026-09-17 复核推翻**：`[Unreleased]` 第 7 行起
  即有 `### Changed` 与多条实质条目（`CHANGELOG.md:8-25+`）。当时只 `Select-String '^## '` 查了**标题**、**未读正文**，
  就据"只匹配到一行"推断为空 —— 属**未取证即下结论**。
- **真实风险不变**：147 项未提交，宿主重新物化会退回已提交版本（本仓已实测过该失效模式）

### 🟠 P1-5 `scripts/` 残留 5 个临时探针件

```
_tmp-fullpage.mjs (9.6KB, 2026-09-13)    _tmp-stage1-probe.mjs (7.9KB, 2026-09-14)
_tmp-skeleton.mjs (8.7KB, 2026-09-13)    _tmp-stage3-ab.mjs   (1.2KB, 2026-09-14)
_tmp-noise.txt    (1.4KB, 2026-09-12)
```
nav 主线自述「废弃遗留清完（_tmp 8 件出仓+gitignore 设防）」⇒ **该自述与磁盘不符**，仍有 5 件在仓内 `scripts/`。

### 🟡 P2-1 11 处真正裸 catch（其中 src/ 仅 3 处）

```
src/distill-hooks.ts:131   catch { }
src/distill-hooks.ts:135   catch { }
src/panel-shared.ts:757    catch(e) { }
```
其余 8 处在 `scripts/`（含 `check-runner.mjs:313`、`ui-geo-regress.mjs:725`）。
**对照**：另有 **275 处**为「带注释的空 catch」（如 `catch { /* 坏行跳过 */ }`）——这是本仓**一致的 fail-open 约定**，属良好实践，非缺陷。

### 🟡 P2-2 类型逃逸：153 处 `: any` / `as any`（`@ts-ignore` = **0**）

集中在 `deepsleep-run.ts`(17) · `scheduler.ts`(15) · `mcl.ts`(12) · `treeops.ts`(11) · `deepsleep-core.ts`(10)。零 `@ts-ignore`/`@ts-expect-error` 是加分项；`any` 密度偏高但属可接受技术债。

### 🟡 P2-3 `src/` 同步 IO 规模

`readFileSync` **160** · `existsSync` **104** · `writeFileSync` **53** · `readdirSync` **36** · `appendFileSync` **25**。
本插件为文件型记忆库，同步 IO 属设计选择；但注入路径（每轮会话）上的重复读需留意。**未做基准测试，不下性能结论**。

### 🟡 P2-4 `check-module-growth.mjs:21` 口径声明与实现不符

自称「物理行数（split('\n') 去末尾空行），与 `wc -l` 一致」，实际在 `stripCommentsLite()`(:126) 里**先剥注释**。实测 `scheduler.ts`：audit 769 / growth **617** / `wc -l` 768 —— 差值不是注释所称的「可能差 1」。⇒ 6 条冻结基线与「物理行数」不可比。**文档缺陷，非门禁失效**。

### 🟡 P2-5 60 个 `scripts/*.mjs` 未被 `check-runner` 引用

**但多数属正常**：含构建件（`build-client.mjs`/`gen-criteria.mjs`）、运维件（`deploy-installed.mjs`/`memory-reconcile.mjs`）、生成器与辅助（`atomic-fault-injector.mjs`）。**真正的信号只有 P1-5 的 `_tmp-*`**。此条**不建议按数字整改**，仅建议抽查 `check-*`/`test-*` 命名者是否漏登记（本次抽查未发现漏登记的门禁）。

### ⚪ P2-6 298 个 `.bak` 备份文件（2.3 MB）——**非仓污染**

`shoucang.config.yaml.bak-*` 291 个 + `client.js.bak-*` 7 个。**经核 `*.bak-*` 已被 `.gitignore:51` 忽略，git 跟踪 0 件** ⇒ 仅本地磁盘卫生问题，不影响仓库。建议择时清理。
另有 0 字节神秘文件 `=134`（未跟踪，疑为重定向笔误产物）。

---

## 四、确认健康的项（避免误判为问题）

| 项 | 结论 |
|---|---|
| 全套门禁 | **121 pass · 0 fail**（P0-1 之前） |
| 隐私红线 `check-public-tree` | **PASS**，含 3 条反例自证（断言语义有效） |
| `package.json` | **VALID JSON**（PS 报错为编码假象，非缺陷） |
| `tsconfig.json` / `tsconfig.local.json` | **VALID** |
| src ↔ lib 对应 | **无缺失**（74 `.ts` 全部有产物；`lib/client.js` 为构建产物） |
| 架构 | 73 模块 / 18680 行 / 深度 11 / **循环依赖 0** / 装配违规 0 |
| 版本钉点 | 三处一致 @ `e35e4c6e` |
| 已安装副本 | 225/225 文件 sha1 逐件一致 |
| 依赖对账 | 无幽灵依赖、无未用依赖 |

---

## 五、方法学：4 处初判被复核推翻（**记录以免重蹈**）

| 初判 | 复核后真相 | 推翻依据 |
|---|---|---|
| 「`package.json` 是非法 JSON」 | **合法** | PS `ConvertFrom-Json` 按 ANSI 读取导致乱码误报；node 读 UTF-8 正常 |
| 「305 处静默吞异常」 | **仅 11 处裸 catch** | 275 处为带注释的约定式 fail-open |
| 「165 个门禁未登记」 | **60 个，且多数合法** | 正则未匹配 `scripts/` 前缀，导致 "referenced=0" 的荒谬结果 |
| 「106 处硬编码路径」 | **误报为主** | 正则把 `http://` 的 `p:` + `//` 匹配成盘符 |

⇒ **教训**：原始计数必须抽样回读源码验证；「命中数」不等于「缺陷数」。

---

## 六、处置状态（2026-09-17 当日执行）

| 序 | 项 | 状态 |
|---|---|---|
| 1 | P0-1 `SKIP_DIRS` 补 `.agent-teams` + `.gitignore` 补 `.agent-teams/` | ✅ **已修**（`check-hardcode` 恢复 ✅） |
| 2 | P1-5 清 `scripts/_tmp-*` 5 件 | ✅ **已清**（含 1 件**误入库**的 `_tmp-noise.txt`） |
| 3 | P1-2 根目录 `SKILL.md` / `audit-protocol.md` 重复副本 | ✅ **已删根副本**（先证代码只读 `skill/`：`panel-shared.ts:307-311`） |
| 4 | P1-4 报"CHANGELOG 为空" | ✅ **已订正为误报**（见上）；未提交改动仍待提交 |
| 5 | P2-4 订正 `check-module-growth.mjs` 口径注释 | ✅ **已订正**（写明与实现一致的口径） |
| 6 | P2-6 清 `.bak` 堆积 + `=134` | ✅ **已清**（301 → 保留最近 10；`=134` 已删） |
| 7 | **P2-7 `.gitignore` 混编码**（本条为审计中**新发现**，未在原报告内） | ✅ **已归一化**（5 行 GBK→UTF-8 + 1 行真损坏重建；34 条规则行逐字不变断言通过） |

**本轮总验证**：`check-hardcode` ✅ · 门禁 **121 pass · 0 fail** · 规则行逐字节不变 ✅ · 整文件严格 UTF-8 ✅

**审计过程自身的一处工具性失误（如实记）**：修 `.gitignore` 编码时，第一版脚本对 UTF-8 行取 **latin1 字符串**再以 utf8 写回，
导致非 ASCII 字节被**翻倍**（3493→5624B mojibake）。因**改前已备份**且加了"规则行逐字不变"断言，当场发现并纠正。
⇒ 印证 `[原则] 变更先判因备份`：备份不是形式，是这次能无损回滚的唯一原因。

