import type { MemRecord } from './record-store.js';
export interface DecisionInit {
    /** 裁决正文（一句话：拍了什么板） */
    text: string;
    /** 当时预测会怎样（后果回收的对照项） */
    predicted?: string;
    /** 当时为什么这么拍（防下一次把已拍板的事重开一遍） */
    rationale?: string;
    /** 被否的方案（防止重复讨论已否决项） */
    alternatives?: string;
    /** 源（会话 id / notes 锚） */
    evidence?: string;
    subject?: string;
    scope?: string;
    /** 情境键（`\n` 分隔；用 `ring-supply#serializeCues` 序列化，**与读侧同一实现**）。
     *  它是「**在什么情境下该想起它**」的唯一线索（编码特异性）；写不出就省——读侧有兜底序，不会因此丢失。 */
    cues?: string;
    at: string;
    /** 显式 id（**事件重放时由事件指定**：身份以事件流为准，载荷缺字段也不改身份） */
    id?: string;
}
export interface OutcomeInit {
    /** 实际发生了什么 */
    observed: string;
    /** 命中预测？（省略时由 valence 符号推导） */
    hit?: boolean;
    /** 价态：+1 好 / -1 坏 / 0 中性 */
    valence?: number;
    evidence?: string;
    at: string;
    /** 显式 id（见 DecisionInit.id 说明） */
    id?: string;
}
export interface ValenceInit {
    /** 触发条件（在什么情境下） */
    trigger: string;
    /** 价态（正/负） */
    valence: number;
    /** 情境键（见 DecisionInit.cues） */
    cues?: string;
    evidence?: string;
    at: string;
    /** 显式 id（见 DecisionInit.id 说明） */
    id?: string;
}
/** 开一条裁决（status=open，进入待回收队列） */
export declare function openDecision(records: readonly MemRecord[], d: DecisionInit): {
    records: MemRecord[];
    id: string;
};
/** 该裁决已回收的后果（无则 undefined） */
export declare function outcomeOf(records: readonly MemRecord[], decisionId: string): MemRecord | undefined;
/**
 * **后果回收**（本环的核心）：把实际结果挂回裁决，改其状态为 collected。
 * 幂等：已回收过的裁决**拒绝重复回收**（不重复产记录——重复即污染记分卡）。
 */
export declare function collectOutcome(records: readonly MemRecord[], decisionId: string, o: OutcomeInit): {
    records: MemRecord[];
    ok: boolean;
    reason?: string;
    hit?: boolean;
};
/** 价态采集（用户/agent 对某情境的真实反应；**唯一的人工信号入口**） */
export declare function recordValence(records: readonly MemRecord[], v: ValenceInit): {
    records: MemRecord[];
    id: string;
};
/** 待回收队列（开了没回收的裁决）——「想不起来回收」的防线 */
export declare function openDecisions(records: readonly MemRecord[]): MemRecord[];
export interface Scorecard {
    opened: number;
    collected: number;
    hits: number;
    misses: number;
    pending: number;
    /** 命中率（collected=0 时 0，不编造） */
    hitRate: number;
    valences: number;
    /** 未命中的裁决正文（前 3 条，供复盘） */
    missSamples: string[];
}
/** 决策环记分卡（KPI：**只从记录集推导**，不另立计数器——与「KPI 只能由事件流推导」同纪律） */
export declare function scorecardOf(records: readonly MemRecord[]): Scorecard;
