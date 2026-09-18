/** 情境维度的取值来源（**每一项都取自已有字段，零新采集通道**） */
export interface SituationCtx {
    /** 工作区：`workspace:<path>` / `project:<name>` / `global` —— 取自 `MemRecord.scope` */
    scope?: string;
    /** 任务型：由既有任务分类正则判定（注册表 taskClass） */
    task?: string;
    /** 主体：`user` / `agent` / `knowledge` / `companion:<id>` —— 取自 `MemRecord.subject` */
    subject?: string;
    /** 近期事件型：取自 `ledger.jsonl` 既有 `type` 字段 */
    event?: string;
}
/** 维度名（与注册表 `cueDims` 的字符串一一对应；只列**类型**，值不在此处维护） */
export type CueDim = 'scope' | 'task' | 'subject' | 'event';
export interface SituationKeyDeps {
    /**
     * 启用的维度与顺序（缺省 = `KNOWN_DIMS`）。
     * ⚠ 调用方应传注册表值 `SURFACE.injection.situation.cueDims` —— 本件不 import 注册表，
     *   以免把纯函数模块绑到生成物上（可独立单测、可脱离构建运行）。
     */
    dims?: readonly string[];
}
export interface SituationKeyApi {
    /** 上下文 → 情境键集合（稳定序、去重、丢弃空值） */
    cuesOf(ctx: SituationCtx): string[];
    /** 两组键的交集（**匹配判据**；空交集 = 不匹配） */
    overlap(a: readonly string[], b: readonly string[]): string[];
    /** 是否匹配（`overlap().length > 0` 的可读封装） */
    matches(a: readonly string[], b: readonly string[]): boolean;
}
/**
 * 上下文 → 情境键集合。
 * 键形如 `scope=workspace:/repo`、`task=build`、`subject=user`、`event=decision.consolidate`。
 * 稳定性：按**注册表维度序**输出（不是对象键序，也不是字典序）——这样同输入必同输出，
 *   且注册表调整维度序时行为可预期（不会有"看起来没变其实变了"的隐性漂移）。
 * 健壮性：未知维度名直接跳过（不抛）；值做 `trim`，空串丢弃；重复键去重。
 */
export declare function cuesOf(ctx: SituationCtx, dims?: readonly string[]): string[];
/** 交集（保留 **a 的顺序**，去重） —— 匹配判据的唯一实现。
 *  ★IR1 册二（2026-09-18）：**两侧都过唯一归一**（`cue-space#normalizeCueKey`）——
 *    旧实现按**原样字符串全等**比较，只要调用方一侧漏了归一就永久失配（实测正是这样劈成两半的）。
 *    归一放在**匹配入口**是最后一道兜底：任何调用方（含测试与外部脚本）漏归一都不会再制造静默失配。 */
export declare function cueOverlap(a: readonly string[], b: readonly string[]): string[];
export declare function createSituationKeyApi(d?: SituationKeyDeps): SituationKeyApi;
/** 供调用方做**零依赖**取维度用的常量（与注册表 `cueDims` 缺省值一致；注册表可覆盖） */
export declare const DEFAULT_CUE_DIMS: readonly CueDim[];
/**
 * **任务键派生**（2026-09-17 · 情境轴去留裁决的**收益点**）。
 *
 * 判因（真机实测）：本维此前**读侧恒不产出**（`panel-shared#sitCtx` 只填 `scope`），
 *   而写侧已有 **46 个真实 `task=` 键、253 条**（`build` 37 / `disk-cleanup` 31 …）——
 *   **写进去的键结构上不参与匹配**（实测 213/375 环记录带 `task` 却零命中）。
 *   裁决会实测：补上本键后注入集**整体换血**（A∩B=2，10/12 行变化）⇒ 该轴能区分任务。
 *
 * ⚠ **不做正则从 query 硬抽**（裁决会否掉了这条路，有实测）：
 *   · 中文查询（用户主用法）抽 `[a-z0-9]+` ⇒ **恒空**（只捞到盘符字母）
 *   · 英文查询 ⇒ **过匹配 37%**（`cleanup` 一词同时命中 `cleanup` 与 `disk-cleanup`）
 *   ⇒ 改为**对候选词表做受控匹配**：调用方传入写侧已存在的键集合，本函数只在其中挑。
 *
 * 匹配规则（**确定性、零 I/O、零抛出**）：
 *   ① 大小写归一（写侧存在 `S3-acceptance` 与 `s3-acceptance` 混用）
 *   ② query 中**整词**命中键（按 `-` / `/` 切分后逐段比对，避免 `cleanup` 命中 `cleanup-safety`）
 *   ③ 多个命中时取**最长键**（更具体者优先：`disk-cleanup` 胜过 `cleanup`）
 *   ④ 无命中 ⇒ 返回 `''`（**承认缺席**——DimMem 的 "empty fields are allowed"；不硬造自由值）
 */
export declare function taskCueOf(query: string, known?: readonly string[]): string;
