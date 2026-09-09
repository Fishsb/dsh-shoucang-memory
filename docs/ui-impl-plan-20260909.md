# shoucang UI 完整落地方案（结合架构 · 施工图）

> 性质：**实施施工图**（承接 ui-design-20260909.md 设计意图 → 具体文件/函数/端点/数据结构/验收）。
> 对齐架构：模块归属=SC-M02(panel) + SC-M03(memory-skill 写门)；token/效率硬约束=所有新增端点**只读展示不注入**（零 token 增量），写操作全走既有门禁。
> 约束：不破坏画像/记忆板块结构与 sc-* 样式语言；允许优化细节与增加。
> 文档链：ui-design（设计）→ 本文（施工）→ settings-guide（用户文档）。

## 0. 架构对齐说明

| 架构层 | 本文改动归属 | token/效率影响 |
|---|---|---|
| M8 注入 | 零改动（热记忆注入不动） | — |
| M4 召回 | vec.ts 加轻量运行态统计（内存，不入库） | 0（仅读） |
| M2/M3/M5 | panel 新增写端点（编辑/批准/删除，走 write_gate/memory-append） | 写操作用户显式触发 |
| M9 向量 | /vector/status2 端点 | 0（只读状态） |
| M10 自省 | 不变 | — |
| SC-M02 UI | client.js 各视图追加区块 | 展示端点 0 token |

## 1. 后端新增（panel.ts + vec.ts）

### 1.1 vec.ts：运行态统计（轻量内存，供展示）
```ts
// vec.ts 尾部新增
export const vecStats = { queries: 0, lastMode: 'lexical' as 'lexical'|'fusion', lastMs: 0, lastQuery: '', lastHit: '' }
// recallRanked 返回前：vecStats.queries++; vecStats.lastMode = mode; vecStats.lastMs = Date.now()-t0;
```
- 需要把 recallRanked 开头加 `const t0 = Date.now()`，返回前更新（3 处 return 统一在尾部记录或包一层）。

### 1.2 panel.ts：新端点（route 注册区追加，全部在既有 `route(...)` 模式内）
| 端点 | 方法 | 返回/行为 |
|---|---|---|
| `GET /vector/status2` | GET | `{ cfg: {enabled,baseUrl,model}, provider: 'DmlExecutionProvider'|'cpu'|'cloud'|'off'（探测 9915 health）, cacheLines, cacheKB, stats: vecStats }` |
| `GET/POST /embed/config` | GET+POST 合并 handler（同 /deepsleep/config 模式，避免宿主按路径去重崩溃） | GET= running+persisted；POST 校验写 scheduler.json（键 embedEnabled/embedBaseUrl/embedModel） |
| `POST /memory/edit` | POST | body `{file, line(原文), newText}` → 读文件→全量替换该行→write_gate→rename（失败回滚）。白名单 file∈{MEMORY,USER,AGENT,notes/7件} |
| `POST /memory/remove` | POST | body `{file, line(原文)}` → 读→删该行→write_gate→rename。加确认（前端 confirm） |
| `POST /memory/approve` | POST | body `{pendingFile}` → 读 pending→按候选头写 notes/索引（复用蒸馏裁决格式简化：仅追加 notes 教程式）→ 移 .processed |
| `POST /memory/preview` | GET | `{text: buildHotMemoryText()}` 已有 /inject/preview 复用即可，不新增 |

- 写门复用：`runNode(nodeBin, memoryLibRoot()+'/scripts/memory_write_gate.mjs', [file, tmpPath], {env:{MEMORY_ROOT}})`（distill.ts 同款）；panel 需新增 runNode async helper（execFileSync 同步版亦可，写操作用户触发可接受）。
- 全部写操作：备份先行（write_gate 内部已备份 audit/backup-*；edit/remove 前端 confirm）。

### 1.3 overview 追加字段（供 §7/§8/§9 展示）
`/memory/overview` 响应追加：
- `vector: { cacheLines, cacheKB, stats: vecStats }`（与 /vector/status2 同源，省一次轮询——直接并入 overview）
- `delta: { present, staleAt, rows }`（读 suite/knowledge/delta.md）
- `weekDiff: { added: [...], removed: [...], updated: [...] }`（从 distill-audit+growth 聚合近 7 天 [原则]/[路径] 增删）

## 2. 前端新增（client.js，全部复用 sc-* 体系）

### 2.1 顶栏状态徽章组（3.1）——记忆板块外新增最小 nav 段
```
位置：renderMemoryExpanded 与 renderPersona 均可读 overview → 在 sc-nav 下方或 §0 追加徽章行
结构：<div class="sc-ds-badges">（复用）+ 语义色 dot
  · 蒸馏 [idle|ing|done N]  · 向量 [fusion|lexical|off]  · pending N  · 深睡 [态]
数据：overview.distillStats + overview.vector + overview.pending + deepSleep 状态
```

### 2.2 记忆板块追加 §7/§8/§9（renderMemoryExpanded 函数尾部 append，不碰 §1-§6）
- §7 向量状态：`mkStat('向量 mode', ...)` × 3 卡 + 命中示例 sub（复用 sc-mem-grid）
- §8 delta：存在才渲染——group('最近成长 delta') + sc-mem-sub 行（含剩余有效期）
- §9 周 diff：group('本周成长') + 增/删/改各 sc-idx-row 清单（复用 sc-idx-list）

### 2.3 pending 审核动作（§4 增强）
- pending 行尾加两个 subtle 按钮：`批准`（POST /memory/approve）/`忽略`（移 .processed）
- 批准后刷新本视图

### 2.4 notes 反链聚合（§5 增强）
- 详情页 renderNoteSections 顶部追加「引用此小节」清单（扫描三索引+notes 内 `§同名` 出现行，后端 /memory/sections 已返回 rel，新增查询或前端本地扫——**后端做**：sections 响应加 `backrefs: [{file,line}]`）

### 2.5 画像编辑（renderPersona）
- 指针行右侧加 subtle「编辑」按钮 → 弹行内编辑（textarea 原文）→ 保存 POST /memory/edit
- 不破坏行结构（按钮 append 到行尾，用既有 sc-btn.subtle）

### 2.6 参数调节「向量与模型」节
- V-1 向量开关 toggle（POST /embed/config）
- V-2 provider 下拉（本地 bge-m3 / 云端，选云端显示 baseUrl/model/key 输入）
- V-3 蒸馏模型下拉（GET /model/list 或 llm 枚举）

## 3. 样式（新增类最小集，不动既有）
| 新类 | 用途 | 复用基础 |
|---|---|---|
| `.sc-badge-row` | 顶栏徽章容器 | sc-ds-badges |
| `.sc-evid-tag` | 证据链判据标签 | sc-tag |
| `.sc-diff-add/.del/.upd` | 周 diff 色 | sc-idx-tag 变体色 |

## 4. 数据流（每功能）
```
§7 向量状态：panel GET /vector/status2 → vec.ts vecStats + 缓存 stat + 9915 health
§8 delta：overview.delta ← readFile(delta.md)
§9 周 diff：overview.weekDiff ← distill-audit 聚合
编辑/批准：client → POST /memory/edit|approve → panel runNode write_gate → rename → 前端刷新
反链：client sections → panel 扫 backrefs → 渲染
```

## 5. 实施批次与验收（每批独立提交+热重载验证）

| 批 | 改动文件 | 验收 |
|---|---|---|
| U1 | vec.ts stats + panel /vector/status2 + /embed/config | ✅ 2026-09-10：curl status2=DmlExecutionProvider/cache37；embed/config 写回落盘 |
| U2 | panel /memory/edit|remove|approve + runNode helper | ✅ 2026-09-10：edit 改→还原实证、remove 404 安全、approve 双区实证 |
| U3 | panel overview 追加 vector/delta/weekDiff + sections backrefs | ✅ 2026-09-10：overview delta/vector/weekDiff 实证；sections backrefs=4 |
| U4 | client 记忆板块 §0 徽章 + §7/§8/§9 | ✅ 2026-09-10：语法 OK、部署一致；画像/记忆核心结构零改动实证 |
| U5 | client pending 批准/忽略 + notes 反链 + 画像编辑 | ✅ 2026-09-10：三功能代码在位+语法 OK |
| U6 | client 参数「向量与模型·当前链路」节 | ✅ 2026-09-10：embedEnabled 开关写回实证 |
| U7 | settings-guide/ARCHITECTURE 同步 + CHANGELOG | ✅ 2026-09-10：文档同步+nav 对齐；截图回归降级为结构一致性（无视觉代理） |

每批纪律：typecheck → build → build:client → lib 同步部署位 → dev_reload_package → 实证（curl/截图）。

## 6. 风险与对策
| 风险 | 对策 |
|---|---|
| write_gate exit≠0 导致编辑失败 | 前端显示 gate 原因；写操作全部先备份 |
| 新增 overview 字段使响应变大 | 仅追加标量+最近若干行（≤1KB），不进注入面 |
| 宿主按路径去重（GET+POST 拆开会崩） | /embed/config 合并 handler（同 /deepsleep/config 注释） |
| 反链扫描开销 | 仅 notes 详情打开时扫一次（7 文件 grep），非轮询 |

## 7. 明确不做
- 不改注入逻辑（M8 零改动）· 不做全库图谱 · 不做常驻 AI 聊天 · 不重排既有分区

---
_建立 2026-09-09；依据：panel.ts 26 端点实查 + client.js 70 类/18 helper + write_gate/memory-append 宿主调用模式 + vec.ts 现状 + ui-design 10 规律_
