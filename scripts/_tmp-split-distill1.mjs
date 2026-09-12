// 阶段 C-1：把 registerDistill 里 6 个**自包含**领域迁出为独立模块。
// ⚠ 一律用 Write 工具写本件（bash heredoc 会吃掉反引号 / 把 \b 写成退格符，见 MEMORY.md）。
//
// 形态约定（与阶段 A/B 一致）：
//   · 实现函数全部在**模块级**，依赖作**首参** `d: XxxDeps`（不藏在工厂闭包里 ⇒ 不会被 I1 判"装配过厚"）
//   · 对外只暴露 `createXxxApi(d)`，返回**绑定后**的句柄，调用方零感知
//   · 绑定用 `Tail<Parameters<typeof f>>` 保类型（不写 any，不丢编译期检查）
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'
import { renameInSource } from './_tmp-rename.mjs'

const F = 'src/distill.ts'
const text = readFileSync(F, 'utf8')
const sf = ts.createSourceFile(F, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const lineOf = (p) => sf.getLineAndCharacterOfPosition(p).line + 1
let fn = null
for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name?.text === 'registerDistill') fn = st

const defs = new Map()
for (const st of fn.body.statements) {
  let name = null
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) name = d.name.text
  else if (ts.isFunctionDeclaration(st) && st.name) name = st.name.text
  if (name) defs.set(name, {
    name, from: lineOf(st.getFullStart()), to: lineOf(st.getEnd()), text: st.getFullText(sf), st,
    isFn: ts.isVariableStatement(st)
      ? st.declarationList.declarations.some((d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)))
      : !!st.name,
  })
}

const SRC = {
  'node:fs': ['appendFileSync', 'copyFileSync', 'existsSync', 'mkdirSync', 'readFileSync', 'readdirSync', 'renameSync', 'statSync', 'unlinkSync', 'writeFileSync'],
  'node:path': ['basename', 'dirname', 'join', 'resolve'],
  'node:child_process': ['execFile', 'execFileSync', 'spawn'],
  'node:crypto': ['randomUUID'],
  'node:os': ['tmpdir', 'homedir'],
  './targets.js': ['knowledgeRoot', 'memoryLibRoot', 'dshHome', 'extractRecallTokens', 'highConfCarrierSet', 'indexCarrierSet', 'indexRowInLayer', 'indexRowTag', 'profileCarrierSet', 'recallApprox', 'recallIndex', 'scanIndexRows', 'sectionKeyOf', 'dedupeBySection', 'resolveTarget', 'loadWhitelist', 'gateMemoryAppend', 'RouteTarget', 'Whitelist'],
  './distill-proc.js': ['runNode', 'textOf', 'RunResult'],
  './distill-chunks.js': ['CHUNK_CHARS', 'MAX_CHUNKS_PER_RUN', 'buildEventChunks', 'manifestLineFor', 'manifestPush', 'textPartsOfEvent', 'DistillChunk', 'DistillChunks'],
  './vec.js': ['recallRanked', 'semanticSim', 'EmbedCfg'],
  './activity.js': ['activityAggregate'],
  './criteria.generated.js': ['CRITERIA_VERSION', 'LEDGER_FILE', 'MATURATION', 'SCORE', 'SURFACE', 'TRIGGER', 'CARRIERS'],
  './criteria.js': ['demoteVerdict', 'evaluateL0', 'maturationVerdict', 'promoteVerdict'],
  './deepsleep-core.js': ['DISCARD_SNAPSHOT_CB_N', 'SKIP_HOLD_MAX', 'planSkipWatermark', 'COMMIT_FAILED_GATE', 'DEEP_SLEEP_PROMPT', 'commitPrinciples', 'deepSleepLanded', 'deepSleepReplayable', 'liveFailPolicy', 'planDeepSleepVerdict', 'resolveWatermarkBaseline', 'runDiscardWatermark', 'BaselineDeps', 'DeepSleepOtherChannels', 'DeepSleepStatus', 'SessRec', 'SessState', 'WmBaseline', 'RouteTag'],
  './treeops.js': ['applyForgetOps', 'applyTreeOps', 'sectionExists', 'TreeOp'],
}
const TYPES = new Set(['EmbedCfg', 'RunResult', 'RouteTarget', 'Whitelist', 'TreeOp', 'BaselineDeps', 'DeepSleepOtherChannels', 'DeepSleepStatus', 'SessRec', 'SessState', 'WmBaseline', 'RouteTag'])
const importsFor = (body, extra = []) => {
  const out = []
  for (const [mod, names] of Object.entries(SRC)) {
    const hit = names.filter((n) => new RegExp(`\\b${n}\\b`).test(body))
    if (!hit.length) continue
    const vals = hit.filter((n) => !TYPES.has(n))
    const ts2 = hit.filter((n) => TYPES.has(n))
    if (vals.length) out.push(`import { ${vals.join(', ')} } from '${mod}'`)
    if (ts2.length) out.push(`import type { ${ts2.join(', ')} } from '${mod}'`)
  }
  return out.concat(extra).join('\n') + '\n'
}
const dedent = (s, n) => s.split('\n').map((l) => (l.startsWith(' '.repeat(n)) ? l.slice(n) : l.replace(/^\s+/, ''))).join('\n')

/** 把「组内函数名被当值引用」的位置改成绑定箭头（AST 定位，不动字符串与注释）。 */
function bindValues(src, fnNames) {
  if (!fnNames.size) return src
  const sfp = ts.createSourceFile('__b.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const edits = []
  const visit = (n) => {
    if (ts.isIdentifier(n) && fnNames.has(n.text)) {
      const p = n.parent
      const isDef = (ts.isVariableDeclaration(p) && p.name === n) || (ts.isFunctionDeclaration(p) && p.name === n)
      const isCall = ts.isCallExpression(p) && p.expression === n
      if (!isDef && !isCall) {
        const bound = `(...a) => ${n.text}(${pn}, ...a)`
        const text = (ts.isShorthandPropertyAssignment(p) && p.name === n) ? `${n.text}: ${bound}` : bound
        edits.push({ s: n.getStart(sfp), e: n.getEnd(), t: text })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sfp)
  edits.sort((a, b) => b.s - a.s)
  let out = src
  for (const e of edits) out = out.slice(0, e.s) + e.t + out.slice(e.e)
  return out
}

const GROUPS = [
  {
    file: 'distill-bank', api: 'BankApi', depsType: 'BankDeps', varName: 'bank', paramName: 'dep',
    title: '库快照与睡眠期自检（bank-git / sleep-selfcheck 子进程）',
    defs: ['bankGitScript', 'runSelfCheck', 'bankSnapshot'],
    deps: ['kRoot', 'infra', 'config'],
    iface: [
      'export interface BankDeps {',
      '  kRoot: string',
      '  infra: InfraApi',
      '  config: any',
      '}',
    ].join('\n'),
    extraImport: ["import type { InfraApi } from './distill-infra.js'"],
  },
  {
    file: 'distill-embed', api: 'EmbedApi', depsType: 'EmbedDeps', varName: 'embed', paramName: 'dep',
    title: '嵌入配置投影（config → EmbedCfg 的单一构造）',
    defs: ['embedCfgOf'],
    deps: ['config'],
    iface: [
      'export interface EmbedDeps {',
      '  config: any',
      '}',
    ].join('\n'),
  },

]
const GROUPS_C1 = [
  {
    file: 'distill-infra', api: 'InfraApi', depsType: 'InfraDeps', varName: 'infra',
    title: '基础设施（日志 / 审计 / 台账 / 回合集 / 存根）',
    defs: ['ledger', 'recordEpisode', 'log', 'sidShort', 'audit', 'recordStub'],
    deps: ['logFile', 'auditFile', 'ledgerFile', 'episodeFile', 'stubDir', 'kRoot', 'EPISODE_CAP', 'LEDGER_FILE'],
    iface: `export interface InfraDeps {
  logFile: string
  auditFile: string
  ledgerFile: string
  episodeFile: string
  stubDir: string
  kRoot: string
  EPISODE_CAP: number
  LEDGER_FILE: string
}`,
  },
  {
    file: 'distill-candidates', api: 'CandApi', depsType: 'CandDeps', varName: 'cand',
    title: '流程候选（意图指纹 / 卡片相似度 / 候选落盘）',
    defs: ['intentOf', 'intentTokens', 'cardTokens', 'cardSimilar', 'ensureFlowCandidate'],
    deps: ['candidateDir', 'embedCfgOf', 'ledger'],
    iface: `export interface CandDeps {
  candidateDir: string
  embedCfgOf(): EmbedCfg
  ledger(o: Record<string, unknown>): void
}`,
    extraImport: ["import type { EmbedCfg } from './vec.js'"],
  },
  {
    file: 'distill-watermark', api: 'WmApi', depsType: 'WmDeps', varName: 'wm',
    title: '蒸馏水位（会话 seq 基准与回退裁决）',
    defs: ['readWatermarks', 'writeWatermark', 'sessionFormatVersionOf', 'agentFingerprintAt', 'discardWatermark', 'resolveWatermark'],
    deps: ['watermarkFile', 'log', 'audit', 'sidShort', 'st'],
    iface: `export interface WmDeps {
  watermarkFile: string
  log(m: string): void
  audit(o: Record<string, unknown>): void
  sidShort(sid: string): string
  st: DistillState
}`,
    stateFields: ['snapshotUnavailableStreak'],
  },
  {
    file: 'distill-llm', api: 'LlmApi', depsType: 'LlmDeps', varName: 'llm',
    title: '模型与转录（provider 校验 / 路由 / 转录定位 / workspace 解析）',
    defs: ['validateProvider', 'resolveLlm', 'probeScriptPath', 'locateTranscript', 'resolveWorkspace'],
    deps: ['log', 'llmState', 'config', 'ctx'],
    iface: `export interface LlmDeps {
  log(m: string): void
  llmState: { providerFailCount: number }
  /** ⚠ config / ctx 用 any 是**刻意**的：类型定义在 distill.ts，此处 import 即成环（同 deepsleep 的理由） */
  config: any
  ctx: any
}`,
    // runNode / textOf 是模块级纯工具（已提到 distill-proc.ts，避免 distill ↔ distill-llm 环）
    extraImport: ["import { runNode, textOf } from './distill-proc.js'"],
  },
  {
    file: 'distill-parent', api: 'ParentApi', depsType: 'ParentDeps', varName: 'parent',
    title: '父会话与子代理归属（深睡 parent 兜底 / 子代理活跃判定）',
    defs: ['CHILD_ACTIVE_MS', 'isValidParent', 'rememberAgent', 'isSubagentAgent', 'parentSidOf', 'noteChildActivity', 'dropChild', 'hasActiveSubagents', 'pickParent', 'resolveDefaultModel', 'ensureDaemonParent'],
    deps: ['log', 'st', 'config', 'ctx'],
    iface: `export interface ParentDeps {
  log(m: string): void
  config: any
  ctx: any
  st: DistillState
}`,
    stateFields: ['lastParent', 'daemonParent', 'childSeen', 'globalChildSeen', 'globalChildLoggedAt'],
  },
]

const allNames = new Set(defs.keys())
for (const g of GROUPS) {
  const set = new Set(g.defs)
  const ext = new Set()
  for (const n of g.defs) {
    const visit = (x) => { if (ts.isIdentifier(x) && allNames.has(x.text) && !set.has(x.text)) ext.add(x.text); ts.forEachChild(x, visit) }
    visit(defs.get(n).st)
  }
  g.ext = [...ext]
  const declared = new Set(g.deps)
  const missing = g.ext.filter((n) => !declared.has(n) && !(g.stateFields || []).includes(n))
  if (missing.length) console.log(`⚠ ${g.file} 依赖未声明：${missing.join(' ')}（将自动补进 iface）`)
  for (const m of missing) g.deps.push(m)
}

const TAIL = `/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never
`

for (const g of GROUPS) {
  const stateSet = new Set(g.stateFields || [])
  const parts = []
  for (const n of g.defs) {
    const d = defs.get(n)
    let t = dedent(d.text, 2)
    // 外部依赖名 → d.xxx / st.xxx
    // ⚠ 用 ext ∪ deps：`config` / `ctx` 是 registerDistill 的**形参**，不在"顶层定义名"里，
    //   只扫 ext 会漏掉它们（首版实测：distill-llm.ts 里 12 处 config 未改名）
    const pn = g.paramName || 'd'
    const rnNames = [...new Set([...g.ext, ...g.deps])]
    // 局部同名变量先让路：activationStep 里有 `let st = actState.get(sid)`，
    //   与 deps 字段 st 撞名 ⇒ 不改开就是 `let d.st = …`（语法错误）
    if (g.localRename) t = renameInSource(t, g.localRename)
    // ⚠ 状态字段在模块内是 d.st.xxx（st 是 deps 的一个字段），不是 st.xxx
    // explicitRename 优先：把扁平的 N 个依赖收进领域子对象（如 dep.io.infra / dep.wm.st）
    const ex = g.explicitRename || {}
    t = renameInSource(t, rnNames.map((e) => [e, ex[e] || (stateSet.has(e) ? `${pn}.st.` + e : `${pn}.` + e)]))
    for (const [a, b] of (g.overrideRename || [])) t = t.split(a).join(b)
    // 依赖作首参；非函数常量原样导出
    if (d.isFn) {
      // ⚠ 必须带 m 标志：def 文本含**前置注释**（getFullText），`^const` 不加 m 只匹配串首 ⇒ 一个都插不进去
      t = t.replace(new RegExp(`^(const|let)\\s+${n}\\s*=\\s*(async\\s*)?\\(`, 'm'), (m, kw, asy) => `${kw} ${n} = ${asy || ''}(${pn}: ${g.depsType}, `)
      t = t.replace(new RegExp(`^function\\s+${n}\\(`, 'm'), `function ${n}(${pn}: ${g.depsType}, `)
      if (!t.includes(`${pn}: ${g.depsType}`)) console.log(`   ⚠ ${g.file}.${n} 未插入依赖首参，请检查形态`)
    }
    t = t.replace(/^(const|let|function|async function) /, 'export $1 ')
    parts.push(t)
  }
  let body = parts.join('\n\n')
  // 组内互相调用也要补 d（首参是依赖）；定义行已变成 `name = (d: …`，不含 `name(` ⇒ 不会误伤
  const pn2 = g.paramName || 'd'
  for (const n of g.defs) if (defs.get(n).isFn) {
    body = body.replace(new RegExp(`\\b${n}\\(`, 'g'), `${n}(${pn2}, `)
  }
  const bindList = g.defs.map((n) => (defs.get(n).isFn
    ? `    ${n}: (...a: Tail<Parameters<typeof ${n}>>) => ${n}(${pn2}, ...a),`
    : `    ${n},`))
  const header = `// ${g.file}.ts — 蒸馏「${g.title}」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（${g.deps.length} 项）。
//   对外只暴露 create${g.api}(d) —— 返回绑定后的句柄，调用方零感知。
${importsFor(body, (g.extraImport || []).concat([`import type { DistillState } from './distill-state.js'`]))}
${g.iface}

${TAIL}
export function create${g.api}(${g.paramName || 'd'}: ${g.depsType}) {
  return {
${bindList.join('\n')}
  }
}
export type ${g.api} = ReturnType<typeof create${g.api}>

`
  // 组内函数被**当值传递**（回调/回传表）时必须绑 d：`{ versionOf: sessionFormatVersionOf }`
  //   ⇒ `{ versionOf: (...a) => sessionFormatVersionOf(d, ...a) }`。调用点已在上一行补过 d，跳过。
  body = bindValues(body, new Set(g.defs.filter((n) => defs.get(n).isFn)))
  // 噪声闸归属候选区领域（distill.ts 里它是模块级的，搬到本模块避免环）
  if (g.file === 'distill-candidates' && !body.includes('export const isNoiseIntent')) {
    body = readFileSync('scripts/_tmp-noise.txt', 'utf8').trimEnd() + '\n\n' + body
  }
  writeFileSync(`src/${g.file}.ts`, header + body + '\n')
  console.log(`wrote src/${g.file}.ts (${(header + body).split('\n').length} 行)  依赖 ${g.deps.length} 项`)
}
