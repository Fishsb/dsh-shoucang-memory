import { defineTool } from '@deepseek-ai/dsh-tools';
import z from 'schemastery';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dshHome, selftestMatrix, suiteAssemblyMatrix, memoryLibRoot, recallApprox } from './targets.js';
import { recallRanked } from './vec.js';
import { registerDistill } from './distill.js';
import { deepSleepShare } from './deepsleep-share.js';
import { schedulerShare } from './scheduler-share.js';
export const name = '@dsh-external/shoucang-scheduler';
export const inject = ['tools', 'llm', 'subagents', 'agents'];
export const Config = z.object({
    members: z
        .array(z.object({
        id: z.string(),
        package: z.string(),
        repo: z.string().default(''),
        role: z.string().default('member'),
    }))
        .default([]), // 2026-09-08 单插件合并：记忆技能已内嵌（skill/）、pmg 治理整体移除，suite 外部成员清空
    verify_enabled: z.boolean().default(true),
    enableDistill: z.boolean().default(true).description('守藏蒸馏器（ADR-0002 阶段2）；单飞切换完成后缺省开（记忆插件蒸馏已关）'),
    idleWakeMs: z.number().min(60000).default(600000).description('唤醒判定：turn 结束后空闲满此毫秒数才蒸馏（缺省 10 分钟）'),
    minTurnChars: z.number().min(0).default(200).description('本轮新增正文少于此字符数跳过蒸馏（水位仍推进）'),
    distillPrescan: z.boolean().default(true).description('预筛：无信号词且无 pending 候选则不唤醒 LLM 子代理'),
    distillPrompt: z.string().default('').description('蒸馏子代理 persona 覆盖（缺省内建 v5 契约）'),
    llmProvider: z.string().default('').description('子代理 provider 缺省（空=继承主会话模型）——distill/sleep 未单独指定时回落此键'),
    llmModel: z.string().default('').description('子代理 model 缺省（空=继承主会话模型）——distill/sleep 未单独指定时回落此键'),
    // 2026-09-10 用户拍板：蒸馏/深睡模型各自独立配置（直接用 Harness 模型体系，下拉选宿主模型）
    distillProvider: z.string().default('').description('蒸馏子代理 provider（空=回落 llmProvider → 继承主会话）'),
    distillModel: z.string().default('').description('蒸馏子代理 model（空=回落 llmModel → 继承主会话）'),
    sleepProvider: z.string().default('').description('深睡归纳子代理 provider（空=回落 llmProvider → 继承主会话）'),
    sleepModel: z.string().default('').description('深睡归纳子代理 model（空=回落 llmModel → 继承主会话）'),
    enableDeepSleep: z.boolean().default(true).description('深度睡眠归纳：全部会话停滞 ≥deepSleepIdleMs 自动提炼习得原则写入 agent 画像 AGENT.md（[原则] 行），同 pass 反思双通道维护 USER 画像'),
    deepSleepIdleMs: z.number().min(600000).default(10800000).description('停滞判定阈值（毫秒）：无任何会话活动持续满此时长触发深度睡眠归纳（缺省 3 小时）'),
    deepSleepProbe: z.boolean().default(true).description('输出增长探测：会话 running 但长时间无事件时，采样转录文件两次确认是长任务还是卡住'),
    deepSleepProbeAfterMs: z.number().min(600000).default(10800000).description('running 状态无事件持续此毫秒数后发起探测（缺省 3 小时）'),
    deepSleepProbeWindowMs: z.number().min(5000).default(60000).description('探测采样间隔（毫秒，缺省 60 秒）'),
    deepSleepProbeSamples: z.number().min(1).default(3).description('每轮探测采样次数：任一次检出转录增长即判为长任务（缺省 3）'),
    deepSleepProbeConfirm: z.number().min(1).default(2).description('判「卡住」需连续无增长的轮数，首轮落 suspect 阻塞睡眠待下轮复核（缺省 2）'),
    deepSleepProbeRetries: z.number().min(1).default(2).description('探针不可用或异常时的重试次数（缺省 2）'),
    deepSleepProbeMaxMs: z.number().min(30000).default(600000).description('单轮探测总时长兜底（毫秒，缺省 10 分钟，防悬挂）'),
    deepSleepDaemonParent: z.boolean().default(false).description('无会话场景兜底：自建守护 parent 承载归纳子代理（宿主新建空 agent 路径未经验证，默认关）'),
    activationShadow: z.boolean().default(true).description('路线④ 打扰度影子观察：每轮 user 消息按词法打分（recallIndex），滞回+冷却，只落 activation-shadow.jsonl，不注入上下文——默认开，攒样本校准阈值'),
    activationPrefetch: z.boolean().default(false).description('路线④ active 注入（缺省关）：影子校准满意后开启；注入接线为后续档'),
    activationTOn: z.number().min(0).max(1).default(0.62).description('滞回上阈：sim≥此值且冷却结束 → prefetch/emit（初值待影子校准）'),
    activationTOff: z.number().min(0).max(1).default(0.52).description('滞回下阈：sim<此值 → 回到 idle（防阈值抖动）'),
    activationCooldownSteps: z.number().min(0).default(3).description('触发后冷却步数，防连续打扰'),
    activationTopK: z.number().min(1).max(5).default(3).description('每次观察召回条数'),
    embedEnabled: z.boolean().default(true).description('向量融合召回（2026-09-09 缺省开；本地 bge-m3 零 token；未配置/失败自动降级纯词法）'),
    embedBaseUrl: z.string().default('http://127.0.0.1:9915/v1').description('OpenAI 兼容 /embeddings 基址（缺省本地 bge-m3 桥；换云端改此键）'),
    embedModel: z.string().default('bge-m3').description('embedding 模型名（缺省本地 bge-m3；换云端如 text-embedding-3-small）'),
    embedApiKeyEnv: z.string().default('EMBED_API_KEY').description('API key 环境变量名（本地免 key；云端须设，不落盘）'),
});
// —— 自持配置文件（契约 v3 落地通道；dshHome 等路径探测统一来自 targets.ts，单一事实源）——
/**
 * ~/.dsh/suite/scheduler.json — 唯一持久配置通道。
 * 背景：注入插件不进 loader 配置持久化（super-injector dev_inject 硬编码 config:{}，README 明言重启不恢复），
 * schemastery UI 配置对本插件不持久 → 自持 JSON 覆盖缺省（键名同 Config；缺文件/坏文件=纯缺省，不 fail-loud）。
 */
function applySuiteConfigFile(config) {
    try {
        const f = join(dshHome(), 'suite', 'scheduler.json');
        if (!existsSync(f))
            return;
        const raw = JSON.parse(readFileSync(f, 'utf8'));
        if (raw && typeof raw === 'object') {
            for (const [k, v] of Object.entries(raw)) {
                if (v !== undefined)
                    config[k] = v;
            }
        }
    }
    catch { /* 坏文件按纯缺省（可选文件） */ }
}
export function applyScheduler(ctx, config) {
    applySuiteConfigFile(config);
    // LLM 模型枚举（2026-09-10：直接用 Harness 模型体系——listProviders→listModels 扁平；供蒸馏/深睡下拉）
    const llmModels = async () => {
        const out = [];
        try {
            const llm = ctx.llm;
            if (!llm || typeof llm.listProviders !== 'function')
                return out;
            const providers = llm.listProviders() || [];
            for (const p of providers) {
                const pid = String(p?.id ?? p?.provider ?? p?.name ?? '');
                if (!pid)
                    continue;
                if (typeof llm.listModels === 'function') {
                    try {
                        const ms = await llm.listModels(pid);
                        for (const m of ms || [])
                            out.push({ provider: pid, id: m.id, name: m.name || m.id });
                    }
                    catch { /* 单 provider 枚举失败跳过 */ }
                }
            }
        }
        catch { /* 宿主 llm 不可用=空 */ }
        return out;
    };
    ctx.effect(() => ctx.tools.register(defineTool({
        name: 'shoucang_suite',
        description: '守藏 suite-manager 只读装配检测：核对 suite 成员（config members）在 injected（注入器 registry.json）与 profile（profiles/*/package.json bundles+deps）两个装配基准上的状态，输出 each member: status=injected|profile|both|missing + 来源明细。只读不改装。',
        parameters: {
            member: { type: 'string', description: '只查指定成员 id（缺省=全部）' },
            scope: { type: 'string', description: 'all|injected|profile（缺省 all）' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    members: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                package: { type: 'string' },
                                repo: { type: 'string' },
                                role: { type: 'string' },
                                status: { type: 'string' },
                                injected: { type: 'boolean' },
                                profiles: { type: 'array', items: { type: 'string' } },
                                detail: { type: 'string' },
                            },
                            // 注意：output schema 走 dsh-tools value schema DSL（0.1.2-rc.1），items 内 required 不被支持——不可恢复此行（2026-09-08 启动崩溃根因）
                            additionalProperties: false,
                        },
                    },
                    summary: { type: 'string' },
                },
                additionalProperties: false,
            },
            render: (_args, v) => {
                const rows = (v?.members || []).map((m) => `- ${m.id} [${m.status}] ${m.package}${m.repo ? ` (repo:${m.repo})` : ''}${m.detail ? ` — ${m.detail}` : ''}`);
                return [{ type: 'text', text: rows.length ? `suite 装配检测：\n${rows.join('\n')}\n${v?.summary || ''}` : 'suite 装配检测：无成员' }];
            },
        },
        async execute(args) {
            const scope = (args?.scope || 'all');
            const filter = (args?.member || '').toString().trim();
            const matrix = suiteAssemblyMatrix(config.members);
            const rows = matrix.members
                .filter((m) => !filter || m.id === filter || m.package.includes(filter))
                .filter((m) => scope === 'all' || (scope === 'injected' && m.injected) || (scope === 'profile' && m.profiles.length > 0));
            const missing = rows.filter((r) => r.status === 'missing').length;
            const present = rows.length - missing;
            return {
                members: rows,
                summary: `共 ${rows.length} 成员（present ${present} / missing ${missing}）`,
            };
        },
    })), '@dsh-external/shoucang-scheduler: suite tool');
    // shoucang_verify：G3 验证门（#5，G30 证据计数 + 审计 §8 Q3 兼容）
    ctx.effect(() => {
        if (!config.verify_enabled)
            return () => { };
        return ctx.tools.register(defineTool({
            name: 'shoucang_verify',
            description: '守藏 G3 验证门（G30 证据计数）：claims（断言数）≤ evidence_reads（工具实证数）才 pass，只信工具证据。输出对齐记忆审计 §8 第三问（route 分流质量抽验）可消费格式；无分布数据时仅证据判定。',
            parameters: {
                claims: { type: 'string', description: '断言/主张数（数字）' },
                evidence_reads: { type: 'string', description: '工具实证读取数（read_file/工具结果，数字）' },
                route: { type: 'string', description: '本次分流 route（memory|project|discard，审计 Q3 用）' },
                project_cards: { type: 'string', description: 'route=project 的卡产出数（审计 Q3 落点）' },
                route_total: { type: 'string', description: '同期 route 总样本数（审计 Q3 分布分母，可省）' },
                conflict: { type: 'string', description: 'yes|no（有冲突需裁决）' },
            },
            output: {
                schema: {
                    type: 'object',
                    properties: {
                        gate: { type: 'string' },
                        g30_pass: { type: 'boolean' },
                        claims: { type: 'number' },
                        evidence_reads: { type: 'number' },
                        fix_level: { type: 'string' },
                        audit: {
                            type: 'object',
                            properties: {
                                q3_route: { type: 'string' },
                                q3_route_present: { type: 'boolean' },
                                q3_cards_ok: { type: 'boolean' },
                                q3_pass_rate: { type: 'number' },
                            },
                            additionalProperties: false,
                        },
                        note: { type: 'string' },
                    },
                    additionalProperties: false,
                },
                render: (_a, v) => [
                    {
                        type: 'text',
                        text: `gate=${v.gate} g30=${v.g30_pass} claims=${v.claims} evidence=${v.evidence_reads} fix=${v.fix_level}${v.audit?.q3_route ? ` auditQ3:route=${v.audit.q3_route} cardsOk=${v.audit.q3_cards_ok}` : ''} note=${v.note || '-'}`,
                    },
                ],
            },
            async execute(args) {
                const c = Number(args?.claims) || 0;
                const e = Number(args?.evidence_reads) || 0;
                const g30Pass = e >= c;
                const conflict = (args?.conflict || 'no') === 'yes';
                const fix = !g30Pass ? 'L1-fix-evidence' : conflict ? 'L2-fix-adjudication' : 'L0-ok';
                const route = (args?.route || '').toString().trim();
                const cards = Number(args?.project_cards) || 0;
                const total = Number(args?.route_total) || 0;
                // 审计 §8 Q3：route=project 时核验「projectCards 落点」——有产出即 cards_ok；给分布则算 pass_rate
                const audit = {
                    q3_route: route || 'memory',
                    q3_route_present: route === 'project',
                    q3_cards_ok: route === 'project' ? cards > 0 : true,
                    q3_pass_rate: total > 0 ? Number((e / Math.max(total, 1)).toFixed(3)) : 0,
                };
                const note = !g30Pass
                    ? 'G30 未过：claims 无足够工具实证，削减断言或补 read_file 证据'
                    : conflict
                        ? '证据充分但存在冲突，需裁决'
                        : route === 'project' && cards === 0
                            ? 'route=project 但卡产出 0——审计 Q3 落点失败，检查 workspace docs/devref/shoucang 直写'
                            : '验证通过';
                return {
                    gate: 'g3/verify',
                    g30_pass: g30Pass,
                    claims: c,
                    evidence_reads: e,
                    fix_level: fix,
                    audit,
                    note,
                };
            },
        }));
    }, '@dsh-external/shoucang-scheduler: verify tool');
    // ═══ ADR-0002 阶段 1：R0 动态目标路由 + 白名单门禁自测（targets.ts）═══
    ctx.effect(() => ctx.tools.register(defineTool({
        name: 'shoucang_targets_probe',
        description: '守藏蒸馏目标层自测：单库路由解析 + 白名单门禁抽样（USER/AGENT 画像与 notes 白名单，不符合不存）。只读。',
        parameters: {},
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute() {
            const lines = selftestMatrix();
            return ['守藏蒸馏目标层自测（单库）：', ...lines].join('\n');
        },
    })), '@dsh-external/shoucang-scheduler: targets probe tool');
    // ═══ 路线② 读侧召回（词法地板；查询 → 记忆库薄行 top-k，详情按指针懒展开；向量接入前的缺省召回）═══
    ctx.effect(() => ctx.tools.register(defineTool({
        name: 'shoucang_recall',
        description: '守藏读侧召回（词法版）：给一句话任务描述/问题，在记忆库索引行（AGENT [原则]/[路径] + MEMORY + USER）做确定性 top-k 关键词匹配，返回薄行与 notes 指针；命中后按指针 get_file 读详情小节。任务开始（认领类型）与卡住补检时调用。',
        parameters: {
            query: { type: 'string', description: '任务描述/问题（自然语言，如：把插件打包发布到 github）' },
            topK: { type: 'number', description: '返回条数（缺省 3，最多 5）' },
            scope: { type: 'string', description: 'agent=只查 AGENT.md（原则/路径）；all=AGENT+MEMORY+USER（缺省 all）' },
        },
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args) {
            const root = memoryLibRoot();
            const query = String(args?.query || '');
            const topK = Math.min(5, Number(args?.topK) || 3);
            const scope = args?.scope === 'agent' ? 'agent' : 'all';
            const { rows, tokens, mode } = await recallRanked(root, query, topK, scope, {
                enabled: !!config.embedEnabled,
                baseUrl: config.embedBaseUrl,
                model: config.embedModel,
                apiKeyEnv: config.embedApiKeyEnv || 'EMBED_API_KEY',
            });
            if (!rows.length) {
                // S5 召回零命中兜底（assistant-focus-plan S5）：不再静默新手态——
                // 给「库内主题地图 + 建议检索词 + pending 提醒」：near=notes/ 各文件小节清单（换问法的线索），
                // 建议词=库内出现过的查询高判别 token；并提醒收尾沉淀（跨会话第二次同型即转正成经验）。
                const { near, suggest } = recallApprox(root, query, scope === 'agent' ? 'agent' : 'all');
                const out = [`shoucang_recall：无全文命中（库 ${root}；token=${tokens.join(',') || '空'}）`];
                if (suggest.length)
                    out.push(`建议：查询词中「${suggest.join(' / ')}」在库内出现过——换措辞/组合重试（用库内术语）更易命中`);
                if (near.length) {
                    out.push('库内主题地图（可围绕以下话题换问法，或 get_file 直读详情）：');
                    out.push(...near.map((r) => `- ${r.line}`));
                }
                else
                    out.push('库内暂无 notes 主题（记忆库尚空/新库）——首次经验收尾沉淀候选，同类第二次跨会话即转正');
                out.push('下一步：按上面线索换词重试；确认经验有价值 → 收尾四步沉淀候选，不静默丢弃');
                return out.join('\n');
            }
            return [
                `shoucang_recall：命中 ${rows.length} 条（${mode === 'fusion' ? 'dense0.7+lexical0.3 融合' : '词法'}；token=${tokens.join(',')}）`,
                ...rows.map((r) => `- [${r.file}] ${r.line}`),
                '提示：以上为薄行指针，命中后按 `→ notes/…` 读详情小节；相似≠适用，展开前核对任务类型。',
            ].join('\n');
        },
    })), '@dsh-external/shoucang-scheduler: recall tool');
    // ═══ S3 能力自省（assistant-focus-plan S3：只读，任务认领前自查「现在能做什么/边界在哪」）═══
    // 数据源：① 当前 Agent 可见工具面（ctx.tools.schemas(exec.agent)，DSH 官方同款用法）；② suite 装配状态；
    // ③ 记忆库边界纪律（AGENT.md [边界] 行 + 记忆库在位性）。只读不产生副作用。
    ctx.effect(() => ctx.tools.register(defineTool({
        name: 'assistant_capabilities',
        description: '助理能力自省（只读）：返回当前 Agent 的能力面——按族归类的可见工具清单、装配与权限状态、记忆库边界纪律（AGENT.md [边界] 行/红线）。任务认领（澄清意图）前自查「我现在会什么、不会什么、边界在哪」，判断任务是否需要新能力/升级用户；不替代具体工具。',
        parameters: {},
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute(_args, exec) {
            const parts = [];
            // ① 当前 Agent 可见工具面（按族归类）
            try {
                const agent = exec && exec.agent;
                const schemas = (agent ? ctx.tools?.schemas?.(agent) : ctx.tools?.schemas?.()) || [];
                const FAMILIES = [
                    ['记忆/召回', /shoucang_|recall|memory|managing|delta/],
                    ['执行/命令', /^(pwsh|bash|shell|terminal|job|subprocess|task)/],
                    ['文件/读写', /^(fs|read|write|edit|glob|grep|file|str_replace|search_files)/],
                    ['检索/网页', /web|search|fetch|page|platform|browser/],
                    ['视觉/媒体', /vision|image|screen|read_image|ocr|audio/],
                    ['治理/项目', /nav_|project|governance|architecture/],
                    ['开发/注入', /dev_|plugin|inject|scaffold|build|reload|stage/],
                    ['编排/多代理', /subagent|workflow|agent|goal|plan|todo|ralph/],
                    ['工具/技能', /^tool_|^skill$/],
                ];
                const byFamily = new Map();
                const other = [];
                for (const s of schemas) {
                    const n = s.name || '';
                    const hit = FAMILIES.find(([, re]) => re.test(n));
                    if (hit) {
                        const arr = byFamily.get(hit[0]) || [];
                        arr.push(n);
                        byFamily.set(hit[0], arr);
                    }
                    else
                        other.push(n);
                }
                const lines = [`可见工具 ${schemas.length} 个（按族）：`];
                for (const [fam, names] of byFamily)
                    lines.push(`- ${fam} (${names.length})：${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}`);
                if (other.length)
                    lines.push(`- 其他 (${other.length})：${other.slice(0, 10).join(', ')}${other.length > 10 ? '…' : ''}`);
                lines.push('（完整 schema 已在工具目录可见；此处为族级概览。要精确看某工具用法直接读其描述。）');
                parts.push(lines.join('\n'));
            }
            catch (e) {
                parts.push(`⚠ 工具面枚举失败：${String(e?.message || e).slice(0, 120)}`);
            }
            // ② 记忆库在位 + AGENT 边界纪律
            try {
                const memRoot = memoryLibRoot();
                const agentFile = join(memRoot, 'AGENT.md');
                if (!existsSync(agentFile)) {
                    parts.push('⚠ 记忆库缺席（AGENT.md 不在）——能力边界纪律不可用');
                }
                else {
                    const ag = readFileSync(agentFile, 'utf8');
                    const bounds = ag.split(/\r?\n/).filter((l) => /\[边界\]|\[原则\]/.test(l)).map((l) => l.trim()).filter(Boolean);
                    if (bounds.length)
                        parts.push(`记忆库边界/原则（${bounds.length} 条，常注入）：\n${bounds.map((b) => `- ${b}`).join('\n')}`);
                }
            }
            catch { /* 边界读取失败不致命 */ }
            // ③ 装配与蒸馏状态
            try {
                const sm = suiteAssemblyMatrix(config.members);
                parts.push(`suite 装配：${sm.summary || `${config.members.length} 成员`}`);
            }
            catch { /* 装配信息可选 */ }
            return parts.join('\n\n');
        },
    })), '@dsh-external/shoucang-scheduler: assistant capabilities tool');
    // ═══ ADR-0002 阶段 2：守藏蒸馏器（事件驱动，写入分发走 targets.ts 路由+白名单）═══
    if (config.enableDistill) {
        const distill = registerDistill(ctx, {
            nodeBin: 'node',
            idleWakeMs: config.idleWakeMs,
            minTurnChars: config.minTurnChars,
            distillPrescan: config.distillPrescan,
            distillPrompt: config.distillPrompt,
            llmProvider: config.llmProvider,
            llmModel: config.llmModel,
            distillProvider: config.distillProvider,
            distillModel: config.distillModel,
            sleepProvider: config.sleepProvider,
            sleepModel: config.sleepModel,
            enableDeepSleep: config.enableDeepSleep,
            deepSleepIdleMs: config.deepSleepIdleMs,
            deepSleepProbe: config.deepSleepProbe,
            deepSleepProbeAfterMs: config.deepSleepProbeAfterMs,
            deepSleepProbeWindowMs: config.deepSleepProbeWindowMs,
            deepSleepProbeSamples: config.deepSleepProbeSamples,
            deepSleepProbeConfirm: config.deepSleepProbeConfirm,
            deepSleepProbeRetries: config.deepSleepProbeRetries,
            deepSleepProbeMaxMs: config.deepSleepProbeMaxMs,
            deepSleepDaemonParent: config.deepSleepDaemonParent,
            activationShadow: config.activationShadow,
            activationPrefetch: config.activationPrefetch,
            activationTOn: config.activationTOn,
            activationTOff: config.activationTOff,
            activationCooldownSteps: config.activationCooldownSteps,
            activationTopK: config.activationTopK,
        });
        // 跨模块桥接：状态机 API 供 panel /deepsleep RPC 惰性读取；suite 矩阵供 panel /suite RPC 复用同一实现；
        // 蒸馏节流组运行时值供 panel /distill/config 展示（缺省值单一实现=本文件 Config，panel 不复制）
        if (distill)
            deepSleepShare.api = distill;
        schedulerShare.api = {
            suiteScan: () => suiteAssemblyMatrix(config.members),
            distillConfig: () => ({
                enableDistill: config.enableDistill,
                idleWakeMs: config.idleWakeMs,
                minTurnChars: config.minTurnChars,
                distillPrescan: config.distillPrescan,
                llmProvider: config.llmProvider,
                llmModel: config.llmModel,
                distillProvider: config.distillProvider,
                distillModel: config.distillModel,
                sleepProvider: config.sleepProvider,
                sleepModel: config.sleepModel,
            }),
            llmModels,
        };
    }
    else {
        // 蒸馏器关闭也要给 panel 提供装配矩阵（/suite 是只读视图，与蒸馏无关）
        schedulerShare.api = {
            suiteScan: () => suiteAssemblyMatrix(config.members),
            distillConfig: () => ({
                enableDistill: config.enableDistill,
                idleWakeMs: config.idleWakeMs,
                minTurnChars: config.minTurnChars,
                distillPrescan: config.distillPrescan,
                llmProvider: config.llmProvider,
                llmModel: config.llmModel,
                distillProvider: config.distillProvider,
                distillModel: config.distillModel,
                sleepProvider: config.sleepProvider,
                sleepModel: config.sleepModel,
            }),
            llmModels,
        };
    }
}
//# sourceMappingURL=scheduler.js.map