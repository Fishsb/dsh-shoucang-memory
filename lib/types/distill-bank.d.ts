import type { InfraApi } from './distill-infra.js';
export interface BankDeps {
    kRoot: string;
    infra: InfraApi;
    config: any;
}
export declare function createBankApi(dep: BankDeps): {
    bankGitScript: string;
    runSelfCheck: (trigger: "deep-sleep" | "timer" | "manual") => Promise<{
        verdict?: string;
        adjustments: string[];
    } | null>;
    bankSnapshot: (label: string) => Promise<void>;
};
export type BankApi = ReturnType<typeof createBankApi>;
