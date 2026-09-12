// 阶段 C-1 后置处理（每次重新生成后都要跑一次，故独立成件）
import { readFileSync, writeFileSync } from 'node:fs'

// ① distill.ts：runNode/textOf 已提到 distill-proc，补 import；RunResult 类型也要引
{
  const p = 'src/distill.ts'
  let d = readFileSync(p, 'utf8')
  const L = d.split('\n')
  const a = L.findIndex((l) => l.startsWith('// ── 异步进程调用'))
  const b = L.findIndex((l) => l.startsWith('const textOf = (r: RunResult)'))
  if (a >= 0 && b >= 0) L.splice(a, b - a + 1, "import { runNode, textOf } from './distill-proc.js'", "import type { RunResult } from './distill-proc.js'")
  d = L.join('\n')
  // 噪声闸：从 distill 摘掉，改为 import + re-export（scripts/activation-calib.mjs 依赖 lib/distill.js#isNoiseIntent）
  const m = d.match(/\/\/ ── 宿主注入样板判别[\s\S]*?export const isNoiseIntent = \(s: string\): boolean => CANDIDATE_NOISE\.some\(\(re\) => re\.test\(String\(s\)\)\)\n/)
  if (m) d = d.replace(m[0], "import { isNoiseIntent } from './distill-candidates.js'\nexport { isNoiseIntent, CANDIDATE_NOISE } from './distill-candidates.js'\n")
  writeFileSync(p, d)
  console.log('① distill.ts：proc 导入 + 噪声闸 re-export')
}

// ② 装配片段补 ctx（LLM / parent 两个领域都要宿主 ctx）
{
  const p = 'src/distill.ts'
  let d = readFileSync(p, 'utf8')
  d = d.replace('createLlmApi({ log: infra.log, llmState, config })', 'createLlmApi({ log: infra.log, llmState, config, ctx })')
  d = d.replace('createParentApi({ log: infra.log, config, st })', 'createParentApi({ log: infra.log, config, ctx, st })')
  writeFileSync(p, d)
  console.log('② 装配片段已补 ctx')
}

// ③ parent：pa 需要显式类型（ctx 是 any，TS 推不出来）
{
  const p = 'src/distill-parent.ts'
  let d = readFileSync(p, 'utf8')
  d = d.replace('const pa = d.ctx.agents.get(p)', 'const pa: any = d.ctx.agents.get(p)')
  writeFileSync(p, d)
  console.log('③ parent: pa 显式类型')
}
