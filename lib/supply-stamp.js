/**
 * supply-stamp.ts — **供给戳**领域（IR1 册四 · 2026-09-18）
 *
 * 由来（IR1-injection-recall-plan v3 §2-5 的**实测**病灶：**四套失效口径**）：
 *   · 30s TTL（`panel-shared#buildHotMemoryText` 内层）；
 *   · `upstreamStampOf` 的 **size 签名**（只签 `activity.jsonl` + `delta.md` **两条介质**）；
 *   · `panel-inject#injectCacheReason` 的**四条件事件戳**（sid/evLen/firstSeq/lib）；
 *   · `vec` 的 60s / 5s / `fileStatCache` 三级缓存。
 *   ⇒ 后果：**改 `MEMORY.md` 在内层缓存里不可见**（库戳只活在外层判据里），且 `/inject/stats`
 *     只报**最外层**一个 reason ⇒ "哪一层失效"说不出来（G4）。
 *
 * 本件把**库戳 ∪ 介质戳**收敛成**一份实现**（`libStampOf`），并给出**层归因**（`injectCacheVerdict`）：
 *   失效只可能来自四层之一 —— `session`（换会话/新会话）· `context`（历史被压缩重写）·
 *   `query`（本步任务文本变）· `event`（库/介质落盘）· `ttl`（内层 30s 兜底）。
 *
 * ⚠ **`warm` 字段只作观测**：`warm-recall.json` 一次只装**一个 query** 的行，
 *   签它等于「为 query B 的写入失效 query A 的缓存」而 A 的输出**根本没变** ⇒ **不进失效键**
 *   （既有判据 `test-inject-cache` S4 钉死这一点）。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeRoot, memoryLibRoot } from './targets.js';
/** 逐文件打戳；缺文件/不可读 ⇒ `f:-`（**失败开放**：签名失败不得影响注入） */
const stampOf = (root, files) => files.map((f) => { try {
    return `${f}:${statSync(join(root, f)).size}`;
}
catch {
    return `${f}:-`;
} }).join(',');
const libStampOfFiles = (root, files) => files.map((f) => {
    try {
        const st = statSync(join(root, f));
        return `${f}:${st.size}:${Math.round(st.mtimeMs)}`;
    }
    catch {
        return `${f}:-`;
    }
}).join(',');
/**
 * **取戳（单一实现）**：库戳 ∪ 介质戳 ∪（观测用的）warm 戳。`memRoot` 缺省 = `memoryLibRoot()`；
 * `kRoot` 缺省 = `knowledgeRoot()`。零抛出（不可读一律回落占位）。
 *
 * ⚠ **介质戳加源（S2S3 册四 · 2026-09-19）**：注入侧「最近成长」的主源已换成**睡眠汇报派生**
 *   （`panel-shared#readDawnGrowth` ← `sleep-report#latestDerivation`）⇒ 第三条介质
 *   `audit/sleep-reports.jsonl`（`size:mtimeMs`）必须**同轮进键**，否则**派生在变而缓存不失效**。
 *   旧介质 `delta.md` **保留在键内**：它**未退役**（§5-U2 待拍板）且是**兜底源**（派生为空时读它）——
 *   留着它不违背"抽掉一条失效介质"那条判据，反而是那条判据要求的（退役时才同轮移除）。
 *   ⚠ `delta.md` 的键口径一并**收紧为 `size:mtimeMs`**（原为纯 size，与另两条不一致）：实测
 *   `test-inject-cache` S2c——**过期的 delta.md 同尺寸改内容**时旧口径签不出来 ⇒ 缓存继续供旧块
 *   （"过期即弃"这条旧语义被静默绕过）；收紧后同尺寸改写也会失效。
 *   **为什么不签留存面 `reports/sleep/*.md`**：它是 append-only 的**人读面**，每轮增长**不代表派生内容变**
 *   —— 签它会让注入缓存"每轮必失效"（会审 §3.4 介质戳条款给的另一条出路：**声明不参与 + 记录理由**）。
 *   等价性：一轮深睡 ⇒ 派生行变 + 该流 append ⇒ 戳变（与旧 delta.md 被覆盖写同频）；无新轮 ⇒ 戳不变。
 *
 * ⚠ **此处不做节流**（实测教训 · 2026-09-18）：本函数被**内层**（`buildHotMemoryText` 的 30s 键）
 *   与**外层**（`panel-inject` 的事件判据）共用，而内层判据的要求是「**落盘即失效**」——
 *   一度在此加 5s 记忆化 ⇒ `test-inject-cache` 的 S1/S2/S3 当场三红（"改了介质却不重建"）。
 *   节流的正确位置是**外层调用点**（每步一次、可容忍 5s 延迟），不是本函数。
 *   代价：每次取戳 6 次 `statSync`（微秒级，与既有实现同量级）。
 */
export function libStampOf(memRoot, kRoot, now = Date.now()) {
    const mem = memRoot || (() => { try {
        return memoryLibRoot();
    }
    catch {
        return '';
    } })();
    const kn = kRoot || (() => { try {
        return knowledgeRoot();
    }
    catch {
        return '';
    } })();
    return {
        lib: mem ? libStampOfFiles(mem, ['AGENT.md', 'USER.md', 'MEMORY.md']) : '',
        media: mem ? stampOf(mem, ['audit/activity.jsonl']) + (kn ? '|' + libStampOfFiles(kn, ['audit/sleep-reports.jsonl']) + '|' + libStampOfFiles(kn, ['delta.md']) : '') : '',
        warm: kn ? libStampOfFiles(kn, ['audit/warm-recall.json']) : '',
        at: now,
    };
}
/** **失效键**：只由 `lib` + `media` 组成（**不含 `warm`**，理由见头注；也不含会话/查询 —— 那些走事件戳） */
export function stampKeyOf(s) {
    return `${s.lib}|${s.media}`;
}
/** 便于诊断的短摘要（只读；不出现在失效键里） */
export function stampSummaryOf(s) {
    const len = (x) => x.split(',').filter(Boolean).length;
    return { lib: len(s.lib), media: len(s.media), warm: len(s.warm), at: s.at };
}
/** `warm-recall.json` 是否存在（观测用；`/inject/stats` 的 `warmBridge` 位） */
export function warmBridgeExists(kRoot) {
    try {
        return existsSync(join(kRoot || knowledgeRoot(), 'audit', 'warm-recall.json'));
    }
    catch {
        return false;
    }
}
/** `warm-recall.json` 的**键**（观测：注入侧能否读到本步 query 的桥；不参与失效） */
export function warmBridgeKeyOf(kRoot) {
    try {
        return String(JSON.parse(readFileSync(join(kRoot || knowledgeRoot(), 'audit', 'warm-recall.json'), 'utf8'))?.key ?? '');
    }
    catch {
        return '';
    }
}
/** `injectCacheReason` 的返回值 → 层（**映射单点**；新 reason 必须先在此登记，否则机检会红） */
export function layerOfReason(reason) {
    if (!reason)
        return 'none';
    if (reason === 'new' || reason === 'session-changed')
        return 'session';
    if (reason === 'compacted')
        return 'context';
    if (reason === 'query-changed')
        return 'query';
    if (reason === 'lib-changed' || reason === 'media-changed')
        return 'event';
    return 'ttl'; // 未知 reason 归兜底层（**不静默**：未知值由 test-inject-cache 的穷举断言拦下）
}
//# sourceMappingURL=supply-stamp.js.map