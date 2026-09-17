export interface InfraDeps {
    logFile: string;
    auditFile: string;
    ledgerFile: string;
    episodeFile: string;
    stubDir: string;
    kRoot: string;
    EPISODE_CAP: number;
    LEDGER_FILE: string;
    /** 写失败可见化（2026-09-17 · D-Silent）。原三处写入 catch **全静默** ⇒ 台账/回合集/存根写失败零痕迹，
     *  使用者会以为"已记录"。此处**刻意可选且不抛**：可见化不得反过来中断主流程（与既有"台账 best-effort"
     *  纪律一致）；未接线时行为与改前**完全一致**（零回归）。 */
    onWriteFail?: (kind: string, e: unknown) => void;
}
/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never;
export declare function createInfraApi(d: InfraDeps): {
    ledger: (o: Record<string, unknown>) => void;
    recordEpisode: (o: Record<string, unknown>) => void;
    log: (msg: string) => void;
    sidShort: (sid: string) => string;
    audit: (o: Record<string, unknown>) => void;
    recordStub: (o: Record<string, unknown>) => void;
};
export type InfraApi = ReturnType<typeof createInfraApi>;
declare const ledger: (d: InfraDeps, o: Record<string, unknown>) => void;
declare const recordEpisode: (d: InfraDeps, o: Record<string, unknown>) => void;
declare const log: (d: InfraDeps, msg: string) => void;
declare const sidShort: (d: InfraDeps, sid: string) => string;
declare const audit: (d: InfraDeps, o: Record<string, unknown>) => void;
declare const recordStub: (d: InfraDeps, o: Record<string, unknown>) => void;
export {};
