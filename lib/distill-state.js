/** 造一份**全新**状态（每次装配调用一次；不做模块级单例）。 */
export function newDistillState() {
    return {
        distilling: new Set(),
        snapshotUnavailableStreak: new Map(),
        dispatchFailStreak: new Map(),
        skipHoldStreak: new Map(),
        idleTimers: new Map(),
        lastParent: null,
        daemonParent: null,
        childSeen: new Map(),
        globalChildSeen: 0,
        globalChildLoggedAt: 0,
    };
}
//# sourceMappingURL=distill-state.js.map