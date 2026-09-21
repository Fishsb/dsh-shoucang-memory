/**
 * panes-eval.js — 「评估通道」面板卡（按需开 + 可设置模型）· 2026-09-21 · ACT-295
 *
 * ## 用户口径（本件的存在理由）
 * 「**面板里按需开**，并且**调整为可设置模型**，模型设置参考 **DSH 输入框的模型选项卡**，
 *   其他几个项目也有同样的设置模块」
 * 此前评估通道 M1–M4 只做了**后端**（`/eval/config` · `/eval/test` · `/eval/stats`）与观测页的
 *   **只读测试按钮** ⇒ 用户要开它只能手写 `~/.dsh/suite/scheduler.json`。本件补齐这个缺口。
 *
 * ## 为什么单独成件（门禁指路，不是偏好）
 * `panes-toggles.js` 实测 **568 行**，而 `check-module-growth` 的 `FREEZE_THRESHOLD = 600`
 *   （≥600 即须登记基线冻结、只许降）⇒ 整块评估卡塞进去**必然越线**，抬基线属 R3。
 *   按领域接缝单独成件是本仓既有出路（同 `panes-observe` / `panes-arch` / `panes-suite` 切法）。
 *
 * ## ★ 本件用 `model-picker` 的 **endpoint 源**，且**档位是真被消费的 `evalTier`**
 * 判因（实测，见 `model-picker.js` 头注）：评估通道走 `node:http` 直发 OpenAI 兼容 / Ollama 原生
 *   `/api/chat`，**请求体里没有 reasoning-effort 字段** ⇒ 在此处摆一个「思考档位」下拉就是**假旋钮**。
 *   该路真实存在且**真被消费**的档位是 `evalTier`（local/fast/native/llm）——它决定**超时预算**
 *   （本机 60s / 远端 15s，`eval-channel.ts:248`）与**置信阈值口径**（native 用校准 0.9/0.5，
 *   其余用保守 0.95/0.7，`eval-ledger.ts`）⇒ 故把它作为档位接进来，不是装饰。
 *
 * ## 与观测页的分工（**不重复**）
 *   本件（参数页）= **写**着面：开关 / 模型 / 端点 / 档位 / 出网许可 / 连通性测试。
 *   `panes-observe.js` = **读**着面：测试结果与 `/eval/stats` 分态统计（已存在，保持不动）。
 */

import { UI } from './ui-kit.js'
import { el } from './dom.js'
import { appState } from './app-state.js'
import { tr } from './i18n.js'
import { modelPicker } from './model-picker.js'

/* ⚠ **装载期不得调用 tr()**（`check-i18n-redlines` R4 实测抓到过本轮）：
 *   在模块顶层写的 `tr('…')` 只求值一次并把**当时的中文**冻进常量表 ⇒ 切到英文也不生效。
 *   ⇒ 这里只放**语言无关**的数据（id / base），文案一律在渲染期（`renderEvalCard` 内）用 tr() 取。 */
var PROVIDER_ROWS = [
  { id: 'ollama', base: 'http://127.0.0.1:11434/v1' },
  { id: 'arbiter', base: 'http://127.0.0.1:8010/v1' },
  { id: 'cloud', base: '' }
]

/** 档位 = **成本结构分档**（与 `src/eval-config.ts#EVAL_TIERS` 同集；顺序即推荐序）。 */
var TIER_IDS = ['local', 'fast', 'native', 'llm']

/** 画「评估通道」卡（追加进 host）。 */
export function renderEvalCard (host) {
  /* 文案在**渲染期**求值（装载期求值会被 R4 判红：中文冻死、切语言不生效） */
  var PROVIDER_LABEL = {
    ollama: tr('本机 Ollama（零成本 · 免 key）'),
    arbiter: tr('本机 arbiter（Laya / Jev 快模型）'),
    cloud: tr('自定义 OpenAI 兼容（云端）')
  }
  var TIER_LABEL = {
    local: tr('本机（零成本 · 免 key）'),
    fast: tr('远程小快模型'),
    native: tr('原生校准型'),
    llm: tr('现有大模型')
  }
  var PROVIDERS = PROVIDER_ROWS.map(function (p) { return { id: p.id, base: p.base, label: PROVIDER_LABEL[p.id] } })
  var TIERS = TIER_IDS.map(function (id) { return { id: id, label: TIER_LABEL[id] } })

  var wrap = el('div')
  wrap.appendChild(el('div', 'sc-h3', tr('评估通道（可配置模型 · 按需开启）')))
  wrap.appendChild(el('div', 'sc-desc', tr('把「答案可枚举、但判据写不成代码」的判定交给一个可配置模型。**默认关闭**：关闭时行为与未装此能力逐字节一致。改动写 ~/.dsh/suite/scheduler.json，**重载插件后生效**。')))

  var zone = el('div')
  zone.appendChild(el('div', 'sc-desc', tr('读取中…')))
  wrap.appendChild(zone)
  host.appendChild(wrap)

  function save (patch, okMsg, onFail) {
    return appState.api('/eval/config', { method: 'POST', body: JSON.stringify(patch) })
      .then(function () { appState.statusFn('✓ ' + (okMsg || tr('已写入')) + tr('（重载后生效）')) })
      .catch(function (e) { appState.failFn(e); if (onFail) onFail() })
  }

  appState.api('/eval/config').then(function (c) {
    var eff = (c && c.effective) || {}
    var persisted = (c && c.persisted) || {}
    var tiers = (c && c.tiers) || ['local', 'fast', 'native', 'llm']
    var isOn = eff.evalEnabled === true
    var baseUrl = String(eff.evalBaseUrl || '')

    zone.textContent = ''

    /* ── ① 总开关（「面板里按需开」）────────────────────────── */
    var sw = el('input', 'checkbox-container'); sw.type = 'checkbox'; sw.checked = isOn
    sw.onchange = function () {
      save({ evalEnabled: sw.checked }, sw.checked ? tr('评估通道 开') : tr('评估通道 关'), function () { sw.checked = !sw.checked })
    }
    zone.appendChild(UI.item(
      tr('启用评估通道 evalEnabled'),
      tr('开=类型化判定可用（choice / boolean / score）；关=通道整体停用（缺省关，fail-closed）。写入 scheduler.json。'),
      sw
    ))

    /* ── ② 端点：先定端点（模型要拿它枚举）─────────────────── */
    var dlist = el('datalist'); dlist.id = 'sc-eval-endpoints'
    PROVIDERS.forEach(function (p) { if (p.base) { var o = el('option'); o.value = p.base; dlist.appendChild(o) } })
    ;['https://api.openai.com/v1', 'https://api.deepseek.com/v1'].forEach(function (ep) { var o = el('option'); o.value = ep; dlist.appendChild(o) })
    document.body.appendChild(dlist)

    var urlInp = el('input', 'sc-input sc-w-xl')
    urlInp.value = baseUrl
    urlInp.placeholder = 'http://127.0.0.1:11434/v1'
    urlInp.setAttribute('list', 'sc-eval-endpoints')

    var keyInp = el('input', 'sc-input sc-w-md')
    keyInp.value = String(eff.evalApiKeyEnv || '')
    keyInp.placeholder = tr('key 环境变量名（本机免填）')

    var eRow = el('div', 'sc-col-end')
    eRow.appendChild(urlInp); eRow.appendChild(keyInp)
    zone.appendChild(UI.item(
      tr('服务地址（OpenAI 兼容 /v1 根）与 key 环境变量'),
      tr('本机端点免 key；远端端点须另开出网许可（见下）。地址按**解析后的主机名**判是否本机——127.0.0.1.evil.com 这类伪造不会被当成本机。'),
      null,
      { children: [eRow] }
    ))

    /* ── ③ 模型（三级选择器；模型名可枚举可手填）───────────── */
    var picker = modelPicker({
      source: 'endpoint',
      provider: 'ollama',
      model: String(eff.evalModel || ''),
      efforts: TIERS,
      providers: PROVIDERS,
      baseUrl: baseUrl,
      customPlaceholder: tr('模型名（如 qwen3.5:2b / jev-latest）'),
      labels: { provider: tr('服务'), model: tr('模型'), effort: tr('档位') },
      onChange: function (p) {
        if (p.base !== undefined) { urlInp.value = String(p.base || ''); picker && (picker.baseUrl = p.base) }
        var patch = {}
        if (p.model !== undefined) patch.evalModel = p.model || ''
        if (p.effort !== undefined) patch.evalTier = p.effort || 'local'
        if (Object.keys(patch).length) save(patch, tr('评估通道配置已设'))
      }
    })
    if (picker && urlInp) urlInp.addEventListener('change', function () { picker.noteEl && (picker.noteEl.textContent = '') })
    zone.appendChild(UI.item(
      tr('评估模型'),
      tr('三级选择（服务 → 模型 → 档位）。服务选好先「枚举模型」（浏览器直连该端点），或直接手填模型名——本机 Ollama 的模型不在宿主目录里，手填是常态。'),
      null,
      { children: [picker.box] }
    ))

    /* ── ④ 出网许可（与开关**分离**的第二项授权）──────────── */
    var egress = el('input', 'checkbox-container'); egress.type = 'checkbox'; egress.checked = eff.evalEgressAllow === true
    egress.onchange = function () {
      save({ evalEgressAllow: egress.checked }, egress.checked ? tr('已允许出网') : tr('已禁止出网'), function () { egress.checked = !egress.checked })
    }
    zone.appendChild(UI.item(
      tr('允许出网 evalEgressAllow'),
      tr('与开关**分离**的两项授权：「允许装外部服务」≠「允许记忆内容出机」。缺省 false；填了远端地址但未勾此项 ⇒ 拒发并如实记 egress-denied。'),
      egress
    ))

    /* ── ⑤ 保存端点与档位（端点改动不即时提交，避免半截配置）─ */
    var tierSel = el('select', 'sc-input sc-w-lg')
    TIERS.forEach(function (t) {
      if (tiers.indexOf(t.id) === -1) return // 以服务端 tiers 为准，不发明档位
      var o = el('option'); o.value = t.id; o.textContent = t.label; tierSel.appendChild(o)
    })
    tierSel.value = String(eff.evalTier || 'local')

    var saveBtn = el('button', 'sc-btn', tr('保存端点与档位'))
    saveBtn.type = 'button'
    saveBtn.onclick = function () {
      saveBtn.disabled = true; saveBtn.textContent = tr('保存中…')
      save({
        evalBaseUrl: urlInp.value.trim(),
        evalApiKeyEnv: keyInp.value.trim() || 'EVAL_API_KEY',
        evalTier: tierSel.value
      }, tr('端点与档位已设'), function () { saveBtn.disabled = false; saveBtn.textContent = tr('保存端点与档位') })
        .then(function () { saveBtn.disabled = false; saveBtn.textContent = tr('保存端点与档位') })
    }

    var tierRow = el('div', 'sc-col-end')
    tierRow.appendChild(tierSel); tierRow.appendChild(saveBtn)
    zone.appendChild(UI.item(
      tr('档位 evalTier'),
      tr('按**成本结构**分档（不是按厂商）：本机零成本 / 远程小快 / 原生校准 / 现有大模型。档位决定**超时预算**（本机推理含模型加载给 60s、远端快模型 15s）与**置信阈值口径**（原生档用校准阈值，其余用保守阈值）。'),
      null,
      { children: [tierRow] }
    ))

    /* ── ⑥ 连通性测试（写侧就地验证；读侧统计仍在观测页）──── */
    var res = el('div', 'sc-desc', tr('未测试'))
    var testBtn = UI.button(tr('测试连通性'), function () {
      res.textContent = tr('测试中…') + ' ' + String(urlInp.value || '')
      return appState.apiCtx('/eval/test', { method: 'POST', body: '{}' }, tr('评估通道')).then(function (r) {
        if (!r) { res.textContent = tr('无响应'); return }
        if (r.ok) res.textContent = '✓ ' + tr('可用') + ' · ' + String(r.latencyMs || 0) + 'ms · ' + String(r.outcome || '')
        else if (r.outcome === 'off') res.textContent = '⚠ ' + tr('通道已关闭——先打开上方开关并重载') + '（why=' + String(r.why || '') + '）'
        else res.textContent = '✗ ' + String(r.outcome || '') + ' · ' + String(r.why || '')
      })
    }, { async: true, busyText: tr('测试中…'), okText: tr('评估通道连通性测试完成') })
    zone.appendChild(UI.item(
      tr('连通性测试'),
      tr('POST /eval/test —— 发一次最小判定，返回**分态**结果（ok / off / egress-denied / key-missing / unreachable / bad-body / type-violation），不落库。'),
      testBtn
    ))
    zone.appendChild(res)

    if (persisted.evalEnabled === false) {
      zone.appendChild(el('div', 'sc-desc', tr('当前为显式关闭态（scheduler.json 里 evalEnabled=false）。')))
    }
  }).catch(function (e) {
    zone.textContent = ''
    zone.appendChild(el('div', 'sc-desc', tr('⚠ 评估通道配置读取失败：') + e.message))
  })
}
