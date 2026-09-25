// deepsleep-apply.ts — 深睡「原则/指针落地」领域（依赖 7 个）
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryLibRoot } from './targets.js';
import { MATURATION } from './criteria.generated.js';
import { maturationVerdict } from './criteria.js';
import { COMMIT_FAILED_GATE, commitPrinciples } from './deepsleep-core.js';
import { acquireBankLock, releaseBankLock } from './bank-lock.js';
import { gatedWriteFile, atomicWriteFile } from './section-rewrite.js';
/** 停产挡位的 gate 名（**判据用**：`gate` 字段出现它 = 本轮"跑了但按口径不产出"，而不是"没跑"）。
 *  S2S3 册二（2026-09-19）：用户口径「S3 睡眠不产出」的落点。 */
export const PRODUCE_OFF_GATE = 'produce-off';
/**
 * 门禁退出码 → 用户可见错因串（**模块级单一实现** · ADR-333 册四 2026-09-22）。
 *
 * 为什么抽到模块级（不是为整洁）：`applyPrinciples` 受 `audit-wiring` 的 **I1（装配 ≤120 行）**
 *   冻结棘轮约束，本串原以 `reasonOf` 内联在函数体内；加注释说明后函数达 121 行 ⇒ 门禁红。
 *   本仓既有出路面就是「按领域接缝把判据抽到模块级」，故此处照办。
 *
 * ⚠ **承诺修正**（原串 `'超限=原则间合并（本轮跳过）'`）：`原则间合并` / `画像间合并`
 *   **全仓零实现**（`git grep` 实证：只命中注释自身）⇒ 该**用户可见**错因把"被门禁拒收"
 *   说成"已安排合并"，**通向一个不存在的出口**（承诺 2 处 / 实现 0 处）。
 *   现改为如实描述「本轮拒收」，并指向**真实存在**的维护机制 `consolidateTree`
 *   （深睡树整理，`deepsleep-tree.ts`，对三主档本来就在跑）。
 */
const gateReasonOf = (status) => status === 1 ? '超限=本轮拒收（容量门 enforce=on；收敛由深睡树整理 consolidateTree 负责）'
    : status === 2 ? '指针悬空/未注册'
        : status === 4 ? '行格式违规'
            : status === -1 ? '门禁执行异常'
                : `gate exit=${status}`;
/**
 * 读 `AGENT.md` 原文并给出**CAS 基线**（ADR-333 册三 · 2026-09-22 抽出）。
 *
 * 为什么单独成件（硬理由，不是为好看）：`applyPrinciples` 受 `audit-wiring` 的
 *   **I1（装配 ≤120 行）**冻结棘轮约束，加入 CAS 基线读取后达 **122 行** ⇒ 当场红。
 *   本仓既有出路就是「按领域接缝把一段抽到模块级」——此处抽出的是**落盘链的读端**
 *   （与下方 `commitAccepted` 的写端成对），内聚成立。
 *
 * @returns `content` = 用于拼装的内容（缺文件时是内存 header，保证首次创建可用）；
 *          `disk` = **盘上真实内容**（不存在 ⇒ `undefined`），**仅供 CAS 期望值使用**。
 *          ⚠ 两者不可混用：拿内存 header 当 CAS 期望值会把"首次创建"误判成冲突。
 */
const readPrincipleOrigin = (principlesPath, headerOf) => {
    try {
        const t = readFileSync(principlesPath, 'utf8');
        return { content: t, disk: t };
    }
    catch {
        return { content: (headerOf['AGENT.md'] || '# AGENT.md\n') + '\n', disk: undefined };
    }
};
export async function applyPrinciples(d, memRoot, out) {
    const { config, log, PROFILE_HEADER, kRoot, runNode, capEnv, textOf } = d;
    // ── S2S3 册二（2026-09-19）：**原则通道停产**（用户口径「S3 睡眠不产出」）────────────────
    //   判据用形态：`gate='produce-off'` + `attempted=N` + `added=0/replaced=0` ⇒ 台账上能分辨
    //   「按口径不产出」与「根本没跑」（本册最怕的假绿就是把前者读成后者）。
    //   停产只关**产出**；维护动作（压缩/归档/指针/树/遗忘）不经过本函数，不受影响。
    if (config.s3Produce === false) {
        const n = Array.isArray(out?.principles) ? out.principles.length : 0;
        return { attempted: n, added: 0, replaced: 0, skipped: n, gate: PRODUCE_OFF_GATE, gateExit: 0, rejectedLines: [] };
    }
    const principlesPath = join(memRoot, 'AGENT.md');
    // S2S3 册零：试算 tmp 的**唯一名**（本函数作用域内稳定，供 gateText 写、commitPrinciples 改名）。
    const principlesTmp = `${principlesPath}.tmp-${process.pid}-${Date.now().toString(36)}`;
    const gateScript = join(memoryLibRoot(), 'scripts', 'memory_write_gate.mjs');
    if (!existsSync(gateScript))
        return { attempted: 0, added: 0, replaced: 0, skipped: 0, gate: 'write_gate 未就位', gateExit: -1, rejectedLines: [] };
    /* ADR-333 册三：读原文并取得 **CAS 基线**（`disk` = 盘上真实内容，缺文件 ⇒ `undefined`）——
     *   该基线随 `commitAccepted` 传到落盘点做 CAS，**不在落盘点重读**（重读拿到的是别人的版本，
     *   CAS 恒通过 = 假保护）。抽出理由与语义见 `readPrincipleOrigin` 抬头。 */
    const { content, disk: originOnDisk } = readPrincipleOrigin(principlesPath, PROFILE_HEADER);
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
        // S2S3 册零：**唯一 tmp 名**（原 `principlesPath + '.tmp'` 是固定名 ⇒ 并发写者互踩）。
        //   注意语义：本函数是**试算门禁**（可被调用多次，108/115/120），tmp **留待** `commitPrinciples` 改名就位
        //   ⇒ 不能走 `gatedWriteFile`（那个会立即改名），只能用唯一名 tmp + 显式清理。
        try {
            writeFileSync(principlesTmp, body, 'utf8');
            const g = await runNode(config.nodeBin, gateScript, ['AGENT.md', principlesTmp], { env: { MEMORY_ROOT: memRoot, ...capEnv() }, timeout: 20000 });
            lastExit = Number(g.status ?? -1);
            if (g.status !== 0) {
                try {
                    unlinkSync(principlesTmp);
                }
                catch { /* */ }
            }
            return { ok: g.status === 0, status: Number(g.status ?? -1), out: textOf(g) };
        }
        catch (e) {
            try {
                unlinkSync(principlesTmp);
            }
            catch { /* */ }
            return { ok: false, status: -1, out: String(e.message) };
        }
    };
    const reasonOf = gateReasonOf;
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
        return commitAccepted(principlesPath, principlesTmp, acceptedItems, attempted, skipped, rejectedLines, log, originOnDisk);
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
        // S2S3 册零（2026-09-19）：**整段「读 → 变换 → 落盘」必须在库锁内**。原实现在锁外读、跑 gate 子进程
        //   （最长 20s）再 rename ⇒ 这 20s 内任何并发写者都会被"末写者吃掉"，且 tmp 名固定（`p + '.tmp'`）会互踩。
        const h = acquireBankLock(memRoot, { note: 'pointerops' });
        if (!h) {
            skipped += list.length;
            gate = '库锁被占用（拒写）';
            continue;
        }
        try {
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
            const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
            const w = await gatedWriteFile(p, text, async (tmp) => {
                const g = await runNode(config.nodeBin, gateScript, [target, tmp], { env: { MEMORY_ROOT: memRoot, ...capEnv() }, timeout: 20000 });
                return { ok: g.status === 0, out: `gate exit=${g.status}`, raw: textOf(g) };
            });
            if (!w.ok) {
                gate = String(w.gate || '落盘异常');
                log(`deep sleep: pointerOps write_gate 拒收（${target}）: ${String(w.error).slice(0, 120)}`);
            }
        }
        finally {
            releaseBankLock(h);
        }
    }
    return { updated, skipped, gate };
}
/**
 * **带 CAS 的落盘提交**（ADR-333 册三 · 2026-09-22）：把"预检 + 提交"收成**单一失败出口**。
 *
 * 为什么不写成"CAS 一段 + rename 一段"两处并列 return（首版即如此）：两者是**同一件事的两步**
 *   ——「确认盘上仍是我们的基线」与「把 tmp 换上去」——**任何一个不成立都等于"本轮没落盘"**。
 *   并列写会让"失败返回"从一个变两个，而仓内判据（`test-wiring-gate` 文本版与 **AST 版**）
 *   正是按"失败出口唯一/结构性"锁的（AST 版要求失败 return **位于** `if(!cm.ok)` 的 then 块内）。
 *   ⇒ 收敛为单一出口既更内聚，也让既有判据结构天然成立（**不是为过门禁而改代码**，是本来该这样写）。
 *
 * @returns `{ ok:false, err }` = 任一环节未落盘（调用方判 `COMMIT_FAILED_GATE`，added 归 0 ⇒ 水位回滚重蒸）。
 */
const commitWithCas = (tmpPath, targetPath, baseline) => {
    let cur;
    try {
        cur = readFileSync(targetPath, 'utf8');
    }
    catch {
        cur = undefined;
    }
    if (cur !== baseline) {
        try {
            unlinkSync(tmpPath);
        }
        catch { /* tmp 唯一名，清理失败无害 */ }
        return { ok: false, err: 'CAS 冲突：盘上内容已非本轮读到的基线（他人先写过）⇒ 让位不覆盖' };
    }
    return commitPrinciples(tmpPath, targetPath);
};
/** 并集总门通过后的落盘与计数（自 applyPrinciples 抽出：该函数因此降到 120 行以内）。
 *
 *  ⚠ ADR-333 册三（2026-09-22）：新增 `baseline` 参数 = **本函数读到的盘上原文**（`applyPrinciples` 的 `origin`）。
 *    判因：本通道**不取库锁**（`applyPointerOps` 取、本通道不取），而 `AGENT.md` 上另有
 *    **一个不取锁的写者**（`distill-write.writeProfileLine` 的画像通道）。两者此前无协议：
 *    各自 `readFileSync` → 拼装 → `rename`，**末写者胜**；原语只比字节数 ⇒ 长度相同时检测不出。
 *    ⇒ 落盘前以 `baseline` 做 **CAS**：盘上若已被他人改过 ⇒ **拒写**（判 `COMMIT_FAILED_GATE`，
 *      走既有"落盘失败 ⇒ added 归 0 ⇒ 水位回滚重蒸"通路，**不静默覆盖**）。
 *    ⚠ 基线**随读-改-写链传递**（不是落盘点重读）——重读拿到的已是别人的版本，CAS 恒通过 = 假保护。 */
function commitAccepted(principlesPath, principlesTmp, acceptedItems, attempted, skipped, rejectedLines, log, baseline) {
    // G-16（2026-09-12）：rename 失败必须**报失败**——原写法空 catch 吞异常后仍按 added>0 返回，
    //   而 deepSleepLanded(:357) 判据只看 added/attempted（不读 gate），会把「没落盘」判成 landed:true
    //   ⇒ 审计记已消化、水位推进、下轮不再重蒸 ⇒ 这批痕迹**静默永久丢失**（崩溃型，比拒收型更隐蔽）。
    //   修法要点是 **added 归 0**（只改 gate 无效，见上）；replaced 一并归 0 免污染判据台账；失败留日志。
    // ADR-333：落盘走 **CAS 提交**（预检 + rename 收敛为单一出口，见 `commitWithCas` 抬头）。
    const cm = commitWithCas(principlesTmp, principlesPath, baseline);
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
/**
 * **叙事落地**（P5 · 2026-09-14）：把深睡归纳出的「经历叙事」写进 `notes/agent.md §经历/<标题>`。
 *
 * 为什么需要它（拟人化的 author 层）：McAdams 的自我三层里，双画像只覆盖 `actor`（特质/习惯），
 *   `agent`（目标/意图）与 `author`（**把经历整合成连贯叙事**）都缺。前面的环节只到「事实/承诺/决策」，
 *   没有人把「决定过什么 → 后来怎样」串成一段带因果与时间的叙述——那正是 `author` 层。
 *
 * 落点与形态：正文进 `notes/agent.md`（**详情层**），索引/记录由 `ring-commit` 的 `episodes` 通道写
 *   `episode` kind 记录（`pointer` 指回本小节，可深读）。**不新建文件**（`noteWarn` 由体检脚本管）。
 *
 * 幂等：同标题小节已存在 ⇒ **原地替换正文**（不重复追加；重跑深睡不会把同一个故事写两遍）。
 * 零抛出：写失败只回计数与日志，不打断深睡主链路。
 */
export async function applyNarratives(d, memRoot, out) {
    const { log } = d;
    const items = (out && Array.isArray(out.narratives)) ? out.narratives : [];
    const valid = items.filter((n) => n && String(n.title || '').trim() && String(n.text || '').trim());
    const skipped = items.length - valid.length;
    if (!valid.length)
        return { written: 0, skipped, titles: [] };
    const p = join(memRoot, 'notes', 'agent.md');
    let content = '';
    try {
        content = readFileSync(p, 'utf8');
    }
    catch {
        content = '# agent 自我画像 · 详情\n';
    }
    const H2 = '## 经历';
    let written = 0;
    const titles = [];
    for (const n of valid) {
        const title = String(n.title).trim().slice(0, 40);
        const body = String(n.text).trim();
        const head = `### ${title}`;
        const idx = content.indexOf(head);
        if (idx >= 0) {
            const end = content.indexOf('\n### ', idx + head.length);
            const tail = end >= 0 ? content.slice(end) : '';
            content = content.slice(0, idx) + `${head}\n${body}\n` + tail;
        }
        else {
            content = content.replace(/\s+$/, '\n');
            if (!content.includes(`\n${H2}`))
                content += `\n${H2}\n`;
            content += `\n${head}\n${body}\n`;
        }
        written++;
        titles.push(title);
    }
    try {
        // S2S3 册零：改走**唯一写入原语**（唯一 tmp 名 + 回读校验）；原固定名 `p + '.tmp'` 并发互踩。
        const w = atomicWriteFile(p, content.replace(/\n{3,}/g, '\n\n'));
        if (!w.ok)
            throw new Error(String(w.error || '落盘失败'));
    }
    catch (e) {
        log(`deep sleep: narrative 落盘失败（本轮不计入 written）: ${String(e?.message || e).slice(0, 120)}`);
        return { written: 0, skipped: items.length, titles: [] };
    }
    return { written, skipped, titles };
}
//# sourceMappingURL=deepsleep-apply.js.map