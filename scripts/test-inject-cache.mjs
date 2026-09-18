#!/usr/bin/env node
// test-inject-cache.mjs — 阶段 1 缓存签名修复的**行为单测**（2026-09-14）
//
// 为什么必须补它（B2）：阶段 1 originally **全仓零单测**（`upstreamStampOf｜sizeStampOf｜
//   createHotMemory｜stableKey｜invalidate(` 在 scripts/ + skill/ 零命中），而它的收益主张
//   （「产线一落盘、注入缓存立即失效」）**恰恰是假的**——验收实测发现三条介质签名接在 120s 的
//   `stableKey` 上，而把关整段文本的是顶部 **30s 的 `cacheKey`**（`memRoot|q`，不含任何签名）
//   ⇒ 症状是「**缓存失效了，但输出没变**」，**正向测试天然看不见**。
//
// ⚠ 本件因此有一条硬纪律（验收方案 §0.2 第 4 条）：
//   判据必须落在**输出**上，不能落在"缓存键变了"上——只验后者会恒定假绿。
//
// ⚠ 关于 S3 的实现口径（如实记录）：稳定面缓存键是**尺寸口径**，所以"稳定面有没有被重算"
//   只能靠「同尺寸改内容」把它冻住来观测。本件因此**依赖该尺寸口径**；若将来把稳定面键改成
//   内容哈希（N2 修复），S3 需随之改写——届时它会红，这正是提示。
//
// 安全：全程在 `DSH_HOME=临时目录` 下跑，**不触碰真实记忆库**。
// 用法：node scripts/test-inject-cache.mjs    （先 `npm run build:host`；npm test 已含 pretest）
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
const fails = []
const ok = (cond, name) => { if (cond) pass++; else fails.push(name) }

/** 造一个隔离的假 DSH_HOME（三层索引 + 三条介质），返回 {home, mem, kn} */
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'sc-injcache-'))
  const mem = join(home, 'skills', 'managing-memory')
  const kn = join(home, 'suite', 'knowledge')
  mkdirSync(join(mem, 'audit'), { recursive: true })
  mkdirSync(join(kn, 'audit'), { recursive: true })
  // ⚠ 夹具坑（踩过）：`always` 层的**画像**标签只有「边界/性格/认知」（profileCarrierSet('always') 实测值）；
  //   用 `[原则]`/`[身份]` 属**索引行** ⇒ 画像块会**整块静默跳过**，断言会假红。
  writeFileSync(join(mem, 'AGENT.md'), '- [边界] AAAA ← 源: notes/x.md §y\n', 'utf8')
  writeFileSync(join(mem, 'USER.md'), '- [性格] probe ← 源: notes/u.md §z\n', 'utf8')
  // ⚠ 2026-09-18 按域路由 P0-a：`[环境]` 已由 P/always 归一为 **E/gated**（标签漂移修复）⇒ 不能再当
  //   「进动态面候选池」的标签（动态面池 = `readIdx('MEMORY.md')` = **只含 `inject=always` 的索引行**）。
  //   改用 `[原则]`（现役 P/always/index），**断言意图不变**：MEMORY.md 的两行要能进动态面并按冷热排序。
  writeFileSync(join(mem, 'MEMORY.md'), '[原则] 探针A · x → notes/env.md §qa\n[原则] 探针B · y → notes/env.md §qb\n', 'utf8')
  writeFileSync(join(mem, 'audit', 'activity.jsonl'), '{"f":"notes/env.md","s":"qa","status":"cold","hits30":0}\n', 'utf8')
  writeFileSync(join(kn, 'audit', 'warm-recall.json'), '{"at":0,"key":"","rows":[]}\n', 'utf8')
  writeFileSync(join(kn, 'delta.md'), '{"rows":[]}\n', 'utf8')
  return { home, mem, kn }
}

/** 在指定 home 上新建一个热记忆句柄（每个场景独立实例 ⇒ 缓存互不干扰） */
let hotSeq = 0
async function hotIn(home) {
  process.env.DSH_HOME = home
  process.env.MEMORY_ROOT = ''
  const mod = await import(`${pathToFileURL(join(repoRoot, 'lib', 'panel-shared.js')).href}?s=${++hotSeq}`)
  return mod.createHotMemory({ suite: mod.createSuiteConfig(), root: { activeRootOf: () => null, configFileOf: () => null } })
}
const orderOf = (t) => t.split('\n').filter((l) => /探针[AB]/.test(l)).map((l) => (l.match(/探针([AB])/) || [])[1]).join(',')
const stableOf = (t) => { const i = t.indexOf('[守藏·热记忆]'); const j = t.indexOf('知识索引（'); return i < 0 ? '' : t.slice(i, j < 0 ? undefined : j) }

// ── S1：签名接在**真正把关的层** —— 改 activity.jsonl 后，**同一 query** 紧接重调必须立即变 ──
// ⚠ 必须用**空 query**：非空 query 会走召回通道（`picked` 由召回结果定序），冷热排序只在
//   位置式回退路径生效（踩过）。缓存机制与之无关——`cacheKey` 对空/非空 query 一视同仁。
{
  const f = fixture()
  const hot = await hotIn(f.home)
  const t1 = hot.build('')
  ok(orderOf(t1) === 'B,A', `S1 控制组：cold 行后置 ⇒ B,A（实得 ${orderOf(t1)}）`)
  writeFileSync(join(f.mem, 'audit', 'activity.jsonl'), '{"f":"notes/env.md","s":"qa","status":"warm","hits30":99}\n', 'utf8')
  const t2 = hot.build('')                         // ← **同一 query**，30s 内
  ok(orderOf(t2) === 'A,B', `S1：改 activity.jsonl 后**同 query 重调即变**（B,A → ${orderOf(t2)}）`)
}

// ── S2：delta.md 同理（大小必须变，签名是尺寸口径）──
{
  const f = fixture()
  const hot = await hotIn(f.home)
  writeFileSync(join(f.kn, 'delta.md'), '{"rows":["[路径] DELTA-ONE"]}\n', 'utf8')
  const t1 = hot.build('s2')
  ok(t1.includes('DELTA-ONE'), 'S2 控制组：delta 内容进入一次性块（DELTA-ONE）')
  writeFileSync(join(f.kn, 'delta.md'), '{"rows":["[路径] DELTA-TWO-LONGER"]}\n', 'utf8')
  const t2 = hot.build('s2')
  ok(t2.includes('DELTA-TWO-LONGER'), `S2：改 delta.md 后**同 query 重调即变**（实得 ${t2.includes('DELTA-ONE') ? 'DELTA-ONE（旧值）' : 'DELTA-TWO-LONGER'}）`)
}

// ── S3：**不再对稳定面签无关介质** —— 改无关介质不得触发稳定面重算（但整段必须已重算）──
{
  const f = fixture()
  const hot = await hotIn(f.home)
  hot.build('')
  writeFileSync(join(f.mem, 'AGENT.md'), '- [边界] BBBB ← 源: notes/x.md §y\n', 'utf8')   // 同尺寸改内容
  const t2 = hot.build('')
  ok(stableOf(t2).includes('AAAA') && !stableOf(t2).includes('BBBB'), 'S3 前置：同尺寸改内容后稳定面仍取缓存值（证明缓存生效）')
  appendFileSync(join(f.mem, 'audit', 'activity.jsonl'), '{"f":"notes/env.md","s":"qb","status":"cold","hits30":0}\n', 'utf8')
  const t3 = hot.build('')
  // 整段必须已重算（否则"稳定面没变"是句废话）——用变动面作探针：qb 变 cold ⇒ 顺序变化
  ok(orderOf(t3) === 'A,B', `S3 控制组：整段确已重算（qb 变 cold ⇒ 顺序 A,B，实得 ${orderOf(t3)}）`)
  ok(stableOf(t3).includes('AAAA') && stableOf(t3) === stableOf(t2),
    'S3：改**无关介质**尺寸 ⇒ 稳定面**逐字节不变**（未被无关介质打穿）')
}

// ── S4：结构断言 —— `warm-recall.json` **不在失效键里**，且稳定面键不含上游戳 ──
//   ★IR1 册四（2026-09-18）：上游戳的**实现在 `supply-stamp.ts`**（单一实现）⇒ 本组断言**重新指向**
//   新落点，**语义逐条不变**（"整段键含上游戳 / 稳定面键不含 / 键包含 activity+delta / 键不含 warm"）。
{
  const src = readFileSync(join(repoRoot, 'src', 'panel-shared.ts'), 'utf8')
  const stampSrc = readFileSync(join(repoRoot, 'src', 'supply-stamp.ts'), 'utf8')
  const cacheKeyLine = (src.match(/const cacheKey = .*/) || [''])[0]
  const stableKeyLine = (src.match(/const stableKey = .*/) || [''])[0]
  const keyFn = (stampSrc.match(/export function stampKeyOf[\s\S]*?\n\}/) || [''])[0]
  const libFn = (stampSrc.match(/export function libStampOf[\s\S]*?\n\}/) || [''])[0]
  ok(cacheKeyLine.includes('libStampOf'), `S4：cacheKey 已接入**单一上游戳**（${cacheKeyLine.trim().slice(0, 70)}…）`)
  ok(!stableKeyLine.includes('libStampOf'), 'S4：stableKey **不含**上游戳（无关介质不再打穿稳定面）')
  ok(libFn.includes('activity.jsonl') && libFn.includes('delta.md'), 'S4：戳含 activity.jsonl + delta.md（两条介质）')
  ok(keyFn.includes('s.lib') && keyFn.includes('s.media') && !keyFn.includes('warm'),
    'S4：失效键 = 库戳 + 介质戳，**不含 warm**（查询域绑定，签它会为别的 query 的写入失效本 query）')
}

// ── S5：零抛出 —— 三条介质全缺 ⇒ 不抛且仍产出 ──
{
  const f = fixture()
  const hot = await hotIn(f.home)
  rmSync(join(f.mem, 'audit', 'activity.jsonl'), { force: true })
  rmSync(join(f.kn, 'audit', 'warm-recall.json'), { force: true })
  rmSync(join(f.kn, 'delta.md'), { force: true })
  let threw = null
  let t = ''
  try { t = hot.build('s5') } catch (e) { threw = e }
  ok(!threw && t.length > 0, `S5：三条介质全删 ⇒ 不抛且注入仍产出（threw=${threw ? threw.message : 'null'} · ${t.length} 字符）`)
}

// ── S6：`invalidate()` 必须清**两层**（回归守卫：不得退回"只清 query"）──
{
  const f = fixture()
  const hot = await hotIn(f.home)
  hot.build('s6-1')
  writeFileSync(join(f.mem, 'AGENT.md'), '- [边界] CCCC ← 源: notes/x.md §y\n', 'utf8')   // 同尺寸改内容
  const t2 = hot.build('s6-2')
  ok(stableOf(t2).includes('AAAA'), 'S6 前置：同尺寸改内容后稳定面仍取旧值（缓存仍在）')
  hot.invalidate()
  const t3 = hot.build('s6-3')
  ok(stableOf(t3).includes('CCCC'), 'S6：调 invalidate() 后稳定面**必须重算**（CCCC 出现）')
}

/* ── S7（2026-09-16 用户指令）：**事件驱动失效**取代 30s 定时失效 ───────────────────────────
 * 用户要求：「新会话注入一次 + 每次上下文压缩后注入一次」。
 * ⚠ 与既有 30s `cacheKey` 的关系：**外层**（本组判据）先判，命中则**内层 30s 缓存整段不跑**
 *   ⇒ 等效于把"30 秒一重建"提升为"**事件驱动**"；内层保留为兜底（本件 S1–S6 继续守它）。
 * ⚠ **关键取舍（必须留痕）**：`q`（本步任务文本）**仍参与失效** —— 动态面按 query 选行，
 *   冻住 query 等于**杀掉按需召回**。`q` 取自"最近一条真实用户消息" ⇒ **同一回合内多步 q 不变**
 *   ⇒ 省的是「同回合内每步重建」，保的是「跨回合按需」。 */
{
  const { injectCacheReason } = await import(pathToFileURL(join(repoRoot, 'lib', 'dynamic-select.js')).href)
  const base = { sid: 'a', evLen: 40, firstSeq: 5, lib: 'L1', q: '问题一' }
  ok(injectCacheReason(undefined, base) === 'new', 'S7：无前值 ⇒ `new`（新会话）')
  ok(injectCacheReason(base, { ...base }) === '', 'S7：**全等 ⇒ 命中**（逐字复用，不重建）')
  ok(injectCacheReason(base, { ...base, evLen: 41 }) === '', 'S7：**同回合内事件增长 ⇒ 仍命中**（这是省掉"每步重建"的核心；把它当失效就退回旧行为）')
  ok(injectCacheReason(base, { ...base, q: '问题二' }) === 'query-changed', 'S7：**q 变化 ⇒ 重建**（跨回合保留按需召回，勿冻住 query）')
  ok(injectCacheReason(base, { ...base, evLen: 12 }) === 'compacted', 'S7：**事件条数回落 ⇒ `compacted`**（压缩后必须重注入）')
  ok(injectCacheReason(base, { ...base, firstSeq: 30 }) === 'compacted', 'S7：**首 seq 前跳 ⇒ `compacted`**（旧事件被摘要掉）')
  ok(injectCacheReason({ ...base, firstSeq: -1 }, { ...base, firstSeq: 3 }) === '', 'S7：firstSeq 未知(-1) ⇒ **不误判压缩**（失败开放）')
  ok(injectCacheReason(base, { ...base, sid: 'b' }) === 'session-changed', 'S7：换会话 ⇒ `session-changed`')
  ok(injectCacheReason(base, { ...base, lib: 'L2' }) === 'lib-changed', 'S7：库戳变化 ⇒ `lib-changed`（睡眠/蒸馏写入 => 新内容可见）')
  ok(injectCacheReason(base, { sid: 'b', q: 'x', evLen: 1, firstSeq: 99, lib: 'L2' }) === 'session-changed', 'S7 优先级：换会话优先于其余一切')
  ok(injectCacheReason(base, { ...base, q: 'x', evLen: 1 }) === 'query-changed', 'S7 优先级：q 变化优先于压缩判定（同回合内换 query 罕见，但口径须确定）')
}

/* ── S8（IR1 册四 · 2026-09-18）：**三条介质各触发一次重建** + **层归因** + **"省的是重建不是 token"** ──
 * 病灶（实测）：外层判据只签**库戳（三索引）**，两条介质（`activity.jsonl` / `delta.md`）只在内层键里
 *   ⇒ 运行时"改了介质却不重建"（内层 30s TTL 之外看不见）；且 `/inject/stats` 只报**最外层** reason
 *   ⇒ "哪一层失效"说不出来。本组把三介质 + 五层归因钉住。 */
{
  const { injectCacheReason: injectCacheReasonB } = await import(pathToFileURL(join(repoRoot, 'lib', 'dynamic-select.js')).href)
  // D1-a：改**库（MEMORY.md）** ⇒ 同一 query 紧接重调即变（旧实现：内层键不含库戳 ⇒ 此处必红）
  const f = fixture()
  const hot = await hotIn(f.home)
  const t1 = hot.build('')
  ok(!t1.includes('探针C'), 'S8 控制组：改库前文本不含新行（探针C）')
  appendFileSync(join(f.mem, 'MEMORY.md'), '[原则] 探针C · z → notes/env.md §qc\n', 'utf8')
  const t2 = hot.build('')
  ok(t2.includes('探针C'), 'S8/D1 改**库**（MEMORY.md）⇒ 同 query 重调即重建（库戳进键）')

  // D1-b（三介质清单显式化）：库 / activity / delta 三条都在失效键的实现里
  const stampSrc = readFileSync(join(repoRoot, 'src', 'supply-stamp.ts'), 'utf8')
  ok(['AGENT.md', 'USER.md', 'MEMORY.md'].every((x) => stampSrc.includes(x)), 'S8/D1 库戳含三索引（AGENT/USER/MEMORY）')
  ok(stampSrc.includes('activity.jsonl') && stampSrc.includes('delta.md'), 'S8/D1 介质戳含 activity + delta ⇒ **3 条介质全覆盖**（旧实现只签 2 条）')

  // D2：层归因 —— reason → 层映射**穷举**（新 reason 未登记即红），且 media 变化可分辨
  const { layerOfReason } = await import(pathToFileURL(join(repoRoot, 'lib', 'supply-stamp.js')).href)
  const MAP = { '': 'none', new: 'session', 'session-changed': 'session', compacted: 'context', 'query-changed': 'query', 'lib-changed': 'event', 'media-changed': 'event' }
  for (const [r, layer] of Object.entries(MAP)) ok(layerOfReason(r) === layer, `S8/D2 层归因：reason=${r || '(空)'} ⇒ ${layer}（实得 ${layerOfReason(r)}）`)
  const base8 = { sid: 'a', evLen: 40, firstSeq: 5, lib: 'L1', media: 'M1', q: '问题一' }
  ok(injectCacheReasonB(base8, { ...base8 }) === '', 'S8/D2 两级戳全等 ⇒ 命中（不误伤）')
  ok(injectCacheReasonB(base8, { ...base8, media: 'M2' }) === 'media-changed', 'S8/D2 **介质戳变化 ⇒ `media-changed`**（与库戳变化可分辨）')
  ok(injectCacheReasonB(base8, { ...base8, lib: 'L2' }) === 'lib-changed', 'S8/D2 库戳变化 ⇒ `lib-changed`')

  // D3：缓存**省的是重建、不是 token**（头注如实；不得改称"省 token"）
  const injSrc = readFileSync(join(repoRoot, 'src', 'panel-inject.ts'), 'utf8')
  ok(/不代表省 token|不等于省 token/.test(injSrc), 'S8/D3 头注如实：命中缓存**不代表省 token**（system prompt 每步仍发）')
  ok(!/缓存[^。\n]{0,12}省\s*token/.test(injSrc.replace(/不代表省 token|不等于省 token/g, '')), 'S8/D3 反例：不得出现"缓存省 token"的正面表述')
}

if (fails.length) {
  console.log(`❌ FAIL（${fails.length} 条）`)
  fails.forEach((x) => console.log('  ❌ ' + x))
  console.log(`\n${pass} passed · ${fails.length} failed`)
  process.exit(1)
}
console.log(`✅ PASS（${pass} 条断言 · 注入缓存层）`)
