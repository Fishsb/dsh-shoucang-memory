/**
 * @dsh-external/shoucang-scheduler — 守藏调度执行器（suite-manager 只读模块）。
 * 由 dev_scaffold_plugin 生成；2026-09-05 重定义（HANDOVER #2）：
 * 旧「记忆归档调度（boards 三板块/R1-R5/W1-W3）」语义已按拍板废弃（facts F-003/F-004），
 * 本模块重定义为插件集合（suite）的**只读装配检测**——shoucang_suite 工具。
 *
 * 装配检测口径（facts F-006 零硬编码红线：不写死机器路径，运行时经 env/home 探测）：
 *   1. injected 基准：注入器 registry.json（$DSH_HOME/super-injector/registry.json，dev 注入装配）
 *   2. profile 基准：$DSH_HOME/profiles/<profile>/package.json 的 dependencies + dsh.profile.bundles
 *      （bundle 装配；多 profile 全扫，逐 profile 归属）
 *   成员状态 = injected / profile / both / missing。
 *
 * 高性能铁律：工具 schema 精简（description 短句，详解放 tool result / 引导文本）；
 * 只读工具，不产生副作用。
 */
import type { Context } from 'cordis';
export declare const name = "@dsh-external/shoucang-scheduler";
export declare const inject: string[];
export interface SuiteMember {
    id: string;
    package: string;
    repo: string;
    role: string;
}
export interface Config {
    members: SuiteMember[];
    verify_enabled: boolean;
    migrate_enabled: boolean;
    default_project: string;
    generic_project: string;
    enableDistill: boolean;
    idleWakeMs: number;
    minTurnChars: number;
    distillPrescan: boolean;
    distillPrompt: string;
    llmProvider: string;
    llmModel: string;
    enableDeepSleep: boolean;
    deepSleepIdleMs: number;
}
export declare const Config: any;
export declare function applyScheduler(ctx: Context, config: Config): void;
