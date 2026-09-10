# ARCHITECTURE.md — shoucang 记忆子系统架构（对齐 2026-09-09）

> 状态：2026-09-09 用户拍板「对齐 + 向量默认启用 + 控制实际使用效率与 token 消耗」后定稿。
> 性质：架构文档（开发主地图）。代码变更后按指纹过期重生成；本文档是「当前架构长什么样」的唯一权威叙述。
> 上层参照：DSH 内核（L0）不在此文档范围——本文只描述 **shoucang 在 DSH 地基上的记忆/自我子系统**。

## 1. 设计约束（用户拍板，优先级从高到低）

1. **实际使用效率 + token 消耗是唯一硬约束**：一切设计取舍的目标是「在尽量不降低实际使用效果的前提下省 token」。
2. **部署难度、插件复杂度、电脑性能占用可放宽**：不因复杂/重而拒绝方案（本地模型/服务/多模块均可接受）。
3. **质量为先**：模型/机制选择在性能允许内取质量档（如嵌入用 bge-m3 1024d 而非小模型）。
4. **零硬编码本机路径**（开源红线）· **隐私红线**（_memory 不入库）· **跨工作区红线**（项目事实不落全局库）。

## 2. 分层（在 DSH L0 地基之上）

```
L0 DSH 内核（不动）：agent-loop / session 事件溯源 / 压缩 / 沙箱 / goal / subagent —— 见 DSH 官方文档
L1 shoucang 记忆/自我层（本文档主体）
L2 认知执行（preset + task-protocols 人化循环）
L3 能力层（工具注册 / MCP / skills）
L4 交互（DSH Web GUI）
```

## 3. L1 模块划分（当前实现）

| 模块 | 载体 | 职责 | 效率设计 |
|---|---|---|---|
| **M1 画像** | `AGENT.md`(自)/`USER.md`(人) | 自我认知+用户认知，会话注入 | 薄行指针（非正文）；容量画像 3000/3000 · 记忆 5000 |
| **M2 情景** | `audit/episodes.jsonl` | 任务发生+结果（同类判定数据源） | 轻行 {sid,intent,route,outcome}；上限 256 淘汰 |
| **M3 经验** | `notes/*.md` 索引行 | 泛化知识，按需懒展开 | 索引=指针；详情 read_section 按需 |
| **M4 召回** | `shoucang_recall` + `recallApprox` | 任务前查经验 | 词法地板（0 依赖）；零命中给主题地图 |
| **M5 转正** | `pending/flow-candidates/` | 候选→[路径] 数据源 | intentTokens 指纹同型聚合 + 跨会话计数 |
| **M6 蒸馏** | scheduler.ts 事件驱动 | 会话结束沉淀 | idle≥10min + minTurnChars 200 + 预筛信号词（零 LLM 成本跳过） |
| **M7 深睡** | distill.ts FSM | 停滞≥3h 归纳 [原则]/[路径] | 窗口痕迹预算 12000+18000；done 才推水位 |
| **M8 注入** | panel.ts buildHotMemoryText | 会话开头热记忆 | 预算 3000 字符；delta 预留字节 |
| **M9 向量** | vec.ts `recallRanked` | 语义召回（融合） | 见 §5 |
| **M10 自省** | `assistant_capabilities` | 能力面查询 | 只读，无 token |

## 4. token/效率预算（可观测基线）

| 环节 | 预算 | 设计意图 |
|---|---|---|
| 会话注入 | ≤3000 字符（三索引薄行+画像） | 常驻有界，不随库增长膨胀 |
| 蒸馏触发 | idle≥10min + 增量≥200 字符 + 预筛信号词 | 零 LLM 成本跳过（无信号=不唤醒子代理） |
| 蒸馏材料 | 增量 ≤24000 + 候选 ≤12000 字符 | 子代理单次裁决有界 |
| 深睡材料 | pending ≤2500/文件、notes ≤6000/文件、notes 总 ≤18000、候选 ≤2400 | 多工作区公平 + 预算有界 |
| 深睡频率 | 停滞 ≥3h 才触发 | 离线低频巩固，不进交互热路径 |
| 召回 | topK≤3 薄行；详情按指针懒展开 | 检索结果不落全文进上下文 |

**注入恒有界**：三索引行数受容量红线（字符数）约束 → 注入字节稳定 → 前缀缓存热。此即「画像指针 + 多层设计」省 token 的核心机理。

## 5. 向量召回（M9，2026-09-09 默认启用 · 本地免 token）

- **Provider（2026-09-11 更替）**：缺省 = **Ollama `http://127.0.0.1:11434/v1` + `bge-m3`**（官方库 1.2GB，多语言 1024d，OpenAI 兼容 `/v1/embeddings`，本机免 key）——Ollama 自身随登录自启，**不再需要 nssm 或任何服务管理器**。原路线为自建桥（Xenova q8 + onnxruntime-directml 的 `bge-m3-openai-server-gpu.py`，nssm AUTO_START :9915；服务已随 nssm 卸载停止，**但模型资产仍在 `D:\AI\models\bge-m3`（`onnx/model_quantized.onnx` 543MB）——2026-09-11 检查期以 9916 端口实测 2 秒可起、`/health` 返回 `{ok,model:bge-m3,dims:1024}`，随时可恢复**）——插件侧的「本机端点」判定已泛化为**任意 127.0.0.1/localhost 基址**（探测 `/health` → `/v1/models` → `/api/tags`），故自建桥 / LM Studio（:1234）/ 云端 OpenAI 兼容端点只需改 `embedBaseUrl`/`embedModel`/`embedApiKeyEnv`。零 token、离线；Ollama 常驻显存约 1GB（`OLLAMA_KEEP_ALIVE` 控制）。
- **融合**：词法 top≥8 打底 → 行向量惰性补齐 → dense topK → **dense 0.7 ⊕ lexical 0.3**（min-max 归一）；**词法打底空 → 全量索引薄行池 dense 检索**（语义相似措辞不同的价值场景，不因词法空而漏召）。
- **token/效率账**：每查询嵌入 ≤48 候选行 + 1 查询（本地零 token）；行向量缓存 `.vector-cache.jsonl`（行 hash 惰性增量）→ 冷启（含模型加载）实测 **3.5s**、模型已载时 **~120ms/查询**。
- **降级闭环**：provider 不可用/超时/失败 → 自动降级纯词法，闭环不中断（本机端点超时上限 30s、云端 8s——本地冷启动含模型加载，8s 会误判）。
- **模型选择说明**：现行 = Ollama 官方库 `bge-m3`（1.2GB，自带量化）；原自建桥用 q8（= 原 cjs 服务 dtype 配置）。嵌入模型 int8 检索损失 <5%（[HF 量化](https://huggingface.co/blog/embedding-quantization) 实证 94-100%），质量/资源/速度平衡良好。
- **缓存非事实源**：行文本是权威，`.vector-cache.jsonl` 可随时删除重建（行 hash 失效即重嵌）。

### 5.1 面板能力面（2026-09-10 U1-U6 后）

展示端点（只读、零 token）：`/vector/status2`（provider 探测+缓存+vecStats，替代退役 vector_search.py）· overview 增 `delta/vector/weekDiff` · sections 增 `backrefs`（反链聚合）。
写端点（用户显式触发、全走门禁）：`/embed/config`（GET+POST 合并，写 scheduler.json，重载生效）· `/memory/edit|remove`（临时文件→write_gate→rename 失败回滚）· `/memory/approve`（候选→.processed，双区 flow-candidates/pending）。
前端：记忆板块 §0 状态徽章（蒸馏/向量/pending）+ §7 向量 + §8 delta + §9 周 diff；画像行编辑；pending 批准/忽略；notes 反链；参数「向量与模型·当前链路」节。约束：画像/记忆板块结构零改动（追加式），sc-* 样式语言保留。

## 6. 质量门（写侧防线）

- `write_gate`：容量红线 + §小节存在性（read_section 双向包含口径）+ 格式（索引行标签/日期/指针）。
- `health_check`：容量水位 / 指针完整 / 零召回清单。
- 蒸馏/深睡产物全部经宿主 write_gate → 原子写；子代理不直接写库。
- G30 证据门（claims ≤ evidence_reads）在任务层。

## 7. 明确不做（防漂移）

- 跨会话主动唤醒/提醒（记忆底座只管记忆，主动行为归上层 agent）
- GUI 操作 / 语音输出（API/CLI 优先）
- 多租户 / RBAC / 实时 SLO（单机单用户）
- 云端 token 型记忆（本地优先；云端仅作 embed provider 可配置项）

## 8. 变更纪律

1. 代码改动先过本文档模块归属（新功能=先改架构→改模块→才写码）；
2. token/效率相关改动必须注明预算影响（进 §4 表或显式论证）；
3. 每模块单目录、明确接口，禁止跨模块顺手改；
4. 架构文档按指纹过期重生成（指纹= src/** + 本文）。

---
_建立 2026-09-09（用户拍板：对齐 + 向量默认 + 效率/token 硬约束）；来源：源码审计 + token 预算量化 + DSH 官方包核对_
