#!/usr/bin/env node
/**
 * eval-gate.mjs — 可配置评估通道 **G2 闸门**（中文精度 + 分档可用性）
 *
 * ## 为什么要有这件（ACT-283 · 方案 v2 §3-G2）
 * 方案要先回答一个**不可推断、只能实测**的问题：把记忆库的**中文**材料交给「评估通道」
 * （类型化决策：choice/boolean/score），中文精度够不够用？
 * 官方对 Jev 只说 CJK "are handled but **not equally well**"，全仓与全网均**无中文实测数据**。
 *
 * ## 本件的形态：**零依赖 · 零 src 改动 · 可离线跑**
 * - 不 import `src/`（避免触碰跨会话共享面，符合 R2/R3）；
 * - 后端 = 任意 OpenAI 兼容 `/chat/completions`（缺省本机 Ollama `http://127.0.0.1:11434/v1`）；
 * - 样本与**已知答案**由本件内置（真材料取自运行库索引行，答案人工给定并在此留档）。
 *
 * ## 判据（照方案 v2 §3-G2）
 *   G2-a 准确率：≥ 同批样本上**基线**（同一后端经 chat 自由作答）的 90%
 *   G2-b 排序性：高置信子集的正确率 ≥ 低置信子集（B 档无真概率 ⇒ 只验排序，不验校准）
 *   ⚠ 校准性（confidence 数值本身是否准）**须 A 档真概率**，本件**不做**，如实标注。
 *
 * ## 退出码（沿本仓 check-runner 契约）
 *   0=pass · 1=fail · 3=skip（后端不可达 —— **不算通过**，与 inject-baseline-diff 同口径）
 *   4=xfail（已知未修）
 *
 * 用法：
 *   node scripts/eval-gate.mjs                    # 全跑（tasks+baseline）
 *   node scripts/eval-gate.mjs --only=tasks       # 只跑任务（省时）
 *   node scripts/eval-gate.mjs --model=qwen3:8b
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const has = (k) => argv.some((a) => a === k || a.startsWith(k + '='))

const BASE = argOf('--base', process.env.EVAL_BASE_URL || 'http://127.0.0.1:11434/v1')
const MODEL = argOf('--model', process.env.EVAL_MODEL || 'qwen3:8b')
const ONLY = argOf('--only', '')
const TIMEOUT = Number(argOf('--timeout', '120000'))
const BANK = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory'))

/* ══ 样本集：真材料 + 已知答案（人工给定，留档于此） ══════════════════════════
 * 取材：运行库索引行（`AGENT.md` / `MEMORY.md`）与 notes 小节标题。
 * 任务形态对齐方案 §3 册二的**三通道准入**：答案可枚举 ⇒ 才是评估通道该做的。
 * 三个子任务：
 *   T1 choice  —— 标签归类：给一行索引行，判它属哪个标签（enum）
 *   T2 boolean —— 断言核对：给一行索引行 + 一个断言，判该断言是否被此行支持（二分）
 *   T3 choice  —— 小节归属：给一个主题词 + 候选小节名，判它属哪个小节（enum）
 * ⚠ 答案由人工逐条给定（见 `answer` 字段），**不从模型回读**——否则是自证。
 */
const SAMPLES = [
  /* ── T1 标签归类（真行原样取自 AGENT.md/MEMORY.md；答案=该行实际标签） ── */
  { id: 'T1-1', task: 'T1', label: '标签归类',
    state: '[原则] 代理指标非判据 · 心跳/端口/钉点/文件增长皆机制自证，不等运行态 → notes/agent.md §版本钉点三处一致',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '原则' },
  { id: 'T1-2', task: 'T1', label: '标签归类',
    state: '[经验] 记忆脚本参数解析坑 · --out 误吞位置参 → notes/agent.md §学习史',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '经验' },
  { id: 'T1-3', task: 'T1', label: '标签归类',
    state: '[路径] 深睡记忆蒸馏 · ①区间起点先取值显式传参 ②按判据三通道提炼 ③done 才推进水位 → notes/flows.md §深睡蒸馏',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '路径' },
  { id: 'T1-4', task: 'T1', label: '标签归类',
    state: '[边界] 宿主服务免动 · 不自重启/不杀宿主端口，重启交用户，失败即停手转重建',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '边界' },
  { id: 'T1-5', task: 'T1', label: '标签归类',
    state: '[认知] 架构优先 · 先定承载节点再动手，说不出落点即判局部补丁',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '认知' },
  { id: 'T1-6', task: 'T1', label: '标签归类',
    state: '[原则] 结果验证重实证 · 接口成功非达成，须看审计态/字节比对等实质证据 → notes/lessons.md §假绿与实证',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '原则' },
  { id: 'T1-7', task: 'T1', label: '标签归类',
    state: '[原则] 变更先判因备份 · 清理分级：在写与系统项勿动，共享配置增量改',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '原则' },
  { id: 'T1-8', task: 'T1', label: '标签归类',
    state: '[原则] 静默失效查被吞异常 · 探针PASS≠生效，先查catch吞错与本地绑定',
    options: ['原则', '经验', '路径', '边界', '认知'], answer: '原则' },

  /* ── T2 断言核对（boolean：给定断言是否被该行支持） ── */
  { id: 'T2-1', task: 'T2', label: '断言核对',
    state: '[原则] 代理指标非判据 · 心跳/端口/钉点/文件增长皆机制自证，不等运行态',
    claim: '该原则主张：心跳与端口等信号不能作为系统真的在运行的判据。', answer: true },
  { id: 'T2-2', task: 'T2', label: '断言核对',
    state: '[原则] 代理指标非判据 · 心跳/端口/钉点/文件增长皆机制自证，不等运行态',
    claim: '该原则主张：心跳与端口可以证明系统已经在正常运行。', answer: false },
  { id: 'T2-3', task: 'T2', label: '断言核对',
    state: '[边界] 宿主服务免动 · 不自重启/不杀宿主端口，重启交用户，失败即停手转重建',
    claim: '该条要求：agent 遇到问题时不要自行重启宿主服务。', answer: true },
  { id: 'T2-4', task: 'T2', label: '断言核对',
    state: '[边界] 宿主服务免动 · 不自重启/不杀宿主端口，重启交用户，失败即停手转重建',
    claim: '该条鼓励：遇到失败时 agent 应反复重试直到成功。', answer: false },
  { id: 'T2-5', task: 'T2', label: '断言核对',
    state: '[原则] 文本改动先定编码 · 改文本用编辑工具，非ASCII .ps1带BOM余者免BOM',
    claim: '该原则要求：修改非 ASCII 的 PowerShell 脚本时要带 BOM。', answer: true },
  { id: 'T2-6', task: 'T2', label: '断言核对',
    state: '[原则] 文本改动先定编码 · 改文本用编辑工具，非ASCII .ps1带BOM余者免BOM',
    claim: '该原则要求：所有文件都必须带 BOM。', answer: false },
  { id: 'T2-7', task: 'T2', label: '断言核对',
    state: '[原则] 批处理水位即真相 · 产物未校验可解析不得推进水位，失败须回滚重试',
    claim: '该原则主张：只要程序没有报错，就可以推进水位。', answer: false },
  { id: 'T2-8', task: 'T2', label: '断言核对',
    state: '[原则] 批处理水位即真相 · 产物未校验可解析不得推进水位，失败须回滚重试',
    claim: '该原则主张：产物必须经过校验、确认可解析之后才能推进水位。', answer: true },

  /* ── T3 小节归属（choice：主题词应归入哪个小节） ── */
  { id: 'T3-1', task: 'T3', label: '小节归属',
    state: '主题：插件注册后端口被占用、服务判活失败',
    options: ['网络坑', 'DSH 自托管约束', 'Windows 系统运维与数据安全', '检索通道故障绕行'], answer: 'DSH 自托管约束' },
  { id: 'T3-2', task: 'T3', label: '小节归属',
    state: '主题：检索接口报错时的多级回退与换源',
    options: ['网络坑', 'DSH 自托管约束', 'Windows 系统运维与数据安全', '检索通道故障绕行'], answer: '检索通道故障绕行' },
  { id: 'T3-3', task: 'T3', label: '小节归属',
    state: '主题：控制台读中文文件出现乱码、需注意输出编码',
    options: ['网络坑', 'DSH 自托管约束', 'Windows 系统运维与数据安全', '检索通道故障绕行'], answer: 'Windows 系统运维与数据安全' },
  { id: 'T3-4', task: 'T3', label: '小节归属',
    state: '主题：下载大文件被截断、需要重钉与全量下载',
    options: ['网络坑', 'DSH 自托管约束', 'Windows 系统运维与数据安全', '检索通道故障绕行'], answer: '网络坑' },
]

/* ══ 提问构造（**类型化问题**——即评估通道的形态：问题自包含 + 答案可枚举） ══ */
function questionOf(s) {
  const noThink = '只输出一行 JSON，不要解释、不要 markdown 代码块。'
  if (s.task === 'T1') {
    return `你在做**标签归类**。参考标签定义：\n`
      + `- 原则：跨任务的约束或价值判断\n- 经验：一次性的事实发现\n- 路径：可复用的操作步骤\n- 边界：禁止/限制类约束\n- 认知：思维模式或判断方式\n\n`
      + `条目：${s.state}\n\n`
      + `它属于哪个标签？从 ${JSON.stringify(s.options)} 中选一个。\n`
      + `输出格式：{"choice":"<标签>","confidence":<0到1的小数>}\n${noThink}`
  }
  if (s.task === 'T2') {
    return `你在做**断言核对**。\n\n材料：${s.state}\n\n待判断言：${s.claim}\n\n`
      + `该断言是否与材料一致？\n输出格式：{"answer":true或false,"confidence":<0到1的小数>}\n${noThink}`
  }
  return `你在做**小节归属**。\n\n候选小节：${JSON.stringify(s.options)}\n${s.state}\n\n`
    + `该主题最应归入哪个小节？\n输出格式：{"choice":"<小节名>","confidence":<0到1的小数>}\n${noThink}`
}

/** 基线提问：**同一材料、同一问题，但不要求结构化**——模拟"现有 LLM 自由作答"。 */
function baselineQuestionOf(s) {
  if (s.task === 'T1') return `条目：${s.state}\n\n它属于「原则/经验/路径/边界/认知」中的哪一个？只回答一个词。`
  if (s.task === 'T2') return `材料：${s.state}\n\n断言：${s.claim}\n\n该断言与材料一致吗？只回答「是」或「否」。`
  return `候选小节：${JSON.stringify(s.options)}\n${s.state}\n\n该主题应归入哪个小节？只回答小节名。`
}

async function ask(prompt, jsonMode) {
  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,                    // 可复现优先
    stream: false,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }
  // 本地推理档（Ollama）：关思考链，否则 qwen3 系列会因长思维链拖到超时。
  // ⚠ 仅对 loopback 发这个字段——远端严格端点可能拒收未知字段（本仓 `isLocal` 的教训见方案 §1 A-附注）。
  if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(BASE)) body.think = false
  const res = await fetch(`${BASE.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  return String(j?.choices?.[0]?.message?.content || '')
}

function parseJson(text) {
  const m = /\{[\s\S]*?\}/.exec(String(text || ''))
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

/** 判分：只认**逐字/等义**命中（不猜、不做模糊匹配） */
function grade(s, text) {
  if (s.task === 'T2') {
    const t = String(text || '')
    const yes = /(是|一致|支持|true)/i.test(t) && !/(不一致|不支持|false|否)/i.test(t)
    const no = /(否|不一致|不支持|false)/i.test(t)
    const got = yes ? true : (no ? false : null)
    return { ok: got === s.answer, got, conf: null }
  }
  const obj = parseJson(text)
  if (!obj) return { ok: false, got: null, conf: null }
  const pick = String(obj.choice ?? obj.answer ?? obj.label ?? '').trim()
  const conf = Number(obj.confidence)
  return { ok: pick === s.answer, got: pick, conf: Number.isFinite(conf) ? conf : null }
}

function gradeBaseline(s, text) {
  const t = String(text || '').trim()
  if (s.task === 'T2') {
    const yes = /^(是|一致|支持)/.test(t) || /\btrue\b/i.test(t)
    const no = /^(否|不一致|不支持)/.test(t) || /\bfalse\b/i.test(t)
    return { ok: (yes ? true : no ? false : null) === s.answer, got: t.slice(0, 20) }
  }
  return { ok: t.includes(s.answer), got: t.slice(0, 20) }
}

/* ══ 主流程 ══════════════════════════════════════════════════════════ */
const results = { model: MODEL, base: BASE, at: new Date().toISOString(), samples: [], errors: [] }

// 可达性探测（失败即 exit 3 —— **不算通过**）
try {
  const r = await fetch(`${BASE.replace(/\/+$/, '')}/models`, { signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
} catch (e) {
  console.error(`⏭ skip：后端不可达（${BASE}）—— ${String(e?.message || e)}`)
  console.error('   ⚠ 按本仓契约 exit 3 = skip，**不算通过**（不得当作闸门已验）')
  process.exit(3)
}

const doTasks = ONLY !== 'baseline'
const doBaseline = ONLY !== 'tasks'

if (doTasks) {
  for (const s of SAMPLES) {
    try {
      const raw = await ask(questionOf(s), true)
      const g = grade(s, raw)
      results.samples.push({ id: s.id, task: s.task, mode: 'typed', ok: g.ok, got: g.got, answer: s.answer, conf: g.conf, raw: raw.slice(0, 200) })
      console.log(`  ${g.ok ? '✅' : '❌'} ${s.id} [${s.label}] got=${JSON.stringify(g.got)} want=${JSON.stringify(s.answer)} conf=${g.conf ?? '-'}`)
    } catch (e) {
      results.errors.push({ id: s.id, err: String(e?.message || e) })
      console.log(`  ⚠ ${s.id} 调用失败：${String(e?.message || e)}`)
    }
  }
}

if (doBaseline) {
  console.log('  —— 基线（自由作答，不要求结构） ——')
  for (const s of SAMPLES) {
    try {
      const raw = await ask(baselineQuestionOf(s), false)
      const g = gradeBaseline(s, raw)
      results.samples.push({ id: s.id, task: s.task, mode: 'baseline', ok: g.ok, got: g.got, answer: s.answer, conf: null, raw: raw.slice(0, 200) })
      console.log(`  ${g.ok ? '✅' : '❌'} ${s.id} [baseline] got=${JSON.stringify(g.got)} want=${JSON.stringify(typeof s.answer === 'boolean' ? (s.answer ? '是' : '否') : s.answer)}`)
    } catch (e) {
      results.errors.push({ id: s.id + '/baseline', err: String(e?.message || e) })
      console.log(`  ⚠ ${s.id}/baseline 调用失败：${String(e?.message || e)}`)
    }
  }
}

/* ── 汇总 ── */
const typed = results.samples.filter((x) => x.mode === 'typed')
const base = results.samples.filter((x) => x.mode === 'baseline')
const rate = (arr) => (arr.length ? arr.filter((x) => x.ok).length / arr.length : null)
const accT = rate(typed), accB = rate(base)

// G2-b 排序性：按 confidence 中位数切两半，比较高半是否更准
let rankOk = null
const withConf = typed.filter((x) => typeof x.conf === 'number')
if (withConf.length >= 4) {
  const sorted = [...withConf].sort((a, b) => a.conf - b.conf)
  const half = Math.floor(sorted.length / 2)
  const low = rate(sorted.slice(0, half)), high = rate(sorted.slice(sorted.length - half))
  rankOk = (high ?? 0) >= (low ?? 0)
  results.rankSplit = { low: low, high: high, n: withConf.length }
}

const gateAcc = (accT === null) ? null : (accB === null ? null : accT >= accB * 0.9)
results.summary = {
  typed: { n: typed.length, acc: accT },
  baseline: { n: base.length, acc: accB },
  gateG2a: gateAcc,
  gateG2b: rankOk,
  errors: results.errors.length,
}

console.log('')
console.log('════════ G2 闸门结果 ════════')
console.log(`模型 ${MODEL} @ ${BASE}`)
console.log(`类型化（评估通道形态）：${typed.filter((x) => x.ok).length}/${typed.length} = ${accT === null ? '-' : (accT * 100).toFixed(1) + '%'}`)
console.log(`基线（自由作答）      ：${base.filter((x) => x.ok).length}/${base.length} = ${accB === null ? '-' : (accB * 100).toFixed(1) + '%'}`)
if (results.rankSplit) console.log(`G2-b 排序性：高置信 ${(results.rankSplit.high * 100).toFixed(1)}% vs 低置信 ${(results.rankSplit.low * 100).toFixed(1)}%（n=${results.rankSplit.n}）`)
console.log(`G2-a 准确率 ≥ 基线×90%：${gateAcc === null ? '无法判定（缺基线）' : (gateAcc ? '✅ PASS' : '❌ FAIL')}`)
console.log(`G2-b 置信度排序性    ：${rankOk === null ? '样本不足，未判' : (rankOk ? '✅ PASS' : '❌ FAIL')}`)
console.log('⚠ 校准性（confidence 数值是否名副其实）**未验**——须 A 档真概率，本件不做（如实标注）')
console.log(`错误 ${results.errors.length} 条`)

/* ── 落档（含真实记忆内容 ⇒ 落 _memory/ 或记忆库 audit，**不落 docs/ 公开树**） ── */
try {
  const out = join(BANK, 'audit', `eval-gate-${new Date().toISOString().slice(0, 10)}.json`)
  if (existsSync(join(BANK, 'audit'))) {
    writeFileSync(out, JSON.stringify(results, null, 2), 'utf8')
    console.log(`报告已落：${out}`)
  } else { console.log('（未落盘：记忆库 audit 目录不存在）') }
} catch (e) { console.log(`（落盘失败：${String(e?.message || e)}）`) }

if (accT === null) process.exit(3)
const pass = (gateAcc !== false) && (rankOk !== false)
process.exit(pass ? 0 : 1)
