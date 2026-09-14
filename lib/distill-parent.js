// distill-parent.ts — 蒸馏「父会话与子代理归属（深睡 parent 兜底 / 子代理活跃判定）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（4 项）。
//   对外只暴露 createParentApi(d) —— 返回绑定后的句柄，调用方零感知。
import { randomUUID } from 'node:crypto';
export function createParentApi(d) {
    return {
        CHILD_ACTIVE_MS,
        isValidParent: (...a) => isValidParent(d, ...a),
        rememberAgent: (...a) => rememberAgent(d, ...a),
        isSubagentAgent: (...a) => isSubagentAgent(d, ...a),
        parentSidOf: (...a) => parentSidOf(d, ...a),
        noteChildActivity: (...a) => noteChildActivity(d, ...a),
        dropChild: (...a) => dropChild(d, ...a),
        hasActiveSubagents: (...a) => hasActiveSubagents(d, ...a),
        pickParent: (...a) => pickParent(d, ...a),
        resolveDefaultModel: (...a) => resolveDefaultModel(d, ...a),
        ensureDaemonParent: (...a) => ensureDaemonParent(d, ...a),
    };
}
// 兜底生效日志节流（60s 一次，防每轮刷屏）
const CHILD_ACTIVE_MS = 180000;
const isValidParent = (d, p) => !!p && typeof p === 'object' && !!p.options && !!p.ctx;
const rememberAgent = (d, a) => { try {
    if (isValidParent(d, a))
        d.st.lastParent = a;
}
catch { /* */ } };
// 子代理感知（2026-09-10 实态修复：主会话"派子代理执行、等返回"期间被误判空闲/停滞）：
// DSH 子代理会话 header.origin='subagent' 且 header.parentSession=父会话 id；子代理在跑 = 父会话仍在干活。
const isSubagentAgent = (d, a) => { try {
    return a?.session?.header?.origin === 'subagent';
}
catch {
    return false;
} };
// 父会话 id 解析（2026-09-10 三修）：E2E 实证记录对象上 header.parentSession 可能取不到（当时三会话同判 busy=走了全局兜底）
// → 多字段探测（live session header / record header / options / 直挂字段），全失败才回落全局兜底。
const parentSidOf = (d, a) => {
    try {
        const cands = [
            a?.session?.header?.parentSession, a?.session?.header?.parent, a?.session?.parentSession,
            a?.session?.record?.header?.parentSession, a?.session?.record?.parentSession,
            a?.options?.parentSession, a?.options?.parentId, a?.parentSession, a?.parentId, a?.parent?.id,
        ];
        for (const c of cands)
            if (typeof c === 'string' && c)
                return c;
        return null;
    }
    catch {
        return null;
    }
};
const noteChildActivity = (d, parentSid, childSid) => {
    const now = Date.now();
    if (!parentSid) {
        d.st.globalChildSeen = now;
        return;
    }
    let m = d.st.childSeen.get(parentSid);
    if (!m) {
        m = new Map();
        d.st.childSeen.set(parentSid, m);
    }
    m.set(childSid, now);
};
const dropChild = (d, childSid) => {
    for (const [p, m] of d.st.childSeen) {
        if (m.delete(childSid) && !m.size)
            d.st.childSeen.delete(p);
    }
};
/** 该会话是否有运行中的子代理后代（事件通道 + live status 枚举通道） */
const hasActiveSubagents = (d, sid) => {
    const now = Date.now();
    try {
        const m = d.st.childSeen.get(sid);
        if (m) {
            for (const [child, seen] of m) {
                const live = d.ctx.agents.get(child);
                if (live && live.status === 'running')
                    return true;
                if (now - seen < CHILD_ACTIVE_MS)
                    return true;
                m.delete(child);
            }
            if (!m.size)
                d.st.childSeen.delete(sid);
        }
        if (d.st.globalChildSeen && now - d.st.globalChildSeen < CHILD_ACTIVE_MS) {
            // 2026-09-11 审查：父归属解析失败的子代理事件会**全局**冻结蒸馏/深睡（保守取舍：宁少蒸勿切碎）——
            // 加节流日志，避免「为什么没蒸」无从判断。
            if (now - d.st.globalChildLoggedAt > 60000) {
                d.st.globalChildLoggedAt = now;
                d.log(`子代理活动兜底生效：父归属未解，全局冻结蒸馏/深睡中（剩余 ${Math.ceil((CHILD_ACTIVE_MS - (now - d.st.globalChildSeen)) / 1000)}s）`);
            }
            return true;
        }
    }
    catch { /* 事件通道异常→继续走枚举通道 */ }
    try {
        for (const a of d.ctx.agents.list() || []) {
            if (!isSubagentAgent(d, a))
                continue;
            const live = d.ctx.agents.get(a.id);
            if (!(live && live.status === 'running'))
                continue;
            let p = parentSidOf(d, a) || parentSidOf(d, live);
            let depth = 0;
            if (!p)
                return true; // 归属解析失败：宁少蒸勿切碎（保守）
            while (p && depth++ < 4) {
                if (p === sid)
                    return true;
                const pa = d.ctx.agents.get(p);
                p = pa ? parentSidOf(d, pa) : null;
            }
        }
    }
    catch { /* 查询失败=按无活跃子代理（保守不阻断） */ }
    return false;
};
const pickParent = (d) => {
    try {
        for (const r of d.ctx.agents.roots() || [])
            if (isValidParent(d, r))
                return r;
    }
    catch { /* */ }
    try {
        for (const a of d.ctx.agents.list() || [])
            if (isValidParent(d, a))
                return a;
    }
    catch { /* */ }
    return isValidParent(d, d.st.lastParent) ? d.st.lastParent : null;
};
/**
 * 守护 parent（最后兜底）：服务重启后若从未有过会话活动，roots/list/lastParent 全空，
 * 深睡将永远跑不起来（夜间正是这种场景）。此时用插件 ctx 惰性创建一个常驻 agent 当 parent
 * （只用于承载子代理创建，不给它下发任何任务）；创建失败则退回 no-parent 跳过，不崩。
 */
/**
 * 默认 LLM 路由（守护 parent 用）：优先插件配置，其次宿主默认模型服务。
 * 守护 parent 是新建的空 agent，没有会话继承模型；不显式给路由，子代理会 100ms 内
 * stop=error 且零输出（实测），归纳必然空转。
 */
const resolveDefaultModel = (d) => {
    try {
        const c = d.ctx;
        const svc = c.agentDefaultModel ?? (typeof c.get === 'function' ? c.get('agentDefaultModel') : undefined);
        const sel = svc && typeof svc.currentSelection === 'function' ? svc.currentSelection() : null;
        if (sel && sel.provider && sel.model)
            return { provider: String(sel.provider), model: String(sel.model) };
    }
    catch { /* 解析失败=不给路由 */ }
    return undefined;
};
const ensureDaemonParent = async (d, signal, agentOptions) => {
    if (isValidParent(d, d.st.daemonParent))
        return d.st.daemonParent;
    try {
        // sessionId 必须显式给：宿主用它当 agent id（缺省会抛 agent id "undefined" does not match session id）
        const handle = await d.ctx.agents.create({
            sessionId: `session-${randomUUID()}`,
            ...(agentOptions ? { agentOptions } : {}),
            signal,
        });
        const a = handle && handle.agent ? handle.agent : handle;
        if (isValidParent(d, a)) {
            d.st.daemonParent = a;
            d.log('deep sleep: 已建立守护 parent（无会话场景承载归纳子代理）');
            return a;
        }
        d.log('deep sleep: 守护 parent 创建结果不可用');
    }
    catch (e) {
        d.log(`deep sleep: 守护 parent 创建失败：${String(e?.message || e).slice(0, 120)}`);
    }
    return null;
};
//# sourceMappingURL=distill-parent.js.map