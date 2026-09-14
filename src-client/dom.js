/**
 * dom.js — DOM 工具与图标常量（自 `body.js` 抽出 · UI1/U1 · 2026-09-15）
 *
 * **为什么先抽它**：`el`/`svg`/`ICONS` 是**纯函数与常量**（零状态、零外部依赖），
 *   而 `UI`（451 行、fan-in 34）**依赖它们** ⇒ 按依赖拓扑，必须先于 `UI` 抽出。
 *   （U1 原定"按 fan-in 降序"，实测依赖关系优先：先抽 `UI` 会让它反向 import `body.js` ⇒ 造环。）
 */

export function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function svg(paths) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '18'); s.setAttribute('height', '18');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  paths.split('|').forEach(function (d) {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); s.appendChild(p);
  });
  return s;
}
/* 8 个视图各一图标（P1-3：此前 5 个图标供 8 项复用，插件集合与运行总览同图） */
export const ICONS = {
  vault: 'M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z',
  toggles: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M2 14h4|M10 8h4|M18 16h4',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z|M14 3v5h5|M9 13h6|M9 17h6',
  persona: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21v-1a6 6 0 0 1 12 0v1',
  memory: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z|M9 8h6|M9 12h6|M9 16h4',
  overview: 'M4 4h7v7H4z|M13 4h7v4h-7z|M13 10h7v10h-7z|M4 13h7v7H4z',
  suite: 'M4 8l8-4 8 4-8 4-8-4z|M4 13l8 4 8-4|M4 18l8 4 8-4',
  sleep: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  search: 'M11 11l3.5 3.5|M12.5 7.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0z',
  observe: 'M3 12h4l2.5-6 4 13L16 12h5',
  /* 架构视图图标（2026-09-13）：四象限网格 =「事实面 + 旋钮」。
   * ⚠ 教训：`VIEWS` 第 3 个元素是**这里的 key**；此前我编了个不存在的 `'arch'`
   *   ⇒ nav 渲染取到 `undefined` 后 `.split` 抛错 ⇒ **整个面板起不来**（真机 geo 报"无 shadowRoot"）。
   *   加视图 = 必须同时补图标：否则不是"少个图标"，而是**整页白屏**。 */
  arch: 'M4 4h6v6H4z|M14 4h6v6h-6z|M4 14h6v6H4z|M14 14h6v6h-6z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
};
