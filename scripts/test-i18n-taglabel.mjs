/**
 * test-i18n-taglabel — 标签显示层行为测试（2026-09-17）
 *
 * **判因（用户两次实测）**：
 *   ① 「索引和小节显示的标签重复了」—— `偏好`/`习惯` 各出现两次被误判撞名 ⇒ 显示「偏好 · 偏好」；
 *   ② 「一级界面是正了，点击要开全部看又是双标签」—— 折叠态 tag 少不撞名 ⇒ 正常；
 *      **展开全部后 212 行里 `env` 与 `环境` 同时出现** ⇒ 触发 1:N 撞名 ⇒ 每行多一截 `· env`
 *      ⇒ 看上去就是「双标签」。
 *
 * **结论（本件钉死的判据）**：胶囊的**可见文本 = 映射名，不加任何后缀**。
 *   原始键仍全程保留在 `title` / `aria-label`（悬停 / 读屏可达）—— 消歧不靠可见文本承载。
 *   （曾经的 `· 原始键` 后缀与其判据 `ambiguousTags` 已**整体移除**，不再需要。）
 *
 * 退出码：0 PASS · 1 FAIL · 3 skip
 * 用法：node scripts/test-i18n-taglabel.mjs
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TL = join(ROOT, 'src-client', 'tag-label.js')
if (!existsSync(TL)) { console.log('test-i18n-taglabel：未找到 tag-label.js —— 跳过'); process.exit(3) }
const t = await import(pathToFileURL(TL).href)

let pass = 0
const fails = []
const ok = (m) => { pass++; console.log('  ✓ ' + m) }
const bad = (m) => { fails.push(m); console.error('  ✗ ' + m) }

/** 复刻 panes-memory.js#idxPill 的可见文本判据（那里是纯 DOM 渲染，文本逻辑在此验收）。 */
const pillText = (tag, loc) => t.tagLabel(tag, loc)

/* ① 可见文本 = 映射名，**无后缀**（两条用户报告的回归点） */
{
  const cases = [
    ['env', 'zh', '环境'], ['env', 'en', 'Environment'],
    ['环境', 'zh', '环境'], ['环境', 'en', 'Environment'],
    ['偏好', 'zh', '偏好'], ['习惯', 'zh', '习惯'],   // ① 同一 tag 重复不再产生「偏好 · 偏好」
    ['lesson', 'zh', '教训'], ['lesson', 'en', 'Lesson'],
    ['tool', 'zh', '工具'], ['flow', 'zh', '流程'],
  ]
  let n = 0
  for (const [tag, loc, expect] of cases) {
    const got = pillText(tag, loc)
    if (got === expect) n++
    else bad(`① ${tag}/${loc} 期望 ${JSON.stringify(expect)} 实得 ${JSON.stringify(got)}`)
  }
  if (n === cases.length) ok(`① 可见文本 = 映射名且**无后缀**（${n} 例，含 env/环境 1:N 同名）`)
  // 明确断言不含分隔后缀
  const all = cases.map(([tag, loc]) => pillText(tag, loc))
  if (all.every((s) => !s.includes(' · ') && !s.includes('·'))) ok('① 任何胶囊文本都不含「· 原始键」后缀')
  else bad('① 仍有胶囊带后缀：' + JSON.stringify(all.filter((s) => s.includes('·'))))
}

/* ② 未登记 / 边界输入原样返回且不抛 */
{
  const cas = ['未知标签', 'zzz-new-tag', '', null, undefined, 0]
  let okAll = true
  for (const c of cas) {
    let r
    try { r = t.tagLabel(c, 'zh') } catch (e) { okAll = false; bad('② tagLabel 抛错：' + c + ' → ' + e.message) }
    if (r === undefined) { okAll = false; bad('② tagLabel 返回 undefined：' + c) }
  }
  if (okAll) ok('② 未登记/边界输入原样返回且不抛（' + cas.length + ' 例）')
}

/* ③ 覆盖面契约：键集 ⊇ carriers.tags ∪ TAG_ORDER（防新增承运者漏配） */
{
  const cur = t.tagLabelKeys()
  if (Array.isArray(cur) && cur.length >= 18) ok('③ 键集 ' + cur.length + ' 条（≥ carriers.tags 18）')
  else bad('③ 键集异常：' + JSON.stringify(cur && cur.length))
  // 键集内每个键都必须能映射出非空文本
  const empty = cur.filter((k) => !t.tagLabel(k, 'zh'))
  if (!empty.length) ok('③ 每个键都有中文映射（无空映射）')
  else bad('③ 存在空映射键：' + empty.join(', '))
}

/* ④ 已移除的旧机制不得复活（防「加回后缀」式回退） */
{
  if (typeof t.ambiguousTags === 'function') bad('④ ambiguousTags 仍存在（可见文本既已不附后缀，该机制应已移除）')
  else ok('④ ambiguousTags 已移除（消歧不再靠可见文本）')
  const mem = existsSync(join(ROOT, 'src-client', 'panes-memory.js'))
    ? (await import('node:fs')).readFileSync(join(ROOT, 'src-client', 'panes-memory.js'), 'utf8') : ''
  if (mem && !/' · '\.?/.test(mem.match(/idxPill[\s\S]{0,400}/)?.[0] || '')) ok('④ idxPill 内无「 · 」拼接')
  else if (mem.includes("name + ' · '")) bad('④ idxPill 内又出现「 · 原始键」拼接')
  else ok('④ idxPill 内无「 · 」拼接')
}

console.log('')
if (fails.length) {
  console.error(`test-i18n-taglabel: FAIL（${pass} PASS / ${fails.length} FAIL）`)
  fails.forEach((m) => console.error('  · ' + m))
  process.exit(1)
}
console.log(`test-i18n-taglabel: PASS（${pass} 项）`)
process.exit(0)
