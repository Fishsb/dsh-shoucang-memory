/** 三层判据文本行（**常驻注入面**；共 4 行 = 1 标题 + 3 层，合计 147 字符） */
export declare const MEMORY_PLAYBOOK_LINES: readonly string[];
/**
 * 开关读取（缺省**开**）。任何异常都按"开"处理 ——
 *   判据是**增强项**（成本 147 字符），读取失败不该让它静默消失；宁可多注入一行，不可无声丢失判据。
 *
 * ⚠ **调用方必须把本开关纳入注入缓存键**（`panel-shared#stableKey` 已如此）——
 *   否则 `/set injectPlaybook false` 后要等 120s TTL 才生效，而"关闭即**逐字节**回到改动前"
 *   正是本项的**回滚判据**（缓存不失效就验不出来）。该注释刻意留在本件而非调用处：
 *   调用方受 `check-module-growth` 冻结棘轮约束，**每行都要省**。
 */
export declare function playbookEnabled(suite: {
    read: () => unknown;
}): boolean;
/** 判据文本字数（供机检与面板显示；**实测值**而非宣称值） */
export declare function playbookCharCount(): number;
