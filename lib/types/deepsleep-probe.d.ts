import type { SessRec } from './deepsleep-core.js';
/** 探测的全部依赖：日志 + 审计 + 配置 + 宿主 ctx + 转录定位。 */
export interface ProbeDeps {
    log(m: string): void;
    audit(o: Record<string, unknown>): void;
    config: any;
    ctx: any;
    locateTranscript(sid: string): Promise<string | null>;
}
export declare function probeSession(d: ProbeDeps, rec: SessRec): void;
