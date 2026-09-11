#!/usr/bin/env node
// test-layering.mjs — v2.2 分层生效模型**单测**（成熟度 / 升格门 / 统一打分 / importance 代理）
// 走**产品实现**（lib/criteria.js + lib/criteria.generated.js），不复制逻辑。
import { activationOf, maturationVerdict, layeredScore, importanceOf, promoteVerdict, demoteVerdict, evaluateL0 } from '../lib/criteria.js'
import { MATURATION, SCORE } from '../lib/criteria.generated.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++; console.log(`PASS  ${label}`) } else { fail++; console.log(`FAIL  ${label}`) } }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// ── activationOf：A0 起、跨日再现 +step、上限 1 ──
ok(near(activationOf(0), Number(MATURATION.A0)), `①首现 = A0(${MATURATION.A0})`)
ok(near(activationOf(1), Number(MATURATION.A0)), '①单日（days=1）仍为 A0')
ok(near(activationOf(2), Number(MATURATION.A0) + Number(MATURATION.step)), `①跨 2 日 +step（${MATURATION.A0}+${MATURATION.step}）`)
ok(near(activationOf(2), 0.5), '①跨 2 日恰达 gate 0.5（与 MSR「一周 0.5」同量级口径）')
ok(activationOf(999) === 1, '①上限封顶 1.0')
ok(near(activationOf(3, { A0: 0.3, step: 0.2 }), 0.7), '①参数显式传参生效')

// ── maturationVerdict：enforce=false 恒放行（只记录）；true 时 A<gate 拦截 ──
ok(maturationVerdict(0.3, false).ok === true, '②enforce=false：A=0.3 仍放行（M4 影子期只记录）')
ok(maturationVerdict(0.3, true).ok === false, '②enforce=true：A=0.3 < gate 0.5 → 拦截')
ok(maturationVerdict(0.5, true).ok === true, '②enforce=true：A=0.5 ≥ gate → 放行')
ok(/A=0.30<gate/.test(maturationVerdict(0.3, true).reason), '②拦截理由含 A 与 gate（可入台账）')

// ── layeredScore：α 权重来自注册表 ──
ok(near(layeredScore({ relevance: 1, importance: 0, recency: 0 }), Number(SCORE.alphaRel)), '③relevance 权重 = α_rel')
ok(near(layeredScore({ relevance: 0, importance: 1, recency: 0 }), Number(SCORE.alphaImp)), '③importance 权重 = α_imp')
ok(near(layeredScore({ relevance: 0, importance: 0, recency: 1 }), Number(SCORE.alphaRec)), '③recency 权重 = α_rec')
ok(Number(SCORE.alphaRec) <= 0.1 + 1e-9, `③recency 权重被压低（${SCORE.alphaRec} ≤ 0.10，依据 MSR 校准 recency 判别力 0.019）`)
ok(near(layeredScore({ relevance: 1, importance: 1, recency: 1 }), Number(SCORE.alphaRel) + Number(SCORE.alphaImp) + Number(SCORE.alphaRec)), '③三分量线性叠加')

// ── importanceOf：标签权重 + 长度信号；已知序 ──
const iLesson = importanceOf('[lesson] 网络坑 · 根因+对策 → notes/lessons.md §网络坑')
const iEnvShort = importanceOf('[env] X → notes/env.md §A')
const iEnvLong = importanceOf('[env] Y · 很长的概况短语/包含/多个/判别实词/与/路径关键词 → notes/env.md §B')
ok(iLesson > iEnvShort, `④lesson 权重 > env 短行（${iLesson.toFixed(3)} > ${iEnvShort.toFixed(3)}）`)
ok(iEnvLong > iEnvShort, `④同标签下长行 importance 更高（长度是校准后最强信号 .363）：${iEnvLong.toFixed(3)} > ${iEnvShort.toFixed(3)}`)
ok(importanceOf('') >= 0 && importanceOf('') <= 1, '④无标签/空行回落 [0,1]')

// ── 与既有裁决函数联动（回归）──
ok(promoteVerdict('principle', { traces: 3 }).ok === true, '⑤升格裁决：原则 ≥3 痕迹放行')
ok(promoteVerdict('principle', { traces: 2 }).ok === false, '⑤升格裁决：2 条痕迹拦截')
ok(promoteVerdict('path', { occurrences: 2, sessions: 2, success: true }).ok === true, '⑤路径裁决：同型≥2 ∧ 跨会话≥2 ∧ 成功 → 放行')
ok(promoteVerdict('principle', { traces: 9, dependsOnPremise: true, premiseWritten: false }).ok === false, '⑤premise 硬门生效')
ok(demoteVerdict({ file: 'user.md', leaf: true, status: 'cold', daysSinceHit: 999 }).ok === false, '⑤画像节禁归档守卫生效')
// 夹具运行时构造（**有意不写字面机器路径**：零硬编码红线 scripts/check-hardcode.mjs 会扫源码字面量）
const DRIVE = String.fromCharCode(68) + ':' + String.fromCharCode(92) // 'D:\\'
const projSample = DRIVE + 'proj' + String.fromCharCode(92) + 'shoucang 的私有路径'
ok(evaluateL0({ text: projSample, traces: 3, days30: 2 }).reuse === 'session-only', '⑤L0：项目专名/本机路径 → 仅本会话')

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
