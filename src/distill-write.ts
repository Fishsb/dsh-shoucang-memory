// distill-write.ts — 蒸馏「写回与派发（画像行 / 索引登记 / 卡片派发 / defer 回流 / claim 并发闸）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（8 项）。
//   对外只暴露 createWriteApi(d) —— 返回绑定后的句柄，调用方零感知。
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { memoryLibRoot, dshHome, resolveTarget, loadWhitelist, gateMemoryAppend } from './targets.js'
import type { RouteTarget } from './targets.js'
import { runNode, textOf } from './distill-proc.js'
import type { RunResult } from './distill-proc.js'
import { semanticSim } from './vec.js'
import { admitIndexRow, pointersOfRow, sectionCore } from './section-ref.js'
// 待认领队列（单一实现）：卡命名与「未落地知识回退」共用同一函数（本件只转发导出，勿再写第二份）
import { knowledgeDeferFileOf } from './pointer-deficits.js'
import { atomicWriteFile } from './section-rewrite.js'
import { carrierFiles, mirrorAll, mirrorFile } from './record-shadow.js'
import { commitRingChannels } from './ring-commit.js'
// B（2026-09-17 圆桌会议册一）：内容级凭据准入**单一实现**（与 gate 内联表同源，改一处须同步）。
import { findSecrets } from './secret-redact.js'
import type { EmbedCfg } from './vec.js'
import type { InfraApi } from './distill-infra.js'
import type { CandApi } from './distill-candidates.js'
import type { LlmApi } from './distill-llm.js'
import type { DistillState } from './distill-state.js'

export interface WriteDeps {
  kRoot: string
  pendDir: string
  embedCfgOf(): EmbedCfg
  infra: InfraApi
  cand: CandApi
  llm: LlmApi
  st: DistillState
  config: any
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createWriteApi(dep: WriteDeps) {
  return {
    liveCaps: (...a: Tail<Parameters<typeof liveCaps>>) => liveCaps(dep, ...a),
    capEnv: (...a: Tail<Parameters<typeof capEnv>>) => capEnv(dep, ...a),
    memAppend: (...a: Tail<Parameters<typeof memAppend>>) => memAppend(dep, ...a),
    normalizeProfileTarget: (...a: Tail<Parameters<typeof normalizeProfileTarget>>) => normalizeProfileTarget(dep, ...a),
    profileCapOf: (...a: Tail<Parameters<typeof profileCapOf>>) => profileCapOf(dep, ...a),
    PROFILE_HEADER,
    writeProfileLine: (...a: Tail<Parameters<typeof writeProfileLine>>) => writeProfileLine(dep, ...a),
    registerIndexMeta: (...a: Tail<Parameters<typeof registerIndexMeta>>) => registerIndexMeta(dep, ...a),
    writeDispatch: (...a: Tail<Parameters<typeof writeDispatch>>) => writeDispatch(dep, ...a),
    flushDeferCards: (...a: Tail<Parameters<typeof flushDeferCards>>) => flushDeferCards(dep, ...a),
    MAX_DISPATCH_RETRY,
    hasPendingUndigested: (...a: Tail<Parameters<typeof hasPendingUndigested>>) => hasPendingUndigested(dep, ...a),
    CLAIM_TTL_MS,
    claimDirOf: (...a: Tail<Parameters<typeof claimDirOf>>) => claimDirOf(dep, ...a),
    claimFileOf: (...a: Tail<Parameters<typeof claimFileOf>>) => claimFileOf(dep, ...a),
    tryClaim: (...a: Tail<Parameters<typeof tryClaim>>) => tryClaim(dep, ...a),
    claimHeld: (...a: Tail<Parameters<typeof claimHeld>>) => claimHeld(dep, ...a),
    releaseClaim: (...a: Tail<Parameters<typeof releaseClaim>>) => releaseClaim(dep, ...a),
  }
}
export type WriteApi = ReturnType<typeof createWriteApi>

// 容量门实时读取（2026-09-10：面板调容量门后写门即时生效，不必重载插件）——
// 优先 scheduler.json 的 capAgent/capUser/capMemory（= 面板同源），回落启动期 config 值。
const liveCaps = (dep: WriteDeps, ): { agent: number; user: number; memory: number } => {
  const d = { agent: dep.config.capAgent ?? 3000, user: dep.config.capUser ?? 3000, memory: dep.config.capMemory ?? 5000 }
  try {
    const s = JSON.parse(readFileSync(join(dshHome(), 'suite', 'scheduler.json'), 'utf8')) as Record<string, unknown>
    if (typeof s.capAgent === 'number' && s.capAgent > 0) d.agent = s.capAgent
    if (typeof s.capUser === 'number' && s.capUser > 0) d.user = s.capUser
    if (typeof s.capMemory === 'number' && s.capMemory > 0) d.memory = s.capMemory
  } catch { /* 配置不可读=用启动值 */ }
  return d
}

const capEnv = (dep: WriteDeps, ): Record<string, string> => {
  const c2 = liveCaps(dep, )
  return { SHOUCANG_CAP_MEMORY: String(c2.memory), SHOUCANG_CAP_USER: String(c2.user), SHOUCANG_CAP_AGENT: String(c2.agent) }
}

// ── 写入分发（ADR-0002 核心：动态路由 + 白名单门禁 + 零拷贝写入 + 审计）──
const memAppend = async (dep: WriteDeps, target: string, kind: 'append' | 'new', payload: string, section: string, t: RouteTarget): Promise<RunResult> => {
  const script = join(memoryLibRoot(), 'scripts', 'memory-append.mjs')
  const args = kind === 'append' ? [target, section, payload] : [target, '-', '--new', payload]
  return runNode(dep.config.nodeBin, script, args, { env: { MEMORY_ROOT: t.root, ...capEnv(dep, ) }, timeout: 20000 })
}

// ── 双画像维护（2026-09-08 用户拍板：蒸馏/睡眠不只补记忆，还更新 USER/AGENT 双画像——助理角色要有自我认知）
//    v16：AGENT.md 升格为「成长型自我画像」（含 [原则] 习得原则），容量 2,000→3,000 ──
// v5.1（2026-09-10 架构体检实锤）：契约教模型输出 target=USER|AGENT，写门却只认 USER.md|AGENT.md →
//   蒸馏 profiles 通道自 v15 上线以来每次写入必被拒（审计 kind=gate-reject target=USER/AGENT 为证）。
//   模型输出的用词漂移一律在宿主侧收敛——与下方 section 归一化（前导 §/## 前缀）同法，不回退成「拒收」。
const normalizeProfileTarget = (dep: WriteDeps, raw: string): 'USER.md' | 'AGENT.md' | null => {
  const k = String(raw || '').trim().toLowerCase().replace(/\.md$/, '')
  return k === 'user' ? 'USER.md' : k === 'agent' ? 'AGENT.md' : null
}

// 容量门同源（补齐 2026-09-10「画像/记忆容量与容量门同源」漏掉的第三处源：此处原为硬编码 3,000）
const profileCapOf = (dep: WriteDeps, canon: 'USER.md' | 'AGENT.md'): number => (canon === 'USER.md' ? liveCaps(dep, ).user : liveCaps(dep, ).agent)

// ── P4 双写期影子镜像（方案档 docs/context-supply-plan.md §10）──
// md 成功写入后把该文件镜像进 Record 影子库（<库根>/.records/records.jsonl），并把「导出能否逐字节还原」写进日志。
// 纪律：① **只镜像、绝不回写 md**（双写期 md 仍是事实源，单写向）；② **零抛出**——影子写失败不影响主写入链路；
//       ③ 开关 storeMode（缺省 'md' ⇒ 不动作，现状零行为变化），避免"选了却没接线"的死开关。
const mirrorShadow = (dep: WriteDeps, root: string, file: string): void => {
  if (dep.config.storeMode !== 'dual') return
  try {
    const r = mirrorFile(root, file, new Date().toISOString())
    if (!r.ok || !r.roundTrip) dep.infra.log(`record-shadow 镜像异常 ${file}: ${r.error || '往返不一致'}`)
  } catch (e) { dep.infra.log(`record-shadow 镜像失败 ${file}: ${String((e as Error).message).slice(0, 80)}`) }
}

const PROFILE_HEADER: Record<string, string> = {
  'USER.md': '# USER.md — 用户画像\n\n> 「人」的画像：用户稳定偏好/背景/禁忌。库中唯一直接关于用户的文件；其余（notes/原则/索引/AGENT.md）皆为 agent 自身资产。写入口=蒸馏 profileUpdates + 深度睡眠 profileOps；每行带源指针。',
  'AGENT.md': '# AGENT.md — Agent 自我画像（助理的成长档案）\n\n> 用户助理角色的自我认知：角色定位/稳定做法/能力边界/常犯错误与教训/[原则] 习得原则（深度睡眠归纳内化，v16）。库中其余一切（notes/索引）都是本 agent 为履行助理职责而积累的自身资产，本文件只回答「我是谁、我学到了什么、我怎样服务好用户」。写入口=蒸馏 profileUpdates + 深度睡眠（原则行 + profileOps）；每行带源指针。',
}

/**
 * 画像行写入（宿主直写，tmp+rename 原子）：小节存在→小节尾加行；不存在→文件尾建小节。
 * 门禁：target 归一化后仅 USER.md/AGENT.md、小节名防注入、单行 ≤160 字符、库容量按 liveCaps(dep, )、去重、replace 须 match 逐字存在。
 * 返回带拒因（v5.1）：拒收原因写真进审计，不再糊成一句「格式/容量门」导致无法诊断。
 */
const writeProfileLine = (dep: WriteDeps, root: string, target: string, section: string, line: string, replaceMatch?: string): { st: 'added' | 'dedup' | 'failed' } | { st: 'rejected'; why: string } => {
  try {
    const canon = normalizeProfileTarget(dep, target)
    if (!canon) return { st: 'rejected', why: `target 非画像（${String(target).slice(0, 24)}）` }
    const sec = String(section || '').trim().replace(/^##+ */, '').trim()
    const ln = String(line || '').trim()
    if (!sec || !ln || ln.length > 160 || /[#`]/.test(sec)) return { st: 'rejected', why: `格式违规（${!sec ? '小节名为空' : !ln ? '行为空' : ln.length > 160 ? `行长 ${ln.length} > 160` : '小节名含 # 或 ` 注入字符'}）` }
    /* B（2026-09-17 圆桌会议册一）：**内容级凭据准入**（与 `memory_write_gate.mjs` 的 exit 5 同一判据、
     *   同源规则表 —— 那条是子进程活件、零依赖，不得 import src/；本处是 host 直写路径的**第二道同一判据**）。
     *   判因：库内实测已落明文密钥，而本函数是「宿主直写画像行」的唯一入口 —— 原门禁链只有格式/去重/容量，
     *   无内容维度。⚠ 宁可少报（漏网只是没帮上忙，误杀会污染真实内容）。 */
    const secretHits = findSecrets(ln)
    if (secretHits.length) return { st: 'rejected', why: `检出疑似凭据[${secretHits[0].category}]（${secretHits[0].masked}）⇒ 改为占位符或移除后再写入` }
    /* 册三（2026-09-19 · docs/pointer-supply-plan.md §5-2）：**画像行的 § 准入**（补 G4）。
     *   判因（方案 §2.2 G4）：索引行（MEMORY.md）已有唯一强制点 `admitIndexRow`，而**画像通道**（USER/AGENT 的
     *   `← 源: notes/x.md §y`）**无判据** —— 真库实测该口存量 **10 行**（AGENT 5 / USER 5），当前 0 悬空 ⇒ **潜在口**。
     *   口径与索引行**同源**（`admitIndexRow`：`missing`（含末段缺）⇒ 拒；`partial`/`ambiguous` ⇒ 放行 + 提示），
     *   故不新增判据、不另立实现（跨面同源由差分锁与真库存量阴性对照守）。 */
    {
      const adm = admitIndexRow(root, ln)
      if (!adm.ok) {
        const miss = adm.missing.map((m) => `notes/${m.file}§${m.name}`).join('、')
        return { st: 'rejected', why: `源指针悬空（${miss}）⇒ 先建节或修正指针后再写（与索引行同判据）` }
      }
      if (adm.ambiguous.length || adm.partial.length) {
        const hint = [
          ...adm.ambiguous.map((a) => `notes/${a.file}§${a.spec}（${a.cands.length} 个同名候选）`),
          ...adm.partial.map((p) => `notes/${p.file}§${p.spec}（子节缺：${p.missing.join('、')}）`),
        ].join('、')
        try { dep.infra.log(`profile 源指针提示（已放行）: ${hint}`) } catch { /* 日志失败无害 */ }
      }
    }
    const file = join(root, canon)
    let body = ''
    try { body = readFileSync(file, 'utf8') } catch { body = (PROFILE_HEADER[canon] || `# ${canon}\n`) + '\n' }
    if (body.split('\n').some((l) => l.trim() === ln)) return { st: 'dedup' }
    const cap = profileCapOf(dep, canon)
    if (body.length + ln.length + sec.length + 8 > cap) return { st: 'rejected', why: `容量超限（${body.length}+${ln.length}+${sec.length}+8 > ${canon} 容量 ${cap}）` } // 容量门：超限拒绝，待画像间合并
    const lines = body.split('\n')
    const secIdx = lines.findIndex((l) => l.trim() === `## ${sec}`)
    if (secIdx < 0) lines.push('', `## ${sec}`, ln)
    else if (replaceMatch) {
      const mi = lines.findIndex((l) => l.trim() === String(replaceMatch).trim())
      if (mi < 0) return { st: 'rejected', why: 'replace 未逐字命中既有行' } // replace 要求 match 逐字存在（防误改）
      lines[mi] = ln
    } else {
      let end = secIdx + 1
      while (end < lines.length && !lines[end].startsWith('## ')) end++
      lines.splice(end, 0, ln)
    }
    // S2S3 册零：改走**唯一写入原语**（唯一 tmp 名 + 回读校验）；原固定名 `file + '.tmp'` 并发互踩。
    const w = atomicWriteFile(file, lines.join('\n'))
    if (!w.ok) return { st: 'failed' }
    mirrorShadow(dep, root, canon) // P4 双写期：镜像进 Record 影子库（缺省 md 档=不动作）
    return { st: 'added' }
  } catch { return { st: 'failed' } }
}

/**
 * 索引行新增 → 同步登记 notes/INDEX.md「条目元数据表」（维护台账）。
 * 判因（2026-09-11 ACT-030）：元数据表是「一行一主题」的维护台账，但 newIndex 通道从不登记
 * ⇒ 体检「未登记元数据表主题」缺口随每次蒸馏持续增长（实测存量 36 条）。这里补齐**登记端**，
 * 使台账随索引自动同步（幂等：同主题已存在则跳过）。失败不阻断索引写入——体检仍以 ⚠️ 暴露缺口。
 */
const registerIndexMeta = (dep: WriteDeps, root: string, targetFile: string, indexLine: string, sid: string): void => {
  try {
    if (!['MEMORY.md', 'USER.md', 'AGENT.md'].includes(targetFile)) return
    const idxFile = join(root, 'notes', 'INDEX.md')
    if (!existsSync(idxFile)) return
    // 主题口径与体检脚本一致：去标签 → 取 · 前 → 去 → 后 → 去 =/：复合前段
    const topic = String(indexLine).replace(/^\[[^\]]+\]\s*/, '').split('·')[0].split('→')[0].trim().split(/[=：]/)[0].trim()
    if (!topic) return
    const body = readFileSync(idxFile, 'utf8')
    const meta = body.split('## 条目元数据表')[1]
    if (!meta || meta.includes(topic)) return
    const row = `| ${topic} | ${new Date().toISOString().slice(0, 10)} | agent | active | 蒸馏 ${dep.infra.sidShort(sid)} 新增 |`
    const lines = body.split('\n')
    const note = lines.findIndex((l) => l.startsWith('> 维护规则：新增条目'))
    lines.splice(note > -1 ? note : lines.length, 0, row)
    const w2 = atomicWriteFile(idxFile, lines.join('\n'))
    if (!w2.ok) dep.infra.log(`distill: 元数据表登记写盘失败（${String(w2.error).slice(0, 60)}）`)
  } catch { /* 台账登记失败不阻断索引写入 */ }
}

// ── 册三（2026-09-19）：**失败三态分类**（单一实现，纯函数可单测）──
//   判因（真机实测）：一个 `failed` 原先同时承载四类东西，而水位规则是 `failed>0 ⇒ 不推`
//   ⇒ 模型侧的"地址/格式不合规"与"需人工建锚"都能**永久锁住水位**（近 1h `distill-run` 30/30 带 failed>0）。
//   三态：
//     · `needsAnchor` —— 地址不存在，需人工建锚（内容已裁决，**不该**扣水位；进 `anchor-needed` 台账供认领）
//     · `rejected`    —— 标签非法 / 指针悬空 / 去重拒收（内容已裁决，**不该**扣水位）
//     · `undigested`  —— I/O / 原子写 / 子进程异常（**唯一**扣水位的一类，有界重试）
//   ⚠ 未知一律落 `undigested`（保守：宁可重试一次，不可静默丢料）。
export const classifyMemFailure = (text: string): { kind: 'needsAnchor' | 'rejected' | 'undigested'; marker: string } => {
  const t = String(text || '')
  if (/顶层小节|小节「[^」]*」不存在/.test(t)) return { kind: 'needsAnchor', marker: 'missing-section' }
  if (/标签非法|指针悬空|指针目标节不存在|索引行重复|dangling-pointer|dup-index/.test(t)) return { kind: 'rejected', marker: 'content-format' }
  return { kind: 'undigested', marker: 'io-or-unknown' }
}

// ── 册二（2026-09-19 · docs/pointer-supply-plan.md §4）：**段级成对裁决**（治 G2「半落」）──
//   实测形状（方案 §2.2 G2）：同批 `appends` 落点失败（顶层节缺 ⇒ exit 2）后，`newIndex` 行**照写**，
//   且该行指针指向**合法存在**的小节 ⇒「行落了、知识没落」，而准入在**原理上失明**
//   （它校验的是地址有效性，不是"该地址下是否真有这段知识"）。
//   配对键 = `目标文件#首段小节core`（同 target 文件 + 指针首段，保守优先）。
//   ⚠ 两类失败分别记：带可用小节的失败 ⇒ 键级配对；**连小节都没有**的失败 ⇒ 文件级加宽（宁可少写行）。
const pairKeyOf = (target: string, section: unknown): string =>
  // 首段归一：`pointersOfRow` 对**多指针行**会把分隔符（` · `/`；` 等）并进 spec 尾部 ⇒ 此处剥掉，
  // 否则配对键与 append 侧永远不相等（实测：多指针行因此**漏判**成对失败 —— 由 `check-pointer-pairing` 抓出）。
  `${String(target || '').replace(/^notes\//, '').trim()}#${sectionCore(String(section ?? '').split('/')[0].replace(/[·、,，:：;；\s]+$/, ''))}`
export { pairKeyOf }

/**
 * 册二：给定索引行 → 其**未成对**（明细未落地）的指针描述（空数组 = 该行可落）。
 * 抽成**导出纯函数**是为了可机检：直接驱动 `writeDispatch` 会经 `resolveTarget()`/子进程写**真库**（红线禁止），
 * 故判据只驱动本函数（`scripts/check-pointer-pairing.mjs`），并把"新判定 vs 旧规则"的**判别力**一并断言。
 */
export const unpairedPointersOf = (
  line: string,
  failedPairs: ReadonlySet<string>,
  failedFilesWide: ReadonlySet<string>,
): string[] =>
  pointersOfRow(String(line ?? ''))
    .filter((p) => failedFilesWide.has(String(p.file)) || failedPairs.has(pairKeyOf(`notes/${p.file}`, p.spec)))
    .map((p) => `notes/${p.file}§${String(p.spec).replace(/[·、,，:：;；\s]+$/, '')}`)

/** 册二：回退队列文件路径（**单一实现已下沉 `pointer-deficits#knowledgeDeferFileOf`**，此处只转发） */
export { knowledgeDeferFileOf } from './pointer-deficits.js'

/**
 * 册二：未落地知识的**回退队列**（复用既有 `pending/` 通道，不新造）。
 * ⚠ 文件名用 `-knowledge-defer-` 前缀，且**必须**被蒸馏候选过滤器排除
 *   （`distill-agent` 的 `candFiles`）——否则会被当候选**重喂 LLM** ⇒ 「同一批知识反复重裁决」死循环。
 *   幂等：同 (源会话, 行原文) ⇒ 同文件，已存在即跳过。
 */
const deferKnowledge = (dep: WriteDeps, sid: string, o: { line: string; miss: string; target: string }): boolean => {
  try {
    const f = knowledgeDeferFileOf(dep.pendDir, sid, o.line)
    if (existsSync(f)) return true
    mkdirSync(dep.pendDir, { recursive: true })
    writeFileSync(f, `# [knowledge-defer] ${String(o.line).slice(0, 60)}\n\n- 源会话：${sid}\n- 目标：${o.target}\n- 未同落指针：${o.miss}\n- 状态：同批明细未落地 ⇒ 索引行**不落**、知识暂存**待认领**（不自动重裁决，防循环）\n\n${o.line}\n`, 'utf8')
    dep.infra.audit({ sid, kind: 'knowledge-deferred', target: o.target, miss: o.miss, file: f.replace(/\\/g, '/').split('/').pop() })
    return true
  } catch { return false }
}

const writeDispatch = async (dep: WriteDeps, sid: string, out: any, route: string, workspace: string | null): Promise<{ added: number; rejected: number; failed: number; undigested: number; needsAnchor: number; pairedSkipped: number; items: Array<Record<string, string>>; targetLib: string }> => {
  let added = 0, rejected = 0, undigested = 0, needsAnchor = 0, pairedSkipped = 0
  /** 册二：同批 append 未落地的配对键（键级 + 文件级加宽），供 newIndex 逐行成对裁决 */
  const failedPairs = new Set<string>()
  const failedFilesWide = new Set<string>()
  // S2S3 册零（2026-09-19）：**失败明细**（条目身份，不只计数）。
  //   判因：L2 会话级复盘要「本会话 L1 全部产出（含未落地）」；而原实现失败只 `failed++`，
  //   审计行只有三个数 ⇒ L2 会以为"会话没这条知识"（实测 `write.ingest` 只有计数、无条目标识）。
  //   故每处失败都记 `{k,target,section,tag,reason}`（上限 20 条，防审计行膨胀），随 `distill-run` 行落盘。
  //   册三：明细**按三态分流**（`items` 每条形如 `{k,target,section,tag,reason}`，kind 由 `k` 前缀区分）。
  const items: Array<Record<string, string>> = []
  const pushItem = (k: string, target: string, section: string, reason: string, tag = ''): void => {
    if (items.length < 20) items.push({ k, target: String(target || ''), section: String(section || ''), tag, reason: String(reason || '').slice(0, 80) })
  }
  const markUndigested = (k: string, target: string, section: string, reason: string, tag = ''): void => { undigested++; pushItem(k, target, section, reason, tag) }
  const markRejected = (k: string, target: string, section: string, reason: string, tag = ''): void => { rejected++; pushItem(k, target, section, reason, tag) }
  const markAnchorNeeded = (k: string, target: string, section: string, reason: string, tag = ''): void => {
    needsAnchor++
    pushItem(k, target, section, reason, tag)
    // 可消费队列：**不新开观测流**（`check-observability` 只许并入单一事件源）⇒ 落统一台账 `type=anchor-needed`
    try {
      dep.infra.ledger({ type: 'anchor-needed', domain: 'ingest', sid: sid.replace(/^session-/, '').slice(0, 8), target: String(target || ''), section: String(section || ''), reason: String(reason || '').slice(0, 120) })
    } catch { /* 台账失败不阻断主链 */ }
  }
  /** 按 CLI 输出文本分类（唯一入口；未知 ⇒ undigested） */
  const markByText = (k: string, target: string, section: string, text: string, tag = ''): void => {
    const c = classifyMemFailure(text)
    const detail = `${c.marker}: ${String(text || '').slice(0, 80)}`
    if (c.kind === 'needsAnchor') markAnchorNeeded(k, target, section, detail, tag)
    else if (c.kind === 'rejected') markRejected(k, target, section, detail, tag)
    else markUndigested(k, target, section, String(text || '').slice(0, 80), tag)
  }
  // ── P4（2026-09-14）：**环记录落库**（决策/承诺/关系/价态）──
  //   为什么放在路由分支**之前**：它们是「经历」，不因本次路由是 memory/project/discard 而失效
  //   （在某项目会话里答应用户的事，仍然是答应过的事）。此前五环的唯一生产者是 CLI
  //   （`scripts/record-ring.mjs`）⇒ 实测 980 条记录里带环语义的仅 9 条且全靠手敲；写侧不断线，读侧才有内容。
  //   幂等性由各环模块自身守（同文本同 id ⇒ 原地替换，不重复入库），故逐 chunk 调用安全。
  const ring = commitRingChannels(
    { log: (m) => dep.infra.log(m), audit: (o) => dep.infra.audit({ sid, ...o }) },
    memoryLibRoot(), out, new Date().toISOString(), 'distill',
  )
  if (ring.ok) {
    const n = ring.decisions + ring.commitments + ring.relations + ring.valences
    if (n > 0) dep.infra.log(`distill 环记录落库：决策 ${ring.decisions} · 承诺 ${ring.commitments} · 关系 ${ring.relations} · 价态 ${ring.valences}（事件 ${ring.events}）`)
  } else {
    dep.infra.log(`distill 环记录落库失败（不影响主链路）：${ring.reason ?? ''}`)
  }
  if (route === 'memory') {
    const resolved = resolveTarget()
    if (!resolved.present) {
      for (const _a of ((out && Array.isArray(out.appends)) ? out.appends : [])) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', reason: '记忆库缺席（部署残缺）', lib: resolved.library }) }
      return { added, rejected, failed: undigested, undigested, needsAnchor, pairedSkipped, items, targetLib: resolved.library }
    }
    const { wl, source } = loadWhitelist(resolved.root)
    const gate = (t?: string): boolean => {
      const r = gateMemoryAppend({ target: t }, wl)
      if (!r.ok) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: t, reason: r.reason, lib: resolved.library }); dep.infra.log(`distill 拒收: ${r.reason?.slice(0, 120)}`) }
      return r.ok
    }
    const appends = (out && Array.isArray(out.appends)) ? out.appends : []
    const newIndex = (out && Array.isArray(out.newIndex)) ? out.newIndex : []
    for (const a of appends) {
      if (!a || !a.target || !a.section || !gate(a.target)) {
        if (a && (!a.target || !a.section)) {
          markRejected('append-baditem', a?.target, a?.section, '字段缺失（target/section 为空）')
          // 册二：连小节都没有的失败 ⇒ **文件级加宽**（保守：宁可少写行，不可写孤儿行）
          if (a?.target) failedFilesWide.add(String(a.target).replace(/^notes\//, '').trim())
        }
        continue
      }
      // v5：教训条目附 rootCause/avoidWhen → 追加「- 根因：…」「- 不适用：…」两行（WikiSkill 借鉴：WHY + 适用边界）
      const _base = String(a.text || '').trim()
      const _rc = typeof a.rootCause === 'string' && a.rootCause.trim() ? `\n- 根因：${a.rootCause.trim()}` : ''
      const _aw = typeof a.avoidWhen === 'string' && a.avoidWhen.trim() ? `\n- 不适用：${a.avoidWhen.trim()}` : ''
      // 小节名归一化（2026-09-10 实锤：模型偶发输出带前导 § 的 section → memory-append 按字面找不到既有锚，
      // 整条落点失败 dispatch-failed）：去前导 §、把路径间游离 § 规整为 /（保留 父/子 路径语义）
      // 2026-09-10 再实锤：模型还可能输出 '## 小节名'（带 markdown 标记，如 741dc51b 落点失败）→ 一并归一化
      const _sec = String(a.section || '').trim().replace(/^[§#]+\s*/, '').replace(/(\/)?\s*[§#]+\s*/g, '$1')
      if (!_sec) {
        markRejected('append-empty-section', String(a.target), '', '小节名为空（归一化后）')
        failedFilesWide.add(String(a.target).replace(/^notes\//, '').trim()) // 册二：文件级加宽
        continue
      }
      const r = await memAppend(dep, String(a.target), 'append', _base + _rc + _aw, _sec, resolved)
      if (r.status === 0) added++
      else {
        markByText('append', String(a.target), _sec, textOf(r))
        failedPairs.add(pairKeyOf(String(a.target), _sec)) // 册二：登记**未落地**配对键
        dep.infra.log(`distill 落点失败 ${a.target}§${a.section}: ${textOf(r).slice(0, 120)}`)
      }
    }
    for (const ni of newIndex) {
      if (!ni || !ni.line) { markRejected('index-baditem', ni?.target, '', '字段缺失（line 为空）'); continue }
      const t = String(ni.target || 'MEMORY.md')
      if (!gate(t)) continue
      const nl = String(ni.line).trim()
      // ★ 册二 **成对裁决**（放在 dup/准入之前：知识都没落地，行更不该落——它是更早的硬前提）：
      //   同批 append 未落地 ⇒ 该行**不写**，并按 `pending/` 回退（可捞、不自动重裁决）。
      //   判据 = 指针的 `notes/<file>` 与**首段小节**配对（保守优先）。
      {
        const unpaired = unpairedPointersOf(nl, failedPairs, failedFilesWide)
        if (unpaired.length) {
          const miss = unpaired.join(',')
          markRejected('index-unpaired', t, miss, '同批 append 未落地（成对裁决：行不落，防"行落了知识没落"）')
          pairedSkipped++
          dep.infra.audit({ sid, kind: 'gate-reject', target: t, reason: `unpaired-append:${miss}`, class: 'unpaired' })
          deferKnowledge(dep, sid, { line: nl, miss, target: t })
          dep.infra.log(`distill 拒收: 索引行与明细**不同落**（${miss}）⇒ 行不写、知识回退 pending 待认领`)
          continue
        }
      }
      // 指针唯一性硬门（2026-09-10 用户拍板 v6：同类同事实的指针只允许一个）——
      // ① 精确键=同文件 同[标签]+同主题 → 拒；② 语义近似=标签同 + 主题 bigram 重叠 ≥0.66（双方 ≥2 token）→ 拒并留原指针。
      const mNew = nl.match(/^\[([^\]\s]+)\]\s*([^·]+?)\s*·/)
      if (mNew) {
        const tagNew = mNew[1]
        const themeNew = mNew[2].trim()
        const tn = dep.cand.intentTokens(themeNew)
        let dup = 'none'
        const sameTagLines: string[] = []
        try {
          for (const ol of readFileSync(join(resolved.root, t), 'utf8').split(/\r?\n/)) {
            const m = ol.match(/^\[([^\]\s]+)\]\s*([^·]+?)\s*·/)
            if (!m || m[1] !== tagNew) continue
            const themeOld = m[2].trim()
            if (themeOld === themeNew) { dup = 'exact'; break }
            const to = dep.cand.intentTokens(themeOld)
            if (tn.length >= 2 && to.length >= 2) {
              const inter = tn.filter((x) => to.includes(x)).length
              const union = new Set([...tn, ...to]).size
              if (union > 0 && inter / union >= 0.66) { dup = 'approx'; break }
            }
            sameTagLines.push(ol.trim())
          }
        } catch { /* 目标文件不存在=无既有行 */ }
        // ③ 向量近似（v6 第二批 2026-09-10）：embed 可用时对同标签既有行整行语义比对（去指针段），
        //    高阈值 0.80 保守拒并——补词法漏网的「措辞迥异同事实」；未启用/失败自动跳过（精确+词法已兜底）
        if (dup === 'none' && sameTagLines.length && tn.length >= 1) {
          try {
            const ecfg = dep.embedCfgOf()
            if (ecfg.enabled) {
              const headOf = (l: string): string => { const i = l.indexOf('→'); return (i >= 0 ? l.slice(0, i) : l).trim() }
              const qText = headOf(nl)
              for (const ol of sameTagLines) {
                const s = await semanticSim(qText, headOf(ol), ecfg)
                if (s !== null && s >= 0.8) { dup = 'sem'; break }
              }
            }
          } catch { /* 语义拒并失败=按既有词法结论 */ }
        }
        if (dup !== 'none') {
          rejected++
          dep.infra.audit({ sid, kind: 'gate-reject', target: t, reason: `dup-index-topic:${dup}`, class: 'dup' })
          dep.infra.log(`distill 拒收: 索引行重复（${dup} ${tagNew}/${themeNew.slice(0, 20)}），保留原指针（同类同事实唯一）`)
          continue
        }
      }
      // S2S3 册零（2026-09-19）：**索引行准入（孤儿预防）前置**。
      //   仓库既有唯一强制点在 `memory-append --new`（S1R · D3）；宿主侧再前置一次，是为了让
      //   「小节没落盘 ⇒ 该索引行**也不单独落盘**」成立（同写/同不写）——不然会出现"索引行在、
      //   目标节不在"的孤儿指针（本册实测的病灶形状）。指针不可解析 ⇒ 拒写 + 明细入 failedItems。
      const adm = admitIndexRow(resolved.root, nl)
      if (!adm.ok) {
        const miss = adm.missing.map((x) => `${x.file}§${x.name}`).join(',')
        dep.infra.audit({ sid, kind: 'gate-reject', target: t, reason: `dangling-pointer:${miss}`, class: 'missing' })
        // 册三：孤儿指针是**拒收**（内容已裁决），不是 I/O 失败 —— 旧码在此 `rejected++` 之外还记一次
        //   `failed++`（册零引入）⇒ 「防孤儿」反成「永久扣水位」。现只计 rejected。
        markRejected('index-dangling', t, miss, '指针目标节不存在（拒写，防孤儿）', mNew ? mNew[1] : '')
        dep.infra.log(`distill 拒收: 索引行指针悬空（${miss}），不写入（同写/同不写）`)
        continue
      }
      const r = await memAppend(dep, t, 'new', nl, '-', resolved)
      if (r.status === 0) { added++; registerIndexMeta(dep, resolved.root, t, nl, sid) }
      else {
        markByText('index', t, '', textOf(r), mNew ? mNew[1] : '')
        // 册二（方案 §4-2）：**拒收逐条审计 + 原因分类**（不再吞成聚合计数）；class=format 指标签/格式类
        dep.infra.audit({ sid, kind: 'gate-reject', target: t, reason: 'index-rejected', class: 'format', detail: textOf(r).slice(0, 80) })
        dep.infra.log(`distill 新索引失败: ${textOf(r).slice(0, 120)}`)
      }
    }
    mirrorShadow(dep, resolved.root, 'MEMORY.md') // P4 双写期：索引行落盘后镜像（缺省 md 档=不动作）
    // 双画像：Q2「归谁」的 USER/AGENT 通道（宿主直写，格式/容量/去重门禁）
    const profiles = (out && Array.isArray(out.profiles)) ? out.profiles : []
    const date = new Date().toISOString().slice(0, 10)
    /* 画像回执分文件计数（2026-09-20 补 · **写侧「文件维」欠账**）：
     *   判因（`memory-reconcile` 实测暴露）：`write.consolidate` 是**深睡专属**且硬编码 `target: 'AGENT.md'`
     *     （`deepsleep-run.ts:728`），而**唯一能写 `USER.md` 的 `profiles` 通道此前完全不发回执**
     *     ⇒ 台账里 `write.consolidate` 的 target 分布 = `{AGENT.md: 65}` **恒无 USER.md/MEMORY.md**
     *     ⇒ 「行数闭合」判据的分母**结构性缺失**（USER.md 未解释 21 行、MEMORY.md 499 行皆源于此）。
     *   ⇒ 本处按 target 分别累计并各发一行回执（`channel:'profiles'`），让闭合有据可算。
     *   ⚠ **不改写入门禁语义**（仍走既有 `writeProfileLine`：归一化/防注入/容量/去重），只补**回执**。 */
    const profileTally: Record<string, { attempted: number; written: number; rejected: number }> = {}
    for (const p of profiles) {
      if (!p || !p.target || !p.section || !p.text) { markRejected('profile-baditem', p?.target, p?.section, '字段缺失'); continue }
      const tg = String(p.target).trim()
      const k = tg.toLowerCase() === 'user' ? 'USER.md' : tg.toLowerCase() === 'agent' ? 'AGENT.md' : tg
      profileTally[k] = profileTally[k] || { attempted: 0, written: 0, rejected: 0 }
      profileTally[k].attempted++
      const w = writeProfileLine(dep, resolved.root, tg, String(p.section), `- ${String(p.text).trim()} ← 源: distill ${dep.infra.sidShort(sid)} ${date}`)
      if (w.st === 'added') { added++; profileTally[k].written++ }
      else if (w.st === 'rejected') { rejected++; profileTally[k].rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: p.target, reason: `画像更新被拒（${w.why}）` }) }
      else if (w.st === 'failed') markUndigested('profile', String(p.target), String(p.section), '画像行落盘失败')
      // dedup：静默不计
    }
    for (const [k, t] of Object.entries(profileTally)) {
      /* ⚠ 用**独立 type** `write.profile`（不塞进 `write.ingest`）—— 理由：`write.ingest` 的 `target`
       *   语义是**目标库标识**（`targetLib`），本处的 `target` 是**文件名**；两者同名不同义已经害过
       *   `memory-reconcile` 一次（闭合判据分母恒 0）。**同 type 混两种语义是禁止的**（仓内同族教训：
       *   「同一语义两处判据必然漂移」的镜像形态 —— 这里是"同一字段两处语义"）。 */
      dep.infra.ledger({
        sid: sid.replace(/^session-/, '').slice(0, 8), type: 'write.profile', domain: 'ingest',
        channel: 'profiles', carrier: 'always:profile', target: k,
        verdict: t.written > 0 ? 'written' : (t.rejected > 0 ? 'rejected' : 'skipped'),
        attempted: t.attempted, written: t.written, rejected: t.rejected, failed: undigested,
      })
    }
    // P4 双写期**覆盖修复**（2026-09-13）：**一趟写入结束统一镜像全部载体**。
    //   原实现只在两处镜像（MEMORY.md 落盘后 :262 · 画像落盘后 :146），而 `appends` 循环写的
    //   `notes/*.md` 与索引元数据表（`notes/INDEX.md`）的更新**无人镜像** ⇒ `storeMode=dual` 下
    //   **最常见的 notes 追加**会让影子库失步，下一次对账必红（红得对，但那是覆盖不全）。
    //   与深睡链同一形状：**一趟末尾单点覆盖**（频率=蒸馏频率，代价可接受）。
    //   ⚠ 上方两处窄镜像**保留**：中途异常中断时它们已给出**部分**覆盖（端到端覆盖的兜底在下行整趟镜像）。
    if (dep.config.storeMode === 'dual') {
      try { mirrorAll(resolved.root, new Date().toISOString(), carrierFiles(resolved.root)) } catch { /* 镜像失败不影响主流程 */ }
    }
    dep.infra.audit({ sid, kind: 'distill-run', route, lib: resolved.library, wlSource: source, added, rejected, failed: undigested, undigested, needsAnchor, pairedSkipped, ...(items.length ? { failedItems: items } : {}) })
    return { added, rejected, failed: undigested, undigested, needsAnchor, pairedSkipped, items, targetLib: resolved.library }
  }
  if (route === 'project') {
    // 单库化（2026-09-08 用户拍板）：pmg 项目卡库已随治理插件移除，项目专属事实**直写项目工作区**
    // <workspace>/docs/devref/shoucang/（workspace 由会话转录反解）。
    // 降级链（2026-09-09 实态审计补缺）：反解失败≠丢弃——cards 幂等降级落 pending/
    // （<date>-project-defer-<slug>.md，符合蒸馏候选命名规范 → 下一轮随 pending 重新裁决；
    // workspace 恢复后 route=project 直写 devref；确认泛化则 route=memory 入 notes）。
    // 红线不变：项目专属内容绝不落全局 notes/索引——降级是「暂存等认领」，不是「放水入全局库」。
    const cards = (out && Array.isArray(out.projectCards)) ? out.projectCards : []
    if (!workspace) {
      for (const pc of cards) {
        if (!pc || !pc.title || !pc.text) { markRejected('card-baditem', pc?.title, '', '字段缺失（title/text 为空）'); continue }
        try {
          const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'card'
          const date = new Date().toISOString().slice(0, 10)
          const deferFile = join(dep.pendDir, `${date}-project-defer-${slug}.md`)
          // 幂等：同题降级文件已存在 → 不重复堆积，只审计计数（防止每轮蒸馏重复降级同一批）
          if (existsSync(deferFile)) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 已存在（去重），待认领' }); continue }
          mkdirSync(dep.pendDir, { recursive: true })
          writeFileSync(deferFile, `# [project-defer] ${pc.title}\n\n- 卡类型：${pc.cardType || 'reference'}\n- 源会话：${sid}\n- 溯源：${pc.source || ''}\n- 状态：workspace 反解失败降级暂存，待蒸馏重裁决或人工认领\n\n${pc.text}\n`, 'utf8')
          rejected++ // 未入册（defer=暂存非入册）
          dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: 'workspace 反解失败 → 降级 pending 待认领（不丢弃）' })
        } catch (e3) { markUndigested('card-defer', pc?.title, '', String((e3 as Error).message).slice(0, 120)); dep.infra.log(`distill project-defer 落盘失败: ${String((e3 as Error).message).slice(0, 120)}`) }
      }
      return { added, rejected, failed: undigested, undigested, needsAnchor, pairedSkipped, items, targetLib: 'pending-defer' }
    }
    const dir = join(workspace, 'docs', 'devref', 'shoucang')
    const cardTypes = ['how-to', 'reference', 'decision']
    const date = new Date().toISOString().slice(0, 10)
    // 2026-09-10：project 卡去重门（防多轮蒸馏同主题重复产卡）——读 devref 已有卡标题，
    // 同标签语义近似（主题 bigram 重叠 ≥0.66，双方 ≥2 token）→ 判重跳过并审计（与 MEMORY 指针唯一性同口径）。
    const existingCardTitles = ((): string[] => {
      try {
        return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
          try { const m = readFileSync(join(dir, f), 'utf8').match(/^#\s*\[项目事实\][^·]*·\s*(.+)$/m); return m ? m[1].trim() : '' } catch { return '' }
        }).filter(Boolean)
      } catch { return [] }
    })()
    const cardDupOf = (title: string): string | null => {
      if (dep.cand.cardTokens(title).length < 2) return null
      for (const ex of existingCardTitles) {
        if (ex === title) return ex
        if (dep.cand.cardSimilar(title, ex) >= 0.42) return ex
      }
      return null
    }
    for (const pc of cards) {
      if (!pc || !pc.title || !pc.text) { markRejected('card-baditem', pc?.title, '', '字段缺失（title/text 为空）'); continue }
      const cardType = cardTypes.includes(String(pc.cardType || '')) ? String(pc.cardType) : 'reference'
      if (!cardTypes.includes(String(pc.cardType || ''))) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: `cardType=${pc.cardType} 不在 [${cardTypes.join(',')}]` }); continue }
      const dupOf = cardDupOf(String(pc.title))
      if (dupOf) { rejected++; dep.infra.audit({ sid, kind: 'gate-reject', target: pc.title, reason: `项目卡重复（语义近似既有卡「${dupOf}」）——跳过防重复产卡`, lib: 'workspace' }); dep.infra.log(`distill 项目卡判重跳过: ${String(pc.title).slice(0, 30)}（≈ ${dupOf.slice(0, 30)}）`); continue }
      try {
        const slug = String(pc.title).replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'card'
        mkdirSync(dir, { recursive: true })
        const fb = join(dir, `${date}-${cardType}-${slug}.md`)
        writeFileSync(fb, `# [项目事实] ${cardType} · ${pc.title}\n\n- 卡类型：${cardType}\n- 溯源：${pc.source || ''}\n- 源会话：${sid}\n- 工作区：${workspace}\n\n${pc.text}\n`, 'utf8')
        added++
      } catch (e2) { markUndigested('card', pc?.title, '', String((e2 as Error).message).slice(0, 120)); dep.infra.log(`distill 项目事实直写失败: ${String((e2 as Error).message).slice(0, 120)}`) }
    }
    dep.infra.audit({ sid, kind: 'distill-run', route, lib: 'workspace', added, rejected, failed: undigested, undigested, needsAnchor, pairedSkipped, ...(items.length ? { failedItems: items } : {}) })
    return { added, rejected, failed: undigested, undigested, needsAnchor, pairedSkipped, items, targetLib: 'workspace' }
  }
  return { added, rejected, failed: undigested, undigested, needsAnchor, pairedSkipped, items, targetLib: 'none' }
}

// ── pending defer 卡直写（2026-09-10：project-defer 是「已裁决为项目卡」的降级暂存——workspace 恢复后
//    应直接直写该工作区 devref，不再让 LLM 重裁决（重裁决会按本轮会话 route 一刀切导致项目卡被 skip 丢失）。
//    flush 成功后移入 .processed（防重复）；workspace 仍不可解则留 pending 等下轮。──
const flushDeferCards = async (dep: WriteDeps, ): Promise<{ written: number; kept: number }> => {
  let written = 0, kept = 0
  let files: string[] = []
  try { files = readdirSync(dep.pendDir).filter((f) => /^\d{4}-\d{2}-\d{2}-project-defer-.*\.md$/.test(f)) } catch { return { written, kept } }
  for (const f of files) {
    try {
      const raw = readFileSync(join(dep.pendDir, f), 'utf8')
      const sidM = raw.match(/^-\s*源会话：\s*(session-\S+)/m)
      const titleM = raw.match(/^#\s*\[project-defer\]\s*(.+)$/m)
      const typeM = raw.match(/^-\s*卡类型：\s*(\S+)/m)
      if (!sidM || !titleM) { kept++; dep.infra.log(`defer 保留 ${f.slice(0, 40)}: 解析失败 sid=${!!sidM} title=${!!titleM}`); continue }
      const ws = await dep.llm.resolveWorkspace(sidM[1].trim())
      if (!ws) { kept++; dep.infra.log(`defer 保留 ${f.slice(0, 40)}: workspace 不可解（sid=${sidM[1].trim().slice(0, 18)}）`); continue } // workspace 仍不可解：留 pending
      const title = titleM[1].trim()
      const cardType = ['how-to', 'reference', 'decision'].includes(String(typeM ? typeM[1].trim() : '')) ? String(typeM![1].trim()) : 'reference'
      const bodyIdx = raw.indexOf('待蒸馏重裁决或人工认领')
      const body = bodyIdx >= 0 ? raw.slice(bodyIdx + '待蒸馏重裁决或人工认领'.length).trim() : ''
      const dir = join(ws, 'docs', 'devref', 'shoucang')
      mkdirSync(dir, { recursive: true })
      const date = new Date().toISOString().slice(0, 10)
      const slug = title.replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'card'
      const out = join(dir, `${date}-${cardType}-${slug}.md`)
      // 2026-09-10：语义判重（防同主题重复卡，与蒸馏直写同口径）——近似既有卡则只清 pending 不重复写
      const dupTitle = ((): string | null => {
        if (dep.cand.cardTokens(title).length < 2) return null
        try {
          for (const ef of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
            const m = readFileSync(join(dir, ef), 'utf8').match(/^#\s*\[项目事实\][^·]*·\s*(.+)$/m)
            if (!m) continue
            const ex = m[1].trim()
            if (ex === title) return ex
            if (dep.cand.cardSimilar(title, ex) >= 0.42) return ex
          }
        } catch { /* 读取失败=不判重 */ }
        return null
      })()
      if (!dupTitle && !existsSync(out)) writeFileSync(out, `# [项目事实] ${cardType} · ${title}\n\n- 卡类型：${cardType}\n- 溯源：（defer 回流 ${f}）\n- 源会话：${sidM[1].trim()}\n- 工作区：${ws}\n\n${body}\n`, 'utf8')
      const procDir = join(dep.pendDir, '.processed')
      try { mkdirSync(procDir, { recursive: true }); renameSync(join(dep.pendDir, f), join(procDir, f)) } catch { /* 移动失败：下轮重试 */ }
      written++
      dep.infra.audit({ kind: 'defer-flush', target: title, workspace: ws, cardType, file: f, sid: sidM[1].trim(), ...(dupTitle ? { dupOf: dupTitle } : {}) })
      dep.infra.log(`defer 回流: ${title.slice(0, 30)} → ${ws}/docs/devref/shoucang/${dupTitle ? `（判重跳过 ≈${dupTitle.slice(0, 24)}）` : ''}`)
    } catch (e) { kept++; dep.infra.log(`defer 回流失败 ${f.slice(0, 30)}: ${String((e as Error)?.message || e).slice(0, 100)}`) }
  }
  if (written || kept) dep.infra.log(`defer 回流汇总: 写入 ${written} / 保留 ${kept}`)
  return { written, kept }
}

// ── A1（2026-09-11 审查修复）：段落级落盘失败的有界重试 ──
// 语义：stop/JSON 都 OK 但条目级写失败（白名单外目标、磁盘错误、原子写失败…）时**不再前移水位**；
// 同一段连续失败满 MAX_DISPATCH_RETRY 次后强制推进 + 落审计 dispatch-failed-forced（丢失显式记账）。
const MAX_DISPATCH_RETRY = 3

// sid → 因未消化段而「扣住不推」的连续轮数
// 本会话是否还有未消化段（= dispatchFailStreak 里还有它自己的失败段记账）
const hasPendingUndigested = (dep: WriteDeps, sid: string): boolean => {
  const p = `${sid}#`
  for (const k of dep.st.dispatchFailStreak.keys()) if (k.startsWith(p)) return true
  return false
}

// 判据本身是**模块级纯函数** `planSkipWatermark`（见 planDiscardWrite 附近），与 G-20 同规格，
// 便于脱离宿主直接驱动；这里只持有状态（内存态，重载清零 ⇒ 最多再扣 SKIP_HOLD_MAX 轮）。

// ── A3（2026-09-11 审查修复）：跨实例 claim 锁**统一判定** ──
// 背景：claim 原只在 sweepBacklog 一侧读判，idle 路径（armIdleTimer → distillAgent）完全不查 ⇒
//   重叠 fiber 的 idle 定时器可与扫尾同时蒸同一会话（注释宣称的「跨实例防双蒸」不成立）。
// 现语义：claim 的**写**只发生在蒸馏入口（幂等）；扫尾只做只读让位判定；本轮结束/早退即释放。
const CLAIM_TTL_MS = 25 * 60000

const claimDirOf = (dep: WriteDeps, ): string => join(dep.kRoot, 'audit', 'claims')

const claimFileOf = (dep: WriteDeps, sid: string): string => join(claimDirOf(dep, ), sid + '.json')

/** 在途 claim（TTL 内）→ false（让位）；否则写入并返回 true。异常一律 true（claim 失败不阻塞，与既有语义一致） */
const tryClaim = (dep: WriteDeps, sid: string, lastSeq: number, maxSeq: number): boolean => {
  try {
    let at = 0
    try { at = Number((JSON.parse(readFileSync(claimFileOf(dep, sid), 'utf8')) as { at?: number }).at || 0) } catch { /* 无 claim */ }
    if (at && Date.now() - at < CLAIM_TTL_MS) return false
    mkdirSync(claimDirOf(dep, ), { recursive: true })
    writeFileSync(claimFileOf(dep, sid), JSON.stringify({ at: Date.now(), lastSeq, maxSeq }), 'utf8')
    return true
  } catch { return true }
}

const claimHeld = (dep: WriteDeps, sid: string): boolean => {
  try {
    const at = Number((JSON.parse(readFileSync(claimFileOf(dep, sid), 'utf8')) as { at?: number }).at || 0)
    return !!at && Date.now() - at < CLAIM_TTL_MS
  } catch { return false }
}

const releaseClaim = (dep: WriteDeps, sid: string): void => { try { unlinkSync(claimFileOf(dep, sid)) } catch { /* 无 claim/删除失败均无害 */ } }
