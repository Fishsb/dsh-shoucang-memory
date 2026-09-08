/**
 * 调度器共享引用 · 跨模块桥接（与 deepsleep-share.ts 同模式）。
 *
 * 背景：panel.ts 与 scheduler.ts 是两个独立 apply 函数，共用同一 cordis ctx
 * （index.ts 先 applyPanel 后 applyScheduler）。panel 的 /suite RPC 需要
 * 「suite 装配矩阵」数据，而成员表（config.members）与双基准扫描都归 scheduler 持有——
 * 算法本体在 targets.ts 的 suiteAssemblyMatrix（单一实现），此处只桥接调用入口：
 *   - scheduler 启动期把 { suiteScan } 写入 schedulerShare.api；
 *   - panel 路由在请求时读取；读不到（scheduler 未启用/未就绪）则返回空态，不报错。
 *
 * 红线：type-only 引用 targets 的 SuiteMemberRow，无运行时循环依赖；无硬编码机器路径。
 */
import type { SuiteMemberRow } from './targets.js';
export interface SchedulerShareApi {
    /** suite 装配矩阵（targets.suiteAssemblyMatrix 的绑定入口，成员表=调度器 config.members） */
    suiteScan: () => {
        members: SuiteMemberRow[];
        summary: string;
    };
}
/** 共享引用：请求时惰性读取（可能为 null=scheduler 未就绪） */
export declare const schedulerShare: {
    api: SchedulerShareApi | null;
};
