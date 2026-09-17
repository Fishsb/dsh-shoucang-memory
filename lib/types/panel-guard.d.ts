/**
 * panel-guard.ts — 面板路由的来源栅栏（**单一实现**，T3 · 2026-09-17 圆桌会议产出）
 *
 * ── 为什么必须有它（实弹实证，非读码推断）────────────────────────────
 * 守藏以 `kind:'exact'` 注册 `/api/shoucang-panel/*`（`panel-shared.ts:187`）。宿主
 * `dsh-host-webserver` 的 `match()` **先查 exact 表、命中即返回、不进入 prefix 循环**
 * （`lib/index.js:322-331`，注释原文 `Longest-prefix-wins over the prefix table after an
 * exact-table miss.`）⇒ exact 路由**绕过**挂在 `/api` prefix 上的来源栅栏。
 *
 * 圆桌会议 security 节点**实发请求**实测（这是本项证据等级最高的一条）：
 *   `Host: evil.com` → **200** · `Origin: https://evil.com` → **200**
 *   · `sec-fetch-site: cross-site` → **200**
 *   对照 `GET /api` + `Host: evil.com` → **403**
 * ⇒ 面板的 42 条路由（实测计数）全在宿主 fence 之外，其中含写端点
 *   （`/set_root` · `/memory/edit` · `/memory/remove` · `/save` · `/distill/run` · `/deepsleep/trigger`）。
 *
 * 宿主自己的栅栏实现与设计意图（`dsh-client-connection/lib/index.js:124-137` 逐字）：
 *   > 防浏览器对本地 HTTP API 打开的**两条 confused-deputy 路径** —— DNS rebinding
 *   > （Host 指向攻击者域名而 socket 到达本服务）与恶意页面发起的跨站请求。
 *   > **Host 栅栏约束每个请求**，不论是否像浏览器：明文 HTTP 下浏览器对读取
 *   > （图片/导航）**既不附 Origin 也不附 Fetch-Metadata**，故无标记的请求仍可能是
 *   > rebinding 读取，而 **Host 是 rebinding 唯一无法伪造的头**。
 *
 * ── 本件的口径：**复刻宿主同一套判据，不发明第二套** ──────────────────
 * 与 `isTrustedApiRequest`（同文件 `:201-215`）逐条对齐，避免两套语义漂移：
 *   ① 无 Host                    → 拒（Host 是 rebinding 无法伪造的头）
 *   ② Host 非 loopback           → 拒（`localhost` / `[::1]` / `127/8`）
 *   ③ `sec-fetch-site: cross-site` → 拒
 *   ④ Origin 存在且与 Host 不同源 → 拒；**Origin 缺失则放行**（非浏览器客户端不带它）
 *
 * ⚠ **明确不做**（会议裁定）：
 *   · **不要求** `Content-Type: application/json` —— 会误杀 GET（面板大量只读 GET）；
 *   · **不自研** token / cookie 鉴权 —— 宿主已有 `browserAuth`，且复用须改 `src-client/`
 *     （与在途 i18n 会话撞车），安全上亦非必需（本机攻击者已有 FS 权限）；
 *   · **不做** `trustedHosts` 部署派生 —— 守藏当前只 bind loopback（实测 3080 → 127.0.0.1）；
 *     若将来非 loopback 部署，须补该派生（见本件末尾「复检触发」）。
 *
 * 对面板前端**完全透明**：前端以同源 `fetch` 发请求，自带 Host 且与 Origin 同源 ⇒ 四判据全放行。
 *
 * 复检触发：若宿主改为非 loopback 绑定（`host: '0.0.0.0'`），本栅栏需补 LAN 派生，
 *   否则面板自身也会被拒。
 */
/** 面板路由的来源栅栏（纯函数、零 IO、零依赖 —— 便于单测与复用）。 */
export interface PanelRequestFacts {
    /** 原始请求头（Node `IncomingMessage.headers` 形态：小写键；缺失时按无头处理）。 */
    headers?: Record<string, string | string[] | undefined>;
}
/** 是否 loopback 权威（与宿主 `isLoopbackHostname` 同口径）。 */
export declare function isLoopbackHostname(hostname: string): boolean;
/**
 * 判定一个面板请求是否可信（**唯一实现**，`createRouteBinder` 单点调用）。
 *
 * @returns `{ trusted: true }` 或 `{ trusted: false, reason }`（reason 进日志，不回显敏感头）。
 */
export declare function judgePanelRequest(facts: PanelRequestFacts): {
    trusted: boolean;
    reason?: string;
};
