/**
 * @dsh-external/shoucang-panel / config — 配置领域（根目录 + 配置读写）。
 * 端点：GET /roots · GET /get_root · POST /root/bootstrap · POST /set_root ·
 *      GET /config · POST /save · POST /toggle · POST /set
 * 依赖窄传：6 个（route / state / root / hot / suite / logger）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dshHome } from './targets.js'
import { CONFIG_FILE, backupThenWrite, bootstrapDefaults, flipBool, parseView, readBody, sendJson, statMtime } from './panel-shared.js'
import type { HotMemory, PanelLogger, RootAccess, RouteFn, StateStore, SuiteConfigAccess } from './panel-shared.js'

export interface ConfigDeps {
  route: RouteFn
  state: StateStore
  root: RootAccess
  hot: HotMemory
  suite: SuiteConfigAccess
  logger: PanelLogger
}

function rootsRoute(d: ConfigDeps, _req: IncomingMessage, res: ServerResponse): void {
  const s = d.state.load()
  sendJson(res, 200, { roots: s.roots, active: s.active })
}

function getRootRoute(d: ConfigDeps, _req: IncomingMessage, res: ServerResponse): void {
  const s = d.state.load()
  sendJson(res, 200, { active: s.roots.find((r) => r.id === s.active) ?? null })
}

async function rootBootstrapRoute(d: ConfigDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readBody(req).catch(() => ({}))) as { root?: string }
  const target = typeof body.root === 'string' && body.root.trim() ? resolve(body.root.trim()) : d.root.activeRootOf()?.path ?? ''
  if (!target) return sendJson(res, 400, { error: 'no root' })
  const boot = bootstrapDefaults(target)
  sendJson(res, 200, { root: target, ...boot, skeleton: boot.template })
}

async function setRootRoute(d: ConfigDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req)
  const p = typeof body.path === 'string' ? body.path.trim() : ''
  if (!p) return sendJson(res, 400, { error: 'path required' })
  const abs = isAbsolute(p) ? resolve(p) : resolve(p)
  const file = join(abs, CONFIG_FILE)
  if (!existsSync(file)) return sendJson(res, 400, { error: `未找到 ${CONFIG_FILE}：${abs}` })
  const s = d.state.load()
  let entry = s.roots.find((r) => r.path === abs)
  if (!entry) {
    entry = {
      id: `root-${Date.now()}`,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : abs.split(/[\\/]/).pop() || abs,
      path: abs,
    }
    s.roots.push(entry)
  }
  s.active = entry.id
  d.state.save(s)
  d.logger.info?.(`[shoucang] panel root activated: ${abs}`)
  // 切换根目录默认构建：按默认项目资料补缺目录/索引（幂等，不覆盖既有 _index.md）
  try {
    const boot = bootstrapDefaults(abs)
    if (boot.createdDirs.length || boot.createdIndexes.length) {
      d.logger.info?.(`[shoucang] bootstrap ${abs}: +${boot.createdDirs.length} dirs +${boot.createdIndexes.length} indexes`)
    }
  } catch (e) { d.logger.warn?.(`[shoucang] bootstrap failed: ${String(e)}`) }
  sendJson(res, 200, { ok: true, active: entry })
}

function configRoute(d: ConfigDeps, _req: IncomingMessage, res: ServerResponse): void {
  const file = d.root.configFileOf()
  const sched = d.suite.read()
  // 2026-09-10（修正）：上限 vs 实际量——上限是稳定配置（用户设的边界）；未配时默认=容量门硬边界
  // （画像 AGENT/USER 3000、记忆 MEMORY 5000（2026-09-11 用户拍板默认）：写门强制内容不可超，故默认=容量门=允许全量且 UI 数字稳定）；
  // actual = 当前实际量（动态参考，随内容成长变化，仅展示不参与配置）
  const CAP_GATES: Record<string, number> = { 'AGENT.md': 3000, 'USER.md': 3000, 'MEMORY.md': 5000 }
  const fileChars = (name: string): number => {
    try { const base = join(dshHome(), 'skills', 'managing-memory'); const t = readFileSync(join(base, name), 'utf8'); return t.replace(/\s+/g, '').length } catch { return 0 }
  }
  const globalCfg = {
    persona: String(sched.injectPersona ?? 'both'),
    level: String(sched.injectLevel ?? 'smart'),
    hot_memory: sched.hotMemory !== false,
    // 容量门（记忆库扩增/写门用；新键 capAgent 优先，回落旧 injectAgentMaxChars）
    cap_agent: typeof sched.capAgent === 'number' ? sched.capAgent : (typeof sched.injectAgentMaxChars === 'number' ? sched.injectAgentMaxChars : CAP_GATES['AGENT.md']),
    cap_user: typeof sched.capUser === 'number' ? sched.capUser : (typeof sched.injectUserMaxChars === 'number' ? sched.injectUserMaxChars : CAP_GATES['USER.md']),
    cap_memory: typeof sched.capMemory === 'number' ? sched.capMemory : (typeof sched.injectMemoryMaxChars === 'number' ? sched.injectMemoryMaxChars : CAP_GATES['MEMORY.md']),
    actual: { agent: fileChars('AGENT.md'), user: fileChars('USER.md'), memory: fileChars('MEMORY.md') },
    // v7 活性/遗忘/加深校准阈值（2026-09-10：/config 返回供 UI 渲染；缺省同 scheduler zod 默认 14/44/90/5/35）
    activityWarmDays: typeof sched.activityWarmDays === 'number' ? sched.activityWarmDays : 14,
    activityColdDays: typeof sched.activityColdDays === 'number' ? sched.activityColdDays : 44,
    activityArchiveDays: typeof sched.activityArchiveDays === 'number' ? sched.activityArchiveDays : 90,
    activityHotHits: typeof sched.activityHotHits === 'number' ? sched.activityHotHits : 5,
    recallColdFactorPercent: typeof sched.recallColdFactorPercent === 'number' ? sched.recallColdFactorPercent : 35,
    // U3（ADR-122 UI · B5 能力对齐）：此前 panel 已读取但 scheduler 未声明的键 + v2 新增键 —— 现全部进 /config 供 UI 渲染
    injectRelevance: sched.injectRelevance !== false,
    injectFreshSlots: typeof sched.injectFreshSlots === 'number' ? sched.injectFreshSlots : 2,
    recallFusion: String(sched.recallFusion ?? 'rrf'),
    bankGit: sched.bankGit !== false,
    mclEnabled: sched.mclEnabled !== false,
    mclFamiliarThreshold: typeof sched.mclFamiliarThreshold === 'number' ? sched.mclFamiliarThreshold : 0.65,
    mclMaxNudges: typeof sched.mclMaxNudges === 'number' ? sched.mclMaxNudges : 1,
    mclBudgetChars: typeof sched.mclBudgetChars === 'number' ? sched.mclBudgetChars : 600,
    mclTopK: typeof sched.mclTopK === 'number' ? sched.mclTopK : 3,
    mclAudit: sched.mclAudit !== false,
    // v2.2（ADR-130）：层模型开关
    injectProfileRows: typeof sched.injectProfileRows === 'number' ? sched.injectProfileRows : 3,
    scoreWeights: String(sched.scoreWeights ?? 'legacy'),
    shadowScore: sched.shadowScore !== false,
    maturationEnforce: sched.maturationEnforce === true,
    // v2.2：睡眠期自检
    selfCheck: sched.selfCheck !== false,
    selfCheckRepo: String(sched.selfCheckRepo ?? ''),
    selfCheckAutoRollback: sched.selfCheckAutoRollback === true,
    selfCheckIntervalHours: typeof sched.selfCheckIntervalHours === 'number' ? sched.selfCheckIntervalHours : 6,
  }
  // P2：无 root 也能调注入（全局 scheduler.json）——root 仅承载「配置原文」编辑；返回 global 供 UI 渲染
  if (!file) return sendJson(res, 200, { text: null, parsed: null, error: 'no-active-root', global: globalCfg })
  try {
    const text = readFileSync(file, 'utf8')
    // P1-2：注入配置全局值（scheduler.json）随 /config 返回——UI 渲染用全局（root YAML 的 injection 段已退役）
    sendJson(res, 200, {
      text, parsed: parseView(text), file, mtime: statMtime(file),
      global: globalCfg,
    })
  } catch (e) {
    sendJson(res, 500, { error: String(e) })
  }
}

async function saveRoute(d: ConfigDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req)
  if (typeof body.text !== 'string') return sendJson(res, 400, { error: 'text required' })
  const file = d.root.configFileOf()
  if (!file) return sendJson(res, 400, { error: 'no-active-root' })
  try {
    backupThenWrite(file, body.text)
    d.logger.info?.(`[shoucang] panel saved ${file}`)
    sendJson(res, 200, { ok: true, parsed: parseView(body.text) })
  } catch (e) {
    sendJson(res, 500, { error: String(e) })
  }
}

async function toggleRoute(d: ConfigDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req)
  const key = typeof body.key === 'string' ? body.key : ''
  const allowed = ['injection.hot_memory', 'injectRelevance', 'bankGit', 'mclEnabled', 'mclAudit', 'shadowScore', 'maturationEnforce', 'selfCheck', 'selfCheckAutoRollback'] // U3+v2.2：布尔类键（均走 SUITE_BOOL 全局通道）
  if (!allowed.includes(key)) return sendJson(res, 400, { error: `key 不允许：${key}` })
  // U3 修正（实测缺陷）：scheduler.json 类布尔键必须走 **suite 持久通道**——
  // 此前只有 hot_memory 走全局，其余键落到 root YAML 的 flipBool ⇒ 找不到 `shoucang.<key>` 行 → 500。
  const SUITE_BOOL: Record<string, string> = {
    'injection.hot_memory': 'hotMemory', // P1-2：注入总闸（全局 scheduler.json）
    injectRelevance: 'injectRelevance',
    bankGit: 'bankGit',
    mclEnabled: 'mclEnabled',
    mclAudit: 'mclAudit',
    shadowScore: 'shadowScore',
    maturationEnforce: 'maturationEnforce',
    selfCheck: 'selfCheck',
    selfCheckAutoRollback: 'selfCheckAutoRollback',
  }
  if (SUITE_BOOL[key]) {
    const prop = SUITE_BOOL[key]
    const cur = d.suite.read()[prop] !== false // 缺省 true
    d.suite.write({ ...d.suite.read(), [prop]: !cur })
    d.hot.invalidate()
    d.logger.info?.(`[shoucang] panel toggled ${key}（全局 scheduler.json → ${prop}=${!cur}）`)
    return sendJson(res, 200, { ok: true, key, global: prop, value: !cur })
  }
  // 兜底写通道：root config YAML 布尔直写（flipBool）。当前 /toggle 白名单内所有键均已走 SUITE_BOOL，
  // 此分支为未来新增的 root-only 布尔键预留（与 check-carriers 的「三写通道」模型一致）。
  const file = d.root.configFileOf()
  if (!file) return sendJson(res, 400, { error: 'no-active-root' })
  const fileKey = 'shoucang.' + key
  let next: string | null
  try { next = flipBool(readFileSync(file, 'utf8'), fileKey) } catch (e) { return sendJson(res, 500, { error: String(e) }) }
  if (next === null) return sendJson(res, 500, { error: `未定位到布尔行：${key}` })
  backupThenWrite(file, next)
  d.hot.invalidate() // 注入缓存作废：toggle 立即反映到下一轮注入/预览
  d.logger.info?.(`[shoucang] panel toggled ${key}`)
  sendJson(res, 200, { ok: true, parsed: parseView(next) })
}

async function setRoute(d: ConfigDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req)
  const key = typeof body.key === 'string' ? body.key : ''
  let value = typeof body.value === 'string' ? body.value.trim() : ''
  const allowed: Record<string, string[]> = {
    'injection.level': ['off', 'low', 'medium', 'high', 'smart'],
    'injection.persona': ['off', 'me', 'you', 'both'],
    // v16：注入板块容量上限（字符，0=不裁）；max_tokens 总预算已退役（2026-09-10）
    'injection.agent_max_chars': [],
    'injection.user_max_chars': [],
    'injection.memory_max_chars': [],
    // 2026-09-10：记忆库容量门（写门用，控制蒸馏/扩增规模）
    'injection.cap_agent': [],
    'injection.cap_user': [],
    'injection.cap_memory': [],
    // 2026-09-10 收敛：archive/lifecycle/merge 组键消费端为旧 Python 链路（_meta/*.py 已不随包分发），
    // 无真消费——保留只会误导用户。已从白名单移除（真蒸馏/归档走 scheduler.json 通道）。
    'embedding.dimension': [],
    // 2026-09-10：v7 活性/遗忘/加深校准阈值（数值类；scheduler zod 属性名同键，值=天/命中次数/百分比）
    'activityWarmDays': [],
    'activityColdDays': [],
    'activityArchiveDays': [],
    'activityHotHits': [],
    'recallColdFactorPercent': [],
    // U3（B5 能力对齐）：补齐后端已有/新声明的键 —— 此前 UI 无法调（injectRelevance/injectFreshSlots 未声明；
    // MCL 6 键 + v2 的 recallFusion/bankGit 无控件）。数值类走 /set，布尔类走 /toggle。
    'injectFreshSlots': [],
    'mclFamiliarThreshold': [],
    'mclMaxNudges': [],
    'mclBudgetChars': [],
    'mclTopK': [],
    'recallFusion': ['rrf', 'weighted'],
    'injectProfileRows': [],
    'scoreWeights': ['legacy', 'v2'],
    'selfCheckRepo': [],       // 仓根路径（字符串）
    'selfCheckIntervalHours': [],
    // G-19（2026-09-12）：深睡失败策略 —— retry=全重捞永不放弃（B）/ graded=连败 N 轮放行并告警（C，缺省）
    'deepSleep.failPolicy': ['retry', 'graded'],
    'deepSleep.failPolicyMaxRounds': [],
  }
  // 数值范围校验（2026-09-10 收敛：仅注入组 + embedding.dimension；archive/lifecycle/merge 死键已随白名单移除）
  const RANGE: Record<string, [number, number]> = {
    // v16：板块容量上限范围（0=不裁，上限留足写门容量的 6 倍余量）
    'injection.agent_max_chars': [0, 20000],
    'injection.user_max_chars': [0, 20000],
    'injection.memory_max_chars': [0, 20000],
    'injection.cap_agent': [100, 30000],
    'injection.cap_user': [100, 30000],
    'injection.cap_memory': [100, 30000],
    'embedding.dimension': [16, 8192], // 常见嵌入维度范围
    // v7 活性/遗忘/加深校准阈值范围（同 scheduler zod min/max）
    'activityWarmDays': [1, 120], // active→warm 无命中天数
    'activityColdDays': [2, 365], // warm→cold 无命中天数
    'activityArchiveDays': [30, 730], // cold 且最近命中超此天数 → 遗忘候选
    'activityHotHits': [1, 50], // 近 30 天命中 ≥ 此值 → 加深候选 B
    'recallColdFactorPercent': [5, 95], // 召回降权系数（%）
    // U3（B5）：新增数值键范围（与 scheduler zod min/max 一致）
    'injectFreshSlots': [0, 6],
    'mclFamiliarThreshold': [0, 1],
    'mclMaxNudges': [0, 3],
    'mclBudgetChars': [120, 4000],
    'mclTopK': [1, 5],
    'injectProfileRows': [0, 6],
    'selfCheckIntervalHours': [0, 168],
    'deepSleep.failPolicyMaxRounds': [1, 100], // G-19：连败放行阈值（轮）；0/负数会被 liveFailPolicy 忽略并回落默认值 3
  }
  if (!(key in allowed)) return sendJson(res, 400, { error: `key 不允许：${key}` })
  if (!value) return sendJson(res, 400, { error: 'value required' })
  if (allowed[key].length && !allowed[key].includes(value)) return sendJson(res, 400, { error: `枚举值非法：${key} ∈ ${allowed[key].join('|')}` })
  if (RANGE[key] && !(Number(value) >= RANGE[key][0] && Number(value) <= RANGE[key][1])) {
    return sendJson(res, 400, { error: `数值越界：${key} ∈ [${RANGE[key][0]}, ${RANGE[key][1]}]` })
  }
  // P1-2：注入配置落盘全局 scheduler.json（键映射 injection.* → inject*）；不再写 root config YAML
  const SCHED_KEY: Record<string, string> = {
    'injection.level': 'injectLevel',
    'injection.persona': 'injectPersona',
    'injection.agent_max_chars': 'injectAgentMaxChars',
    'injection.user_max_chars': 'injectUserMaxChars',
    'injection.memory_max_chars': 'injectMemoryMaxChars',
    // 2026-09-10：记忆库容量门（写门 SHOUCANG_CAP_* 源）
    'injection.cap_agent': 'capAgent',
    'injection.cap_user': 'capUser',
    'injection.cap_memory': 'capMemory',
    // v7 活性/遗忘/加深校准阈值：键名与 scheduler zod 属性名一致（数值 Number 化写入 scheduler.json 顶层）
    'activityWarmDays': 'activityWarmDays',
    'activityColdDays': 'activityColdDays',
    'activityArchiveDays': 'activityArchiveDays',
    'activityHotHits': 'activityHotHits',
    'recallColdFactorPercent': 'recallColdFactorPercent',
    // U3（B5）：新增键 → scheduler.json 顶层（键名与 zod 属性名一致）
    'injectFreshSlots': 'injectFreshSlots',
    'mclFamiliarThreshold': 'mclFamiliarThreshold',
    'mclMaxNudges': 'mclMaxNudges',
    'mclBudgetChars': 'mclBudgetChars',
    'mclTopK': 'mclTopK',
    'recallFusion': 'recallFusion',
    'scoreWeights': 'scoreWeights', // v2.2：打分公式开关（legacy|v2）
    'injectProfileRows': 'injectProfileRows', // v2.2：P 层画像行每档上限（0=回滚）
    'embedding.dimension': 'embedDim', // 历史遗留键：此前只登记白名单却无映射（实测 400）→ 补映射
    'selfCheckRepo': 'selfCheckRepo',
    'selfCheckIntervalHours': 'selfCheckIntervalHours',
    // G-19：深睡失败策略 → scheduler.json（distill.ts 的 liveFailPolicy 实时读这两个键）
    'deepSleep.failPolicy': 'deepSleepFailPolicy',
    'deepSleep.failPolicyMaxRounds': 'deepSleepFailMaxRounds',
  }
  const schedKey = SCHED_KEY[key]
  if (!schedKey) return sendJson(res, 400, { error: `key 无全局映射：${key}` })
  // U3 修正（实测缺陷：recallFusion='rrf' 曾被 Number() 写成 0）：**枚举键原样写字符串**，仅数值键 Number 化。
  // U3/v2.2 修正（实测：字符串键 selfCheckRepo 被 Number() 吞成 0）：**枚举/字符串键原样写**，仅数值键 Number 化。
  const STRING_KEYS = new Set(['selfCheckRepo'])
  const isEnum = allowed[key].length > 0
  const merged = { ...d.suite.read(), [schedKey]: (isEnum || STRING_KEYS.has(key)) ? value : (Number(value) || 0) }
  d.suite.write(merged)
  d.hot.invalidate() // 注入缓存作废：改动立即反映到下一轮注入
  d.logger.info?.(`[shoucang] panel set ${key}=${value}（全局 scheduler.json ${schedKey}）`)
  sendJson(res, 200, { ok: true, key, value, global: schedKey })
}

export function registerConfigRoutes(d: ConfigDeps): void {
  d.route('/roots', (req, res) => rootsRoute(d, req, res))
  d.route('/get_root', (req, res) => getRootRoute(d, req, res))
  d.route('/root/bootstrap', async (req, res) => rootBootstrapRoute(d, req, res))
  d.route('/set_root', async (req, res) => setRootRoute(d, req, res))
  d.route('/config', (req, res) => configRoute(d, req, res))
  d.route('/save', async (req, res) => saveRoute(d, req, res))
  d.route('/toggle', async (req, res) => toggleRoute(d, req, res))
  d.route('/set', async (req, res) => setRoute(d, req, res))
}
