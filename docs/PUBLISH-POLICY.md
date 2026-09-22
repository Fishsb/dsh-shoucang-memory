# 开源仓库上传规范（PUBLISH POLICY）

> 云端 = **公开仓库** `github.com/Fishsb/dsh-shoucang-memory`。本文件回答一个具体问题：
> **哪些该传、哪些不该传。**
>
> **机检（推送前必须 PASS）**：
> ```bash
> node scripts/check-public-tree.mjs      # 公开树纯净（已登记进 check-runner）
> node scripts/check-hardcode.mjs .       # 零硬编码本机路径
> ```
>
> **⚠ 历史已重置两次（2026-09-15）**，故本文件里任何 hash 都可能已失效；**引用版本请读 profile 当前 pin**。
> 体积账：`.git` **33.05 MB → 3.83 MB**（清个人信息 + 移出 27 MB 过程截图 + `remote-tracking ref` 清掉后才 gc 得掉）。

---

## 1. 必须上传（仓库骨架 —— 传了才能 `github:` 直接安装）

| 路径 | 内容 |
|---|---|
| `src/` · `src-client/` | 源码（**唯一真源**） |
| `lib/` · `client.js` | **构建产物**（本仓惯例：产物随仓提交，使 profile 可直接从 `github:` 引用） |
| `scripts/` | 门禁 / 生成 / 单测 / 运维脚本 |
| `skill/` | managing-memory 技能本体（含 `engine/criteria.json` = **判据唯一事实源**） |
| `docs/` | 设计 · 方案 · 验收记录（**脱敏后**） |
| `deliverables/` | 设计稿 / 报告 / 架构图（`.md` `.html` `.json`） |
| 元数据 | `package.json` · `tsconfig*.json` · `CHANGELOG.md` · `README*.md` · `LICENSE` · `cordis.patch.yml` |

## 2. 禁止上传（已 gitignore，且由门 A2 机检）

| 路径 | 为什么 |
|---|---|
| `_memory/` | **私人记忆数据**（MEMORY/USER/AGENT 索引 + notes/pending/audit） |
| `docs/devref/` · `skill/docs/devref/` | 开发私有参考 |
| `AGENTS.md` · `CLAUDE.md` · `HANDOVER.md` | **本地工作约定**（含本机路径与会话指令） |
| `.env` · `*.local` · `shoucang.config.yaml` | 本地配置 / 机密 |
| `node_modules/` · `.tsbuild/` · `dist/` | 依赖与中间产物 |
| `.internal/` · `*.bak-*` · `scripts/_tmp-*` | 内部 / 备份 / 临时 |

## 3. 灰色地带（本轮实测的结论）

| 项 | 结论 |
|---|---|
| **从注入文本整段复制的记录** | 🔴 **最危险的失效模式** —— 注入文本里含**画像行**（`[身份] … 邮箱/SSH`），**复制即泄露**。本轮 8 件泄露里**最重的一件**（含邮箱）就是这么来的：取证时把 `/inject/preview` 的输出整段贴进了文档 |
| 运行日志（`*.log`） | ⚠ 易带本机路径 ⇒ 上传前必须脱敏。实测某比对日志是 **UTF-16LE** ⇒ 按 UTF-8 读会**读出乱码 ⇒ 替换落空且自检漏报**（门已按 BOM 探测编码） |
| **过程性截图** | ✅ **已移出仓库（2026-09-15）**：`deliverables/v9-compare/`（**319 件 / 27.12 MB**，UI 比对过程图）已 `git rm --cached` + 加 `.gitignore`，**本地文件保留**。因它同时存在于历史中，一并**重建历史 + gc** ⇒ `.git` **33.05 MB → 3.83 MB（-88%）**，追踪文件 **942 → 623 件**。 |
| 文档里"举例"的路径 | ✅ 不算泄露（如命令行示例里的用户目录占位、论文 URL 里形如 `/home/<dir>/…` 的路径段 —— 后者由门的 **URL 剥离**排除）⇒ 门已排除，**避免误报把门淹没** |

## 4. 生效机制

- 规则 2「推送前确认公开树纯净」此前**只是口头纪律** ⇒ 实测**因此漏了 8 件**。
- 现由 **`scripts/check-public-tree.mjs`** 机检：编码感知（UTF-8/UTF-16LE/BE）+ URL 剥离 + 反例自证。
- **教训**：**纪律不会自动执行，门才会。**

## 5. 本轮的真实泄露（如实记录，未隐瞒）

**8 个已追踪文件含个人信息，且全部已在远端公开**（最早 **2026-09-08**）。
**下表 hash 已随历史重置而失效**，保留仅为记录"当时是哪些文件"：

| 文件 | 首次进入（**旧 hash，已不可达**） |
|---|---|
| `skill/docs/archive-plugin-adaptation-plan.md` · `skill/docs/history/ADR-0007.md` | 2026-09-08 |
| `deliverables/engineering-assurance/deployment-inject-recall-fix-2026-09-11.md` | 2026-09-12 |
| **`deliverables/inject-parity-2026-09-14.md`**（**含邮箱 + SSH**） | 2026-09-14 |
| `deliverables/ui-audit-report-2026-09-13.md` · `deliverables/v9-compare/w8-verify.log` | 2026-09-14 |
| `docs/architecture-landing-plan-20260914.md` · `docs/library-supply-chain-rework-2026-09-14.md` | 2026-09-14 |

**处置（两步，缺一不可）**：

1. **当前版本脱敏**（15 处：邮箱、用户目录、系统临时目录）；
2. **历史重置**（2026-09-15）—— 将全部历史**压缩为单个提交** + `--force` 推送 ⇒ 旧提交**不可达**。
   同时处理 **author 邮箱**（`git config user.email` → GitHub noreply）—— **只清文件不换 author 等于白清**。
   旧历史备份于**仓外** `~/.dsh/backup/shoucang-full-history-pre-scrub-*.bundle`。

⚠ **残余风险**：GitHub 侧旧对象可能**短期仍可经 API/缓存访问**，且仓库已公开 7 天、**可能已被抓取或镜像** ⇒
重置能阻断**继续**暴露，但**不保证消除已有副本**。

---

## 6. 第二轮：**源码里的真凭据串**（2026-09-21 · 自查发现）

**性质与前一轮不同**：上表 8 件是**个人信息**（邮箱/路径），本轮是**一条真凭据载荷**在**公开源码里**。

| 面 | 事实（逐条实测） |
|---|---|
| **是什么** | `scripts/test-secret-redact.mjs`（**公开树**）的凭据脱敏测试夹具里，有**完整的 `sk-` + 64 位 hex 载荷**，注释自标「**本库实盘形态**」⇒ 按字面即"能用的 key 形态"。 |
| **最反讽之处** | **同一文件紧邻的下一行注释**（2026-09-17 加）原文写着：「**夹具须在运行时拼接，源码里不得出现完整凭据串**」——**教训写下了，却没回头检查写下它的那个文件本身**，而它自己就是**唯一没拆**的那条。 |
| **范围（跨历史统计）** | 4 种形态、各命中 **101–102 / 155 个提交**（`sk-` 全长 · 裸 hex · 后半段 40 位 · 空格式片段）。 |
| **处置（三步）** | ① **当前版本**：全部改**拆片拼接** + 夹具换**合成 payload**，并把「首 6/末 4」「后 40 位」等**写死的真片段断言**改为**从夹具现算**（否则断言自己就是泄露源）② **历史重写**（`filter-branch --tree-filter` + 本机 `sed`）③ **删 `refs/original` + `reflog expire` + `gc --prune=now`**，最后 `--force-with-lease` 推送。 |
| **判据（实测）** | 重写后 **新史 0 命中 / 155 提交**（提交数**守恒**）· `git fsck --full` 无错 · 树 **928 件**完整 · `test-secret-redact` **35 项 PASS** · 远端 `origin/master` 拉回后**再核仍 0 命中**。 |
| **备份** | 仓外 `~/.dsh/backup/shoucang-history-pre-rewrite-*.bundle`（`git bundle verify` = complete）· 另有 pre-scrub2/3 两份更早快照。 |
| ⚠ **残余风险（与上一轮同）** | 旧提交**曾在远端公开**（约 6 天）⇒ 阻断**继续**暴露，**不保证**已抓取/镜像的副本消失。**若该 key 是真凭据，应当轮换**——此事须用户判定（**我不掌握它是否真在用**）。 |
| ⚠ **本机工具前提（记档）** | 本机**无** `python`/`perl`/`sed`（PATH 上）；`filter-branch` 的 tree-filter 需要 shell ⇒ **用 git 自带的 `C:\Program Files\Git\usr\bin\{sh,sed}`**（把该目录临时加入 PATH）。⚠ 另踩一坑：**PowerShell 重定向会把文件写成 UTF-16/BOM**，导致 `sed` 匹配不到 —— 验证脚本须用 **node 直接读写**（`execFileSync('git',['show',…])`），不要用 `>`。 |

_建立 2026-09-14 · 与 `scripts/check-public-tree.mjs` 成对；规则 2 的机检实现。_
