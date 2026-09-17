#!/usr/bin/env node
// test-essence-release.mjs — **精要层释放（计划侧）**（S-P5c · 2026-09-16）
//
// 依据：docs/master-architecture-plan-2026-09-15.md §7（P5 精要层 + 自足释放）+ 本轮明确的边界。
// ⚠ **本件测的是"计划"，不是"释放"** —— 遵 [原则] 契约须描述现状：不可逆的执行须先具备三件保护
//   （语义复核 / 归档可回滚 / 未自足零释放），**尚未实现**，故**不写进断言、也不假装已具备**。
//
// 判据（**行为级**，真临时库；纯读 → 可直接验"零写入"）：
//   ① **射程**：候选只来自 `AGENT.md`（判据载体）；`MEMORY.md`/`USER.md` 的行**永不出现在候选里**
//      （即便字面自足 —— 职责由文件决定，不是标签）
//   ② **判据门**：字面自足（说明段 ≥阈值 且含动作词）入候选；否则计入 `blocked`，**永不入候选**
//   ③ **零写入**：跑前后两文件内容**逐字节不变**（本件纯读，不归档不删行）
//   ④ **幂等**：连算两次结果一致
//   ⑤ **缺件如实**：无 `AGENT.md` ⇒ 候选空且 note 含"未判"（fail-open，不假装）
//   ⑥ **边界**：说明段恰 = 阈值（12）且含动作词 ⇒ 入候选；11 字符 ⇒ blocked
//
// 用法: node scripts/test-essence-release.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { planRelease, parsePointerOf, releaseOpsFromPlan, applyRelease, buildSemanticReviewRequest, buildSemanticReviewBatches, parseSemanticReview, semanticApprovedRows, intersectApprovals, stableSetHashes, jaccardOfHashes, RELEASE_MIN_ACTION_CHARS, JUDGMENT_FILE } from '../lib/essence-release.js'
import { crossFormCovered } from '../lib/crossform-dedup.js'

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }
const mk = (files) => { const d = mkdtempSync(join(tmpdir(), 'sc-rel-')); for (const [n, t] of Object.entries(files)) writeFileSync(join(d, n), t, 'utf8'); return d }

console.log('── S-P5c 精要层释放（计划侧 · 行为级）──')

// ① 射程：MEMORY/USER 的行即便字面自足也不入候选
{
  const SELF = '[原则] 先锚资源再动手 · 先查既有资源再建新的，避免重造轮子 → notes/flows.md §x'
  const d = mk({
    'AGENT.md': SELF + '\n',
    'MEMORY.md': SELF + '\n',   // 同一条内容放进索引文件 —— 仍**不得**入候选
    'USER.md': SELF + '\n',
  })
  const p = planRelease(d)
  ok(p.candidates.length === 1, `① 射程：候选 ${p.candidates.length} 条（只认 ${JUDGMENT_FILE}，索引/画像文件的行不入候选）`)
  ok(p.candidates[0]?.tag === '原则', '① 候选带标签（可解释）')
  rmSync(d, { recursive: true, force: true })
}

// ② 判据门：未自足 ⇒ blocked，不入候选
{
  const d = mk({
    'AGENT.md': [
      '[原则] 自足的一条 · 先校验产物可解析，失败须回滚重试 → notes/flows.md §a',
      '[lesson] 太短 · 短 → notes/lessons.md §b',
      '[lesson] 无动作词的一条 · 代理/DNS/IMR 链断 → notes/lessons.md §c',
      '非索引行，没有指针，不该被扫到',
    ].join('\n') + '\n',
  })
  const p = planRelease(d)
  ok(p.candidates.length === 1, `② 只有字面自足者入候选（实测 ${p.candidates.length}）`)
  ok(p.blocked === 2, `② 未自足者计入 blocked（实测 ${p.blocked}）—— **永不入候选**`)
  ok(p.stat.scanned === 3, `② 判定面 = 含指针的行数（实测 ${p.stat.scanned}，无指针行不计）`)
  rmSync(d, { recursive: true, force: true })
}

// ③ 零写入（本件纯读 —— 这是"计划"与"执行"分开的直接证据）
{
  const d = mk({ 'AGENT.md': '[原则] 甲 · 先做A再做B → notes/flows.md §a\n' })
  const before = readFileSync(join(d, JUDGMENT_FILE), 'utf8')
  planRelease(d)
  const after = readFileSync(join(d, JUDGMENT_FILE), 'utf8')
  ok(before === after && Buffer.from(before).equals(Buffer.from(after)), '③ **零写入**：跑前后逐字节相同（不归档、不删行、不改文件）')
  rmSync(d, { recursive: true, force: true })
}

// ④ 幂等
{
  const d = mk({ 'AGENT.md': '[原则] 甲 · 先做A再做B → notes/flows.md §a\n[路径] 乙 · 按序执行三步 → notes/flows.md §b\n' })
  const a = JSON.stringify(planRelease(d)), b = JSON.stringify(planRelease(d))
  ok(a === b, '④ 幂等：连算两次结果一致')
  rmSync(d, { recursive: true, force: true })
}

// ⑤ 缺件如实（fail-open，不假装）
{
  const d = mk({ 'MEMORY.md': '[env] 甲 · 先做A → notes/env.md §a\n' })
  const p = planRelease(d)
  ok(p.candidates.length === 0 && /未判/.test(p.note), `⑤ 无 ${JUDGMENT_FILE} ⇒ 候选空且**如实记"未判"**（note=「${p.note}」）`)
  rmSync(d, { recursive: true, force: true })
}

// ⑥ 边界：恰等阈值 vs 少一字符
{
  const atLimit = '先'.repeat(RELEASE_MIN_ACTION_CHARS)          // 恰好 = 阈值，且含动作词「先」
  const below = '先'.repeat(RELEASE_MIN_ACTION_CHARS - 1)        // 少一字符
  const d = mk({ 'AGENT.md': `[原则] 甲 · ${atLimit} → notes/flows.md §a\n[原则] 乙 · ${below} → notes/flows.md §b\n` })
  const p = planRelease(d)
  ok(p.candidates.length === 1 && p.blocked === 1,
    `⑥ 边界：说明段恰 ${RELEASE_MIN_ACTION_CHARS} 字符入候选 · ${RELEASE_MIN_ACTION_CHARS - 1} 字符被拦（实测候选 ${p.candidates.length} / blocked ${p.blocked}）`)
  rmSync(d, { recursive: true, force: true })
}

// ⑦ 判据单一事实源（与度量器同源；防两处词表漂移）
{
  const metric = readFileSync(join(process.cwd(), 'scripts', 'effective-directions.mjs'), 'utf8')
  ok(/from '\.\.\/lib\/essence-release\.js'/.test(metric), '⑦ 度量器**引用本模块常量**（单一事实源，不各写一份）')
  ok(!/const ACTION_WORDS = \/先\|须/.test(metric), '⑦ 度量器**不再自带**一份动作词表（否则两处会漂移）')
  ok(typeof crossFormCovered === 'function', '⑦（旁证）同目录的 crossform-dedup 仍可正常导入（未因跨模块引用而破坏 ESM）')
}

/* ══ P5c **执行侧**（2026-09-16）：提案 + 双门 fail-closed（**不真动库**：applyOps 是注入的）══════
 * 设计要点：**释放对象 = notes 小节**，与 `forgetops` 同一对象类型 ⇒ **不自己写归档**，
 *   产出 **forgetOps 同形 op** 交既有 `applyForgetOps`（复用其归档+stub+可回滚+全部守卫）。 */
const ROW = '[原则] 先锚资源再动手 · 先查既有资源再建新的，避免重造轮子 → notes/flows.md §x'
{
  // ⑧ 指针解析
  const p = parsePointerOf(ROW)
  ok(p && p.file === 'flows.md' && p.section === 'x', `⑧ 指针解析：\`${JSON.stringify(p)}\``)
  ok(parsePointerOf('没有指针的行') === null, '⑧ 无指针 ⇒ null（**不猜**）')
}

// ⑨ 提案：只对"有指针且自足"的候选产 op
{
  const d = mk({ 'AGENT.md': [ROW, '[原则] 无指针的自足行 · 先做A再做B', '[lesson] 太短 · 短 → notes/lessons.md §b'].join('\n') + '\n' })
  const plan = planRelease(d)
  const { ops, skipped, note } = releaseOpsFromPlan(plan)
  ok(ops.length === 1 && ops[0].file === 'flows.md' && ops[0].section === 'x', `⑨ 只为"有指针且自足"的候选产 op（实测 ${ops.length} 条）`)
  ok(ops[0].action === 'archive' && ops[0].op === 'archive', '⑨ op 形态 = **forgetOps 同形**（`{op:archive,file,section,action}` ⇒ 交既有链路执行）')
  ok(skipped === 0 && plan.stat.scanned === 2,
    `⑨ 无指针行**在扫描层就被排除**（判定面 ${plan.stat.scanned} = 两条含指针者；⇒ 无指针者到不了提案层，skipped=${skipped}）`)
  ok(!plan.candidates.some((c) => c.row.includes('无指针')), '⑨ 无指针行**不在候选中**（指针是释放的唯一入口，扫描层即硬门）')
  ok(/待语义复核/.test(note), '⑨ note 明示「**待语义复核 + 显式执行**；未执行前零写入」')
  rmSync(d, { recursive: true, force: true })
}

// ⑩ **门①：无语义清单 ⇒ 零释放**（fail-closed；且**不动库**）
{
  const d = mk({ 'AGENT.md': ROW + '\n' })
  const before = readFileSync(join(d, JUDGMENT_FILE), 'utf8')
  let called = 0
  const r = await applyRelease(d, releaseOpsFromPlan(planRelease(d)).ops, [], async () => { called++; return { archived: 1, kept: 0, skipped: 0 } })
  ok(r.released === 0 && called === 0, `⑩ **无语义复核清单 ⇒ 零释放且不调用归档链路**（released=${r.released} called=${called}）`)
  ok(/fail-closed/.test(r.reasons.join(' ')), '⑩ 理由明示 fail-closed（语义门未实现 ⇒ 绝不把"字面自足"当"可释放"）')
  ok(readFileSync(join(d, JUDGMENT_FILE), 'utf8') === before, '⑩ **库文件零改动**（逐字节相同）')
  rmSync(d, { recursive: true, force: true })
}

// ⑪ **门②：清单不匹配 ⇒ 零释放**（以当下复核为准；防越权/防陈旧计划）
{
  const d = mk({ 'AGENT.md': ROW + '\n' })
  let called = 0
  const r = await applyRelease(d, releaseOpsFromPlan(planRelease(d)).ops, ['别的行（不在候选里）'], async () => { called++; return { archived: 1, kept: 0, skipped: 0 } })
  ok(r.released === 0 && called === 0, `⑪ 清单不含该行 ⇒ **零释放且不调用**（released=${r.released} called=${called}）`)
  ok(/不在语义复核通过清单/.test(r.reasons.join(' ')), '⑪ 理由指出"不在清单"')
  rmSync(d, { recursive: true, force: true })
}

// ⑫ 清单匹配 ⇒ 交给注入的归档链路（**只传通过的 op**）
{
  const d = mk({ 'AGENT.md': ROW + '\n' })
  let got = null
  const r = await applyRelease(d, releaseOpsFromPlan(planRelease(d)).ops, [ROW], async (ops) => { got = ops; return { archived: ops.length, kept: 0, skipped: 0 } })
  ok(r.released === 1 && got && got.length === 1, `⑫ 清单匹配 ⇒ 交链路执行（released=${r.released} 传入 ${got ? got.length : 0} 条）`)
  ok(got && got[0].file === 'flows.md' && got[0].section === 'x', '⑫ 传入的 op 指向正确的 notes 小节')
  ok(readFileSync(join(d, JUDGMENT_FILE), 'utf8').includes('先锚资源再动手'), '⑫ **本件不自己归档**：判据行未动（归档由既有 `applyForgetOps` 负责）')
  rmSync(d, { recursive: true, force: true })
}

/* ══ P5c **语义门**（2026-09-16）：字面自足 ≠ 语义自足 ⇒ 判定交模型，**不一致以更严者为准** ══ */
{
  const d = mk({ 'AGENT.md': [ROW, '[原则] 乙 · 先做A再做B再做C并校验产物可解析 → notes/flows.md §y'].join('\n') + '\n' })
  const plan = planRelease(d)

  // ⑬ 请求：只给行本身（模拟"丢掉正文"）+ 写明判据 + 输出格式
  const req = buildSemanticReviewRequest(plan)
  ok(req.includes('丢掉正文'), '⑬ 请求写明场景「**丢掉正文**」（否则模型答的不是同一个问题）')
  ok(/① 这一行说了\*\*做什么\*\*吗/.test(req) && /② 这一行说了\*\*按什么判/.test(req) && /③ 这一行说了\*\*出错怎么办/.test(req),
    '⑬ 请求给的是**三点检查表**（做什么 / 按什么判 / 出错怎么办）—— 逐条可对照')
  ok(/必须就写在这一行里/.test(req) && /翻正文才知道该用什么/.test(req), '⑬ **判据实质 = 信息完备性**：关键取值必须行内可得，要翻正文 ⇒ false')
  ok(req.includes('先锚资源再动手') && req.includes('先做A再做B'), '⑬ 请求**含每一条候选行**（i 与候选序一致）')
  ok(/拿不准就 null[\s\S]{0,12}不要猜/.test(req), '⑬ 允许 `null` 且明示"**不要猜**"')
  /* ⚠ 实测教训：首版带**少样本示例**（true 在前）⇒ 疑**诱导照抄 true**（真机 51/51 全 true）。
   *   ⇒ 本轮**撤掉示例**做干净对照；此处断言"**请求里不再有示例段**"，防它被无意加回。 */
  ok(!/示例/.test(req), '⑬ **不含少样本示例**（实测疑诱导照抄 true ⇒ 撤掉做干净对照）')

  // ⑭ 严格解析（整批原子）
  ok(parseSemanticReview('[{"i":0,"usable":true,"why":"a"}]')?.[0]?.usable === true, '⑭ 合法数组 ⇒ 解析成功')
  ok(parseSemanticReview('前缀 [{"i":0,"usable":null,"why":""}] 后缀')?.[0]?.usable === null, '⑭ 允许 null（拿不准）')
  ok(parseSemanticReview('{"i":0,"usable":true}') === null, '⑭ **对象而非数组 ⇒ null**')
  ok(parseSemanticReview('[{"i":0,"usable":"yes"}]') === null, '⑭ usable 非布尔/null ⇒ null')
  ok(parseSemanticReview('[{"i":0,"usable":true},{"usable":true}]') === null, '⑭ **半批不合法 ⇒ 整体 null**（半批会静默改变通过清单）')

  // ⑮ 合并：**以更严者为准**
  {
    const m = semanticApprovedRows(plan, [{ i: 0, usable: true, why: '', quote: '先锚资源再动手' }, { i: 1, usable: null, why: '', quote: '先做A再做B' }])
    ok(m.approved.length === 1 && m.approved[0] === ROW, '⑮ `usable:true` **且引文接地**才进通过清单（实测 1 条）')
    ok(m.unjudged === 1, '⑮ **`null` 计为未判且不通过**（宁可保留正文）')
  }
  {
    const m2 = semanticApprovedRows(plan, [{ i: 0, usable: false, why: '', quote: '先锚资源再动手' }])
    ok(m2.approved.length === 0 && m2.rejected === 1 && m2.unjudged === 1, '⑮ `false` ⇒ 否；**模型没给该项 ⇒ 未判且不通过**（不默认放行）')
  }
  {
    // **引文接地**：quote 必须是该行子串，否则按未判（不通过）
    const m3 = semanticApprovedRows(plan, [{ i: 0, usable: true, why: '', quote: '这句话不在行里' }])
    ok(m3.approved.length === 0 && m3.ungrounded === 1, '⑮ **引文对不上行 ⇒ 接地失败 ⇒ 按未判**（不通过）—— 把"凭印象判"压成"必须在行内找到依据"')
    const m4 = semanticApprovedRows(plan, [{ i: 0, usable: true, why: '', quote: '太短' }])
    ok(m4.approved.length === 0 && m4.ungrounded === 1, '⑮ 引文 <4 字也判接地失败（太短不足以证明依据）')
  }

  // ⑯ 联动：通过清单 ⇒ 门①放行（仍用**注入的假链路**，不真动库）
  {
    const m = semanticApprovedRows(plan, plan.candidates.map((c, i) => ({ i, usable: true, why: '', quote: c.row.slice(0, 6) })))
    let called = 0
    const r = await applyRelease(d, releaseOpsFromPlan(plan).ops, m.approved, async (ops) => { called++; return { archived: ops.length, kept: 0, skipped: 0 } })
    ok(called === 1 && r.released === 2, `⑯ 语义通过 ⇒ 门①放行并交链路（called=${called} released=${r.released}）`)
  }
  rmSync(d, { recursive: true, force: true })
}

// ⑰ **降未判率**：分批 + 操作化问法（2026-09-16）
{
  const rows = Array.from({ length: 25 }, (_, k) => `[原则] 第${k}条 · 先做A再做B并校验产物可解析 → notes/flows.md §s${k}`)
  const d2 = mk({ 'AGENT.md': rows.join('\n') + '\n' })
  const p2 = planRelease(d2)
  const bs = buildSemanticReviewBatches(p2, 10)
  const iIn = (s) => [...s.matchAll(/^- \[(\d+)\]/gm)].map((m) => Number(m[1]))
  ok(p2.candidates.length === 25 && bs.length === 3, `⑰ 25 条候选按 10 一批 ⇒ **3 批**（实测候选 ${p2.candidates.length} · 批 ${bs.length}）`)
  ok(JSON.stringify(iIn(bs[0])) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), '⑰ 第 1 批 i = 0–9（**全局下标**，非批内序号）')
  ok(JSON.stringify(iIn(bs[1])) === JSON.stringify([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]), '⑰ 第 2 批 i = 10–19 ⇒ **合并时无需重编号**（分批不破坏对齐）')
  ok(iIn(bs[2]).length === 5, '⑰ 末批只含剩余 5 条（不凑数）')
  ok(bs.every((b) => /逐条对照下面三点/.test(b)), '⑰ 每批都带**三点检查表**（判据收紧后的形态）')
  ok(bs.every((b) => !/示例/.test(b)), '⑰ 每批**都不含少样本示例**（撤掉示例是刻意对照，不得回流）')
  ok(bs.every((b) => /只含上面列出的这些 i/.test(b)), '⑰ 明示"只输出本批的 i"（防跨批串号）')
  rmSync(d2, { recursive: true, force: true })
}

// ⑱ **降波动手段：两次判定取交集**（2026-09-16）
{
  const a = ['甲行', '乙行', '丙行']
  const b = ['乙行', '丙行', '丁行']
  const got = intersectApprovals(a, b)
  ok(JSON.stringify(got) === JSON.stringify(['乙行', '丙行']), `⑱ 交集 = 两组都通过的条目（实测 ${JSON.stringify(got)}）—— **两次都判 true 才通过**`)
  ok(intersectApprovals(a, []).length === 0, '⑱ 一组为空 ⇒ **交集为空**（第二组缺席时**保守取空**，不假装"一组就够"）')
  ok(intersectApprovals([], b).length === 0, '⑱ 反向同理（对称）')
  ok(intersectApprovals(a, a).length === a.length, '⑱ 同组自交 = 自身（幂等，**不减项**）')
  ok(intersectApprovals([' 带空白 '], ['带空白']).length === 1, '⑱ **两侧 trim 后比较**（格式噪声不算分歧）')
  ok(intersectApprovals(['重复', '重复'], ['重复']).length === 1, '⑱ 结果**去重**（同组内重复只留一条）')
  ok(intersectApprovals(a, b).length <= Math.min(a.length, b.length), '⑱ **单调更保守**：交集大小 ≤ 任一组（不会"取多数"把通过集做大）')
}

// ⑲ **集合指纹与 Jaccard**（2026-09-16）：让"释放集合有多像"可测（比通过率极差本质）
{
  const h1 = stableSetHashes(['甲行', '乙行', '丙行'])
  const h2 = stableSetHashes(['乙行', '丙行', '甲行'])
  ok(JSON.stringify(h1) === JSON.stringify(h2), '⑲ 指纹**与顺序无关**（同集合不同顺序 ⇒ 同一指纹）')
  ok(h1.every((x) => /^[0-9a-f]{8}$/.test(x)), '⑲ 指纹为 **8 位十六进制短哈希**（不可逆、体积小）')
  ok(JSON.stringify(h1) === JSON.stringify([...h1].sort()), '⑲ 指纹**已排序**（集合比较无需再排）')
  ok(stableSetHashes(['同', '同']).length === 1, '⑲ 重复行只留一个指纹（去重）')
  ok(JSON.stringify(stableSetHashes([' 甲行 '])) === JSON.stringify(stableSetHashes(['甲行'])), '⑲ 两侧 trim 后取哈希（格式噪声不改变集合）')
  const a = stableSetHashes(['甲', '乙', '丙', '丁']), b = stableSetHashes(['甲', '乙', '丙', '戊'])
  const j = jaccardOfHashes(a, b)
  ok(Math.abs(j - 3 / 5) < 1e-9, `⑲ 交 3 / 并 5 ⇒ Jaccard **0.6**（实测 ${j}）`)
  ok(jaccardOfHashes(a, a) === 1, '⑲ 同集合 ⇒ **1.0**（完全一致）')
  ok(jaccardOfHashes(stableSetHashes(['甲']), stableSetHashes(['乙'])) === 0, '⑲ 无交集 ⇒ **0**（完全无关）')
  ok(jaccardOfHashes([], []) === 1, '⑲ **两者皆空 ⇒ 1.0**（"一致地没有"，不是 0 —— 否则空集会拉低均值误导判读）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
console.log('⚠ 运行态边界（写进结论、不进断言）：**语义门已落地**（真机实跑），但 `runDeepSleep` **未把通过清单交给 `applyRelease`**')
console.log('   ⇒ **真实释放仍不会发生**（刻意：先让"通过率/未判率"稳定可观，再谈接线自动执行）；"归档可回滚"复用 `forgetops` 的 归档+stub 机制。')
process.exit(fail ? 1 : 0)
