// 阶段 C-2d 后置：路径常量下沉（registerDistill 只剩装配，路径推导归 distill-paths.ts）
import { readFileSync, writeFileSync } from 'node:fs'

const P = 'src/distill.ts'
const L = readFileSync(P, 'utf8').split('\n')
const a = L.findIndex((l) => l.startsWith('  const SHORT = '))
const b = L.findIndex((l) => l.startsWith('  const stubDir = '))
if (a < 0 || b < 0) { console.log('未命中路径常量区', a, b); process.exit(1) }
// 连同紧随其后的注释一起搬（注释属于下一段）
const block = L.slice(a, b + 1)
const header = `// distill-paths.ts — 蒸馏域的**路径与容量常量**（单一推导处）
//
// 为什么单独成件：registerDistill 要满足 I1（装配函数 ≤120 行），这 11 个常量连注释占 ~25 行，
//   且它们只是「从 dshHome/knowledgeRoot 推导出来的路径」，与装配无关 ⇒ 抽成工厂最自然。
import { join } from 'node:path'
import { dshHome, knowledgeRoot } from './targets.js'
import { LEDGER_FILE } from './deepsleep-core.js'

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
`
const body = block.map((l) => l.replace(/^ {2}/, '')).join('\n')
writeFileSync('src/distill-paths.ts', header + body + '\n  return { SHORT, logFile, kRoot, watermarkFile, auditFile, ledgerFile, pendDir, episodeFile, candidateDir, EPISODE_CAP, stubDir }\n}\n')

// distill.ts：换成一次调用 + 解构（保留裸名，后续代码零改动）
const destr = '  const { SHORT, logFile, kRoot, watermarkFile, auditFile, ledgerFile, pendDir, episodeFile, candidateDir, EPISODE_CAP, stubDir } = createDistillPaths()'
const out = L.slice(0, a).concat([destr], L.slice(b + 1)).join('\n')
writeFileSync(P, out.replace("import { newDistillState } from './distill-state.js'", "import { newDistillState } from './distill-state.js'\nimport { createDistillPaths } from './distill-paths.js'"))
console.log(`路径常量已下沉（${block.length} 行 → distill-paths.ts）`)
