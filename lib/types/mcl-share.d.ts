/**
 * mcl-share.ts — MCL 认知环运行时状态的跨模块惰性桥（与 `deepsleep-share` / `scheduler-share` 同模式）。
 *
 * 背景：`mcl.ts` 的装配在 scheduler 半区（启动期 `registerMcl` 返回 status 闭包），而面板的 `/mcl/status`
 * RPC 在请求时才需要它——故用 module 级 holder 惰性桥接：
 *   - scheduler 启动期写 `mclShare.api`；
 *   - panel 路由请求时读取（未启用/未就绪 → 如实返回未激活态，不报错）。
 *
 * 红线：type-only 引用 mcl 的 MclStatus，无运行时循环依赖；不出现任何硬编码机器路径。
 */
import type { MclStatus } from './mcl.js';
export interface MclShareApi {
    /** 认知环运行时快照（步数/快慢通道计数/注入与再引导次数/末次判据） */
    status: () => MclStatus;
}
export declare const mclShare: {
    api: MclShareApi | null;
};
