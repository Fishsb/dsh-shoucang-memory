/**
 * 已安装副本「特性标记」探针（2026-09-13）
 *
 * 判因：`check-installed-sync` 只比**文件级**一致性（sha1），它无法回答
 *   「装上去的那份**确实带着本轮所有能力**吗」——比如新产物漏拷（本轮 S4 就出现过
 *   `lib/panel-contract.js` 未纳管、差点漏拷、装上就 import 失败的风险）。
 *
 * 本件按**特性标记**核对已安装副本：S2 插槽 / S3 组件库与皮肤 / S4 契约与预检，
 *   逐条给「标记是否在已安装产物里」，缺一即列出来。
 *
 * 报告态（exit 0）：安装副本的更新链含 push / 宿主热重载等**环境侧**步骤，
 *   做成红灯会把"用户还没重启/还没装"误报成代码问题（与 check-installed-sync 同口径）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const INSTALL = join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-shoucang-memory')
if (!existsSync(INSTALL)) {
  console.log('已安装副本不在预期位置（' + INSTALL + '）—— 跳过（报告态）')
  process.exit(0)
}
const read = (rel) => {
  const p = join(INSTALL, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}
const client = read('lib/client.js')
const contract = read('lib/panel-contract.js')

/** 特性 → 产物 → 标记（**客户端/契约侧**，S1–S4） */
const FEATURES_I18N = [
  /* ── i18n（中英文切换 · 2026-09-17）────────────────────────────────────
   * 判因：v2.1 验收⑥原写「须先补 i18n 标记」却**没有判据** —— 该件当时是报告态，
   *   不加标记照样全绿 ⇒ 等于恒真（红队指出的「新假绿形态」）。
   *   现写死 3 个必检标记，缺一即在报告里标为 MUST（见下方 --strict 口径）。 */
  ['i18n 运行时（缺键记录容器）', 'lib/client.js', '__SC_I18N_MISS__'],
  ['i18n 接入函数（attachLocale 入产物）', 'lib/client.js', 'attachLocale'],
  ['i18n 标签映射（tagLabel 入产物）', 'lib/client.js', 'tagLabel'],
  ['i18n 词表非空（英文词条已随产物送达）', 'lib/client.js', 'Shoucang'],
]
const FEATURES = [
  ['S2 侧栏入口走宿主插槽', 'lib/client.js', 'sidebar.footer.action'],
  ['S2 设置进宿主设置中心', 'lib/client.js', 'settings.section'],
  ['S2 入口互斥（插槽可用不挂 DOM 兜底）', 'lib/client.js', 'SLOT_OK'],
  ['S3 组件库（Web Awesome）已随产物送达', 'lib/client.js', 'customElements'],
  ['S3 组件库主题令牌层注入', 'lib/client.js', '__SC_VENDOR_CSS__'],
  ['S3 Tab 组件化', 'lib/client.js', 'wa-tab-group'],
  ['S3 按钮组件化', 'lib/client.js', 'wa-button'],
  ['S3 尺寸层接管（scale 令牌）', 'lib/client.js', '--wa-font-size-scale'],
  ['S1 皮肤机制（v9 / 宿主）', 'lib/client.js', 'sc-skin-host'],
  ['S1 CSS 稳定锚点（门禁抽取）', 'lib/client.js', '__SC_CSS__'],
  ['S4 共享契约注入客户端', 'lib/client.js', '__SC_CONTRACT__'],
  ['S4 客户端预检必填', 'lib/client.js', 'preflight_missing_field'],
  ['S4 契约表模块已安装', 'lib/panel-contract.js', 'PANEL_ROUTES'],
  ['S4 契约模块含 contractFor', 'lib/panel-contract.js', 'contractFor'],
  ['S4 面板五环端点 /rings 在契约表', 'lib/panel-contract.js', '/rings']
]

/**
 * **宿主侧**特性标记（2026-09-13 补）。
 * 为什么补：本件原先只认客户端/契约产物 ⇒ 本会话新增的宿主侧能力（五环 · 事件流 · composition root ·
 *   双时间戳 · P2b 材料块）**全都查不到**——而"文件 sha 一致 ≠ 装上去的那份带着本轮能力"正是本件的立件理由。
 */
const HOST_FEATURES = [
  ['五环注册表（kind→环唯一声明 + RING_KPI）', 'lib/rings.js', 'RING_OF_KIND'],
  ['决策环（后果回收 scorecardOf）', 'lib/decision-ring.js', 'scorecardOf'],
  ['关系环（双向兑现率 trustOf）', 'lib/relation-ring.js', 'trustOf'],
  ['联想环（落地率 associationCensus）', 'lib/association-ring.js', 'associationCensus'],
  ['事实环（时态失效 factCensus）', 'lib/fact-ring.js', 'factCensus'],
  ['环事件流（重放 + 对账）', 'lib/ring-events.js', 'reconcileRing'],
  ['Record 事实源（双时间戳 validTo）', 'lib/record-store.js', 'validTo'],
  ['影子写与对账（saveStoreRecords）', 'lib/record-shadow.js', 'saveStoreRecords'],
  ['读侧候选集（时态剔除 buildCandidates）', 'lib/supply-assembly.js', 'buildCandidates'],
  ['composition root（createComposition）', 'lib/composition.js', 'createComposition'],
  ['P2b 材料块计数（sysBlockCalls）', 'lib/mcl.js', 'sysBlockCalls'],
  ['P2b 开关（materialInSystem）', 'lib/mcl.js', 'materialInSystem'],
  ['P4 存储解耦开关（storeMode）', 'lib/scheduler.js', 'storeMode'],
  ['五环端点处理器（ringsRoute）', 'lib/panel-observe.js', 'ringsRoute'],
  ['组合句柄盒消费（scheduler.current）', 'lib/panel-observe.js', 'scheduler.current']
]

const cache = new Map()
const readCached = (rel) => { if (!cache.has(rel)) cache.set(rel, read(rel)); return cache.get(rel) }

let missing = 0
console.log('已安装副本特性标记探针（' + INSTALL + '）')
for (const [group, list] of [['客户端/契约（S1–S4）', FEATURES], ['宿主侧（本会话 G0–G4）', HOST_FEATURES]]) {
  console.log(`\n── ${group} ──`)
  for (const [name, file, marker] of list) {
    const text = readCached(file)
    const okFlag = !!text && text.indexOf(marker) >= 0
    if (!okFlag) missing++
    console.log('  ' + (okFlag ? '✅' : '❌') + ' ' + name + '  [' + file + ' · ' + marker + ']')
  }
}

// **桥退役不变量**：装上去的那份里不得再有惰性桥引用（composition root 收尾后 lib 引用数应为 0）。
// 与 `check-bridges --gate`（仓内）同判据，此处查**已安装副本**——两道基准各查一侧。
{
  const libs = readdirSync(join(INSTALL, 'lib')).filter((f) => f.endsWith('.js'))
  const refs = libs.filter((f) => /-share\.js/.test(readFileSync(join(INSTALL, 'lib', f), 'utf8')))
  const okFlag = refs.length === 0
  if (!okFlag) missing++
  console.log(`  ${okFlag ? '✅' : '❌'} 三条惰性桥已全退役（已安装 lib 中无 -share.js 引用；实测 ${refs.length} 件${refs.length ? '：' + refs.join(',') : ''}）`)
}

/* ── i18n 能力（2026-09-17 · v2.1 验收⑥）─────────────────────────────────
 * 该组**不只是报告**：`--require-i18n` 时缺失即 exit 1。
 * 判因：v2.1 原写「须先补 i18n 标记」而无判据 ⇒ 不加标记照样全绿 = 恒真（红队指出的新假绿）。
 * 默认仍为报告态（与全件口径一致：安装副本更新链含 push/热重载等环境侧步骤）；
 * 但**发布前置的第⑥条**应显式带 `--require-i18n`，把「装上去的那份带着 i18n 能力」变成可红判据。 */
let i18nMissing = 0
{
  console.log('\n── i18n 能力（本轮新增）──')
  for (const [name, file, marker] of FEATURES_I18N) {
    const text = readCached(file)
    const okFlag = !!text && text.indexOf(marker) >= 0
    if (!okFlag) { missing++; i18nMissing++ }
    console.log('  ' + (okFlag ? '✅' : '❌') + ' ' + name + '  [' + file + ' · ' + marker + ']')
  }
}

console.log(missing === 0
  ? `\n✅ 已安装副本带着本轮全部特性（${FEATURES.length + HOST_FEATURES.length + FEATURES_I18N.length + 1} 项标记齐全）`
  : `\n⚠️  ${missing} 项标记缺失（其中 i18n ${i18nMissing} 项）—— 安装副本落后于仓内（跑部署脚本后重试）`)
console.log('  · lib/client.js ' + Math.round((readCached('lib/client.js') || '').length / 1024) + 'KB')
console.log('  · lib/panel-contract.js ' + Math.round((readCached('lib/panel-contract.js') || '').length / 1024) + 'KB')
console.log('\n重启 DSH 后的真机核对清单（人工）：')
console.log('  1) 侧栏底部只有一个守藏入口（不再是两个）；点开面板正常')
console.log('  2) 宿主设置中心出现「守藏」分区（含显示密度/导航宽度/皮肤/启动视图）')
console.log('  3) 面板设置页可切「v9 方案皮肤 / 宿主原生皮肤」，切换即时生效')
console.log('  4) 分段 Tab、操作卡按钮为组件库实现且观感与方案一致（按钮 30px 紫胶囊）')
console.log('  5) 日志面板默认折叠成一行')
console.log('  6) 宿主设置中心切「语言」为 English ⇒ 面板导航/标题即时变英文，切回中文即时复原')
// `--require-i18n`：把 i18n 能力缺失变成**红灯**（发布前置第⑥条用）
if (process.argv.includes('--require-i18n') && i18nMissing > 0) {
  console.error(`\n❌ --require-i18n：i18n 标记缺失 ${i18nMissing} 项 ⇒ 装上去的那份**不带**本轮 i18n 能力`)
  process.exit(1)
}
process.exit(0)
