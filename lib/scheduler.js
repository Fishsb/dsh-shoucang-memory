import { defineTool } from '@deepseek-ai/dsh-tools';
import z from 'schemastery';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dshHome, selftestMatrix, suiteAssemblyMatrix, memoryLibRoot, recallApprox } from './targets.js';
import { recallRanked } from './vec.js';
import { renderAssocBlock, supplyAssociations } from './association-supply.js';
// B 档（审查 F1-A）：深睡触发 / 召回融合 / MCL / 画像行上限的**缺省值直接读判据注册表**（单一真源）
import { TRIGGER, SURFACE, SCORE, MATURATION } from './criteria.generated.js';
// S-P2b（2026-09-20）：探测域（8 键）按**领域接缝**抽出 —— schema 与显式映射同处一文件，单一事实源。
import { probeConfigSchema, probeOptionsOf } from './probe-config.js';
// ACT-295（2026-09-21）：子代理路由域（8 键，含**档位**）按同一接缝抽出 —— 解本件冻结棘轮。
import { modelConfigSchema, modelOptionsOf } from './model-config.js';
// ACT-295（2026-09-21）：宿主模型目录（含 efforts/defaultEffort）的**单一实现**，本件只委托。
import { createLlmCatalog } from './llm-catalog.js';
// M1（ACT-283）评估通道配置域：按领域接缝抽出（同 probe-config 先例）。
import { evalConfigSchema, evalOptionsOf } from './eval-config.js';
import { registerDistill } from './distill.js';
import { registerMcl } from './mcl.js';
export const name = '@dsh-external/shoucang-scheduler';
export const inject = ['tools', 'llm', 'subagents', 'agents'];
/** 单插件仓（2026-09-08 三合一后 suite 无外部成员）：members 缺省 = **自检本插件装配状态**，
 *  消除 shoucang_suite / panel /suite / assistant_capabilities 三处恒返回「无成员」的空转（2026-09-11 审查修复）。 */
const SELF_MEMBER = {
    id: 'shoucang',
    package: 'dsh-shoucang-memory',
    repo: 'Fishsb/dsh-shoucang-memory',
    role: 'self（单插件仓：默认自检装配状态）',
};
/** 生效成员表：显式配置优先，缺省回落到自检自身 */
const memberSpecsOf = (config) => (Array.isArray(config.members) && config.members.length ? config.members : [SELF_MEMBER]);
export const Config = z.object({
    members: z
        .array(z.object({
        id: z.string(),
        package: z.string(),
        repo: z.string().default(''),
        role: z.string().default('member'),
    }))
        .default([]), // 2026-09-08 单插件合并：记忆技能已内嵌（skill/）、pmg 治理整体移除，suite 外部成员清空
    verify_enabled: z.boolean().default(true),
    enableDistill: z.boolean().default(true).description('守藏蒸馏器（ADR-0002 阶段2）；单飞切换完成后缺省开（记忆插件蒸馏已关）'),
    // S2S3 册二（2026-09-19 · 用户口径「**S3 睡眠不产出**」）：三通道停产开关。
    //   缺省 **false = 停产**（原则 add/replace · 画像 profileOps 三通道全关；维护动作——压缩/归档/指针/树——不受影响）。
    //   要恢复产出须显式置 true（并在审计里会看到 produceOff 计数，便于分辨"停产"与"没跑"）。
    s3Produce: z.boolean().default(false).description('S3 睡眠是否允许产出（原则/画像通道）；缺省 false=只维护不产出（S2S3 册二）'),
    enableSessionReview: z.boolean().default(true).description('L2 会话级复盘（S2S3 册一）：空闲/结束后按内容维阈值产出会话级提案'),
    /* S2S3 册二（2026-09-19）**两个自动执行开关**：默认 false（fail-closed）。
     *  运行期判定 = 本键 ∪ env（见 deepsleep-run 的 liveAutoSwitch；**实时读 scheduler.json** ⇒ 改完即生效）。
     *  ⚠ 打开后 S3 会在**下一轮深睡**里：① 按语义门结果归档「字面自足」的小节（可回滚，绝不直删）；
     *    ② 执行 L2 校正提案（逐字命中才改 + 先留档再改 + 幂等）。二者都只影响**维护/校正**，不新增知识。 */
    releaseAuto: z.boolean().default(false).description('S3 精要层释放自动执行（默认关；语义门 executable 为 false 时仍零释放）'),
    proposalApply: z.boolean().default(false).description('S3 执行 L2 校正提案（默认关；逐字命中才改 + 先留档再改 + 幂等）'),
    /* 门4 册B（2026-09-20）**时态剔除落库**（蒸馏 + 深睡两条产线共用此键）：
     *   默认关 ⇒ 与现状逐字节等价（零行为变化）；开启后旧断言才会真的退出注入面。
     *   判据 `test-fact-supersede.mjs` §A 用 sha 实证「关闭 ⇒ 真库零写入」。 */
    supersedeApply: z.boolean().default(false).description('门4 时态剔除落库：旧断言标失效（默认关；逐字唯一命中才标 + 先留档再改 + 幂等）'),
    /* L2 **触发阈值**（S2S3 册四 U4 裁定 · 2026-09-19）：三项**可调**且**登记在册**（G16）。
     *  缺省值取自判据注册表 `criteria.json#trigger.review*`（单一事实源；schema 只是可调入口）；
     *  实测依据：段中位仅 **4** ⇒ 原内容维阈值（8 条 / 1200 事件）会大面积漏触发 ⇒ 下调为 3 / 600。
     *  ⚠ 改这里即改行为（`session-review.ts` 的 `REVIEW_DEFAULTS` 只作**注册表缺席时**的兜底）。 */
    reviewIdleMs: z.number().min(60000).default(TRIGGER.reviewIdleMs).description('L2 复盘：会话空闲满此毫秒数才复盘（缺省 30 分钟）'),
    reviewMinNewEntries: z.number().min(1).default(TRIGGER.reviewMinNewEntries).description('L2 复盘内容维：自上次复盘以来新增 L1 条目数下限（U4 裁定：3）'),
    reviewMinNewEvents: z.number().min(1).default(TRIGGER.reviewMinNewEvents).description('L2 复盘内容维：新增事件数下限（U4 裁定：600）'),
    idleWakeMs: z.number().min(60000).default(600000).description('唤醒判定：turn 结束后空闲满此毫秒数才蒸馏（缺省 10 分钟）'),
    minTurnChars: z.number().min(0).default(200).description('本轮新增正文少于此字符数跳过蒸馏（水位仍推进）'),
    distillPrescan: z.boolean().default(true).description('预筛：无信号词且无 pending 候选则不唤醒 LLM 子代理'),
    prescanMinChars: z.number().min(0).default(4000).description('大段强制蒸馏阈值（字符）：增量 ≥ 此值跳过预筛直接蒸馏（2026-09-10 用户拍板；缺省 4000）'),
    distillPrompt: z.string().default('').description('蒸馏子代理 persona 覆盖（缺省内建 v5 契约）'),
    // ACT-295（2026-09-21）：子代理路由域 8 键（llm*/distill*/sleep*，**含两枚新增档位**）已抽到
    //   `model-config.ts`（声明与映射与回落规则同处一文件 ⇒ 单一事实源；解本件冻结棘轮）。
    ...modelConfigSchema,
    // 2026-09-10：记忆库容量门（写门 SHOUCANG_CAP_* 的 UI 源）——控制蒸馏/扩增能长多大；注入不裁（执行时总看完整画像+记忆）
    // 2026-09-11 用户拍板：默认值 = 画像 3,000（AGENT/USER 各一）/ 记忆 5,000（原 AGENT 3000 · USER 2000 · MEMORY 3000）
    capAgent: z.number().min(100).default(3000).description('AGENT.md 容量门（字符，写门强制；缺省 3000）'),
    capUser: z.number().min(100).default(3000).description('USER.md 容量门（字符，写门强制；缺省 3000）'),
    capMemory: z.number().min(100).default(5000).description('MEMORY.md 容量门（字符，写门强制；缺省 5000）'),
    // P4 存储解耦（方案档 docs/context-supply-plan.md §10）：md 仍是事实源，dual = 每次 md 成功写入后
    //   镜像进 Record 影子库 + 由 check-record-parity 逐字节对账。'record' 档（md 降为纯投影）**尚未实现**，
    //   故本键只接受 md|dual —— 避免出现"选了却没接线"的死开关（仓内已有死开关前例）。
    // ⚠ 2026-09-13 修：本处注释此前**声称**"只接受 md|dual"，而实现是 `z.string()` —— **什么都收**：
    //   设 `storeMode:'record'` 不报错、只**静默无动作**（`mirrorShadow` 仅在 `=== 'dual'` 时动作）
    //   ⇒ **注释声称要防的"死开关"已经存在**。现改为枚举，非法值**当场抛**
    //   （实测 `expected "md" | "dual" but got "record"`）。⚠ 教训：**注释里的约束不算约束，代码里的才算**。
    storeMode: z.union([z.const('md'), z.const('dual')]).default('md').description("P4 存储解耦：'md'（缺省，现状零变化）| 'dual'（双写期：md 写入后镜像进 <库根>/.records/records.jsonl 并逐字节对账）。'record' 档（md 降为纯投影）**尚未实现** ⇒ 本键不接受该值（防死开关）"),
    enableDeepSleep: z.boolean().default(true).description('深度睡眠归纳：全部会话停滞 ≥deepSleepIdleMs 自动提炼习得原则写入 agent 画像 AGENT.md（[原则] 行），同 pass 反思双通道维护 USER 画像'),
    enableRemPass: z.boolean().default(false).description('REM 相（认知对照 P2）：深睡同 pass 内额外做**跨主题联想**（crossTopic 通道，产出须覆盖 ≥2 个不同 § 主题才被宿主接收）；缺省关'),
    deepSleepIdleMs: z.number().min(600000).default(TRIGGER.idleMs).description('停滞判定阈值（毫秒）：无任何会话活动持续满此时长触发深度睡眠归纳（缺省读注册表 TRIGGER.idleMs = 2700000ms 即 45min；⚠ 2026-09-15 P0.1 实证订正：此处原描述误称 3 小时）'),
    // ═══ 会话活跃状态机（2026-09-08 重构）：探测域 schema 展开（S-P2b 抽出到 probe-config.ts）═══
    ...probeConfigSchema,
    // ═══ 可配置评估通道（M1 · ACT-283）：评估域 schema 展开（eval-config.ts）═══
    ...evalConfigSchema,
    deepSleepDaemonParent: z.boolean().default(false).description('无会话场景兜底：自建守护 parent 承载归纳子代理（宿主新建空 agent 路径未经验证，默认关）'),
    activationShadow: z.boolean().default(true).description('路线④ 打扰度影子观察：每轮 user 消息按词法打分（recallIndex），滞回+冷却，只落**统一台账** <knowledgeRoot>/audit/ledger.jsonl（	ype=activation.shadow），不注入上下文——默认开，攒样本校准阈值'),
    activationPrefetch: z.boolean().default(false).description('路线④ active 注入（缺省关）：影子校准满意后开启；注入接线为后续档'),
    activationTOn: z.number().min(0).max(1).default(0.65).description('滞回上阈：sim≥此值且冷却结束 → prefetch/emit（2026-09-11 ACT-024 重校准：口径=用户文本↔命中索引行的**绝对余弦**，实测干净样本 p95≈0.619 / p99≈0.649；旧相对分口径 0.62 会命中 88.5% 真实消息故废弃）'),
    activationTOff: z.number().min(0).max(1).default(0.6).description('滞回下阈：sim<此值 → 回到 idle（防阈值抖动；绝对余弦口径，同 ACT-024）'),
    activationCooldownSteps: z.number().min(0).default(3).description('触发后冷却步数，防连续打扰'),
    activationTopK: z.number().min(1).max(5).default(3).description('每次观察召回条数'),
    embedEnabled: z.boolean().default(true).description('向量融合召回（2026-09-09 缺省开；本地 bge-m3 零 token；未配置/失败自动降级纯词法）'),
    embedBaseUrl: z.string().default('http://127.0.0.1:11434/v1').description('OpenAI 兼容 /embeddings 基址（缺省 Ollama :11434；自建桥/ LM Studio / 云端改此键）'),
    embedModel: z.string().default('bge-m3').description('embedding 模型名（缺省 bge-m3，Ollama 官方库 1.2GB；换云端如 text-embedding-3-small）'),
    embedApiKeyEnv: z.string().default('EMBED_API_KEY').description('API key 环境变量名（本地免 key；云端须设，不落盘）'),
    recallFusion: z.string().default(SURFACE.fusion.kind).description("融合策略：'rrf'（缺省，排名融合 k=60，对离群分稳健）| 'weighted'（旧 min-max 加权，回滚用）——见 skill/engine/criteria.json surface.fusion"),
    bankGit: z.boolean().default(true).description('记忆库本地 git 版本化：每次成功写入后提交快照（可 diff/revert；库在 ~/.dsh 下不入公开树；失败静默）'),
    // ═══ v7 记忆活性/遗忘/加深校准阈值（2026-09-10：面板「参数调节」可调；缺省=本 schema 默认；schemastery 无 .int()，整数值由 UI parseInt + 默认/范围保证）═══
    activityWarmDays: z.number().min(1).max(120).default(14).description('活性降级：active→warm 无命中天数（缺省 14）'),
    activityColdDays: z.number().min(2).max(365).default(44).description('遗忘冷降：warm→cold 无命中天数（缺省 44 = warm+30）'),
    activityArchiveDays: z.number().min(30).max(730).default(90).description('遗忘候选：cold 且最近命中超过该天数 → 候选清单（缺省 90）'),
    activityHotHits: z.number().min(1).max(50).default(23).description('加深候选：近 30 天命中 ≥ 此值 → 加深候选 B（缺省 23 = 分布上四分位；2026-09-15 J2 校准，原 5 低于 p50 无区分度）'),
    // S-P1b（2026-09-15）**内容水位**（第二触发维，与时间维 `deepSleepIdleMs` 取 OR）：
    //   窗口内待消化材料（pending/ + candidates/ 中 mtime > since 的 .md 字节和）≥ 此值 ⇒ **不等时间到也可睡**。
    //   `0` = 关闭（缺省）⇒ **零行为变化**。阈值本身 `insufficient-data`（纪元仅 1 个样本，分布未成形）⇒ 不拍脑袋。
    deepSleepContentMinChars: z.number().min(0).max(100000000).default(Number(TRIGGER.contentMinChars) || 0).description('内容水位：待消化材料字节 ≥ 此值 ⇒ 可睡（0=关闭；缺省读注册表 TRIGGER.contentMinChars；⚠ 2026-09-16 该口径已被真机证伪 ⇒ 代码内守卫**一律按关闭**处理，见 OPEN-ITEMS S-P1b″）'),
    // S-P1c-multi（2026-09-16）**材料分片上上限**：材料段经 `splitByCap` 装片，>此值即切多片、**按片多轮跑**。
    //   `0` = 关闭（缺省）⇒ 单片段、行为与改造前逐字等价。
    //   ⚠ 本轮补此通道的原因：字段此前只被 `runDeepSleep` 读 `config.materialChunkChars`，**却没进 zod schema**
    //   ⇒ 生产里永远是 `undefined` ⇒ **多轮执行不可达**（"接线了但开不了"）。属"声明 runtime 却无配置通道"这类缺口。
    deepSleepMaterialChunkChars: z.number().min(0).max(100000000).default(Number(TRIGGER.materialChunkChars) || 0).description('材料分片上限（字符）：>此值即切多片并按片多轮跑（0=关闭；缺省读注册表 TRIGGER.materialChunkChars）'),
    recallColdFactorPercent: z.number().min(5).max(95).default(SURFACE.recall.coldFactorPercent).description('召回降权：cold/retired 小节融合召回降权系数（百分比，→ /100；缺省 35）'),
    // ═══ U3（ADR-122 UI · B5 能力对齐）：这两个键 panel 一直在读（readSuiteConfig().injectRelevance/injectFreshSlots），
    //     但 scheduler 侧从未声明 ⇒ 面板无法调、写回也保不住。此处转正（值域与 panel 消费语义一致）。 ═══
    injectRelevance: z.boolean().default(true).description('注入相关性重排开关（关=false 时跳过相关性选行，回落基线+新鲜度）'),
    injectFreshSlots: z.number().min(0).max(6).default(2).description('新鲜度保底槽位数（注入时优先保留最近新增条目）'),
    // v2.2（ADR-130）三层生效模型开关
    injectProfileRows: z.number().min(0).max(6).default(SURFACE.injection.carriers.profile).description('P 层画像行（`- … ← 源:`）每档注入上限（缺省 3；0=关闭 → 回滚到画像行不注入的旧行为）'),
    scoreWeights: z.string().default(SCORE.mode).description("召回打分公式：'legacy'=现行 relevance+activity | 'v2'=α_rel·relevance+α_imp·importance+α_rec·recency（**缺省读注册表 surface.score.mode** · 单一真源）"),
    shadowScore: z.boolean().default(true).description('影子打分：并行计算 v2 公式并写**统一台账** audit/ledger.jsonl（	ype=score.shadow，不改变排序，用于 M4 影子期）'),
    maturationEnforce: z.boolean().default(MATURATION.enforce).description('成熟度强制：true 时 [原则]/[路径] 升格须满足 A≥maturation.gate（**缺省读注册表 maturation.enforce** · 单一真源）'),
    perItemGate: z.boolean().default(true).description('逐条裁决：写门逐条校验（单条不合格不再拖垮整轮；并集超限则尾部贪心回退）。false=回到整轮全拒'),
    selfCheck: z.boolean().default(true).description('睡眠期自检：深睡完成后由宿主跑 6 项检测（判据门/载体门/分层单测/成熟度/影子打分/账本对账）→ 落 audit/selfcheck-latest.json 与台账 check.sleep'),
    selfCheckRepo: z.string().default('').description('仓根路径（自检中仓侧三项检测需要；留空则只跑库侧可独立运行的三项）'),
    selfCheckAutoRollback: z.boolean().default(false).description('自检白名单事实调整：允许执行唯一窄动作 rollback-scoreWeights（依据 R-3：shadow-sim.flipReady=false）。缺省 false=只告警不改配置'),
    selfCheckIntervalHours: z.number().min(0).max(168).default(6).description('定时自检周期（小时，缺省 6；0=关闭定时，只在深睡完成后触发）——保证「想不起来也会自动做」'),
    // ═══ ACT-029 认知环（MCL）：熟悉度分流 + 慢通道薄材料 + 有界再引导（方案见 .internal/arch/shoucang-SC-S05）═══
    mclEnabled: z.boolean().default(true).description('认知环（MCL）开关：慢通道在任务首步注入「薄契约 + top-k 指针」并按需再引导一次；快通道零额外往返。缺省开，置 false 一键回滚'),
    // ⚠ 2026-09-11（SSOT 修正）：schema 缺省原为 `SURFACE.threshold.tOn`——那是 **ACT-024 校准的另一套语义**
    //   （ingest 侧绝对余弦阈值，仍为 0.65），与 MCL 熟悉度阈值同名不同义。误用它的后果：本文件 646 行
    //   的 `Number(config.mclFamiliarThreshold) > 0 ? … : (SURFACE.mcl?.familiarThreshold || 0.58)` 恒走第一分支，
    //   兜底成为死代码；一旦删掉 `~/.dsh/suite/scheduler.json` 的持久键（换机/新装/清配置），
    //   阈值会**静默回到 0.65**（高于实测上限 0.634 ⇒ 快通道永不触发）。缺省改为读注册表同一字段。
    mclFamiliarThreshold: z.number().min(0).max(1).default(SURFACE.mcl.familiarThreshold).description('熟悉度阈值（用户文本↔命中索引行的**绝对余弦**；缺省读注册表 surface.mcl.familiarThreshold · 单一真源。2026-09-11 由实测上限 0.634 重校准：0.65 → 0.58）'),
    mclMaxNudges: z.number().min(0).max(3).default(SURFACE.mcl.maxNudges).description('慢通道再引导上限（缺省 1：只对「未引用材料」再引导一次，之后放行，绝不死锁）'),
    mclBudgetChars: z.number().min(120).max(4000).default(SURFACE.mcl.budgetChars).description('慢通道材料硬预算（字符；薄契约 + top-k 薄行，只作用于慢通道首步）'),
    // P2b（2026-09-13，方案档 §8 P2 / §3.3）：材料从「插一条 user 消息」改为挂 **systemPrompt 段**。
    //   动机：不再污染转录（§11 度量「转录内 MCL user/message 条数」目标 0）· 位置稳定、前缀缓存友好。
    //   缺省 **false ＝ 现状零行为变化**；置 true 一键开启，置 false 一键回滚（需重载生效）。
    //   ⚠ systemPrompt 能力不可用时注册期自动回落为 false（宁走旧路，不可静默失效）。
    mclMaterialInSystem: z.boolean().default(false).description('P2b：慢通道材料改挂 systemPrompt 段（缺省 false=材料仍插消息面；true=只挂注入面，消息面仅留再引导）'),
    mclTopK: z.number().min(1).max(5).default(SURFACE.mcl.topK).description('慢通道注入的指针条数（缺省 3）'),
    mclAudit: z.boolean().default(true).description('认知环审计流：写**统一台账** knowledgeRoot()/audit/ledger.jsonl（	ype=mcl*；每步一行：通道/熟悉度/注入/再引导/合规）'),
});
// —— 自持配置文件（契约 v3 落地通道；dshHome 等路径探测统一来自 targets.ts，单一事实源）——
/**
 * ~/.dsh/suite/scheduler.json — 唯一持久配置通道。
 * 背景：注入插件不进 loader 配置持久化（super-injector dev_inject 硬编码 config:{}，README 明言重启不恢复），
 * schemastery UI 配置对本插件不持久 → 自持 JSON 覆盖缺省（键名同 Config；缺文件/坏文件=纯缺省，不 fail-loud）。
 *
 * ⚠ 2026-09-13 修（**第二通道绕过校验**）：原实现是**无校验裸合并** `(config as any)[k] = v` ⇒
 *   ① **任何键、任何类型**都能覆盖：`{"storeMode":"record"}` 可**绕过** M1 刚加的枚举守卫
 *      （`record` 未实现 ⇒ `mirrorShadow` 不动作 ⇒ **死开关复活**）；`{"deepSleepIdleMs":"abc"}` 之类也照收；
 *   ② 与 Config schema 声明**脱节**（schema 是声明，合并却不过它）。故 `test-scheduler-wiring` ⑧ 的守卫
 *      只在"schema 通道"成立 —— **守卫必须两条通道都成立**。
 *   现改为：**键白名单（从 schema 自身派生）+ 逐键过 schema 校验**；非法键/值 ⇒ **忽略并记日志**（不注入）。
 *   防御式：不依赖 schemastery 对非法输入的具体表现（抛 / 穿透 / 丢弃），三种下都不会注入未校验值。
 */
function applySuiteConfigFile(config, warn) {
    try {
        const f = join(dshHome(), 'suite', 'scheduler.json');
        if (!existsSync(f))
            return;
        const raw = JSON.parse(readFileSync(f, 'utf8'));
        if (!raw || typeof raw !== 'object')
            return;
        // 键白名单**从 schema 自己派生**（不手抄第二份名单——手抄必漂移）
        let allowed;
        try {
            allowed = new Set(Object.keys(Config({})));
        }
        catch {
            return; /* schema 自检异常 ⇒ 不合并（纯缺省最安全） */
        }
        for (const [k, v] of Object.entries(raw)) {
            if (v === undefined)
                continue;
            if (!allowed.has(k)) {
                warn?.(`[shoucang] scheduler.json 未知键已忽略：${k}`);
                continue;
            }
            try {
                const probe = Config({ [k]: v });
                if (k in probe)
                    config[k] = probe[k];
                else
                    warn?.(`[shoucang] scheduler.json 键 ${k} 未被 schema 接受，已忽略`);
            }
            catch (e) {
                warn?.(`[shoucang] scheduler.json 键 ${k} 值非法（${JSON.stringify(v)}）⇒ 忽略并用缺省：${String(e?.message || e).slice(0, 80)}`);
            }
        }
    }
    catch (e) {
        /* ⚠ **2026-09-20 round 10 实证修：此处原本是 `catch { /* 坏文件按纯缺省 *\/ }` —— 完全静默。**
         *   实测后果（本轮真实踩到）：`~/.dsh/suite/scheduler.json` 被写入 **UTF-8 BOM**（一次改 pin 的
         *   副作用）⇒ `JSON.parse` 抛 ⇒ 外层 catch 吞掉 ⇒ **文件里 16 个运行态配置键全部被丢弃**，
         *   而**不留任何痕迹**（`releaseAuto:true` / `proposalApply:true` / `mclFamiliarThreshold:0.58`
         *   等全被静默忽略，退回纯 schema 缺省）。
         *   这与本仓反复剿的形态同源：**把"坏掉了"显示成"没事"**；且 `warn` 通道**本来就在手边**
         *   （逐键分支一直在用它），只有这一层把它丢了。
         *   ⇒ 改为留痕：坏文件仍按纯缺省（安全语义不变），但**必须说出"整份配置被忽略"**。 */
        warn?.(`[shoucang] scheduler.json **整份读取失败，全部持久配置键已忽略（退回 schema 缺省）**：${String(e?.message || e).slice(0, 120)}`
            + '（常见成因：文件带 UTF-8 BOM / JSON 语法损坏 / 权限拒绝）');
    }
}
/** LLM 模型枚举（2026-09-10 起：直接用 Harness 模型体系；**2026-09-21 ACT-295 起委托 `src/llm-catalog.ts`**）。
 *  为什么搬家：本件原内联 20 行只回 `{provider,id,name}` ⇒ 面板**选不了档位**（reasoning effort），
 *    而宿主 `AgentOptions.reasoningEffort` 是真字段。档位富化需 `resolveModelInfo` 逐模型调用，
 *    塞回此处必撞本件冻结棘轮（基线 606）⇒ 按领域接缝抽到 `llm-catalog.ts`。 */
const llmModelsOf = (ctx) => createLlmCatalog(ctx);
/** shoucang_suite：suite 只读装配检测（矩阵单一实现在 targets.ts） */
function suiteTool(config) {
    return defineTool({
        name: 'shoucang_suite',
        description: '守藏 suite-manager 只读装配检测：核对 suite 成员（config members）在 injected（注入器 registry.json）与 profile（profiles/*/package.json bundles+deps）两个装配基准上的状态，输出 each member: status=injected|profile|both|missing + 来源明细。只读不改装。',
        parameters: {
            member: { type: 'string', description: '只查指定成员 id（缺省=全部）' },
            scope: { type: 'string', description: 'all|injected|profile（缺省 all）' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    members: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                package: { type: 'string' },
                                repo: { type: 'string' },
                                role: { type: 'string' },
                                status: { type: 'string' },
                                injected: { type: 'boolean' },
                                profiles: { type: 'array', items: { type: 'string' } },
                                detail: { type: 'string' },
                            },
                            // 注意：output schema 走 dsh-tools value schema DSL（0.1.2-rc.1），items 内 required 不被支持——不可恢复此行（2026-09-08 启动崩溃根因）
                            additionalProperties: false,
                        },
                    },
                    summary: { type: 'string' },
                },
                additionalProperties: false,
            },
            render: (_args, v) => {
                const rows = (v?.members || []).map((m) => `- ${m.id} [${m.status}] ${m.package}${m.repo ? ` (repo:${m.repo})` : ''}${m.detail ? ` — ${m.detail}` : ''}`);
                return [{ type: 'text', text: rows.length ? `suite 装配检测：\n${rows.join('\n')}\n${v?.summary || ''}` : 'suite 装配检测：无成员' }];
            },
        },
        async execute(args) {
            const scope = (args?.scope || 'all');
            const filter = (args?.member || '').toString().trim();
            const matrix = suiteAssemblyMatrix(memberSpecsOf(config));
            const rows = matrix.members
                .filter((m) => !filter || m.id === filter || m.package.includes(filter))
                .filter((m) => scope === 'all' || (scope === 'injected' && m.injected) || (scope === 'profile' && m.profiles.length > 0));
            const missing = rows.filter((r) => r.status === 'missing').length;
            const present = rows.length - missing;
            return {
                members: rows,
                summary: `共 ${rows.length} 成员（present ${present} / missing ${missing}）`,
            };
        },
    });
}
/** shoucang_verify：G3 验证门（G30 证据计数） */
function verifyTool() {
    return defineTool({
        name: 'shoucang_verify',
        description: '守藏 G3 验证门（G30 证据计数）：claims（断言数）≤ evidence_reads（工具实证数）才 pass，只信工具证据。输出对齐记忆审计 §8 第三问（route 分流质量抽验）可消费格式；无分布数据时仅证据判定。',
        parameters: {
            claims: { type: 'string', description: '断言/主张数（数字）' },
            evidence_reads: { type: 'string', description: '工具实证读取数（read_file/工具结果，数字）' },
            route: { type: 'string', description: '本次分流 route（memory|project|discard，审计 Q3 用）' },
            project_cards: { type: 'string', description: 'route=project 的卡产出数（审计 Q3 落点）' },
            route_total: { type: 'string', description: '同期 route 总样本数（审计 Q3 分布分母，可省）' },
            conflict: { type: 'string', description: 'yes|no（有冲突需裁决）' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    gate: { type: 'string' },
                    g30_pass: { type: 'boolean' },
                    claims: { type: 'number' },
                    evidence_reads: { type: 'number' },
                    fix_level: { type: 'string' },
                    audit: {
                        type: 'object',
                        properties: {
                            q3_route: { type: 'string' },
                            q3_route_present: { type: 'boolean' },
                            q3_cards_ok: { type: 'boolean' },
                            q3_pass_rate: { type: 'number' },
                        },
                        additionalProperties: false,
                    },
                    note: { type: 'string' },
                },
                additionalProperties: false,
            },
            render: (_a, v) => [
                {
                    type: 'text',
                    text: `gate=${v.gate} g30=${v.g30_pass} claims=${v.claims} evidence=${v.evidence_reads} fix=${v.fix_level}${v.audit?.q3_route ? ` auditQ3:route=${v.audit.q3_route} cardsOk=${v.audit.q3_cards_ok}` : ''} note=${v.note || '-'}`,
                },
            ],
        },
        async execute(args) {
            const c = Number(args?.claims) || 0;
            const e = Number(args?.evidence_reads) || 0;
            const g30Pass = e >= c;
            const conflict = (args?.conflict || 'no') === 'yes';
            const fix = !g30Pass ? 'L1-fix-evidence' : conflict ? 'L2-fix-adjudication' : 'L0-ok';
            const route = (args?.route || '').toString().trim();
            const cards = Number(args?.project_cards) || 0;
            const total = Number(args?.route_total) || 0;
            // 审计 §8 Q3：route=project 时核验「projectCards 落点」——有产出即 cards_ok；给分布则算 pass_rate
            const audit = {
                q3_route: route || 'memory',
                q3_route_present: route === 'project',
                q3_cards_ok: route === 'project' ? cards > 0 : true,
                q3_pass_rate: total > 0 ? Number((e / Math.max(total, 1)).toFixed(3)) : 0,
            };
            const note = !g30Pass
                ? 'G30 未过：claims 无足够工具实证，削减断言或补 read_file 证据'
                : conflict
                    ? '证据充分但存在冲突，需裁决'
                    : route === 'project' && cards === 0
                        ? 'route=project 但卡产出 0——审计 Q3 落点失败，检查 workspace docs/devref/shoucang 直写'
                        : '验证通过';
            return {
                gate: 'g3/verify',
                g30_pass: g30Pass,
                claims: c,
                evidence_reads: e,
                fix_level: fix,
                audit,
                note,
            };
        },
    });
}
/** shoucang_targets_probe：蒸馏目标层自测（只读） */
function targetsProbeTool() {
    return defineTool({
        name: 'shoucang_targets_probe',
        description: '守藏蒸馏目标层自测：单库路由解析 + 白名单门禁抽样（USER/AGENT 画像与 notes 白名单，不符合不存）。只读。',
        parameters: {},
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute() {
            const lines = selftestMatrix();
            return ['守藏蒸馏目标层自测（单库）：', ...lines].join('\n');
        },
    });
}
/** shoucang_recall：读侧召回（词法 + 可选向量融合） */
function recallTool(config) {
    return defineTool({
        name: 'shoucang_recall',
        description: '守藏读侧召回（词法版）：给一句话任务描述/问题，在记忆库索引行（AGENT [原则]/[路径] + MEMORY + USER）做确定性 top-k 关键词匹配，返回薄行与 notes 指针；命中后按指针 get_file 读详情小节。任务开始（认领类型）与卡住补检时调用。',
        parameters: {
            query: { type: 'string', description: '任务描述/问题（自然语言，如：把插件打包发布到 github）' },
            topK: { type: 'number', description: '返回条数（缺省 3，最多 5）' },
            scope: { type: 'string', description: 'agent=只查 AGENT.md（原则/路径）；all=AGENT+MEMORY+USER（缺省 all）' },
        },
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args) {
            const root = memoryLibRoot();
            const query = String(args?.query || '');
            const topK = Math.min(5, Number(args?.topK) || 3);
            const scope = args?.scope === 'agent' ? 'agent' : 'all';
            const { rows, tokens, mode } = await recallRanked(root, query, topK, scope, {
                enabled: !!config.embedEnabled,
                baseUrl: config.embedBaseUrl,
                model: config.embedModel,
                apiKeyEnv: config.embedApiKeyEnv || 'EMBED_API_KEY',
                coldFactor: (Number(config.recallColdFactorPercent) > 0 ? Number(config.recallColdFactorPercent) : 35) / 100, // v7 UI 可调（% → 0.35 缺省）
                fusionKind: config.recallFusion === 'weighted' ? 'weighted' : 'rrf', // v2：融合策略（缺省 RRF；可回滚）
                scoreMode: config.scoreWeights === 'v2' ? 'v2' : 'legacy', // v2.2：分层打分（缺省 legacy；切换需影子期证据）
                shadowScore: config.shadowScore !== false, // v2.2：影子打分
            });
            if (!rows.length) {
                // S5 召回零命中兜底（assistant-focus-plan S5）：不再静默新手态——
                // 给「库内主题地图 + 建议检索词 + pending 提醒」：near=notes/ 各文件小节清单（换问法的线索），
                // 建议词=库内出现过的查询高判别 token；并提醒收尾沉淀（跨会话第二次同型即转正成经验）。
                const { near, suggest } = recallApprox(root, query, scope === 'agent' ? 'agent' : 'all');
                const out = [`shoucang_recall：无全文命中（库 ${root}；token=${tokens.join(',') || '空'}）`];
                if (suggest.length)
                    out.push(`建议：查询词中「${suggest.join(' / ')}」在库内出现过——换措辞/组合重试（用库内术语）更易命中`);
                if (near.length) {
                    out.push('库内主题地图（可围绕以下话题换问法，或 get_file 直读详情）：');
                    out.push(...near.map((r) => `- ${r.line}`));
                }
                else
                    out.push('库内暂无 notes 主题（记忆库尚空/新库）——首次经验收尾沉淀候选，同类第二次跨会话即转正');
                out.push('下一步：按上面线索换词重试；确认经验有价值 → 收尾四步沉淀候选，不静默丢弃');
                return out.join('\n');
            }
            return [
                `shoucang_recall：命中 ${rows.length} 条（${mode === 'fusion' ? 'dense0.7+lexical0.3 融合' : '词法'}；token=${tokens.join(',')}）`,
                ...rows.map((r) => `- [${r.file}] ${r.line}`),
                '提示：以上为薄行指针，命中后按 `→ notes/…` 读详情小节；相似≠适用，展开前核对任务类型。',
            ].join('\n');
        },
    });
}
/** shoucang_associate：**联想候选**（向量"异域同构" · 2026-09-13）
 *
 * 职责切分（本项目用模型纪律 · 用户点拨）：
 *   · **向量**做候选生成（全对扫描、便宜、确定）；
 *   · **代码**做过滤（跨载体 / 词面不重叠 / 排序截断）；
 *   · **模型（调用本工具的那一方）**做裁决——"这两条是不是真在讲同一个道理"是模糊判断，且**理由本身才是价值**。
 *
 * 故本工具**只给候选与证据，不下结论**；落环由模型判断后走 association-ring 记账。
 * 为什么不在这里直接调 LLM：`ctx.llm` 是宿主服务，本工具**已经运行在宿主里**——真正在环的那个大模型
 *   就是调用方自己（对话中的模型）。把判断留在它手里，比再造一次子代理派发更直接也更省。 */
function associateTool(config) {
    return defineTool({
        name: 'shoucang_associate',
        description: '守藏联想候选（**只提案不判**）：在库内 notes 小节之间用**向量**找「异域同构」——语义高度相近、来自**不同文件**、且**词面几乎不重叠**（即同一道理出现在两个领域）。返回候选对 + 证据（相似度 / 共词），**由调用方模型判断是否真成立**并决定是否落环（association-ring 记账）。适用：收尾沉淀、跨主题回顾、卡住时找「别处也讲过类似的事」。',
        parameters: {
            minSim: { type: 'number', description: '相似度下限（缺省 0.72；bge-m3 余弦）' },
            maxShared: { type: 'number', description: '共有检索词上限（缺省 2；**大 ⇒ 只是用词像，属检索不属联想**）' },
            topN: { type: 'number', description: '候选条数（缺省 8，最多 20）' },
        },
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args) {
            // 管道**单一实现**在 `association-supply.ts`（工具 / 深睡 REM / CLI 三处共用）
            const s = await supplyAssociations(memoryLibRoot(), {
                enabled: !!config.embedEnabled,
                baseUrl: config.embedBaseUrl,
                model: config.embedModel,
                apiKeyEnv: config.embedApiKeyEnv || 'EMBED_API_KEY',
                coldFactor: 0.35,
            }, {
                minSim: Number(args?.minSim) || 0.72,
                maxShared: Number.isFinite(Number(args?.maxShared)) ? Number(args.maxShared) : 2,
                topN: Math.min(20, Number(args?.topN) || 8),
            });
            if (!s.proposals.length)
                return `shoucang_associate：${s.reason || '无候选'}`;
            return `shoucang_associate：${renderAssocBlock(s)}`;
        },
    });
}
/** assistant_capabilities：S3 能力自省（只读） */
function capabilitiesTool(ctx, config) {
    return defineTool({
        name: 'assistant_capabilities',
        description: '助理能力自省（只读）：返回当前 Agent 的能力面——按族归类的可见工具清单、装配与权限状态、记忆库边界纪律（AGENT.md [边界] 行/红线）。任务认领（澄清意图）前自查「我现在会什么、不会什么、边界在哪」，判断任务是否需要新能力/升级用户；不替代具体工具。',
        parameters: {},
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute(_args, exec) {
            const parts = [];
            // ① 当前 Agent 可见工具面（按族归类）
            try {
                const agent = exec && exec.agent;
                const schemas = (agent ? ctx.tools?.schemas?.(agent) : ctx.tools?.schemas?.()) || [];
                const FAMILIES = [
                    ['记忆/召回', /shoucang_|recall|memory|managing|delta/],
                    ['执行/命令', /^(pwsh|bash|shell|terminal|job|subprocess|task)/],
                    ['文件/读写', /^(fs|read|write|edit|glob|grep|file|str_replace|search_files)/],
                    ['检索/网页', /web|search|fetch|page|platform|browser/],
                    ['视觉/媒体', /vision|image|screen|read_image|ocr|audio/],
                    ['治理/项目', /nav_|project|governance|architecture/],
                    ['开发/注入', /dev_|plugin|inject|scaffold|build|reload|stage/],
                    ['编排/多代理', /subagent|workflow|agent|goal|plan|todo|ralph/],
                    ['工具/技能', /^tool_|^skill$/],
                ];
                const byFamily = new Map();
                const other = [];
                for (const s of schemas) {
                    const n = s.name || '';
                    const hit = FAMILIES.find(([, re]) => re.test(n));
                    if (hit) {
                        const arr = byFamily.get(hit[0]) || [];
                        arr.push(n);
                        byFamily.set(hit[0], arr);
                    }
                    else
                        other.push(n);
                }
                const lines = [`可见工具 ${schemas.length} 个（按族）：`];
                for (const [fam, names] of byFamily)
                    lines.push(`- ${fam} (${names.length})：${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}`);
                if (other.length)
                    lines.push(`- 其他 (${other.length})：${other.slice(0, 10).join(', ')}${other.length > 10 ? '…' : ''}`);
                lines.push('（完整 schema 已在工具目录可见；此处为族级概览。要精确看某工具用法直接读其描述。）');
                parts.push(lines.join('\n'));
            }
            catch (e) {
                parts.push(`⚠ 工具面枚举失败：${String(e?.message || e).slice(0, 120)}`);
            }
            // ② 记忆库在位 + AGENT 边界纪律
            try {
                const memRoot = memoryLibRoot();
                const agentFile = join(memRoot, 'AGENT.md');
                if (!existsSync(agentFile)) {
                    parts.push('⚠ 记忆库缺席（AGENT.md 不在）——能力边界纪律不可用');
                }
                else {
                    const ag = readFileSync(agentFile, 'utf8');
                    const bounds = ag.split(/\r?\n/).filter((l) => /\[边界\]|\[原则\]/.test(l)).map((l) => l.trim()).filter(Boolean);
                    if (bounds.length)
                        parts.push(`记忆库边界/原则（${bounds.length} 条，常注入）：\n${bounds.map((b) => `- ${b}`).join('\n')}`);
                }
            }
            catch { /* 边界读取失败不致命 */ }
            // ③ 装配与蒸馏状态
            try {
                const sm = suiteAssemblyMatrix(memberSpecsOf(config));
                parts.push(`suite 装配：${sm.summary || `${memberSpecsOf(config).length} 成员`}`);
            }
            catch { /* 装配信息可选 */ }
            return parts.join('\n\n');
        },
    });
}
/** 蒸馏器装配参数（scheduler.Config → distill 入参的**唯一映射点**） */
function distillOptionsOf(config) {
    return {
        nodeBin: 'node',
        // S3-1（2026-09-14）：蒸馏与深睡**独立启停** —— 本字段决定蒸馏的**触发入口**是否武装
        //   （见 distill.ts 的 `domDistill`）。装配条件见 applyScheduler 的 `||` 分支。
        enableDistill: config.enableDistill,
        capAgent: config.capAgent,
        capUser: config.capUser,
        capMemory: config.capMemory,
        idleWakeMs: config.idleWakeMs,
        minTurnChars: config.minTurnChars,
        distillPrescan: config.distillPrescan,
        prescanMinChars: config.prescanMinChars,
        distillPrompt: config.distillPrompt,
        // ACT-295：路由域 8 键（含档位）经 `modelOptionsOf` **显式映射**（与 schema 同文件，单一事实源）。
        ...modelOptionsOf(config),
        enableDeepSleep: config.enableDeepSleep,
        enableRemPass: config.enableRemPass,
        deepSleepIdleMs: config.deepSleepIdleMs,
        // S-P2b（2026-09-20）：探测域 8 键经 `probeOptionsOf` **显式映射**（与 schema 同文件，单一事实源）。
        //   ⚠ 本件下方两行注释记的「schema 有 ≠ 运行时 config 有」正是本形态最容易漏的坑：
        //   新增键必须**在 probe-config.ts 内两处都加**（schema + 映射），**不要**回到本文件散着写。
        ...probeOptionsOf(config),
        // M1（ACT-283）：评估域 6 键经 `evalOptionsOf` 显式映射（同 probe 域法，防「schema 有 ≠ config 有」）。
        ...evalOptionsOf(config),
        // ⚠ 2026-09-16 补：这两个键**此前只在 zod schema 里、没进本映射** ⇒ 白名单不报警（schema 认得），
        //   但下游 `config` 里**永远是 undefined** ⇒ 功能"接线了却开不了"（实测：置 cap=30000 后仍 `chunk=0/1`）。
        //   教训：**schema 有 ≠ 运行时 config 有** —— 本件是"显式映射"形态，新增键必须**两处都加**。
        deepSleepContentMinChars: config.deepSleepContentMinChars,
        deepSleepMaterialChunkChars: config.deepSleepMaterialChunkChars,
        deepSleepDaemonParent: config.deepSleepDaemonParent,
        activationShadow: config.activationShadow,
        activationPrefetch: config.activationPrefetch,
        activationTOn: config.activationTOn,
        activationTOff: config.activationTOff,
        activationCooldownSteps: config.activationCooldownSteps,
        activationTopK: config.activationTopK,
        embedEnabled: config.embedEnabled,
        embedBaseUrl: config.embedBaseUrl,
        embedModel: config.embedModel,
        embedApiKeyEnv: config.embedApiKeyEnv,
        recallFusion: config.recallFusion,
        bankGit: config.bankGit,
        injectProfileRows: config.injectProfileRows,
        scoreWeights: config.scoreWeights,
        shadowScore: config.shadowScore,
        maturationEnforce: config.maturationEnforce,
        perItemGate: config.perItemGate,
        selfCheck: config.selfCheck,
        selfCheckRepo: config.selfCheckRepo,
        selfCheckAutoRollback: config.selfCheckAutoRollback,
        selfCheckIntervalHours: config.selfCheckIntervalHours,
        storeMode: config.storeMode,
        // v7 活性/遗忘/加深校准阈值（scheduler.Config 同键名直传，运行时生效）
        activityWarmDays: config.activityWarmDays,
        activityColdDays: config.activityColdDays,
        activityArchiveDays: config.activityArchiveDays,
        activityHotHits: config.activityHotHits,
        recallColdFactorPercent: config.recallColdFactorPercent,
    };
}
/** scheduler 装配面（**单一实现**）：此前 enableDistill 开/关两条分支各写了一份
 *  完全相同的对象（15 行 ×2），改一处漏一处就会让 panel /suite 与 /distill/config 读数漂移。
 *  2026-09-13：返回值以 `SchedulerApi` 标注 ⇒ 与 root 句柄盒的形状**编译期对齐**（漂移即报错）。 */
function schedulerShareApiOf(config, llmModels) {
    return {
        suiteScan: () => suiteAssemblyMatrix(memberSpecsOf(config)),
        distillConfig: () => ({
            enableDistill: config.enableDistill,
            idleWakeMs: config.idleWakeMs,
            minTurnChars: config.minTurnChars,
            distillPrescan: config.distillPrescan,
            // ACT-295：路由域经 `modelOptionsOf` 单一映射（含 distillEffort / sleepEffort）
            ...modelOptionsOf(config),
        }),
        llmModels,
    };
}
/** ACT-029 认知环（MCL）装配：与蒸馏器**解耦**（不依赖 enableDistill） */
function assembleMcl(ctx, config, comp) {
    try {
        const mcl = registerMcl(ctx, {
            enabled: config.mclEnabled !== false,
            // 2026-09-11（缺陷2 附带修复）：缺省原为**硬编码 0.65** —— 注册表改了也不生效（SSOT 破口）。
            //   现读投影 SURFACE.mcl.familiarThreshold（唯一事实源 = criteria.json），/set 仍可热覆盖并回滚。
            familiarThreshold: Number(config.mclFamiliarThreshold) > 0
                ? Number(config.mclFamiliarThreshold)
                : (Number(SURFACE.mcl?.familiarThreshold) || 0.58),
            maxNudges: Math.max(0, Number(config.mclMaxNudges) || 0),
            budgetChars: Math.max(120, Number(config.mclBudgetChars) || 600),
            materialInSystem: config.mclMaterialInSystem === true,
            topK: Math.min(5, Math.max(1, Number(config.mclTopK) || 3)),
            audit: config.mclAudit !== false,
            embed: {
                enabled: !!config.embedEnabled && !!config.embedBaseUrl && !!config.embedModel,
                baseUrl: String(config.embedBaseUrl || ''),
                model: String(config.embedModel || ''),
                apiKeyEnv: String(config.embedApiKeyEnv || ''),
                coldFactor: (Number(config.recallColdFactorPercent) > 0 ? Number(config.recallColdFactorPercent) : 35) / 100,
            },
        });
        // G0 composition root（2026-09-13）：句柄交给 root 的**显式句柄盒**，不再写模块级全局 holder
        //   （原 `mclShare.api = …`）。后者是跨模块隐式通道 —— 依赖关系无法静态核对，正是桥的成因。
        if (mcl && comp)
            comp.mcl.current = { status: () => mcl.status() };
    }
    catch (e) {
        ctx.logger?.warn?.(`[shoucang] MCL 装配失败（认知环跳过）：${String(e?.message || e).slice(0, 120)}`);
    }
}
export function applyScheduler(ctx, config, comp) {
    applySuiteConfigFile(config, (m) => ctx.logger?.warn?.(m));
    const llmModels = llmModelsOf(ctx);
    // 每个工具的完整定义见同文件各 xxxTool() 工厂——一个工具一个函数，改一个不牵连其余
    ctx.effect(() => ctx.tools.register(suiteTool(config)), '@dsh-external/shoucang-scheduler: suite tool');
    ctx.effect(() => {
        if (!config.verify_enabled)
            return () => { };
        return ctx.tools.register(verifyTool());
    }, '@dsh-external/shoucang-scheduler: verify tool');
    ctx.effect(() => ctx.tools.register(targetsProbeTool()), '@dsh-external/shoucang-scheduler: targets probe tool');
    ctx.effect(() => ctx.tools.register(recallTool(config)), '@dsh-external/shoucang-scheduler: recall tool');
    // 联想候选（2026-09-13 · 用户点拨「联想这种纯代码基本实现不了」）：
    //   向量做候选 · 代码做过滤 · **模型（调用方）做裁决**——工具只提案不判，把模糊判断留在环里。
    ctx.effect(() => ctx.tools.register(associateTool(config)), '@dsh-external/shoucang-scheduler: association propose tool');
    ctx.effect(() => ctx.tools.register(capabilitiesTool(ctx, config)), '@dsh-external/shoucang-scheduler: assistant capabilities tool');
    // 蒸馏器 + 深睡装配（参数映射见 distillOptionsOf）
    // S3-1（2026-09-14）**维护链与生产链独立启停**：此前条件是 `if (config.enableDistill)` ⇒
    //   关蒸馏会**连带把深睡也关掉**（反向不独立，是 S3 验收 A1 的一条）。深睡自身的门在
    //   `deepsleep-machine.ts:129/193`（读 `enableDeepSleep`）⇒ 此处只需「两者任一开启即装配」，
    //   蒸馏侧由 `distill.ts` 的 `domDistill` 单独关（触发入口置 no-op），与深睡互不牵连。
    if (config.enableDistill || config.enableDeepSleep) {
        const distill = registerDistill(ctx, distillOptionsOf(config));
        // G0 composition root（2026-09-13 第二刀）：`deepsleep-share` 退役，句柄进 root 的显式盒
        if (distill && comp)
            comp.deepSleep.current = distill;
    }
    // G0 composition root（2026-09-13 第三刀 · 收尾）：`scheduler-share` 退役，装配面进 root 的显式盒。
    // 蒸馏器关闭也要给 panel 提供装配矩阵（/suite 是只读视图，与蒸馏无关）⇒ 无条件装入。
    if (comp)
        comp.scheduler.current = schedulerShareApiOf(config, llmModels);
    assembleMcl(ctx, config, comp);
}
//# sourceMappingURL=scheduler.js.map