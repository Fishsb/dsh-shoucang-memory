/**
 * treeops.ts — 深睡 treeOps 最小通道 v1（模型自动维护树第一档；2026-09-10 用户拍板）。
 *
 * 定位：树状记忆由模型自动维护（memory-core-model §2.7.2）——模型在深度睡眠归纳里输出「结构提案」
 * （treeOps），本模块=宿主执行层，只守不变量（锚存在 / 指针不悬空 / 无孤儿 / 操作前归档可回滚 /
 * 索引整文件过 memory_write_gate / 幂等）。层义为模型规范；确定性兜底（v6 唯一门 / consolidation
 * 叶子合并）留在宿主既有通道不变。
 *
 * v1 操作集（最小、安全）：
 *   - rename：同 notes 文件内匹配的标题行（以 ## 或 ### 开头；标题文本与 oldTitle 双向包含或相等）
 *     改为新标题；随后 MEMORY.md/USER.md/AGENT.md 索引行中指向 `notes/<file>.md §…`、且 §token 与
 *     oldTitle 双向包含的指针 token 改写为新标题（仅替换匹配段，保留行其余部分与格式）。
 *   - merge：同文件内两个**均为叶子小节**的标题（canonical=keepTitle；dropTitle 正文中 canonical
 *     不存在的非空行逐行精确去重后追加到 canonical 正文末尾；删除 dropTitle 标题及其正文）；
 *     索引行指向 dropTitle 的指针 token 改写为 keepTitle；找不到 / 任一非叶子 → 跳过该 op 不改任何内容。
 *   - split（v2，2026-09-11 §8.1 分裂律）：把一个**叶子 `##` 小节**按给定边界锚拆成 N 个 `###` 子节——
 *     边界锚 = 各子节首行原文（逐字匹配，须在该 `##` 正文内唯一）；N ≤ 6（扇出目标 K，防横向膨胀）；
 *     父 `##` 保留（lead 留在父），**指针无需改写**（索引行照旧指父，子节经「父/子」逐层展开）。
 *     `###` → `####` 待 §2.7「不建 `####`」拍板后再开（见 spec §8.1 待拍板）。
 *   - move/attach-clone：v2 范围外（后续档；注释预留）。
 *
 * 宿主纪律：
 *   - 防御式：单 op 全程 try/catch，任何异常仅 hooks.log 并跳过该 op，绝不抛出。
 *   - 归档：每轮 <memRoot>/audit/treeops/treeops-<YYYYMMDD-HHmmss>.jsonl——每个 op 应用前记录一行
 *     {op, 相关小节原文}（rename 记标题原/新；merge 记两个小节全文与去向），可回滚证据。
 *   - 文件写：只改确有变化的目标文件；每文件 tmp 写 + rename 原子覆盖（对齐本仓记忆库落盘纪律）。
 *   - 自查（宿主不做 notes 正文 gate，notes 非主文档）：① rename 落盘后该文件标题不产生重复——
 *     同层同名双向包含即冲突 → 回滚该 op（不落盘、计 skipped）；② 索引改写不产生重复指针——
 *     同 target 同新 § 已有其它行 → 跳过该指针改写并 skipped；③ 索引文件（MEMORY/USER/AGENT）
 *     改写走同样 tmp+rename，且改写前对整文件调 join(memRoot,'scripts','memory_write_gate.mjs')
 *     （脚本不存在 → 跳过 gate 仅自查）；exit≠0 → 放弃该索引文件改写并 skipped。
 *   - 幂等：目标标题/小节已不存在、标题已等于新标题、指针 token 同文 → no-op 计 skipped，不改内容。
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/** split 扇出上限（§8.1：内容层扇出目标 K=6，防每层横向膨胀） */
const SPLIT_K_MAX = 6;
function runNodeBin(args, opts) {
    return new Promise((resolve) => {
        let out = '', err = '', killed = false;
        // 子进程剥离 --inspect/--debug 类 NODE_OPTIONS（宿主调试端口二次占用会干扰 gate 判定/误杀子进程）
        const env = { ...process.env };
        env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '').split(/\s+/)
            .filter((t) => t && !/^--(inspect|inspect-brk|debug|debug-brk)(=.*)?$/.test(t)).join(' ');
        if (opts?.env)
            Object.assign(env, opts.env);
        const child = spawn(process.execPath || 'node', args, {
            cwd: opts?.cwd, env: env, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
        });
        const to = setTimeout(() => { killed = true; try {
            child.kill();
        }
        catch { /* */ } }, opts?.timeout ?? 60000);
        child.stdout?.on('data', (d) => { out += d; });
        child.stderr?.on('data', (d) => { err += d; });
        child.on('error', (e) => { clearTimeout(to); resolve({ status: null, out: '', err: String(e).slice(0, 200) }); });
        child.on('close', (code) => { clearTimeout(to); resolve({ status: killed ? null : code, out, err }); });
    });
}
// ── 命名/核心名口径（与 distill.ts consolidateTree / memory_write_gate 一致）──
// 小节标题核心名：去行尾「（20xx-…维护元信息）」父括号；索引 §token 与标题按核心名双向包含匹配
const CORE_TAIL_RE = /\s*[（(]\s*20\d{2}[-/]\d{1,2}[-/]\d{1,2}[^）)]*[）)]\s*$/;
const coreName = (t) => String(t || '').trim().replace(CORE_TAIL_RE, '').trim();
/** 双向包含（核心名口径）：x===y || x.includes(y) || y.includes(x) */
const biContains = (a, b) => {
    const x = coreName(a);
    const y = coreName(b);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};
const coreKey = (t) => coreName(t).toLowerCase();
// 标题可安全出现在 notes/索引 §token 里的字符集（/ § → 会破坏 §A/§B 指针列表语法 → 拒）
const TITLE_OK = (t) => !/[#`\n\r]/.test(t) && !/[\/§→]/.test(coreName(t)) && coreName(t).length > 0 && t.length <= 120;
const HEAD_RE = /^(#{2,})[ \t]+(.*)$/;
/** 小节解析：标题到「下一个同层或更高层标题」之间；正文=区间内排除更深子树段的行；leaf=区间内无更深标题 */
function parseSections(ls) {
    const heads = [];
    for (let i = 0; i < ls.length; i++) {
        const m = HEAD_RE.exec(ls[i]);
        if (m)
            heads.push({ i, level: m[1].length, title: m[2].trim() });
    }
    const levelAt = new Map();
    heads.forEach((h) => levelAt.set(h.i, h.level));
    const out = [];
    for (let k = 0; k < heads.length; k++) {
        const h = heads[k];
        let end = ls.length;
        for (let kk = k + 1; kk < heads.length; kk++) {
            if (heads[kk].level <= h.level) {
                end = heads[kk].i;
                break;
            }
        }
        let leaf = true;
        const body = [];
        const bodyIdx = [];
        let p = h.i + 1;
        while (p < end) {
            const lv = levelAt.get(p);
            if (lv !== undefined && lv > h.level) {
                leaf = false; // 更深子标题区：整段跳过（子树不属本小节正文）
                let q = p + 1;
                while (q < ls.length) {
                    const l2 = levelAt.get(q);
                    if (l2 !== undefined && l2 <= lv)
                        break;
                    q++;
                }
                p = q;
                continue;
            }
            body.push(ls[p]);
            bodyIdx.push(p);
            p++;
        }
        out.push({ idx: h.i, level: h.level, title: h.title, end, leaf, body, bodyIdx });
    }
    return out;
}
/** 归一化 op.file（容忍 `notes/x.md` 与 `x.md` 两种写法；禁 INDEX.md/穿越路径） */
function normalizeNotesFile(f) {
    const raw = String(f || '').trim().replace(/\\/g, '/');
    const name = raw.startsWith('notes/') ? raw.slice('notes/'.length) : raw;
    if (!/^[A-Za-z0-9_-]+\.md$/i.test(name))
        return null;
    if (name.toLowerCase() === 'index.md')
        return null;
    return name;
}
// ── 整文件原子写（tmp + rename；对齐记忆库落盘纪律）──
function atomicWrite(p, text) {
    const tmp = p + '.tmp';
    try {
        writeFileSync(tmp, text, 'utf8');
        renameSync(tmp, p);
        return true;
    }
    catch {
        try {
            unlinkSync(tmp);
        }
        catch { /* */ }
        return false;
    }
}
/** 既有行整理口径：空行压缩 + 末尾单换行（与 applyPrinciples/applyPointerOps/consolidateTree 一致） */
const finalize = (ls) => ls.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
const readLines = (p) => {
    try {
        return readFileSync(p, 'utf8').split(/\r?\n/);
    }
    catch {
        return null;
    }
};
/** § 指针 token 改写：`notes/<nf>` 之后至下一个 notes/ 或 → 之前的 § 段中，与 oldCore 双向包含的 token → §newCore。
 *  仅替换匹配段、保留行其余部分；纯「§A/§B」语法段整段归一（去空 token、同目标折叠）；返回 null=未变。 */
function rewriteRowPointers(raw, nf, oldCore, newCore) {
    const token = `notes/${nf}`;
    if (!raw.includes(token))
        return null;
    let out = '';
    let cursor = 0;
    let pos = raw.indexOf(token);
    let changed = false;
    while (pos >= 0) {
        out += raw.slice(cursor, pos + token.length);
        let end = raw.length;
        const nx = raw.indexOf('notes/', pos + token.length);
        const nxArrow = raw.indexOf('→', pos + token.length);
        if (nx >= 0 && nx < end)
            end = nx;
        if (nxArrow >= 0 && nxArrow < end)
            end = nxArrow;
        let seg = raw.slice(pos + token.length, end);
        const firstSeg = seg;
        let segChanged = false;
        seg = seg.replace(/(§[^§/]*)/g, (whole) => {
            const kw = coreName(whole.replace(/^§+/, '').trim());
            if (!kw)
                return whole;
            if (biContains(kw, oldCore)) {
                changed = true;
                segChanged = true;
                return `§${newCore}`;
            }
            return whole;
        });
        if (segChanged) {
            // 纯「§A/§B」（可带空白）才整段归一：去空 token、同目标重复折叠、统一 ` §A/§B` 风格；
            // 含杂散文本则只做 token 替换不改其余（保留行其余部分与格式）
            const gm = /^\s*((?:§[^§/→]*)(?:\s*\/\s*(?:§[^§/→]*))*)\s*$/.exec(seg);
            if (gm) {
                const seen = new Set();
                const norm = [];
                const tokRe = /§([^§/]+)/g;
                let tm;
                while ((tm = tokRe.exec(gm[1]))) {
                    const core = coreName(tm[1].trim());
                    if (!core || seen.has(core))
                        continue;
                    seen.add(core);
                    norm.push(`§${core}`);
                }
                if (norm.length) {
                    const lead = /^\s/.test(firstSeg) ? ' ' : '';
                    const trail = /\s$/.test(firstSeg) ? ' ' : '';
                    seg = lead + norm.join('/') + trail;
                }
            }
        }
        out += seg;
        cursor = end;
        if (end >= raw.length)
            break;
        pos = raw.indexOf(token, end);
    }
    out += raw.slice(cursor);
    return changed ? out : null;
}
/** 收集一行内 `notes/<nf>` 之后 §token 的核心名（小写；供重复指针自查） */
function rowPointerKeys(raw, nf) {
    const token = `notes/${nf}`;
    const keys = [];
    if (!raw.includes(token))
        return keys;
    let pos = raw.indexOf(token);
    while (pos >= 0) {
        let end = raw.length;
        const nx = raw.indexOf('notes/', pos + token.length);
        const nxArrow = raw.indexOf('→', pos + token.length);
        if (nx >= 0 && nx < end)
            end = nx;
        if (nxArrow >= 0 && nxArrow < end)
            end = nxArrow;
        const seg = raw.slice(pos + token.length, end);
        const tokRe = /§([^§/]+)/g;
        let m;
        while ((m = tokRe.exec(seg))) {
            const core = coreName(m[1].trim());
            if (core)
                keys.push(core.toLowerCase());
        }
        if (end >= raw.length)
            break;
        pos = raw.indexOf(token, end);
    }
    return keys;
}
/** gate 运行：脚本位于 <memRoot>/scripts/memory_write_gate.mjs（不存在 → 'absent'） */
async function runIndexGate(memRoot, target, tmp) {
    const gateScript = join(memRoot, 'scripts', 'memory_write_gate.mjs');
    if (!existsSync(gateScript))
        return 'absent';
    const env = { MEMORY_ROOT: memRoot };
    for (const k of ['SHOUCANG_CAP_MEMORY', 'SHOUCANG_CAP_USER', 'SHOUCANG_CAP_AGENT']) {
        if (process.env[k])
            env[k] = process.env[k];
    }
    try {
        const r = await runNodeBin([gateScript, target, tmp], { env, timeout: 20000 });
        if (r.status === 0)
            return 'pass';
        return 'fail';
    }
    catch {
        return 'fail';
    }
}
/** 单索引文件指针改写规划（含重复指针自查；dupGuard=rename 打开、merge 关闭——merge 改写无条件，见 v1 操作集 §2） */
function planIndexRewrite(lines, nf, oldCore, newCore, dupGuard) {
    const token = `notes/${nf}`;
    const isIdxRow = (s) => /^\[[^\]\s]+\]/.test(s);
    const affected = [];
    lines.forEach((l, i) => {
        if (!l.trim() || !isIdxRow(l.trim()) || !l.includes(token))
            return;
        const cand = rewriteRowPointers(l, nf, oldCore, newCore);
        if (cand !== null && cand !== l)
            affected.push(i);
    });
    const out = lines.slice();
    let blocked = 0;
    if (!affected.length)
        return { out, blocked, changedRows: 0 };
    const seen = new Set(); // 既存「其它行」指针目标（notes 文件|§核心）
    for (let i = 0; i < lines.length; i++) {
        if (affected.includes(i))
            continue;
        for (const k of rowPointerKeys(lines[i], nf))
            seen.add(`${nf}|${k}`);
    }
    let changedRows = 0;
    for (const i of affected) {
        const cand = rewriteRowPointers(lines[i], nf, oldCore, newCore);
        const keys = rowPointerKeys(cand, nf);
        const collide = dupGuard && keys.some((k) => seen.has(`${nf}|${k}`));
        if (collide) {
            blocked++; // 跳过该指针改写（行保留原样）；spec：同 target 同新 § 已有其它行
            continue;
        }
        out[i] = cand;
        changedRows++;
        for (const k of keys)
            seen.add(`${nf}|${k}`);
    }
    return { out, blocked, changedRows };
}
function safeAudit(hooks, o) { try {
    hooks.audit(o);
}
catch { /* */ } }
function safeLog(hooks, m) { try {
    hooks.log(m);
}
catch { /* */ } }
/**
 * 深睡 treeOps 最小通道 v1 宿主执行：模型提结构提案（rename/merge），宿主守不变量执行。
 * 全程防御式（单 op 异常仅 log 并跳过），绝不抛出；返回 {applied, skipped, archived}。
 */
export async function applyTreeOps(memRoot, ops, hooksIn) {
    const hooks = hooksIn || { audit: () => { }, log: () => { } };
    const result = { applied: 0, skipped: 0, archived: 0 };
    const list = Array.isArray(ops) ? ops : [];
    if (!list.length) {
        safeAudit(hooks, { kind: 'treeops', ops: 0, applied: 0, skipped: 0, archived: 0 });
        safeLog(hooks, 'treeops: 应用 0 / 跳过 0 / 归档 0');
        return result;
    }
    const root = String(memRoot || '');
    if (!root) {
        safeAudit(hooks, { kind: 'treeops', ops: list.length, applied: 0, skipped: list.length, archived: 0, reason: 'memRoot 为空' });
        safeLog(hooks, `treeops: memRoot 为空，跳过 ${list.length} 个 op`);
        result.skipped = list.length;
        return result;
    }
    const ctx = { memRoot: root, hooks, archFile: '', archived: 0 };
    try {
        const dir = join(root, 'audit', 'treeops');
        mkdirSync(dir, { recursive: true });
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
        ctx.archFile = join(dir, `treeops-${stamp}.jsonl`);
    }
    catch (e) {
        // 归档目录建不成 → 本轮不做结构手术（无回滚证据纪律优先），全部跳过并如实审计
        result.skipped = list.length;
        safeAudit(hooks, { kind: 'treeops', ops: list.length, applied: 0, skipped: list.length, archived: 0, reason: `归档目录不可建: ${String(e?.message || e).slice(0, 80)}` });
        safeLog(hooks, `treeops: 归档目录不可建，跳过 ${list.length} 个 op（可回滚证据优先）`);
        return result;
    }
    const archive = (o) => {
        try {
            appendFileSync(ctx.archFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8');
            ctx.archived++;
        }
        catch { /* 单条归档失败静默：不影响主流程（防御式） */ }
    };
    for (const raw of list) {
        try {
            const v = parseOp(raw);
            if (typeof v === 'string') {
                safeLog(hooks, `treeops: 跳过 op（${v}）: ${JSON.stringify(raw).slice(0, 160)}`);
                result.skipped++;
                continue;
            }
            if (v.kind === 'rename') {
                const r = await runRename(ctx, v, archive);
                result.applied += r.applied;
                result.skipped += r.skipped;
                continue;
            }
            if (v.kind === 'split') {
                const r = await runSplit(ctx, v, archive);
                result.applied += r.applied;
                result.skipped += r.skipped;
                continue;
            }
            const r = await runMerge(ctx, v, archive);
            result.applied += r.applied;
            result.skipped += r.skipped;
        }
        catch (e) {
            // 防御式：任何异常只 log 并跳过该 op，绝不抛出
            safeLog(hooks, `treeops: op 异常（跳过）: ${String(e?.message || e).slice(0, 160)}`);
            result.skipped++;
        }
    }
    result.archived = ctx.archived;
    safeAudit(hooks, { kind: 'treeops', ops: list.length, applied: result.applied, skipped: result.skipped, archived: result.archived });
    safeLog(hooks, `treeops: 应用 ${result.applied} / 跳过 ${result.skipped} / 归档 ${result.archived}`);
    return result;
}
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
    let archFile = '';
    try {
        const dir = join(root, 'audit', 'forgetops');
        mkdirSync(dir, { recursive: true });
        const d = new Date();
        archFile = join(dir, `forgetops-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.jsonl`);
    }
    catch (e) {
        res.skipped = list.length;
        safeAudit(hooks, { kind: 'forgetops', ops: list.length, archived: 0, kept: 0, skipped: list.length, reason: `归档目录不可建: ${String(e?.message || e).slice(0, 80)}` });
        safeLog(hooks, `forgetops: 归档目录不可建，跳过 ${list.length} 个 op（可回滚证据优先）`);
        return res;
    }
    const record = (o) => {
        try {
            appendFileSync(archFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8');
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
function parseOp(raw) {
    if (!raw || typeof raw !== 'object')
        return 'op 非对象';
    const file = normalizeNotesFile(raw.file);
    if (!file)
        return 'file 非法（须 notes/<白名单名>.md 或 <名>.md，非 INDEX.md）';
    const action = String(raw.action || '');
    if (action === 'rename') {
        const oldTitle = String(raw.oldTitle || '').trim();
        const newTitle = String(raw.newTitle || '').trim();
        if (!oldTitle || !newTitle)
            return 'rename 缺 oldTitle/newTitle';
        if (!TITLE_OK(newTitle))
            return 'rename newTitle 非法（禁 #/`/换行/指针语法字符）';
        const oldCore = coreName(oldTitle);
        const newCore = coreName(newTitle);
        if (!oldCore || !newCore || oldCore.toLowerCase() === newCore.toLowerCase())
            return 'rename 新旧标题核心名缺失或相同';
        return { kind: 'rename', file, oldTitle, newTitle, oldCore, newCore };
    }
    if (action === 'merge') {
        const keepTitle = String(raw.keepTitle || '').trim();
        const dropTitle = String(raw.dropTitle || '').trim();
        if (!keepTitle || !dropTitle)
            return 'merge 缺 keepTitle/dropTitle';
        const keepCore = coreName(keepTitle);
        const dropCore = coreName(dropTitle);
        if (!keepCore || !dropCore)
            return 'merge 标题核心名缺失';
        if (keepCore.toLowerCase() === dropCore.toLowerCase())
            return 'merge keep/drop 核心名相同';
        if (!TITLE_OK(keepTitle) || !TITLE_OK(dropTitle))
            return 'merge 标题非法（禁 #/`/换行/指针语法字符）';
        return { kind: 'merge', file, keepTitle, dropTitle, keepCore, dropCore };
    }
    if (action === 'split') {
        const title = String(raw.title || '').trim();
        if (!title)
            return 'split 缺 title';
        if (!TITLE_OK(title))
            return 'split title 非法（禁 #/`/换行/指针语法字符）';
        const core = coreName(title);
        if (!core)
            return 'split title 核心名缺失';
        const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
        if (rawParts.length < 2)
            return 'split parts < 2（拆一层至少 2 个子节）';
        if (rawParts.length > SPLIT_K_MAX)
            return `split parts > ${SPLIT_K_MAX}（§8.1 扇出目标 K，防横向膨胀）`;
        const parts = [];
        const seen = new Set();
        for (const p of rawParts) {
            const t = String((p && p.title) || '').trim();
            const s = String((p && p.start) || '').trim();
            if (!t)
                return 'split part 缺 title';
            if (!TITLE_OK(t))
                return 'split part title 非法';
            const c = coreName(t);
            if (!c)
                return 'split part title 核心名缺失';
            if (seen.has(c.toLowerCase()))
                return 'split part 重名（核心名重复）';
            if (!s)
                return `split part「${t}」缺 start（边界锚=子节首行原文，逐字取自材料）`;
            seen.add(c.toLowerCase());
            parts.push({ title: t, core: c, start: s });
        }
        return { kind: 'split', file, title, core, parts };
    }
    return 'action 非 rename/merge/split（v2 不含 move/attach-clone）';
}
/** 标题匹配：核心名精确优先，无精确时唯一双向包含；仍歧义（>1）→ 不匹配（宁缺毋滥） */
function matchSection(sections, kw) {
    const exact = sections.filter((s) => coreKey(s.title) === coreKey(kw));
    if (exact.length === 1)
        return { sec: exact[0], exact: true };
    const loose = sections.filter((s) => biContains(s.title, kw));
    if (loose.length === 1)
        return { sec: loose[0], exact: false };
    return null;
}
async function runRename(ctx, v, archive) {
    const { memRoot, hooks } = ctx;
    const notePath = join(memRoot, 'notes', v.file);
    const lines = readLines(notePath);
    if (!lines) {
        archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, outcome: 'skipped', reason: 'notes 文件缺失/不可读' });
        safeLog(hooks, `treeops: rename ${v.file} 跳过：文件缺失/不可读`);
        return { applied: 0, skipped: 1 };
    }
    const sections = parseSections(lines);
    // 只匹配 ## 与 ### 开头标题行（v1 口径）
    const scope = sections.filter((s) => s.level === 2 || s.level === 3);
    const hit = matchSection(scope, v.oldTitle);
    if (!hit) {
        archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, outcome: 'skipped', reason: '标题未找到或匹配歧义' });
        safeLog(hooks, `treeops: rename ${v.file} §${v.oldTitle} 跳过：标题未找到或匹配歧义（宁缺毋滥）`);
        return { applied: 0, skipped: 1 };
    }
    const sec = hit.sec;
    const headingOriginal = lines[sec.idx];
    // 保留原标题行层级标记（## 或 ###），文本改为新标题
    const markerLen = (headingOriginal.match(/^#+/) || ['##'])[0].length;
    const newHeading = `${'#'.repeat(markerLen)} ${v.newTitle}`;
    // 自查①：改动后该文件标题不产生重复（同层同名双向包含即冲突 → 回滚该 op：不落盘、计 skipped）
    const newCore = v.newCore;
    const conflict = scope.some((s) => s.idx !== sec.idx && s.level === sec.level && biContains(s.title, newCore));
    if (conflict) {
        archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, headingOriginal, headingNew: newHeading, outcome: 'skipped', reason: '同层同名双向包含冲突（回滚不落盘）' });
        safeLog(hooks, `treeops: rename ${v.file} §${v.oldTitle} → ${v.newTitle} 跳过：同层重名冲突（回滚）`);
        return { applied: 0, skipped: 1 };
    }
    archive({ action: 'rename', file: `notes/${v.file}`, oldTitle: v.oldTitle, newTitle: v.newTitle, headingOriginal, headingNew: newHeading });
    const next = lines.slice();
    next[sec.idx] = newHeading;
    const body = finalize(next);
    if (body === finalize(lines)) {
        // 幂等 no-op（标题文本已等于目标）
        safeLog(hooks, `treeops: rename ${v.file} §${v.oldTitle} no-op（标题已等于新标题）`);
        return { applied: 0, skipped: 1 };
    }
    if (!atomicWrite(notePath, body)) {
        safeLog(hooks, `treeops: rename ${v.file} 落盘失败（跳过）`);
        return { applied: 0, skipped: 1 };
    }
    // 索引指针改写（MEMORY/USER/AGENT；指向 `notes/<file>.md §…` 且 §token 与 oldTitle 双向包含 → 新标题）
    let skipped = 0;
    for (const idxFile of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
        const r = await rewriteOneIndex(ctx, idxFile, v.file, v.oldCore, v.newCore, true, v);
        skipped += r;
    }
    return { applied: 1, skipped };
}
/**
 * split（v2，§8.1 分裂律）：把**叶子 `##` 小节**按边界锚拆成 N 个 `###` 子节。
 * 不变量与 v1 同：归档可回滚 / 同层不重名（冲突即回滚不落盘）/ 幂等 / tmp+rename 原子落盘。
 * 边界锚（各子节首行原文）须在该 `##` 正文内**唯一**，否则跳过（宁缺毋滥）。父 `##` 保留，指针不改写。
 */
async function runSplit(ctx, v, archive) {
    const { memRoot, hooks } = ctx;
    const notePath = join(memRoot, 'notes', v.file);
    const lines = readLines(notePath);
    if (!lines) {
        archive({ action: 'split', file: `notes/${v.file}`, title: v.title, outcome: 'skipped', reason: 'notes 文件缺失/不可读' });
        safeLog(hooks, `treeops: split ${v.file} 跳过：文件缺失/不可读`);
        return { applied: 0, skipped: 1 };
    }
    const sections = parseSections(lines);
    // v2 口径：只拆 ##（### → #### 待 §2.7「不建 ####」拍板后再开）
    const hit = matchSection(sections.filter((s) => s.level === 2), v.title);
    if (!hit) {
        archive({ action: 'split', file: `notes/${v.file}`, title: v.title, outcome: 'skipped', reason: '目标 ## 未找到或匹配歧义（v2 仅拆 ##）' });
        safeLog(hooks, `treeops: split ${v.file} §${v.title} 跳过：目标 ## 未找到或匹配歧义`);
        return { applied: 0, skipped: 1 };
    }
    const sec = hit.sec;
    // 守卫：目标须为叶子（无更深标题）——带子树的树干不拆（先 rename/merge 收敛，避免子节去向不明）
    if (!sec.leaf) {
        archive({ action: 'split', file: `notes/${v.file}`, title: v.title, outcome: 'skipped', reason: '目标非叶子（已含更深标题）', section: lines.slice(sec.idx, sec.end).join('\n') });
        safeLog(hooks, `treeops: split ${v.file} §${v.title} 跳过：目标非叶子（已含更深标题）`);
        return { applied: 0, skipped: 1 };
    }
    // 边界锚逐字定位（正文内须唯一）
    const marks = [];
    for (const p of v.parts) {
        const found = [];
        for (let q = sec.idx + 1; q < sec.end; q++)
            if (lines[q].trim() === p.start)
                found.push(q);
        if (found.length !== 1) {
            archive({
                action: 'split', file: `notes/${v.file}`, title: v.title, part: p.title, anchor: p.start,
                outcome: 'skipped', reason: found.length ? '边界锚不唯一' : '边界锚未找到',
                section: lines.slice(sec.idx, sec.end).join('\n'),
            });
            safeLog(hooks, `treeops: split ${v.file} §${v.title} 跳过：边界锚「${p.start.slice(0, 30)}」${found.length ? '不唯一' : '未找到'}`);
            return { applied: 0, skipped: 1 };
        }
        marks.push(found[0]);
    }
    for (let i = 1; i < marks.length; i++) {
        if (marks[i] <= marks[i - 1]) {
            archive({ action: 'split', file: `notes/${v.file}`, title: v.title, outcome: 'skipped', reason: '边界锚顺序与 parts 不一致（须正文中出现顺序）' });
            safeLog(hooks, `treeops: split ${v.file} §${v.title} 跳过：边界锚顺序与 parts 不一致`);
            return { applied: 0, skipped: 1 };
        }
    }
    // 自查：新 ### 名字与同文件既有 ### 核心名冲突 → 回滚（不落盘）
    const scopes = sections.filter((s) => s.level === 3);
    for (const p of v.parts) {
        if (scopes.some((s) => coreKey(s.title) === p.core.toLowerCase())) {
            archive({ action: 'split', file: `notes/${v.file}`, title: v.title, part: p.title, outcome: 'skipped', reason: '同层重名冲突（回滚不落盘）' });
            safeLog(hooks, `treeops: split ${v.file} §${v.title} 跳过：子节「${p.title}」与既有 ### 重名（回滚）`);
            return { applied: 0, skipped: 1 };
        }
    }
    archive({
        action: 'split', file: `notes/${v.file}`, title: v.title,
        parts: v.parts.map((p) => p.title), anchors: v.parts.map((p) => p.start),
        into: v.parts.map((p) => `notes/${v.file} §${coreName(sec.title)}/${p.core}`),
        section: lines.slice(sec.idx, sec.end).join('\n'),
    });
    // 幂等：每个锚的上一行已是目标 `### 子节名` → 视为已拆，no-op
    const already = v.parts.every((p, i) => marks[i] > 0 && lines[marks[i] - 1].trim() === `### ${p.title}`.trim());
    if (already) {
        safeLog(hooks, `treeops: split ${v.file} §${v.title} no-op（子节已存在）`);
        return { applied: 0, skipped: 1 };
    }
    // 施工：倒序插入 `### 子节名`（倒序避免索引漂移）
    const out = lines.slice();
    for (let i = marks.length - 1; i >= 0; i--)
        out.splice(marks[i], 0, `### ${v.parts[i].title}`);
    const body = finalize(out);
    if (!atomicWrite(notePath, body)) {
        safeLog(hooks, `treeops: split ${v.file} 落盘失败（跳过）`);
        return { applied: 0, skipped: 1 };
    }
    // 指针不改写：父 ## 仍在，索引行照旧指父；子节经「父/子」路径逐层展开（§8.1 逐层指针）
    return { applied: 1, skipped: 0 };
}
async function runMerge(ctx, v, archive) {
    const { memRoot, hooks } = ctx;
    const notePath = join(memRoot, 'notes', v.file);
    const lines = readLines(notePath);
    if (!lines) {
        archive({ action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: 'notes 文件缺失/不可读' });
        safeLog(hooks, `treeops: merge ${v.file} 跳过：文件缺失/不可读`);
        return { applied: 0, skipped: 1 };
    }
    const sections = parseSections(lines);
    const keep = matchSection(sections, v.keepTitle);
    const drop = matchSection(sections, v.dropTitle);
    if (!keep || !drop) {
        archive({ action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: keep ? 'drop 未找到/歧义' : 'keep 未找到/歧义' });
        safeLog(hooks, `treeops: merge ${v.file} 跳过：keep/drop 未找到或匹配歧义`);
        return { applied: 0, skipped: 1 };
    }
    if (keep.sec.idx === drop.sec.idx) {
        archive({ action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: 'keep=drop 同一小节' });
        return { applied: 0, skipped: 1 };
    }
    // v1 守卫：两个均须为叶子小节（标题到下一个同层/更高层标题之间不含更深标题）——带子树树干不并（树枝去向不明）
    if (!keep.sec.leaf || !drop.sec.leaf) {
        const why = !keep.sec.leaf ? 'keep 非叶子（含更深标题）' : 'drop 非叶子（含更深标题）';
        archive({
            action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle, outcome: 'skipped', reason: why,
            keepSection: lines.slice(keep.sec.idx, keep.sec.end).join('\n'),
            dropSection: lines.slice(drop.sec.idx, drop.sec.end).join('\n'),
        });
        safeLog(hooks, `treeops: merge ${v.file} ${v.dropTitle}→${v.keepTitle} 跳过：${why}`);
        return { applied: 0, skipped: 1 };
    }
    const keepRaw = lines.slice(keep.sec.idx, keep.sec.end).join('\n');
    const dropRaw = lines.slice(drop.sec.idx, drop.sec.end).join('\n');
    // 逐行精确去重：drop 正文中 canonical 不存在的非空行（trim 口径）→ 追加到 canonical 正文末尾
    const have = new Set();
    for (const l of keep.sec.body) {
        const t = l.trim();
        if (t)
            have.add(t);
    }
    const extra = [];
    for (const l of drop.sec.body) {
        const t = l.trim();
        if (!t || have.has(t))
            continue;
        have.add(t);
        extra.push(l); // 原样保留（非空行逐行精确去重；不做 - 前缀改写——v1 merge 直并正文行）
    }
    // 手术：先删 drop 区间，再在 canonical 正文末尾插入 extra
    const reduced = lines.slice(0, drop.sec.idx).concat(lines.slice(drop.sec.end));
    const keepIdx2 = drop.sec.idx < keep.sec.idx ? keep.sec.idx - (drop.sec.end - drop.sec.idx) : keep.sec.idx;
    let slot = reduced.length;
    for (let q = keepIdx2 + 1; q < reduced.length; q++) {
        const m = HEAD_RE.exec(reduced[q]);
        if (m && m[1].length <= keep.sec.level) {
            slot = q;
            break;
        }
    }
    let ins = keepIdx2 + 1;
    for (let q = keepIdx2 + 1; q < slot; q++) {
        if (reduced[q].trim() !== '')
            ins = q + 1;
    }
    const merged = reduced.slice(0, ins).concat(extra, reduced.slice(ins));
    const mergedBody = finalize(merged);
    archive({
        action: 'merge', file: `notes/${v.file}`, keepTitle: v.keepTitle, dropTitle: v.dropTitle,
        canonicalHeading: keep.sec.title, into: `notes/${v.file} §${coreName(keep.sec.title)}`,
        keepSection: keepRaw, dropSection: dropRaw, appended: extra,
    });
    if (mergedBody === finalize(lines)) {
        safeLog(hooks, `treeops: merge ${v.file} ${v.dropTitle}→${v.keepTitle} no-op（内容无变化）`);
        return { applied: 0, skipped: 1 };
    }
    if (!atomicWrite(notePath, mergedBody)) {
        safeLog(hooks, `treeops: merge ${v.file} 落盘失败（跳过）`);
        return { applied: 0, skipped: 1 };
    }
    // 索引行指向 dropTitle 的指针 token → keepTitle（改写无条件，见 v1 操作集 §2；仍整文件过 gate）
    let skipped = 0;
    for (const idxFile of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
        const r = await rewriteOneIndex(ctx, idxFile, v.file, v.dropCore, v.keepCore, false, v);
        skipped += r;
    }
    return { applied: 1, skipped };
}
/** 单索引文件改写：+1=该文件改写被放弃/有行被跳过（子跳过计数）；0=无需改写或全部落盘 */
async function rewriteOneIndex(ctx, idxFile, notesFile, oldCore, newCore, dupGuard, v) {
    const { memRoot, hooks } = ctx;
    const p = join(memRoot, idxFile);
    const lines = readLines(p);
    if (!lines)
        return 0; // 索引文件缺失 = 无需改写（库缺件场景由部署口径管）
    const plan = planIndexRewrite(lines, notesFile, oldCore, newCore, dupGuard);
    if (!plan.changedRows) {
        if (plan.blocked)
            safeLog(hooks, `treeops: ${idxFile} 指针改写跳过 ${plan.blocked} 行（同 target 同新 § 已有其它行）`);
        return plan.blocked;
    }
    const content = finalize(plan.out);
    const tmp = p + '.tmp';
    try {
        writeFileSync(tmp, content, 'utf8');
    }
    catch {
        safeLog(hooks, `treeops: ${idxFile} tmp 写失败（放弃改写）`);
        return plan.changedRows;
    }
    const gate = await runIndexGate(memRoot, idxFile, tmp);
    if (gate === 'fail') {
        try {
            unlinkSync(tmp);
        }
        catch { /* */ }
        // spec：gate exit≠0 → 放弃该索引文件改写并 skipped（文件保持原样；行内容仍可在归档/日志回溯）
        safeLog(hooks, `treeops: ${idxFile} 索引改写被 memory_write_gate 拒（exit≠0），放弃该文件改写`);
        return plan.changedRows + plan.blocked;
    }
    // gate='absent'（memRoot/scripts 无 gate 脚本）→ 仅自查后写入（v1 口径）
    try {
        renameSync(tmp, p);
        return plan.blocked;
    }
    catch {
        try {
            unlinkSync(tmp);
        }
        catch { /* */ }
        safeLog(hooks, `treeops: ${idxFile} 原子落盘失败（放弃改写）`);
        return plan.changedRows + plan.blocked;
    }
}
//# sourceMappingURL=treeops.js.map