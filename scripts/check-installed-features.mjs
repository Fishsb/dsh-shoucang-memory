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
  /* ⚠ 标记强度（2026-09-17 实测修正）：原用裸串 `Shoucang` —— 它在词表**之外**还有 29 处
   *   （包名 `dsh-shoucang-memory` / 模块头注释 / 路由串）⇒ **无论词表在不在都为真**（恒真标记）。
   *   改用**词组级**英文值：该串只可能来自词表 ⇒ 词表未进包时本标记即失败。
   *   （成因 C 的严判在产物层由 `check-i18n-registered` 负责，本标记是第二道粗筛。） */
  ['i18n 词表非空（英文词组级标记 · 原裸串 Shoucang 恒真已换）', 'lib/client.js', 'Shoucang distiller enableDistill'],
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
  // 指针供给三册（2026-09-19 · docs/pointer-supply-plan.md）——同一纪律：词组级标记，非通用词
  ['指针册一 小节地址供给（sectionAddressSupply）', 'lib/section-supply.js', 'sectionAddressSupply'],
  ['指针册三 写侧放置语义（planPlacement）', 'lib/section-ref.js', 'planPlacement'],
  ['指针册二 段级成对裁决（unpairedPointersOf）', 'lib/distill-write.js', 'unpairedPointersOf'],
  ['指针册三 画像行 § 准入（源指针悬空拒写）', 'lib/distill-write.js', '源指针悬空'],
  // 遗留收口轮（2026-09-19 · docs/pointer-supply-plan.md §12）——同纪律：新增模块各留出口符号级标记。
  //   治「三类"知识没落地"存量各写各的、无统一读出口」⇒ 装上去的那份必须带统一出口与定期登记。
  ['收口轮 缺陷队列统一出口（deferredQueueOf）', 'lib/pointer-deficits.js', 'deferredQueueOf'],
  ['收口轮 缺陷定期登记（registerDeficits）', 'lib/pointer-deficits.js', 'registerDeficits'],
  // 遗留清零轮续（2026-09-19）：两处真机缺口各留一枚**出口符号/判据级**标记。
  ['结算门 承诺只收 pending（G11）', 'lib/ring-supply.js', "status ?? 'pending'"],
  ['台账读全部卷（G13 轮转失明）', 'lib/pointer-deficits.js', 'readLedgerVolumes'],
  ['归因取样读全部卷（G13 同因）', 'lib/deepsleep-run.js', 'readLedgerVolumes'],
  // 册一至册四（2026-09-19 · docs/distill-admission-plan.md）——「装上去的那份带着本轮能力」的正式证明：
  //   文件 sha 一致 **≠** 特性齐全（本件立件理由），故四册各留一条**词组级**标记（非通用词）。
  ['册一 蒸馏输入面白名单 + 段身份 segKey', 'lib/distill-chunks.js', 'MATERIAL_EVENT_TYPES'],
  ['册三 失败三态水位判据（planSegmentWatermark）', 'lib/deepsleep-core.js', 'planSegmentWatermark'],
  ['册四 重试计数随水位流落盘（segKey/attempt）', 'lib/distill-watermark.js', 'segKey: run.segKey'],
  ['册二 准入判定单一实现（planIngestAdmission）', 'lib/ingest-admission.js', 'planIngestAdmission'],
  // S-P1..P4（2026-09-20 · 深睡/蒸馏触发链四册）——「装上去的那份带着本轮能力」的正式证明。
  //   各留一条**出口符号级**标记（非通用词）：触发/探测判据外移到独立纯函数件（守 core 的导出棘轮）。
  ['S-P2a 睡眠窗口归约（planSleepWindow）', 'lib/trigger-plan.js', 'planSleepWindow'],
  ['S-P2b 探测结论决策表（planProbeOutcome）', 'lib/probe-plan.js', 'planProbeOutcome'],
  ['S-P2b 冲突有界阈值（conflictRound）', 'lib/probe-plan.js', 'conflictRound: c'],
  // 可配置评估通道 M1+M2+M4（2026-09-21 · ACT-283 / ADR-280/284/286/287）——同纪律：**出口符号级**标记。
  //   立件理由同本件头注：「文件 sha 一致 ≠ 特性齐全」⇒ 装上去的那份必须带本轮的**判据与出口**。
  ['评估通道 出网闸（egressAllowed）', 'lib/eval-config.js', 'egressAllowed'],
  ['评估通道 出网判定走解析 hostname（isLoopbackUrl）', 'lib/eval-config.js', 'isLoopbackUrl'],
  ['评估通道 七态归因（EvalOutcome）', 'lib/eval-channel.js', 'egress-denied'],
  ['评估通道 node:http 直连（绕开被 patch 的 fetch）', 'lib/eval-channel.js', 'node:http'],
  ['评估通道 默认关闭 fail-closed', 'lib/eval-config.js', "evalEnabled: z.boolean().default(false)"],
  ['评估通道 阈值随档不共用（EVAL_THRESHOLDS）', 'lib/eval-ledger.js', 'EVAL_THRESHOLDS'],
  ['评估通道 落账只落形态（stateSha8）', 'lib/eval-ledger.js', 'stateSha8'],
  ['评估通道 落账并入统一台账（eval.decision）', 'lib/eval-ledger.js', 'eval.decision'],
  ['评估通道 M4 明细（recent）', 'lib/eval-ledger.js', 'recent'],
  ['评估通道 面板面三路由', 'lib/panel-eval.js', '/eval/stats'],
  /* ACT-295（2026-09-21）：评估通道**面板化 + 模型选择器共用**——装上去的那份必须带这些出口，
   *   否则"文件 sha 一致"会掩盖"UI 其实还是旧代"（本件头注的立件理由）。 */
  ['模型选择器 共享三级实现入产物（modelPicker）', 'lib/client.js', 'modelPicker'],
  ['模型选择器 endpoint 源可枚举（enumerateEndpoint）', 'lib/client.js', 'enumerateEndpoint'],
  ['模型选择器 装载期不调 tr（R4 红线）', 'lib/client.js', 'setShown'],
  ['评估通道面板卡 按需开（renderEvalCard）', 'lib/client.js', 'renderEvalCard'],
  /* ⚠ 探针必须**纯 ASCII**：esbuild 把产物里的 CJK 转义成 `\uXXXX`，中文标记恒不命中
   *   （本轮实测踩到一次：'允许出网 evalEgressAllow' 判缺失）。此处改用代码里的 ASCII 标识。 */
  ['评估通道面板卡 出网许可控件（evalEgressAllow）', 'lib/client.js', 'evalEgressAllow'],
  ['模型路由域 单一事实源（modelConfigSchema）', 'lib/model-config.js', 'modelConfigSchema'],
  ['模型路由域 回落规则单一实现（resolveRoute）', 'lib/model-config.js', 'resolveRoute'],
  ['子代理档位组装单一实现（withEffort）', 'lib/model-config.js', 'withEffort'],
  ['子代理档位真进 spawn（withEffort 调用点）', 'lib/distill-agent.js', 'withEffort'],
  ['深睡档位真进 spawn（withEffort 调用点）', 'lib/deepsleep-run.js', 'withEffort'],
  ['宿主模型目录含档位富化（createLlmCatalog）', 'lib/llm-catalog.js', 'createLlmCatalog'],
  ['任务归类纯函数（classifySegment）', 'lib/distill-agent.js', 'classifySegment'],
  // E-05（2026-09-21）：装上去的那份带着**幂等闸原子占位**（判据 `test-mcl-race.mjs` 9 条守行为；此处守部署面）。
  ['MCL 幂等闸原子占位（E-05 判定在飞标志）', 'lib/mcl.js', 'st.deciding'],
  // M3a/M3b（2026-09-21 · 频率分离）：每步轻判定（零嵌入）+ 环内换向出口，单一实现。
  ['MCL 每步轻判定（planStepJudgement · 零嵌入）', 'lib/mcl.js', 'planStepJudgement'],
  // P2（2026-09-21）：**同一任务的重复捕获不得重置轮级态**（治「先判后 cap」的顺序性重复判定）。
  ['MCL 同轮重复捕获守卫（shouldResetTurn）', 'lib/mcl.js', 'shouldResetTurn'],
  ['S-P3 段级流程状态读口（readSegFlowState）', 'lib/distill-watermark.js', 'readSegFlowState'],
  ['S-P4 自检节拍持久判据（dueSelfCheck）', 'lib/trigger-plan.js', 'dueSelfCheck'],
  ['S-P2b 探测域配置单一事实源（probeConfigSchema）', 'lib/probe-config.js', 'probeConfigSchema'],
  ['五环注册表（kind→环唯一声明 + RING_KPI）', 'lib/rings.js', 'RING_OF_KIND'],
  ['决策环（后果回收 scorecardOf）', 'lib/decision-ring.js', 'scorecardOf'],
  ['关系环（双向兑现率 trustOf）', 'lib/relation-ring.js', 'trustOf'],
  // 门4 册A–C（2026-09-20）：**装上去的那份带着本轮能力** —— 只查符号名不查行为，
  //   行为由 `test-fact-supersede.mjs`（50 条）守；此处确保**部署面**没漏件。
  ['门4 时态剔除落库（applySupersedeOps）', 'lib/fact-supersede-apply.js', 'applySupersedeOps'],
  ['门4 幻觉门（planSupersedeOps）', 'lib/fact-supersede-apply.js', 'planSupersedeOps'],
  ['门4 蒸馏产线接线（runSupersedeChannel）', 'lib/distill-agent.js', 'runSupersedeChannel'],
  ['门4 深睡产线接线（runSupersedeChannelSleep）', 'lib/deepsleep-run.js', 'runSupersedeChannelSleep'],
  ['门4 开关（supersedeApply）', 'lib/scheduler.js', 'supersedeApply'],
  // 承诺结算链（2026-09-20）：册零/一证据门 + 册三待裁决队列 + 册四三态可辨。
  ['承诺册一 执行者可溯（settledBy）', 'lib/relation-ring.js', 'settledBy'],
  ['承诺册三 待裁决队列（overdueCommitments）', 'lib/relation-ring.js', 'overdueCommitments'],
  ['承诺册四 KPI 三态（evidenceMissing）', 'lib/relation-ring.js', 'evidenceMissing'],
  ['承诺册二 结算执行面（op=settle）', 'lib/proposal-apply.js', "op === 'settle'"],
  ['期限窗口判据单一实现（due-window）', 'lib/due-window.js', 'dueSoon'],
  ['联想环（落地率 associationCensus）', 'lib/association-ring.js', 'associationCensus'],
  ['事实环（时态失效 factCensus）', 'lib/fact-ring.js', 'factCensus'],
  ['环事件流（重放 + 对账）', 'lib/ring-events.js', 'reconcileRing'],
  ['Record 事实源（双时间戳 validTo）', 'lib/record-store.js', 'validTo'],
  ['影子写与对账（saveStoreRecords）', 'lib/record-shadow.js', 'saveStoreRecords'],
  // §0r（2026-09-21）：镜像失败**可观测**（原为 `catch{空吞}` + 丢弃返回值 ⇒ 失步与"机制坏了"不可分辨）。
  ['影子镜像失败分类（mirrorFailuresOf）', 'lib/record-shadow.js', 'mirrorFailuresOf'],
  ['读侧候选集（时态剔除 buildCandidates）', 'lib/supply-assembly.js', 'buildCandidates'],
  ['composition root（createComposition）', 'lib/composition.js', 'createComposition'],
  ['P2b 材料块计数（sysBlockCalls）', 'lib/mcl.js', 'sysBlockCalls'],
  ['P2b 开关（materialInSystem）', 'lib/mcl.js', 'materialInSystem'],
  ['P4 存储解耦开关（storeMode）', 'lib/scheduler.js', 'storeMode'],
  ['五环端点处理器（ringsRoute）', 'lib/panel-observe.js', 'ringsRoute'],
  ['组合句柄盒消费（scheduler.current）', 'lib/panel-observe.js', 'scheduler.current'],
  /* ★IR1（2026-09-18）**本轮能力标记**：册一/册二/册三/册四各一枚 —— 判据是"**装上去的那份**带着本轮能力"，
   *   文件级 sha 一致 **≠** 特性齐全（本件立件理由）。每枚对应一个**新增模块的出口符号**。 */
  ['IR1 册一 动态面相关性（relevance-supply）', 'lib/relevance-supply.js', 'selectRelevantLines'],
  ['IR1 册一 注入侧预热（preheatWarmRecall）', 'lib/relevance-supply.js', 'preheatWarmRecall'],
  ['IR1 册二 cue 键唯一实现（cue-space）', 'lib/cue-space.js', 'normalizeCueKey'],
  ['IR1 册三 六槽出账（supplyMetaOf）', 'lib/supply-assembly.js', 'supplyMetaOf'],
  ['IR1 册四 供给戳 + 层归因（supply-stamp）', 'lib/supply-stamp.js', 'layerOfReason'],
  ['IR1 册四 二级上游戳在缓存键上（libStampOf）', 'lib/panel-shared.js', 'libStampOf'],
  /* ★S1R（2026-09-19）**本轮能力标记**：小节寻址单一语义（三态）+ 索引行准入 + 材料侧可见化。
   *   判据同 IR1：**装上去的那份**必须带着本轮能力（文件级 sha 一致 ≠ 特性齐全）。 */
  ['S1R 小节寻址三态裁决（section-ref）', 'lib/section-ref.js', 'resolveFromTitles'],
  ['S1R 索引行准入单一强制点（admitIndexRow）', 'lib/section-ref.js', 'admitIndexRow'],
  ['S1R 一行多指针提取（pointersOfRow）', 'lib/section-ref.js', 'pointersOfRow'],
  ['S2S3 册零·库级单写者锁（bank-lock）', 'lib/bank-lock.js', 'acquireBankLock'],
  ['S2S3 册零·唯一写入原语（section-rewrite）', 'lib/section-rewrite.js', 'atomicWriteFile'],
  ['S2S3 册一·L2 会话复盘内核（session-review）', 'lib/session-review.js', 'runSessionReview'],
  ['S2S3 册一·L2 复盘运行时接线（hooks 同节拍）', 'lib/distill-hooks.js', 'session review'],
  ['S2S3 册二·S3 三通道停产（s3Produce 缺省 false）', 'lib/deepsleep-apply.js', 'produce-off'],
  ['S2S3 册二·精要层释放**接线**（默认关闭 · fail-closed）', 'lib/deepsleep-run.js', 'SHOUCANG_RELEASE_AUTO'],
  ['S2S3 册二·语义门可执行性判据（executable）', 'lib/deepsleep-run.js', 'essence-release'],
  ['S2S3 册四·睡眠汇报 + 影响账（sleep-report）', 'lib/sleep-report.js', 'writeSleepReportFromLedger'],
  ['S2S3 册二·自动执行开关双通道（持久配置 ∪ env）', 'lib/deepsleep-run.js', 'liveAutoSwitch'],
  ['S2S3 册二·L2 提案执行面（默认关闭 · 先留档再改）', 'lib/proposal-apply.js', 'applySessionProposals'],
  ['S2S3 册二·提案幂等账（applied.jsonl）', 'lib/proposal-apply.js', 'applied.jsonl'],
  ['S2S3 册四·注入源改派生（latestDerivation 单一实现）', 'lib/sleep-report.js', 'latestDerivation'],
  ['S2S3 册四·报告指纹账（"永不删除"判据载体）', 'lib/sleep-report.js', 'sleep-report-ledger.jsonl'],
  ['S2S3 册四·问题双字段（首次观测 / 仍未真读）', 'lib/sleep-report.js', 'unusedAtFirstObservation'],
  ['S2S3 册四·L2 触发阈值可调 + 登记（G16）', 'lib/scheduler.js', 'reviewIdleMs'],
  ['S2S3 册四·只读路由 睡眠汇报 + 问题统计', 'lib/panel-observe.js', '/sleep/issues'],
  ['S1R 材料侧输入量可见化（sectionRefDropped）', 'lib/deepsleep-materials.js', 'droppedMissing'],
  ['S1R 材料侧歧义保留（ambiguousKept）', 'lib/deepsleep-materials.js', 'ambiguousKept'],
  ['S1R 深睡审计带小节寻址计数', 'lib/deepsleep-run.js', 'sectionRefDropped'],
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
