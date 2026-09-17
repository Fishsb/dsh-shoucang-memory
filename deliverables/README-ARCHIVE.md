# deliverables/ 存档说明

> 2026-09-17 · 阶段 1「清场」产物

## 这里的文件

只保留**文档（`.md`）与契约样例（`.json`）**。它们是**现行**交付物：

| 文件 | 内容 |
|---|---|
| `ui-architecture-plan.md` | UI 架构优化方案（架构为纲：判因 → 四条接缝 → 阶段 0–6） |
| `i18n-completion.md` | i18n 交付报告与验收证据 |
| `i18n-plan.md` | i18n 方案 v2.1 |
| `*-review-*.md` / `*-audit-*.md` | 历史评审与审计记录（**历史态**，勿当现行规则） |
| `panel-contract.md` | 面板 RPC 契约文档（生成物投影） |

## 移出仓外的历史原型（**未删除，可还原**）

原 `deliverables/` 下的 **355 件 / 31.4MB** 历史 UI 原型与截图已移出：

```
~/.dsh/backup/shoucang-cleanup-20260917/deliverables-proto/
```

含 `ui-redesign-v2…v9-*.html`（原型稿）· `ui-plan-a/b/c-*.html` · `arch-overview-*.html` ·
`ui-preview.html` · `v9-compare/` · 203 张 PNG 截图 · 131 个 `.txt` 采集 · 3 个 `.log`。

**为什么移出**（两条判据，均为实测）：
1. **GitHub 语言条**：这些 HTML 计入仓库「代码字节」，把 HTML 占比抬到 18%（linguist 排除
   散文与生成物后 ≈30%）⇒ 看上去像「本仓 1/3 是 HTML」，而**插件实现里没有一个 HTML 参与构建或运行**
   （产物是 `src-client/*.js ──esbuild──▶ client.js`）。
2. **扫描面负担**：`scripts/check-hardcode.mjs` 把 `deliverables` 列入 `RECORD_DIRS`，
   355 件历史件的存在使该面长期空转。

**还原方式**：把上述目录内容移回 `deliverables/` 即可；被移出的 24 件 git 跟踪文件
（17 个 HTML + 7 个 PNG）也可 `git checkout <rev> -- <path>` 复原。

**引用说明**：历史 `.md` 报告中以文字路径引用这些原型（如「对照对象：
`deliverables/ui-redesign-v9-2026-09-13.html`」）—— 那是**当时的取证记录**，非活链接；
对应文件现位于上面的备份目录。
