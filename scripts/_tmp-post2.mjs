// 阶段 C-2b 后置：分块工具下沉到共享件（distill-agent 需要，直接 import distill 会成环）
import { readFileSync, writeFileSync } from 'node:fs'

const P = 'src/distill.ts'
const L = readFileSync(P, 'utf8').split('\n')
const a = L.findIndex((l) => l.startsWith('// ═══ v18 分段蒸馏常量'))
const b = L.findIndex((l) => l.startsWith('type AppContext = {'))
if (a < 0 || b < 0) {
  // 已下沉过（本件要可重复跑）⇒ 跳过段①，继续做段③
  console.log('段① 分块工具已下沉过，跳过')
  const L2 = readFileSync(P, 'utf8').split('\n')
  const pi2 = L2.findIndex((l) => l.includes('const parent = createParentApi('))
  const ai2 = L2.findIndex((l) => l.includes('领域模块装配（阶段 C-2b）'))
  if (pi2 >= 0 && ai2 >= 0 && pi2 > ai2) {
    const [line] = L2.splice(pi2, 1)
    L2.splice(ai2 + 1, 0, line)
    writeFileSync(P, L2.join('\n'))
    console.log('③ parent 装配已前移到 agent 之前')
  }
  process.exit(0)
}
const block = L.slice(a, b).join('\n')
const header = `// distill-chunks.ts — 分段蒸馏的**纯工具层**（切段 / 段清单续上下文）
//
// 为什么单独成件：distill-agent.ts 需要 buildEventChunks / manifest* 这一族，
//   它们原本定义在 distill.ts ⇒ 直接 import 会形成 distill → distill-agent → distill 的**环**
//   （本项目零环是硬性质）。本件只依赖 node 内置与 targets，处在依赖图更底层。
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

`
const body = block
  .replace(/^const CHUNK_CHARS/m, 'export const CHUNK_CHARS')
  .replace(/^const MAX_CHUNKS_PER_RUN/m, 'export const MAX_CHUNKS_PER_RUN')
  .replace(/^const textPartsOfEvent/m, 'export const textPartsOfEvent')
  .replace(/^type DistillChunk/m, 'export type DistillChunk')
  .replace(/^type DistillChunks/m, 'export type DistillChunks')
  .replace(/^const buildEventChunks/m, 'export const buildEventChunks')
  .replace(/^const manifestLineFor/m, 'export const manifestLineFor')
  .replace(/^const manifestPush/m, 'export const manifestPush')
writeFileSync('src/distill-chunks.ts', header + body + '\n')

// 从 distill.ts 摘掉，改为 import
const rest = L.slice(0, a).concat(["import { CHUNK_CHARS, MAX_CHUNKS_PER_RUN, buildEventChunks, manifestLineFor, manifestPush, textPartsOfEvent } from './distill-chunks.js'"], L.slice(b)).join('\n')
writeFileSync(P, rest)
console.log(`分块工具已下沉（${b - a} 行 → distill-chunks.ts）`)

// ③ parent 装配前移：agent 依赖 parent，而 parent 原插入点（子代理归属区）在 agent 之后
{
  const L = readFileSync(P, 'utf8').split('\n')
  const pi = L.findIndex((l) => l.includes('const parent = createParentApi('))
  const ai = L.findIndex((l) => l.includes('领域模块装配（阶段 C-2b）'))
  if (pi >= 0 && ai >= 0 && pi > ai) {
    const [line] = L.splice(pi, 1)
    L.splice(ai + 1, 0, line)
    writeFileSync(P, L.join('\n'))
    console.log('③ parent 装配已前移到 agent 之前')
  }
}
