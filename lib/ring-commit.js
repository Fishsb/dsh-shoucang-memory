/**
 * ring-commit.ts — **环记录落库（两条产线共用）**（P4/P5 · 2026-09-14 · 拟人化方案 §4.3 线 B）
 *
 * 为什么需要它：五个内容环此前**唯一生产者是 CLI**（`scripts/record-ring.mjs`）⇒
 *   实测 988 条记录里带环语义的**仅 9 条**，且全靠手敲。没有自动生产者，「经历」就永远不增长——
 *   而情境层（P2/P3/P6 已接通）能供给的，正是这些环记录。**写侧不断线，读侧才有内容。**
 *
 * 为什么只有一份：蒸馏（会话→库）与深睡（库→库）都要落同样的环记录。
 *   本件是这一步的**单一实现**（仓内铁律：同一事实不得有第二份实现；名字取领域中立的 `ring-commit`
 *   而不是 `distill-ring`，正因它同时服务两条产线）。
 *
 * 落盘配方与 CLI **逐字一致**（`scripts/record-ring.mjs#commit`）：
 *   `eventsFromDiff` 求差分 → 追加 `ring-events.jsonl` → `saveStoreRecords` 存状态。
 *   为什么两样都写：**事件流是不可变历史、store 是当前状态**（store 会被镜像重写，历史不会）；
 *   对账判据要求「事件流重放必须能重建 store 的环记录」。
 *
 * 边界纪律：
 *   · **只做落库**——把模型输出的通道转成环 API 调用；判定/不变量仍在 `criteria` 与各环模块；
 *   · **零抛出**：任何异常只进返回值（记忆写入失败**不得**打断蒸馏/深睡主链路）；
 *   · **不新写打分/排序**；`meta.cues` 由 `ring-supply#serializeCues` 单一实现序列化（与读侧同源）。
 *   · `episodes` 通道写 `episode` kind（属 fact 环）：它**不在** `ringRecordsOf` 的对账范围内
 *     （那里只收 decision/outcome/valence/relation/commitment/association）⇒ 不产生环事件，
 *     也**不会**造成「store 有而事件流无」的假红。这是**显式口径**，不是遗漏。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStore, saveStoreRecords, recordStorePath, RECORD_DIR } from './record-shadow.js';
import { eventsFromDiff, parseEvents, serializeEvents, RING_EVENT_FILE } from './ring-events.js';
import { openDecision, collectOutcome, recordValence } from './decision-ring.js';
import { assertRelation, openCommitment } from './relation-ring.js';
import { serializeCues } from './ring-supply.js';
import { makeRecord, stampRecord, fingerprint } from './record-store.js';
/** 产出通道名（**唯一声明处**；判据段与统计都从这里派生，不另立名单） */
export const RING_CHANNELS = ['decisions', 'commitments', 'relations', 'valences', 'outcomes', 'episodes'];
const str = (v) => (typeof v === 'string' ? v.trim() : '');
/**
 * **cue 键归一化**（2026-09-17 · 情境轴去留裁决的**唯一与裁决无关**的改动）。
 *
 * 判因（真机实测）：读侧 `panel-shared#sitCtx` 产出 `scope=workspace:<activeRootOf().path>`，
 *   而 `ring-supply#cueOverlap` 的匹配判据是**字符串全等**（`situation-key.ts:76`），非前缀、非归一。
 *   库内同一工作区因此裂成多片：`<盘符>:\<a>\<b>`=153 / `<盘符>:/<a>/<b>`=33 / `shoucang`=54
 *   ⇒ **读侧只对得上其中一片，其余永久不可达**（静默失配，不是"没数据"）。
 *
 * 归一规则（**只做确定性、可逆性无损的三件事**）：
 *   ① 分隔符统一：`\` → `/`（Windows 与 POSIX 写法等价）
 *   ② 去尾斜杠（`<盘符>:/<a>/` 与 `<盘符>:/<a>` 等价）
 *   ③ 折叠重复斜杠（`<盘符>://<a>` → `<盘符>:/<a>`）
 *   ⚠ **不做**：大小写折叠（POSIX 路径大小写敏感，Windows 盘符不敏感 ⇒ 折叠会**引入**新错配）、
 *     别名归一（`<盘符>:\<别名>\<a>` 是否等于 `<盘符>:\<a>` **无确定性依据，须人裁决** — 见裁决会 §Q2-c）。
 *
 * 边界：**只归一 `scope=` 键的取值部分**，其余维（`task=` 等）**原样透传** ——
 *   它们的受控词表问题属另一议题，此处不越界。
 * 零抛出：任何异常路径返回原值（记忆写入**不得**因归一化失败而中断）。
 */
const normalizeCue = (k) => {
    try {
        const s = String(k);
        const eq = s.indexOf('=');
        if (eq <= 0)
            return s;
        const dim = s.slice(0, eq);
        if (dim !== 'scope')
            return s;
        const v = s.slice(eq + 1).replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '');
        return v ? `${dim}=${v}` : s;
    }
    catch {
        return k;
    }
};
/** 单条输出来源的 cues → 序列化串（读侧 `ring-supply#parseCues` 同源，往返无损）
 *  ⚠ 归一化在**写侧**做（此处）：读侧兜底会**掩盖**库里已有的脏键，下次还是脏的。 */
const cuesOfItem = (it) => {
    const raw = it?.cues;
    const arr = Array.isArray(raw) ? raw.map((x) => String(x)) : typeof raw === 'string' ? [raw] : [];
    return serializeCues(arr.map(normalizeCue));
};
/** 通道计数（供 `enqueued` 统计与审计；**不落库**，纯读） */
export function countRingChannels(out) {
    const o = (out ?? {});
    const n = (k) => (Array.isArray(o[k]) ? o[k].length : 0);
    const r = {};
    for (const k of RING_CHANNELS)
        r[k] = n(k);
    return r;
}
/**
 * 把模型输出的通道落成环记录（**幂等性由各环模块自身守**：同文本同 id、重复结清被拒）。
 * `root` = 记忆库根（`memoryLibRoot()`）；`at` = 判定时刻（必填，不吃隐式 now）；
 * `source` = 产线标签（`distill` / `deep-sleep`），只进审计，不参与语义。
 */
export function commitRingChannels(d, root, out, at, source = 'unknown') {
    const res = { decisions: 0, commitments: 0, relations: 0, valences: 0, outcomes: 0, episodes: 0, events: 0, ok: true };
    const o = (out ?? {});
    const dec = Array.isArray(o.decisions) ? o.decisions : [];
    const com = Array.isArray(o.commitments) ? o.commitments : [];
    const rel = Array.isArray(o.relations) ? o.relations : [];
    const val = Array.isArray(o.valences) ? o.valences : [];
    const outc = Array.isArray(o.outcomes) ? o.outcomes : [];
    const eps = Array.isArray(o.episodes) ? o.episodes : [];
    if (!dec.length && !com.length && !rel.length && !val.length && !outc.length && !eps.length)
        return res;
    try {
        // ⚠ **库未建 ⇒ 拒**，不得"顺手创建"：`loadStore` 对缺失根不报错，而 `saveStoreRecords` 会把目录建出来
        //   ⇒ 若 MEMORY_ROOT 指错，产线会**凭空造出一个游离事实源**（实测：库根不存在时曾"假装成功"写入 1 条）。
        //   与 CLI 契约一致（`record-ring.mjs` 遇库未建 exit 3 并提示先跑 record-sync --import）。
        const storePath = recordStorePath(root);
        if (!existsSync(storePath)) {
            res.ok = false;
            res.reason = `影子库未建（${RECORD_DIR}/ 不存在）——先跑 record-sync.mjs --import`;
            d.log(`${source} 环记录落库跳过：${res.reason}`);
            return res;
        }
        const cur = loadStore(root);
        if (cur.error) {
            res.ok = false;
            res.reason = `影子库不可用：${cur.error}`;
            return res;
        }
        let records = cur.records;
        // ① 决策（记下**当时预测**——那是后果回收的对照项；没有它，经历永远只是日志）
        for (const it of dec) {
            const text = str(it?.text);
            if (!text)
                continue;
            const r = openDecision(records, {
                text,
                predicted: str(it?.predicted),
                rationale: str(it?.rationale),
                alternatives: str(it?.alternatives),
                evidence: str(it?.evidence),
                cues: cuesOfItem(it),
                at,
            });
            records = r.records;
            res.decisions++;
        }
        // ② 承诺/意图（前瞻记忆：**形成时落库**才有意义——事后无从恢复）
        for (const it of com) {
            const who = str(it?.who) || '用户';
            const what = str(it?.what);
            if (!what)
                continue;
            const dir = str(it?.direction);
            const r = openCommitment(records, {
                who,
                what,
                direction: dir === 'owed-to-me' ? 'owed-to-me' : 'owed-by-me',
                due: str(it?.due),
                evidence: str(it?.evidence),
                cues: cuesOfItem(it),
                at,
            });
            records = r.records;
            res.commitments++;
        }
        // ③ 关系事实（谁是谁 / 在意什么 / 忌讳什么）
        for (const it of rel) {
            const who = str(it?.who);
            const note = str(it?.note);
            if (!who || !note)
                continue;
            const lv = Number(it?.level);
            const r = assertRelation(records, { who, note, ...(Number.isFinite(lv) ? { level: lv } : {}), evidence: str(it?.evidence), cues: cuesOfItem(it), at });
            records = r.records;
            res.relations++;
        }
        // ④ 价态（**触发条件**必须带——价态脱离情境就没有意义）
        for (const it of val) {
            const trigger = str(it?.trigger);
            const v = Number(it?.valence);
            if (!trigger || !Number.isFinite(v))
                continue;
            const r = recordValence(records, { trigger, valence: v, evidence: str(it?.evidence), cues: cuesOfItem(it), at });
            records = r.records;
            res.valences++;
        }
        // ⑤ **后果回收**（决策环的核心；深睡产出，蒸馏一般产不出——后果要等事实发生）
        //   幂等：`collectOutcome` 自身拒绝重复回收；未给 hit 时由价态符号推导。
        for (const it of outc) {
            const decisionId = str(it?.decisionId);
            const observed = str(it?.observed);
            if (!decisionId || !observed)
                continue;
            const hitRaw = it?.hit;
            const vRaw = it?.valence;
            const v = Number(vRaw);
            const r = collectOutcome(records, decisionId, {
                observed,
                ...(typeof hitRaw === 'boolean' ? { hit: hitRaw } : {}),
                ...(Number.isFinite(v) ? { valence: v } : {}),
                evidence: str(it?.evidence),
                at,
            });
            if (!r.ok) {
                d.log(`${source} 后果回收被拒（${decisionId}）：${r.reason ?? ''}`);
                continue;
            }
            records = r.records;
            res.outcomes++;
        }
        // ⑥ **叙事/情景**（author 层）：写 `episode` kind（属 fact 环），`pointer` 指向 notes 正文小节。
        //   为何复用 episode 而非新增 kind：kind 表已登记它（`RING_OF_KIND.episode='fact'`），
        //   加新 kind 只会让"登记了没生产者"的旧病复发（本项目 D-04a 就是这么来的）。
        for (const it of eps) {
            const text = str(it?.text);
            const title = str(it?.title);
            if (!text || !title)
                continue;
            const id = `episode:${fingerprint(`${title}|${text}`)}`;
            const rec = stampRecord(makeRecord({
                id,
                kind: 'episode',
                file: '',
                subject: 'agent',
                scope: str(it?.scope) || 'global',
                text,
                source: str(it?.evidence),
                pointer: str(it?.pointer),
                meta: { title, ...(cuesOfItem(it) ? { cues: cuesOfItem(it) } : {}) },
            }), at);
            const i = records.findIndex((r) => r.id === id);
            if (i < 0)
                records = [...records, rec];
            else
                records = records.map((r, k) => (k === i ? { ...rec, createdAt: r.createdAt || at } : r));
            res.episodes++;
        }
        // ⑦ 提交：先事件流（不可变历史）后状态（当前）——顺序与 CLI 一致
        const wrote = res.decisions + res.commitments + res.relations + res.valences + res.outcomes;
        if (!wrote && !res.episodes)
            return res;
        if (wrote) {
            const evPath = join(root, RECORD_DIR, RING_EVENT_FILE);
            const evs = eventsFromDiff(cur.records, records, at, (existsSync(evPath) ? parseEvents(readFileSync(evPath, 'utf8')) : []).length + 1);
            if (evs.length) {
                mkdirSync(join(root, RECORD_DIR), { recursive: true });
                const prev = existsSync(evPath) ? parseEvents(readFileSync(evPath, 'utf8')) : [];
                writeFileSync(evPath, serializeEvents(prev.concat(evs)), 'utf8');
                res.events = evs.length;
            }
        }
        saveStoreRecords(root, records);
        d.audit({ kind: 'ring-commit', source, decisions: res.decisions, commitments: res.commitments, relations: res.relations, valences: res.valences, outcomes: res.outcomes, episodes: res.episodes, events: res.events });
        return res;
    }
    catch (e) {
        res.ok = false;
        res.reason = String(e?.message ?? e).slice(0, 160);
        d.log(`${source} 环记录落库失败（不影响主链路）：${res.reason}`);
        return res;
    }
}
//# sourceMappingURL=ring-commit.js.map