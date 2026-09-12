#!/usr/bin/env node
// test-targets.mjs —— targets.ts **直接单测**（终极方案 §六 第 2 条）
//
// 为什么必须有这一件：终极方案把它列为**当前第一风险** ——
//   「不切碎 targets.ts（33 导出偏宽，但纯函数无状态）——**先补直接单测**。
//    它是当前第一风险：**扇入 7 却零直接单测，坏了 7 个模块一起错**。补测试优先级高于切分。」
//   本件落地这条：直接 import 编译产物 lib/targets.js，对纯函数逐条断言，不经任何上层装配。
//
// 断言口径（为什么这么写）：
//   · **数据驱动自注册表**：载体层（P/R/E × always/gated/none）的期望值一律从
//     lib/criteria.generated.js 的 CARRIERS 推出，**不把标签名单抄第二份**——
//     抄一份就是"同一事实的第二份副本"，正是 ADR-130 明令禁止的漂移源。
//   · **单一实现有断言**：`suiteAssemblyMatrix` 只许存在于 lib/targets.js 一处
//     （AGENTS.md「架构单一实现约定」：scheduler 工具与 panel RPC 都调它，禁止本地副本）。
//   · 行为面用**临时夹具库**（mkdtemp）真读，验证 scanIndexRows / recallIndex / recallApprox。
//
// 用法: node scripts/test-targets.mjs   （先 `npm run build:host` 产出 lib/；npm test 已含 pretest）

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`) } else { fail++; console.log(`❌ ${m}`) } }
const load = (rel) => pathToFileURL(join(repoRoot, rel)).href

const T = await import(load('lib/targets.js'))
const { CARRIERS } = await import(load('lib/criteria.generated.js'))

console.log('== A. 路径推导（环境契约：无硬编码本机路径，全部由 DSH_HOME / homedir 派生）==')
{
  const expectHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  ok(T.dshHome() === expectHome, `dshHome() 随 DSH_HOME/home 派生（= ${T.dshHome()}）`)
  ok(T.knowledgeRoot() === join(T.dshHome(), 'suite', 'knowledge'), 'knowledgeRoot() = <home>/suite/knowledge')
  ok(T.memoryLibRoot() === join(T.dshHome(), 'skills', 'managing-memory'), 'memoryLibRoot() = <home>/skills/managing-memory')
  ok(!/[A-Za-z]:\\Users\\[^\\]+/.test(T.memoryLibRoot()) || T.memoryLibRoot().startsWith(expectHome),
    'memoryLibRoot 不含字面用户目录（除 homedir 派生本身）')
}

console.log('== B. resolveBaseName（bundles 短名 vs scoped 包名归一）==')
{
  ok(T.resolveBaseName('dsh-shoucang-memory') === 'dsh-shoucang-memory', '无 scope 原样返回')
  ok(T.resolveBaseName('@dsh-external/project-nav') === 'project-nav', '@scope/name → name')
  ok(T.resolveBaseName('@nanmicoder/dsh-agent-teams') === 'dsh-agent-teams', '@scope/dsh-x → dsh-x')
}

console.log('== C. gateMemoryAppend + loadWhitelist（写侧门禁：不符合不存）==')
{
  const { wl, source } = T.loadWhitelist(join(tmpdir(), 'shoucang-no-such-root-xyz'))
  ok(source === 'builtin', '无 whitelist.json → 内建缺省且标注 source=builtin')
  ok(wl.version === 1 && wl.routes.includes('memory'), '内建缺省 version=1 且 routes 含 memory')
  ok(wl.indexTargets.length === 3 && wl.notes.length === 7, `内建缺省 indexTargets=3 notes=7（实测 ${wl.indexTargets.length}/${wl.notes.length}）`)
  ok(T.gateMemoryAppend({ target: 'MEMORY.md' }, wl).ok, '索引目标 MEMORY.md 放行')
  ok(T.gateMemoryAppend({ target: 'USER.md' }, wl).ok, '画像 USER.md 放行')
  ok(T.gateMemoryAppend({ target: 'notes/lessons.md' }, wl).ok, '白名单 notes 放行')
  const g = T.gateMemoryAppend({ target: 'notes/evil.md' }, wl)
  ok(!g.ok && /白名单不符/.test(g.reason || ''), '非白名单 notes 拒收且理由含「白名单不符」')
  ok(!T.gateMemoryAppend({}, wl).ok, '空 target 拒收')
  ok(!T.gateMemoryAppend({ target: 'notes/../MEMORY.md' }, wl).ok, '路径穿越 notes/../MEMORY.md 拒收')
  ok(!T.gateMemoryAppend({ target: 'NOTES/lessons.md' }, wl).ok, '大小写不符拒收（口径区分大小写）')
}

console.log('== D. 载体层单一实现（ADR-130：只认注册表，禁代码内标签白名单副本）==')
{
  const tags = CARRIERS?.tags || {}
  const names = Object.keys(tags)
  ok(names.length > 0, `注册表载入 ${names.length} 个标签`)
  let sethit = 0
  for (const [tag, c] of Object.entries(tags)) {
    if (c.form === 'index' && !T.indexCarrierSet(c.inject).has(tag)) sethit++
    if (c.form === 'profile' && !T.profileCarrierSet(c.inject).has(tag)) sethit++
  }
  ok(sethit === 0, `每个注册标签都出现在其 (form,inject) 集合内（错配 ${sethit}）`)
  const disjoint = (a, b) => [...a].every((x) => !b.has(x))
  ok(disjoint(T.indexCarrierSet('always'), T.indexCarrierSet('gated')), 'index: always ∩ gated = ∅')
  ok(disjoint(T.indexCarrierSet('always'), T.indexCarrierSet('none')), 'index: always ∩ none = ∅')
  const layered = names.filter((n) => tags[n].layer)
  if (layered.length) {
    const violate = layered.filter((n) => (tags[n].layer === 'P') !== (tags[n].inject === 'always'))
    ok(violate.length === 0, `契约「P 必 always、R/E 必非 always」成立（违例 ${violate.length}：${violate.join(',')}）`)
  } else {
    console.log('ℹ️ 注册表无 layer 字段，跳过 P/R/E 契约断言')
  }
  const hc = T.highConfCarrierSet()
  ok([...hc].every((t) => tags[t]?.mclGate === true), `highConfCarrierSet 全部来自注册表 mclGate=true（${[...hc].join('/') || '空'}）`)
  ok([...hc].every((t) => names.includes(t)), 'highConfCarrierSet ⊆ 注册标签集')
  ok(T.indexRowTag('[原则] 批处理水位即真相 → notes/flows.md §深睡蒸馏') === '原则', 'indexRowTag 取方括号标签')
  ok(T.indexRowTag('  [环境] x') === '环境', 'indexRowTag 先去空白再取标签')
  ok(T.indexRowTag('- [身份] x') === null, '带列表短横前缀 → null（索引行契约只认行首 [tag]）')
  ok(T.indexRowTag('[原则 ] x') === null, '标签内含空格 → null')
  ok(T.indexRowInLayer('裸行无标签', 'always') === false, '保守缺省：无标签行不进任何档')
  ok(T.indexRowInLayer(`[${names.find((n) => tags[n].inject === 'none') || '未登记标签'}] x`, 'none') === true || true, 'none 档查表不抛错')
}

console.log('== E. sectionKeyOf / dedupeBySection（同 § 竞争性抑制的唯一键口径）==')
{
  ok(T.sectionKeyOf('[原则] x → notes/flows.md §深睡蒸馏', 'notes/flows.md') === 'flows.md::深睡蒸馏', '族键 = 文件::小节（去 notes/ 前缀）')
  ok(T.sectionKeyOf('[flow] x → notes/flows.md §进度核查与发布自检（2026-09-12）', 'notes/flows.md') === 'flows.md::进度核查与发布自检',
    '小节名去行尾日期括号后缀')
  ok(T.sectionKeyOf('[原则] 没有节标记的行', 'notes/x.md') === null, '无 § → null')
  const items = [{ k: 'a', n: 1 }, { k: 'a', n: 2 }, { k: 'b', n: 3 }]
  const keyOf = (x) => x.k
  const k1 = T.dedupeBySection(items, 1, keyOf)
  ok(k1.filter((x) => x.k === 'a').length === 1, 'k=1：同 § 只留首条（去重语义）')
  ok(k1.length === 2, 'k=1：返回去重后的 keep 列表 —— 截断到 topK 是调用方 slice 的职责，本函数只管抑制')
  ok(T.dedupeBySection(items, 3, keyOf).length === 3, 'k=3：无竞争者时按序回填，不减到 topK 以下')
  ok(T.dedupeBySection([{ k: null }, { k: null }], 1, (x) => x.k).length === 2, 'key=null 恒保留（不去重）')
}

console.log('== F. extractRecallTokens（词法地板：零依赖、确定性）==')
{
  ok(T.extractRecallTokens('ollama bge-m3').join(',') === 'ollama,bge-m3', 'ASCII 词按小写切分去重')
  ok(T.extractRecallTokens('可以').length === 0, '停用词（可以）被滤除')
  const t = T.extractRecallTokens('检查当前项目进度')
  ok(t.length === 7 && t.includes('目进度') && t[0] === '检查当前项目进度', `长中文串：整串 + 三字滑窗（实测 ${t.length} 条）`)
  ok(T.extractRecallTokens('项目 项目').filter((x) => x === '项目').length === 1, '跨 run 去重')
  ok(T.extractRecallTokens('').length === 0, '空串 → 空 token')
}

console.log('== G. suiteAssemblyMatrix（装配矩阵单一实现）==')
{
  const m = T.suiteAssemblyMatrix([{ id: 'probe', package: '@dsh-external/project-nav', repo: 'r', role: 'probe' }])
  ok(m.members.length === 1, '一成员一一行')
  ok(['both', 'injected', 'profile', 'missing'].includes(m.members[0].status), `status ∈ 四态（实测 ${m.members[0].status}）`)
  ok(typeof m.members[0].detail === 'string' && m.members[0].detail.length > 0, 'detail 非空')
  ok(/共 1 成员/.test(m.summary), 'summary 报成员数与 present/missing')
  const defs = readdirSync(join(repoRoot, 'lib')).filter((f) => f.endsWith('.js'))
    .filter((f) => /function suiteAssemblyMatrix/.test(readFileSync(join(repoRoot, 'lib', f), 'utf8')))
  ok(defs.length === 1 && defs[0] === 'targets.js', `suiteAssemblyMatrix 全仓唯一实现（实测定义处：${defs.join(',') || '无'}）`)
  const sch = readFileSync(join(repoRoot, 'lib', 'scheduler.js'), 'utf8')
  const pan = readFileSync(join(repoRoot, 'lib', 'panel-observe.js'), 'utf8')
  ok(sch.includes('suiteAssemblyMatrix') && sch.includes('suiteScan'),
    'scheduler 一侧：调用单一实现，并经 suiteScan 暴露给 share 桥')
  ok(pan.includes('suite') && /scheduler-share/.test(pan),
    'panel 一侧经 scheduler-share 桥接取矩阵（降级分支明写，不自建副本）')
}

console.log('== H. 临时夹具库：scanIndexRows / recallIndex / recallApprox 真读行为 ==')
{
  const root = mkdtempSync(join(tmpdir(), 'shoucang-targets-'))
  try {
    mkdirSync(join(root, 'notes'), { recursive: true })
    writeFileSync(join(root, 'AGENT.md'), [
      '# AGENT',
      '[原则] 批处理水位即真相 → notes/flows.md §深睡蒸馏',
      '[环境] DSH 权限模式 → notes/env.md §权限模式',
      '无标签裸行',
      '[原则] 无指针行不该进薄行池',
      // 负例：列表短横是**注入渲染后的形态**，不是库内规范行 —— 规范行首必须直接是 [tag]
      '- [原则] 带列表短横的行 → notes/flows.md §深睡蒸馏',
    ].join('\n'))
    writeFileSync(join(root, 'MEMORY.md'), '[flow] 本地插件发布链 → notes/flows.md §进度核查与发布自检\n')
    writeFileSync(join(root, 'notes', 'flows.md'), '## 深睡蒸馏\n## 进度核查与发布自检\n')
    writeFileSync(join(root, 'notes', 'env.md'), '## DSH 环境\n')

    const rows = T.scanIndexRows(root)
    ok(rows.length === 3, `scanIndexRows 只取「有标签 + 有 notes 指针」薄行（实测 ${rows.length}，应 3）`)
    ok(rows.every((r) => r.line.startsWith('[')),
      '库内规范行首直接是 [tag]（带列表短横的渲染形态不进扫描 —— 已作负例钉住）')
    ok(rows.every((r) => r.pointer.startsWith('notes/')), '每行都带 notes/ 指针')

    const hit = T.recallIndex(root, '深睡蒸馏 水位', 3, 'all')
    ok(hit.mode === 'lexical' && hit.rows.length >= 1, 'recallIndex 词法命中')
    ok(hit.rows[0].tag === '原则' && hit.rows[0].score >= 4, `标签权重生效（路径3/原则2 ⇒ 实测 score=${hit.rows[0]?.score}）`)

    const gated = T.indexRowInLayer('[原则] x → notes/flows.md §深睡蒸馏', 'always')
    const filtered = T.recallIndex(root, '深睡蒸馏 水位', 3, 'all', 'always')
    ok(filtered.rows.length === (gated ? hit.rows.length : 0),
      `inject=always 过滤与注册表一致（原则属 always=${gated} ⇒ 命中 ${filtered.rows.length}）`)

    const approx = T.recallApprox(root, '深睡蒸馏')
    ok(approx.near.some((r) => /notes\/flows\.md/.test(r.line)), '零命中兜底给出 notes 主题地图')
    ok(approx.suggest.includes('深睡蒸馏'), `建议检索词取库内已知领域 token（${approx.suggest.join('/')}）`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

console.log('== I. selftestMatrix（库就位 + 门禁抽样，只验形状）==')
{
  const lines = T.selftestMatrix()
  ok(Array.isArray(lines) && lines.length >= 4 && lines.every((l) => typeof l === 'string'), `selftestMatrix 返回 ${lines.length} 行文本`)
  ok(/单库解析/.test(lines[0] || ''), '首行报单库解析态')
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}（${pass} pass · ${fail} fail）`)
process.exit(fail ? 1 : 0)
