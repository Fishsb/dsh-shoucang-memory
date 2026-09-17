#!/usr/bin/env node
// check-runner.mjs — 检测件统一运行器（审查 F6 · M 档护栏）
//
// 问题：同一批检测件被多个入口调用，但**退出码口径不一**——`sleep-selfcheck` 把 exit 3 当「依赖缺失 ⇒ 跳过」，
//   而 `npm test` 的 `&&` 链把任何 exit≠0 当失败并中断。同一份检测件在两种入口下判读不同，会让人对"到底过没过"失去信任。
// 契约（ADR-132）：退出码语义，**本运行器是唯一实现方**：
//     exit 0 = pass（全部通过）
//     exit 3 = skip（诚实跳过：依赖缺失，不算失败）
//     exit 4 = xfail（存在**已知未修**的预期失败；不判失败，但**必须可见**）
//     其他    = fail
//
// ⚠ exit 4 是**已被占用的码位**（2026-09-12 archi 实测）：运行时脚本
//   `skill/scripts/memory-append.mjs:33`、`memory_write_gate.mjs:178`、`read_section.mjs:22` 都在用 4。
//   ⇒ 本运行器**绝不能**把 4 一律判 xfail：那样任何已登记件一旦因**真实失败**退 4，
//     就会被渲染 `⚠ xfail` 且不计入 failed ⇒ **真实失败被静默降级**。
//     这正是本轮一直在剿的病——**把「坏了」显示成「没那么坏」**。
//   ⇒ 故 4 采**声明制**：只有登记为 `{ xfail: true }` 的件退 4 才判 xfail；
//     **未声明件退 4 一律判 fail**。这让「允许某件存在未修缺陷」成为**显式决定**——
//     谁想加第二条 xfail 必须显式登记，进得了 review，不能靠退出码偷偷混进来。
//
// emitter（检测件）侧的义务，与上面一一对应，**别只实现一半**：
//   · 退 4 的前提是「**有 xfail 且没有任何真实断言失败**」；
//   · 一旦某条 xfail **意外变成 XPASS**（缺陷被修了、或被绕过），emitter 必须退 **1（fail）**，**不是 4**
//     —— 这是双向锁的另一半：只锁「FAIL 也接受」等于把未修缺陷正当化成绿（= skipped）；
//       只锁「PASS 判 FAIL」等于制造永久红灯。两端都锁，4 这个码位才有意义。
//
// 渲染三条硬约束（2026-09-12 team-lead 裁定，改动时不要退化掉）：
//   ① xfail 的字形**不得**与 ✅ 相混淆（用 ⚠，不用 ✓/✔）——人扫终端只看图标，
//      长得像 PASS 的话这个码位等于白加；
//   ② xfail 计数为 **0 时也要显示**（写 `0 xfail`，不得省略）——省略后读者分不清
//      「没有 xfail」与「runner 没统计 xfail」，后者是本件最怕的静默失效；
//   ③ 本运行器必须**自证能识别 4**（见文件末「反向证伪」说明）：加了码位但渲染分支没接上，
//      是一个「加了等于没加」的静默洞，与假绿同型。
//
// 运行行为：· 逐件运行并按其退出码归类；· 打印统一摘要（xfail 单独成段）；
//   · 任一 fail ⇒ 自身 exit 1；全 pass/skip/**xfail** ⇒ exit 0（xfail 不判失败）。
// 用法: node scripts/check-runner.mjs [--json]
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { basename } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
// 参与 test 链的检测件/测试件（顺序=依赖顺序：判据→载体→字段→分层→行为测试→红线→部署面→变更日志）
// 2026-09-11（测试清单收敛）：此前 `npm test` 的 && 链与 CHECKS 是**两份零重叠的清单**，
//   新增测试件无处登记（既不在 CHECKS 也不在 npm test）⇒ 写了也可能永远不跑。
//   现统一纪律：**行为级测试件一律进 CHECKS**（本运行器是唯一清单），npm test 只跑本运行器。
// 2026-09-12（N1 纪律执行化）：上面这条纪律**文本本身没有执行力**——立完之后，
//   `test-deepsleep-verdict.mjs`（G-16 的 36 条断言）、`test-watermark-guard.mjs`（G-20）、
//   `test-atomic-write.mjs`（D3 原子性 29 条断言，且从未 git add）三件仍然既不在 CHECKS 也不在 npm test，
//   等于 G-16 的断言一条都没跑过。故本次把全部行为级测试件登记进本清单，并把 `npm test` 退化为
//   只跑本运行器：**只有一个入口，就不存在"登记在另一份清单里"的漏网件**。
//   新增件**必须**登记在此；登记了但文件不存在 ⇒ 判 FAIL（不是静默跳过）。
// 每项格式：[相对仓根的脚本路径, ...argv, { 选项 }]。
//   · argv 中的 '__ROOT__' 会替换为仓根绝对路径（供需要根路径的检测件使用）；
//   · 末位的**选项对象**可选，目前唯一支持的选项是 `{ xfail: true }`——
//     声明该件允许用 exit 4 表达「已知未修」；**未声明件退 4 一律判 fail**（理由见件头「exit 4 是已被占用的码位」）。
const CHECKS = [
  ['scripts/check-criteria.mjs'],
  // J1（2026-09-15）**判据裁决机制（judgeKind）**：每条 criteria 必须声明
  //   `deterministic | vector | llm`，且**必须透传到投影**（TS `CRITERIA_ROWS` + md 判据表的「裁决机制」列）。
  //   判因（实证）：该字段首次落地时 `gen-criteria.mjs` 的 CRITERIA_ROWS **显式只映射
  //   {id,domain,kind,text,params}** ⇒ judgeKind 被**静默丢弃**，而没有任何地方会报错 ——
  //   这正是仓内反复踩的"静默失效"型缺陷（注册表写了、投影没有）。断言 ④ 另守
  //   「`deterministic` 判据不得引用语义相似类参数键」（把模糊判断写成阈值的自我矛盾）。
  //   `--selftest` 用合成违规输入证明四条断言都会红（防恒真），已实测 8/8。
  ['scripts/check-judge-kind.mjs'],
  // J1（2026-09-15）**阈值登记制**：任何影响「接受/拒绝/归类/取舍」的数值阈值都必须登记进
  //   `criteria.json#thresholds`，且登记项须含 预注册判据 + 校准样本数 + 结论 + 复检触发 + `probe`。
  //   判因（实证）：全仓 8 个相似度阈值**只有 1 个有过预注册校准**（`mclFamiliarThreshold`），
  //   其余从未验证过 —— 而"没人验证过阈值"正是 `recall-diagnose` 给出**与数据相反方向**的根因。
  //   `probe` 守「改了代码/注册表却忘改登记」的漂移（同 `check-criteria` 的纪律）。
  //   当前登记 13 项，**12 项 samples=0** —— 把欠账**制度化可见**，而不是藏在代码常量里。
  ['scripts/check-threshold-registry.mjs'],
  // S-P2（2026-09-16）**纪元日志隐私红线**：转录里的工具参数**必然带项目路径与专名**，
  //   采集层一旦落 arguments 原文，隐私面立即漏（且该日志随后进深睡材料 ⇒ 进一步外溢）。
  //   三向判据：① **字段白名单**（只允许 t/sid/tool/n —— 任何新键即红，防"以后顺手加 args"）
  //   ② 值形态（日期/短码/ASCII 工具名/正整数）③ 全文探针（盘符/UNC/家目录/邮箱/项目根零命中）。
  //   `--selftest` 用合成违规样本证明三向**都会红**且干净样本不误报（实测 7/7）。
  //   日志未生成时退 3 ⇒ 本运行器判 **skip**（尚未跑过采集器，不算失败）。
  ['scripts/check-journal-privacy.mjs'],
  // P3（2026-09-16）**R1 有效性度量（基数：有效方向数）**：交付第一个可算代理 ——
  //   **互不重复方向数 + 重复数**（后者是 R2 可压缩空间的直接度量）。自带四向断言：
  //   ① **两实现互核**（正则逐行 vs 状态机扫描全部 →）② 幂等（连算两次同值）③ 非零 ④ 字符账自洽。
  //   `--selftest` 在夹具上双向可证（含"不同标签不误并"反例）。
  //   ⚠ **互核纪律当场抓到过我自己的 bug**：implB 首版只取**第一个** `→` ⇒ 概况里混入箭头时整行被丢，
  //     与 implA 不等价 ⇒ ① 红。修好后 115 条一致。**这就是"两实现互核"存在的意义。**
  //   ⚠ **口径限制（实测发现，已在 OPEN-ITEMS 记录）**：本件的"重复"定义在**索引行内部**，
  //     而**精确重复早被写门唯一性硬门挡住** ⇒ 实测 **重复 = 0**。R2 的可压缩空间须改用
  //     **跨形态冗余**（索引行 ↔ 无标签叙事行）来量 —— 属下一轮口径扩展。
  ['scripts/effective-directions.mjs'],
  // S-P4（2026-09-16）**跨粒度收敛（R2-A）**：**行为级**测真临时库写入（非源码文本断言）。
  //   六向：① **成对取证**（coarse/fine 都逐字 ⇒ applied；任一不逐字 ⇒ skipped）② 形态门（fine 无标签 /
  //   coarse 有标签 / 不同行）③ **配额 ≤3** ④ **归档可回滚**（`audit/converge/` 落整行原文 + 并入的粗行）
  //   ⑤ **幂等**（重复提交第二次 skipped）⑥ file 越界。
  //   判因：它动的是**画像文件的行**，而 `forgetOps` 有"画像文件不得 archive"的 R1 硬保护 —— 语义不同故另立通道，
  //   但**复用其纪律**：绝不直删、归档可回滚、每轮配额。
  ['scripts/test-granularity-converge.mjs'],
  // S-P4e（2026-09-16）**注入侧跨形态消重**：**行为级**（真临时库，**不依赖向量服务** ——
  //   向量路径用「未配置 ⇒ fail-open」分支覆盖）。四条判据：① 不重复注入（逐字移除 + 行序不变）
  //   ② **库文件内容未变**（本件纯读）③ **误判可解释**（每条 skip 带 by + sim）④ **关闭即逐字节回基线**
  //   （`skip` 空 ⇒ 输出 === 输入，Buffer 级相等）。顺带守：子串不算命中 · 幂等 · 预热前状态为空。
  //   ⚠ 该测试当场抓到过一个真缺陷：集合用**未 trim** 条目构建而文本侧 trim ⇒ 不对称、不命中。
  ['scripts/test-inject-dedup.mjs'],
  // S-P5c（2026-09-16）**精要层释放（计划侧）**：⚠ **测的是"计划"，不是"释放"** ——
  //   遵 [原则] 契约须描述现状：不可逆的执行须先具备三件保护（语义复核 / 归档可回滚 / 未自足零释放），
  //   **尚未实现** ⇒ 不写进断言、也不假装已具备（用例末尾如实印出该边界）。
  //   六向：① **射程**（候选只来自 `AGENT.md`；索引/画像文件的行即便字面自足也不入）② 判据门（未自足 ⇒
  //   blocked，**永不入候选**）③ **零写入**（跑前后逐字节相同 —— "计划"与"执行"分开的直接证据）④ 幂等
  //   ⑤ 缺件如实记"未判" ⑥ 阈值边界（恰 12 字入候选 / 11 字被拦）⑦ 判据**单一事实源**。
  ['scripts/test-essence-release.mjs'],
  // 深睡探针「**父转录无增长但子代理在跑**」判据（2026-09-16）：深睡父会话 await 8 个子代理期间**本就不写
  //   自己的转录** ⇒ 只看父转录，"正常等待"必然满足「连续 confirm 轮无增长」⇒ **stall 是系统性的**
  //   （实测 32 条 stall 的 `idleMin` 全为 58–66 分钟，含**仅触发数分钟**的新会话 ⇒ 基准陈旧）。
  //   判据与 `distill-parent.ts:44/#hasActiveSubagents` 的 **live 枚举通道**同源。
  //   **先红后绿**：入口 A（本会话子代理 running ⇒ long-run）在修复前必判 `stall` ⇒ 必红。
  //   ⚠ 并用 **B/C/D/E 反向自证护栏未削弱**（无子代理 / 子代理空闲 / 归属别人 / 非 subagent 来源 ⇒ 仍判 stall）。
  ['scripts/test-deepsleep-probe-children.mjs'],
  // J3/U1（2026-09-16）**召回零命中归因升级**：判据 =「LLM 归因与**细校准结论**的一致率」。
  //   ⚠ 本件测的是**归因层三件纯函数**（请求构造 / 严格解析 / 一致率）；**LLM 调用点未接线** ⇒
  //     一致率**尚不可测**（用例末尾如实印出该边界，遵 [原则] 契约须描述现状）。
  //   **先红实证已钉成断言**：确定性计数法给 `lower`，而注册表 `surface.mcl.note` 的细校准结论是
  //     `maintain`（维持 0.55 不改）⇒ **基线一致率 = 0**；若哪天计数法被改成与校准一致，此处会红 ⇒ 提醒复核。
  //   另守：请求**必须带对账依据**（否则 LLM 只会另给方向、一致率仍为 0）；解析**严格**（枚举越界/非 JSON ⇒ null，
  //     不兜底成 maintain）；**未判不计入分母**（否则"没解析出来"会稀释一致率，把失败伪装成"部分一致"）。
  ['scripts/test-recall-attribution.mjs'],
  // J5/U3（2026-09-16）**检索收益判定升级**：方案册 §3.3 —— "这次检索是否产生实质进展"是**语义判断**
  //   （本仓行动级判据「连续 2 次无实质进展即停下回溯」的机器化），却被降维成 `zeroGain >= 2` 计数。
  //   本件测**纯三件**（请求构造 / 严格解析 / 语义换向判定）+ **先红（差距实证）**：
  //     同样两轮未引用 —— 计数法判"该换向"、语义判"不该换向" ⇒ **结论相反**（计数看不见"没引用但帮上了"）。
  //   另守：请求必须写明「**未被引用 ≠ 没帮上**」并带**后续动作**（否则 LLM 只会复述计数）；
  //     解析**严格且整批原子**（数组/数值 i/helped 只接受 true|false|null；任一项不合法 ⇒ 整体 null）；
  //     换向**保守**（只有明确 false 累积，`true` **与未判 null** 都打断链 ⇒ 不因解析失败误换向）。
  //   ⚠ 与 J3 同节奏：**LLM 调用点未接线**（下一轮），故不打判据机制标记（避免"假旋钮"）。
  ['scripts/test-recall-yield-llm.mjs'],
  // S-P1a（2026-09-15）**睡眠纪元身份**：纪元 = 上次睡眠成功 → 本次睡眠成功，**既是触发单位也是度量单位**
  //   （R1 以它为样本）。守三件：① `epochIdOf` 形状/唯一/有序 + **生成器产出者必过 `EPOCH_ID_RE`**
  //   （初版正则要求 ≥10 位，而 `epochIdOf(1)` 产出 `epoch-1` ⇒ 生成器能产出自己校验不过的 id
  //   ⇒ "单一实现"当场破功，已放宽并留记录）；② `DeepSleepStatus.currentEpoch` 初值必须 `null`（不伪报）；
  //   ③ **三处 `kind:'deep-sleep'` 审计全带 `sleepEpoch`**（正常 / no-parent / 异常 —— 少一处即某种
  //   结束路径丢失纪元归属）。⚠ ③ 是**源码文本断言**（强度弱于行为断言，仓内有 `test-wiring-gate` 先例）；
  //   行为级证据由**真机手动触发**补齐。判据已**双向变异实证**：改名 `sleepEpochXX` ⇒ 0/3 红；
  //   删字段 ⇒ 0/3 红（初版用裸子串匹配，对"改名"变异**失明**，已加固为键形式 `\bsleepEpoch\s*:`）。
  ['scripts/test-epoch-identity.mjs'],
  // S-P1b（2026-09-15）**双维水位（时间 ∨ 内容）**：判据是 `planTriggerDim` 纯决策表 + `windowMaterialBytes`
  //   真文件度量。守四件：① 时间到 ⇒ time；② 时间未到但内容达阈 ⇒ **content**（本维新增）；
  //   ③ 都未到 ⇒ none；④ **回归保护** —— `contentMin<=0`（缺省关）时判定必须与**改造前的纯时间判据
  //  逐分支等价**（穷举 51 例）。判因：缺省 `contentMinChars=null` ⇒ **零行为变化**是本节能自主推进的前提。
  //   ⚠ 为什么测决策表而非端到端触发：真实触发还要求 `hottest > lastDeepSleepAt`，而机器水位在装配时
  //   被初始化为 `Date.now()` ⇒ 单测无法把它倒回过去。抽纯函数后决策表可**穷举**——
  //   同 `planDeepSleepVerdict` 的仓内范式。
  ['scripts/test-epoch-watermark.mjs'],
  // S-P1c（2026-09-15）**材料分片**：`splitByCap` 纯切分器 —— 贪心装片 ≤ cap · **永不切开单段**
  //   （单段超限独占一片）· **保持段序**（顺序即材料优先级）· `cap<=0` ⇒ 单片段、与改造前**逐字等价**。
  //   ⚠ 本册**偏离方案册两处**（已在 `criteria.json#thresholds` 登记）：① "按语义边界切"由**结构**满足
  //   （材料本就按面分段 ⇒ 段边界即语义边界，不引入 embedding 求相似度低谷）；② "水位按片推进"改为
  //   「**全片落地才推进**」—— 单一时间戳水位表达不了片级进度，片级推进会**永久排除失败片的材料**
  //   （G-16/G-19 两次修掉的静默丢料）；片级进度由 ledger 可见，失败即整纪元回滚重试。
  ['scripts/test-epoch-chunk.mjs'],
  // S0 内容类型契约（2026-09-14）：守「契约 ⟷ 代码事实」一致 —— 核心断言是
  //   `reachable:true` 的类型必须在 src/ 存在对应消费通路实现。此前「某类信息能否被消费」
  //   只能靠人读代码推断（105 条环记录长期不可达即因此无人发现）。
  ['scripts/check-content-types.mjs'],
  // S4-9（2026-09-14）**注入抵达面**：正面断言「模块输出是否真的进注入文本」——
  //   补的是全仓唯一一类空缺：所有架构门都是**负面约束**（不许有环 / 不许超行数），
  //   没有一道问"这东西的输出到底有没有到用户眼前"。实测假绿即 `supply-assembly` 被记
  //   「已接线（P0a）」而核心输出只进 `/inject/stats` 诊断面。
  ['scripts/check-injection-reach.mjs'],
  // S4Z（2026-09-14）**节范围口径单一实现**（G-22 的**真修**）：守 `treeops` 内「手写 level 过滤」只允许
  //   1 处且必须落在 `scopeOf` 内 —— 只给 merge 补 filter 是**补丁**（下一处新 op 仍会漏），
  //   本门让第三处**不可能**再漏。G-22 曾造成已落盘的树结构破坏（整节消失 + 跨容器搬运 + 孤儿空容器）。
  ['scripts/check-treeops-scope.mjs'],
  // S4Z（2026-09-14）**共享纯函数单一实现**：由"补丁 vs 真修"审查发现三对静默复制
  //   （`coreName`/`biContains` 在 treeops 与 deepsleep-tree 各一份 · `dayKey` 在 activity 与
  //   deepsleep-materials 各一份），**根因是导出边界**（前二者私有 ⇒ 用方只能复制）。
  //   本门让**第四处**不可能再悄悄出现 —— 复制是静默的，此前没有任何门会红（它一上线就抓到
  //   人工审查漏掉的 `panel-memory#dayKey` 同名不同义）。
  ['scripts/check-shared-fn.mjs'],
  // S4Z（2026-09-14）**公开树纯净**：规则 2「推送前确认公开树纯净」此前**只是口头纪律** ⇒ 实测因此
  //   漏了 **8 件含个人信息的文件**，且**全部已在远端公开**（最早 2026-09-08）。
  //   本门把该纪律变成机检：编码感知（实测踩过 UTF-16LE 漏扫的坑）+ URL 剥离 + 反例自证。
  ['scripts/check-public-tree.mjs'],
  // S4Z/S4Y（2026-09-15）**对拍归一化的双向自证**：`inject-baseline-diff` 的 normalize 决定该门
  //   在活跃系统里能否使用 —— 太窄 ⇒ 假红（实测漏了 `[环·…]` 环记录段）；太宽 ⇒ 假绿。
  //   本件从被测脚本**原样提取** normalize（不是另写一份），双向各锁 4 条。
  ['scripts/test-inject-baseline-normalize.mjs'],
  // UI1/U0（2026-09-15）**前端终于有门了**：此前 `src-client/` **零门禁** ⇒ `body.js` 长到 5476 行无人知，
  //   且**连语法错误都不检查**（后端有 tsc，前端什么都没有）。两件互补：
  //   · check-ui-components —— 组件库 import ↔ 字面量使用**双向**对账（vendor.js 头注早有该约定，无机检）；
  //   · check-client-syntax —— 解析可读性（两种模块形态都试：ESM 的 entry/vendor 与 IIFE+CJS 的 body）。
  ['scripts/check-ui-components.mjs'],
  ['scripts/check-ui-components.mjs', '--selftest'],
  ['scripts/check-client-syntax.mjs'],
  // UI1/U2-B（2026-09-15）**分区块规模门**：U2「拆 7 个 pane 文件」的前提经三次实测证伪
  //   （首刀依赖 20 符号 · 应用层拖 5 符号 · refs 跨壳层与视图层 · factory 注册契约不可外移，
  //    外移实测致插件完全不加载：75 条渲染断言全挂且无页面错误）⇒ 改判据为
  //   「\`factory\` 内分区块 + 守每区块行数 + 守覆盖完整性」。
  //   **两个防绕过断言**（各有反例自证）：节数下限（防"合并标记"）· 无主区域（防"删标记"）。
  ['scripts/check-pane-sections.mjs'],
  ['scripts/check-pane-sections.mjs', '--selftest'],
  // UI1/U2（2026-09-15）**共享句柄注入位置门**：实测两个方向都踩过 ——
  //   注入太晚（调用早于注入）⇒ pane 静默空掉；注入太早（var 无提升值）⇒ 注入 undefined。
  //   断言用 AST：每个 appState.X = Y 的 Y 必须已声明且早于注入，且注入在 return 之前。
  ['scripts/check-inject-order.mjs'],
  ['scripts/check-inject-order.mjs', '--selftest'],
  // UI1/U5-b（2026-09-15）**拆分等价性证据门**：U2 把 24 个 render 迁到 9 个 pane 后，
  //   事后无法取"拆分前"DOM ⇒ 改为**证明两个渲染门确实能抓到拆分破坏**（先红后绿可信度）。
  //   ⚠ 本件会临时改源码 + 重建产物（约 1-2 分钟），finally 中逐字节还原。
  ['scripts/test-split-equivalence.mjs'],
  // UI1 收尾（2026-09-15）**pane 自由标识符全量审计**：人工视觉复核抓出深睡页
  //   「加载失败: dsFmtTime is not defined」——而构建/几何门/契约门/A5 **四门全绿**。
  //   本件把每个 pane 的自由标识符按「内建/本文件已声明/已 import/pane 导出/服务/别处定义/全仓无定义」
  //   逐类判定，**说不清来源即 FAIL**（附 3 条反例自证）。
  ['scripts/audit-pane-deps.mjs'],
  ['scripts/audit-pane-deps.mjs', '--selftest'],
  // UI1/U5-a（2026-09-15）**行为级证据**：`test-route-schema` 只证明"坏请求被 400 拦住"，
  //   **从未验证合法请求的副作用**（真的写进去、能读回）。而 U1/U2 要大规模拆分前端
  //   （`body.js` 5476 行 → 7 个 pane），"拆分后行为不变"必须有行为证据 —— `ui-geo-regress`
  //   只测几何与组件承载（实测 submit/fetch/POST 全为 0），缺口由此件补。
  //   **零副作用设计**：读原文 → 写回**同样内容** → 再读比对（无恢复步骤 = 无恢复失败风险）。
  ['scripts/test-save-roundtrip.mjs'],
  ['scripts/check-carriers.mjs'],
  ['scripts/check-field-usage.mjs'],
  ['scripts/test-layering.mjs'],
  ['scripts/test-carrier-layers.mjs'],
  ['scripts/test-forgetops.mjs'],
  ['scripts/test-treeops-split.mjs'],
  ['scripts/test-mcl.mjs'],
  ['scripts/test-deepsleep-verdict.mjs'],
  // 深睡层接线契约（P1 一/二期拆分后的行为安全网）：typecheck 只证明类型对，
  //   证明不了「东西还在、还跑得起来」。本件用全 mock ctx 装配 createDeepSleep，
  //   验 9 个句柄齐备 + 状态机真跑 + 实例隔离（状态没被提到模块级）。
  ['scripts/test-deepsleep-wiring.mjs'],
  // scheduler 装配契约（applyScheduler 拆分后的行为安全网）：5 个工具在册且名字未变 /
  // 开关语义（verify_enabled）/ share 装配面字段 / 蒸馏器关闭时 share 仍装配。
  ['scripts/test-scheduler-wiring.mjs'],
  // S3-1（2026-09-14）**两链独立启停**：守「关蒸馏只断其触发入口、**必须保留 distillAgent**」——
  //   深睡以它为归纳回调，若整体 no-op 会让维护链失去归纳能力（正是 S3 要修的"反向不独立"）。
  ['scripts/test-chain-independence.mjs'],
  // S3-2（2026-09-14）**深睡空转可见化**：守聚合口径 —— 有产出 / 空转 / 异常 / **旧格式**四类分清，
  //   且旧格式单列**不混入分母**（否则把"当年没记"误算成"空转"或"有产出"）。
  ['scripts/test-sleep-summary.mjs'],
  // S3-6（2026-09-14）**深睡当前阶段**：守 `phase` 七值互斥可达、优先级正确、且值全落在类型枚举内
  //   （此前 UI 只有一堆计数，排障靠人拼字段 ——「深睡被阻塞 >24h」正是这样被漏掉的）。
  ['scripts/test-deepsleep-phase.mjs'],
  // S4-2（2026-09-14）**三层判据常驻**：守判据三层齐全、合计 <200 字符、开关进缓存键、回滚通道可用。
  //   为什么用源码断言：`panel-shared.ts` 的导出数**已达 audit-architecture 的棘轮上限（35）**，
  //   从其导出常量会把该门禁顶红 ⇒ 按仓内先例（`check-arch-sync` 亦为源码文本断言）在源码面守。
  ['scripts/test-memory-playbook.mjs'],
  // S4-6′（2026-09-14）**召回零命中归因口径**：守 `recallMissReasonOf` 的**判定顺序与边界**与
  //   `mcl#decideTurn` 的 `fast` 判定同序同界（尤其 `sim === threshold` 必须给 `ok`）。
  //   为什么必须有：S4-7（两条件分流）**要拿这份诊断去定判据** —— 口径错了整条线都错。
  //   注：诊断工具 `recall-diagnose.mjs` 是**报告态**（同 `criteria-report` 类），不入 CHECKS。
  //   同批报告态件（**不入 CHECKS**，理由同上）：`count-memory-lines.mjs` —— 记忆库「一条」的**规范计数口径**
  //   （2026-09-15 P0.2 立；起因：同一 AGENT.md 曾有三份互相矛盾的计数）。⚠ 其**首版口径算错过一次**：
  //   把"画像行"定义为 `- ` 开头（不看标签）⇒ `AGENT.md` 的 10 条**无标签叙事行**被算进画像行、叙事恒 0，
  //   与该文件逐行实读（10 条）矛盾 ⇒ 收窄为"`- ` 开头**且含标签**"，复算得 索引 112 / 画像 6 / **叙事 35**。
  //   ⇒ 这正是一条被 ground truth 证伪后立即收窄的判据（"先红后绿"），故把口径连错法一并留在件头。
  ['scripts/test-recall-diagnosis.mjs'],
  // S4-1（2026-09-14）**预算口径单一实现**：守 `supply-assembly#budgetOf` 与**改前手写公式逐式等价**
  //   （内联旧公式作夹具比对 12 组总预算）。为什么等价性是门禁：口径统一**不得改变任何数值**，
  //   否则注入文本会跟着变 —— 而"文本不变"正是本项能自主推进、无须产品决策的前提。
  ['scripts/test-budget-single.mjs'],
  // S4-5（2026-09-14）**情境槽额度自适应**：守 `adaptiveTopN` 的三条纪律 —— **只数环记录**（md 投影行
  //   不得计入，否则"库大"被内容面虚增）、**次线性 + 双向钳位**（小库零变化 / 大库不撑爆）、**可回滚**。
  //   判因：`topN` 固定 3 而库内环记录 105 条 ⇒ 命中率天花板 ≈3%（"库越大，经历面越稀释"）。
  ['scripts/test-situation-quota.mjs'],
  // S4/D1（2026-09-14）**检索收益与停止准则**：守"**合规必须归零**"（否则长跑会把"曾经失败过"
  //   永久累积成"永远该换向"）、阈值语义（达 2 次即出 `switchSource`）、以及合规率**必须有分母**。
  //   判因：人类按边际价值停止检索（`human-task-loop` §1.3），而本插件此前**无任何停止判据**。
  ['scripts/test-recall-yield.mjs'],
  // S4-3（2026-09-14）**中层 process 槽**：守"缺省零行为变化"、只取声明标签（`[原则]` 不得混入）、
  //   去重 + topN 有界。判因：三层里**中层是唯一没有专用通路的层**，`[路径]` 会被内容相关性挤掉。
  ['scripts/test-process-supply.mjs'],
  // S4R/R0（2026-09-14）**注入文本逐字节回归**：真机 `/inject/preview` 多 case 对拍基线 ——
  //   这是仓内**第一条守「注入文本」的门**（此前该层无任何守护，用户可见文本变了只能靠人发现）。
  //   宿主未运行时 exit 3 ⇒ 判 **skip**（不判失败）；基线在 `_memory/`（含真实记忆内容，不进公开树）。
  ['scripts/inject-baseline-diff.mjs'],
  // S4R/R1（2026-09-14）**渲染等价化**：守 `renderSupplyText` 的新选项足以逐字节复现主路径形态，
  //   且**缺省行为与 R1 之前相同**（共享接口只做增量扩展）。**X1 是「先红」用例** ——
  //   它断言"缺省选项 ≠ 主路径形态"，即**先证明两套渲染确实不同**，再谈消解（验收方案 §0 的强制要求）。
  ['scripts/test-render-opts.mjs'],
  // S4R/R2（2026-09-14）**账 == 真实裁切**：真机互核 `supplyUsage.kept` 与注入文本的 `- ` 行数、
  //   且核"被丢的行确实不在文本中"。判因：旧账是"按装配器口径重算的**近似值**"（实测虚报 6 vs 真实 1）。
  ['scripts/test-usage-truth.mjs'],
  // S4R/R3（2026-09-14）**D2 判据重定**：守调参方向**由 `missReason` 分布推导**（非写死），
  //   核心是 C2 的**反例自证** —— 同一总量、不同分布 ⇒ 结论必须不同（否则判据无区分力）。
  ['scripts/test-recall-advice.mjs'],
  // 面板路由契约（拆 applyPanel 前的**安全网**，先建网再动刀）：34 条路由在册且未改名 /
  // 无未登记新路由 / 无重复注册 / 只读端点真能响应 200 / webServer 缺失时降级不抛。
  ['scripts/test-panel-wiring.mjs'],
  ['scripts/test-watermark-guard.mjs'],
  // 阶段 2（2026-09-14）**产线流程实例**单测：水位行**纯增量**扩展出 `runId`/`phase`/`attempt` 后，
  //   钉死三件不能靠"看着对"的事 ——
  //   ① **旧行兼容**：磁盘上 v18 之前的历史行没有新字段，必须能读且 `phase` 回落 `unknown`
  //      （不回落会被判成"运行中"，升级后首次读就把历史会话全打错）；
  //   ② **不传 run 时输出逐字段等同旧格式**（否则等于偷偷改了所有写入点的行为）；
  //   ③ **崩溃在 spawn 时续传边界不变** —— 本次改动唯一可能引入回归的点
  //      （多写了一条同 seq 的水位行，若它改变"末行生效"的结果，续传就错位了）。
  ['scripts/test-run-instance.mjs'],
  // 注入缓存层（2026-09-14 立 · 两次踩坑后补）：阶段 1 的三条介质签名原本接在 120s 的
  //   `stableKey` 上，而把关**整段文本**的是 `cacheKey`（30s）⇒ 症状「**缓存失效了、输出没变**」，
  //   **正向测试天然看不见**。故本件判据一律落在**输出**上，并含结构断言（签名层 + 介质集）。
  ['scripts/test-inject-cache.mjs'],
  ['scripts/test-atomic-write.mjs'],
  // D-M5（2026-09-17 登记）：台账体积轮转 + 跨档读的行为测试，含反例自证（**只读主档 ⇒ 行数显著变少**）。
  //   必须登记：轮转的失效模式是**静默**的（写侧轮转、读侧没跨档 ⇒ 看起来像"数据丢了"），
  //   而门禁不读台账 ⇒ 只有本件能验它（AGENTS 规则 6：未登记 = 等于没写）。
  ['scripts/test-ledger-rotation.mjs'],
  ['scripts/test-wiring-gate.mjs'],
  ['scripts/test-wiring-gate-ast.mjs'],
  // 绑定句柄调用形态（2026-09-14 立，实锤后补）：`create*Api` 的绑定句柄只能经依赖面调用，
  //   写成宿主对象方法（`agent.armIdleTimer(...)`）必然 TypeError。此前该形态在 `distill-hooks.ts`
  //   存活两天、被 `catch { }` 吞掉 ⇒ 空闲蒸馏全链失效，而 typecheck/单测/wiring 门禁**全绿**
  //   （都不覆盖该调用点）。配套 `--selftest` 反向证伪（坏形态判红、依赖袋形态不误伤）。
  ['scripts/check-agent-methods.mjs'],
  ['scripts/check-agent-methods.mjs', '--selftest'],
  // 空闲蒸馏「武装」步的行为契约（2026-09-14 实锤后补）：用全 mock ctx 真发一次 turn/end，
  //   断言「状态机记 ENDED + 注入面被武装」同轮闭合、异常必须留痕、子代理/非 completed/不在册三种
  //   情况不武装。静态形态门禁（上一条）只能证明"没写成宿主形态"，证明不了"这一行真的跑到了"。
  ['scripts/test-idle-arm-wiring.mjs'],
  ['scripts/test-treeops-rm.mjs', { xfail: true }],
  ['skill/scripts/test.mjs'],
  ['scripts/check-hardcode.mjs', '__ROOT__'],
  // S4 路由契约（2026-09-13）：契约生效（缺必填/类型错 ⇒ 400 且不进入 handler）、
  //   合法请求不被误伤且 handler 仍能读到完整 body（校验先读流 ⇒ 必须缓存），无契约路由行为不变。
  ['scripts/test-route-schema.mjs'],
  // S4 路由契约漂移门禁（2026-09-13）：契约表 ⟷ 实际注册双向一致；
  //   **凡 handler 读 body 的路由必须有契约**（从源码花括号配平取函数体推导，不靠手写名单）；
  //   配置补丁白名单与契约模块逐键一致。已反向证伪（拆掉一条契约即翻红）。
  ['scripts/check-panel-contract.mjs'],
  // S4 契约产物新鲜度（2026-09-13）：契约表 → 客户端模块/JSON/文档 三份产物必须是**刚生成的**；
  //   手改生成物或改了表忘了重新生成 ⇒ 翻红（生成逻辑只在生成器里一处，门禁不复制它）。
  ['scripts/gen-panel-contract.mjs', '--check'],
  // 已安装副本「特性标记」探针（2026-09-13）：文件级 sha 一致 ≠ 装上去的那份带着本轮能力
  //   （本轮 S4 出现过新产物未纳管、差点漏拷 ⇒ 装上即 import 失败）。**报告态**：环境侧滞后不判代码红。
  ['scripts/check-installed-features.mjs'],
  // 已安装副本「逐文件 sha1」漂移门（2026-09-14 · P7/D11 补登记 —— **此前根本不在 `npm test` 里**，
  //   这正是 19 个 `.js.map` 能静默漂移 6 轮却无人察觉的原因）。
  //   **用 `--strict`**：有部署的机器（本机）漂移即 exit 1 ⇒ **运行态绿成为可判定项**；
  //   无部署的机器/CI 走「未探测到副本」⇒ exit 3 诚实跳过（不制造假红灯——`check-installed-sync` 头注的论证）。
  ['scripts/check-installed-sync.mjs', '--strict'],
  // S1 架构约束（2026-09-13）：**容器级选择器不得写死布局尺寸**（裸 px）——
  //   实测教训：弹窗 1040px / 日志 150px 这类容器死值会把内容挤出可见区，而 CSS 门禁与结构断言都抓不到。
  //   配套 --selftest 反向证伪（证明改坏了会翻红，不是一个永远绿的门禁）。
  ['scripts/check-layout-px.mjs'],
  ['scripts/check-layout-px.mjs', '--selftest'],
  // 架构门禁（棘轮：只许收紧不许放松）——守「零循环依赖 / 模块规模 / 接口宽度 / 扇入上限」。
  // 与 check-srcmap 分工：srcmap 管 src↔lib 产物漂移，本件管模块依赖图的**结构性质**。
  ['scripts/audit-architecture.mjs', '--gate'],
  // 阶段 0（2026-09-14）**防堆叠**两件（方案 `docs/architecture-landing-plan-20260914.md` §3）：
  //   · check-module-growth —— 大模块**冻结**（≥600 行只许降不许升）+ 硬顶 1000。
  //     为什么需要：模块行数门禁（2000）对当前最大模块 879 而言**恒绿/假绿**（今天谁也碰不到）；
  //     而「功能往大模块里堆」才是当前真病灶——函数跨度债务已归零，模块级仍在膨胀。
  //   · check-file-channel —— 跨域「文件即通道」契约，**双向**机检（登记⟶代码 + 代码⟶登记）。
  //     为什么需要：本仓无事件总线，跨模块通信的实质是「产线落盘 → 消费块读文件」，
  //     而这对关系**没有任何一处登记**。实证代价：审核时专门去找 `activity.jsonl` 的读侧
  //     只找到 2 处，**实测 5 处**——连专门去找都找不全，日常维护更记不住。
  //   两件均带 `--selftest` 反向证伪（证明改坏了真会红，不是一个永远绿的门禁）。
  ['scripts/check-module-growth.mjs'],
  ['scripts/check-module-growth.mjs', '--selftest'],
  ['scripts/check-file-channel.mjs'],
  ['scripts/check-file-channel.mjs', '--selftest'],
  // P1（2026-09-14）**架构文档 ⟷ 实测** 一致性门：本仓 7 件架构机检全查「代码结构」，
  //   **没有一件查「文档说的与实测是否一致」**；而 ARCHITECTURE.md 开头**自己声明放弃机器兜底**。
  //   于是出现三处实证失真：模块数（AGENTS 60 / ARCHITECTURE 55，**其分项相加仅 53 —— 文档自身都不自洽** /
  //   实测 63）· 注入预算（文档 3000 vs 注册表 4000）· **陈旧陈述**（仍称存在 3 个 `-share` 惰性桥，实测 0 个）。
  //   本门把它变成红灯，并钉住「审计脚本输出头必须标口径」（61 vs 60 之争的根因就是口径未声明）。
  //   2026-09-14 补 ⑥（**接线缺席声明 ⟷ 注册表 `wiring.pending`**）并收紧 ④（泛称 `-share` 也抓）：
  //   原 ④ 只认三个具体桥名，于是「3 个 `-share` 桥亦未做」整句溜过；而 §3.1 末块在 supply-assembly
  //   已接线（panel-shared.ts:21/368）、composition root 已落地（消费方 5 处 · 桥 0 边）之后仍称两者未做。
  ['scripts/check-arch-sync.mjs'],
  ['scripts/check-arch-sync.mjs', '--selftest'],
  // 函数跨度门禁（棘轮双层）：守「单函数行数」这个**真病灶**——文件行数会随拆分发散，
  //   单函数跨度不会。① 硬顶 2000 行防新增怪物；② >400 行的函数个数 ≤ 基线（棘轮，
  //   新增任何一个立刻红，拆掉一个则提示收紧基线）。避免「阈值取到今天谁也碰不到」的假绿。
  //   2026-09-13（P1-1 收尾）：前端债务已从 1（`renderViewToggles` 615 行）归 **0**，
  //   基线由 `--debt 1` **收紧到 `--debt 0`**——这才是棘轮的用法：只许收紧。
  //   守它的安全网是 `test-panel-view-contract.mjs`（参数页 34 + 记忆库页 16 项契约，拆前先固化基线）。
  ['scripts/audit-fnspan.mjs', '--gate'],
  ['scripts/audit-fnspan.mjs', '--client', '--gate', '--debt', '0'],
  ['scripts/test-fnspan-wrapper.mjs'],
  // 装配层不变量门禁（棘轮双层）：守根治方案的两条硬约束 ——
  //   I1 装配函数（apply*/register*/create* 且导出）≤120 行；I2 作用域对象 ≤12 字段。
  //   只搬家不按领域切，就会把「隐式闭包」换成「显式团块」（DsScope 32 字段就是这么来的）。
  ['scripts/audit-wiring.mjs', '--gate'],
  ['scripts/check-srcmap.mjs'],
  ['scripts/check-memory-write-path.mjs'],
  // P4 前置件（2026-09-13）：Record 往返闸 —— 三索引「解析为 Record 再导出」必须逐字节还原；
  //   切事实源（storeMode=record）前它是硬前置（方案档 docs/context-supply-plan.md §10）。
  ['scripts/record-export.mjs'],
  // P4 存储解耦（2026-09-13）：Record 事实源的**常驻门禁** ——
  //   ① 往返闸恒跑（md → Record → md 逐字节重现，切源前置条件）；② 影子库存在时对账；
  //   ③ storeMode=dual 而影子库缺席 ⇒ FAIL（不是跳过）——防"开关已启用却无影子库"的死开关。
  ['scripts/check-record-parity.mjs'],
  // P4 直接单测：Record 模型 + 影子写/对账（含 CRLF/LF 混用、无尾换行、损坏影子库、反向证伪）
  ['scripts/test-record-store.mjs'],
  // G1 内容环（2026-09-13）：**每个 kind 必须登记生命周期归属**（新增类型不许默默加一类）+
  //   空环须显式申报 + **免频率门环必须含 association/decision**（把「一次性洞见不被 ≥3 痕迹门杀死」
  //   钉成契约，防回归）。
  ['scripts/check-ring-coverage.mjs'],
  // G0 部署版本三处一致（2026-09-13）：profile 里 package.json / pnpm-lock.yaml / node_modules/.modules.yaml
  //   对同一依赖的版本记录。**报告态**（不一致仍 exit 0）——部署含环境侧步骤，做成红灯＝假红灯，
  //   与 check-installed-sync 同规格；要当 CI 硬门加 `--strict`。
  ['scripts/check-version-pin.mjs'],
  // G0「唯一 composition root」前置棘轮（2026-09-13）：三条惰性桥（scheduler/deepsleep/mcl-share）的
  //   **发布点 / 消费点**数成数字（当前 3+3=6 边，目标 0），**只许减不许增**——把"消桥"从愿望变成可数目标。
  //   配 `--selftest` 反向证伪：扫描器若按文件名推导标识符会**漏掉 `deepSleepShare`**（大写 S，实测踩过），
  //   漏计会让棘轮以 4 为基线、永远少算一条桥。
  ['scripts/check-bridges.mjs'],
  ['scripts/check-bridges.mjs', '--selftest'],
  // 版本巡检的**反向证伪**：证明抽取器真会抽（否则解析器一坏就永远走"跳过"分支＝假绿）
  ['scripts/check-version-pin.mjs', '--selftest'],
  // G0 DS4「单一事件源」前置棘轮（2026-09-13）：把运行时**观测流**登记成注册表并数成数字
  //   （实测 **13 条**，DS4 目标 **1**）——只许减不许增：出现未登记的 `.jsonl` 字面量即 FAIL。
  //   扫描**先剥注释**（否则文档里提到的目标名 `events.jsonl` 会被当成未登记流 ⇒ 门禁对文档开火，实测踩过）。
  ['scripts/check-observability.mjs'],
  ['scripts/check-observability.mjs', '--selftest'],
  // DS4 合并**形态审计**（2026-09-13）：读**真实数据**给逐流形态表（时间/判别字段/会话键 + 解析失败），
  //   把"13 条并成 1 条"从大工程拆成**可数改造项**（实测：可并入 4 · 需改造 3 · 无数据 6）。
  //   **报告态**（exit 0）：这是待办清单，不是当前红灯。
  ['scripts/check-observability.mjs', '--shape'],
  // **统一事件信封**单测（2026-09-13）：`{ at, ...o }` 的展开顺序允许调用方用 `at: undefined` 覆盖注入值，
  //   而 `JSON.stringify` 静默丢弃 undefined ⇒ 行里没有 `at`（实测 distill-audit 930 行里 1 行如此）。
  //   本件把「任何一行都必须有非空 `at` + `type`」钉死，覆盖 audit/episode/stub/ledger 四条写出路径。
  ['scripts/test-event-envelope.mjs'],
  // **统一台账按 type 裁剪**单测（2026-09-13）：裁剪是**破坏性**操作（重写共享台账），而台账各写入点
  //   catch 静默 ⇒ 删错了**不会有人报错**。本件把「只删同 type 的最旧行 · 其他 type 原样且顺序不变 ·
  //   未超阈值绝不动手 · 坏行不可裁 · 裁剪前先备份且无 tmp 残留」钉死。
  ['scripts/test-ledger-compact.mjs'],
  // **断言图内核**单测（2026-09-13 · 用户拍板「合并」路线的产物）：断言图是**派生视图**，它的错误全是
  //   "静默错图"（边没连上不会报错，只会让人据此判断失误）⇒ 每条边的**出现条件与不出现条件**都钉死，
  //   并对真库做**引用完整性**检查（每条边两端都必须在图中）。
  ['scripts/test-assertion-graph.mjs'],
  // **联想生成**单测（2026-09-13 · 用户点拨「联想这种纯代码基本实现不了」的产物）：
  //   联想的判据是**三条合取**（跨载体 + 语义近 + **词面不重叠**），任何一条写松就会产出
  //   "看着像联想、实则是重复或同义"的噪声——而噪声不报错，只会让人**不再信任这个能力**。
  ['scripts/test-association-propose.mjs'],
  // G1 决策环直接单测：开裁决 → **后果回收**（幂等拒绝 / 由价态推导命中 / 同文本不撞 id）→ 价态采集
  //   → 记分卡；含三条讨论结论的机械化断言（免频率门 · 环记录不被镜像吞 · meta 变更算走形）。
  ['scripts/test-decision-ring.mjs'],
  // G2 关系环直接单测：关系事实 → **承诺状态机**（pending→kept|broken，重复结清被拒、结清即出队）
  //   → **双向兑现率**（我欠 / 欠我 分开统计，方向不许合成一个数）→ 关系普查；含棘轮断言
  //   （环落地后必须撤销 RING_PENDING 申报）。
  ['scripts/test-relation-ring.mjs'],
  // G3 联想环直接单测：**跨度门**（同 § 即拒，不许冒充碰撞）· **免频率门**（单次即入库）·
  //   落地回收幂等 · **越界召回确定性**（同 seed 逐字可复现）· **去重尺子一致**
  //   （碰撞存锚点/召回查记录 id 的错位会让"已撞过的对"被反复推荐——本模块初版真实踩过）。
  ['scripts/test-association-ring.mjs'],
  // G4 读侧装配直接单测：**核心必进 + 溢出可见**（I2a：静默挤掉恒定面 = 人格静默消失）·
  //   整条进或整条丢（无半截行）· 变动面不重排（不形成第二份排序实现）·
  //   **联想槽独立预算**（启用时总预算上升可读，且不挤占相关性面）。
  ['scripts/test-supply-assembly.mjs'],
  // G0 环事件流直接单测：差分推导（载荷逐字来自 meta，不做正文反解）· **重放往返无损** ·
  //   **对账四类偏差都要抓得住**（缺失/多出/内容不一致/坏事件——不是永远绿的装饰）· 回填保序。
  ['scripts/test-ring-events.mjs'],
  // P2（2026-09-14）情境层两件直接单测：
  //   · situation-key —— 情境指纹：**维度序可复现**（按注册表序，非对象键序）· 交集保序 ·
  //     未知维度跳过不抛 · 确定性。它错 ⇒ 环记录要么永不命中（静默失效）要么乱命中（误注入）。
  //   · ring-supply —— 环记录**唯一读侧通道**：准入（file=''/kind/ring/活性/空文本）·
  //     排序（命中→环序→due→新鲜）· 边界（topN=0 · 坏时间戳 · 缺 meta）· cues 往返（含空格路径不破）。
  ['scripts/test-situation-key.mjs'],
  ['scripts/test-ring-supply.mjs'],
  // P4/P5（2026-09-14）**环记录落库**（蒸馏与深睡两产线共用）直接单测：六通道落库（含 **后果回收** 与
  //   **episode 叙事**）· meta 载荷保留 · **cues 回填 / 重提交不丢字段** · 事件流写入 · **幂等** ·
  //   **库未建拒写**（不得凭空造游离事实源）· 坏输入跳过 · 零抛出 · **重放对账**（episode 不在对账范围，不得假红）。
  ['scripts/test-ring-commit.mjs'],
  // G0 事实环时态失效直接单测：isLive（**坏时间戳 fail-closed**）· 标记/恢复幂等 ·
  //   与 lifecycle **正交**（真伪 ≠ 活性）· 双时间戳进走形判定 ·
  //   **镜像承接状态位**（否则标了失效、下次镜像就复活；命中统计此前会被静默清零）。
  ['scripts/test-fact-ring.mjs'],
  // 来源过滤回归（2026-09-13 深层归因）：蒸馏材料/episode.intent 曾被宿主注入块污染 75%；
  //   本件锁死四处统一口径（distill-chunks / distill-activation / mcl / panel-inject 同判 `source.kind`）。
  ['scripts/test-distill-source-filter.mjs'],
  ['scripts/check-deploy-sync.mjs'],
  ['scripts/check-changelog.mjs'],
  ['scripts/check-ui-contract.mjs'],
  ['scripts/test-fold-state.mjs'],
  ['scripts/test-ui-derive.mjs'],
  // UI 几何回归（S1）：真机渲染下量「弹窗是否自适应 / 卡片是否换行 / KPI 是否被挤出首屏 / 日志是否折叠」。
  //   背景：CSS 门禁与结构断言都抓不到「写死尺寸把内容挤出可见区」——只有真渲染量几何才看得见（2026-09-13 实测）。
  //   无 Chrome/Edge 的机器退 4 ⇒ 由本件的 xfail 声明承接（不判失败）。
  ['scripts/ui-geo-regress.mjs', { xfail: true }],
  // 面板视图契约（P1-1 / P1-2 前置安全网 · 2026-09-13）：守 `body.js` 里两个渲染巨石
  //   `renderViewToggles`（原 615 行）与 `renderMemoryExpanded`（321 行）——两个页面都零单测，
  //   拆分前必须先固化结构清单、拆分后逐项比对：**清单不变 = 行为等价**。
  //   受测两视图：参数页（每个 .setting-item 的「Tab + 名称 + 控件类型」，34 项）；
  //   记忆库页（各 Tab 的小节锚点 .sc-mem-group-title / .sc-cap-top / .sc-mem-stat-label，16 项）。
  //   为什么不能静态扫源码：`SWITCH_KEYS` 有数据驱动的整体跳过、`UI.item` 的控件形态由 children 决定、
  //   部分项在异步回调里追加 ⇒ 只有真机渲染的清单才作数（与 ui-geo-regress 同判据）。
  //   已反向证伪：篡改基线任一 kind ⇒ FAIL；还原 ⇒ PASS。无 Chrome 的机器退 4 ⇒ 由本件 xfail 承接。
  ['scripts/test-panel-view-contract.mjs', { xfail: true }],
  ['scripts/test-css-usage-gate.mjs'],
  // targets.ts **直接单测**（终极方案 §六 第 2 条：它是"当前第一风险 —— 扇入 7 却零直接单测，
  //   坏了 7 个模块一起错"，补测试优先级高于切分）。九组断言：路径派生 / 白名单门禁（含路径穿越与
  //   大小写口径）/ 载体层单一实现（期望值数据驱动自 CARRIERS 注册表，不抄第二份标签名单）/
  //   同 § 族键与竞争性抑制 / 词法 token 地板 / 装配矩阵**全仓唯一实现** / 临时夹具库真读召回。
  ['scripts/test-targets.mjs'],
]
const rows = []
for (const entry of CHECKS) {
  const [file, ...rest] = entry
  // 末位若是**普通对象**即为选项（{ xfail: true }），不参与 argv——否则会被当成参数喂给检测件
  const last = rest[rest.length - 1]
  const opts = (last && typeof last === 'object' && !Array.isArray(last)) ? rest.pop() : {}
  const argv = rest.map((a) => (a === '__ROOT__' ? root : a))
  let code = 0
  /* 捕获输出（2026-09-13 立）：原先 stdio:'ignore' 把失败件的输出**吞掉**，
   *   导致两次 test-forgetops 抖动无从定位（只知文件名、不知断言）。绿色运行仍不打印，保持无噪音。 */
  let childOut = ''
  try {
    childOut = execFileSync('node', [join(root, file), ...argv], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, windowsHide: true, maxBuffer: 64 * 1024 * 1024
    })
  } catch (e) {
    code = Number(e.status ?? -1)
    childOut = String(e.stdout || '') + String(e.stderr || '')
  }
  // 4 **且**已声明 xfail ⇒ xfail；未声明件退 4 ⇒ **fail**（见件头：4 是被运行时脚本占用的码位）
  rows.push({ file, code, out: childOut, verdict: code === 0 ? 'pass' : code === 3 ? 'skip' : (code === 4 && opts.xfail) ? 'xfail' : 'fail' })
}
const failed = rows.filter((r) => r.verdict === 'fail')
const xfailed = rows.filter((r) => r.verdict === 'xfail')
const out = {
  checks: rows,
  fail: failed.map((r) => r.file),
  xfail: xfailed.map((r) => r.file),
  note: '契约（ADR-132）：0=pass · 3=skip(依赖缺失) · 4=xfail(已知未修，不判失败但必须可见) · 其他=fail',
}
if (AS_JSON) console.log(JSON.stringify(out, null, 2))
else {
  // 字形：⚠ 与 ✅ 一眼可辨（硬约束①）；xfail 计数恒显示，含 0（硬约束②）
  const GLYPH = { pass: '✅', skip: '⏭', xfail: '⚠', fail: '❌' }
  const nPass = rows.filter((r) => r.verdict === 'pass').length
  const nSkip = rows.filter((r) => r.verdict === 'skip').length
  console.log('检测件统一运行（契约：0=pass · 3=skip · 4=xfail · 其他=fail）')
  for (const r of rows) console.log(`  ${GLYPH[r.verdict]} ${r.file.padEnd(36)} exit=${r.code} ${r.verdict}`)
  console.log(`\n${failed.length ? 'FAIL' : 'PASS'}（${nPass} pass · ${xfailed.length} xfail · ${nSkip} skip${failed.length ? ` · ${failed.length} fail` : ''}）`)
  if (xfailed.length) console.log(`⚠ XFAIL 项（已知未修，不判失败但必须可见）：${xfailed.map((r) => r.file).join(', ')}`)
  if (failed.length) {
    console.log(`FAIL 项：${failed.map((r) => r.file).join(', ')}`)
    /* 诊断输出：失败件的子进程输出必须**可见**，否则"抖动一次就查不动"（本轮实测教训）。
     *   末 25 行直接打印；全文落 tmp 并给出路径（大输出不刷屏）。 */
    for (const r of failed) {
      const body = (r.out || '').trim() || '(该件无输出)'
      let where = '(未能落盘)'
      try {
        const p = join(tmpdir(), 'shoucang-runner-' + basename(r.file) + '.log')
        writeFileSync(p, r.out || '(无输出)', 'utf8')
        where = p
      } catch (e) { /* 落盘失败不影响主流程 */ }
      /* 先钉**全部 FAIL 行**（2026-09-13 立）：末 25 行只覆盖件尾，失败若在第 1 条断言就完全看不见。
       *   实测教训：`test-treeops-split` 抖动一次（17 PASS / 1 FAIL，18 条断言里挂 1 条），
       *   失败行不在末 25 行内 ⇒ 无从定位；而落盘的全文会被**下一次运行覆盖** ⇒ 证据丢失。
       *   故把 FAIL / ❌ 行**与截断无关地**单独列出——这一条是为「低频抖动查不动」这个已知痛点加的。 */
      const failLines = body.split('\n').filter((l) => /(^|\s)(FAIL|❌)/.test(l))
      if (failLines.length) {
        console.log('\n—— ' + r.file + ' 失败断言（全部 ' + failLines.length + ' 条）——')
        failLines.forEach((l) => console.log('  ' + l))
      }
      console.log('\n—— ' + r.file + ' 输出（末 25 行 · 全文 ' + where + '）——')
      console.log(body.split('\n').slice(-25).join('\n'))
    }
  }
}
// 反向证伪（硬约束③：自证 4 码位**渲染分支真的接上了**，不是"加了等于没加"的静默洞）
//   做法（不污染 CHECKS 常驻清单，跑完必须还原）：
//     ① 建临时件 `scripts/__xfail-probe.mjs`，内容 `process.exit(4)`
//     ② 在 CHECKS 首行插入 `['scripts/__xfail-probe.mjs', { xfail: true }],`（**必须带选项**，见下 ⑥）
//     ③ 跑 `node scripts/check-runner.mjs` ⇒ 必须同时满足：
//          渲染 `  ⚠ scripts/__xfail-probe.mjs  exit=4 xfail`
//          摘要出现 `1 xfail`，且出现「⚠ XFAIL 项（…必须可见）」段
//          **runner 自身 exit 仍为 0**（xfail 不判失败）
//     ④ 还原 runner 与 CHECKS、删除探针 ⇒ 与步骤 ① 之前的 **cp 备份件逐字节比对一致**
//        （**不要**在注释里写死哈希：本件一改哈希就变，写死即过期锚点，正是本轮反复踩的"证据与结论不同源"）
//   实测（2026-09-12）：③ 得到 `PASS（20 pass · 1 xfail · 0 skip）` + ⚠ 段 + RUNNER_EXIT=0 ✓
//   若哪天改了渲染分支却没重跑这条，4 就会被悄悄判成 ❌ fail（恒红）或 ✅ pass（假绿）——二者都是本件要防的。
//     ⑤ **反向的另一半，不可省**：把探针改成 `process.exit(5)`（未知码）重跑 ⇒ 必须仍渲染
//        `❌ … exit=5 fail`、计入 FAIL 项、**runner 自身 exit 1**。
//        只证 ③ 不证 ⑤ 等于没证：把判读写成一律 `'xfail'` 时 ③ 照样通过，**只有 ⑤ 抓得到**
//        ——那就是「新加的 4 分支把 else 吞掉了」，与本件要防的假绿完全同型。
//        （2026-09-12 实测四向：仅 4 ⇒ exit 0；仅 5 ⇒ exit 1；0+4 ⇒ exit 0；4+5 ⇒ exit 1，全中。）
//     ⑥ **声明制的核心方向，最不可省**（2026-09-12 team-lead 派工）：探针 `process.exit(4)` 但登记项
//        **不带** `{ xfail: true }` ⇒ 必须渲染 `❌ … exit=4 fail`、**计入 failed**、**runner exit 1**。
//        它锁的正是「4 是被运行时脚本占用的码位」这个洞：全局版（不看声明）会把任何真实失败退 4
//        静默降级成 xfail ⇒ **把「坏了」显示成「没那么坏」**。只验 ③ 不验 ⑥，这个洞就是敞开的。
//        （实测：声明件退 4 ⇒ ⚠/不计 failed/exit 0；**未声明件退 4 ⇒ ❌/计入 failed/exit 1**；
//          未声明件退 5 ⇒ ❌/计入 failed/exit 1；还原 ⇒ `PASS（19 pass · 1 xfail · 0 skip）` exit 0。）
process.exit(failed.length ? 1 : 0)
