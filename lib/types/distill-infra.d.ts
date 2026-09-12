export interface InfraDeps {
    logFile: string;
    auditFile: string;
    ledgerFile: string;
    episodeFile: string;
    stubDir: string;
    kRoot: string;
    EPISODE_CAP: number;
    LEDGER_FILE: string;
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
