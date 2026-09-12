// distill-paths.ts — 蒸馏域的**路径与容量常量**（单一推导处）
//
// 为什么单独成件：registerDistill 要满足 I1（装配函数 ≤120 行），这 11 个常量连注释占 ~25 行，
//   且它们只是「从 dshHome/knowledgeRoot 推导出来的路径」，与装配无关 ⇒ 抽成工厂最自然。
import { join } from 'node:path'
import { dshHome, knowledgeRoot } from './targets.js'
import { LEDGER_FILE } from './criteria.generated.js'

export interface DistillPaths {
  SHORT: string
  logFile: string
  kRoot: string
  watermarkFile: string
  auditFile: string
  ledgerFile: string
  pendDir: string
  episodeFile: string
  candidateDir: string
  EPISODE_CAP: number
  stubDir: string
}

export function createDistillPaths(): DistillPaths {
const SHORT = 'shoucang-scheduler'

const logFile = join(dshHome(), 'super-injector', SHORT + '.log')

const kRoot = knowledgeRoot()

const watermarkFile = join(kRoot, 'audit', 'distill-watermark.jsonl')

const auditFile = join(kRoot, 'audit', 'distill-audit.jsonl')

// 判据台账（ADR-122 v2）：每次决策一行——判据取值 + 决策 + 结果 + 依据，供 scripts/criteria-audit.mjs 对账
const ledgerFile = join(kRoot, LEDGER_FILE)

const pendDir = join(kRoot, 'pending')

// ═══ 路线② 成长环数据源：轻 episode（同类判定/转正数据源，不存全文）+ 低置信任务候选区（跨窗口记忆）═══
const episodeFile = join(kRoot, 'audit', 'episodes.jsonl')

const candidateDir = join(pendDir, 'flow-candidates')

const EPISODE_CAP = 256

// ═══ WikiSkill 借鉴 · raw 裁决存根（raw-stub/）：每轮蒸馏裁决的不可变元数据留档（不含正文/文本内容，隐私安全），
// 供 route 分流抽验（audit-protocol §8 第 5 问）与契约升级的离线重放评测（对标 WikiSkill raw/ 只存证据不存解读）。写入后不覆写。
const stubDir = join(kRoot, 'audit', 'raw-stub')
  return { SHORT, logFile, kRoot, watermarkFile, auditFile, ledgerFile, pendDir, episodeFile, candidateDir, EPISODE_CAP, stubDir }
}
