#!/usr/bin/env node
/**
 * test-model-config.mjs — 子代理**路由与档位**的行为判据（ACT-295 · 2026-09-21）
 *
 * 判因（本件守什么）：本轮给面板加了「三级模型选择器」（服务 → 模型 → **档位**），
 *   而档位必须**真的有消费者**，否则就是本仓明令禁止的**假旋钮**。本件把三条契约钉住：
 *     ① **回落规则**（具体键 → 共用键 → 继承）与既有实现逐字一致（搬家不改语义）；
 *     ② **档位**只在真支持处出现：`resolveRoute` 回得出 effort，且 `agentOptions` 组装
 *        **空档位 ⇒ 不带该字段**（宿主语义是 absence preserves the provider default；
 *        塞空串会被 adapter 当非法档位拒call）；
 *     ③ **评估通道那侧不设 effort 旋钮**（它走裸 HTTP，请求体没有该字段）——用它自己的 `evalTier`。
 *
 * ⚠ 判据口径：只测**编译产物**（lib/），与仓内既有测试件同法；未 build ⇒ skip(3)。
 * 退出码：0 pass / 1 fail / 3 skip
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`) } else { fail++; console.log(`  ✗ ${m}`) } }

console.log('═══ test-model-config ═══')

const LIB = join(ROOT, 'lib', 'model-config.js')
if (!existsSync(LIB)) { console.log('⏭ skip：lib/model-config.js 不存在（先 npm run build:host）'); process.exit(3) }
const M = await import(`file://${LIB.replace(/\\/g, '/')}`)

/* 全部为空 ⇒ 继承主会话 */
const EMPTY = M.modelOptionsOf({ llmProvider: '', llmModel: '', distillProvider: '', distillModel: '', distillEffort: '', sleepProvider: '', sleepModel: '', sleepEffort: '' })

/* ── A 回落规则（与既有实现逐字一致）── */
console.log('\nA 回落规则（具体键 → 共用键 → 继承）')
{
  ok(M.resolveRoute(EMPTY, 'distill') === null, '全空 ⇒ null（继承主会话，不派路由）')

  const onlyShared = { ...EMPTY, llmProvider: 'p1', llmModel: 'm1' }
  const r1 = M.resolveRoute(onlyShared, 'distill')
  ok(r1 && r1.provider === 'p1' && r1.model === 'm1', '仅共用键 ⇒ 回落到 llmProvider/llmModel')
  ok(r1 && r1.effort === '', '共用键回落 ⇒ effort 为空（共用键无档位）')

  const own = { ...EMPTY, llmProvider: 'p1', llmModel: 'm1', distillProvider: 'p2', distillModel: 'm2', distillEffort: 'high' }
  const r2 = M.resolveRoute(own, 'distill')
  ok(r2 && r2.provider === 'p2' && r2.model === 'm2', '具体键齐全 ⇒ 覆盖共用键')
  ok(r2 && r2.effort === 'high', '具体键齐全 ⇒ 档位一并带出（真档位，非装饰）')
  const r3 = M.resolveRoute(own, 'sleep')
  ok(r3 && r3.provider === 'p1' && r3.effort === '', '另一用途（sleep）不受 distill 键影响，且其档位独立')

  /* 成对规则：只给 provider 不给 model ⇒ 视为未指定（沿用既有语义，不静默半配） */
  const halfPair = { ...EMPTY, distillProvider: 'p9' }
  ok(M.resolveRoute(halfPair, 'distill') === null, '只给 provider 不给 model ⇒ 视为未指定（成对规则，不半配）')

  const sleepOwn = { ...EMPTY, sleepProvider: 'sp', sleepModel: 'sm', sleepEffort: 'low' }
  const r4 = M.resolveRoute(sleepOwn, 'sleep')
  ok(r4 && r4.effort === 'low', '深睡专属档位独立生效')
  ok(M.resolveRoute(onlyShared, 'sleep').effort === '', '深睡回落共用键时 effort 亦为空（不串档）')
}

/* ── B schema 键集 = 投影键集（防「schema 有 ≠ config 有」）── */
console.log('\nB schema 与投影键集一致')
{
  const schemaKeys = Object.keys(M.modelConfigSchema).sort()
  const projKeys = Object.keys(M.modelOptionsOf(M.modelOptionsOf({}))).sort()
  ok(schemaKeys.length === 8, `路由域 schema 恰 8 键（实测 ${schemaKeys.length}）`)
  ok(JSON.stringify(schemaKeys) === JSON.stringify(projKeys), 'schema 键集 == modelOptionsOf 投影键集（无漏键/多键）')
  for (const k of ['distillEffort', 'sleepEffort']) {
    ok(schemaKeys.includes(k), `schema 含档位键 ${k}（有消费者：spawn 的 agentOptions.reasoningEffort）`)
  }
}

/* ── C 消费者的组装契约（**空档位不带字段** —— 宿主语义）── */
console.log('\nC agentOptions 组装：空档位不塞字段')
{
  /* ★ 断言口径（2026-09-21 修正过一次）：原版直接 grep 两处调用点的**内联三元展开**，
   *   而那正是本轮被 `audit-fnspan` 判超限（406 行）的写法 ⇒ 已抽成 `withEffort` 共享函数。
   *   若继续断言"内联展开"，等于把**已被否掉的实现形态**钉进判据（判据跟不上实现会假红/假绿）。
   *   现改为断言**行为契约**：以真实函数驱动三种取值。 */
  const C = await import(`file://${join(ROOT, 'lib', 'model-config.js').replace(/\\/g, '/')}`)
  const base = { provider: 'p', model: 'm' }
  const r0 = C.withEffort(base, '')
  ok(!('reasoningEffort' in r0), '档位为空串 ⇒ **不带** reasoningEffort 字段（沿用模型默认）')
  ok(r0.provider === 'p' && r0.model === 'm', '为空档位时路由字段原样保留')
  ok(!('reasoningEffort' in C.withEffort(base, undefined)), 'undefined 同上（不塞空/不塞 undefined）')
  ok(!('reasoningEffort' in C.withEffort(base, null)), 'null 同上')
  ok(C.withEffort(base, '  high  ').reasoningEffort === 'high', '非空档位 ⇒ 带出且**去首尾空白**')
  /* 契约（**实测校正过一次**）：空档位 ⇒ **原样返回同一对象**（不多做一次无谓拷贝）；
   *   非空档位 ⇒ **返回新对象**，不改调用方传入的 opts（避免共享可变对象被就地改）。 */
  ok(r0 === base, '空档位 ⇒ 返回同一对象（不做无谓拷贝）')
  ok(C.withEffort(base, 'high') !== base && !('reasoningEffort' in base),
    '非空档位 ⇒ 返回新对象，且**不改**传入的 opts（免共享可变对象被就地改）')

  /* 两处调用点必须**真的用**这个共享实现（否则档位接不上） */
  const dsrc = readFileSync(join(ROOT, 'src', 'distill-agent.ts'), 'utf8')
  const ssrc = readFileSync(join(ROOT, 'src', 'deepsleep-run.ts'), 'utf8')
  ok(/withEffort\(/.test(dsrc), 'distill-agent.ts 经 withEffort 组装（档位真透传给 spawn）')
  ok(/withEffort\(/.test(ssrc), 'deepsleep-run.ts 经 withEffort 组装（深睡侧同样真透传）')
  ok(/from '\.\/model-config\.js'/.test(dsrc) && /from '\.\/model-config\.js'/.test(ssrc),
    '两处都从 model-config.js 引入（不是各自本地实现）')

  /* 面板白名单必须放行两键，否则 UI 写入被静默丢弃（本轮最容易踩的一格） */
  const obs = readFileSync(join(ROOT, 'src', 'panel-observe.ts'), 'utf8')
  const con = readFileSync(join(ROOT, 'src', 'panel-contract.ts'), 'utf8')
  for (const k of ['distillEffort', 'sleepEffort']) {
    ok(obs.includes(`'${k}'`), `panel-observe.ts 白名单含 ${k}（否则 POST 被 400 拒绝）`)
    ok(con.includes(`'${k}'`), `panel-contract.ts 契约白名单含 ${k}（与源码逐键一致由 check-panel-contract 守）`)
  }
}

/* ── D 评估通道**刻意不设** effort 旋钮（反假旋钮）── */
console.log('\nD 评估通道不设 effort 旋钮（走裸 HTTP，请求体无该字段）')
{
  const ev = readFileSync(join(ROOT, 'src', 'eval-config.ts'), 'utf8')
  ok(!/evalEffort/.test(ev), 'eval-config.ts 无 evalEffort 键（该路请求体没有 effort 字段 ⇒ 设了即假旋钮）')
  ok(/evalTier/.test(ev), '评估通道用 evalTier（成本结构档，真被消费：超时预算 + 置信阈值）')
  const ch = readFileSync(join(ROOT, 'src', 'eval-channel.ts'), 'utf8')
  ok(/nativePayloadOf/.test(ch) && !/reasoningEffort/.test(ch), 'eval-channel.ts 的请求组装不含 reasoningEffort（判据与上条同源）')
}

/* ── E 宿主目录的降级语义（拿不到就空，不猜）── */
console.log('\nE llm-catalog 降级：拿不到 ⇒ 空，不猜')
{
  const cat = await import(`file://${join(ROOT, 'lib', 'llm-catalog.js').replace(/\\/g, '/')}`)
  const none = await cat.createLlmCatalog({})()
  ok(Array.isArray(none) && none.length === 0, '无宿主 llm ⇒ 空目录（不抛）')
  const noModels = await cat.createLlmCatalog({ llm: { listProviders: () => [{ id: 'p' }] } })()
  ok(Array.isArray(noModels) && noModels.length === 0, 'provider 无 listModels ⇒ 空（不抛）')

  const fake = {
    llm: {
      listProviders: () => [{ id: 'prov1' }],
      listModels: async () => [{ id: 'm1', name: 'M1' }, { id: 'm2' }],
      resolveModelInfo: async (_p, m) => (m === 'm1'
        ? { reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }], defaultEffort: 'high' }, context: { contextWindow: 32000 } }
        : (() => { throw new Error('boom') })()),
    },
  }
  const rows = await cat.createLlmCatalog(fake)()
  ok(rows.length === 2, `两个模型都返回（实测 ${rows.length}）`)
  const m1 = rows.find((r) => r.id === 'm1')
  ok(m1 && m1.efforts.length === 2 && m1.defaultEffort === 'high', 'm1 档位与默认档位来自 adapter 声明（不发明常量表）')
  ok(m1 && m1.contextWindow === 32000, 'm1 上下文上限带出')
  const m2 = rows.find((r) => r.id === 'm2')
  ok(m2 && Array.isArray(m2.efforts) && m2.efforts.length === 0, 'm2 档位解析抛错 ⇒ 空档位（降级不抛，UI 显「沿用模型默认」）')
  ok(m2 && m2.defaultEffort === undefined, 'm2 无默认档位 ⇒ undefined（不猜）')
}

/* ── F 宿主目录是旧形状的**超集**（旧消费方零迁移）── */
console.log('\nF 向后兼容：目录项 ⊇ 旧 {provider,id,name}')
{
  const cat = await import(`file://${join(ROOT, 'lib', 'llm-catalog.js').replace(/\\/g, '/')}`)
  const rows = await cat.createLlmCatalog({
    llm: { listProviders: () => [{ id: 'p' }], listModels: async () => [{ id: 'm' }] },
  })()
  const r = rows[0]
  ok(r && typeof r.provider === 'string' && typeof r.id === 'string' && typeof r.name === 'string',
    '三项旧字段齐备（/llm/models 既有消费方零迁移）')
}

console.log(`\ntest-model-config: ${fail === 0 ? 'PASS' : 'FAIL'}（${pass} 断言通过 / ${fail} 失败）`)
process.exit(fail === 0 ? 0 : 1)
