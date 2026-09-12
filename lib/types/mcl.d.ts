import { type RecallRow } from './targets.js';
import { type EmbedCfg } from './vec.js';
export interface MclConfig {
    enabled: boolean;
    /** 熟悉度阈值（绝对余弦；缺省 0.58 = 2026-09-11 按 193 条实测样本重校准，见 criteria.json#surface.mcl） */
    familiarThreshold: number;
    /** 慢通道再引导上限（缺省 1；0 = 只注入不引导） */
    maxNudges: number;
    /** 材料硬预算（字符） */
    budgetChars: number;
    /** 指针条数 */
    topK: number;
    /** 审计开关（落 knowledgeRoot()/audit/mcl-audit.jsonl） */
    audit: boolean;
    /** 召回/嵌入配置（复用 vec 通道，与 scheduler 同源） */
    embed: EmbedCfg;
}
export interface MclHooks {
    audit(o: Record<string, unknown>): void;
    log(msg: string): void;
}
export interface MclStatus {
    enabled: boolean;
    familiarThreshold: number;
    maxNudges: number;
    budgetChars: number;
    steps: number;
    fast: number;
    slow: number;
    injected: number;
    nudged: number;
    lastAt: number;
    lastChannel: 'fast' | 'slow' | '';
    lastSim: number;
    sessions: number;
    tasks: number;
}
interface SessMcl {
    nudges: number;
    topics: string[];
    /** 每行材料的「引用信号词元」集合（见 rowSignals；judge 的容错匹配用，2026-09-11 缺陷3） */
    signals: string[][];
    channel: 'fast' | 'slow' | '';
    sim: number;
    lateLogged?: boolean;
}
/** 消息工厂（DSH 官方 `createUserMessage` 动态加载；宿主/装配副本可解析，仓内无该包故不入静态 import → 手构兜底） */
type AnyMsg = {
    id: string;
    role: 'user';
    content: Array<{
        type: 'text';
        text: string;
    }>;
    source: Record<string, unknown>;
};
export declare function registerMcl(ctx: {
    on(event: string, handler: (payload: any, arg2?: any) => any): unknown;
    logger?: {
        info?(m: string): void;
    };
}, cfg: MclConfig, hooksIn?: Partial<MclHooks>): {
    status(): MclStatus;
};
/** `agent/pre-step` 处理器（自 registerMcl 提出；registerMcl 因此满足 I1 的 120 行上限）。
 *  依赖 **7 项**（收尾前 9 项：把注入面三个纯函数收进 `tools` 一组），均为装配期构造的会话态/工具；
 *  依赖显式传递，不再靠闭包隐式可见。
 *  口径：终极方案 §五「任一实现函数的依赖宽度 ≤ 8」+ AGENTS.md「分组后每组 ≤8」。
 *  为何是收 `material/judge/mkMsg` 而不是会话态：前者全函数仅 5 次引用、后者 15 次——
 *  收组要动引用面最小的一侧，别为凑指标去翻热路径。 */
export interface PreStepDeps {
    /** registerMcl 的配置形参（不是 body 里的 const ⇒ 依赖测绘易漏） */
    cfg: MclConfig;
    counters: {
        steps: number;
        fast: number;
        slow: number;
        injected: number;
        nudged: number;
        lastAt: number;
        lastChannel: '' | 'fast' | 'slow';
        lastSim: number;
    };
    state: Map<string, SessMcl>;
    taskText: Map<string, string>;
    ready: Set<string>;
    hooks: MclHooks;
    /** 注入面三件：材料装配 / 合规判定 / 消息构造 */
    tools: {
        material(rows: RecallRow[], budget: number): {
            text: string;
            topics: string[];
            signals: string[][];
        };
        judge(text: string, topics: string[], signals?: string[][]): boolean;
        mkMsg(text: string): AnyMsg;
    };
}
export declare function handlePreStep(payload: any, next: () => Promise<any>, dep: PreStepDeps): Promise<any>;
export {};
