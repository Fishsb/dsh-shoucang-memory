export declare const CHUNK_CHARS = 10000;
export declare const MAX_CHUNKS_PER_RUN = 3;
export declare const textPartsOfEvent: (e: any) => string[];
export interface DistillChunk {
    startSeq: number;
    endSeq: number;
    text: string;
}
export interface DistillChunks {
    chunks: DistillChunk[];
    maxSeq: number;
}
/**
 * buildEventChunks — v18 分段器（2026-09-10）：把 seq>lastSeq 的事件增量按「累计字符超 chunkChars 即切段」切成若干段。
 * - 文本化规则 = 模块级 textPartsOfEvent 单一实现（user text 片 ≤2000、assistant block-end text ≤3000）；
 * - 切段只在事件边界，绝不劈事件；单个事件文本超 chunkChars 时允许单事件成段；
 * - 无文本事件并入当前开放段（只推进其 endSeq，不增字符）；窗口开头、首个文本事件之前的无文本事件不占段，
 *   但恒被水位推进覆盖（蒸馏成功推至首段 endSeq / 跳过推至 maxSeq），不丢事件；
 * - 窗口内完全没有 seq>lastSeq 的事件 → chunks=[]、maxSeq=lastSeq；maxSeq=窗口最末事件 seq；
 * - 不再返回 truncatedTail（2026-09-11 清理：该字段恒 false 且无消费方）；「还有后续段未处理」由调用方按
 *   chunks.length 与本轮段数上限（MAX_CHUNKS_PER_RUN）判定（水位停在已处理段的 endSeq，下一触发续传）。
 */
export declare function buildEventChunks(agent: any, lastSeq: number, chunkChars?: number, eventsOf?: any[]): DistillChunks;
export declare const manifestLineFor: (endSeq: number, route: string, out: any) => string;
export declare const manifestPush: (manifest: string, line: string, cap: number) => string;
