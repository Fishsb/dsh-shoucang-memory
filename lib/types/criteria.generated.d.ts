export declare const CRITERIA_VERSION = "v2.2.0";
/** 摄取域判据段（拼进 DEFAULT_DISTILL_PROMPT） */
export declare const INGEST_JUDGE: string;
/** 巩固域判据段（拼进 DEEP_SLEEP_PROMPT） */
export declare const CONSOLIDATE_JUDGE: string;
export declare const JUDGEMENT_HINT = "judgement\uFF1A\u53EF\u9009\u5BF9\u8C61\uFF0C\u628A\u672C\u6B21\u5224\u636E\u53D6\u503C\u5199\u8FDB\u8F93\u51FA\uFF08reuse/generality/stability/conflict/dup \u6216 evidence/stability/conflict/cost\uFF1B\u53D6\u503C\u89C1 criteria \u6CE8\u518C\u8868\uFF09\uFF0C\u5BBF\u4E3B\u636E\u6B64\u5199\u7EDF\u4E00\u53F0\u8D26 audit/ledger.jsonl\uFF08type=decision.*\uFF09\u4F9B\u5BF9\u8D26\u3002";
export declare const JUDGEMENT_VALUES = "- **judgement \u53D6\u503C\u57DF\uFF08\u5FC5\u987B\u9010\u5B57\u53D6\u4E0B\u5217\u4E4B\u4E00\uFF0C\u7981\u81EA\u9020\u3001\u7981\u5199\u4E2D\u6587\u3001\u7981\u5199\u6574\u53E5\uFF09**\uFF1Areuse=cross-task|cross-project|session-only \u00B7 generality=direction|contract-fact|detail \u00B7 stability=once|same-day-repeat|cross-day \u00B7 conflict=none|coexist|supersede\u3002\u5176\u4E2D `conflict` \u4E09\u4E49\u987B\u5206\u6E05\uFF1A`none`=\u4E0E\u65E2\u6709\u4E0D\u51B2\u7A81 \u00B7 `coexist`=\u4E0E\u65E2\u6709\u5E76\u5B58\uFF08**\u4E0D\u53D6\u4EE3**\uFF09\u00B7 `supersede`=**\u53D6\u4EE3\u65E2\u6709**\uFF08\u65E7\u6761\u76EE\u6807\u8BB0\u4E3A\u5DF2\u5931\u6548\uFF0C\u8BFB\u8005\u4E0D\u518D\u89C1\u5230\u5B83\uFF09\u3002\u62FF\u4E0D\u51C6\u65F6\u586B `none`\uFF08**\u5B81\u7F3A\u6BCB\u6EE5**\u2014\u2014\u9519\u586B `supersede` \u4F1A\u8BA9\u771F\u4E8B\u5B9E\u88AB\u6807\u5931\u6548\uFF09\u3002";
export declare const LEDGER_FILE = "audit/ledger.jsonl";
export declare const L0: {
    readonly reuse: {
        readonly values: readonly ["cross-task", "cross-project", "session-only"];
        readonly text: "可复用性：跨任务 / 跨项目 / 仅本会话";
    };
    readonly generality: {
        readonly values: readonly ["direction", "contract-fact", "detail"];
        readonly text: "泛化度：方向指引（粗）/ 契约事实 / 细节条文";
    };
    readonly stability: {
        readonly values: readonly ["once", "same-day-repeat", "cross-day"];
        readonly text: "稳定性：单次 / 当日重现 / 跨日或多会话重现";
    };
    readonly conflict: {
        readonly values: readonly ["none", "coexist", "supersede"];
        readonly text: "冲突性：无 / 与既有并存 / 取代既有";
    };
};
export declare const GATE: {
    readonly caps: {
        readonly "MEMORY.md": 5000;
        readonly "USER.md": 3000;
        readonly "AGENT.md": 3000;
    };
    readonly notesWarn: 8000;
    readonly budgetFormula: {
        readonly lineChars: 100;
        readonly fixed: 56;
        readonly pointer: 44;
    };
    readonly exit: {
        readonly capacity: 1;
        readonly pointer: 2;
        readonly format: 4;
    };
    readonly envOverride: {
        readonly "MEMORY.md": "SHOUCANG_CAP_MEMORY";
        readonly "USER.md": "SHOUCANG_CAP_USER";
        readonly "AGENT.md": "SHOUCANG_CAP_AGENT";
    };
};
export declare const HEALTH: {
    readonly R: 1000;
    readonly K: 6;
    readonly notesWarn: 8000;
    readonly checks: readonly ["capacity", "duplicates", "tags", "pointers", "section-existence", "index-ledger-coverage", "inject-token-account", "placement-audit"];
};
export declare const SURFACE: {
    readonly injection: {
        readonly budgetChars: 4000;
        readonly budgetNote: "热记忆注入**恒定面安全带**（字符）。语义（2026-09-13 v2 修正）：恒定面（双画像索引行 + P 层画像行）**必在、不按比例裁**，本值只防库无界膨胀；变动面（知识索引）≤600、一次性面（成长 delta）≤200 各有硬顶，超预算的行被裁且**留痕提示**（不静默）。测算：AGENT 索引 1,138 + USER 索引 430 + 画像行 ≈630 + 标题 ≈1,990 ⇒ 实际每步 ≈2,800 上限。原 1800（三层按比例分档）会把 AGENT 侧 `[原则]`/`[路径]` 裁掉一半以上、损伤人格一致性，已回退该口径。**⚠ 2026-09-14（P8 收口 · 实测否决）**：P8 原计划「恒定面**框架化**」（把清单降为「框架 + 可展开指针」）**经实测否决，不再重议**——测得每步真实 **2391–2977 字符**（Q1），其中 P 层 **1756 字符**，而 **`[原则]`+`[路径]` = 1532 字符（87%）且 18 条互不重复**（画像行与索引行**同名重复 = 0**）；**可压面只剩指针尾巴 302 字符（≈总 10%）**，而压缩会把 `notes/lessons.md §X` 变成缩写 ⇒ **引入新的指针解析失败模式**（与「模型须能按指针取详情」及 L2「误注入代价 > 漏注入」冲突）。⇒ 结论：**无既定的可收益压缩面**；恒定面之所以大，是因为它**几乎全是承载人格的习得原则**，而不是「灌」。要再压须先改变「原则不得裁」这条口径本身（那是一条已拍板的价值选择，不在本方案范围内）。";
        readonly order: 88;
        readonly relevance: true;
        readonly freshSlots: 2;
        readonly levelCaps: {
            readonly low: 2;
            readonly medium: 4;
            readonly high: 8;
            readonly smart: 10;
        };
        readonly carriers: {
            readonly profile: 6;
            readonly note: "P 层画像行注入上限（0=关闭 → 回滚到「画像行不注入」的旧行为）。沿革：2026-09-13（P0）3→4（配额改「按标签各留最近 1 条」）；同日 4→6（质量评估 R3）：实测被挡下的画像行 agent 3 条 / user 13–14 条，其中有「架构议题要抛开历史决策约束…」「UI 判定须视觉实证」等高价值偏好——提到 6（zod 上限）以减少「最有用的那几条恰好被挡」的概率；仍受稳定面安全带与块内配额约束，被挡者留痕可见。上限可配 injectProfileRows（0–6）";
        };
        readonly situation: {
            readonly enabled: true;
            readonly budgetChars: 1200;
            readonly cueDims: readonly ["scope", "task"];
            readonly cueDimRules: {
                readonly scope: "路径归一：`\\`→`/` · 去尾斜杠 · 折叠重复斜杠 · **不改大小写**（POSIX 敏感）";
                readonly task: "kebab：小写 · 空白/下划线→`-` · 折叠 `-` · 去首尾 `-`（CJK 原样保留）";
            };
            readonly cueDimNote: "★IR1 册二（2026-09-18）**契约描述现状**：声明维 = **读侧真会产出**的维（`panel-shared#sitCtx` 只填 `scope` + `task`）。原声明的 `subject`/`event` **已删** —— 实测**两侧皆不产**（写侧存量 0 条、读侧无产出点），留着就是「声明了却永不匹配」的假契约（与「契约须描述现状」同族）。值规则**单一实现**在 `src/cue-space.ts#CUE_VALUE_RULES`（本表只声明文案，防两处漂移）。**收编路径**：若模型反复写某未声明维（`cue.rejected` 审计会带键名），把它**显式登记**进本表 + 在 `cue-space` 加值规则 + 在读侧补产出点，再由 `check-cue-space`（B5 双向）守。";
            readonly ringOrder: readonly ["relation", "decision", "association", "fact", "value"];
            readonly topN: 3;
            readonly note: "**情境层（第三槽）**：环记录（`file=''`，无 md 投影）不进内容相关性面，而由**情境键匹配**（cue-driven）供给——依据是编码特异性（提取取决于「编码情境↔提取线索」匹配，非内容相似度）与前瞻记忆多进程框架（承诺/意图须线索驱动，纯战略监控在高负荷下系统性失败）。enabled=false 且 budgetChars=0 ⇒ **缺省零行为变化**（照抄 serendipity 槽先例）。cueDims 是**唯一维度声明处**（situation-key.ts 按它迭代，不另立名单）；ringOrder 按**环**排序（commitment 与 relation 同属 relation 环；episode 属 fact 环——故不按 kind 排，避免把两个语义层混进一张表）。**2026-09-14 P7 订正**：原先把 `value` 环排除在外，理由是「走图式层」——但图式层走的是 **md 投影行**，而 `valence` 记录是 `file=''` 的**环记录** ⇒ 实测它**两条路都不可达**（既不在恒定面、也不在 ringOrder）。现把 `value` 补进 ringOrder **末位**：只有 `file=''` 的 value 环记录（即 valence；`persona`/`principle`/`preference` 皆带 md 投影或不产出）能进，故不会挤占。**同时放弃原计划的 `alphaVal` 打分项**：`layeredScore` 的打分对象是**索引行**，索引行**没有 valence 信号**（valence 只存在于环记录 meta）⇒ 加它只能是恒 0 的**假旋钮**（仓内警示的「假可控」）。valence 的正确定位是**情境召回**，不是相关性权重。";
            readonly adaptive: true;
            readonly adaptiveNote: "S4-5（2026-09-14）：`true` ⇒ 情境槽 `topN` 由**活体环记录数**派生（clamp(ceil(√N),3,12)，实测 N=105 ⇒ 11）；`false` ⇒ 回退固定 `topN`。判因：固定 3 而库内环记录 105 条 ⇒ 命中率天花板 ≈3%，\"库越大经历面越稀释\"。";
        };
        readonly process: {
            readonly enabled: true;
            readonly carrierTag: readonly ["路径"];
            readonly topN: 3;
            readonly gate: "tag";
            readonly budgetChars: 300;
            readonly note: "S4-3（2026-09-14）**中层 process 槽**：任务级供给 —— 按标签取 `[路径]` 行（**不走内容相关性竞争**）。判因：人类三层结构里**中层是唯一没有专用通路的层**（`[路径]` 现经 R 层 gated 相关性召回，与其它内容争同一预算；且实测库内 `[路径]` 仅 5 条）。★2026-09-18 **启用**（原 enabled:false）：按域路由方案 P0-b —— task 路由 = 打开本槽（零新代码）。⚠ 原 note 称「运行时实现被前置重构阻塞（panel-shared 大模块冻结棘轮）」**该判断已过期**：实测 `src/dynamic-select.ts` 已有 `selectProcessLines`(:80-95) 且 `panel-shared.ts:551-553` 已有 `process`/`processRows` 消费点（S4-3 的动态面选行领域拆分已完成）⇒ 启用即生效，无需前置。额度语义：本槽行 **不吃 dynamic cap**（`dynamic-select.ts:145-154` 额外占位）⇒ 总额不再无界的前提是封顶只在 `budgetOf`（见 surface.injection.note）。★**Q4（2026-09-20）新增 `gate`**：`tag`（缺省）⇒ 旧行为（按标签取前 topN 条，**零行为变化**）；`task` ⇒ 按**离散任务键**（`situation-key#taskCueOf` 读侧产出）过滤行。**判因**：真机实测三个语义无关 query（三种长期记忆梳理／深睡蒸馏怎么触发／发布插件到 github release）得到**同一组 3 条** `[路径]` ⇒ 原注自称「任务型门控」与运行态不符（那是**位置门控**）。**当前只落结构、gate 保持 tag 不启用 task**——未决项：`[路径]` 行是 md 索引行**不带 cues**（cues 只在环记录 meta），任务键与行的对齐口径（借指针 § 对齐 / 退回 `recallIndex` 词法打分）属结构选择，未裁前启用即造第二个假旋钮。**硬约束**：本槽门控**不得复用** `surface.mcl.familiarThreshold`（0.55）——那是 dense 相似度量纲，与任务键的**有/无离散命中**不是同一件事（复用即量纲误用）。";
        };
    };
    readonly score: {
        readonly mode: "v2";
        readonly alphaRel: 1;
        readonly alphaImp: 0.25;
        readonly alphaRec: 0.1;
        readonly note: "v2.2 统一打分：score = α_rel·relevance(RRF) + α_imp·importance + α_rec·recency。**α_imp=0.25 由模拟证据选定**（scripts/shadow-sim.mjs 扫描：α=0.35→top-3 Jaccard 0.56 扰动过大；α=0.25→0.68 满足预注册判据 Jaccard≥0.6，且 corr(imp,rel)=−0.293 证明分量不冗余、扰动方向为『换进更重要条目』）。**mode=v2 已于 2026-09-11 翻转**（运行时开关 scheduler.scoreWeights=v2 同步）；回滚 = 两处同时回 legacy";
    };
    readonly recall: {
        readonly topK: 3;
        readonly topKMax: 5;
        readonly scope: "all";
        readonly coldFactorPercent: 35;
    };
    readonly fusion: {
        readonly kind: "rrf";
        readonly k: 60;
        readonly fallback: "weighted";
        readonly weights: {
            readonly dense: 0.7;
            readonly lexical: 0.3;
        };
        readonly dedupBySection: true;
    };
    readonly threshold: {
        readonly metric: "abs-cosine";
        readonly tOn: 0.65;
        readonly tOff: 0.6;
        readonly note: "ACT-024 校准：绝对余弦；归一化融合分只能排序不可做阈值";
    };
    readonly rerank: {
        readonly enabled: false;
        readonly gate: {
            readonly indexRows: 200;
            readonly followRateDropRuns: 2;
        };
        readonly note: "触发门未达前不引入 reranker（避免堆叠）";
    };
    readonly mcl: {
        readonly familiarThreshold: 0.55;
        readonly maxNudges: 1;
        readonly budgetChars: 600;
        readonly topK: 3;
        readonly note: "2026-09-11 阈值重校准（缺陷2）：旧值 0.65 在实测样本上**结构性不可达**——193 条 mcl-step 审计 sim 分布 max=0.634 / mean=0.5658 / p75=0.609 / p90=0.624，≥0.65 命中 **0 行** ⇒ 快通道恒为 0（快/慢分流退化为单一慢通道）。**2026-09-14 P7 二次重校准（D3）**：在 **936 条** sim 样本上按**预注册判据**（目标覆盖率 = 注册表原始意图 27.5%）取分位——实测 p50=0.513 / p60=0.529 / p70=0.548 / p72.5=0.548 / **p75=0.561** / p90=0.575 / max=0.662；扫阈值得 0.54→38.9% · **0.55→25.4%** · 0.56→25.1% · 0.57→11.9% · 0.58→**9.3%**（= 上轮值，实测远低于其自述的 27.5%）。取 **0.55**（最接近 27.5% 且落在拐点上）。回滚：**/set mclFamiliarThreshold 0.58**（全局 scheduler.json，热生效，无需重启）。**另一道门 hasHighConf 未放宽**（仍要求 mclGate 标签），故实际快通道触发率显著低于 25.4%。 **2026-09-15 复验（OPEN-1 · 判据未变）**：样本累积至 **2154 条** sim，按同一预注册判据（目标覆盖率 27.5%）重扫——p50=0.521 / p75=0.559 / p90=0.593；扫阈值得 0.54→39.1% · **0.55→27.5%**（距目标 **0.0pp**）· 0.56→24.9% · 0.57→17.0% ⇒ **0.55 仍是最优，维持不改**。工具：复用既有 **`scripts/mcl-calibrate.mjs`**（已扩展：含**预注册目标判据**与**真实可救回集**，报告态不入 CHECKS；⚠ 未另建新器 —— 规则 5 不从零造轮子）；**复检触发 = 近期带 `missReason` 样本 N≥300（现 120）**。⚠ 同期 `recall-diagnose` 的 **coarse** `advice` 给出 `lower-threshold`，与本**细校准相反** ⇒ **以本校准为准**（降 0.54 会**过冲注册意图 11.6pp**）。且降阈值**只能救 `below-threshold`**（`no-highconf` 在阈值判定**之前**已出局）⇒ 若要继续改善，须另立**召回层**项。";
    };
};
export declare const CARRIERS: {
    readonly note: "载体契约（v2.2 · ADR-130）：每个标签声明 layer（生效层）+ form（存在形式）+ inject（可注入性）。P 层 always（恒常、不参与相关性竞争）；R/E 层 gated（按任务型/相关性调用）；notes/audit 为 none。读取面必须实现每种 injectable 载体的渲染器（机检 scripts/check-carriers.mjs）。";
    readonly tags: {
        readonly 身份: {
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
        };
        readonly 使命: {
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
        };
        readonly 边界: {
            readonly layer: "P";
            readonly form: "profile";
            readonly inject: "always";
        };
        readonly 性格: {
            readonly layer: "P";
            readonly form: "profile";
            readonly inject: "always";
            readonly new: true;
        };
        readonly 认知: {
            readonly layer: "P";
            readonly form: "profile";
            readonly inject: "always";
            readonly new: true;
        };
        readonly 演化: {
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
        };
        readonly 偏好: {
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
        };
        readonly 习惯: {
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
        };
        readonly 原则: {
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
            readonly mclGate: true;
            readonly note: "仅跨环境稳定者；带情境前提者交深睡按 A≥gate 决定是否升 P。mclGate=true：命中即计 MCL 快通道「高置信」（2026-09-11 自 mcl.ts 硬编码正则归还注册表）";
        };
        readonly 经验: {
            readonly layer: "E";
            readonly form: "index";
            readonly inject: "gated";
            readonly note: "v2.2 D7 修正：情境经验属经验层，不再当 always-on";
        };
        readonly 教训: {
            readonly layer: "E";
            readonly form: "index";
            readonly inject: "gated";
            readonly note: "体检脚本 AGENT 侧既有标签（agent 教训≈lesson），一并登记";
        };
        readonly 路径: {
            readonly layer: "R";
            readonly form: "index";
            readonly inject: "gated";
            readonly mclGate: true;
            readonly note: "任务型门控（复用 ACT-029 MCL 快通道熟悉度分流）。mclGate=true：命中即计 MCL 快通道「高置信」（2026-09-11 自 mcl.ts 硬编码正则归还注册表）";
        };
        readonly env: {
            readonly layer: "E";
            readonly form: "index";
            readonly inject: "gated";
        };
        readonly tool: {
            readonly layer: "E";
            readonly form: "index";
            readonly inject: "gated";
        };
        readonly flow: {
            readonly layer: "E";
            readonly form: "index";
            readonly inject: "gated";
        };
        readonly lesson: {
            readonly layer: "E";
            readonly form: "index";
            readonly inject: "gated";
        };
        readonly 环境: {
            readonly layer: "E";
            readonly form: "index";
            readonly inject: "gated";
            readonly note: "2026-09-18 标签漂移归一（原 layer:P + inject:always）。判因（实测）：原 note 称「USER 侧：用户环境构成」，但 MEMORY.md 有 64 条挂此标签、其中约 8 成与 `[env]` 同指 notes/env.md ⇒ 同一信息源两种待遇；且 P⇒always 使这 64 条挤占恒定预算（实测恒定面需求 6263 字符 vs budgetOf 分配 3200）⇒ 归一为 E/gated，与 `[env]` 同待遇。USER.md 侧仅 1 条 `[环境] Win11+git-bash` 随之转为按需召回；如需恢复常驻，应另立 P 层标签（如 `[设备]`）而非复用本标签。";
        };
        readonly 硬件: {
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
        };
    };
    readonly renderers: {
        readonly "always:index": "src/panel.ts#readCarrier（索引行 always 全量按档位 cap）";
        readonly "always:profile": "src/panel.ts#readCarrier（画像行 `- … ← 源:` ≤ injection.carriers.profile 条/档；P 层 profile 标签由注册表驱动）";
        readonly "gated:index": "src/targets.ts#recallIndex + src/vec.ts#recallRanked（相关性/任务型门控）";
        readonly "none:notes": "src/panel.ts#/memory/sections（按需读取，不注入）";
        readonly "none:audit": "scripts/criteria-audit.mjs（只读审计，不注入）";
    };
};
export declare const SCORE: {
    readonly mode: "v2";
    readonly alphaRel: 1;
    readonly alphaImp: 0.25;
    readonly alphaRec: 0.1;
    readonly note: "v2.2 统一打分：score = α_rel·relevance(RRF) + α_imp·importance + α_rec·recency。**α_imp=0.25 由模拟证据选定**（scripts/shadow-sim.mjs 扫描：α=0.35→top-3 Jaccard 0.56 扰动过大；α=0.25→0.68 满足预注册判据 Jaccard≥0.6，且 corr(imp,rel)=−0.293 证明分量不冗余、扰动方向为『换进更重要条目』）。**mode=v2 已于 2026-09-11 翻转**（运行时开关 scheduler.scoreWeights=v2 同步）；回滚 = 两处同时回 legacy";
};
export declare const MATURATION: {
    readonly A0: 0.3;
    readonly step: 0.2;
    readonly gate: 0.5;
    readonly enforce: false;
    readonly note: "成熟度（v2.2 E6）：A(0)=A0；每次跨日再现 +step（上限 1.0）；只有 A≥gate 才允许升格为 [原则]/[路径]；A<gate 不注入但参与打分（implicit priming）。enforce=false 时只记录不强制（M4 影子期）。**2026-09-14（P7 · D11）决策：保持 false，并把依据写在这里**——`maturation-scan` 实测**拦阻率 57.4% > 50%**，扫描器自己的判据是「翻 enforce 会**冻结升格**」⇒ 当前不可翻。**记录该决策的目的**：把 `false` 从「疑似遗漏的开关」变成「**有实测依据的选择**」，后来人不必重查。要翻转须先让拦阻率降到 50% 以下（信号源=activity.days30 / access.log 的观测窗口仍在积累）";
    readonly ledger: "audit/maturation.jsonl";
};
export declare const TRIGGER: {
    readonly idleMs: 2700000;
    readonly probeAfterMs: 2700000;
    readonly probeWindowMs: 60000;
    readonly newTracesMin: 1;
    readonly contentMinChars: null;
    readonly materialChunkChars: 52232;
    readonly manual: true;
    readonly note: "触发数据化（v2.1 §2.4 · B 档接线后为 runtime）：idleMs=全部根会话停滞阈值；probeAfterMs/probeWindowMs=卡住探测；**newTracesMin=窗口材料下限（⚠ 2026-09-20 round 9 名实订正：原写「窗口内最少新痕迹数」，而消费点比的其实是 `gatherDeepSleepTraces(...).length`，即**材料段字符数**；真机影响面：49 纪元中 46 个 `materialBytes=0`、其中 25 个仍入睡 ⇒ 若真按「痕迹文件数」判，这 25 轮**全不该入睡** ⇒ 名实差距是**行为级**的。见下「S-P1b″ 口径定案」）**；manual=面板「立即归纳一次」。**改这里即改行为**（scheduler zod 缺省直接读本块）。⚠ **2026-09-15 P0.1 实证订正**：本块原注释称「缺省 3h」，但**实际生效值是本块的 2700000ms（45min）**——`scheduler.ts` 的 zod `.default(TRIGGER.idleMs)` 取本块值，而**全仓 8 处** `|| 10800000`（3h）兜底因 zod 有 default 而是**死代码**（⚠ 首轮只报 4 处：检索用了大小写敏感的 `idleMs`，漏掉 `deepSleepIdleMs` 那 4 处 —— `deepsleep.ts` ×2 / `distill-hooks.ts` ×2 ⇒ 「模式派生集合先核对」的典型踩坑）。已修：**8 处全部**统一改引本块（**单一来源已下沉 `deepsleep-core#idleMsOf`**）+ 注释订正 + 护栏 `test-deepsleep-wiring` ⑦（可执行代码不得再出现该字面量），**数值未动**（P0 不改行为）。**数值本身待 P1 双维水位按预注册判据校准**。 **S-P2b（2026-09-20）**：deepSleepProbeConflictMax=证据冲突（agent 状态活跃但连续零输出）连续多少轮即按卡住处理——补 conflict 分支**无界**致活锁（真机 28f9f094 连续 23 次 / 跨 11 小时零触发）。 **S-P1b″ 口径定案（2026-09-20 round 9）**：内容水位的**正确轴**已定位并落地 —— 不用字节量（`windowMaterialBytes` 与真实材料非同源，实测 0 vs 46692），也不用 `materialChars`（有**地板效应**：min 已达中位 43%），而用 **`countWindowTraces`（窗口内痕迹文件数）**——它与「新增材料」同源、零额外 IO（复用 `enumerateWindowTraces` 同一遍枚举）、且已落审计 `traceFiles`。⚠ **改判定为文件数是行为变更**（会砍掉 51% 入睡纪元的输入面）⇒ 属 R3 须用户拍板；本轮只把它**变成可判定的事**（有轴、有读数、有判据），**未擅自改判定**。";
    readonly reviewIdleMs: 1800000;
    readonly reviewMinNewEntries: 3;
    readonly reviewMinNewEvents: 600;
    readonly reviewNote: "L2 会话级复盘的**触发阈值**（S2S3 册一触发面 · 册四 U4 裁定 2026-09-19）：reviewIdleMs=空闲阈值；reviewMinNewEntries/reviewMinNewEvents=内容维下限。**实测依据**：蒸馏段中位仅 **4**（口径 = `kind=distill-run` 且 `stop` 存在，档 L 352 行 / 1108 段 ⇒ 段中位 4）⇒ 原 8/1200 会大面积漏触发，故内容维下调为 3/600（静默维保留 30min）。改这里即改行为（scheduler zod 缺省直接读本块；`session-review.ts` 只留注册表缺席时的兜底）。";
    readonly deepSleepProbeConflictMax: 3;
};
export interface ThresholdEntry {
    id: string;
    value: unknown;
    owner: string;
    preregistered: boolean;
    samples: number;
}
export declare const THRESHOLDS: {
    note: string;
    entries: ThresholdEntry[];
};
export declare const WIRING: {
    note: string;
    why: string;
    entryOk: readonly string[];
    typeOnlyOk: readonly string[];
    pending: ReadonlyArray<{
        name: string;
        until: string;
        reason?: string;
    }>;
    pendingNote?: string;
    unreachableValues?: readonly string[];
    unreachableValuesNote?: string;
};
export declare const CRITERIA_ROWS: readonly [{
    readonly id: "ingest.route.r1";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "llm";
    readonly text: "R1 泛化方向指引 → memory";
    readonly params: {
        readonly route: "memory";
    };
}, {
    readonly id: "ingest.route.r2";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "llm";
    readonly text: "R2 跨项目细粒度条文 → memory(notes/tools|lessons)";
    readonly params: {
        readonly route: "memory";
    };
}, {
    readonly id: "ingest.route.r3";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "llm";
    readonly text: "R3 项目专属事实 → project（直写工作区）";
    readonly params: {
        readonly route: "project";
        readonly target: "<workspace>/docs/devref/shoucang/";
    };
}, {
    readonly id: "ingest.route.r4";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "llm";
    readonly text: "R4 其余 → discard";
    readonly params: {
        readonly route: "discard";
    };
}, {
    readonly id: "ingest.route.q0";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "vector";
    readonly text: "Q0 已有归属 → 不存";
    readonly params: {};
}, {
    readonly id: "ingest.route.q1";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "llm";
    readonly text: "Q1 下周用不上 → 不存";
    readonly params: {};
}, {
    readonly id: "ingest.route.q2";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "llm";
    readonly text: "Q2 归谁（用户/agent/环境）";
    readonly params: {
        readonly targets: readonly ["notes", "USER.md", "AGENT.md"];
    };
}, {
    readonly id: "ingest.route.q3";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "vector";
    readonly text: "Q3 能合并 → replace 否则 add";
    readonly params: {};
}, {
    readonly id: "ingest.route.rules-not-stored";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly judgeKind: "deterministic";
    readonly text: "规则类不入库（SOUL 死支已删）";
    readonly params: {
        readonly reason: "rules-not-stored";
    };
}, {
    readonly id: "ingest.placement.notes-kind";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "落点须在 notes 白名单内";
    readonly params: {
        readonly notes: readonly ["env", "tools", "flows", "lessons", "release", "user", "agent"];
    };
}, {
    readonly id: "ingest.placement.main-index";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "主索引写入仅三主档";
    readonly params: {
        readonly indexTargets: readonly ["MEMORY.md", "USER.md", "AGENT.md"];
    };
}, {
    readonly id: "ingest.granularity.split-law";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "子树正文 > R 或同级条目 > K → 裂 ###（§8.1 分裂律）";
    readonly params: {
        readonly R: 1000;
        readonly K: 6;
    };
}, {
    readonly id: "ingest.dedup.exact";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "同 标签+主题 精确重复 → 拒收";
    readonly params: {
        readonly enabled: true;
    };
}, {
    readonly id: "ingest.dedup.bigram";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "主题 bigram 重叠 ≥ 阈值 → 近似重复拒收";
    readonly params: {
        readonly threshold: 0.66;
        readonly minTokens: 2;
    };
}, {
    readonly id: "ingest.format.index-line";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "索引行四要素格式（spec §8）";
    readonly params: {
        readonly topicMax: 12;
        readonly summaryMax: 30;
        readonly pathSummaryMax: 40;
        readonly banDate: true;
        readonly requirePointer: true;
        readonly requireMiddleDot: true;
        readonly forbidArrowInPath: true;
        readonly note: "**实测根因（2026-09-11）**：写门曾硬编码 30/40 而 prompt 未携带该约束 ⇒ 深睡产出普遍超标被逐条拦掉（attempted=3 → all-rejected，概况 31/38/36 字）。现：门读投影 + 生成器把约束派生进两个判据段。";
    };
}, {
    readonly id: "consolidate.support.principle";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly judgeKind: "vector";
    readonly text: "原则：同主题 ≥3 条痕迹（或当日反复命中）";
    readonly params: {
        readonly minTraces: 3;
    };
}, {
    readonly id: "consolidate.support.path";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly judgeKind: "vector";
    readonly text: "路径：同型 ≥2 次且只从成功任务归纳";
    readonly params: {
        readonly minOccur: 2;
        readonly crossSessionMin: 2;
        readonly successOnly: true;
    };
}, {
    readonly id: "consolidate.promote.premise";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly judgeKind: "llm";
    readonly text: "涉及隐含前提 → 必须写出，否则降级 notes";
    readonly params: {
        readonly requirePremiseWhenDependent: true;
    };
}, {
    readonly id: "consolidate.cross-workspace-redline";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly judgeKind: "deterministic";
    readonly text: "跨工作区红线：项目专名/路径/版本号不提炼";
    readonly params: {
        readonly forbidProjectNames: true;
    };
}, {
    readonly id: "consolidate.reshape.split-law";
    readonly domain: "consolidate";
    readonly kind: "hard";
    readonly judgeKind: "llm";
    readonly text: "treeOps split：正文 > R 且 ≥2 语义正交子面";
    readonly params: {
        readonly R: 1000;
        readonly K: 6;
        readonly partsMax: 6;
        readonly minParts: 2;
    };
}, {
    readonly id: "consolidate.demote.archive";
    readonly domain: "consolidate";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "遗忘：cold 且 ≥90 天 + 三守卫；禁直删；画像节禁归档";
    readonly params: {
        readonly coldDays: 90;
        readonly guards: readonly ["leaf", "cold-or-retired", "not-stub"];
        readonly profileFilesForbidden: true;
        readonly maxPerRun: 3;
        readonly allowDelete: false;
    };
}, {
    readonly id: "consolidate.cross.crossTopic";
    readonly domain: "consolidate";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "REM 相：crossTopic 源指针须覆盖 ≥2 个不同 §";
    readonly params: {
        readonly minSections: 2;
    };
}, {
    readonly id: "consolidate.replay.cross-day";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly judgeKind: "vector";
    readonly text: "跨日二次激活：近 7 日再现 → 可扩容/提纯";
    readonly params: {
        readonly windowDays: 7;
    };
}, {
    readonly id: "consolidate.pointer.update-only";
    readonly domain: "consolidate";
    readonly kind: "hard";
    readonly judgeKind: "deterministic";
    readonly text: "pointerOps 只允许原地 update（禁增删索引行）";
    readonly params: {
        readonly allow: readonly ["update"];
        readonly forbid: readonly ["add", "delete"];
    };
}];
export interface ContentTypeConsumer {
    layer: string;
    criterion: string;
}
export interface ContentType {
    recordKind: string[];
    carrier: string[];
    form: string;
    projection: string;
    consumer: ContentTypeConsumer;
    budget: string;
    reachable: boolean;
    memClass?: string;
    why?: string;
}
export interface ContentTypeStructural {
    projection: string;
    consumer: ContentTypeConsumer;
    budget: string;
    reachable?: boolean;
    why?: string;
}
export interface ContentTypeVocab {
    note?: string;
    layer: string[];
    timing: string[];
    criterion: string[];
    budget: string[];
    memClass: string[];
    reserved: {
        criterion: string[];
        budget: string[];
    };
}
export declare const CONTENT_TYPES: {
    note?: string;
    vocab: ContentTypeVocab;
    types: Record<string, ContentType>;
    structural: Record<string, ContentTypeStructural>;
};
