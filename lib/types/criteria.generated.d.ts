export declare const CRITERIA_VERSION = "v2.2.0";
/** 摄取域判据段（拼进 DEFAULT_DISTILL_PROMPT） */
export declare const INGEST_JUDGE: string;
/** 巩固域判据段（拼进 DEEP_SLEEP_PROMPT） */
export declare const CONSOLIDATE_JUDGE: string;
export declare const JUDGEMENT_HINT = "judgement\uFF1A\u53EF\u9009\u5BF9\u8C61\uFF0C\u628A\u672C\u6B21\u5224\u636E\u53D6\u503C\u5199\u8FDB\u8F93\u51FA\uFF08reuse/generality/stability/conflict/dup \u6216 evidence/stability/conflict/cost\uFF1B\u53D6\u503C\u89C1 criteria \u6CE8\u518C\u8868\uFF09\uFF0C\u5BBF\u4E3B\u636E\u6B64\u5199\u7EDF\u4E00\u53F0\u8D26 audit/ledger.jsonl\uFF08type=decision.*\uFF09\u4F9B\u5BF9\u8D26\u3002";
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
        readonly budgetChars: 3000;
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
            readonly profile: 3;
            readonly note: "P 层画像行每档注入上限（0=关闭 → 回滚到「画像行不注入」的旧行为）";
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
        readonly familiarThreshold: 0.65;
        readonly maxNudges: 1;
        readonly budgetChars: 600;
        readonly topK: 3;
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
            readonly note: "仅跨环境稳定者；带情境前提者交深睡按 A≥gate 决定是否升 P";
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
            readonly note: "任务型门控（复用 ACT-029 MCL 快通道熟悉度分流）";
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
            readonly layer: "P";
            readonly form: "index";
            readonly inject: "always";
            readonly note: "USER 侧：用户环境构成";
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
    readonly note: "成熟度（v2.2 E6）：A(0)=A0；每次跨日再现 +step（上限 1.0）；只有 A≥gate 才允许升格为 [原则]/[路径]；A<gate 不注入但参与打分（implicit priming）。enforce=false 时只记录不强制（M4 影子期）。";
    readonly ledger: "audit/maturation.jsonl";
};
export declare const TRIGGER: {
    readonly idleMs: 10800000;
    readonly newTracesMin: 1;
    readonly manual: true;
    readonly note: "触发数据化（v2.1 §2.4）：idleMs=全部根会话停滞阈值（缺省 3h）；newTracesMin=窗口内最少新痕迹数；manual=面板「立即归纳一次」开关。改这里即改行为，不必改码。";
};
export declare const CRITERIA_ROWS: readonly [{
    readonly id: "ingest.route.r1";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "R1 泛化方向指引 → memory";
    readonly params: {
        readonly route: "memory";
    };
}, {
    readonly id: "ingest.route.r2";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "R2 跨项目细粒度条文 → memory(notes/tools|lessons)";
    readonly params: {
        readonly route: "memory";
    };
}, {
    readonly id: "ingest.route.r3";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "R3 项目专属事实 → project（直写工作区）";
    readonly params: {
        readonly route: "project";
        readonly target: "<workspace>/docs/devref/shoucang/";
    };
}, {
    readonly id: "ingest.route.r4";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "R4 其余 → discard";
    readonly params: {
        readonly route: "discard";
    };
}, {
    readonly id: "ingest.route.q0";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "Q0 已有归属 → 不存";
    readonly params: {};
}, {
    readonly id: "ingest.route.q1";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "Q1 下周用不上 → 不存";
    readonly params: {};
}, {
    readonly id: "ingest.route.q2";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "Q2 归谁（用户/agent/环境）";
    readonly params: {
        readonly targets: readonly ["notes", "USER.md", "AGENT.md"];
    };
}, {
    readonly id: "ingest.route.q3";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "Q3 能合并 → replace 否则 add";
    readonly params: {};
}, {
    readonly id: "ingest.route.rules-not-stored";
    readonly domain: "ingest";
    readonly kind: "soft";
    readonly text: "规则类不入库（SOUL 死支已删）";
    readonly params: {
        readonly reason: "rules-not-stored";
    };
}, {
    readonly id: "ingest.placement.notes-kind";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly text: "落点须在 notes 白名单内";
    readonly params: {
        readonly notes: readonly ["env", "tools", "flows", "lessons", "release", "user", "agent"];
    };
}, {
    readonly id: "ingest.placement.main-index";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly text: "主索引写入仅三主档";
    readonly params: {
        readonly indexTargets: readonly ["MEMORY.md", "USER.md", "AGENT.md"];
    };
}, {
    readonly id: "ingest.granularity.split-law";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly text: "子树正文 > R 或同级条目 > K → 裂 ###（§8.1 分裂律）";
    readonly params: {
        readonly R: 1000;
        readonly K: 6;
    };
}, {
    readonly id: "ingest.dedup.exact";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly text: "同 标签+主题 精确重复 → 拒收";
    readonly params: {
        readonly enabled: true;
    };
}, {
    readonly id: "ingest.dedup.bigram";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly text: "主题 bigram 重叠 ≥ 阈值 → 近似重复拒收";
    readonly params: {
        readonly threshold: 0.66;
        readonly minTokens: 2;
    };
}, {
    readonly id: "ingest.format.index-line";
    readonly domain: "ingest";
    readonly kind: "hard";
    readonly text: "索引行四要素格式（spec §8）";
    readonly params: {
        readonly topicMax: 12;
        readonly summaryMax: 30;
        readonly pathSummaryMax: 40;
        readonly banDate: true;
        readonly requirePointer: true;
        readonly requireMiddleDot: true;
        readonly forbidArrowInPath: true;
    };
}, {
    readonly id: "consolidate.support.principle";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly text: "原则：同主题 ≥3 条痕迹（或当日反复命中）";
    readonly params: {
        readonly minTraces: 3;
    };
}, {
    readonly id: "consolidate.support.path";
    readonly domain: "consolidate";
    readonly kind: "soft";
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
    readonly text: "涉及隐含前提 → 必须写出，否则降级 notes";
    readonly params: {
        readonly requirePremiseWhenDependent: true;
    };
}, {
    readonly id: "consolidate.cross-workspace-redline";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly text: "跨工作区红线：项目专名/路径/版本号不提炼";
    readonly params: {
        readonly forbidProjectNames: true;
    };
}, {
    readonly id: "consolidate.reshape.split-law";
    readonly domain: "consolidate";
    readonly kind: "hard";
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
    readonly text: "REM 相：crossTopic 源指针须覆盖 ≥2 个不同 §";
    readonly params: {
        readonly minSections: 2;
    };
}, {
    readonly id: "consolidate.replay.cross-day";
    readonly domain: "consolidate";
    readonly kind: "soft";
    readonly text: "跨日二次激活：近 7 日再现 → 可扩容/提纯";
    readonly params: {
        readonly windowDays: 7;
    };
}, {
    readonly id: "consolidate.pointer.update-only";
    readonly domain: "consolidate";
    readonly kind: "hard";
    readonly text: "pointerOps 只允许原地 update（禁增删索引行）";
    readonly params: {
        readonly allow: readonly ["update"];
        readonly forbid: readonly ["add", "delete"];
    };
}];
