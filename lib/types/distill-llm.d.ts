export interface LlmDeps {
    log(m: string): void;
    llmState: {
        providerFailCount: number;
    };
    /** ⚠ config / ctx 用 any 是**刻意**的：类型定义在 distill.ts，此处 import 即成环（同 deepsleep 的理由） */
    config: any;
    ctx: any;
}
export declare function createLlmApi(d: LlmDeps): {
    validateProvider: () => void;
    resolveLlm: (sp: string, sm: string) => {
        provider: string;
        model: string;
    } | null;
    probeScriptPath: string;
    locateTranscript: (sid: string) => Promise<string | null>;
    resolveWorkspace: (sid: string) => Promise<string | null>;
};
export type LlmApi = ReturnType<typeof createLlmApi>;
