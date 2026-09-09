/**
 * @dsh-external/shoucang-scheduler — 守藏调度执行器。
 * 沿革：2026-09-05 重定义为 suite 只读装配检测（HANDOVER #2，旧 boards 三板块废弃）；
 * 2026-09-08 三合一后本模块承载 = ① suite 装配检测（shoucang_suite，矩阵单一实现在 targets.ts）
 * + ② 蒸馏器装配与回归工具（shoucang_verify / shoucang_targets_probe，蒸馏器本体在 distill.ts）
 * + ③ 自持配置通道加载（~/.dsh/suite/scheduler.json 启动期覆盖 Config 缺省）。
 *
 * 装配检测口径（零硬编码红线：不写死机器路径，运行时经 env/home 探测）：
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
    enableDistill: boolean;
    idleWakeMs: number;
    minTurnChars: number;
    distillPrescan: boolean;
    distillPrompt: string;
    llmProvider: string;
    llmModel: string;
    distillProvider: string;
    distillModel: string;
    sleepProvider: string;
    sleepModel: string;
    capAgent: number;
    capUser: number;
    capMemory: number;
    enableDeepSleep: boolean;
    deepSleepIdleMs: number;
    deepSleepProbe: boolean;
    deepSleepProbeAfterMs: number;
    deepSleepProbeWindowMs: number;
    deepSleepProbeSamples: number;
    deepSleepProbeConfirm: number;
    deepSleepProbeRetries: number;
    deepSleepProbeMaxMs: number;
    deepSleepDaemonParent: boolean;
    activationShadow: boolean;
    activationPrefetch: boolean;
    activationTOn: number;
    activationTOff: number;
    activationCooldownSteps: number;
    activationTopK: number;
    embedEnabled: boolean;
    embedBaseUrl: string;
    embedModel: string;
    embedApiKeyEnv: string;
    activityWarmDays: number;
    activityColdDays: number;
    activityArchiveDays: number;
    activityHotHits: number;
    recallColdFactorPercent: number;
}
export declare const Config: any;
export declare function applyScheduler(ctx: Context, config: Config): void;
