// forgetops.ts — **主动遗忘**领域（自 treeops.ts 拆出 · 阶段 4 · 2026-09-14）
//
// 为什么拆它（按**领域接缝**，不是按行数硬切）：
//   `treeops.ts` 承担的是「结构操作」（rename/merge/split/rm，写侧改写 notes 结构），
//   而本件承担的是「主动遗忘」（cold 节归档 + keep 留痕）——**两者的领域边界在 AGENTS.md 里本就
//   是分开写的**（"treeops.ts（结构操作 + 主动遗忘）"），只是代码挤在同一个文件里。
//   拆开后：结构操作的改动不会碰到遗忘守卫，反之亦然。
//
// ⚠ 方向纪律（**不许反悔**）：依赖严格单向 `forgetops → treeops`。
//   本件从 treeops 取用共用件（parseSections / matchSection / readLines / atomicWrite / finalize / coreName），
//   treeops **不得**反向 import 本件——否则立刻成环（`audit-architecture` 门禁守零循环依赖）。
//
// 守卫清单（迁移时**逐条原样搬运**，一条都没改）：
//   ① 叶子节（防孤儿树枝） ② activity 里须为 cold/retired（防误伤热节）
//   ③ 已是 stub 则跳过（幂等） ④ 画像文件（user/agent）不得 archive（R1 硬保护）
//   ⑤ 单轮归档上限 MAX_ARCHIVE_PER_RUN=3（R4） ⑥ 禁止直删（action 非 archive/keep 一律跳过）
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envelopeEvent as envelope } from './event-envelope.js';
import { coreName, normalizeNotesFile, readLines, matchSection, parseSections, atomicWrite, finalize, safeAudit, safeLog, } from './treeops.js';
/** 读 `audit/activity.jsonl` → `${file}::${核心名小写}` → 状态（缺文件 = 空表 = 无候选） */
function loadActivityStatus(memRoot) {
    const out = new Map();
    try {
        for (const l of readFileSync(join(memRoot, 'audit', 'activity.jsonl'), 'utf8').split(/\r?\n/)) {
            if (!l.trim())
                continue;
            try {
                const o = JSON.parse(l);
                const f = String(o.f || '').replace(/^notes\//, '').replace(/\.md$/, '');
                const s = coreName(String(o.s || ''));
                if (f && s)
                    out.set(`${f}::${s.toLowerCase()}`, { status: String(o.status || ''), retired: !!o.retired });
            }
            catch { /* 坏行跳过 */ }
        }
    }
    catch { /* 无 activity 文件 = 无候选 */ }
    return out;
}
const STUB_RE = /本节正文已归档/;
/** 画像承载文件：其节的「命中」语义与知识节不同——画像行**全量注入**（每轮都在上下文里，agent 无需 read）
 *  ⇒ 永不产生 access 命中 ⇒ **恒为 cold**。所以不得据冷热归档，一律禁 archive。
 *  这是 R1 误伤面的**宿主级硬保护**（2026-09-11 审查：真库 cold 9 条中 6 条是 user.md 画像节，且排序最前）。 */
const PROFILE_FILES = new Set(['user.md', 'agent.md']);
/** 单轮 archive 上限（防模型一次归档过多；keep 不受限）——R4 审查项 */
const MAX_ARCHIVE_PER_RUN = 3;
/** 小节存在性（口径与 matchSection 同源，避免另立一套）：供材料侧剔除悬空候选（R2 审查项） */
export function sectionExists(memRoot, file, section) {
    const f = normalizeNotesFile(file);
    if (!f)
        return false;
    const lines = readLines(join(String(memRoot || ''), 'notes', f));
    if (!lines)
        return false;
    return matchSection(parseSections(lines), String(section || '').trim()) !== null;
}
/** 开一个 forgetOps 归档文件（每轮一个 jsonl，作为可回滚证据）；目录不可建时返回 err 由调用方收敛。 */
function openForgetArchive(root) {
    const p2 = (n) => String(n).padStart(2, '0');
    try {
        const dir = join(root, 'audit', 'forgetops');
        mkdirSync(dir, { recursive: true });
        const d = new Date();
        return { ok: true, file: join(dir, `forgetops-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.jsonl`) };
    }
    catch (e) {
        return { ok: false, err: String(e?.message || e) };
    }
}
export async function applyForgetOps(memRoot, ops, hooksIn) {
    const hooks = hooksIn || { audit: () => { }, log: () => { } };
    const res = { archived: 0, kept: 0, skipped: 0 };
    const list = Array.isArray(ops) ? ops : [];
    if (!list.length)
        return res;
    const root = String(memRoot || '');
    if (!root) {
        res.skipped = list.length;
        return res;
    }
    const p2 = (n) => String(n).padStart(2, '0');
    const arch = openForgetArchive(root);
    if (!arch.ok) {
        res.skipped = list.length;
        safeAudit(hooks, { kind: 'forgetops', ops: list.length, archived: 0, kept: 0, skipped: list.length, reason: `归档目录不可建: ${String(arch.err).slice(0, 80)}` });
        safeLog(hooks, `forgetops: 归档目录不可建，跳过 ${list.length} 个 op（可回滚证据优先）`);
        return res;
    }
    const archFile = arch.file;
    const record = (o) => {
        try {
            appendFileSync(archFile, envelope(o, `archive.${String(o.op || o.action || o.kind || 'event')}`), 'utf8');
        }
        catch { /* 静默 */ }
    };
    const act = loadActivityStatus(root);
    const d0 = new Date();
    const today = `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())}`;
    for (const raw of list) {
        try {
            const action = String((raw && raw.action) || '');
            const file = normalizeNotesFile(raw?.file);
            const section = String(raw?.section || '').trim();
            if (!file || !section) {
                record({ action, file: raw?.file, section, outcome: 'skipped', reason: 'file/section 非法' });
                res.skipped++;
                continue;
            }
            const core = coreName(section);
            if (!core) {
                record({ action, file: `notes/${file}`, section, outcome: 'skipped', reason: '核心名缺失' });
                res.skipped++;
                continue;
            }
            // keep：仅留痕（负真值），不动文件
            if (action === 'keep') {
                record({ action: 'keep', file: `notes/${file}`, section: core, reason: String(raw?.reason || '').slice(0, 160) });
                res.kept++;
                continue;
            }
            if (action !== 'archive') {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: 'action 非 archive/keep（禁止直删）' });
                safeLog(hooks, `forgetops: 跳过 op（action=${action} 非 archive/keep——直删禁止）`);
                res.skipped++;
                continue;
            }
            // 守卫④（R1 审查项）：画像承载文件不得 archive——画像行全量注入，其零命中是机制性的
            if (PROFILE_FILES.has(file.toLowerCase())) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: '画像节不得归档（user/agent 全量注入 ⇒ 零命中是机制性的）' });
                safeLog(hooks, `forgetops: ${file} §${core} 跳过：画像节不得归档（R1 硬保护）`);
                res.skipped++;
                continue;
            }
            // 单轮上限（R4 审查项）：keep 不受限
            if (res.archived >= MAX_ARCHIVE_PER_RUN) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: `超单轮归档上限 ${MAX_ARCHIVE_PER_RUN}` });
                res.skipped++;
                continue;
            }
            const notePath = join(root, 'notes', file);
            const lines = readLines(notePath);
            if (!lines) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: 'notes 文件缺失/不可读' });
                res.skipped++;
                continue;
            }
            const hit = matchSection(parseSections(lines), core);
            if (!hit) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: '小节未找到或匹配歧义' });
                res.skipped++;
                continue;
            }
            const sec = hit.sec;
            // 守卫①：叶子节（防孤儿树枝）
            if (!sec.leaf) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: '非叶子节（含更深标题）——防孤儿树枝' });
                res.skipped++;
                continue;
            }
            // 守卫③（幂等）：已是 stub
            if (sec.body.some((l) => STUB_RE.test(l))) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: '已是归档 stub（幂等）' });
                res.skipped++;
                continue;
            }
            // 守卫②：activity 里须为 cold / retired（防误伤热节）
            const st = act.get(`${file.replace(/\.md$/, '')}::${core.toLowerCase()}`);
            if (!st || (st.status !== 'cold' && !st.retired)) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: st ? `非冷节（status=${st.status}）` : '不在 activity 候选表（非索引引用节或未跟踪）' });
                safeLog(hooks, `forgetops: ${file} §${core} 跳过：非 cold 候选（防误伤热节）`);
                res.skipped++;
                continue;
            }
            const original = lines.slice(sec.idx, sec.end).join('\n');
            record({
                action: 'archive', file: `notes/${file}`, section: core, into: `notes/archive/${file} §${core}`,
                activity: { status: st.status, retired: st.retired }, orphan: !!raw?.orphan,
                reason: String(raw?.reason || '').slice(0, 160),
                sectionText: original,
            });
            // 归档文件（notes/archive/ 不在 NOTES 白名单与召回/注入面内）：不存在则建头
            const apath = join(root, 'notes', 'archive', file);
            try {
                mkdirSync(join(root, 'notes', 'archive'), { recursive: true });
                const head = existsSync(apath) ? '' : `# notes/archive/${file} — 归档区（不参与召回/注入；需要时复制回 notes/${file}）\n`;
                appendFileSync(apath, `${head}\n## ${core}（归档自 notes/${file} · ${today}）\n${sec.body.join('\n')}\n`, 'utf8');
            }
            catch (e) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: `归档写失败: ${String(e?.message || e).slice(0, 60)}` });
                res.skipped++;
                continue;
            }
            // 原位：标题保留 + 2 行 stub（**指针仍有效**）
            const stub = [
                lines[sec.idx],
                `- 本节正文已归档（cold 且 ≥90 天零命中）；原文见 \`notes/archive/${file} §${core}\`，需要时复制回来即可。`,
                `- 归档于 ${today}（forgetOps；可回滚）。`,
            ];
            const next = lines.slice(0, sec.idx).concat(stub, lines.slice(sec.end));
            if (!atomicWrite(notePath, finalize(next))) {
                record({ action, file: `notes/${file}`, section: core, outcome: 'skipped', reason: '原为落盘失败（归档文件已写，原位未改）' });
                safeLog(hooks, `forgetops: ${file} §${core} 落盘失败（归档文件已写，原位未改）`);
                res.skipped++;
                continue;
            }
            res.archived++;
        }
        catch (e) {
            safeLog(hooks, `forgetops: op 异常（跳过）: ${String(e?.message || e).slice(0, 160)}`);
            res.skipped++;
        }
    }
    safeAudit(hooks, { kind: 'forgetops', ops: list.length, archived: res.archived, kept: res.kept, skipped: res.skipped });
    safeLog(hooks, `forgetops: 归档 ${res.archived} / 保留 ${res.kept} / 跳过 ${res.skipped}`);
    return res;
}
//# sourceMappingURL=forgetops.js.map