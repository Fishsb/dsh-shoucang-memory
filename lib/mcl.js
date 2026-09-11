/**
 * mcl.ts — 记忆认知环（MCL）双通道机制化（ACT-029，2026-09-11）
 *
 * 设计来源：`.internal/arch/shoucang-SC-S05-MCL-实施方案.md` §3（ADR-009 宿主强制 → ADR-010 熟悉度自适应双通道）。
 * 核心问题：SC-S05 的七步循环此前**只在提示词里**（模型自愿 read 才发生）——「材料在场、认知动作不在」。
 * 本模块把它变成**宿主必经环节**：在 `agent/pre-step`（DSH 官方扩展点，签名同 `dsh-agent-instructions`）按**熟悉度**分流：
 *   快通道（高置信命中 [路径]/[原则]）：零额外材料、零额外往返（RPD：识别即行动，不拖慢熟悉的活）；
 *   慢通道（新颖/低置信）：任务首步注入「薄契约 + top-k 指针」；此后若仍未引用材料，则**再引导一次**（上限可配，之后放行）。
 *
 * 不变量（照方案档 D1/D2/D7 + 项目红线）：
 *   D1 单一实现：熟悉度 = 复用 `vec.recallRanked` / `vec.semanticSim`（**不新写打分**）。
 *   D2 引导优先于拒绝：材料注入发生在**模型本来就要做的第一步**；最多再引导 `maxNudges`（缺省 1），绝不死锁。
 *   D7 预算有界：材料 ≤ `budgetChars`（缺省 600 字符）；只作用于慢通道首步；不进 systemPrompt 常驻面。
 *   零硬编码路径（一律 targets 派生）、零抛出（异常只审计，绝不打断 agent 循环）、审计落 knowledgeRoot()/audit。
 *
 * 熟悉度判据口径 = ACT-024 校准的**绝对余弦**（用户文本 ↔ 命中索引行；干净样本 p95≈0.627 / p99≈0.657，缺省阈值 0.65）。
 * 判据只在 turn 首步计算一次（后续步复用通道与主题，避免每步重复嵌入）。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeRoot, memoryLibRoot } from './targets.js';
import { recallRanked, semanticSim } from './vec.js';
let msgFactory = null;
const loadMsgFactory = async () => {
    if (msgFactory)
        return;
    try {
        const spec = '@deepseek-ai/dsh-llm';
        const mod = await import(spec);
        if (mod && typeof mod.createUserMessage === 'function') {
            const f = mod.createUserMessage;
            msgFactory = (input) => f(input);
            return;
        }
    }
    catch { /* 宿主未提供该包 → 手工构造兜底（同形状 + 冻结） */ }
    msgFactory = (input) => {
        const i = input;
        return Object.freeze({
            id: `msg_mcl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            content: i.content,
            source: i.source,
        });
    };
};
const topicOf = (line) => {
    const m = String(line || '').match(/^\[[^\]]+\]\s*([^·]+)/);
    return (m ? m[1] : '').trim();
};
/** 薄契约（只在慢通道出现，不进常驻注入面） */
const THIN_CONTRACT = [
    '【认知环·慢通道】这是你**不熟悉**的任务（记忆库无高置信命中）。本步先做三件事，再动手：',
    '① 复述任务类型与目标（一句话）；② 需要经验时调用 `shoucang_recall`，或按下面指针读详情；',
    '③ 定方向：引用一条 `[路径]`（可复用步骤）或 `[原则]`（跨任务约束），说明它如何改变你的做法。',
].join('\n');
export function registerMcl(ctx, cfg, hooksIn) {
    const hooks = {
        audit: hooksIn?.audit || ((o) => {
            if (!cfg.audit)
                return;
            try {
                mkdirSync(join(knowledgeRoot(), 'audit'), { recursive: true });
                appendFileSync(join(knowledgeRoot(), 'audit', 'mcl-audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8');
            }
            catch { /* 审计失败静默 */ }
        }),
        log: hooksIn?.log || (() => { }),
    };
    const state = new Map();
    const taskText = new Map();
    const counters = { steps: 0, fast: 0, slow: 0, injected: 0, nudged: 0, lastAt: 0, lastChannel: '', lastSim: 0 };
    const ready = new Set();
    void loadMsgFactory();
    const material = (rows, budget) => {
        let budgetLeft = Math.max(120, budget - THIN_CONTRACT.length);
        const picked = [];
        const topics = [];
        for (const r of rows) {
            const ln = `- [${r.file}] ${r.line}`.slice(0, 200);
            if (ln.length > budgetLeft)
                break;
            budgetLeft -= ln.length + 1;
            picked.push(ln);
            const t = topicOf(r.line);
            if (t)
                topics.push(t);
        }
        const text = picked.length ? `${THIN_CONTRACT}\n${picked.join('\n')}\n（材料仅本步有效；引用其主题词即视为已用）` : THIN_CONTRACT;
        return { text, topics };
    };
    const judge = (text, topics) => {
        if (!text || !topics.length)
            return false;
        return topics.some((t) => t.length >= 2 && text.includes(t.slice(0, 6)));
    };
    const mkMsg = (text) => msgFactory({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'shoucang-mcl', form: 'recall' } });
    // 任务文本捕获（主通道）：`session/event` 的 user/message 带结构源字段——pre-step 的 `decision.messages`
    // 只是「本步出队的消息」，turn 首步过后就取不到用户原话，故必须以事件流为准（口径同 ACT-024）。
    const captureFromEvent = (session, event) => {
        try {
            if (!event || event.type !== 'user/message')
                return;
            const sid = String(session?.id || '');
            if (!sid)
                return;
            const d = event.data || {};
            if (String(d?.source?.kind || '') !== 'user')
                return;
            const text = (Array.isArray(d.content) ? d.content : [])
                .filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('').trim();
            if (text.length < 6)
                return;
            taskText.set(sid, text);
            state.delete(sid); // 新任务 → 重置本会话认知环状态（通道/主题/再引导计数）
        }
        catch { /* 捕获失败静默 */ }
    };
    ctx.on('session/event', (session, event) => captureFromEvent(session, event));
    ctx.on('agent/pre-step', async (payload, next) => {
        let decision = null;
        try {
            decision = await next();
        }
        catch {
            return null;
        }
        try {
            counters.steps++; // 最前置：steps>0 即证明宿主确实调用了本钩子（存活判据）
            if (!cfg.enabled || !decision || decision.kind === 'reject')
                return decision;
            const agent = payload?.agent;
            const sid = String(agent?.id || '');
            if (!sid)
                return decision;
            if (agent?.session?.header?.origin === 'subagent')
                return decision; // 子代理不引导
            const step = Number(payload?.step || 0);
            const messages = Array.isArray(decision.messages) ? decision.messages : [];
            // 任务文本按会话记忆（主通道=session/event 捕获；此处为兜底：首步 messages 里若带真用户消息则刷新）
            const fresh = [...messages].reverse().find((m) => m && m.role === 'user' && String(m?.source?.kind || '') === 'user');
            if (fresh) {
                const t = (Array.isArray(fresh.content) ? fresh.content : [])
                    .filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('').trim();
                if (t.length >= 6 && !taskText.get(sid))
                    taskText.set(sid, t);
            }
            const text = taskText.get(sid) || '';
            if (!text)
                return decision;
            if (!ready.has(sid)) {
                ready.add(sid);
                hooks.audit({ kind: 'mcl-ready', sid: sid.slice(0, 8), step });
            }
            let st = state.get(sid);
            if (!st) {
                st = { nudges: 0, topics: [], channel: '', sim: 0 };
                state.set(sid, st);
            }
            // 注入只发生在**任务首步**：中途步（如热重载跨轮）不插材料，只记一次 skip（防在任务半途打断）
            if (!st.channel && step !== 1) {
                if (!st.lateLogged) {
                    st.lateLogged = true;
                    hooks.audit({ kind: 'mcl-skip', sid: sid.slice(0, 8), step, reason: 'late-step' });
                }
                return decision;
            }
            // ① turn 首步：熟悉度判一次 → 快/慢分流（慢通道注入薄材料）
            if (!st.channel) {
                const r = await recallRanked(memoryLibRoot(), text, cfg.topK, 'all', cfg.embed);
                let sim = 0;
                if (r.rows.length && cfg.embed.enabled) {
                    try {
                        const c = await semanticSim(text, r.rows[0].line, cfg.embed);
                        if (c !== null)
                            sim = Math.max(0, Math.min(1, c));
                    }
                    catch { /* 保持 0 */ }
                }
                const hasHighConf = r.rows.some((x) => /^\[(路径|原则)\]/.test(String(x.line || '').trim()));
                const fast = sim >= cfg.familiarThreshold && hasHighConf;
                st.channel = fast ? 'fast' : 'slow';
                st.sim = sim;
                counters.lastAt = Date.now();
                counters.lastChannel = st.channel;
                counters.lastSim = sim;
                if (fast) {
                    counters.fast++;
                    hooks.audit({ kind: 'mcl-step', sid: sid.slice(0, 8), step, channel: 'fast', sim: Number(sim.toFixed(3)), hit: r.rows[0]?.line?.slice(0, 100) || '', injected: 0 });
                    return decision;
                }
                counters.slow++;
                const m = material(r.rows, cfg.budgetChars);
                st.topics = m.topics;
                counters.injected++;
                await loadMsgFactory();
                const idx = messages.lastIndexOf(fresh);
                const entered = idx >= 0 ? messages.slice(0, idx + 1).concat([mkMsg(m.text)], messages.slice(idx + 1)) : messages.concat([mkMsg(m.text)]);
                hooks.audit({ kind: 'mcl-step', sid: sid.slice(0, 8), step, channel: 'slow', sim: Number(sim.toFixed(3)), hit: r.rows[0]?.line?.slice(0, 100) || '', topics: m.topics, injected: m.text.length, nudge: 0 });
                hooks.log(`mcl: ${sid.slice(0, 8)} 慢通道 → 首步注入 ${m.text.length} 字符 / ${m.topics.length} 主题（sim=${sim.toFixed(3)}）`);
                return { ...decision, messages: entered };
            }
            // ② 快通道：零材料零往返
            if (st.channel === 'fast')
                return decision;
            // ③ 慢通道后续步：合规机检（是否引用注入材料的主题词）→ 有界再引导
            const prevAssistant = [...messages].reverse().find((m) => m && m.role === 'assistant');
            const prevText = prevAssistant && Array.isArray(prevAssistant.content)
                ? prevAssistant.content.filter((b) => b && (b.type === 'text' || b.type === 'reasoning') && typeof b.text === 'string').map((b) => b.text).join('')
                : '';
            const compliant = judge(prevText, st.topics);
            if (!compliant && st.nudges < cfg.maxNudges && st.topics.length) {
                st.nudges++;
                counters.nudged++;
                await loadMsgFactory();
                const nudge = `【认知环·再引导 ${st.nudges}/${cfg.maxNudges}】上一步未引用本任务相关的经验（${st.topics.slice(0, 3).join(' / ')}）。请用一句话补上：任务类型与目标 + 你要引用的一条 \`[路径]\`/\`[原则]\`（指针见上一步材料），然后继续。`;
                hooks.audit({ kind: 'mcl-step', sid: sid.slice(0, 8), step, channel: 'slow', sim: Number(st.sim.toFixed(3)), compliant: false, nudge: 1, topics: st.topics });
                hooks.log(`mcl: ${sid.slice(0, 8)} 慢通道 → 再引导 ${st.nudges}/${cfg.maxNudges}`);
                return { ...decision, messages: messages.concat([mkMsg(nudge)]) };
            }
            if (!compliant)
                hooks.audit({ kind: 'mcl-step', sid: sid.slice(0, 8), step, channel: 'slow', sim: Number(st.sim.toFixed(3)), compliant: false, nudge: 0, nudges: st.nudges, topics: st.topics });
            return decision;
        }
        catch (e) {
            try {
                hooks.audit({ kind: 'mcl-error', err: String(e?.message || e).slice(0, 160) });
            }
            catch { /* 静默 */ }
            return decision;
        }
    });
    ctx.logger?.info?.(`[shoucang] MCL 认知环已装配（enabled=${cfg.enabled} 阈值=${cfg.familiarThreshold} maxNudges=${cfg.maxNudges} 预算=${cfg.budgetChars} 指针=${cfg.topK}）`);
    return {
        status: () => ({
            enabled: cfg.enabled,
            familiarThreshold: cfg.familiarThreshold,
            maxNudges: cfg.maxNudges,
            budgetChars: cfg.budgetChars,
            steps: counters.steps,
            fast: counters.fast,
            slow: counters.slow,
            injected: counters.injected,
            nudged: counters.nudged,
            lastAt: counters.lastAt,
            lastChannel: counters.lastChannel,
            lastSim: Number(counters.lastSim.toFixed(3)),
            sessions: state.size,
            tasks: taskText.size,
        }),
    };
}
//# sourceMappingURL=mcl.js.map