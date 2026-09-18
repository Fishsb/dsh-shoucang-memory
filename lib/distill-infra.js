// distill-infra.ts — 蒸馏「基础设施（日志 / 审计 / 台账 / 回合集 / 存根）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（8 项）。
//   对外只暴露 createInfraApi(d) —— 返回绑定后的句柄，调用方零感知。
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compactFile, rotateBySize } from './ledger-compact.js';
import { CRITERIA_VERSION } from './criteria.generated.js';
import { envelopeEvent as envelope } from './event-envelope.js';
export function createInfraApi(d) {
    return {
        ledger: (...a) => ledger(d, ...a),
        recordEpisode: (...a) => recordEpisode(d, ...a),
        log: (...a) => log(d, ...a),
        sidShort: (...a) => sidShort(d, ...a),
        audit: (...a) => audit(d, ...a),
        recordStub: (...a) => recordStub(d, ...a),
        manifest: (...a) => manifest(d, ...a),
    };
}
/** S2S3 册零（2026-09-19）：**分段清单持久化**。
 *  判因：清单原先只是**同轮内存字符串**（`distill-agent` 的 `manifest`，CAP=1500 丢最早行，轮结束即消失）
 *  ⇒ L2 会话级复盘拿不到"本会话 L1 全部产出"，只能看到同轮后段。
 *  落盘面 = `<kRoot>/audit/distill-manifest/<sid>.jsonl`（**每段一行**，append-only）；
 *  它不是新事件 kind（不写台账），是**键控产物流**（须登记 `check-observability`）。
 *  失败**不阻塞**主链路，但走 `fail()` 留痕（与 ledger/log 同纪律）。 */
const manifest = (d, sid, line) => {
    try {
        const dir = join(dirname(d.ledgerFile), 'distill-manifest');
        mkdirSync(dir, { recursive: true });
        appendFileSync(join(dir, `${String(sid).replace(/^session-/, '')}.jsonl`), String(line).replace(/\s+$/, '') + '\n', 'utf8');
    }
    catch (e) {
        fail(d, 'manifest', e);
    }
};
/**
 * 统一事件信封已抽到 `src/event-envelope.ts`（**单一实现** · 2026-09-13）。
 * 本模块原先自带一份副本——连同 `mcl` / `deepsleep-tree` / `treeops` / `vec` 共 **6 处副本**，
 * 现全部收敛；`check-observability` 断言源码中不再出现原始写法。
 */
/** 台账**体积轮转**阈值（D-M5 · 2026-09-17）。实测 ledger ≈**608 KB/天**（3,499,167 B / 5.56 天）
 *  ⇒ 8 MB ≈ **13 天**；保留 3 份（`LEDGER_VOLUMES`）⇒ 窗口 ≈ **39 天**。
 *  硬依据：`panel-memory.ts#growthOf` **按月**统计 —— 必须保住**当前月 + 上月**，故 3 份是下限而非拍脑袋。
 *  与 `compactFile`（按 type 裁 episode）互补：那件管"某类事件不留太久"，本件管"文件不无限长大"。 */
const LEDGER_CAP_BYTES = 8 * 1024 * 1024;
/** 写失败上报（2026-09-17 · D-Silent）。**绝不抛** —— 可见化不得反过来中断主流程。 */
const fail = (d, kind, e) => {
    try {
        d.onWriteFail?.(kind, e);
    }
    catch { /* 上报失败无害 */ }
};
const ledger = (d, o) => {
    try {
        mkdirSync(dirname(d.ledgerFile), { recursive: true });
        const dom = String(o.domain || '');
        const type = String(o.type || (dom === 'consolidate' ? 'decision.consolidate' : dom === 'ingest' ? 'decision.ingest' : 'event'));
        appendFileSync(d.ledgerFile, envelope({ criteriaVersion: CRITERIA_VERSION, ...o, type }, type), 'utf8');
        /* D-M5 体积轮转：append 后 stat 一次 —— 台账写入**不是热路径**，代价可忽略（换来"文件不无限长大"）。
         *   ⚠ 读取侧已**同批**改为跨档（`audit-source.ts` / `panel-observe.ts`）—— 只改这里必"看起来丢数据"。 */
        rotateBySize(d.ledgerFile, LEDGER_CAP_BYTES);
    }
    catch (e) {
        fail(d, 'ledger', e);
    } // 台账失败不再静默：不影响主流程，但**必须留痕**
};
const recordEpisode = (d, o) => {
    try {
        // DS4 合并第四刀（2026-09-13）：episode 并入**统一台账**（type=episode）。
        //   关键差别：旧实现的保留期裁剪是「读**自己那个文件**全部行 → 重写保留末 N 行」——
        //   并进共享台账后那样会**截断整个 ledger**。故本刀先落地「**按 type 裁剪**」机制
        //   （`ledger-compact.ts`：只删同 type 的最旧行，其他 type 原样保留、顺序不变），再用它裁 episode。
        mkdirSync(dirname(d.episodeFile), { recursive: true });
        appendFileSync(d.episodeFile, envelope(o, 'episode'), 'utf8');
        compactFile(d.episodeFile, 'episode', d.EPISODE_CAP, 8); // 超 EPISODE_CAP+8 才重写（低频、原子替换、失败静默）
    }
    catch (e) {
        fail(d, 'episode', e);
    } // 回合集写失败留痕（原静默）
};
const log = (d, msg) => { try {
    mkdirSync(dirname(d.logFile), { recursive: true });
    appendFileSync(d.logFile, '[' + new Date().toISOString() + '] ' + msg + '\n');
}
catch { /* 静默 */ } };
// sid 可读短号：slice(0,8) 恒等于 'session-' 前缀（此前日志全打成 'session-' 无辨识度）——取 uuid 中段
const sidShort = (d, sid) => (sid && sid.startsWith('session-') && sid.length > 16 ? sid.slice(8, 16) : String(sid || '').slice(0, 12));
// DS4 第六刀（2026-09-13）：蒸馏审计并入**统一台账**（`type=audit.<kind>`），不再单开 `distill-audit.jsonl`。
//   读侧一律走 `audit-source.ts#readDistillAudit`（legacy ∪ 台账）——**双源是强制的**：实测单读台账
//   会让深睡水位回放命中 0 轮（历史丢光）⇒ 水位置 now ⇒ 丢一轮痕迹。
const audit = (d, o) => { try {
    mkdirSync(dirname(d.ledgerFile), { recursive: true });
    appendFileSync(d.ledgerFile, envelope(o, `audit.${String(o.kind || 'event')}`));
}
catch { /* 静默 */ } };
const recordStub = (d, o) => {
    try {
        // DS4 合并第三刀（2026-09-13）：裁决存根并入**统一台账**（type=stub），不再单开 `raw-stub/stub.jsonl`。
        //   消费者核查：**代码侧零读取者**（只有 `audit-protocol.md` 的抽验规程引用该路径）⇒ 改文档即可。
        //   为何选它做第三刀：它**没有裁剪/保留期逻辑**（对照：`episodes` 带 EPISODE_CAP 读全文件重写 ⇒
        //   并进共享台账后那段裁剪会**截断整个 ledger**，须先有"按 type 裁剪"机制，故不在本轮并）。
        mkdirSync(dirname(d.ledgerFile), { recursive: true });
        appendFileSync(d.ledgerFile, envelope(o, 'stub'), 'utf8');
    }
    catch (e) {
        fail(d, 'stub', e);
    } // 存根写失败留痕（原静默）
};
//# sourceMappingURL=distill-infra.js.map