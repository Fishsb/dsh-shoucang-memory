/**
 * situation-key.ts — **情境指纹**（P2 · 2026-09-14 · 拟人化方案 §4.3 线 C）
 *
 * 为什么需要它（本仓最根本的一条缺口）：
 *   召回目前全靠**内容相似度**（query ↔ 索引行 余弦），而认知心理学的**编码特异性**原理说的是——
 *   **提取成功取决于「编码情境」与「提取线索」的匹配**，而非内容相似度；
 *   前瞻记忆的**多进程框架**进一步指出：承诺/意图是**线索驱动**的，纯战略监控在高负荷下系统性失败。
 *   ⇒ 情境层需要一把**独立的钥匙**，而不是再给相似度调权重（调权重解决不了，只会两边都不讨好）。
 *
 * 边界纪律（与 `supply-assembly.ts` / `association-propose.ts` 同规格）：
 *   · **纯函数、零 I/O、零抛出、确定性**（同输入必同输出；**不吃隐式 now**，判定时刻由调用方显式给）；
 *   · **维度只在注册表声明**（`criteria.json#surface.injection.situation.cueDims`）——本件按它迭代，
 *     **不另立维度清单**（"同一事实的第二份副本"是本仓最大的漂移源）；
 *   · **只造钥匙，不做选择、不打分** —— 匹配判定是布尔集合运算；选行归 `ring-supply`，装配归 `supply-assembly`。
 *
 * 零硬编码机路径：键值一律从调用方给的上下文取；本件不认识任何盘符。
 */
const KNOWN_DIMS = ['scope', 'task', 'subject', 'event'];
/**
 * 上下文 → 情境键集合。
 * 键形如 `scope=workspace:/repo`、`task=build`、`subject=user`、`event=decision.consolidate`。
 * 稳定性：按**注册表维度序**输出（不是对象键序，也不是字典序）——这样同输入必同输出，
 *   且注册表调整维度序时行为可预期（不会有"看起来没变其实变了"的隐性漂移）。
 * 健壮性：未知维度名直接跳过（不抛）；值做 `trim`，空串丢弃；重复键去重。
 */
export function cuesOf(ctx, dims = KNOWN_DIMS) {
    const out = [];
    const seen = new Set();
    for (const d of dims ?? KNOWN_DIMS) {
        if (!KNOWN_DIMS.includes(d))
            continue; // 未知维度：跳过而非抛（零抛出纪律）
        const v = String(ctx[d] ?? '').trim();
        if (!v)
            continue;
        const k = `${d}=${v}`;
        if (seen.has(k))
            continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}
/** 交集（保留 **a 的顺序**，去重） —— 匹配判据的唯一实现 */
export function cueOverlap(a, b) {
    if (!a?.length || !b?.length)
        return [];
    const setB = new Set(b);
    const out = [];
    const seen = new Set();
    for (const x of a) {
        if (!setB.has(x) || seen.has(x))
            continue;
        seen.add(x);
        out.push(x);
    }
    return out;
}
export function createSituationKeyApi(d = {}) {
    const dims = d.dims && d.dims.length ? d.dims : KNOWN_DIMS;
    return {
        cuesOf: (ctx) => cuesOf(ctx, dims),
        overlap: cueOverlap,
        matches: (a, b) => cueOverlap(a, b).length > 0,
    };
}
/** 供调用方做**零依赖**取维度用的常量（与注册表 `cueDims` 缺省值一致；注册表可覆盖） */
export const DEFAULT_CUE_DIMS = KNOWN_DIMS;
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
export function taskCueOf(query, known) {
    try {
        const q = String(query ?? '').toLowerCase();
        if (!q || !known?.length)
            return '';
        const seg = new Set(q.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean));
        const hit = [];
        for (const raw of known) {
            const k = String(raw ?? '').trim();
            if (!k)
                continue;
            const lk = k.toLowerCase();
            // CJK 键（实测写侧 10/46）：**不做分词比对**——中文无空格，`深睡` 在 query 里是
            //   `"深睡蒸馏"` 的**子串**而非独立词，按词切分会整段成一块 ⇒ 永远命中不了（实测）。
            //   ⇒ CJK 走**子串**判定（`q.includes(lk)`），这是中文唯一的确定性判据。
            const isCJK = /[\u4e00-\u9fa5]/.test(lk);
            if (isCJK) {
                if (q.includes(lk))
                    hit.push(k);
                continue;
            }
            // ASCII 键：整词命中（键按分隔符切段后**每一段**都须在 query 词集中出现）
            //   —— 禁子串，防 `cleanup` 误命中 `cleanup-safety`（实测过匹配 37%）
            const parts = lk.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean);
            if (parts.length && parts.every((p) => seg.has(p)))
                hit.push(k);
        }
        if (!hit.length)
            return '';
        // 最长者优先（更具体）；同长按字典序稳定（确定性）
        hit.sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
        return hit[0];
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=situation-key.js.map