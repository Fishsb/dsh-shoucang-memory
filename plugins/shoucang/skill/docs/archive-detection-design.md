# 会话归档检测机制设计（archive-detection，v1）

> 参照：守藏 idle-review（静默定时器+资格门控+fork 子代理+四操作裁决+G30 证据核验）与 mnemon 空闲复盘子代理触发（coordinator）。
> 目标：历史/静默会话自动走归档检测（增量召回候选→pending），不污染记忆、不膨胀技能。

---

## 一、四要素实现

### 1. 超时判定（静默检测）
- **窗口**：`TS_SILENT = 780s`（13 分钟；守藏 600s 放宽，覆盖长思考/跨越边界）
- **起算**：会话最后一次 `turn/end` 结束时刻
- **重排**：窗口内出现新 turn（用户继续对话 / agent 新任务）→ 取消并重排定时器（守藏实测教训：活跃会话天然不触发，正确行为）
- **资格门控**（防刚开会话就归档）：`turn 数 ≥3 且 行数 ≥50` 才进入归档检测；活跃自动化会话（消息间隔 < 阈值）永不触发
- **检查执行者**：agent 侧规则协议（每 turn 结束时自查；不修改宿主、不加宿主定时器）

### 1.5 计时器与膨胀控制（v1.1 修正，回应用户三问）
- **零每会话 Timer**：不维护 N 个 setTimeout（373+ 会话会膨胀）——只存 per-session **最后活动时间戳**（archive-progress 每会话一行 `lastActiveAt`）
- **触发 = 惰性检测点**（无常驻 Timer）：① 会话初始加载时 ② 任务收尾时（并入收尾清单）③ 手动 `archive-check <sessionId>`
- 若需自动性 → **单个全局低频率调度器**（每分钟扫全部 mark 找静默超标者，O(1) Timer 而非 O(N)）
- **触发后清理 = 完成态标记**：`{"sessionId","lastRow":N,"total":N,"done":true}` —— 惰性扫描跳过 done 会话
- **重启再触发 = 数据驱动**：会话重启/继续 → 转录追加新行 → `total(新) > lastRow` 使 done 自动失效 → 下次检测点从 lastRow+1 增量恢复检测；**与 Timer 是否清理无关**

### 2. 增量检测（行号标记）
- **基准**：会话转录 = `~/.dsh/sessions/**/<sessionId>/session.jsonl.zstd`，解压后按行计数（每行一条事件，append-only，行数单调增）
- **标记**：`archive-progress.jsonl` 记录该会话已处理到的行号 `lastRow`（新会话从 0 起）；行结构含 `{sessionId, lastRow, total, done, lastActiveAt, at}`
- **增量范围**：触发时 `start = lastRow + 1`，分析 `(start, total]` 新增行；避免全文档检测（解压成本固定，分析成本随增量）
- **容错**：损坏/解压失败 → mark 到最后一个可解析行，跳过异常区
- **会话重启**：历史会话被再次打开/继续 → 转录追加新行 → 再次触发从上次 lastRow 增量继续

### 3. 日志绑定
- 关联键：**sessionId**（转录目录名；唯一、稳定）
- 日志文件：`audit/archive-progress.jsonl`，**每会话仅最后一条有效（upsert by sessionId）**
- 行结构：`{"sessionId":"<id>","lastRow":17034,"total":17045,"at":"<ISO>"}`
- 工具：`scripts/archive-mark.mjs <sessionId> <lastRow>`（upsert）；`scripts/archive-check.mjs <sessionId>`（读 mark + 解压转录 → 输出增量范围与候选召回片段）

### 4. 存储约束（不污染记忆系统）
| 数据 | 位置 | 性质 |
|---|---|---|
| 归档进度日志 | `audit/archive-progress.jsonl` | 运行数据，**非记忆**（health 不扫 audit\，不计容量） |
| 召回候选 | `pending/` | 既有候选通道（非权威、不计容量），固化仍走四问+write_gate |
| 正式记忆 | MEMORY/USER/AGENT/notes | 仅经审计固化写入，本机制**不直接写** |
| 决策留痕 | `pending/` 候选文件头部 | 含裁决标记，审计可见 |

> 硬约束：本机制任何日志/标记文件不得进入 `notes/`、`MEMORY.md`、`USER.md`、`AGENT.md`；候选一律落 `pending/` 等待审计四问（守藏"产物经 write_gate 唯一写入口"同构）。

---

## 二、执行流程（fork 子代理模式）

```
每 turn 结束（agent 自查静默窗口）
   └─ 超时(780s) 且 资格门控通过
        └─ fork「archive-review」子代理（prompt 自足：sessionId、转录路径、增量范围、裁决规则）
            ① archive-check.mjs <sessionId> → 增量行 + 信号词召回片段
            ② 逐候选裁决（对齐守藏四操作）：
                 ADD      → 无相似 → 新候选（拟标签/日期）写入 pending/
                 NOOP     → 完全重复（pending 或记忆已覆盖）→ 跳过
                 MERGE    → 局部补充 → 并入 pending 同主题文件
                 SUPERSEDE→ 矛盾/过时 → 不落 pending，备注理由
            ③ archive-mark.mjs <sessionId> <lastRow>   ← 更新进度（证据：行号+文件）
            ④ 向父会话汇报：候选数/裁决表/理由
   └─ 候选固化：随下次周期审计四问 → write_gate 入册或删除（既有管道）
```

与守藏 idle-review 映射：静默定时器+重排 = ①；资格分门控 = 资格门槛；fork 子代理 = fork archive-review；四操作裁决 = ADD/NOOP/MERGE/SUPERSEDE；G30 证据核验 = archive-mark 行号+文件证据；产物 write_gate 唯一入口 = pending→审计固化。

---

## 三、边界与反模式（明确不做什么）

- ❌ 不修改宿主/不建宿主级定时器（agent 侧自查协议）
- ❌ 不自动固化记忆（候选必须过四问/审计——召回自动、入册判定不变）
- ❌ 不在会话活跃时触发（静默窗口+重排，自动化会话天然不触发——守藏验收实证）
- ❌ 日志与候选不写入正式记忆文件（见存储约束）
- ✅ sessionId 失效/转录不存在 → 优雅跳过并清理该 mark

---

## 四、落地清单（待确认后执行）

1. `scripts/archive-check.mjs`（读 mark + 解码 zstd（复用 fzstd 用法）→ 增量行 + 信号召回）
2. `scripts/archive-mark.mjs`（upsert `audit/archive-progress.jsonl` by sessionId）
3. SKILL 新增协议（§9 后或 §10）：静默窗口/资格门控/fork 触发/裁决规则/存储约束
4. 子代理 prompt 模板（裁决规则内嵌，参考守藏四操作）
5. test 扩断言（mark upsert / check 增量范围）/ health 不扫 audit\ 已有 ✓ / CHANGELOG / 同步 GitHub 框架