/** `meta.cues` 的分隔符：用**换行**（路径里可能含空格与 `|`，但不可能含换行）——单值 string 承载集合 */
export declare const CUES_SEP = "\n";
/**
 * **值规则表**（每维一条；注册表 `surface.injection.situation.cueDimRules` 只声明**规则文案**，
 *   规则本体在此 —— 单一实现）。未列出的维：值**原样保留**（让"未声明维"以可见形态被拒收，而不是被洗白）。
 */
export declare const CUE_VALUE_RULES: Record<string, string>;
/**
 * **键归一**（**唯一实现** · 读侧写侧共用）。`''` = 空键/无值（调用方应丢弃）。
 * 只做**确定性、可逆性无损**的归一：不做别名归一（`<盘符>:\<别名>\<a>` 是否等于 `<盘符>:\<a>`
 *   **无确定性依据，须人裁决**），不做大小写折叠（理由见上）。
 */
export declare function normalizeCueKey(raw: unknown): string;
export declare function declaredCueDims(): string[];
export interface CueValidation {
    ok: boolean;
    /** 归一后的键（`ok:false` 时仍给出，供审计留痕） */
    key: string;
    /** 拒收原因（`''` = 通过）：`empty` · `undeclared-dim:<d>` */
    reason: string;
}
/**
 * **维校验**（硬门）：维名必须在注册表 `cueDims` 声明内。未声明 ⇒ 写侧拒收 + 审计 `cue.rejected`。
 * 为什么是硬门而不是告警：实测**37 条**静默写入未声明维 ⇒ 那些键**读侧永不产出** ⇒ 记录"写了情境、
 *   实际永不可达"（与"键劈半"同族的静默失效）。
 */
export declare function validateCueKey(raw: unknown, dims?: readonly string[]): CueValidation;
/** 从 `meta.cues` 还原键集合（空/缺失 ⇒ 空数组，走兜底序）。**归一在此生效**（读写同源）。 */
export declare function parseCues(raw: unknown): string[];
/** 把键集合序列化进 `meta.cues`（写侧用；与 `parseCues` 同一分隔符与归一 ⇒ 往返无损） */
export declare function serializeCues(cues: readonly string[]): string;
/** 组装一个键（读侧用）：`cueKeyOf('scope', 'workspace:<盘符>/repo')` ⇒ `scope=workspace:<盘符>/repo`（已归一） */
export declare function cueKeyOf(dim: string, value: unknown): string;
/**
 * **一批值的整批校验**（写侧用）：返回 `{ keys, rejected }` —— 通过的按原序去重，拒收的留痕。
 * 批量语义是**逐条独立**（一条坏键不连坐其余），因为 cue 是**附加线索**：丢掉一条不该让整条记录落空。
 */
export declare function cueSetOf(raw: unknown, dims?: readonly string[]): {
    keys: string[];
    rejected: Array<{
        key: string;
        reason: string;
    }>;
};
