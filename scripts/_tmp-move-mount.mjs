// 阶段 C-2d：把 registerDistill 里的 ctx.on / ctx.effect **注册语句**整块移入 distill-hooks.ts，
// 装配层只留一行调用（I1 要求装配函数 ≤120 行；这些注册块连注释占 ~86 行）。
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'
import { renameInSource } from './_tmp-rename.mjs'

const P = 'src/distill.ts'
const text = readFileSync(P, 'utf8')
const sf = ts.createSourceFile(P, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const lineOf = (p) => sf.getLineAndCharacterOfPosition(p).line + 1
let fn = null
for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name?.text === 'registerDistill') fn = st

const picked = []
for (const st of fn.body.statements) {
  if (!ts.isExpressionStatement(st) || !ts.isCallExpression(st.expression)) continue
  const callee = st.expression.expression
  if (!ts.isPropertyAccessExpression(callee)) continue
  const obj = callee.expression
  if (!ts.isIdentifier(obj) || obj.text !== 'ctx') continue
  if (callee.name.text !== 'on' && callee.name.text !== 'effect') continue
  picked.push({ from: st.getFullStart(), to: st.getEnd(), text: st.getFullText(sf) })
}
console.log(`命中 ${picked.length} 个 ctx.on/ctx.effect 注册块`)
if (!picked.length) process.exit(1)

// ① 从 registerDistill 摘掉，原位留一行装配调用
let out = text
const call = `  hooks.mountDistillEvents(ctx, { infra, write, parent, wm, agent, st, ds, kRoot, config })\n`
for (let i = picked.length - 1; i >= 0; i--) {
  const p = picked[i]
  const insert = i === 0 ? call : ''
  out = out.slice(0, p.from) + insert + out.slice(p.to)
}
writeFileSync(P, out)

// ② 追加到 distill-hooks.ts（作为 mountDistillEvents 的实现）
const H = 'src/distill-hooks.ts'
// 注册块里的裸名 → HooksDeps 的字段（否则模块级拿不到 parent/ds/st/config）
const HOOKS_MAP = [['infra', 'dep.io.infra'], ['kRoot', 'dep.io.kRoot'], ['SHORT', 'dep.io.SHORT'], ['write', 'dep.dom.write'], ['parent', 'dep.dom.parent'], ['wm', 'dep.dom.wm'], ['act', 'dep.dom.act'], ['llm', 'dep.dom.llm'], ['st', 'dep.state'], ['ds', 'dep.sleep'], ['config', 'dep.env.config']]
const body0 = renameInSource(picked.map((p) => p.text.replace(/^ {2}/gm, '')).join('\n'), HOOKS_MAP)
// ⚠ `agent` 在注册块里**两种身份并存**：局部 `const agent = ctx.agents.get(sid)`（多数）
//   与依赖里的 AgentApi（`agent.distillAgent(...)`）。整体改名会把局部名也改坏
//   ⇒ 只对依赖用法做定点替换，局部名一律不动。
const body = body0.replace(/\bagent\.distillAgent\b/g, 'dep.distill.distillAgent')
let h = readFileSync(H, 'utf8')
// 迁入的注册块里有 `const agent = ctx.agents.get(sid)` / `({ agent }: any)` 这类**局部同名变量**，
// 与依赖字段 agent 撞名 ⇒ 把该字段改名为 distill（局部名一律不动）
h = h.replace("import { unlinkSync } from 'node:fs'", "import { existsSync, unlinkSync } from 'node:fs'")
h = h.replace('  infra: InfraApi', '  io: { infra: InfraApi; kRoot: string; SHORT: string }')
h = h.replace('  write: WriteApi', '  dom: { write: WriteApi; parent: ParentApi; wm: WmApi; distill: AgentApi; act: ActApi; llm: LlmApi; bank: BankApi }')
h = h.replace('  parent: ParentApi', '').replace('  wm: WmApi', '').replace('  agent: AgentApi', '')
h = h.replace('  ctx: any', '  env: { ctx: any; config: any }')
h = h.replace('  config: any', '')
h = h.replace('  kRoot: string', '')
h = h.replace('  st: DistillState', '  state: DistillState')
h = h.replace('  ds: { sessions: Map<string, any>; getDeepSleepStatus(): any }', '  sleep: { sessions: Map<string, any>; noteEvent(sid: string, isTurnEnd: boolean): void; deepSleepCheck(): void; DEEP_SLEEP_CHECK_MS: number; getDeepSleepStatus(): any }')
// 模块内已有的 sweepBacklog 引用也要跟着分组路径走（长的先替换）
for (const [a, b] of [['dep.distill.', 'dep.dom.distill.'], ['dep.write.', 'dep.dom.write.'], ['dep.parent.', 'dep.dom.parent.'], ['dep.wm.', 'dep.dom.wm.'], ['dep.infra.', 'dep.io.infra.'], ['dep.config.', 'dep.env.config.'], ['dep.ctx.', 'dep.env.ctx.'], ['dep.agent.', 'dep.dom.distill.'], ['hooks.sweepBacklog', 'sweepBacklog'], ['bank.runSelfCheck', 'dep.dom.bank.runSelfCheck'], ['dep.st.', 'dep.state.'], ['dep.ds.', 'dep.sleep.'], ['dep.kRoot', 'dep.io.kRoot']]) h = h.split(a).join(b)
if (!h.includes('distill: AgentApi')) { console.error('ok'); }
if (!h.includes('distill: AgentApi')) { console.error('⚠ HooksDeps 字段改名未命中'); process.exit(1) }
const mount = `
/**
 * 事件钩子 + 工具注册（自 registerDistill 迁出）。
 * 为什么整块搬：这 3 个 ctx.on + 5 个 ctx.effect 连注释占 ~86 行，是装配函数里**唯一**的体积来源；
 *   它们虽是"注册"语义，但体积上让 registerDistill 无法满足 I1（≤120 行）。
 *   搬出后装配层只剩「构造依赖 → 调 mount → 返回句柄」，判据里的三条都成立。
 * ⚠ ctx 单独传（注册必须挂在宿主上下文上），其余依赖走 HooksDeps。
 */
export function mountDistillEvents(ctx: any, dep: HooksDeps): void {
${body}
}
`
writeFileSync(H, h.trimEnd() + '\n' + mount)
console.log('已迁入 distill-hooks.ts:mountDistillEvents')
