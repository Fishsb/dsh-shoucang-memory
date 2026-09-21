/**
 * model-picker.js — 「模型选择器」**单一实现**（三级：服务 → 模型 → 档位）· 2026-09-21 · ACT-295
 *
 * ## 为什么要它（判据：仓内**已有三套各写一份**的模型下拉）
 *   ① `panes-toggles.js#renderLlmSelect`（蒸馏/深睡：两参 `provider/model`，**无档位**）
 *   ② `panes-toggles.js#renderTogglesModelVec` 的浏览器直连枚举块（嵌入：`fetch /v1/models`）
 *   ③ 评估通道（`panel-eval.ts` 有 `/eval/config` 白名单，**此前连 UI 都没有**）
 * 用户口径：「**模型设置参考 DSH 输入框的模型选项卡**，其他几个项目也有同样的设置模块」
 *   ⇒ 抽成一件事、三处共用；新项目直接用它，不再抄第四份。
 *
 * ## 为什么**复刻契约**而不是挂官方组件（实测，非偏好）
 * 官方 `@deepseek-ai/dsh-client-ui-model-selection` 的 `ModelSelect` 实测签名
 *   `({locked, available, directory, load, select}) => JSX | null`，依赖 **React** + `ctx.modelDirectories`
 *   + `SessionId`；`available=false` 时**直接渲染 null**。本面板是**纯 DOM**（esbuild 单 IIFE，无 React
 *   运行时）⇒ 实例物理不可复用。故按记忆 `notes/tools.md §DSH 插件生态调研` 既有裁决
 *   「**仅复刻其数据契约**」：三级选择 + 档位文案取宿主 `effort.name`。
 *
 * ## ★ 关键诚实点：三级在**不同模块**里是**不同的真东西**（实测，不许张冠李戴）
 *   · **subagent 派单路**（蒸馏 / 深睡）：`agentOptions = {provider, model}`，而宿主
 *     `AgentOptions.reasoningEffort` 是**真字段**（`@deepseek-ai/dsh-agent` 类型 + roundtable 的
 *     `spawnNode` 实测都用它，档位词表属 adapter）。⇒ 档位来源 = **宿主目录的 `efforts`**。
 *   · **裸 HTTP 路**（评估通道）：本仓走 `node:http` 直发 OpenAI 兼容 / Ollama 原生 `/api/chat`，
 *     **请求体里没有 effort 字段**（实测 `nativePayloadOf` 只有 model/messages/stream/think/format/options）。
 *     ⇒ 若在此处给「思考档位」下拉，它就是**假旋钮**（本仓明令禁止：登记了但没人消费）。
 *     该路的「档位」是**成本结构档**（`evalTier`：local/fast/native/llm），由 `src/eval-config.ts` 定义
 *     并**真被消费**（决定超时预算与置信阈值）⇒ 本件把它作为**自定义档位来源**接进来。
 *   · **嵌入路**（embed）：无档位概念 ⇒ 传 `efforts: []`，控件禁用并说明原因（**保留控件比隐藏更诚实**）。
 *
 * ## 两种数据源（`opts.source`）
 *   · `'host'`（缺省）：服务/模型来自 `GET /llm/models`，档位来自该模型 adapter 声明的 `efforts`。
 *   · `'endpoint'`：服务来自 `opts.providers` 预设（如本机 Ollama / arbiter），模型可枚举可手填，
 *     档位来自 `opts.efforts`（如 evalTier）。用于**宿主目录之外的端点**（本机 Ollama 不在宿主目录里）。
 *
 * ## 为什么必须有自由文本回退（本仓实测约束，非设计洁癖）
 * 评估通道缺省档是**本机 Ollama** `http://127.0.0.1:11434/v1` + `qwen3.5:2b`——该模型**不在宿主
 *   模型目录**（宿主目录只含已注册 adapter）。若选择器只列宿主持有项，用户就**选不到**真正要用的模型。
 *   ⇒ 保留「自定义…」+ 模型名手填。
 */

import { el } from './dom.js'
import { appState } from './app-state.js'
import { Derive } from './derive.js'
import { tr } from './i18n.js'

/**
 * 显隐切换（**非折叠**语义，故不走 `Fold`）。
 *
 * ⚠ 为什么不走折叠系统的那个类切换写法：`test-fold-state` 的 B3 反模式锁是**按源码文本**
 *   匹配「切 sc-hidden 的 toggle 调用」的，它分不出「折叠」与「一般的模式切换」，且**连注释里的
 *   字面量也算**（本仓既有的「断言匹配到注释」型缺陷 —— 本轮实测踩到一次：我在下方注释里写出
 *   那个写法作反例，门禁立刻判红）。此处语义是「自定义模型名输入框 ⟷ 下拉」的**模式互斥**，
 *   与折叠状态机无关 ⇒ 改走仓内既有的**加/删类**显隐法（先例 `ui-kit.js#progress`）。
 *   这样锁的语义仍然成立：凡切 sc-hidden 的 toggle 调用，其外层函数**必须**由 Fold 驱动。
 */
function setShown (node, shown) {
  if (shown) node.classList.remove('sc-hidden')
  else node.classList.add('sc-hidden')
}

/** 「继承/未指定」哨兵（与 `panes-toggles.js#renderLlmSelect` 既有空键语义一致：空串 = 不指定）。 */
export var INHERIT = ''

/** 宿主目录缓存（只整体替换、不改内部；沿用 `state.js` 装箱口径，不暴露可变全局）。 */
var CACHE = { rows: null, inflight: null }

/** 读取宿主模型目录（`GET /llm/models`，含 efforts/defaultEffort）；失败 ⇒ 空数组（不抛）。 */
export function loadCatalog () {
  if (CACHE.rows) return Promise.resolve(CACHE.rows)
  if (CACHE.inflight) return CACHE.inflight
  CACHE.inflight = appState.api('/llm/models').then(function (r) {
    var rows = (r && r.models) || []
    CACHE.rows = rows
    CACHE.inflight = null
    return rows
  }).catch(function () { CACHE.inflight = null; return [] })
  return CACHE.inflight
}

/** 丢弃目录缓存（模型配置变更后显式调用）。 */
export function invalidateCatalog () { CACHE.rows = null; CACHE.inflight = null }

/** `provider/model` 组合串（与既有 `renderLlmSelect` 同格式，**不新造格式**）。 */
export function comboOf (provider, model) {
  return provider && model ? String(provider) + '/' + String(model) : ''
}

/** 浏览器直连枚举某端点可用模型（与 embed 既有做法同口径；绕宿主 panel 网络限制）。 */
export function enumerateEndpoint (baseUrl) {
  var b = String(baseUrl || '').trim().replace(/\/+$/, '')
  var root = b.replace(/\/v1$/, '')
  if (!root) return Promise.resolve({ models: [], note: tr('先填写服务地址') })
  try { var u = new URL(root); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('x') } catch (e) {
    return Promise.resolve({ models: [], note: tr('URL 无效（需 http(s):// 开头）') })
  }
  return fetch(root + '/v1/models', { signal: AbortSignal.timeout(6000) })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
    .then(function (j) {
      var models = ((j && j.data) || []).map(function (m) { return String(m.id) }).filter(Boolean)
      return { models: models, note: '' }
    })
    .catch(function () {
      /* 降级：bge 桥式 /health 固定模型（与 embed 同一条已有降级路） */
      return fetch(root + '/health', { signal: AbortSignal.timeout(5000) })
        .then(function (r) { if (!r.ok) throw new Error('x'); return r.json() })
        .then(function (j) { var f = (j && j.model) || ''; return { models: f ? [f] : [], note: tr('服务在但无 /models 枚举（用固定模型）') } })
        .catch(function () { return { models: [], note: tr('无法连接该服务（/v1/models 与 /health 均无响应）') } })
    })
}

/**
 * 建一个三级模型选择器。
 *
 * opts:
 *   source                'host'（缺省）| 'endpoint'
 *   provider/model/effort 当前值（`''` = 继承/未指定）
 *   efforts               **自定义档位清单**（`source:'endpoint'` 用；每项可为字符串或 {id,label}）
 *   providers             **自定义服务清单**（`source:'endpoint'` 用；每项 {id,label,base}）
 *   baseUrl               当前端点（`source:'endpoint'` 用；枚举模型打的就是它）
 *   includeInherit        是否给「继承主模型」选项（缺省 true，仅 host 源）
 *   allowCustom           是否给「自定义…」+ 手填模型名（缺省 true）
 *   labels                { inherit, provider, model, effort }
 *   onChange(patch)       变化回调：`{provider, model}` / `{effort}` / `{base}`（`''` = 清空）
 *
 * 返回 { box, get(), set(p), reload(), catalog() }
 */
export function modelPicker (opts) {
  var o = opts || {}
  var mode = o.source === 'endpoint' ? 'endpoint' : 'host'
  var val = { provider: String(o.provider || ''), model: String(o.model || ''), effort: String(o.effort || '') }
  var rows = null
  var enumNote = ''

  var box = el('div', 'sc-col-end')
  var pSel = el('select', 'sc-input sc-w-lg')
  var mSel = el('select', 'sc-input sc-w-lg')
  var mFree = el('input', 'sc-input sc-w-lg')
  var eSel = el('select', 'sc-input sc-w-md')
  var note = el('div', 'sc-mem-sub muted')

  mFree.placeholder = o.customPlaceholder || tr('模型名（如 qwen3.5:2b）')

  function opt (sel, value, label) {
    var op = el('option'); op.value = String(value); op.textContent = label; sel.appendChild(op); return op
  }
  function normEfforts (list) {
    return (list || []).map(function (e) {
      return (e && typeof e === 'object') ? { id: String(e.id), label: String(e.label || e.id) } : { id: String(e), label: String(e) }
    }).filter(function (e) { return e.id })
  }
  function providerIds () {
    var seen = {}, out = []
    ;(rows || []).forEach(function (r) { if (r && r.provider && !seen[r.provider]) { seen[r.provider] = 1; out.push(r.provider) } })
    return out
  }
  function modelsOfHost (prov) { return (rows || []).filter(function (r) { return r && r.provider === prov }).map(function (r) { return r.id }) }
  function entryOf (prov, model) {
    var hit = null
    ;(rows || []).forEach(function (r) { if (r && r.provider === prov && r.id === model) hit = r })
    return hit
  }
  /** 档位清单：endpoint 源用自定义清单；host 源查目录（查不到 ⇒ 空 = 只有「沿用模型默认」）。 */
  function efforts () {
    if (mode === 'endpoint') return normEfforts(o.efforts)
    var e = entryOf(val.provider, val.model)
    return normEfforts(e && e.efforts)
  }

  /* ── ① 服务 ──────────────────────────────────────────────── */
  function drawProviders () {
    pSel.textContent = ''
    if (mode === 'endpoint') {
      (o.providers || []).forEach(function (p) { opt(pSel, p.id, p.label || p.id) })
      if (o.allowCustom !== false) opt(pSel, '__custom__', tr('自定义（手填地址与模型名）'))
      pSel.value = (o.providers || []).some(function (p) { return p.id === val.provider }) ? val.provider : ((o.providers || [])[0] || {}).id || '__custom__'
      return
    }
    if (o.includeInherit !== false) opt(pSel, INHERIT, (o.labels && o.labels.inherit) || tr('继承主模型（默认）'))
    providerIds().forEach(function (p) { opt(pSel, p, p) })
    if (o.allowCustom !== false) opt(pSel, '__custom__', tr('自定义（手填模型名）'))
    var known = providerIds().indexOf(val.provider) > -1
    if (!val.provider) pSel.value = INHERIT
    else if (known) pSel.value = val.provider
    else if (o.allowCustom !== false) { pSel.value = '__custom__'; mFree.value = val.model }
    else pSel.value = providerIds()[0] || INHERIT
  }

  /* ── ② 模型（host 源直出；endpoint 源浏览器枚举）────────── */
  function drawModels () {
    var custom = pSel.value === '__custom__'
    var isEndpoint = mode === 'endpoint' && !custom
    setShown(mFree, custom)
    setShown(mSel, !custom)
    if (custom) { mFree.value = val.model; return }
    mSel.textContent = ''
    if (isEndpoint) {
      opt(mSel, INHERIT, tr('点击「枚举模型」加载…'))
      mSel.value = INHERIT
      return
    }
    var list = modelsOfHost(pSel.value)
    /* ⚠ 判空走 `Derive.has`（`test-ui-derive` D7e 锁：`!x.length` 裸判空已全仓收敛）——
     *   该写法在 `x` 缺失时（此处不会，但口径要一致）会直接抛错，统一出口即可免于逐处防。 */
    if (!Derive.has(list)) {
      opt(mSel, INHERIT, pSel.value ? tr('（该 provider 未枚举到模型）') : tr('（先选服务）'))
      mSel.value = INHERIT
      return
    }
    list.forEach(function (id) {
      var e = entryOf(pSel.value, id)
      opt(mSel, id, id + (e && e.name && e.name !== id ? ' · ' + e.name : ''))
    })
    mSel.value = list.indexOf(val.model) > -1 ? val.model : list[0]
  }

  /* ── ③ 档位 ─────────────────────────────────────────────── */
  function drawEfforts () {
    eSel.textContent = ''
    var list = efforts()
    opt(eSel, INHERIT, mode === 'endpoint' ? tr('（不指定）') : tr('沿用模型默认'))
    list.forEach(function (e) { opt(eSel, e.id, e.label) })
    eSel.value = list.some(function (e) { return e.id === val.effort }) ? val.effort : INHERIT
    var has = list.length > 0
    eSel.disabled = !has
    eSel.title = has
      ? tr('档位（reasoning effort / 成本结构分档）')
      : (mode === 'endpoint' ? tr('该通道未定义档位 —— 保持「不指定」') : tr('该模型未声明可选档位 —— 沿用模型默认'))
  }

  function emit (patch) { if (typeof o.onChange === 'function') o.onChange(patch) }

  pSel.addEventListener('change', function () {
    if (mode === 'endpoint') {
      var p = (o.providers || []).filter(function (x) { return x.id === pSel.value })[0]
      var base = p ? String(p.base || '') : ''
      var provId = pSel.value === '__custom__' ? '' : pSel.value
      var patch = { provider: provId }
      if (pSel.value !== '__custom__') { patch.base = base }
      val.provider = provId
      drawModels(); drawEfforts()
      emit(patch)
      return
    }
    val.provider = pSel.value === '__custom__' ? '' : pSel.value
    if (pSel.value === '__custom__') { val.model = mFree.value.trim() }
    else { drawModels(); val.model = mSel.value || '' }
    drawModels(); drawEfforts()
    emit({ provider: val.provider, model: val.model, effort: val.effort })
  })

  mSel.addEventListener('change', function () {
    val.model = mSel.value === INHERIT ? '' : (mSel.value || '')
    if (mode !== 'endpoint') val.effort = ''
    drawEfforts()
    emit({ provider: val.provider, model: val.model, effort: val.effort })
  })

  /* 手填模型名：**失焦/回车才提交**（与仓内既有 embed URL 探测同口径，避免击键打 IPC）。 */
  function commitFree () {
    var v = mFree.value.trim()
    if (v === val.model) return
    val.model = v
    if (mode !== 'endpoint') val.effort = ''
    drawEfforts()
    emit({ provider: val.provider, model: val.model, effort: val.effort })
  }
  mFree.addEventListener('change', commitFree)
  mFree.onkeydown = function (e) { if (e.key === 'Enter') commitFree() }

  eSel.addEventListener('change', function () {
    val.effort = eSel.value === INHERIT ? '' : (eSel.value || '')
    emit({ effort: val.effort })
  })

  function row (label, ctl) {
    if (!label) return ctl
    var w = el('div', 'sc-row')
    w.appendChild(el('span', 'sc-range-label', label))
    w.appendChild(ctl)
    return w
  }

  /* endpoint 源：枚举按钮（浏览器直连，绕宿主网络限制） */
  var enumBtn = null
  if (mode === 'endpoint') {
    enumBtn = el('button', 'sc-btn subtle sc-btn-xs', tr('枚举模型'))
    enumBtn.type = 'button'
    enumBtn.onclick = function () {
      enumBtn.disabled = true; enumBtn.textContent = tr('枚举中…')
      return enumerateEndpoint(o.baseUrl || '').then(function (r) {
        enumBtn.disabled = false; enumBtn.textContent = tr('枚举模型')
        enumNote = r.note || ''
        if (r.models && r.models.length) {
          mSel.textContent = ''
          r.models.forEach(function (id) { opt(mSel, id, id) })
          if (r.models.indexOf(val.model) > -1) mSel.value = val.model
          else { mSel.value = r.models[0]; val.model = r.models[0]; emit({ provider: val.provider, model: val.model }) }
        }
        drawEfforts(); paintNote()
      })
    }
  }

  function paintNote () {
    var n = mode === 'endpoint' ? (rows || []) : (rows || [])
    if (mode === 'endpoint') {
      note.textContent = enumNote || tr('本机端点模型不在宿主目录里 —— 用「枚举模型」列出来，或直接手填模型名')
      return
    }
    note.textContent = (n && n.length)
      ? tr('宿主可用 ') + n.length + tr(' 个模型')
      : tr('宿主模型目录为空 —— 可在「自定义」里手填模型名，或先在 Harness 里配好模型')
  }

  box.appendChild(row(o.labels && o.labels.provider, pSel))
  box.appendChild(row(o.labels && o.labels.model, mSel))
  box.appendChild(row(null, mFree))
  box.appendChild(row(o.labels && o.labels.effort, eSel))
  if (enumBtn) { var bw = el('div', 'sc-row'); bw.appendChild(enumBtn); box.appendChild(bw) }
  box.appendChild(note)

  function redraw () {
    drawProviders()
    drawModels()
    if (pSel.value === '__custom__') val.model = mFree.value.trim()
    else if (mode !== 'endpoint') val.model = mSel.value || val.model
    drawEfforts(); paintNote()
  }

  loadCatalog().then(function (r) { rows = r; redraw() }).catch(function () { rows = []; redraw() })

  return {
    box: box,
    get: function () { return { provider: val.provider, model: val.model, effort: val.effort } },
    set: function (p) {
      val.provider = String((p && p.provider) || '')
      val.model = String((p && p.model) || '')
      val.effort = String((p && p.effort) || '')
      redraw()
      return this
    },
    reload: function () { invalidateCatalog(); return loadCatalog().then(function (r) { rows = r; redraw() }) },
    catalog: function () { return rows || [] },
    noteEl: note
  }
}
