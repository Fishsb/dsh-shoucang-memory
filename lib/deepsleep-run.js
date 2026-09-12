// deepsleep-run.ts — 深睡主流程**编排器**（依赖 8 个领域分组）
//
// ⚠ 它仍是编排器：协调 8 个领域分组，故内部会展开依赖名。与上一版的区别是「从哪来」变了 ——
//   旧版从 32 字段 DsScope 一把解构；现在从 8 个**领域分组**取，依赖来源可读、可按组替换，
//   且子领域各自只拿到 3–7 个（trace 3 / tree 3 / apply 7 / materials 0）。
//   已先行抽出「材料采集」相（deepsleep-materials.ts，零依赖）；
//   剩下的「调用 / 落地 / 收尾」三相拆分排在阶段 D（需重排 error 处理与 timeout 作用域）。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTarget } from './targets.js';
import { applyForgetOps, applyTreeOps } from './treeops.js';
import { activityAggregate } from './activity.js';
import { TRIGGER } from './criteria.generated.js';
import { demoteVerdict, promoteVerdict } from './criteria.js';
import { DEEP_SLEEP_PROMPT, deepSleepLanded, liveFailPolicy, planDeepSleepVerdict } from './deepsleep-core.js';
import { gatherDeepSleepTraces } from './deepsleep-traces.js';
import { consolidateTree } from './deepsleep-tree.js';
import { applyPrinciples, applyPointerOps } from './deepsleep-apply.js';
import { gatherMaterials } from './deepsleep-materials.js';
export async function runDeepSleep(d, sinceArg) {
    const { io, cfg, llm, session: sess, write, housekeep, state, appCtx } = d;
    // 领域别名：下方正文是**原样迁出**的（零逻辑改动），用别名保住裸名，避免逐处改写失真
    const ctx = appCtx;
    const { log, audit, ledger, kRoot } = io;
    const { config, llmState, capEnv } = cfg;
    const { streak, traceSince } = state;
    const { runNode, validateProvider, resolveLlm, resolveDefaultModel } = llm;
    const { pickParent, ensureDaemonParent } = sess;
    const { parseAgentJson, normalizeProfileTarget, writeProfileLine } = write;
    const { bankSnapshot, runSelfCheck } = housekeep;
    const traceDeps = { candidateDir: io.candidateDir, pendDir: io.pendDir, auditFile: io.auditFile };
    const treeDeps = { log, audit, embedCfgOf: housekeep.embedCfgOf };
    const applyDeps = { config, log, PROFILE_HEADER: cfg.PROFILE_HEADER, kRoot, runNode, capEnv, textOf: llm.textOf };
    try {
        const since = sinceArg ?? traceSince();
        const resolved = resolveTarget();
        if (!resolved.present) {
            log('deep sleep: 记忆库缺席（部署残缺），跳过');
            return 'failed';
        }
        // consolidation v1 并入深睡巡检（2026-09-10 用户拍板：停滞≥3h 窗口先向量去重整合再归纳）——
        // 在痕迹归纳之前先做确定性/高置信去重整合（A 索引精确重复 / B 语义近重 / C 小节内行去重 / D 叶子小节合并），
        // 收敛树状记忆「只增不修」的重复指针/重复详情；旧内容已归档可回滚；失败仅 log，绝不影响后续深睡流程。
        try {
            await consolidateTree(treeDeps, resolved.root);
        }
        catch (e) {
            log(`deep sleep: consolidation 失败（跳过，继续深睡）: ${String(e?.message || e).slice(0, 120)}`);
        }
        // 真实读采集（2026-09-10 ACT-023）：`access.log` 只覆盖 read_section 路径，agent 的真实读
        // （read/grep/glob/pwsh 命中记忆库）零埋点 ⇒ 活性/遗忘/回想强度三模型失真（假冷）。
        // 先由 harvest-access.mjs 从**会话转录**按「会话 seq 水位」增量采集真实读到 `access-real.jsonl`，
        // 再由 activityAggregate 合并两源（聚合是每轮按日志全量重算，故无需改判定逻辑）。
        // 失败仅 log，绝不阻断深睡（同 below 各步的收敛策略）。
        try {
            await runNode(config.nodeBin, join(resolved.root, 'scripts', 'harvest-access.mjs'), [], {
                env: { MEMORY_ROOT: resolved.root, ...capEnv() },
                timeout: 120000,
            });
        }
        catch (e) {
            log(`deep sleep: 真实读采集失败（跳过，按既有日志聚合）: ${String(e?.message || e).slice(0, 120)}`);
        }
        // v7 A 步：条目活性聚合（2026-09-10，方案 docs/memory-activity-model.md）——consolidation 之后、归纳之前：
        // 命中聚合 → ACT-R 式状态迁移（active/warm/cold）→ 遗忘候选清单（只建议不删除）；失败仅 log。
        // 阈值走 scheduler.json（activityWarmDays/ColdDays/ArchiveDays/HotHits，UI 可调），缺省 14/44/90/5。
        try {
            await activityAggregate(resolved.root, { audit: io.audit, log: io.log }, {
                warmDays: Number(config.activityWarmDays) || 14,
                coldDays: Number(config.activityColdDays) || 44,
                archiveDays: Number(config.activityArchiveDays) || 90,
                hotHits: Number(config.activityHotHits) || 5,
            });
        }
        catch (e) {
            log(`deep sleep: activity 聚合失败（跳过，继续深睡）: ${String(e?.message || e).slice(0, 120)}`);
        }
        const traces = gatherDeepSleepTraces(traceDeps, resolved.root, since);
        // 无痕迹=无事可归纳，不调用 LLM、不留审计（防每巡检周期一条 no-traces 的膨胀与空转感）——
        // 「没有材料就不需要睡眠」：窗口直接滑到当前，未来痕迹 mtime 必然晚于水位，永不丢失。
        const minTraces = Number(TRIGGER.newTracesMin ?? 1); // B 档：读注册表（trigger.newTracesMin）
        if (!traces || traces.length < minTraces) {
            log(`deep sleep: 窗口内痕迹不足（${traces ? traces.length : 0} < ${minTraces}，起点 ${new Date(since).toLocaleString()}），窗口滑到当前，本轮不睡`);
            return 'no-traces';
        }
        log(`deep sleep: 窗口内痕迹 ${traces.length} 字符（起点 ${new Date(since).toLocaleString()}）`);
        llm.validateProvider();
        const M = gatherMaterials(resolved.root);
        const userInput = [
            '## 当天记忆痕迹（作用域=本日，不做全库扫描）',
            traces,
            M.hotCtx || '（无活性高频小节）',
            M.interCtx || '（无互抑候选）',
            `## 现行原则/路径（冲突时 replace，match 逐字取自此清单）\n${M.currentList}`,
            `## 现行画像（profileOps 的 replace match 逐字取自此处）\n${M.currentProfiles}`,
            `## 现行知识索引（MEMORY.md；pointerOps 扩容/重构的 match 逐字取自此处）\n${M.currentMemIndex}`,
            `## 现行树节清单（treeOps 的 file/oldTitle/dropTitle/keepTitle 必须逐字取自此处；每个小节一行 \`notes/文件:标题\`，含 ## 与 ### 全部）\n${M.currentTreeSections}`,
            `## 待拆候选节正文（子树正文 > R=1000 字的叶子 ##；仅当确要 split 时看此段——parts[].start 必须**逐字**取自对应节的正文行）\n${M.splitCandidates}`,
            `## 遗忘候选（cold 且 ≥90 天零命中的冷节；forgetOps 的 file/section 必须逐字取自此处——只允许 archive/keep，禁止删除）\n${M.forgetCandidates}`,
            `## 近 7 日再现（已有条目被再次命中；判「跨日二次激活」用——同一条目在多个日窗重现 = 该主题稳固，可扩容概况/提纯为更高层原则）\n${M.replayRecent}`,
            '请按规则处理：提炼跨任务泛化原则与双画像/知识索引更新指令，输出 JSON。',
        ].join('\n\n');
        const resolvedLlm = resolveLlm(config.sleepProvider, config.sleepModel);
        const useProvider = !!resolvedLlm && llmState.providerFailCount < 2;
        const agentOptions = useProvider ? { provider: resolvedLlm.provider, model: resolvedLlm.model } : undefined;
        const ac = new AbortController();
        const timeout = setTimeout(() => { try {
            ac.abort(new Error('deep sleep timeout 10min'));
        }
        catch { /* */ } }, 600000);
        let parent = pickParent();
        // 守护 parent 默认关闭（宿主「新建空 agent 当 parent」路径未经验证，实测子代理 100ms stop=error）
        if (!parent && config.deepSleepDaemonParent) {
            const route = agentOptions ?? resolveDefaultModel();
            log(`deep sleep: 无可用 agent，尝试守护 parent（路由 ${route ? `${route.provider}/${route.model}` : '继承默认'}）`);
            parent = await ensureDaemonParent(ac.signal, route);
        }
        if (!parent) {
            log('deep sleep: 无可用 parent agent（宿主 spawn 必需），跳过本轮');
            audit({ kind: 'deep-sleep', result: 'no-parent' });
            return 'failed';
        }
        try {
            const run2 = await ctx.subagents.start('spawn', {
                label: 'deep-sleep-induction',
                parent,
                signal: ac.signal,
                maxDepth: 1,
                ...(agentOptions ? { agentOptions } : {}),
                prompt: [{ type: 'text', text: userInput }],
                persona: DEEP_SLEEP_PROMPT,
                toolFilter: { allow: [] },
            });
            const result = await Promise.race([
                run2.result,
                new Promise((resolve) => setTimeout(() => resolve({ stopReason: 'timeout' }), 600000)),
            ]);
            clearTimeout(timeout);
            const stop = result && result.stopReason;
            if (stop !== 'completed')
                log(`deep sleep: 子代理非正常结束 stop=${stop} 详情=${JSON.stringify(result).slice(0, 400)}`);
            const out = parseAgentJson(result, 'deep sleep');
            if (stop === 'completed' && out)
                llmState.providerFailCount = 0;
            else if (useProvider && (stop !== 'completed' || !out))
                llmState.providerFailCount++;
            // 认知对照 P2「REM 相」：crossTopic（跨主题联想）**合并进 principles 通道**——零新增落盘代码。
            //   硬门：text 的源指针须覆盖 ≥2 个**不同 § 小节**（同主题归纳已由 principles 覆盖）；
            //   开关关（config.enableRemPass / env SHOUCANG_REM_PASS=1）时整段丢弃，不污染既有通道。
            if (out && Array.isArray(out.crossTopic)) {
                const remOn = !!config.enableRemPass || process.env.SHOUCANG_REM_PASS === '1';
                const kept = [];
                for (const c of out.crossTopic) {
                    if (!remOn) {
                        log('deep sleep: crossTopic 丢弃（REM 相未开启）');
                        break;
                    }
                    const text = String((c && c.text) || '').trim();
                    const secs = [...text.matchAll(/§([^/→]+)/g)]
                        .map((m) => String(m[1]).replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim())
                        .filter(Boolean);
                    const uniq = new Set(secs.map((s) => s.toLowerCase()));
                    if (!text || uniq.size < 2) {
                        log(`deep sleep: crossTopic 丢弃（源指针覆盖 ${uniq.size} 个主题 <2）`);
                        continue;
                    }
                    kept.push({ action: String((c && c.action) || 'add'), text });
                }
                if (kept.length) {
                    if (!Array.isArray(out.principles))
                        out.principles = [];
                    out.principles.push(...kept);
                    log(`deep sleep: REM 相并入 ${kept.length} 条跨主题原则`);
                }
            }
            const app = (stop === 'completed' && out)
                ? await applyPrinciples(applyDeps, resolved.root, out)
                : { attempted: 0, added: 0, replaced: 0, skipped: 0, gate: `stop=${stop}`, gateExit: -1, rejectedLines: [] };
            // 双画像巩固：profileOps（add/replace，须 notes 源指针；格式/容量/去重门禁同蒸馏）
            let profileAdded = 0;
            let profileTried = 0;
            if (stop === 'completed' && out && Array.isArray(out.profileOps)) {
                const ops = out.profileOps.filter((o) => o && normalizeProfileTarget(String(o.target)) && ['add', 'replace'].includes(String(o.action)));
                for (const op of ops) {
                    const r = writeProfileLine(resolved.root, String(op.target), String(op.section || ''), String(op.text || ''), op.action === 'replace' ? String(op.match || '') : undefined);
                    if (r.st === 'added')
                        profileAdded++;
                    else
                        profileTried++; // G-19：有提案但未落地（容量/去重/门禁拒收）⇒ 计入 tried
                }
            }
            // v6 指针自动维护：pointerOps（update 原地替换整行，走 write_gate；扩容概况/重构指针 §）
            const ptrRes = (stop === 'completed' && out)
                ? await applyPointerOps(applyDeps, resolved.root, out)
                : { updated: 0, skipped: 0, gate: `stop=${stop}` };
            // v17.3 树自动维护：treeOps（rename/merge；模型提案 → 宿主执行守不变量——归档可回滚/锚存在/指针集内重写/无孤儿/幂等）
            const treeRes = (stop === 'completed' && out && Array.isArray(out.treeOps))
                ? await applyTreeOps(resolved.root, out.treeOps, { audit: io.audit, log: io.log })
                : { applied: 0, skipped: 0, archived: 0 };
            // 认知对照 P0「主动遗忘」：forgetOps（模型对 cold 候选取舍 → 归档移正文留 stub / keep 留理由）
            //   宿主守三条守卫（叶子节 / activity 里为 cold / 非重复 stub）+ 禁止直删，全部在 applyForgetOps 内。
            const forgetRes = (stop === 'completed' && out && Array.isArray(out.forgetOps))
                ? await applyForgetOps(resolved.root, out.forgetOps, { audit: io.audit, log: io.log })
                : { archived: 0, kept: 0, skipped: 0 };
            // G-19：汇总 principles 之外四通道（画像/指针/树/遗忘）的轮次结果，喂给 landed 判据。
            //   tried=有提案但未落地（含守卫跳过）；done=成功落地。
            const otherChannels = {
                tried: profileTried + ptrRes.skipped + treeRes.skipped + forgetRes.skipped,
                done: profileAdded + ptrRes.updated + treeRes.applied + forgetRes.archived,
            };
            log(`deep sleep: stop=${stop} 原则 +${app.added}/替换 ${app.replaced}/跳过 ${app.skipped}（${app.gate}）画像 +${profileAdded} 指针更新 ${ptrRes.updated}/跳过 ${ptrRes.skipped}（${ptrRes.gate}）树 ops ${treeRes.applied}/跳过 ${treeRes.skipped}/归档 ${treeRes.archived} forget 归档 ${forgetRes.archived}/保留 ${forgetRes.kept}/跳过 ${forgetRes.skipped}`);
            // G-19 失败策略：本轮裁定**只算一次**，审计与下方返回值共用同一结果（防两处口径漂移——
            //   此前审计记 failed、真实返回 done 的相反 bug 正是两份判据各自演进所致）。
            const landedNow = deepSleepLanded(stop, out, app, otherChannels);
            const fp = liveFailPolicy();
            const pv = planDeepSleepVerdict(landedNow, fp.policy, streak.v, fp.maxRounds);
            audit({ kind: 'deep-sleep', stop, attempted: app.attempted, added: app.added, replaced: app.replaced, skipped: app.skipped, rejected: (app.rejectedLines || []).length, rejectedLines: (app.rejectedLines || []).slice(0, 5), profiles: profileAdded, pointers: ptrRes.updated, ptrSkipped: ptrRes.skipped, tree: treeRes.applied, treeSkipped: treeRes.skipped, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped, gate: app.gate, gateExit: app.gateExit, otherTried: otherChannels.tried, otherDone: otherChannels.done, landed: landedNow, failPolicy: fp.policy, failStreak: streak.v, released: pv.release });
            // 判据台账（巩固域）：模型判据（可选 judgement）+ 宿主侧**升格/降格裁决**（criteria.ts 单一实现）+ 六通道结果
            ledger({
                domain: 'consolidate', step: 'deep-sleep', stop,
                judgement: (out && out.judgement) || null,
                hostGates: {
                    // 升格裁决（原则：支撑条数；路径：同型次数+跨会话+只从成功）
                    promote: {
                        principles: (out?.principles || []).length ? promoteVerdict('principle', { traces: Number((out?.judgement && out.judgement.evidence) || 0) || undefined }).ok : null,
                        premiseGate: promoteVerdict('principle', { traces: 99, dependsOnPremise: !!(out?.judgement && out.judgement.dependsOnPremise), premiseWritten: !!(out?.judgement && out.judgement.premiseWritten) }),
                    },
                    // 降格/遗忘裁决逐条（三守卫 + 画像节保护 + 单轮上限）
                    demote: (out?.forgetOps || []).slice(0, 8).map((o) => ({ section: `${String(o?.file || '')} §${String(o?.section || '')}`, verdict: demoteVerdict({ file: String(o?.file || ''), status: String(o?.status || 'cold') }).reason })),
                },
                result: { principlesAdded: app.added, principlesReplaced: app.replaced, principlesSkipped: app.skipped, profilesAdded: profileAdded, pointersUpdated: ptrRes.updated, treeApplied: treeRes.applied, treeArchived: treeRes.archived, forgetArchived: forgetRes.archived, forgetKept: forgetRes.kept, forgetSkipped: forgetRes.skipped },
                enqueued: { principles: (out?.principles || []).length, profileOps: (out?.profileOps || []).length, pointerOps: (out?.pointerOps || []).length, treeOps: (out?.treeOps || []).length, forgetOps: (out?.forgetOps || []).length, crossTopic: (out?.crossTopic || []).length, skipped: (out?.skipped || []).length },
            });
            if (stop === 'completed')
                void bankSnapshot('deep-sleep'); // v2：巩固后库快照（best-effort）
            // v2.2 睡眠期自检（宿主义务：子代理只归纳，检测挂在其**完成之后**——守 [env] 子代理会话语义）
            if (config.selfCheck !== false)
                await runSelfCheck('deep-sleep');
            // v2.1 M2：**写入回执**（write.* 事件）——写入是否落地、被拒原因与原文，与上面的 decision.* 同址同版本
            ledger({
                type: 'write.consolidate', domain: 'consolidate', step: 'deep-sleep-write', channel: 'principles',
                carrier: 'always:index', target: 'AGENT.md',
                verdict: app.gate === 'pass' ? 'written' : (app.attempted ? 'rejected' : 'skipped'),
                attempted: app.attempted, written: app.added + app.replaced, added: app.added, replaced: app.replaced,
                reason: app.gate, gateExit: app.gateExit, rejectedLines: (app.rejectedLines || []).slice(0, 5),
                perItemGate: config.perItemGate !== false,
            });
            if (stop === 'completed') {
                // 路线② 晨起摘要 delta：深睡消化后的行级 diff（新增/替换 [原则]/[路径]/画像行 ≤3）→ suite/knowledge/delta.md
                // 语义：delta 是「最近变化的新闻」，AGENT.md/USER.md 是档案全本；delta 永非事实源，过期即弃（下轮深睡覆盖）。
                try {
                    const afterAgent = (() => { try {
                        return readFileSync(join(resolved.root, 'AGENT.md'), 'utf8');
                    }
                    catch {
                        return '';
                    } })();
                    const rows = [];
                    const pushDiff = (beforeText, afterText) => {
                        const pre = new Set((beforeText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
                        for (const l of (afterText || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
                            if (pre.has(l))
                                continue;
                            const tag = (l.match(/^\[([^\] ]+)\]/) || [])[1];
                            if (tag === '原则' || tag === '路径' || l.startsWith('- '))
                                rows.push(l);
                        }
                    };
                    pushDiff(M.currentPrinciples, afterAgent); // AGENT 全档 diff：覆盖 [原则]/[路径] 行与 AGENT 画像 '- ' 行
                    pushDiff(M.currentProfiles, (() => { try {
                        return readFileSync(join(resolved.root, 'USER.md'), 'utf8');
                    }
                    catch {
                        return '';
                    } })()); // USER 画像行（M.currentProfiles 已含 USER 原文作 before）
                    if (rows.length) {
                        const deltaFile = join(kRoot, 'delta.md');
                        writeFileSync(deltaFile, JSON.stringify({ at: new Date().toISOString(), staleAt: new Date(Date.now() + 48 * 3600e3).toISOString(), injections: 0, rows: rows.slice(0, 3) }, null, 2), 'utf8');
                        log(`deep sleep: 晨起摘要已生成（${Math.min(rows.length, 3)} 行）`);
                    }
                }
                catch (e) {
                    log(`deep sleep: 晨起摘要生成失败 ${String(e?.message || e).slice(0, 100)}`);
                }
            }
            // 子代理异常结束（stop=error/timeout/aborted）不算消化：回滚水位，同一批痕迹下轮可重试。
            // 2026-09-09 补缺：stop=completed 但 out=null（JSON 解析失败，如「Unexpected end of JSON input」实锤 ×2）
            // 同样不算消化——否则 done 分支推进水位，整批痕迹永久划出窗口（归纳结果整轮丢失）。
            // 2026-09-11 补缺（静默丢料实锤）：**水位必须与「落地」解耦**——只按 stop=completed && out 判 done 会漏掉
            //   「代理跑完但候选被门禁全数拒收」的轮次（app.gate 为 all-rejected / maturation-rejected / 尾部总门失败，
            //   attempted>0 且 added=0）。此时判 done 会推进水位 → 被拒痕迹永久划出窗口 → 静默丢失（审计实证：
            //   08:32:23.997Z attempted=3/added=0/all-rejected 与 08:48:10.129Z attempted=1/added=0/all-rejected，
            //   两轮 stop=completed 即判 done 并滑窗，丢弃 4 条候选行）。故新增 landed 判据：
            //   landed = 任一通道有落地 → done；五通道皆无提案（真·空轮）→ done（回滚会导致同一批
            //   痕迹无限重处理，必须仍判 done）；只要有提案而**一件都没落地** → failed（水位回滚、下轮重试）。
            //   ⚠ G-19 关键修正（2026-09-12）：旧口径只看 principles 通道的 attempted，导致
            //   「纯 profileOps / 指针 / 树 / 遗忘 轮且全数失败」被误判 done ⇒ 材料静默丢弃。
            //   现把另外四通道的 tried/done 一并纳入（上面的 otherChannels）。
            //   ⚠ 遗留风险（待产品决定）：若某通道**永久**失败（如画像容量满），每轮都会判 failed
            //   ⇒ 水位不推进、同批材料每 idleMs（3h）重试一次且永不放弃。是否需要「连败 N 轮后放行」
            //   的熔断，取决于产品取向（这正是 G-19 选项 A/B/C 的实质）。
            //   2026-09-11 追加：`write_gate 未就位`（applyPrinciples 早返回 :1538，attempted=0）是**基础设施失败**
            //   （门禁脚本缺席 → 根本不可能落地），不得因 attempted===0 而误判 done——显式排除，强制 failed 重试。
            //   **单一实现**：判据抽为模块级纯函数 `deepSleepLanded`（顶部导出），本处与单测共用，防漂移。
            // G-19：必须传 otherChannels —— 此前只传 app，导致审计字段用了全通道判据、
            // 而真实判定仍走旧口径，二者互相矛盾（审计记 failed、代码返回 done ⇒ 水位推进、材料静默丢弃）。
            // 连败计数：streakNow = **含本轮**的连续未消化轮数，须在归零前取值（否则放行日志恒为 1）。
            const streakNow = streak.v + 1;
            if (pv.verdict === 'done')
                streak.v = 0;
            else
                streak.v = streak.v + 1;
            if (pv.release) {
                // 必须留痕：放行 = 这批材料不再重捞（水位推进），是**有告警的丢料**，不可静默。
                log(`deep sleep: 连续 ${streakNow} 轮未消化，按 graded 策略放行（水位推进）以避免无限重试；请检查画像/指针/树/遗忘通道是否长期失败`);
                audit({ kind: 'deep-sleep-release', streak: streakNow, maxRounds: fp.maxRounds, note: '连败达上限，放行并告警' });
            }
            return pv.verdict;
        }
        catch (e) {
            clearTimeout(timeout);
            if (useProvider)
                llmState.providerFailCount++;
            log(`deep sleep ERROR: ${String(e?.message || e).slice(0, 200)}`);
            audit({ kind: 'deep-sleep', error: String(e?.message || e).slice(0, 160) });
            return 'failed';
        }
    }
    catch (e) {
        log(`deep sleep err: ${String(e?.message || e).slice(0, 120)}`);
        return 'failed';
    }
}
//# sourceMappingURL=deepsleep-run.js.map