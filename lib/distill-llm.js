// distill-llm.ts — 蒸馏「模型与转录（provider 校验 / 路由 / 转录定位 / workspace 解析）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（4 项）。
//   对外只暴露 createLlmApi(d) —— 返回绑定后的句柄，调用方零感知。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { memoryLibRoot } from './targets.js';
import { runNode, textOf } from './distill-proc.js';
export function createLlmApi(d) {
    return {
        validateProvider: (...a) => validateProvider(d, ...a),
        resolveLlm: (...a) => resolveLlm(d, ...a),
        probeScriptPath,
        locateTranscript: (...a) => locateTranscript(d, ...a),
        resolveWorkspace: (...a) => resolveWorkspace(d, ...a),
    };
}
// 蒸馏与深睡**共享**（两侧都写）⇒ 以对象引用传递，传值快照会让两侧计数脱钩
const validateProvider = (d) => {
    if (!(d.config.llmProvider && d.config.llmModel) || d.llmState.providerFailCount >= 2)
        return;
    try {
        const llm = d.ctx.llm;
        const providers = llm.listProviders ? llm.listProviders() : [];
        const names = (providers || []).map((p) => p && (p.id || p.provider || p.name));
        if (names.length && !names.includes(d.config.llmProvider)) {
            d.log(`warn: llmProvider "${d.config.llmProvider}" 不在实例注册列表 [${names.join(', ')}]——spawn 将 NO_ADAPTER，请改用真实 adapter 名或留空继承`);
        }
    }
    catch { /* listProviders 不可用时静默 */ }
};
// 2026-09-10：蒸馏/深睡各自独立模型——具体键有值用之，否则回落共用键（仍空=继承主会话）
const resolveLlm = (d, sp, sm) => {
    if (sp && sm)
        return { provider: sp, model: sm };
    if (d.config.llmProvider && d.config.llmModel)
        return { provider: d.config.llmProvider, model: d.config.llmModel };
    return null;
};
// 2026-09-11 清理：原 extractDelta（24k 截断版）已实证**零调用**（全仓 grep 只剩定义与注释；原注释「勿删」与实况不符），
// 故删除。文本化规则的唯一实现 = 模块级 textPartsOfEvent → buildEventChunks（蒸馏/深睡按需复用）。
// E3 探针脚本路径：locateTranscript（蒸馏侧）与深睡探测**共用** ⇒ 留在 distill 并注入深睡，
//   不放进 deepsleep.ts —— 否则蒸馏侧要反向 import 深睡，形成依赖倒置方向错误。
const probeScriptPath = join(memoryLibRoot(), 'scripts', 'locate-transcript-probe.mjs');
/** E3 桥：定位会话转录文件绝对路径（零拷贝调记忆仓 locate-transcript-probe；探测「是否还在输出」的硬证据） */
const locateTranscript = async (d, sid) => {
    try {
        if (!existsSync(probeScriptPath))
            return null;
        const r = await runNode(d.config.nodeBin, probeScriptPath, [sid], { timeout: 15000 });
        if (r.status !== 0)
            return null;
        // 2026-09-11 修复（F-1 断链 · 双闸之第二闸）：原判据 `includes('session.jsonl')` 对 DSH 新命名
        //   `session.v3.jsonl.zstd` **恒 false**（不含子串 `session.jsonl`）⇒ 探针已定位成功仍被二次判 null。
        //   改为版本无关正则（与 archive-lib 的 TRANSCRIPT_NAME_RE 同判据，拒绝同族重复实现）。
        const line = textOf(r).trim().split('\n').map((s) => s.trim()).filter(Boolean).pop();
        if (!line)
            return null;
        return /^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(line.split(/[\\/]/).pop() || '') ? line : null;
    }
    catch {
        return null;
    }
};
const resolveWorkspace = async (d, sid) => {
    // 反解带瞬态容错：转录定位可能晚于会话 end 落盘 / 探针单次抖动 → 仅「定位失败」重试 3 次（1.5s 退避）；
    // 路径已定位但无 workspace 归属属永久无归属，重试无意义，直接返回 null 走 writeDispatch 降级链。
    // 2026-09-10 实锤修复：目录名 decode 有歧义（盘符冒号压成 '-' 且目录内连字符无法区分，D:\FF\shoucang → D-FF-shoucang
    // 无法还原冒号 → 校验失败 → project 卡全降级 pending 死循环）——改为优先读转录首行 cwd（权威无歧义），目录 decode 仅兜底。
    for (let attempt = 1; attempt <= 3; attempt++) {
        let file = null;
        try {
            file = await locateTranscript(d, sid);
        }
        catch {
            file = null;
        }
        if (!file)
            d.log(`ws 反解: 转录定位失败 attempt=${attempt} sid=${sid.slice(0, 18)}`);
        if (file) {
            // ① 权威：转录首行 session.cwd
            try {
                const cwdProbe = join(memoryLibRoot(), 'scripts', 'transcript-cwd-probe.mjs');
                if (existsSync(cwdProbe)) {
                    const r = await runNode(d.config.nodeBin, cwdProbe, [file], { timeout: 30000 });
                    const wsCwd = r.status === 0 ? textOf(r).trim() : '';
                    if (wsCwd && /^[A-Za-z]:[\\/]/.test(wsCwd))
                        return wsCwd;
                    d.log(`ws 反解: cwd 探针无结果 status=${r.status} out=${JSON.stringify(textOf(r).slice(0, 80))}`);
                }
                else {
                    d.log(`ws 反解: cwd 探针缺失 ${cwdProbe}`);
                }
            }
            catch (e) {
                d.log(`ws 反解: cwd 探针异常 ${String(e?.message || e).slice(0, 80)}`);
            }
            // ② 兜底：目录名 decode（盘符冒号补全）
            const m = file.match(/sessions[\\/]+(--.+?--)[\\/]/);
            if (m) {
                const ws0 = m[1].slice(2, -2).replace(/--/g, '\\').replace(/~0040/g, '@');
                const ws = /^([A-Za-z])\\/.test(ws0) ? ws0[0] + ':' + ws0.slice(1) : ws0;
                if (/^[A-Za-z]:/.test(ws))
                    return ws;
            }
            return null; // 已定位但无 workspace 归属：永久，不重试
        }
        if (attempt < 3)
            await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
};
//# sourceMappingURL=distill-llm.js.map