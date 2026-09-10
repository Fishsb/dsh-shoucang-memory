/**
 * activity.ts — v7 条目活性聚合（方案 docs/memory-activity-model.md §6-7，A/B/C 步合集 2026-09-10）。
 *
 * 借鉴来源（不从零造轮子）：Mem0 Memory Decay（活性随使用增、随时间衰减）＋ ACT-R base-level activation
 * 幂律衰减借形；FSRS review-强化语义=一次命中=一次使用事件；Zep/Graphiti invalidate=人工 supersede/merged
 * 作为确定性负真值。适配树状文件记忆：条目宇宙=三索引指针 §锚（同小节多条索引行共享活性）。
 *
 * A 活性聚合：access.log 命中 → ACT-R 式状态迁移（active/warm/cold）+ 遗忘候选清单（只建议不删除）。
 * B 加深候选：30 天窗 hits30≥5 且非 retired → hot-candidates 清单，喂深睡（LLM 决定 pointerOps 扩容/原则提炼，宿主 gate）。
 * C 负反馈 v1：INDEX.md 人工表 superseded/merged/archived/removed → retired（确定性负真值，免机器误判历史留痕）。
 *
 * 派生数据 audit/activity.jsonl（机读、原子替换）；INDEX.md 人工表不动；零 LLM、零删除、绝不抛出。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
const DAY = 86400_000;
function dayKey(d) {
    const x = new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}
function loadRows(file) {
    const map = new Map();
    try {
        for (const l of readFileSync(file, 'utf8').split('\n')) {
            if (!l.trim())
                continue;
            try {
                const o = JSON.parse(l);
                if (o && o.key)
                    map.set(o.key, o);
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 无文件=全新 */ }
    return map;
}
function saveRows(file, rows) {
    try {
        mkdirSync(dirname(file), { recursive: true });
        const tmp = file + '.tmp';
        const out = [...rows.values()]
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((r) => JSON.stringify(r))
            .join('\n') + '\n';
        writeFileSync(tmp, out, 'utf8');
        renameSync(tmp, file); // 原子替换
    }
    catch { /* 落盘失败静默（派生数据可重建） */ }
}
/**
 * v7 条目活性聚合（A 步）。
 * 阈值经 opts 传入（UI 通道：面板「参数调节」→ /set → scheduler.json → distill 深睡巡检调用本函数）；
 * 缺省 14/44/90/5 与 scheduler zod 默认一致（activityWarmDays/activityColdDays/activityArchiveDays/activityHotHits）。
 */
export async function activityAggregate(memRoot, hooks, opts) {
    const warmDays = opts?.warmDays ?? 14; // active→warm 无命中天数
    const coldDays = opts?.coldDays ?? 44; // warm→cold 无命中天数（= warm+30）
    const archiveDays = opts?.archiveDays ?? 90; // cold 且最近命中超此天数 → 遗忘候选
    const hotHits = opts?.hotHits ?? 5; // B：30 天窗命中阈值（方案 §8，UI 可调）
    const { audit, log } = hooks;
    const now = Date.now();
    const auditDir = join(memRoot, 'audit');
    const actFile = join(auditDir, 'activity.jsonl');
    try {
        mkdirSync(auditDir, { recursive: true });
        // 1) 条目宇宙 = 三索引指针 §锚 去重（锚定"事实小节"）
        const topics = new Map();
        for (const idx of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
            let raw = '';
            try {
                raw = readFileSync(join(memRoot, idx), 'utf8');
            }
            catch {
                continue;
            }
            for (const l of raw.split(/\r?\n/)) {
                const m = l.match(/→\s*(notes\/[A-Za-z0-9_-]+\.md)\s*§(.+)$/);
                if (!m)
                    continue;
                const f = m[1];
                const s = m[2].trim().split(/\s*\/\s*/)[0].replace(/^§+/, '');
                if (!f || !s || f === 'notes/INDEX.md')
                    continue;
                const key = `${f}|${s}`;
                if (!topics.has(key))
                    topics.set(key, { f, s });
            }
        }
        // 1.5) C 负真值：INDEX.md 条目元数据表 状态 ∈ superseded/merged/archived/removed → retired
        const retiredNames = [];
        try {
            const idxRaw = readFileSync(join(memRoot, 'notes', 'INDEX.md'), 'utf8');
            let inTable = false;
            for (const l of idxRaw.split(/\r?\n/)) {
                const t = l.trim();
                if (/^#{1,4}\s.*元数据表/.test(t)) {
                    inTable = true;
                    continue;
                }
                if (inTable && t.startsWith('|') && t.endsWith('|')) {
                    const cells = t.split('|').map((c) => c.trim());
                    if (cells.length >= 6 && cells[1] && /^(superseded|merged|archived|removed)(\s|$)/i.test(cells[4]))
                        retiredNames.push(cells[1]);
                }
            }
        }
        catch { /* INDEX 缺失=无人工状态 */ }
        // 2) 命中聚合（t=ISO / f / s）—— 两份来源合并：
        //    · access.log      旧路径：仅 read_section.mjs 写（覆盖工具化读取）
        //    · access-real.jsonl 真实路径（2026-09-10 ACT-023）：由 scripts/harvest-access.mjs 从**会话转录**派生
        //      agent 的真实读（read/grep/glob/pwsh 命中记忆库），补齐「真实读零埋点」的断链。
        //    聚合是「每轮按日志全量重算」，故两源只需形状一致（{t,f,s}）即可，无需改动判定逻辑。
        const hitsBy = new Map();
        for (const logName of ['access.log', 'access-real.jsonl']) {
            const logFile = join(auditDir, logName);
            if (!existsSync(logFile))
                continue;
            try {
                for (const l of readFileSync(logFile, 'utf8').split('\n')) {
                    if (!l.trim())
                        continue;
                    try {
                        const o = JSON.parse(l);
                        if (!o.t || !o.f || !o.s)
                            continue;
                        const f = o.f.startsWith('notes/') ? o.f : 'notes/' + o.f;
                        const s = String(o.s).trim();
                        if (!f.endsWith('.md') || !s)
                            continue;
                        const key = `${f}|${s}`;
                        const at = Date.parse(o.t);
                        if (!Number.isFinite(at))
                            continue;
                        const cur = hitsBy.get(key) || { n: 0, n30: 0, last: 0 };
                        cur.n++;
                        if (at >= now - 30 * DAY)
                            cur.n30++;
                        if (at > cur.last)
                            cur.last = at;
                        hitsBy.set(key, cur);
                    }
                    catch { /* 坏行跳过 */ }
                }
            }
            catch { /* 单份日志读失败=该源按零命中 */ }
        }
        // 3) 合并既有状态 + 本次信号
        const rows = loadRows(actFile);
        for (const [key, tp] of topics) {
            const prev = rows.get(key);
            const hit = hitsBy.get(key);
            const row = prev
                ? { ...prev }
                : { key, f: tp.f, s: tp.s, hits: 0, hits30: 0, lastHit: null, firstSeen: now, status: 'active' };
            row.hits = hit ? hit.n : 0;
            row.hits30 = hit ? hit.n30 : 0;
            if (hit && hit.last)
                row.lastHit = hit.last;
            // C：人工负真值（双向包含防「小节名带日期括号」漂移）
            if (retiredNames.some((r) => r === row.s || r.includes(row.s) || row.s.includes(r)))
                row.retired = true;
            rows.set(key, row);
        }
        // 4) 状态迁移 + 遗忘候选 + 加深候选
        let active = 0, warm = 0, cold = 0, retired = 0;
        const archiveCands = [];
        const hotCands = [];
        for (const row of rows.values()) {
            if (row.retired) {
                row.status = 'cold';
                retired++;
                continue;
            }
            const daysSince = row.lastHit ? (now - row.lastHit) / DAY : Infinity;
            if (row.lastHit !== null && daysSince < warmDays) {
                row.status = 'active';
                active++;
            }
            else if (row.lastHit !== null && daysSince < coldDays) {
                row.status = 'warm';
                warm++;
            }
            else {
                row.status = 'cold';
                cold++;
                const neverHit = row.lastHit === null && row.hits === 0;
                const staleHit = row.lastHit !== null && daysSince > archiveDays;
                if (neverHit || staleHit) {
                    archiveCands.push({ key: row.key, f: row.f, s: row.s, hits: row.hits, days: neverHit ? 'never' : `${Math.round(daysSince)}d` });
                }
            }
            // B 加深候选：非 retired + 近 30 天命中 ≥ 阈值
            if (!row.retired && (row.hits30 || 0) >= hotHits) {
                hotCands.push({ key: row.key, f: row.f, s: row.s, hits30: row.hits30 });
            }
        }
        saveRows(actFile, rows);
        // 5) 审计 + 遗忘/加深清单（只建议不执行；加深清单喂深睡归纳由 LLM+宿主 gate 决定最终动作）
        audit({ kind: 'activity', tracked: rows.size, active, warm, cold, retired, archiveCands: archiveCands.length, hot: hotCands.length });
        log(`activity: 跟踪 ${rows.size}（active ${active} / warm ${warm} / cold ${cold} / retired ${retired}）遗忘候选 ${archiveCands.length} / 加深候选 ${hotCands.length}`);
        if (archiveCands.length) {
            try {
                const f = join(auditDir, `activity-candidates-${dayKey(now)}.md`);
                writeFileSync(f, [
                    '# 遗忘候选（v7 · ' + dayKey(now) + '）', '',
                    '> 仅建议，供 audit-protocol §3 人工裁决；本清单不自动删除。', '',
                    '| 小节 | hits | 距最后命中 |', '|---|---|---|',
                    ...archiveCands.slice(0, 50).map((c) => `| \`${c.f} §${c.s}\` | ${c.hits} | ${c.days} |`), '',
                    `共 ${archiveCands.length} 条。`,
                ].join('\n') + '\n', 'utf8');
            }
            catch { /* 清单写失败静默 */ }
        }
        if (hotCands.length) {
            try {
                const f = join(auditDir, `activity-hot-${dayKey(now)}.md`);
                writeFileSync(f, [
                    '# 加深候选（v7 B · ' + dayKey(now) + '）', '',
                    '> 近 30 天命中 ≥' + hotHits + ' 的高频小节：深睡归纳时可经 pointerOps 扩容概况 / principles 提炼原则（宿主 gate 把关）；本清单不改内容。', '',
                    '| 小节 | 30天命中 |', '|---|---|',
                    ...hotCands.slice(0, 30).map((c) => `| \`${c.f} §${c.s}\` | ${c.hits30} |`), '',
                    `共 ${hotCands.length} 条。`,
                ].join('\n') + '\n', 'utf8');
            }
            catch { /* 清单写失败静默 */ }
        }
    }
    catch (e) {
        log(`activity: 聚合异常（跳过本轮）: ${String(e?.message || e).slice(0, 160)}`);
    }
}
//# sourceMappingURL=activity.js.map