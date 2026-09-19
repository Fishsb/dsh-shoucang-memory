/**
 * ring-supply.ts — **环记录的情境供给**（P2 · 2026-09-14 · 拟人化方案 §4.3 线 A）
 *
 * 为什么需要它：五个内容环（fact / decision / relation / association / value）里，环记录**天然没有 md 投影**
 *   （`record-store.ts:21-23` 的设计意图：`file=''` 表示"Record 能存、md 存不下"），
 *   而活注入路径 `panel-shared#readCarrier` 是 `readFileSync` **直接读三个 md 文件**
 *   ⇒ 环记录在结构上**不可达**。实测：980 条记录中带环语义的仅 9 条，且全部零注入。
 *   本件给它们一条**独立通道**（不迁移数据源、不重写 readCarrier）。
 *
 * 边界纪律（**照抄 `supply-assembly.ts` 头注**，本仓防漂移的核心手法）：
 *   · 只做**选择 + 渲染**；**装配**（预算分配 / 槽序 / 溢出记账）归 `supply-assembly`（唯一装配实现）；
 *   · **不重排、不新写打分函数** —— 候选序 = 「情境键命中 → 环优先级（注册表 ringOrder）→ due 紧迫度 → 新鲜度」，
 *     这是**选择判据**，不是与 `vec.recallRanked` 竞争的第二份**相关性打分**（仓内红线：打分口径只能一份）；
 *   · **纯函数、零 I/O、零抛出、确定性**（判定时刻 `at` 必填，不吃隐式 now）。
 */
import { ringOfKind } from './rings.js';
import { isLive } from './fact-ring.js';
import { cueOverlap } from './situation-key.js';
/* IR1 册二（2026-09-18）：`meta.cues` 的**解析/序列化已收敛到 `cue-space.ts`**（单一实现）。
 *   本件此前自带一份 `parseCues`/`serializeCues` + 一份分隔符常量 —— 与写侧（`ring-commit` 的私有归一）
 *   构成三处实现，正是"键空间劈半"的温床。现**只做再导出**（消费方 import 路径不变，语义单一化）。 */
import { CUES_SEP, parseCues, serializeCues } from './cue-space.js';
export { CUES_SEP, parseCues, serializeCues };
/** 环记录**必带** `file === ''`（= 无 md 投影）。这不是"缺失"，是设计意图，也是本件的选择基准。 */
export const RING_RECORD_FILE = '';
/**
 * S4-5（2026-09-14）**情境槽额度自适应**：由**活体环记录数**派生 `topN`。
 *
 * 判因：`topN` 此前是注册表里的固定 **3**，而实测库内环记录 **105 条** ⇒ **命中率天花板 ≈3%**
 *   （105 条抢 3 个位置）。额度与库规模脱钩，等于"**库越大，经历面越稀释**"。
 *
 * 公式 `clamp(ceil(√N), 3, 12)`：**次线性**（避免库大时把注入面撑满）、下限沿用原值 3（小库**零变化**）、
 *   上限 12（注入面硬约束）。实测 N=105 ⇒ **11**（≈原 3.7 倍）。
 *
 * 回滚：注册表 `surface.injection.situation.adaptive = false` ⇒ 回到固定 `topN`（缺省 `true`）。
 * 纯函数、零 IO、零抛出（与 `ringCandidates` 同纪律）。
 */
export function adaptiveTopN(records, fixedTopN, adaptive = true) {
    const fixed = Math.max(1, Number(fixedTopN ?? 3) || 3);
    if (!adaptive)
        return fixed;
    const ringN = (records ?? []).filter((r) => String(r.file ?? '') === RING_RECORD_FILE && ringOfKind(r.kind) !== 'none').length;
    if (ringN <= 0)
        return fixed;
    return Math.max(3, Math.min(12, Math.ceil(Math.sqrt(ringN))));
}
/** 环的展示标签（渲染用；**只在此处一处声明**） */
const RING_LABEL = {
    relation: '关系/承诺',
    decision: '决策/后果',
    association: '联想',
    fact: '情景/事实',
    value: '价值',
    none: '',
};
/** kind 粒度的补充标签（环标签之下的更细一档；缺省回落到环标签） */
const KIND_LABEL = {
    decision: '决策',
    outcome: '后果',
    relation: '关系',
    commitment: '承诺',
    association: '联想',
    episode: '经历',
    procedure: '流程',
    fact: '事实',
    valence: '价态',
};
/* 解析/序列化实现已迁 `cue-space.ts`（IR1 册二 · 2026-09-18）——此处**不再有本地定义**。
 *   B3 判据：`src/` 内归一/解析/序列化**只许 1 处定义**（本件的旧副本已删，改为顶部再导出）。 */
/**
 * due 紧迫度（**小者先**）：已过期 0 < 无 due 1 < 未到期 2。
 * 为什么这样排：过期的承诺/意图是"最该被想起"的（前瞻记忆的失败模式就是漏掉它们）；
 * 无 due 的仍然要出现（只是没那么急）；未到期的排最后。
 * 坏时间戳（`Date.parse` 为 NaN）按"无 due"处理，**不抛**。
 */
function dueRank(meta, at) {
    const due = String(meta?.due ?? '').trim();
    if (!due)
        return 1;
    const t = Date.parse(due);
    const now = Date.parse(at);
    if (!Number.isFinite(t) || !Number.isFinite(now))
        return 1;
    return t < now ? 0 : 2;
}
/**
 * S4-4（2026-09-14）**到期前瞻**：`due` 是否「已到或临近」（`at` 起 `windowMs` 内）。
 *
 * 判因：本件 :85 早已自述「过期的承诺/意图是**最该被想起**的（前瞻记忆的失败模式就是漏掉它们）」，
 *   但此前 `due` **只在"同组内"按 `dueRank` 排序** —— 一旦该条未命中情境线索，就落进**兜底组**，
 *   于是**永远排在所有命中者之后**（跨组优先级压过组内 due）。⇒ 本函数把"到期/临近"提为**独立组**。
 *
 * 纪律（与 `dueRank` 同）：**坏时间戳按"无 due"处理，不抛**。
 * 窗口缺省 7 天 —— "临近"的定义由此唯一，不在调用处各写一个数（防口径漂移）。
 */
export function dueSoon(meta, at, windowMs = 7 * 86400000) {
    const due = String(meta?.due ?? '').trim();
    if (!due)
        return false;
    const t = Date.parse(due);
    const now = Date.parse(at);
    if (!Number.isFinite(t) || !Number.isFinite(now))
        return false;
    return t <= now + windowMs; // 已过期，或 7 天内到期
}
/** 渲染一行（人读可辨：环标签 + 正文 + 关键 meta）。**渲染只此一处**，panel/深睡/工具共用。 */
export function renderRingLine(r) {
    const ring = ringOfKind(r.kind);
    const label = KIND_LABEL[r.kind] ?? RING_LABEL[ring] ?? '环';
    const bits = [];
    const due = String(r.meta?.due ?? '').trim();
    if (due)
        bits.push(`due ${due}`);
    const dir = String(r.meta?.direction ?? '').trim();
    if (dir === 'owed-by-me')
        bits.push('我欠');
    else if (dir === 'owed-to-me')
        bits.push('欠我');
    const hit = String(r.meta?.hit ?? '').trim();
    if (hit)
        bits.push(hit === '1' ? '已应验' : '未应验');
    const suffix = bits.length ? `（${bits.join(' · ')}）` : '';
    return `[环·${label}] ${String(r.text ?? '').trim()}${suffix}`;
}
/**
 * 环候选选择（**纯函数**）。判据顺序即优先级：
 *   ① 情境键命中者（按命中数降序）② 兜底者（cues 缺失/未命中）
 *   组内按：环优先级（注册表序）→ due 紧迫度 → 新鲜度（`createdAt` 降序，空视为最旧）。
 * 去重按 `id`（同 id 只留一条，保序）。
 */
export function ringCandidates(records, cues, opts) {
    const order = (opts.rings && opts.rings.length ? opts.rings : DEFAULT_RING_ORDER);
    const ringIdx = new Map(order.map((r, i) => [r, i]));
    const topN = Math.max(0, Number(opts.topN ?? DEFAULT_RING_TOPN) || 0);
    if (topN === 0)
        return [];
    const cands = [];
    const seen = new Set();
    for (const r of records ?? []) {
        // ① 只收**环记录**：无 md 投影 + 属已登记的非 none 环
        if (String(r.file ?? '') !== RING_RECORD_FILE)
            continue;
        const ring = ringOfKind(r.kind);
        if (ring === 'none')
            continue;
        const idx = ringIdx.get(ring);
        if (idx === undefined)
            continue;
        // ② 活性（时态维）：与 lifecycle 正交，由 fact-ring 的单一实现判
        if (!isLive(r, opts.at))
            continue;
        // ③ **结清门**（G11 · 2026-09-19 真机实测暴露）：
        //   判因：`settleCommitment` 改的是 `meta.status`，而本通道此前**只看 `isLive()`（`validTo`）**
        //     ⇒ **结算对注入面零影响**：已结清的承诺仍被当"待办"唤起（实测：落库 10 条后 `[环·承诺]` 照旧显示）。
        //   语义：承诺是**待办**语义 ⇒ 只收 `status === 'pending'`（已结清即出待办队列）。
        //   边界：**只限承诺**——其它环记录（决策/事实/联想…）没有 status 语义，不得误伤；
        //     缺 `status` 字段视作 `pending`（向后兼容老记录，**不静默丢**）。
        //   判据：`scripts/test-ring-supply.mjs` ①′（含 pending 阴性对照 / 缺字段兼容 / 决策不误伤）。
        if (r.kind === 'commitment' && String(r.meta?.status ?? 'pending') !== 'pending')
            continue;
        if (!String(r.text ?? '').trim())
            continue;
        const hits = cueOverlap(parseCues(r.meta?.cues), cues);
        cands.push({
            id: String(r.id),
            kind: r.kind,
            ring,
            why: hits.length ? 'cue' : dueSoon(r.meta, opts.at) ? 'due' : 'fallback',
            hits,
            line: renderRingLine(r),
            record: r,
        });
        seen.add(String(r.id));
    }
    void seen; // id 去重在排序后按 id 保序做（同 id 内容必然相同，见 record-store 的 id 派生规则）
    cands.sort((a, b) => {
        // 组序（S4-4 起**三组**）：**情境命中(0) → 已到期/临近(1) → 兜底(2)**。
        //   为什么 due 必须单列一组：前瞻记忆的失败模式就是**漏掉到期的承诺**（本件 :85 已自述），
        //   而此前它只在"同组内"按 `dueRank` 排 —— 一旦未命中情境线索就落进兜底组，**永远排在命中者之后**。
        const grp = (c) => (c.why === 'cue' ? 0 : c.why === 'due' ? 1 : 2);
        const ga = grp(a);
        const gb = grp(b);
        if (ga !== gb)
            return ga - gb;
        if (ga === 0 && a.hits.length !== b.hits.length)
            return b.hits.length - a.hits.length;
        const ia = ringIdx.get(a.ring) ?? 99;
        const ib = ringIdx.get(b.ring) ?? 99;
        if (ia !== ib)
            return ia - ib;
        const da = dueRank(a.record.meta, opts.at);
        const db = dueRank(b.record.meta, opts.at);
        if (da !== db)
            return da - db;
        const ta = Date.parse(String(a.record.createdAt || '')) || 0;
        const tb = Date.parse(String(b.record.createdAt || '')) || 0;
        if (ta !== tb)
            return tb - ta;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // 全等时按 id 稳定（保证确定性）
    });
    const out = [];
    const used = new Set();
    for (const c of cands) {
        if (used.has(c.id))
            continue;
        used.add(c.id);
        out.push(c);
        if (out.length >= topN)
            break;
    }
    return out;
}
/** 注册表缺省（`criteria.json#surface.injection.situation`）；调用方应传注册表实际值覆盖 */
export const DEFAULT_RING_ORDER = ['relation', 'decision', 'association', 'fact'];
export const DEFAULT_RING_TOPN = 3;
export function createRingSupplyApi(d = {}) {
    const rings = d.rings && d.rings.length ? d.rings : DEFAULT_RING_ORDER;
    const topN = Number.isFinite(d.topN) ? Number(d.topN) : DEFAULT_RING_TOPN;
    return {
        candidates: (records, cues, at) => ringCandidates(records, cues, { rings, topN, at }),
        lines: (records, cues, at) => ringCandidates(records, cues, { rings, topN, at }).map((c) => c.line),
    };
}
//# sourceMappingURL=ring-supply.js.map