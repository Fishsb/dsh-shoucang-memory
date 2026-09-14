/** 连续未引用多少次即认为「该来源线索已变弱」（对齐人类"线索变弱即换向"；缺省 2） */
export declare const SWITCH_THRESHOLD = 2;
/** 折一次收益：合规 ⇒ **归零**（来源仍有效）；不合规 ⇒ 递增（线索在变弱） */
export declare function nextZeroGain(prev: number | undefined, compliant: boolean): number;
/** 是否已达换向阈值（`switchSource` 信号；调用方据此改变检索来源，而非继续灌同一批材料） */
export declare function shouldSwitchSource(zeroGain: number | undefined, threshold?: number): boolean;
/** 收益读数（供诊断聚合；纯函数、含分母口径——合规率**必须有分母**，仓内曾因只在失败分支落账而无分母） */
export declare function yieldOf(rows: ReadonlyArray<{
    compliant?: boolean;
}>): {
    total: number;
    compliant: number;
    rate: number | null;
};
