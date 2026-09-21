// eval-channel.ts — 「可配置评估通道」运行时（M1 · 2026-09-21 · ACT-283）
//
// 职责（**只做判定，不做注入**）：把一组「类型化问题」发给可配置的评估端点，拿回**带类型的答案**。
//   本件对应 Rasmussen SRK 的 **rule-based 中层**（自动化层 = `planXxx` 纯函数，推理层 = LLM 子代理），
//   补的是"答案可枚举、但判据写不成代码"的那一层。
//
// ⚠ **为什么不用全局 `fetch`**（本仓实测，`src/panel-inject.ts:211-212` 原文）：
//   「宿主进程全局 fetch 被 DSH patch（**实测 11434 经 fetch 不通、node:http 通**）」。
//   ⇒ 走 `node:http`/`https` 直连，否则**本机 Ollama 档结构性不可用**。
//
// ⚠ **零依赖**：只 `import` node 内置 + 本仓 `eval-config.js`。
// ⚠ **纯模块级实现 + 窄依赖**（`EvalDeps` 仅 3 字段），守 `audit-wiring` 的 I1/I2 棘轮。
import http from 'node:http'
import https from 'node:https'
import { egressAllowed, isLoopbackUrl, type EvalConfigFields } from './eval-config.js'

/* ══ 依赖（窄传：3 字段，远低于 I2 的 12 字段上限） ═══════════════════════════ */
export interface EvalDeps {
  /** 生效配置（经 `evalOptionsOf` 投影后传入，不由本件去读盘） */
  cfg: EvalConfigFields
  /** key 取值口（**不落盘**；由调用方从进程环境取，本件不碰 `process.env[name]` 之外的任何来源） */
  env: (name: string) => string | undefined
  log(m: string): void
}

/* ══ 七态归因（G3 · 会审 E-02：本仓最重的"不可观测"缺陷） ═══════════════════
 * 判因：`vec.ts:240-260` 把六类失败**全塌缩成 `return null`**，归因只看配置位
 *   （`recall-diagnosis.ts:42`）⇒ 真机 `missReason` 分布中 **`embed-off` = 0**，
 *   「调了但失败」与「没调」**在账上同形**。本件从第一天起就**分态**，不重走那条路。
 */
export type EvalOutcome =
  | 'ok'              // 拿到合法答案
  | 'off'             // 配置关闭（未调用）
  | 'egress-denied'   // 非 loopback 且未许可出网（**拒发**，非失败）
  | 'key-missing'     // 非 loopback 且无 key
  | 'unreachable'     // 网络/连接/超时
  | 'bad-body'        // 200 但结构非法/JSON 解析失败
  | 'type-violation'  // 值越出 criteria 定义域（本仓教训：NaN 比较恒 false ⇒ 静默降级）

/* ══ state 组装白名单（G1 条款 ③ · 复用既有高置信载体集） ═════════════════════
 * 语义：**只允许"已提炼断言"进 state**，拒绝自由文本 —— 依据是第三方扑克实测
 *   （150 决策点，吻合率 63%）：只有把结论直接喂进 state 判断才改善，
 *   它**不能从原始材料推出隐含结论**（那是 knowledge-based 层的事）。
 * ⚠ **拒发，不做脱敏**：脱敏会改变判定对象（正是要防的假绿），且脱敏规则属**新真源语义**（R3）。
 */
export interface EvalStateRow { tag: string; text: string; pointer?: string }

/** 行级准入：只收已提炼断言形态（空文本/自由长文一律拒） */
export function admitStateRow(r: EvalStateRow): { ok: boolean; why: string } {
  const text = String(r?.text || '').trim()
  const tag = String(r?.tag || '').trim()
  if (!text) return { ok: false, why: 'empty' }
  if (!tag) return { ok: false, why: 'no-tag' }
  if (text.length > 400) return { ok: false, why: 'too-long' } // 断言应短；长文属"原料"不是断言
  return { ok: true, why: 'ok' }
}

/**
 * 组装 state（**白名单函数**，不是过滤器）：白名单外**拒发并如实报**，不静默丢弃。
 * @returns `text` = 组装好的 state；`rejected` = 被拒行（供落账，**不隐藏**）
 */
export function buildEvalState(rows: readonly EvalStateRow[], cap = 2000): { text: string; rejected: number; used: number } {
  const kept: string[] = []
  let rejected = 0
  let chars = 0
  for (const r of rows) {
    const a = admitStateRow(r)
    if (!a.ok) { rejected++; continue }
    const line = `[${String(r.tag).trim()}] ${String(r.text).trim()}`
    if (chars + line.length > cap) break // 预算到顶即停（不截断单行，避免产生半句）
    kept.push(line); chars += line.length + 1
  }
  return { text: kept.join('\n'), rejected, used: kept.length }
}

/* ══ 问题与答案（**类型化**：choice / boolean / score） ══════════════════════ */
export interface EvalChoiceQ { type: 'choice'; instructions: string; criteria: Record<string, string> }
export interface EvalBoolQ { type: 'boolean'; instructions: string }
export interface EvalScoreQ { type: 'score'; instructions: string; criteria: string[] }
export type EvalQuestion = EvalChoiceQ | EvalBoolQ | EvalScoreQ

/**
 * 逐题拼问（**问题自包含**：官方文档明确问题 ID 不发给模型，只发 instructions）。
 *
 * ⚠ **2026-09-21 实测修正（两处真缺陷，均为本仓首见）**：
 *   ① 原实现在正文写 `问题 ${id}：…` ⇒ **把内部 id 泄给模型**，而格式范例又用
 *      `{"<问题id>":{...}}` 的**尖括号**（模型视作字面量）⇒ 实测模型回
 *      `{"代理分通道/重钉合并/多次测量":{"matches":true}}`（**拿材料当外层 key**），
 *      解析器一律 `missing:${id}` ⇒ 通道恒判不出。
 *   ② 修法：**不暴露 id**（问题只用序号）+ 给出**具体可抄的范例**（不用尖括号占位符）。
 *      实测修正后同一提问正常回 `{"matches":{"answer":true}}`。
 */
function promptOf(state: string, qs: Record<string, EvalQuestion>): string {
  const ids = Object.keys(qs)
  const ex = (id: string): string => {
    const q = qs[id]
    const body = q.type === 'choice' ? `"choice":"<任选一个选项键>"` : q.type === 'score' ? `"score":<数值>` : `"answer":true`
    return `{"${id}":{"${q.type === 'score' ? 'score' : 'answer'}":${q.type === 'choice' ? '"<选项键>"' : q.type === 'score' ? '0' : 'true'},"confidence":0.9}}`
  }
  const parts = [
    '你在做**类型化判定**。只依据下面给出的材料作答，不要引入外部知识。',
    '材料：', state, '',
    '请回答下列问题。**外层键必须是问题的英文代号**（原样照抄，不要用材料内容当键）：',
  ]
  const ORD = ids.map((id) => id)
  for (const id of ORD) {
    const q = qs[id]
    if (q.type === 'choice') {
      parts.push(`问题「${id}」：${q.instructions}`)
      parts.push(`  选项：${JSON.stringify(q.criteria)}`)
    } else if (q.type === 'score') {
      parts.push(`问题「${id}」：${q.instructions}`)
      parts.push(`  量表（有序，最少 2 级）：${JSON.stringify(q.criteria)}`)
    } else {
      parts.push(`问题「${id}」：${q.instructions}`)
    }
  }
  parts.push('', '输出格式（**照抄此形状，外层键就是上面引号里的代号**）：')
  parts.push('  ' + ORD.map(ex).join(''))
  parts.push('只输出一行 JSON，不要解释、不要代码块。')
  return parts.join('\n')
}

/* ══ 严格解析（**不猜、不兜底** · 沿本仓 `parseYieldJudgements` 的口径） ═══════ */
export function parseEvalAnswers(
  raw: string, qs: Record<string, EvalQuestion>,
): { ok: true; answers: Record<string, { value: unknown; confidence: number | null }> } | { ok: false; why: string } {
  const m = /\{[\s\S]*\}/.exec(String(raw || ''))
  if (!m) return { ok: false, why: 'no-json' }
  let obj: unknown
  try { obj = JSON.parse(m[0]) } catch { return { ok: false, why: 'bad-json' } }
  if (!obj || typeof obj !== 'object') return { ok: false, why: 'not-object' }
  const o = obj as Record<string, unknown>
  const out: Record<string, { value: unknown; confidence: number | null }> = {}
  for (const [id, q] of Object.entries(qs)) {
    const a = o[id] as Record<string, unknown> | undefined
    if (!a || typeof a !== 'object') return { ok: false, why: `missing:${id}` }
    const conf = Number(a.confidence)
    const confidence = Number.isFinite(conf) ? conf : null
    if (q.type === 'choice') {
      const v = String(a.choice ?? '').trim()
      // **值域校验**：越界 ⇒ type-violation（不静默当字符串用）
      if (!Object.prototype.hasOwnProperty.call(q.criteria, v)) return { ok: false, why: `type-violation:${id}` }
      out[id] = { value: v, confidence }
    } else if (q.type === 'boolean') {
      const v = a.answer
      // 官方口径：boolean 的 P(true) 不保证校准 ⇒ 客户端**先做形状校验**，非法即拒（不猜）
      if (v !== true && v !== false) return { ok: false, why: `type-violation:${id}` }
      out[id] = { value: v, confidence }
    } else {
      const v = Number(a.score)
      // 官方 `/primitives/score`：有序、≥2 级、**可落在两级之间**（非整数）⇒ 只校"有限数 + 在量表范围内"
      if (!Number.isFinite(v) || v < 0 || v > Math.max(1, q.criteria.length - 1)) return { ok: false, why: `type-violation:${id}` }
      out[id] = { value: v, confidence }
    }
  }
  return { ok: true, answers: out }
}

/* ══ 端点调用（**node:http 直连**，绕开被 patch 的全局 fetch） ═════════════════ */
interface HttpResult { status: number; body: string }

/**
 * 本机 Ollama 的**原生** `/api/chat` 端点（由 `/v1` 基址推导）。
 *
 * **判因（2026-09-21 实测 · 本仓首见）**：Ollama 的 `think:false` **只在原生端点真正生效**，
 * 经 OpenAI 兼容层（`/v1/chat/completions`）会被**忽略** ⇒ `qwen3.5:2b` 每问白烧 ~24s 思考链，
 * 冷启叠加即撞 60s 超时（实测 `outcome:"unreachable" why:"timeout"`）。
 * 实测对照（同一提问）：
 *   · 原生 `/api/chat` + `think:false` + `format:json` → **5.2s**，thinking=false
 *   · OpenAI 兼容 `/v1/chat/completions`（带 `think:false`）→ **28.2s**，思考链照跑
 *   · 原生 + `format:json` 不用（`response_format`）→ **429ms**（快但空输出，故必须带 format）
 * ⇒ 本机档一律走原生端点；远端仍走 OpenAI 兼容（`think` 是 Ollama 专有字段，严格端点会拒收）。
 */
function nativeChatUrlOf(base: string): string {
  // `/v1` 结尾 ⇒ 去掉；再补 `/api/chat`（`http://127.0.0.1:11434/v1` → `.../api/chat`）
  const b = base.replace(/\/+$/, '').replace(/\/v1$/, '')
  return b + '/api/chat'
}

/** 原生端点请求体（`format:'json'` 强制 JSON 形状；缺它实测返回空 content）。 */
function nativePayloadOf(model: string, prompt: string): Record<string, unknown> {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: false,          // 仅原生端点有效（见 nativeChatUrlOf 判因）
    format: 'json',        // 缺它实测空输出（429ms 返回 thinking 但 content 为空）
    options: { temperature: 0 },
  }
}

function postJson(urlStr: string, payload: unknown, headers: Record<string, string>, timeoutMs: number): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let url: URL
    try { url = new URL(urlStr) } catch { return reject(new Error('bad-url')) }
    const lib = url.protocol === 'https:' ? https : http
    const data = JSON.stringify(payload)
    const req = lib.request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', (e) => reject(e))
    req.write(data); req.end()
  })
}

/** 端点基址 → `{base}/chat/completions`（与 embed 的 `/embeddings` 同法） */
const chatUrlOf = (base: string): string => String(base || '').replace(/\/+$/, '') + '/chat/completions'

/**
 * 执行一次评估（**fail-closed**：任何不确定都返回 `ok:false` 并给**分态**原因，绝不猜）。
 * 调用方据 `outcome` 决定：`ok` 用值；其余一律**回落**（保持现状），**不得静默采信**。
 *
 * ⚠ **超时值按端点类别分层**（实测归因，非拍脑袋）：`vec.ts:249` 的「云端 8s」直接照抄会误杀本机档——
 *   真机实测本机 `qwen3:8b` 单次 chat **8459ms**（冷启更久），8s 超时 ⇒ `outcome:'unreachable' · why:'timeout'`。
 *   本地推理档含**模型加载 + 生成**，故给 60s；远端（Jev 类快模型）百毫秒级，给 15s。
 */
export async function evaluate(d: EvalDeps, state: string, questions: Record<string, EvalQuestion>, timeoutMs?: number):
Promise<{ outcome: EvalOutcome; why: string; answers?: Record<string, { value: unknown; confidence: number | null }>; latencyMs: number }> {
  const t0 = Date.now()
  const at = (o: EvalOutcome, why: string, answers?: Record<string, { value: unknown; confidence: number | null }>) =>
    ({ outcome: o, why, answers, latencyMs: Date.now() - t0 })

  if (!d.cfg.evalEnabled) return at('off', 'disabled')
  if (!d.cfg.evalBaseUrl) return at('off', 'endpoint-empty')
  if (!Object.keys(questions).length) return at('bad-body', 'no-questions')
  if (!String(state || '').trim()) return at('bad-body', 'empty-state')

  // ① 出网闸（G1 条款 ①②）：非 loopback 须显式许可 —— **本条先于任何网络动作**
  const gate = egressAllowed({ evalBaseUrl: d.cfg.evalBaseUrl, evalEgressAllow: d.cfg.evalEgressAllow })
  if (!gate.ok) return at('egress-denied', gate.why)

  // ② key：**仅非 loopback 需要**（本机端点免 key —— 与 `vec.ts:245` 同口径）
  const loop = isLoopbackUrl(d.cfg.evalBaseUrl)
  const key = String(d.env(d.cfg.evalApiKeyEnv) || '').trim()
  if (!loop && !key) return at('key-missing', String(d.cfg.evalApiKeyEnv))

  // ③ 调用（**不重试**：本仓既有教训是"重试放大"；429 的退避交给调用方按 retry-after 处理）
  //   超时按端点类别分层：本机推理档含模型加载，实测 8459ms ⇒ 60s；远端快模型 15s。
  const budget = timeoutMs ?? (loop ? 60000 : 15000)
  let r: HttpResult
  try {
    r = await (loop
      ? postJson(nativeChatUrlOf(d.cfg.evalBaseUrl), nativePayloadOf(d.cfg.evalModel, promptOf(state, questions)), {}, budget)
      : postJson(chatUrlOf(d.cfg.evalBaseUrl), {
        model: d.cfg.evalModel,
        messages: [{ role: 'user', content: promptOf(state, questions) }],
        temperature: 0,
        stream: false,
      }, key ? { Authorization: `Bearer ${key}` } : {}, budget))
  } catch (e) {
    const msg = String((e as Error)?.message || e)
    // 429 单列（G3）：官方明说限流**动态调整**，须按 retry-after 退避而非固定值
    return at('unreachable', msg.includes('timeout') ? 'timeout' : 'net:' + msg.slice(0, 60))
  }
  if (r.status === 429) return at('unreachable', 'rate-limited:429')   // ⚠ 暂并入 unreachable，why 里单列
  if (r.status !== 200) return at('unreachable', `http:${r.status}`)

  let content = ''
  try {
    const j = JSON.parse(r.body) as {
      choices?: Array<{ message?: { content?: string } }>   // OpenAI 兼容
      message?: { content?: string }                        // 原生 /api/chat
    }
    content = loop
      ? String(j?.message?.content || '')
      : String(j?.choices?.[0]?.message?.content || '')
  } catch { return at('bad-body', 'resp-not-json') }
  if (!content) return at('bad-body', 'empty-content')

  const parsed = parseEvalAnswers(content, questions)
  if (!parsed.ok) {
    return at(parsed.why.startsWith('type-violation') ? 'type-violation' : 'bad-body', parsed.why)
  }
  return at('ok', 'ok', parsed.answers)
}

/** 连通性测试（供 `/eval/test` 只读出口；**不落库、不写盘**） */
export async function probeEndpoint(d: EvalDeps, timeoutMs?: number):
Promise<{ ok: boolean; outcome: EvalOutcome; why: string; latencyMs: number; answers?: Record<string, { value: unknown; confidence: number | null }> }> {
  const r = await evaluate(d, '[probe] 这是一次连通性测试。', {
    reachable: { type: 'boolean', instructions: '材料是否为一次连通性测试？' },
  }, timeoutMs)
  return { ok: r.outcome === 'ok', outcome: r.outcome, why: r.why, latencyMs: r.latencyMs, answers: r.answers }
}
