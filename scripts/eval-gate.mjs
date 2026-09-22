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
import { buildSamples } from './eval-samples.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const has = (k) => argv.some((a) => a === k || a.startsWith(k + '='))

const BASE = argOf('--base', process.env.EVAL_BASE_URL || 'http://127.0.0.1:11434/v1')
const MODEL = argOf('--model', process.env.EVAL_MODEL || 'qwen3:8b')
const ONLY = argOf('--only', '')
const TIMEOUT = Number(argOf('--timeout', '120000'))
const BANK = argOf('--bank', process.env.MEMORY_ROOT || join(homedir(), '.dsh', 'suite', 'memory'))
/* 样本量：**缺省 1/任务**（= 3 条 × 2 模式 = 6 次模型调用）。
 *  ⚠ **这个缺省只够"冒烟"（证明链路通），不足以出结论** —— 而**不够时本件判 `skip`、不判 PASS**
 *    （见下方 `MIN_JUDGE_N` 与 G2-a 的三态判定）。要出有统计意义的读数须**显式** `--n ≥8`。
 *  **实测耗时（本机 qwen3:8b @ Ollama）**：单次 ≈ **12.7s**，闸门内（长 prompt）≈ **21s/次**
 *    ⇒ `--n 2`（12 次调用）实测 **249s**，而 `check-runner` 看门狗上限 **300s** ⇒ 缺省取 2 都可能被杀。
 *  ⚠ **并发无效（实测）**：4 并发 50.4s vs 串行预估 50.8s ⇒ Ollama 侧本就串行
 *    ⇒ 想跑满 `--n 8`（48 次 × ~21s ≈ **17 分钟**）只能接受墙钟，**不能靠并行压缩**
 *    （故本件在 `CHECKS` 里登记为 `{ slow: true }`，`--fast` 时跳过）。
 *  ⚠ **不与旧值比准确率**：迁前那 20 条内嵌样本实测三处结构性失效（字面泄漏 8/20 ·
 *    镜像对 8/20 · 真独立样本仅 4）⇒ 其 95% **不可解读**，拿它当基线是拿污染值当锚。 */
const N = Number(argOf('--n', '1')) || 1
const LIMITS = N > 0 ? { t1: N, t2: N, t3: N } : undefined

/* ══ 样本集：**运行期从真库取材**（不再内嵌） ══════════════════════════════════
 * ⚠ **2026-09-21 迁（隐私红线 · ACT-289 遗留风险清账）**：
 *   本文件**原先内嵌 20 条真实记忆库原文**（`state:` 字面量），而 `scripts/` 是**公开树**（git 跟踪）
 *   ⇒ 实测其中 **16/20 条与运行库画像文件逐字重合**，即**私人记忆内容已在公开面**
 *   （`check-public-tree` 按路径/模式扫，**不查正文语义** ⇒ 漏过）。
 *   ⚠ **本文档亦不复述那些原文**（引一句样本进注释 = 内容仍在公开树，等于没清）。
 *   ADR-290 已建接收端 `scripts/eval-samples.mjs`（构建器内**零记忆内容**，样本运行期从 `<bank>` 读，
 *   产物落 `_memory/audit/` 已 gitignore），**前代未迁** ⇒ 本轮补迁。
 *   ⇒ 本文件从此**零记忆原文**；`check-eval-samples` ⑨ 的反例自证继续守构建器。
 *
 * 任务形态对齐方案 §3 册二三通道准入（答案可枚举）：T1 choice 标签归类 · T2 boolean 概况归属 · T3 choice 小节归属。
 * ⚠ 答案由**构建器按 provenance 派生**（真行的真标签 / 真小节），**不从模型回读** —— 否则是自证。
 */
const SAMPLES = (() => {
  if (!existsSync(BANK)) { console.error(`⏭ skip：记忆库不存在（${BANK}）`); process.exit(3) }
  const built = buildSamples({ bank: BANK, limits: LIMITS })
  for (const w of built.warnings) console.error(`  ⚠ 采样告警：${w}`)
  return built.samples
})()

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

/* ⚠⚠ **2026-09-21 修：G2-a 的"平凡通过"（本轮我自己引入并当场实测抓到）** ──────────────────
 *   判因：缺省样本量收到 1/任务后实测输出 `类型化 0/3 = 0.0%` / `基线 0/3 = 0.0%`
 *     而 G2-a 判据是 `accT >= accB * 0.9` ⇒ **`0 >= 0` 为真 ⇒ ✅ PASS**。
 *     **零准确率、零证据，却报通过** —— 这正是本仓反复剿的形态
 *     （同族：`inject-dedup-probe` 的"输入为空 ⇒ 跳过断言 ⇒ PASS"· §0o ④）。
 *   ⇒ 修法（**两条，缺一不可**）：① 判据要求**基线非零**（`accB > 0`）—— 基线为 0 时
 *      "相对基线的 90%" **无意义**（0 的 90% 还是 0，任何模型都能"达标"）；
 *      ② **样本量下限**：`MIN_JUDGE_N` 条/任务以下 ⇒ 判 **skip（exit 3）**，**不判 PASS**。
 *      依据（本仓 `[原则] 条件式验收` / `[原则] 输入量须可见化`）：N 太小或分母为 0，
 *      只能"未取证"，**不得**因为不等式恰好在退化点成立而给绿。 */
const MIN_JUDGE_N = 8
const samplesEnough = typed.length >= MIN_JUDGE_N && base.length >= MIN_JUDGE_N
const baseNonZero = accB !== null && accB > 0
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

/* G2-a 三态：`true` 达标 / `false` 不达标 / `null` **未取证**（样本不足 或 基线为 0） */
const gateAcc = (accT === null || accB === null) ? null
  : (!samplesEnough || !baseNonZero) ? null
  : (accT >= accB * 0.9)
results.summary = {
  typed: { n: typed.length, acc: accT },
  baseline: { n: base.length, acc: accB },
  gateG2a: gateAcc,
  gateG2b: rankOk,
  minJudgeN: MIN_JUDGE_N,
  samplesEnough,
  baseNonZero,
  evidenceNote: gateAcc === null ? (!samplesEnough ? `样本不足（须 ≥${MIN_JUDGE_N}/模式；实测 typed=${typed.length} baseline=${base.length}）⇒ **未取证**` : '基线为 0 ⇒ “≥基线×90%”无意义 ⇒ **未取证**') : '',
  errors: results.errors.length,
}

console.log('')
console.log('════════ G2 闸门结果 ════════')
console.log(`模型 ${MODEL} @ ${BASE}`)
console.log(`类型化（评估通道形态）：${typed.filter((x) => x.ok).length}/${typed.length} = ${accT === null ? '-' : (accT * 100).toFixed(1) + '%'}`)
console.log(`基线（自由作答）      ：${base.filter((x) => x.ok).length}/${base.length} = ${accB === null ? '-' : (accB * 100).toFixed(1) + '%'}`)
if (results.rankSplit) console.log(`G2-b 排序性：高置信 ${(results.rankSplit.high * 100).toFixed(1)}% vs 低置信 ${(results.rankSplit.low * 100).toFixed(1)}%（n=${results.rankSplit.n}）`)
console.log(`G2-a 准确率 ≥ 基线×90%：${gateAcc === null ? `⏭ **未取证**（${results.summary.evidenceNote}）` : (gateAcc ? '✅ PASS' : '❌ FAIL')}`)
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
/* ⚠ **未取证 ⇒ exit 3（skip），不得 exit 0** —— 这是本次修的要点：/
 *   旧实现 `pass = (gateAcc !== false) && (rankOk !== false)` 在 `gateAcc === null` 时
 *   因 `null !== false` 为真而**放行** ⇒ 样本不足/基线为 0 时**报通过**。 */
if (gateAcc === null) {
  console.log(`\n⏭ skip：G2-a **未取证**（${results.summary.evidenceNote}）—— 按本仓契约 exit 3 = skip，**不算通过**`)
  process.exit(3)
}
const pass = (gateAcc !== false) && (rankOk !== false)
process.exit(pass ? 0 : 1)
