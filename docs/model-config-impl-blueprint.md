# 模型配置实施蓝图（照抄 AnythingLLM customModels.js · 2026-09-10）

> ⚠ **时点文档（2026-09-10）——文中「自建 9915 桥」路线已于 2026-09-11 被取代**：现行向量承载 = **Ollama `bge-m3`** @ `http://127.0.0.1:11434/v1`（本机免 key、OpenAI 兼容 `/v1/embeddings`），见 `ARCHITECTURE.md` §Provider 与 `settings-guide.md` 的 `embedBaseUrl` 行。旧自建桥（`bge-m3-openai-server-gpu.py` + nssm 服务 `dsh-bge-embed` :9915）已随 nssm 卸载停用；**模型资产仍在 `D:\AI\models\bge-m3`，随时可复活**。本文保留原样作为**当时**的实施蓝图，正文中的 9915 预设与端点假设（如"bge 无 /models 降级 /health"）**不代表现状**。

> 来源：AnythingLLM `server/utils/helpers/customModels.js` 代码考古（实测 API 抓取，blob URL 在报告）。
> 用途：DSH 插件 M1(/embed/test) + M2(Provider 卡+模型下拉) 的照抄骨架。协议零新依赖纯 fetch。
> 对齐审查修正：D1（baseUrl 带 /v1）、D2（bge 无 /models 降级 /health）、D3（缓存指纹加 baseUrl）。

## 1. 后端枚举中枢（照抄 customModels.js 单一 switch）

```ts
// panel.ts 内新增（零依赖 fetch；panel 进程全局 fetch 可用——vec.ts 已证）
interface EmbedEnum { models: Array<{ id: string; name?: string }>; error: string | null }
async function enumEmbedModels(baseUrl: string, apiKey?: string): Promise<EmbedEnum> {
  const b = baseUrl.replace(/\/+$/, '')           // D1: 去尾 /，保证拼接干净
  try { new URL(b) } catch { return { models: [], error: 'URL 无效' } }
  try {
    if (/\/api\/tags$/.test(b)) {                 // Ollama 原生
      const r = await fetch(b, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(4000) })
      if (!r.ok) return { models: [], error: `Ollama 不可达 ${r.status}` }
      const j = await r.json() as { models?: Array<{ name: string; capabilities?: string[] }> }
      return { models: (j.models || []).map((m) => ({ id: m.name })), error: null }
    }
    // OpenAI 兼容（Ollama /v1、LM Studio、云端、bge 若实现）→ GET /v1/models
    const r = await fetch(b + '/v1/models', { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(4000) })
    if (r.status === 404) return { models: [], error: 'NO_MODELS_ENDPOINT' }   // D2: 服务在但无 /models → 调用方降级 /health
    if (!r.ok) return { models: [], error: `不可达 ${r.status}` }
    const j = await r.json() as { data?: Array<{ id: string; owned_by?: string }> }
    return { models: (j.data || []).map((m) => ({ id: m.id })), error: null }
  } catch (e) { return { models: [], error: String((e as Error).message || e).slice(0, 80) } }
}
```
- **永不 throw**、失败降级 `{models:[], error}`（照抄 AnythingLLM 约定）
- key 为空**不发 Authorization**（本地免 key）
- 验活 = 枚举非空 或 /health 通（bge 特判）

## 2. Provider 预设表（D1：全带 /v1 OpenAI 兼容根）

```ts
const EMBED_PROVIDERS = [
  { id: 'bge-local', name: '本地 bge-m3（守藏自建 GPU）', base: 'http://127.0.0.1:9915/v1', fixed: 'bge-m3' }, // 无 /models → 降级 health→fixed
  { id: 'ollama', name: 'Ollama', base: 'http://127.0.0.1:11434/v1', enum: '/v1/models' },                    // 或切 /api/tags 拿 name
  { id: 'lmstudio', name: 'LM Studio', base: 'http://127.0.0.1:1234/v1', enum: '/v1/models' },
  { id: 'custom', name: '自定义 OpenAI 兼容（云端）', base: '', enum: '/v1/models' },                          // 用户填
]
```
- bge-local：探测 `/health` 200 → 直接列固定 `bge-m3`（D2 降级）；若未来服务加 /models 则自动走枚举
- 模型弱分类：id 含 embed/bge/m3/nomic/e5 → 标「嵌入」；其余「?」（B2 提示，不硬过滤）

## 3. 前端交互状态机（照抄 EmbeddingSelection + Open WebUI 纯 DOM 版）
考古来源：AnythingLLM EmbeddingPreference/OllamaOptions + Open WebUI AddConnectionModal/Selector（落盘
`%TEMP%\anythingllm-research\` 与 `~/.dsh/tmp/ui-archaeology\`）。**纯 DOM 三态模式**：

```
[Provider 卡片/radio]  →  选择后下方渲染该 provider 表单（静态注册表 EMBED_PROVIDERS）
    ↓
[URL 输入 + <datalist> 预设常用端点]  →  onBlur 才提交规范化值（trim/去尾/），不击键提交
    ↓ 有提交值
[模型下拉三态（单 <select>）]:
    · 无 URL        → disabled 占位「先填写服务地址」
    · 请求中/空列表 → disabled 占位「加载可用模型中…」(+spinner)
    · 成功有列表    → 正常 select + optgroup（模型 id；embedding 名弱分类标注）
    · 失败          → disabled 占位 + 邻近 error 文字 + 重试钮（比 AnythingLLM 改进：失败独立文案）
    ↓ 触发 = URL onBlur 提交值变化 → 自动重拉（不需「加载模型」按钮）
[测试连接]（可选二次校验，OWUI 式独立按钮）：点选 disabled+转圈 → ✓/✗ 就近显示；成功顺带填下拉
    ↓ 选中模型
[/embed/config 写 baseUrl+model] → 提示「重载后生效」+ 换模型提示（缓存指纹 baseUrl+model 自动失效 D3）
```

## 4. 批次
| 批 | 内容 | 验证 |
|---|---|---|
| M0 | vec 缓存指纹加 baseUrl（cacheKey=file+hash+model+baseUrl） | 换 baseUrl 旧缓存失效实测 |
| M1 | /embed/test 后端（enumEmbedModels + bge /health 降级） | curl：9915→bge-m3 固定 / 11434→ollama 模型清单 |
| M2 | UI Provider 卡 + URL(datalist) + 模型下拉三态（替代现文本框区 L448-464） | 选 Ollama→模型下拉→写配置 |

## 5. 不造轮子确认
- 协议：仅 OpenAI 兼容 /v1（Ollama/LM Studio/llama.cpp/bge 全支持）+ Ollama /api/tags 变体——AnythingLLM 同款
- 零新 npm 依赖（纯 fetch；AnythingLLM 用 openai SDK 但我们仅枚举，SDK 非必需）
- 状态机/降级约定照抄 AnythingLLM（永不 throw / 枚举=验活 / 失败空列表）

## 6. LLM 模型配置统一模式（2026-09-10 用户拍板：所有大模型配置都走宿主模型选择）
> 蒸馏/深睡等 **LLM 类配置 ≠ 向量**（向量=本地/云端 embedding 服务枚举）。LLM 直接用 **DeepSeek Harness
> 自身模型体系**：先配好 Harness 模型 → 插件里下拉选即可，不发明第二套。

- **数据源（宿主现成 API，不造轮子）**：
  - `ctx.llm.listProviders()` → provider 路由（宿主注册的 adapter）
  - `ctx.llm.listModels(provider)` → `Promise<LlmModelInfo[]>`（{provider,id,name}——下拉全要素）
  - `ctx.llm.listConfigurableProviders()` → 可配置 provider 目录（含 dormant）
- **桥**：schedulerShare 加 `llmModels(): Promise<Array<{provider,id,name}>>`（scheduler 侧有 ctx.llm，逐 provider listModels 扁平）→ panel `GET /llm/models` 经桥取
- **配置键**（用户拍板拆独立）：`distillProvider/distillModel`（蒸馏）+ `sleepProvider/sleepModel`（深睡），
  各自支持「继承主会话(空)」或选宿主具体模型；未设回落旧共用 llmProvider/llmModel（向后兼容）
- **消费端改造**：distill.ts L583(蒸馏) L973(深睡) 从共用键改读各自键+回落
- **UI**：参数调节拆两卡片（用户拍板）——「向量模型」卡（M2 现状优化）+「蒸馏/深睡模型」卡
  （每个：继承主会话 / 宿主模型两级下拉，仿 AnythingLLM LLMPreference 同构模式）
- 验证：GET /llm/models 返回宿主真实模型；选模型写 scheduler.json → 蒸馏/深睡各自用对应模型
