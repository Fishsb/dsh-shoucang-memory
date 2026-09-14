# 模型配置 UX 方案审查报告（2026-09-10）

> ⚠ **时点文档（2026-09-10）——文中「自建 9915 桥」路线已于 2026-09-11 被取代**：现行向量承载 = **Ollama `bge-m3`** @ `http://127.0.0.1:11434/v1`。本文审查的三条缺陷（baseUrl 带 `/v1`、bge 无 `/models`、端点枚举拼接）**已在 2026-09-11 全部修复**（见 `CHANGELOG.md` 当日条目与 `panel.ts`/`vec.ts`），且本机端点判定已泛化为任意 `127.0.0.1/localhost` 基址。保留原样作为**当时**的审查记录；正文中的 9915 缺省值**不代表现状**。

> 审查对象：`docs/model-config-ux-20260910.md`（Provider 预设 + 枚举下拉，仿 AnythingLLM/Open WebUI）。
> 方法：逐设计假设对照实际代码/端点实证。结论：方向正确，但有 **3 个会致功能失效的缺陷** + 若干边界，须修正后实施。

## 一、实证基线（审查依据）

| 事实 | 证据 |
|---|---|
| vec.ts 打 **OpenAI 兼容** `${baseUrl}/embeddings` | vec.ts embedTexts |
| embedBaseUrl 缺省 `http://127.0.0.1:9915/v1`（带 /v1） | scheduler.ts L112 |
| bge 服务只在 `/v1/embeddings`（OpenAI）+ `/api/embeddings`（Ollama）响应，**无 /models、无裸 /embeddings** | 端点实测：POST /v1/embeddings=200，POST /embeddings=404，GET /models=404 |
| Ollama 11434：`/api/tags`=200 + `/v1/models`=200 双通 | 实测 |
| embed 配置读 **scheduler Config**（scheduler.json 经 applySuiteConfigFile 启动覆盖）→ 写后**需重载** | scheduler.ts L323-328 |
| 蒸馏/深睡 LLM **继承宿主主会话**（非本地 Ollama）；llmProvider/llmModel 留空=继承 | distill.ts 路由回落 |

## 二、方案缺陷（会致功能失效，须修）

### 🔴 D1 baseUrl 语义不统一 → 预填漏 /v1 直接 404
方案 UI 预填 `http://localhost:9915`（无 /v1）。但 vec 拼 `/embeddings` → 实际 `http://localhost:9915/embeddings` = **404**（bge 只在 /v1/embeddings）。
**修正**：所有 Provider 的 baseUrl 一律 **OpenAI 兼容根（带 /v1）**：
- bge 自建：`http://127.0.0.1:9915/v1`
- Ollama：`http://127.0.0.1:11434/v1`（OpenAI 兼容面）
- LM Studio：`http://127.0.0.1:1234/v1`
- 云端：用户填 OpenAI 兼容根（如 `https://api.openai.com/v1`）
即「baseUrl = OpenAI 兼容 /v1 根」，枚举与嵌入同协议。

### 🔴 D2 bge 服务无 /models → 枚举失败需特判
方案枚举统一 GET `/v1/models`，但 bge 9915 **没有 /models**（只 /health）。
**修正**：/embed/test 对不可枚举端点**降级**——探测 /health 成功 → 判定「可用但无法枚举」→ UI 显示固定模型 bge-m3（或让用户手输），不报错拦死。

### 🔴 D3 换 Provider/模型时旧向量失效——方案仅"提示清缓存"，应自动化
vec 缓存指纹 = `model` 字符串（P0 已做）。但**两个 provider 用同名 model**（如都叫 bge-m3）→ 缓存键相同 → 换 baseUrl 但 model 名未变 → **旧向量被误用**（来自不同服务的向量混比）。
**修正**：缓存指纹把 baseUrl 也纳入（cacheKey = file+hash+model+baseUrl）——换服务必失效，不依赖用户记得点清缓存。

## 三、边界与澄清（不阻塞，但需在方案/UI 明示）

### 🟡 B1 蒸馏 LLM 与向量不共用 Provider
方案写「向量与蒸馏共用 base_url」——**误导**。蒸馏继承宿主主会话（云端 DeepSeek 等），与本地向量服务无关。
**修正**：UI 上「向量模型」独立配置；蒸馏 LLM 维持「继承主会话（默认）/ 高级可换」，两者不同 section 不暗示关联。

### 🟡 B2 Ollama 下拉混入 chat 模型
Ollama /api/tags 不区分 chat/embedding。选错 chat 模型 → /embeddings 报错。
**修正**：下拉对模型名做**弱提示**（含 embed/bge/m3/nomic 等标「嵌入」，其余标「？嵌入兼容」），不硬过滤。

### 🟡 B3 /embed/test 服务端 fetch 安全
后端按用户填的 URL fetch——本机插件风险低，但应校验协议（仅 http/https）防 `file://` 类。

### 🟡 B4 生效链提示
写配置走 scheduler.json → **重载才生效**（scheduler Config 启动读一次）。UI 必须醒目提示（现有「重载后生效」文案保留）；/embed/test 是即时探测不受此限。

### 🟡 B5 词法兜底语义
方案「未配置 soft-block」——但词法召回本就兜底可用。语义检索是增强非必需：**不 soft-block 主流程**（检索照跑词法），仅配置区引导卡 + 状态徽章标「语义未启用」即可（对齐 Dify 只在"建库"强拦——本插件无强依赖场景）。

## 四、实施顺序修正（并入原 M 批次）

| 批 | 内容 | 关键点 |
|---|---|---|
| M0 | vec 缓存指纹加 baseUrl（D3） | cacheKey=file+hash+model+baseUrl |
| M1 | 后端 /embed/test（POST baseUrl → 判活 + 枚举 /v1/models，不可枚举降级 /health→固定 bge）（D1/D2） | 协议校验（B3） |
| M2 | UI Provider 卡/下拉（预填带 /v1）+ 模型弱分类下拉（D1/B2）+ 生效链提示（B4） | 现有文本框区改造 |
| M3 | 蒸馏模型 section 独立化 + 继承默认文案（B1） | 低优先 |
| M4 | 未配置引导卡升级（B5）+ 文档同步 | — |

## 五、复用决策（不造轮子，符合核心原则）
- 枚举/嵌入协议：**仅 OpenAI 兼容 /v1/models + /v1/embeddings**（Ollama/LM Studio/llama.cpp/vLLM/bge 全实现）→ 零新依赖纯 fetch（比引 ollama-js 更贴插件轻量；AnythingLLM 也是自 fetch）
- 判活：/health（bge）或 /v1/models 本身即判活——**无需 tcp-port-used 额外依赖**
- 结论：协议层全部复用既有 OpenAI 兼容标准，本插件只写薄胶水（test 端点 + UI 卡），符合「不从零造轮子」

---
_审查 2026-09-10；证据：vec.ts/scheduler.ts 源码 + 9915/11434 端点实测_
