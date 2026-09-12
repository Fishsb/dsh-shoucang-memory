/**
 * 生成「改造后面板」展示页。
 *
 * 与 gen-ui-preview 的差别：那个是设计系统回归台（只渲染导航 + 记忆板块样例），
 * 本件展示**本次 IA 重排后的真实视图**：新导航（一项一图标）、运行总览首屏、
 * 参数页 4 Tab、记忆库 5 Tab。
 *
 * 同源保证（不复制粘贴）：
 *   - CSS  从 client.js 的 `var CSS = [...].join('')` 原地 eval 抽取
 *   - 图标 从 `var ICONS = {...}` 抽取
 *   - 导航 从 `var VIEWS = [...]` 抽取（分组按第 4 项聚合）
 * ⇒ client.js 再改，重跑本脚本即可；结构与文案变化才需要改本文件。
 *
 * 用法：node scripts/gen-ui-after.mjs
 * 产物：deliverables/ui-after-2026-09-12.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const text = readFileSync(join(root, 'client.js'), 'utf8')

/* ── 1. 抽取 CSS / ICONS / VIEWS（原地求值，与线上同源） ── */
const grab = (re, label) => {
  const m = text.match(re)
  if (!m) throw new Error('抽取失败：' + label)
  return m[1]
}
// eslint-disable-next-line no-eval
const css = eval(grab(/var CSS = (\[[\s\S]*?\n      \]\.join\(''\));/, 'CSS'))
// eslint-disable-next-line no-eval
const ICONS = eval('(' + grab(/var ICONS = (\{[\s\S]*?\n      \});/, 'ICONS') + ')')
// eslint-disable-next-line no-eval
const VIEWS = eval('[' + grab(/var VIEWS = \[([\s\S]*?)\n      \];/, 'VIEWS') + ']')

const svg = (paths, size) => {
  const s = size || 16
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    String(paths).split('|').map((d) => '<path d="' + d.trim() + '"/>').join('') +
    '</svg>'
}

/* ── 2. 导航（由 VIEWS 生成，分组按 v[3]） ── */
function buildNav() {
  let html = '<div class="sc-nav-title">守藏 SHOUCANG</div>'
  let lastGroup = null
  VIEWS.forEach((v, i) => {
    if (v[3] && v[3] !== lastGroup) { html += '<div class="sc-nav-group">' + v[3] + '</div>'; lastGroup = v[3] }
    html += '<div class="sc-nav-item' + (i === 0 ? ' active' : '') + '" data-view="' + v[0] + '">' +
      svg(ICONS[v[2]]) + '<span>' + v[1] + '</span></div>'
  })
  html += '<div class="sc-nav-spacer"></div>' +
    '<div class="sc-nav-foot"><div class="sc-nav-health"><span class="sc-dot ok"></span>记忆库 <b>正常</b></div>' +
    '<div class="sc-nav-sub">~/.dsh/skills/managing-memory</div></div>'
  return html
}

/* ── 3. 各视图内容（复刻改造后的真实 DOM 结构） ── */
const pageHead = (t, d, acts) =>
  '<div class="sc-pagehead"><h2 class="sc-h1">' + t + '</h2><div class="sc-desc">' + d + '</div>' +
  (acts ? '<div class="sc-head-acts">' + acts + '</div>' : '') + '</div>'

const btn = (t, primary) => '<button class="sc-btn' + (primary ? ' sc-btn-primary' : '') + '">' + t + '</button>'

const badge = (t, kind) => '<span class="sc-ds-badge ' + kind + '"><span class="sc-dot ' + kind + '"></span>' + t + '</span>'

const kpi = (label, val, sub) =>
  '<div class="sc-mem-stat"><div class="sc-mem-stat-label">' + label + '</div>' +
  '<div class="sc-mem-stat-value">' + val + '</div>' +
  '<div class="sc-mem-stat-sub">' + sub + '</div></div>'

const item = (name, desc, control) =>
  '<div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">' + name +
  '</div><div class="setting-item-desc">' + desc + '</div></div>' +
  '<div class="setting-item-control">' + control + '</div></div>'

const sw = (on) => '<div class="checkbox-container' + (on ? ' is-enabled' : '') + '"><span class="checkbox-material"></span></div>'
const inp = (v, w) => '<input class="sc-input" type="text" value="' + v + '"' + (w ? ' style="width:' + w + 'px"' : '') + '>'
const sel = (opts) => '<select>' + opts.map((o, i) => '<option' + (i === 0 ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>'
const row = (a, b, c) => '<div class="sc-idx-row"><span class="sc-idx-tag">' + a + '</span>' +
  '<span class="sc-idx-subject">' + b + '</span><span class="sc-idx-pointer">' + c + '</span></div>'
const kv = (k, v) => '<div class="sc-kv-row"><span class="sc-kv-k">' + k + '</span><span class="sc-kv-v">' + v + '</span></div>'

const tabs = (names) => '<div class="sc-tabs">' + names.map((n, i) =>
  '<button class="sc-tab' + (i === 0 ? ' on' : '') + '" data-tab="' + i + '">' + n + '</button>').join('') + '</div>'

const V = {}

V.overview = pageHead('运行总览', '一屏看清记忆库容量、蒸馏进度、睡眠状态与向量档健康度。异步区块读取中会先显示占位。',
  btn('刷新') + btn('立即蒸馏', true)) +
  '<div class="sc-ds-badges">' +
  badge('认知环 快 23/慢 7', 'ended') + badge('判据台账 1,284 行', 'ended') +
  badge('库版本 417 提交', 'ended') + badge('向量 fusion', 'running') + badge('深睡 待触发 · 09-12 16:42', 'ended') +
  '</div>' +
  '<div class="sc-mem-grid">' +
  kpi('记忆库容量', '62%', '12,480 / 20,000 字符 · 86 行') +
  kpi('蒸馏', '128 次', '入册 342 条 · 候选 9 · 失败 4') +
  kpi('深度睡眠', '待触发', '下次可睡 09-12 16:42 · 会话 52 个') +
  kpi('向量档', '3,204 行', 'bge-m3 · 412 KB') +
  '</div>' +
  '<div class="sc-mem-group-title">快捷操作</div>' +
  item('立即蒸馏', 'POST /distill/run —— 不等会话空闲，立即跑一轮事件蒸馏（携带 pending 候选回流）。', btn('执行')) +
  item('立即深睡', 'POST /deepsleep/trigger —— 离线回想，提炼「[原则]/[路径]」并执行结构整理与归档（禁直删）。', btn('执行')) +
  item('运行自检', 'POST /selfcheck/run —— 校验判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账六项。', btn('执行')) +
  '<div class="sc-mem-group-title">最近动态</div>' +
  '<div class="sc-idx-list">' +
  '<div class="sc-mem-sub">晨起摘要（注入 14 次）</div>' +
  '<div class="sc-mem-sub">· 部署链路最后一跳是用户热重载</div>' +
  '<div class="sc-mem-sub">· G-20 读方根因 = resolveWatermark 返回 null</div>' +
  '<div class="sc-mem-sub">近 7 天深睡新习得 12 条</div>' +
  '<div class="sc-mem-sub">2026-09-12  原则 +3/替换 1 · 画像 +2 · gate=completed</div>' +
  '</div>' +
  '<div class="sc-mem-group-title">系统状态</div>' +
  // 零硬编码本机路径红线（规则 1 / scripts/check-hardcode.mjs）：此处是**展示原型**的示例文案，
  // 本就不需要真实路径；写真实盘符既违规，也会把本机目录带进可分享的 HTML 产物。
  '<div class="sc-kv">' + kv('当前根目录', '<仓库根>') + kv('注入统计', '14 次 · 09-12 14:02') + '</div>'

V.memory = pageHead('记忆库', '索引 / 候选 / 笔记 / 归档 / 运行态 五个分区已收进 Tab，一次只面对一组。系统级概览见「运行总览」，画像（USER/AGENT）见「画像」。') +
  '<div class="sc-tabbox">' + tabs(['索引', '候选', '笔记', '归档', '运行态']) +
  '<div class="sc-tabpanes">' +
  '<div class="sc-tabpane">' +
  '<div class="sc-mem-group-title">知识索引 MEMORY.md · 86 条</div>' +
  '<div class="sc-idx-list">' +
  row('架构', '部署链路四跳', 'notes/lessons.md §部署') +
  row('约定', '证据纪律：结论与证据戳同源', 'notes/user.md §纪律') +
  row('运行', '深度睡眠状态机', 'notes/flows.md §睡眠') +
  row('判据', '判据内核 L0', 'notes/agent.md §判据') +
  '</div>' +
  '<div class="sc-mem-group-title">守藏本地知识区 · suite/knowledge</div>' +
  '<div class="sc-desc">守藏蒸馏器事实源（ADR-0002）：MEMORY 8,204/20,000 · 51 行 · pending 3 条。</div>' +
  '</div>' +
  '<div class="sc-tabpane sc-hidden">' +
  '<div class="sc-mem-group-title">pending 候选队列 · 9 条</div>' +
  '<div class="sc-idx-list">' +
  row('候选', '2026-09-12-部署最后一跳.md', 'mtime 14:02') +
  row('候选', '2026-09-12-G20读方根因.md', 'mtime 13:41') +
  row('候选', '2026-09-11-零硬编码红线.md', 'mtime 09:12') +
  '</div></div>' +
  '<div class="sc-tabpane sc-hidden">' +
  '<div class="sc-mem-group-title">notes 详情小节</div>' +
  '<div class="sc-idx-list">' +
  row('notes', 'env.md · 6 个小节', 'notes/env.md') +
  row('notes', 'flows.md · 9 个小节', 'notes/flows.md') +
  row('notes', 'lessons.md · 18 个小节', 'notes/lessons.md') +
  '</div></div>' +
  '<div class="sc-tabpane sc-hidden">' +
  '<div class="sc-mem-group-title">归档区 notes/archive/ · 4 个文件</div>' +
  '<div class="sc-desc">forgetOps 产物（主动遗忘只归档、不删除），复制回 notes/ 即恢复。</div>' +
  '<div class="sc-idx-list">' +
  row('归档', '2026-08-14-旧部署流程.md', '1,204 字符') +
  row('归档', '2026-08-02-早期判据草案.md', '892 字符') +
  '</div></div>' +
  '<div class="sc-tabpane sc-hidden">' +
  '<div class="sc-ds-badges">' + badge('蒸馏 128 次', 'ended') + badge('向量 fusion', 'running') + badge('候选 9', 'suspect') + '</div>' +
  '<div class="sc-mem-group-title">蒸馏运行</div>' +
  '<div class="sc-mem-grid">' + kpi('守藏蒸馏', '128 次', '入册 342 条') + kpi('路由分布', 'memory 96', '拒收 12') + kpi('蒸馏水位', '14:02', 'lastSeq 143,025') + '</div>' +
  '<div class="sc-mem-group-title">向量召回 · fusion</div>' +
  '<div class="sc-mem-grid">' + kpi('provider', 'fusion', '本机 OpenAI 兼容端点') + kpi('向量缓存', '3,204 行', '行 hash 惰性补齐') + kpi('语义召回', '融合就绪', 'dense0.7 ⊕ lexical0.3') + '</div>' +
  '</div>' +
  '</div></div>'

V.persona = pageHead('画像', 'USER.md / AGENT.md 的唯一展示位。容量按 2026-09-11 要求保持静态数字——不出现百分比、进度条、健康度标记。') +
  '<div class="sc-mem-grid">' +
  kpi('USER 容量', '3,120 / 6,000', '24 条画像') +
  kpi('AGENT 容量', '2,860 / 6,000', '19 条画像 · 原则 12 · 路径 7') +
  '</div>' +
  '<div class="sc-mem-group-title">USER.md · 用户画像 · 24</div>' +
  '<div class="sc-idx-list">' +
  row('偏好', '先给结论，再给论据', 'notes/user.md §偏好') +
  row('偏好', '不接受无证据的量化结论', 'notes/user.md §纪律') +
  row('环境', 'Windows 11 · bash', 'notes/env.md §本机') +
  '</div>' +
  '<div class="sc-mem-group-title">AGENT.md · Agent 画像 · 19</div>' +
  '<div class="sc-idx-list">' +
  row('原则', '结论与证据戳必须同源同一次读取', 'notes/agent.md §纪律') +
  row('路径', '部署：push → 重钉 → install → 热重载', 'notes/flows.md §部署') +
  '</div>'

V.suite = pageHead('插件集合', 'suite 装配矩阵由 targets.ts 的 suiteAssemblyMatrix() 单一实现。') +
  '<div class="sc-idx-list">' +
  row('目标库', 'managing-memory · 记忆技能本体', '5 工具 · 已装配') +
  row('目标库', 'shoucang-core · 守藏核心蒸馏器', '3 工具 · 已装配') +
  row('目标库', 'scheduler · 定时蒸馏', '2 工具 · 已装配') +
  '</div>'

V.deepsleep = pageHead('深度睡眠', '按水位驱动的结构整理：合并、拆分、重命名与主动遗忘（归档，禁直删）。') +
  '<div class="sc-mem-grid">' +
  kpi('睡眠状态', '待触发', 'idle 180 分钟 · 下次可睡 16:42') +
  kpi('本轮产出', '3 条原则', '新增 3 · 替换 1 · 画像 2') +
  kpi('下轮材料', '22 条', '遗忘 7 · 加深 12 · 互抑 3') +
  '</div>' +
  '<div class="sc-mem-group-title">会话状态分布</div>' +
  '<div class="sc-ds-badges">' +
  badge('running 20', 'ended') + badge('ended 14', 'running') + badge('probing 7', 'probing') +
  badge('suspect 6', 'suspect') + badge('stalled 5', 'stalled') + '</div>'

V.observe = pageHead('运行观测', '进度、日志、错误定位与关键指标。错误带端点与参数，可直接定位。') +
  '<div class="sc-mem-grid">' +
  kpi('请求总数', '1,284', '本次会话') + kpi('成功率', '99.2%', '失败 10 次') + kpi('P95 耗时', '320 ms', '均值 86 ms') +
  '</div>' +
  '<div class="sc-mem-group-title">调用日志</div>' +
  '<div class="sc-logwrap"><div class="sc-log">' +
  '<div class="sc-log-row sc-log-ok">✓ GET /memory/overview 42ms 200</div>' +
  '<div class="sc-log-row sc-log-info">· GET /suite 18ms 200</div>' +
  '<div class="sc-log-row sc-log-warn">! POST /embed/test 1204ms timeout</div>' +
  '<div class="sc-log-row sc-log-ok">✓ POST /distill/run 312ms 200</div>' +
  '</div></div>'

V.toggles = pageHead('参数', '注入参数（全局，写 scheduler.json）与运行时通道。4 个桶已收进 Tab —— 此前 620 行平铺在一页。') +
  '<div class="sc-search-bar"><input class="sc-input" type="search" placeholder="检索参数（名称 / 键名 / 说明）…"><span class="sc-search-count"></span></div>' +
  '<div class="sc-tabbox">' + tabs(['① 注入与画像', '② 记忆与容量', '③ 模型与向量', '④ 后台与调度']) +
  '<div class="sc-tabpanes">' +
  '<div class="sc-tabpane">' +
  item('画像 persona 注入档位 injection.persona', '关闭=不注入画像；仅注入我=只注入 agent 画像；仅注入你=只注入用户画像；全注入=双画像（默认）', sel(['全注入', '仅注入我', '仅注入你', '关闭'])) +
  item('热记忆注入强度 injection.level', 'off / low(2 条) / medium(4 条) / high(8 条) / smart=智能上限(10 条)', sel(['smart', 'high', 'medium', 'low', 'off'])) +
  item('注入相关性重排 injectRelevance', '开=按相关性选行（缺省）；关=回落「基线 + 新鲜度」选行', sw(true)) +
  item('新鲜度保底槽 injectFreshSlots', '注入时优先保留「最近新增条目」的槽位数（0–6，缺省 2）', inp('2')) +
  '</div>' +
  '<div class="sc-tabpane sc-hidden">' +
  item('MEMORY.md 容量门 cap_memory', '知识索引记忆库容量（字符）：写入超限被拒（当前实际 12,480 字符）', inp('20000')) +
  item('AGENT.md 容量门 cap_agent', 'agent 画像记忆库容量（字符）：超限被拒（当前 2,860）', inp('6000')) +
  item('USER.md 容量门 cap_user', '用户画像记忆库容量（字符）：超限被拒（当前 3,120）', inp('6000')) +
  '<div class="sc-h3">深睡未消化策略</div>' +
  item('未消化取向', 'retry = 永不放弃（全重捞）；graded = 连败达上限后放行并告警', sel(['graded（分级）', 'retry（全重捞）'])) +
  item('连败上限', '仅 graded 生效，1–100', inp('3')) +
  '</div>' +
  '<div class="sc-tabpane sc-hidden">' +
  '<div class="sc-desc">改动写 scheduler.json，**需重载插件后生效**。</div>' +
  item('语义召回', 'dense 0.7 ⊕ lexical 0.3，RRF k=60', sw(true)) +
  item('Embedding 服务', '本机 OpenAI 兼容端点（Ollama 11434 等）', inp('http://127.0.0.1:11434/v1', 240)) +
  item('Embedding 模型', '本地 bge-m3，零 token', inp('bge-m3')) +
  item('蒸馏模型', '事件蒸馏；继承 = 跟随主会话', sel(['继承', 'deepseek-chat'])) +
  item('深睡归纳模型', '离线回想提炼 [原则]/[路径]', sel(['继承', 'deepseek-reasoner'])) +
  '</div>' +
  '<div class="sc-tabpane sc-hidden">' +
  '<div class="sc-desc">本组改动需重载生效。</div>' +
  item('蒸馏器 enableDistill', '关 = 不注册蒸馏器（只读视图仍可用）', sw(true)) +
  item('空闲触发 idleWakeMs', '会话闲置多久后触发蒸馏（分钟）', inp('10')) +
  item('本轮最少字符 minTurnChars', '低于此值判定无事可做', inp('200')) +
  item('认知环 mclEnabled', '按熟悉度分流快 / 慢通道', sw(true)) +
  item('熟悉度阈值', '高于阈值走快通道（0–1）', inp('0.65')) +
  '</div>' +
  '</div></div>'

V.settings = pageHead('设置', '界面偏好与高级操作。配置原文（YAML）属高危低频，已收在此处并附风险提示。') +
  '<div class="sc-tabbox">' + tabs(['界面偏好', '高级']) +
  '<div class="sc-tabpanes">' +
  '<div class="sc-tabpane">' +
  item('显示日志面板', 'Ctrl/⌘+Shift+L 切换', sw(true)) +
  item('自动刷新', '面板打开时按间隔重取，保留折叠态', sw(true)) +
  item('刷新间隔', '0 = 关闭轮询', sel(['60 秒', '30 秒', '5 分钟', '关闭'])) +
  item('显示密度', '紧凑模式压缩行高', sel(['舒适', '紧凑'])) +
  item('导航宽度', '140–320 px，响应式断点自动接管', inp('216')) +
  '<div class="sc-mem-group-title">快捷键</div>' +
  '<div class="sc-kv">' + kv('开关面板', 'Ctrl/⌘+Shift+S') + kv('切换日志面板', 'Ctrl/⌘+Shift+L') + kv('关闭面板', 'Esc') + '</div>' +
  '</div>' +
  '<div class="sc-tabpane sc-hidden">' +
  '<div class="sc-desc">⚠ 以下两项绕过常规校验。配置原文保存后自动备份 .bak-*；行级编辑与 notes 详情可能错位。</div>' +
  '<div class="sc-mem-group-title">配置原文 · shoucang.config.yaml</div>' +
  '<textarea id="sc-yaml" rows="12">' + [
    'roots:', '  - path: ./shoucang', '    active: true',
    'distill:', '  auto: true', '  idleWakeMs: 600000',
    'deepsleep:', '  enableDeepSleep: true',
    'vector:', '  embedEnabled: true', '  embedModel: bge-m3'
  ].join('\n') + '</textarea>' +
  '</div>' +
  '</div></div>'

/* ── 4. 组装 ── */
const panes = VIEWS.map((v) =>
  '<div class="pane" data-view="' + v[0] + '"' + (v[0] === VIEWS[0][0] ? '' : ' style="display:none"') + '>' +
  (V[v[0]] || '<div class="sc-desc">（示意页）</div>') + '</div>').join('\n')

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>守藏面板 · 改造后效果</title>
<style>__CSS__</style>
<style>
  html,body{margin:0;height:100%;background:var(--sc-bg3,#141414);}
  #scpanl-mask{display:flex !important;position:static;background:transparent;padding:0;}
  #scpanl-modal{width:100%;max-width:1160px;height:min(760px,100%);margin:auto;}
  .sc-nav-foot{padding:10px 12px;border-top:1px solid var(--sc-border);}
  .sc-nav-health{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--sc-muted);}
  .sc-nav-health b{color:var(--sc-text);}
  .sc-nav-sub{font-size:10.5px;color:var(--sc-faint);margin-top:4px;font-family:ui-monospace,Consolas,monospace;}
  .sc-dot{width:7px;height:7px;border-radius:50%;display:inline-block;background:var(--sc-faint);flex:none;}
  .sc-dot.ok{background:var(--sc-ok);}.sc-dot.warn{background:var(--sc-warn);}
  .sc-dot.err{background:var(--sc-err);}.sc-dot.info{background:var(--sc-info);}
  .sc-head-acts{margin-left:auto;display:flex;gap:8px;}
  .sc-pagehead{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px;}
  .sc-pagehead .sc-h1,.sc-pagehead .sc-desc{width:100%;}
  .sc-ds-badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:3px 10px;
    border-radius:999px;background:var(--sc-hover);color:var(--sc-muted);}
  .sc-ds-badge.ended{background:var(--sc-ok-bg);color:var(--sc-ok);}
  .sc-ds-badge.probing{background:var(--sc-warn-bg);color:var(--sc-warn);}
  .sc-ds-badge.suspect{background:var(--sc-accent-bg);color:var(--sc-accent);}
  .sc-ds-badge.stalled{background:var(--sc-err-bg);color:var(--sc-err);}
  .sc-ds-badge.running{background:var(--sc-info-bg);color:var(--sc-info);}
  #sc-yaml{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.7;
    background:var(--sc-bg2);color:var(--sc-text);border:1px solid var(--sc-border);border-radius:6px;padding:10px 12px;}
  .sc-log{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.8;}
  .sc-log-ok{color:var(--sc-ok);}.sc-log-warn{color:var(--sc-warn);}.sc-log-info{color:var(--sc-muted);}
  .checkbox-container{width:34px;height:19px;border-radius:20px;background:var(--sc-border);position:relative;}
  .checkbox-container.is-enabled{background:var(--sc-accent);}
  .checkbox-material{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);}
  .checkbox-container.is-enabled .checkbox-material{left:17px;}
</style>
</head>
<body>
<div id="scpanl-root">
  <div id="scpanl-mask" class="open">
    <div id="scpanl-modal">
      <nav class="sc-nav">__NAV__</nav>
      <div class="sc-main">
        <div class="sc-view">__PANES__</div>
        <div class="sc-statusbar">改造后效果示意 · CSS / 图标 / 导航均从 client.js 原地抽取，与线上同源</div>
      </div>
    </div>
  </div>
</div>
<script>
(function(){
  var root = document.getElementById('scpanl-root');
  var navItems = root.querySelectorAll('.sc-nav-item');
  var panes = root.querySelectorAll('.pane');
  navItems.forEach(function(it){
    it.onclick = function(){
      navItems.forEach(function(x){ x.classList.remove('active'); });
      it.classList.add('active');
      var v = it.getAttribute('data-view');
      panes.forEach(function(p){ p.style.display = (p.getAttribute('data-view') === v) ? '' : 'none'; });
      var view = root.querySelector('.sc-view');
      if (view) view.scrollTop = 0;
    };
  });
  // Tab 切换：只改 .sc-hidden，不重建 DOM（与线上 buildTabs 行为一致）
  root.querySelectorAll('.sc-tabs').forEach(function(bar){
    var box = bar.parentNode;
    var btns = bar.querySelectorAll('.sc-tab');
    var ps = box.querySelectorAll('.sc-tabpane');
    btns.forEach(function(b, i){
      b.onclick = function(){
        btns.forEach(function(x){ x.classList.remove('on'); });
        b.classList.add('on');
        ps.forEach(function(p, j){ p.classList.toggle('sc-hidden', j !== i); });
      };
    });
  });
})();
</script>
</body></html>`

const out = html.replace('__CSS__', css).replace('__NAV__', buildNav()).replace('__PANES__', panes)
mkdirSync(join(root, 'deliverables'), { recursive: true })
const dest = join(root, 'deliverables', 'ui-after-2026-09-12.html')
writeFileSync(dest, out, 'utf8')
console.log('gen-ui-after ✓ ' + dest)
console.log('  css ' + css.length + ' chars · 视图 ' + VIEWS.length + ' 个 · 导航项 ' + VIEWS.length)
