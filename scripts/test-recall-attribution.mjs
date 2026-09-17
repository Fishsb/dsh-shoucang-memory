#!/usr/bin/env node
// test-recall-attribution.mjs — **J3 / U1 归因升级**（2026-09-16）
//
// 依据：docs/judge-layering-plan-2026-09-15.md §3.1（U1：归因与方向交 LLM，并与细校准对账；判据 = 一致率）
//       + §4.1（`judgeKind` 三向机检：**标 llm ⇒ 必须有真实调用点**，否则就是"假旋钮"）。
//
// 判据（**行为级**，纯函数，不需要模型）：
//   ① **基线一致率 = 0（实证，先红）**：确定性计数在当前分布下给 `lower-threshold`，
//      而注册表 `mclFamiliarThreshold` 的细校准结论是「维持 0.55 不改」⇒ 方向**相反**。
//      这正是 U1 要解决的问题本身，**把它钉成断言**（若哪天计数法被改成与校准一致，此处会红 ⇒ 提醒复核）。
//   ② **请求必须带对账依据**：`buildAttributionRequest` 的文本里**必须出现**注册表结论
//      —— 否则 LLM 无从对账，只会另给一个方向，一致率还会是 0（重复同一个错）。
//   ③ **严格解析**：合法 JSON ⇒ 得 verdict；**格式不符/枚举越界/非 JSON ⇒ `null`**（不猜、不兜底）。
//   ④ **未判不计入分母**：`rate` 只在"真判过"的样本上算 —— 否则"没解析出来"会稀释一致率，
//      把失败伪装成"部分一致"（同族教训：解析失败兜底成默认值 ⇒ 下游把"没判"当成"判了 maintain"）。
//   ⑤ 确定性与纯函数：同输入同输出（可复现），且本件**零 IO**。
//
// 用法: node scripts/test-recall-attribution.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  adviseFromMissCounts, directionOfAdvice, buildAttributionRequest,
  parseAttribution, agreementRate,
} from '../lib/recall-diagnosis.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

/** 从注册表读**细校准结论**（单一事实源；不在此写死"维持 0.55"）。
 *  ⚠ 首版读错路径（去 `criteria[]` 里找）⇒ 结论判定退化成 `unknown`，断言当场红
 *    —— 这正说明"基准必须真从注册表读"，而不是本件自带一份。 */
const calibration = (() => {
  const c = JSON.parse(readFileSync(join(root, 'skill', 'engine', 'criteria.json'), 'utf8'))
  const value = Number(c?.surface?.mcl?.familiarThreshold ?? 0.55)
  const note = String(c?.surface?.mcl?.note || '')
  const verdict = /维持不改|维持\s*0\.55/.test(note) ? 'maintain' : (/降/.test(note) ? 'lower' : 'unknown')
  return { id: 'mcl.familiarThreshold', value, verdict, conclusion: note.slice(0, 160) }
})()

console.log('── J3 / U1 归因升级（行为级 · 纯函数）──')
console.log(`  注册表细校准：${calibration.id} = ${calibration.value} ⇒ 结论判定 = **${calibration.verdict}**`)

// ① 基线一致率 = 0（**实证：先红**）
const counts = { 'recall-empty': 100, 'no-highconf': 50, 'below-threshold': 300, ok: 200 }
const adv = adviseFromMissCounts(counts)
const counterVerdict = directionOfAdvice(adv.advice)
{
  const agree = counterVerdict === calibration.verdict
  ok(counterVerdict === 'lower' && !agree,
    `① **基线一致率 = 0**：计数法给 \`${adv.advice}\`（→ \`${counterVerdict}\`），而细校准是 \`${calibration.verdict}\` ⇒ 方向相反（**这正是 U1 要修的**）`)
  ok(calibration.verdict === 'maintain', `① 对账基准取自**注册表**（${calibration.id} ⇒ ${calibration.verdict}，非本件写死）`)
}

// ② 请求必须带对账依据
const req = buildAttributionRequest(counts, [{ q: '深睡蒸馏', rows: ['[flow] 深睡水位护栏 · … → notes/flows.md §深睡蒸馏'], sim: 0.42 }], calibration)
{
  ok(req.includes(calibration.id), '② 请求含注册表 id（对账对象明确）')
  ok(req.includes(String(calibration.value)), '② 请求含注册表阈值数值')
  ok(/维持|结论/.test(req), '② 请求含**既有校准结论**（LLM 据此对账，而非另起炉灶）')
  ok(req.includes('深睡蒸馏') && req.includes('0.420'), '② 请求含未命中样本（查询 + 命中行 + 熟悉度）')
  ok(/\{"verdict"/.test(req), '② 请求写明**输出格式**（可严格解析）')
}

// ③ 严格解析（不猜、不兜底）
{
  ok(parseAttribution('前缀 {"verdict":"maintain","reason":"瓶颈在召回层"} 后缀')?.verdict === 'maintain', '③ 合法 JSON（含前后缀）⇒ 正确解析')
  ok(parseAttribution('{"verdict":"bogus"}') === null, '③ **枚举越界 ⇒ null**（不接受未知方向）')
  ok(parseAttribution('不是 JSON') === null, '③ **非 JSON ⇒ null**（不兜底成 maintain）')
  ok(parseAttribution('') === null && parseAttribution(null) === null, '③ 空/空值 ⇒ null（不抛）')
  ok(parseAttribution('{"verdict":"lower","reason":""}')?.verdict === 'lower', '③ 理由可空，方向仍生效')
}

// ④ 未判不计入分母
{
  const all = agreementRate([{ verdict: 'maintain', calibration: 'maintain' }, { verdict: 'lower', calibration: 'maintain' }])
  ok(all.n === 2 && all.agree === 1 && all.rate === 0.5, `④ 全判：n=${all.n} agree=${all.agree} rate=${all.rate}（应为 2/1/0.5）`)
  const withUnknown = agreementRate([{ verdict: null, calibration: 'maintain' }, { verdict: 'maintain', calibration: 'maintain' }])
  ok(withUnknown.unknown === 1 && withUnknown.rate === 1,
    `④ **未判不计入分母**：unknown=${withUnknown.unknown} rate=${withUnknown.rate}（若把未判算进去会变 0.5 ⇒ 把失败伪装成"部分一致"）`)
  ok(agreementRate([]).rate === null, '④ 空样本 ⇒ rate=null（**不是 0** —— 0 会被误读成"完全不一致"）')
}

// ⑤ 确定性（纯函数可复现）
{
  const a = buildAttributionRequest(counts, [], calibration), b = buildAttributionRequest(counts, [], calibration)
  ok(a === b, '⑤ 同输入同输出（可复现，无隐藏状态）')
  const src = readFileSync(join(root, 'src', 'recall-diagnosis.ts'), 'utf8')
  ok(!/readFileSync|require\(|import .*node:fs/.test(src), '⑤ 本件**零 IO**（纯函数：不读文件、不发请求）')
  ok(!/judgeKind.*llm|judgeKind: ?'llm'/.test(src), '⑤ **不把任何判据标成 judgeKind=llm**（调用点未接线 ⇒ 标了就是"假旋钮"，方案册 §4.1）')
}

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
console.log('⚠ 边界（写进结论、不进断言）：**LLM 真实调用点未接线** —— 本件只实现"请求构造 + 严格解析 + 一致率"三件纯函数；')
console.log('   一致率因此**尚不可测**（无 LLM 产出）。按 [原则] 契约须描述现状：不宣称已达成，也不标 judgeKind=llm。')
process.exit(fail ? 1 : 0)
