# 模型配置小白友好化方案（2026-09-10 草稿）

> 性质：方案草稿（调研结论待填入后定稿）。目标：把向量/LLM 模型的"裸 地址+名字 文本框"配置
> 改成小白友好的「下拉选可用模型 / 目录自动识别 / 文件夹选择」模式。
> 依据：2 个并行调研子代理（本地 AI 模型配置 UX + 记忆插件向量自检 UX）——结论待合并。
> 状态：骨架先行，调研回填后定稿实施。

## 0. 用户诉求（原文）
"模型方面要参考其他记忆项目要做成那种选项的，如果是本地模型最好是打开文件夹选中这种，
或者放在指定的文件夹目录会自动识别那种…这种地址+名字的配置方式对小白不太友好"

## 1. 现状盘点（已实测）
| 配置 | 现状 | 小白问题 |
|---|---|---|
| 向量 embedding | 「当前链路」节 3 文本框（baseUrl/model/apiKeyEnv） | 裸地址+名字，不知道填什么 |
| 蒸馏/深睡 LLM | llmProvider/llmModel 文本框，**留空=继承主会话** | 其实无需配（继承默认）——本身已友好，仅高级用户换模型才用 |
| 本地服务探测 | /vector/status2 只探 9915（bge 自建） | 没发现 Ollama/LM Studio 等已装服务 |

## 2. 已确认的技术前提
- **无维度坑**：EmbedCfg 无 dimension，向量维度由服务端定，cosine 同模型内一致；
  换模型 → model 指纹缓存自动失效重嵌（P0 已做）——UI 选模型只需写 baseUrl+model + 提示清缓存。
- 蒸馏继承主会话 = 默认零配置（友好基准已达成）。
- **宿主无模型发现 API**（dsh-llm 只提供 LlmAdapter/LlmRuntime 调用抽象，无"枚举可用模型/provider"清单接口）
  → 模型发现走**对接成熟生态协议**：Ollama `/api/tags`、OpenAI 兼容 `/v1/models`（LM Studio/bge 自建同为
  OpenAI 兼容）、LiteLLM 类统一客户端——**不发明协议**（用户方法论约束：不造轮子、不重踩坑）。
- 蒸馏/深睡 LLM 已复用宿主 LlmRuntime（继承主会话），未自建 LLM 调用链。

## 2.5 方法论约束（用户拍板 2026-09-10）
**不从零找轮子**：网络开源社区有成熟完善的项目（已补坑）。实现优先——
① 对接成熟协议/生态（Ollama/LM Studio/OpenAI 兼容/LiteLLM/transformers.js）；
② 复用开源库（HF 生态、ollama npm sdk、AnythingLLM/Open WebUI 的发现实现思路）；
③ 只写 shoucang 特有的薄胶水层。需自研的功能先检索社区有无现成，再决定自研。

## 3. 调研结论（2026-09-10 两子代理 · 10+ 产品）
**关键认知修正**：「扫描常见端口自动发现」主流产品几乎都不做（SillyTavern/AnythingLLM/Dify/RAGFlow/Obsidian 系/LlamaIndex 全验证）——统一成熟模式是：
1. **表单自动填默认端点**（Ollama 11434 / LM Studio 1234 / 自建 9915）→ 连上即 GET 模型列表 → 失败报错
2. **健康检查两级**：保存/连接时一次 validate（Dify/AnythingLLM/ST）+ 运行期持续告警可压制（ST bypass）
3. **降级引导三招**：A 自带默认引擎（AnythingLLM Native / RAGFlow bge = 零配置即用）B 换配警告需重嵌 C 功能入口 soft-block 指路（Dify）
4. 云端供应商有官方模型清单可下拉；本地服务靠"预填端点→拉列表"而非目录扫描

**可复用开源实现（不造轮子）**：
- 协议层：Ollama 原生 `GET /api/tags`（枚举+健康）+ OpenAI 兼容 `GET /v1/models`（Ollama≥0.1.19 / LM Studio / llama.cpp / vLLM 全实现）——**探测只写这两端点即可通吃**；嵌入用 Ollama `/api/embed` 或 OpenAI `/v1/embeddings`
- JS 客户端：npm `ollama`（list/embed）；OpenAI SDK `models.list()` 打任意兼容端点；LM Studio TS SDK
- 统一网关：**LiteLLM**（BerriAI/litellm）OpenAI 兼容代理+模型枚举，可作多供应商兜底出口
- 端口探测：`tcp-port-used` / `is-port-reachable`（秒级判活 11434/1234/9915）→ 判活后只请求上述两协议
- 蒸馏/深睡 LLM 复用宿主 LlmRuntime（继承主会话）——已不造链

## 4. 方案方向（定稿：仿 AnythingLLM/Open WebUI，不搞端口扫描）
**主交互 = Provider 卡片/下拉 + 探测后自动枚举**（AnythingLLM + Open WebUI 合体，可抄开源实现）：
- **内置 Provider 预设**：① 本地 bge 自建（9915，OpenAI 兼容）② Ollama（探测 11434 `/api/tags`）③ LM Studio（1234 `/v1/models`）④ 自定义云端 OpenAI 兼容（URL+key）
- 点选 Provider → **自动填默认端点** → 后端枚举模型 → **模型下拉**（可搜索）；失败 → 手输兜底
- 向量与蒸馏/深睡 chat 共用同 base_url 语义；Ollama /api/tags 不区分 chat/embedding，下拉勿过滤（用户自选嵌入款）
- 未配置时：检索入口 soft-block 引导卡（仿 Dify）+ 词法兜底照跑（不瘫痪）
- 换 Provider/模型 → 提示"需清缓存重建"（仿 AnythingLLM re-embed 警告）
- **可抄实现**：ollama-js `client.list()`；OpenAI SDK `models.list()`；AnythingLLM `AiProviders/{ollama,lmStudio}/index.js` + `useGetProvidersModels.js`；Open WebUI 连接聚合
- **不做**：端口扫描自动发现（主流无此）；目录扫描为主（LM Studio/Jan 派，跨平台路径难统一——仅作"自定义文件夹"可选手输）

## 4.1 实施批次（调研定稿版）
| 批 | 内容 | 验证 |
|---|---|---|
| M0 | 未配置 soft-block 引导卡升级 + 词法兜底提示 | UI |
| M1 | 后端 /embed/test（POST baseUrl → 判活 + 枚举：/v1/models 或 /api/tags） | curl 返回模型+耗时 |
| M2 | UI「Provider 预设卡 + 模型下拉」（替代裸文本框） | 选 Provider → 模型下拉 → 写配置 |
| M3 | 运行期健康点（服务停→红点词法兜底）；蒸馏模型下拉（低优先） | 实测 |
| M4 | settings-guide + CHANGELOG | 文档一致 |

## 5. 调研待回填
- 主流项目模型配置交互模式（下拉/文件夹/目录扫描）与最优参考
- 服务健康检查/自动降级引导做法
- 目录自动识别是否主流可靠（跨平台路径差异大？）

---
_骨架 2026-09-10；待 2 调研子代理（ce5d3d2b / 0329619d）结论合并后定稿_
