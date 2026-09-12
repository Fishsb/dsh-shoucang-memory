// deepsleep-apply.ts — 深睡「原则/指针落地」领域（依赖 7 个）
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryLibRoot } from './targets.js';
import { MATURATION } from './criteria.generated.js';
import { maturationVerdict } from './criteria.js';
import { COMMIT_FAILED_GATE, commitPrinciples } from './deepsleep-core.js';
export async function applyPrinciples(d, memRoot, out) {
    const { config, log, PROFILE_HEADER, kRoot, runNode, capEnv, textOf } = d;
    const principlesPath = join(memRoot, 'AGENT.md');
    const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs');
    if (!existsSync(gateScript))
        return { attempted: 0, added: 0, replaced: 0, skipped: 0, gate: 'write_gate 未就位', gateExit: -1, rejectedLines: [] };
    let content = '';
    try {
        content = readFileSync(principlesPath, 'utf8');
    }
    catch {
        content = PROFILE_HEADER['AGENT.md'] + '\n';
    }
    const origin = content;
    const lines = content.split(/\r?\n/);
    let skipped = 0;
    // v2.1 M0（ADR-130）：**attempted** = 模型提交的条目数（与 added 区分——gate 拒收时 added 会归零但 attempted 保留）；
    //   rejectedLines = 被门禁拒收时的候选行原文（进审计，便于下次直接定位「指针悬空 / 行格式」）
    let attempted = 0;
    const pending = [];
    const rejectedLines = [];
    for (const p of ((out && Array.isArray(out.principles)) ? out.principles : [])) {
        attempted++;
        const text = String((p && p.text) || '').trim();
        if (!/^\[(原则|路径)\].+→\s*notes\/[A-Za-z0-9_-]+\.md/.test(text)) {
            skipped++;
            rejectedLines.push(`[format] ${text}`);
            continue;
        } // 行格式宿主预检（v17：[路径] 同行门禁；gate 亦校验 [tag] 索引行）
        if (p && p.action === 'replace') {
            const match = String(p.match || '').trim();
            const idx = lines.findIndex((l) => l.trim() === match);
            if (idx < 0) {
                skipped++;
                rejectedLines.push(`[no-match] ${text}`);
                continue;
            }
            pending.push({ kind: 'replace', idx, text, prev: lines[idx] });
            lines[idx] = text;
        }
        else {
            if (lines.some((l) => l.trim().toLowerCase() === text.toLowerCase())) {
                skipped++;
                rejectedLines.push(`[dup] ${text}`);
                continue;
            } // 去重
            pending.push({ kind: 'add', idx: lines.length, text, prev: null });
            lines.push(text);
        }
    }
    if (!pending.length)
        return { attempted, added: 0, replaced: 0, skipped, gate: 'no-op', gateExit: 0, rejectedLines };
    // v2.1 M2（ADR-130）：**逐条裁决** —— 单条不合格不再拖垮整轮；最后对并集再做一次总门（防并集超限），
    //   若并集超限则从尾部贪心回退，直到通过（被回退项按 `[gate:final]` 记账）。
    const baseLines = origin.split(/\r?\n/);
    const buildText = (items) => {
        const t = baseLines.slice();
        for (const it of items) {
            if (it.kind === 'replace')
                t[it.idx] = it.text;
            else
                t.push(it.text);
        }
        return t.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
    };
    let lastExit = 0;
    // v2.2 M5（ADR-130）：成熟度门（enforce=true 时生效；缺省 false=只记录）——
    //   A 来自 audit/maturation.jsonl（由 scripts/maturation-scan.mjs 按「跨日再现天数」计算）；查不到按 A0（未成熟）计。
    const AOf = (text) => {
        const m = String(text).match(/→\s*notes\/([A-Za-z0-9_-]+)\.md\s*§([^/\s]+)/);
        if (!m)
            return { A: Number(MATURATION.A0 ?? 0.3), key: '（无指针）' };
        const key = `notes/${m[1]}.md §${m[2].trim()}`;
        try {
            const rows = readFileSync(join(kRoot, 'audit', 'maturation.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try {
                return JSON.parse(l);
            }
            catch {
                return null;
            } }).filter(Boolean);
            const hit = rows.find((r) => `${r.file} §${r.section}` === key);
            return { A: hit ? Number(hit.A) : Number(MATURATION.A0 ?? 0.3), key };
        }
        catch {
            return { A: Number(MATURATION.A0 ?? 0.3), key };
        }
    };
    const gateText = async (body) => {
        const tmpPath = principlesPath + '.tmp';
        try {
            writeFileSync(tmpPath, body, 'utf8');
            const g = await runNode(config.nodeBin, gateScript, ['AGENT.md', tmpPath], { env: { MEMORY_ROOT: memRoot, ...capEnv() }, timeout: 20000 });
            lastExit = Number(g.status ?? -1);
            if (g.status !== 0) {
                try {
                    unlinkSync(tmpPath);
                }
                catch { /* */ }
            }
            return { ok: g.status === 0, status: Number(g.status ?? -1), out: textOf(g) };
        }
        catch (e) {
            try {
                unlinkSync(tmpPath);
            }
            catch { /* */ }
            return { ok: false, status: -1, out: String(e.message) };
        }
    };
    const reasonOf = (status) => status === 1 ? '超限=原则间合并（本轮跳过）' : status === 2 ? '指针悬空/未注册' : status === 4 ? '行格式违规' : status === -1 ? '门禁执行异常' : `gate exit=${status}`;
    const usePerItem = config.perItemGate !== false;
    let acceptedItems = pending.slice();
    // v2.2 M5：成熟度门（enforce=true）—— A<gate 的升格候选直接降级 notes（不写入索引行）
    if (config.maturationEnforce === true) {
        const kept = [];
        for (const it of pending) {
            const { A, key } = AOf(it.text);
            const v = maturationVerdict(A, true);
            if (v.ok)
                kept.push(it);
            else {
                skipped++;
                rejectedLines.push(`[maturation ${v.reason}] ${key} :: ${it.text}`);
            }
        }
        acceptedItems = kept;
        if (!acceptedItems.length)
            return { attempted, added: 0, replaced: 0, skipped: attempted, gate: 'maturation-rejected', gateExit: -1, rejectedLines };
    }
    if (usePerItem) {
        acceptedItems = [];
        for (const it of pending) {
            const g = await gateText(buildText([...acceptedItems, it]));
            if (g.ok)
                acceptedItems.push(it);
            else {
                skipped++;
                rejectedLines.push(`[gate:${reasonOf(g.status)}] ${it.text}`);
                log(`deep sleep: 逐条门禁拒收（${reasonOf(g.status)}）: ${it.text}`);
            }
        }
        if (!acceptedItems.length)
            return { attempted, added: 0, replaced: 0, skipped: attempted, gate: 'all-rejected', gateExit: lastExit, rejectedLines };
    }
    // 并集总门（防并集超限 / 交叉影响）：不通过则从尾部贪心回退
    let g2 = await gateText(buildText(acceptedItems));
    while (!g2.ok && acceptedItems.length > 1) {
        const dropped = acceptedItems.pop();
        skipped++;
        rejectedLines.push(`[gate:final ${reasonOf(g2.status)}] ${dropped.text}`);
        g2 = await gateText(buildText(acceptedItems));
    }
    if (!g2.ok) {
        if (acceptedItems[0])
            rejectedLines.push(`[gate:final ${reasonOf(g2.status)}] ${acceptedItems[0].text}`);
        return { attempted, added: 0, replaced: 0, skipped: attempted, gate: reasonOf(g2.status), gateExit: lastExit, rejectedLines };
    }
    if (g2.ok)
        return commitAccepted(principlesPath, acceptedItems, attempted, skipped, rejectedLines, log);
    return { attempted, added: 0, replaced: 0, skipped: attempted, gate: reasonOf(lastExit), gateExit: lastExit, rejectedLines };
}
// 指针扩容/重构（v6 用户拍板：索引指针自动维护通道=深睡 pointerOps）——
// 只允许 action=update（原地替换整行），禁止新增/删除行（新增=蒸馏 newIndex 且过唯一性硬门；删除=审计裁决）。
// match 须逐字命中既有行；同文 no-op；最终整文件走 memory_write_gate 全校验（容量/指针小节/行格式）后原子 rename。
/** applyPointerOps（自 createDeepSleep 迁出；依赖经 DsScope 显式注入） */
export async function applyPointerOps(d, memRoot, out) {
    const { runNode, config, capEnv, log, textOf } = d;
    const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs');
    if (!existsSync(gateScript))
        return { updated: 0, skipped: 0, gate: 'write_gate 未就位' };
    const ops = (out && Array.isArray(out.pointerOps)) ? out.pointerOps : [];
    let updated = 0, skipped = 0;
    const byTarget = new Map();
    for (const op of ops) {
        if (!op || !['MEMORY.md', 'USER.md', 'AGENT.md'].includes(String(op.target)) || String(op.action) !== 'update') {
            skipped++;
            continue;
        }
        const line = String(op.line || '').trim();
        const match = String(op.match || '').trim();
        if (!match || !/^\[[^\]\s]+\]/.test(line) || !/→\s*notes\//.test(line)) {
            skipped++;
            continue;
        } // 行格式宿主预检（写门仍会校验）
        if (!byTarget.has(String(op.target)))
            byTarget.set(String(op.target), []);
        byTarget.get(String(op.target)).push({ match, line });
    }
    if (!byTarget.size)
        return { updated, skipped, gate: 'no-op' };
    let gate = 'ok';
    for (const [target, list] of byTarget) {
        const p = join(memRoot, target);
        let content = '';
        try {
            content = readFileSync(p, 'utf8');
        }
        catch {
            skipped += list.length;
            continue;
        }
        const lines = content.split(/\r?\n/);
        let changed = false;
        for (const op of list) {
            const idx = lines.findIndex((l) => l.trim() === op.match);
            if (idx < 0) {
                skipped++;
                continue;
            }
            if (lines[idx].trim().toLowerCase() === op.line.toLowerCase())
                continue; // 同文 no-op
            lines[idx] = op.line;
            changed = true;
            updated++;
        }
        if (!changed)
            continue;
        const tmpPath = p + '.tmp';
        try {
            writeFileSync(tmpPath, lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n'), 'utf8');
            const g = await runNode(config.nodeBin, gateScript, [target, tmpPath], { env: { MEMORY_ROOT: memRoot, ...capEnv() }, timeout: 20000 });
            if (g.status === 0) {
                renameSync(tmpPath, p);
            }
            else {
                try {
                    unlinkSync(tmpPath);
                }
                catch { /* */ }
                gate = `gate exit=${g.status}`;
                log(`deep sleep: pointerOps write_gate 拒收（${target}）: ${textOf(g).slice(0, 120)}`);
            }
        }
        catch (e) {
            try {
                unlinkSync(tmpPath);
            }
            catch { /* */ }
            ;
            gate = '落盘异常';
        }
    }
    return { updated, skipped, gate };
}
/** 并集总门通过后的落盘与计数（自 applyPrinciples 抽出：该函数因此降到 120 行以内）。 */
function commitAccepted(principlesPath, acceptedItems, attempted, skipped, rejectedLines, log) {
    // G-16（2026-09-12）：rename 失败必须**报失败**——原写法空 catch 吞异常后仍按 added>0 返回，
    //   而 deepSleepLanded(:357) 判据只看 added/attempted（不读 gate），会把「没落盘」判成 landed:true
    //   ⇒ 审计记已消化、水位推进、下轮不再重蒸 ⇒ 这批痕迹**静默永久丢失**（崩溃型，比拒收型更隐蔽）。
    //   修法要点是 **added 归 0**（只改 gate 无效，见上）；replaced 一并归 0 免污染判据台账；失败留日志。
    const cm = commitPrinciples(principlesPath + '.tmp', principlesPath);
    if (!cm.ok) {
        log(`deep sleep: 原则落盘失败（未写入，本轮判失败待重蒸）: ${cm.err}`);
        // 不往 rejectedLines 追加（Cody 2026-09-12 纠正，我采纳）：① 审计行已带 gate/gateExit/landed
        //   三字段，落盘失败在其中**直接可见**，追加是冗余；② 审计取 (rejectedLines||[]).slice(0,5)，
        //   已有 ≥5 条时追加的标记会被切掉（push 到尾部 = 写了也白写）；③ rejectedLines 语义是
        //   「被门禁拒收」，落盘失败不是拒收，混入会污染判据台账。可观测性由 log + 三字段承担。
        return { attempted, added: 0, replaced: 0, skipped: attempted, gate: COMMIT_FAILED_GATE, gateExit: -1, rejectedLines };
    }
    const addedN = acceptedItems.filter((i) => i.kind === 'add').length;
    const replacedN = acceptedItems.filter((i) => i.kind === 'replace').length;
    return { attempted, added: addedN, replaced: replacedN, skipped, gate: 'pass', gateExit: 0, rejectedLines };
}
//# sourceMappingURL=deepsleep-apply.js.map