/**
 * @dsh-external/shoucang-scheduler — 工具包形态（由 dev_scaffold_plugin 生成）。
 * 规范：资源注册必须挂 ctx.effect（热重载/卸载自动清理——注入器踩坑记录）。
 *
 * 高性能铁律（DeepSeek V4 Pro 实测，参考 dsh-anchored-standard 98/99）：
 * 1. 工具 schema 精简：description 用短句点明用途，详解放 tool result / 静态引导文本，
 *    不要写进 schema——工具目录按字符计费进首轮 prefill，实测 6 插件可膨胀到 17.6 万字符，
 *    稀释首轮注意力且无缓存 prefill 最贵（缓存命中便宜 10 倍）。
 * 2. 首轮锚定：工具面大（≥5 个）时首轮只露最核心的 1-2 个工具，首个工具调用后恢复全部——
 *    首轮请求结构决定整条会话的策略轨迹，锚定在训练对齐的窄工具面再放开，能力不损。
 *    启用方法见 apply() 末尾的注释块。
 */
import type { Context } from 'cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from 'schemastery'

export const name = "@dsh-external/shoucang-scheduler"
export const inject = ['tools']

export interface Config {
  boards_persona: boolean
  boards_memory: boolean
  boards_wiki: boolean
  g30_enabled: boolean
  verify_enabled: boolean
}

export const Config = z.object({
  boards_persona: z.boolean().default(true),
  boards_memory: z.boolean().default(true),
  boards_wiki: z.boolean().default(true),
  g30_enabled: z.boolean().default(true),
  verify_enabled: z.boolean().default(true),
})

// 默认板块快照（MVP 用 config 注入；对应 shoucang.config.yaml §boards）
function defaultBoards(cfg: Config) {
  return { persona: cfg.boards_persona, memory: cfg.boards_memory, wiki: cfg.boards_wiki }
}

// boards 参数："memory,wiki" -> 仅开这两板块（演示板块开关联动）
function parseBoards(raw: string | undefined, base: Record<string, boolean>) {
  const b = { ...base }
  if (!raw) return b
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const specified = new Set(parts)
  for (const k of Object.keys(b)) b[k] = specified.has(k)
  return b
}

// G0 准入：判定是否进入守藏；纯推理/闲聊 → 旁路零成本
function admit(intent: string | undefined, query: string | undefined) {
  if (intent === 'read' || intent === 'write' || intent === 'maintain') return { pass: true, intent }
  const q = (query || '').toLowerCase()
  if (/写入|保存|记录|归档|添加|更新|冲突|废弃|merge|supersede/.test(q)) return { pass: true, intent: 'write' }
  if (/检索|查|找|召回|笔记|记忆|画像|知识|how|what|remind|lookup|search/.test(q)) return { pass: true, intent: 'read' }
  return { pass: false, intent: 'bypass', reason: '无守藏路由意图（纯推理/闲聊/工具执行）' }
}

// G1 读路由：场景映射 R1-R5（建议，不剥夺模型自主选路权）
function readRoute(query: string | undefined, boards: Record<string, boolean>) {
  const active = Object.keys(boards).filter((k) => boards[k])
  const q = (query || '')
  let route = 'R4'
  let note = '语义检索，不可达自动降级关键词'
  if (/冷启动|新会话|第一次/.test(q)) { route = 'R1'; note = '全局注入（受 injection.level 分级）' }
  else if (/指针|index|导航|浏览|探索|目录/.test(q)) { route = 'R2'; note = '指针表逐层下钻' }
  else if (/关键词|词面|精确/.test(q)) { route = 'R3'; note = '关键词检索' }
  else if (/直读|路径|get_file|已知/.test(q)) { route = 'R5'; note = '直读 get_file' }
  return { route, note, boards: active }
}

// G2 写路由：裁决 W1/W2/W3 + 板块开关校验
function writeRoute(target: string | undefined, boards: Record<string, boolean>) {
  const t = (target || '').toLowerCase()
  let path = 'W2'
  let destination = ''
  let boardKey = ''
  if (/persona|画像/.test(t)) { boardKey = 'persona'; destination = '画像/'; path = 'W2' }
  else if (/memory|记忆|config|rule|refer|tool|env|环境/.test(t)) { boardKey = 'memory'; destination = '记忆/日记忆'; path = 'W1' }
  else if (/pre.?skill|技能|skill/.test(t)) { boardKey = 'wiki'; destination = '预skill/skills'; path = 'W2' }
  else if (/note|笔记/.test(t)) { boardKey = 'wiki'; destination = '笔记'; path = 'W1' }
  else return { path: 'W2', destination: '(unknown)', boardKey: '(unknown)', blocked: 'target_type 无法归类' }
  if (!boards[boardKey]) return { path, destination, boardKey, blocked: '板块已关闭:' + boardKey }
  return { path, destination, boardKey, blocked: '' }
}

// G3 验证门：G30 证据计数（claims ≤ 工具实证），只信工具证据；FIX_LOOP 升级建议
function g30Verdict(claims: string | undefined, evidenceReads: string | undefined) {
  const c = Number(claims) || 0
  const e = Number(evidenceReads) || 0
  return { claimsN: c, evidenceReads: e, pass: e >= c }
}
function fixLevel(g30: { pass: boolean }, conflict: boolean) {
  if (g30.pass && !conflict) return 'L0-ok'
  return g30.pass ? 'L2-fix-adjudication' : 'L1-fix-evidence'
}

export function apply(ctx: Context, config: Config): void {
  // shoucang_route：G0/G1/G2 + boards 联动（一次调用获调度路由裁决）
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'shoucang_route',
    description: '守藏调度执行器：G0 准入早分流 / G1 读路由建议(R1-R5) / G2 写路径裁决(W1-W3)，受 boards 开关约束。Model 只对接此协议，不摸板块内部。',
    parameters: {
      intent: { type: 'string' },
      query: { type: 'string' },
      target_type: { type: 'string' },
      boards: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          gate: { type: 'string' },
          intent: { type: 'string' },
          route: { type: 'string' },
          destination: { type: 'string' },
          boards: { type: 'array', items: { type: 'string' } },
          blocked: { type: 'string' },
          note: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args: unknown, v: any) => [{ type: 'text', text: `gate=${v.gate} intent=${v.intent} route=${v.route} dest=${v.destination} boards=[${(v.boards || []).join(',')}] blocked=${v.blocked || 'no'} note=${v.note || '-'}` }],
    },
    async execute(args: any) {
      const boards = parseBoards(args.boards, defaultBoards(config))
      const g0 = admit(args.intent, args.query)
      if (!g0.pass) return { gate: 'g0/bypass', intent: 'bypass', route: '', destination: '', boards: Object.keys(boards).filter((k) => boards[k]), blocked: '', note: g0.reason }
      if (g0.intent === 'read') { const r = readRoute(args.query, boards); return { gate: 'g1/read', intent: 'read', route: r.route, destination: '(read)', boards: r.boards, blocked: '', note: r.note } }
      if (g0.intent === 'write') { const w = writeRoute(args.target_type, boards); return { gate: w.blocked ? 'g2/blocked' : 'g2/write', intent: 'write', route: w.path, destination: w.destination, boards: Object.keys(boards).filter((k) => boards[k]), blocked: w.blocked, note: w.blocked ? w.blocked : '经 write_gate 落盘' } }
      return { gate: 'g2/maintain', intent: 'maintain', route: 'W3', destination: '归档', boards: Object.keys(boards).filter((k) => boards[k]), blocked: '', note: '维护触发（idle-review/lifecycle）' }
    },
  })), '@dsh-external/shoucang-scheduler: route tool')

  // shoucang_verify：G3 验证门（V 对抗 + G30 + FIX_LOOP）
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'shoucang_verify',
    description: '守藏调度执行器 G3 验证门：对抗验证 + 证据核验。输入 claims/evidence_reads/operation/conflict。只信工具证据(G30)，失败按 FIX_LOOP 给出修正层级。',
    parameters: {
      claims: { type: 'string' },
      evidence_reads: { type: 'string' },
      operation: { type: 'string' },
      conflict: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          gate: { type: 'string' },
          g30_pass: { type: 'boolean' },
          claims: { type: 'number' },
          evidence_reads: { type: 'number' },
          v_stage: { type: 'string' },
          fix_level: { type: 'string' },
          note: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args: unknown, v: any) => [{ type: 'text', text: `gate=${v.gate} g30=${v.g30_pass} claims=${v.claims} evidence=${v.evidence_reads} v=${v.v_stage} fix=${v.fix_level} note=${v.note}` }],
    },
    async execute(args: any) {
      const g30 = g30Verdict(args.claims, args.evidence_reads)
      const conflict = (args.conflict || 'no') === 'yes'
      const vStage = g30.pass ? (conflict ? 'v2-adjudication-conflict' : 'v1-evidence-ok') : 'v1-evidence-fail'
      const fix = fixLevel(g30, conflict)
      const note = g30.pass && !conflict ? '验证通过，可落库/晋升' : (g30.pass ? '证据充分但存在冲突，需修正四操作裁决' : 'G30 未过：claims 无足够工具实证，削减断言或补 read_file 证据')
      return { gate: 'g3/verify', g30_pass: g30.pass, claims: g30.claimsN, evidence_reads: g30.evidenceReads, v_stage: vStage, fix_level: fix, note }
    },
  })), '@dsh-external/shoucang-scheduler: verify tool')
}
