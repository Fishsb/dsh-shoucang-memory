#!/usr/bin/env node
// test-wiring-gate-ast.mjs — 接线闸 W1–W4 的 **AST 版**（G-A1）
//
// 为什么还要这一件：`scripts/test-wiring-gate.mjs`（Cody，文本正则版）有 25 条断言 + 14 条破坏变体，
//   但它**分不清代码与注释**——把 `return landed ? 'done' : 'failed'` 整行注释掉，文本仍在 ⇒ 闸门继续绿
//   而接线已死。本件补的正是这个洞。
//
// 本件的三重自证（缺一即假绿）：
//   ① **骨架化**：用 TS scanner 把**注释**挖成等长空白（保留偏移），所有断言跑在骨架上 ⇒ 注释掉即消失。
//   ② **AST 结构断言**：W1–W4 各用**语法节点**判定（IfStatement / ConditionalExpression / BinaryExpression…），
//      不依赖正则，天然免疫注释与字符串。
//   ③ **注释掉必须翻红**：对每条规则做「整行注释掉」变异，重跑该规则**必须 FAIL**；不红 ⇒ 该规则没锁住。
//
// 退出码：0=PASS  1=FAIL  3=无法加载 typescript
// 用法: node scripts/test-wiring-gate-ast.mjs [--src <文件>] [--ts <typescript.js>]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(argOf('--src', join(root, 'src', 'distill.ts')))
const tsPath = argOf('--ts', null) || ['node_modules/typescript/lib/typescript.js']
  .map((p) => join(root, p)).find(existsSync)
if (!tsPath || !existsSync(tsPath)) { console.error(`FATAL: 无法定位 typescript（可用 --ts 指定）`); process.exit(3) }
const ts = (await import(pathToFileURL(resolve(tsPath)).href)).default

const raw = readFileSync(SRC, 'utf8')

// ── ① 骨架化：注释 → 等长空白（保留偏移与长度）──────────────────────────────
function skeletonOf(text) {
  const sc = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, text)
  const out = text.split('')
  let t = sc.scan()
  while (t !== ts.SyntaxKind.EndOfFileToken) {
    if (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) {
      const s = sc.getTokenPos(); const e = sc.getTextPos()
      for (let i = s; i < e; i++) if (out[i] !== '\n') out[i] = ' '
    }
    t = sc.scan()
  }
  return out.join('')
}

let pass = 0, fail = 0
const ok = (c, msg, why) => { if (c) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}${why ? '  — ' + why : ''}`) } }
const count = (s, re) => (s.match(re) || []).length

// ── 红因分桶（与文本版 test-wiring-gate.mjs `f3aec19` 同款，两版保持一致）────────
// 为什么必须分桶：三类红**方向不同**，混在一个 fail 计数里会把诊断指反——
//   「结构」  = 源码接线判据真的不成立 ⇒ 该改的是 **src/**；
//   「变体失效」/「空转」= 本件自校验失败（变体锚点漂移 / 骨架化失效 / 基线已红）⇒ 该修的是 **本件**，
//     此时源码一个字都没被证伪，exit=1 说的是"本件坏了"，读成"源码接线坏了"就是反的；
//   「漏网」  = 变体改坏源码、判据却仍绿 ⇒ 该接线根本没锁住，该去**补判据**，与"修本件"方向相反，故单列。
const BUCKET = { 结构: 0, 变体失效: 0, 空转: 0, 漏网: 0 }
const bad = (bucket, msg, why) => { fail++; BUCKET[bucket]++; console.log(`  ❌ [${bucket}] ${msg}${why ? '  — ' + why : ''}`) }

// ── ② AST 结构断言：每条规则返回一个「在给定源码文本上是否成立」的谓词 ──────────
function analyse(text) {
  const sf = ts.createSourceFile('probe.ts', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  // W1 拆成 cmOkIf（if 存在）与 failReturnInIf（失败 return 必须**在**该 if 的 then 块内）——
  //   只断言「两样都存在」不够：把 if 注释掉后 return 仍然悬在那里，旧版判据照样绿（本件第一次跑就栽在这）。
  // W4 拆成 thenRollback / catchRollback：回滚有两个落点（failed 分支 + 异常 catch），只锁一个 ⇒
  //   另一个还活着，注释掉第一个闸门不翻红（同样是本件第一次跑实测出来的）。
  const found = { cmOkIf: 0, failReturn: 0, failReturnInIf: 0, commitCall: 0, gateConst: 0, gateConsumer: 0, tern: 0, replayAnd: 0, rollbackAssign: 0, thenRollback: 0, catchRollback: 0 }
  const isStr = (n, v) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text === v
  const isFailReturn = (n) => {
    if (!ts.isReturnStatement(n) || !n.expression || !ts.isObjectLiteralExpression(n.expression)) return false
    const p = n.expression.properties
    const added = p.find((x) => ts.isPropertyAssignment(x) && ts.isIdentifier(x.name) && x.name.text === 'added')
    const gate = p.find((x) => ts.isPropertyAssignment(x) && ts.isIdentifier(x.name) && x.name.text === 'gate')
    return !!(added && ts.isNumericLiteral(added.initializer) && added.initializer.text === '0'
      && gate && ts.isIdentifier(gate.initializer) && gate.initializer.text === 'COMMIT_FAILED_GATE')
  }
  const isRollback = (n) => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && ts.isIdentifier(n.left) && n.left.text === 'lastDeepSleepAt'
    && ts.isIdentifier(n.right) && n.right.text === 'prevDeepSleepAt'
  const hasIn = (root, pred) => { let hit = false; const v = (m) => { if (pred(m)) hit = true; ts.forEachChild(m, v) }; v(root); return hit }
  const walk = (n) => {
    // W1-a: if (!cm.ok) { ... } —— 且失败 return 必须在它的 then 块里（否则注释掉 if 也绿）
    if (ts.isIfStatement(n) && ts.isPrefixUnaryExpression(n.expression)
      && n.expression.operator === ts.SyntaxKind.ExclamationToken
      && ts.isPropertyAccessExpression(n.expression.operand)
      && ts.isIdentifier(n.expression.operand.expression) && n.expression.operand.expression.text === 'cm'
      && n.expression.operand.name.text === 'ok') {
      found.cmOkIf++
      if (n.thenStatement && hasIn(n.thenStatement, isFailReturn)) found.failReturnInIf++
    }
    if (isFailReturn(n)) found.failReturn++
    // W4: 两个落点分别计数
    if (isRollback(n)) {
      found.rollbackAssign++
      // 沿祖先找最近的 .then/.catch 回调
      let inCatch = false, inThen = false
      for (let a = n.parent; a; a = a.parent) {
        if (ts.isCallExpression(a) && ts.isPropertyAccessExpression(a.expression)) {
          if (a.expression.name.text === 'catch') { inCatch = true; break }
          if (a.expression.name.text === 'then') { inThen = true; break }
        }
      }
      if (inCatch) found.catchRollback++
      if (inThen) found.thenRollback++
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'commitPrinciples') found.commitCall++
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'COMMIT_FAILED_GATE') found.gateConst++
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'includes') {
      const a = n.expression.expression
      if (ts.isArrayLiteralExpression(a) && a.elements.some((e) => ts.isIdentifier(e) && e.text === 'COMMIT_FAILED_GATE')) found.gateConsumer++
    }
    // W2: landed ? 'done' : 'failed'
    if (ts.isConditionalExpression(n) && isStr(n.whenTrue, 'done') && isStr(n.whenFalse, 'failed')) found.tern++
    // W3: deepSleepReplayable(...) && <单调比较>
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const usesReplayable = (x) => {
        let hit = false
        const v = (m) => { if (ts.isCallExpression(m) && ts.isIdentifier(m.expression) && m.expression.text === 'deepSleepReplayable') hit = true; ts.forEachChild(m, v) }
        v(x); return hit
      }
      const mono = (x) => ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.GreaterThanToken || x.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken)
      if ((usesReplayable(n.left) && mono(n.right)) || (usesReplayable(n.right) && mono(n.left))) found.replayAnd++
    }
    // W4: lastDeepSleepAt = prevDeepSleepAt
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(n.left) && n.left.text === 'lastDeepSleepAt'
      && ts.isIdentifier(n.right) && n.right.text === 'prevDeepSleepAt') found.rollbackAssign++
    ts.forEachChild(n, walk)
  }
  ts.forEachChild(sf, walk)
  return found
}

// 每条规则：pred(found, skeleton) → 是否成立；mutate(raw) → 注释掉后的源码（null=不做）
const RULES = [
  {
    id: 'W1', title: 'G-16：原则落盘失败 ⇒ 必须判失败（added 归 0 + 共享常量 gate），不得谎报已消化',
    // 关键：失败 return 必须**在** if (!cm.ok) 的 then 块内；只断言「存在」会被「注释掉 if」骗过。
    pred: (f, sk) => f.commitCall >= 1 && f.cmOkIf >= 1 && f.failReturnInIf >= 1 && f.gateConst >= 1 && f.gateConsumer >= 1
      && count(sk, /COMMIT_FAILED_GATE/g) >= 3,
    detail: (f, sk) => `commitCall=${f.commitCall} cmOkIf=${f.cmOkIf} failReturnInIf=${f.failReturnInIf} gateConst=${f.gateConst} gateConsumer=${f.gateConsumer} 骨架内COMMIT_FAILED_GATE=${count(sk, /COMMIT_FAILED_GATE/g)}`,
    breaks: [
      ['把 if (!cm.ok) { 整行注释掉（接线变悬空代码）', (s) => s.replace(/^(\s*)if \(!cm\.ok\) \{/m, '$1// if (!cm.ok) {')],
      ['谎报：失败 return 的 added 从 0 改成 acceptedItems.length', (s) => s.replace(
        'return { attempted, added: 0, replaced: 0, skipped: attempted, gate: COMMIT_FAILED_GATE',
        'return { attempted, added: acceptedItems.length, replaced: 0, skipped: attempted, gate: COMMIT_FAILED_GATE')],
      ['producer 脱钩：gate 写死字面量', (s) => s.replace('gate: COMMIT_FAILED_GATE, gateExit: -1', "gate: '落盘异常', gateExit: -1")],
      ['consumer 脱钩：判据不再消费该 gate', (s) => s.replace(
        "['write_gate 未就位', COMMIT_FAILED_GATE].includes(app.gate)", "['write_gate 未就位'].includes(app.gate)")],
    ],
  },
  {
    id: 'W2', title: '终判映射：landed ⇒ done / 否则 failed（改成恒 done ⇒ 没消化的轮次也被划出窗口）',
    pred: (f) => f.tern >= 1,
    detail: (f) => `tern(done/failed)=${f.tern}`,
    breaks: [
      ["把 return landed ? 'done' : 'failed' 整行注释掉", (s) => s.replace(/return landed \? 'done' : 'failed'/, "// return landed ? 'done' : 'failed'")],
      ['改成恒 done（没消化的轮次也被划出窗口）', (s) => s.replace(/return landed \? 'done' : 'failed'/, "return 'done'")],
    ],
  },
  {
    id: 'W3', title: '重启回放水位：只认可回放行且严格递增（去掉单调性 ⇒ 水位倒退，整窗重蒸）',
    pred: (f) => f.replayAnd >= 1,
    detail: (f) => `replayable&&单调=${f.replayAnd}`,
    breaks: [
      ['把 deepSleepReplayable(o) && t > lastDeepSleepAt 那行注释掉', (s) => s.replace(/if \(deepSleepReplayable\(o\) && t > lastDeepSleepAt\)/, '// if (deepSleepReplayable(o) && t > lastDeepSleepAt)')],
      ['去掉单调性（只留回放判定 ⇒ 水位可倒退）', (s) => s.replace('if (deepSleepReplayable(o) && t > lastDeepSleepAt)', 'if (deepSleepReplayable(o))')],
    ],
  },
  {
    id: 'W4', title: '判 failed ⇒ 水位回滚到本轮基准（改成推进到 now ⇒ 重试窗口关死，本批痕迹永不再蒸）',
    // 两个落点都要锁：.then 里 failed 分支 + .catch 里异常分支。只锁一个 ⇒ 另一个还活着，注释掉也不翻红。
    pred: (f) => f.thenRollback >= 1 && f.catchRollback >= 1,
    detail: (f) => `then回滚=${f.thenRollback} catch回滚=${f.catchRollback}（合计 ${f.rollbackAssign}）`,
    breaks: [
      ['.then 内 failed 回滚注释掉', (s) => s.replace(
        "if (r === 'failed') { lastDeepSleepAt = prevDeepSleepAt;", "// if (r === 'failed') { lastDeepSleepAt = prevDeepSleepAt;")],
      // ⚠ 动这条变体前必须先读（archi 2026-09-12，两条都是实测结论）：
      //   1) 这个 replace 的锚点是**格式敏感**的：要求 `lastDeepSleepAt = prevDeepSleepAt` 的紧接下一行就是
      //      `log(`deep sleep err:`。一旦有人重排/加空行 ⇒ 锚点失配 ⇒ 报「变异未命中」⇒ **自伤型假红**：
      //      本件 exit=1，但结构断言其实全绿，红因是"本件坏了"不是"源码接线坏了"，方向相反。
      //      ⇒ 在「删除文本版」的验收准绳下，这种红**不计入覆盖**，出现即判准绳不通过。
      //   2) W4 的 pred 只数赋值句（thenRollback / catchRollback），**不看它是否落在 if / catch 的守卫条件内**。
      //      实测：把 `if (r === 'failed')` 改成 `if (r === 'never')`（回滚永不发生）⇒ 本件结构断言仍然全绿。
      //      ⇒ 别把「本件红了」读成「W4 锁住了」。本条目前只锁"回滚语句存在"，没锁"回滚真的会发生"。
      //      要补的话：把 pred 改成"回滚赋值句的祖先链上存在 if('failed') / .catch"，届时本注释第 2 条即失效。
      ['.catch 内回滚注释掉', (s) => s.replace(/\n(\s*)lastDeepSleepAt = prevDeepSleepAt\n(\s*)log\(`deep sleep err:/, '\n$1// lastDeepSleepAt = prevDeepSleepAt\n$2log(`deep sleep err:')],
      ['回滚改成推进到 now（重试窗口关死）', (s) => s.replace(
        "if (r === 'failed') { lastDeepSleepAt = prevDeepSleepAt;", "if (r === 'failed') { lastDeepSleepAt = now;")],
    ],
  },
]

console.log(`接线闸（AST 版 · G-A1）  源码: ${SRC}`)
console.log(`typescript: ${tsPath}\n`)

// 骨架自证：骨架必须与原文不同（挖掉过注释），否则骨架化静默失效 ⇒ 假绿
const skel = skeletonOf(raw)
const blanked = (skel.match(/ /g) || []).length - (raw.match(/ /g) || []).length
console.log(`① 骨架化自证：注释挖空 ${blanked} 字符（0 ⇒ 骨架化失效，按失败处理）`)
if (blanked > 0) ok(true, `骨架化生效（挖空 ${blanked} 字符）`)
else bad('空转', `骨架化失效（挖空 ${blanked} 字符）`, '骨架与原文同形 ⇒ 无法证明免疫注释，本件自校验失败')

const f0 = analyse(raw)
console.log(`\n② 现状判定（AST 结构断言）：`)
for (const r of RULES) {
  if (r.pred(f0, skel)) ok(true, `${r.id} ${r.title}`)
  else bad('结构', `${r.id} ${r.title}`, r.detail(f0, skel))
}

console.log(`\n③ 反向证伪（每条规则的每个破坏变体，闸门都必须翻红）：`)
// ⚠ 基线守卫（2026-09-12）：若某规则的**基线本身就是红的**，则「破坏后必须翻红」这条判据
//   恒为真 ⇒ 本节空转全绿，读起来像"锁住了"，实际一个字都没验。这与「变体非空」是**两类**洞：
//     · 变体非空 挡的是「replace 没命中」（变体没改到源码）
//     · 基线守卫 挡的是「baseline 本就红」（改没改都红 ⇒ 判据失去分辨力）
//   实测对照：文本版 `test-wiring-gate.mjs` 在 W4 锚点写错（`\}\.catch` 漏 `)`，命中 0）时，
//   baseline 红，而 4 条「改坏必须翻红」全部 ✅ —— 就是这条洞。本件原来也有，现补。
for (const r of RULES) {
  const baseOk = r.pred(f0, skel)
  for (const [desc, fn] of r.breaks) {
    const mutated = fn(raw)
    if (mutated === raw) { bad('变体失效', `${r.id} 变异未命中（源码已漂移，变体字符串失效）⇒ 按失败处理`, desc); continue }
    if (!baseOk) {
      bad('空转', `${r.id} 基线已红 ⇒ 「破坏「${desc}」⇒ 翻红」判读无意义（先修基线再谈证伪）`,
        '基线红时该判据恒真，本节会空转全绿')
      continue
    }
    const fm = analyse(mutated)
    const stillGreen = r.pred(fm, skeletonOf(mutated))
    if (stillGreen) bad('漏网', `${r.id} 破坏「${desc}」后闸门仍然绿`, '该规则没锁住这条接线 ⇒ 该去补判据，不是改源码')
    else ok(true, `${r.id} 破坏「${desc}」⇒ 翻红`)
  }
}

// 自伤 = 变体失效 + 空转（该修**本件**）；漏网单列（该去**补判据/锁接线**）——两者方向相反，不得相加
const selfHurt = BUCKET.变体失效 + BUCKET.空转
console.log(`\n${fail ? `FAIL（${fail} 项）` : `PASS（${pass} 项）`}（红因分解：结构 ${BUCKET.结构} · 变体失效 ${BUCKET.变体失效} · 空转 ${BUCKET.空转} · 漏网 ${BUCKET.漏网}）`)
if (BUCKET.结构 === 0 && selfHurt > 0)
  console.log('⚠ 本件的红**全部来自自伤/空转**：源码接线判据一个字都没被证伪 ⇒ 该修的是**本件**，不是源码')
if (BUCKET.漏网 > 0)
  console.log(`⚠ 有 ${BUCKET.漏网} 条变体改坏源码后本件**没**翻红 ⇒ 该接线根本没锁住：该去**补判据/锁接线**，不是修本件`)
process.exit(fail ? 1 : 0)
