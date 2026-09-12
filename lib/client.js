/**
 *dsh-shoucang-memory — client 半区（纯 DOM，样式照搬 Obsidian 设置窗口）。守藏单插件 2026-09-08 合并。
 *
 * 视觉规范（Obsidian 默认主题还原）：
 *   - 居中模态：左导航（--background-secondary）+ 右内容（--background-primary），
 *     圆角 12px、大投影、Inter 系字体栈；
 *   - 控件：Obsidian 开关（checkbox-container 胶囊）、setting-item 行（标题+描述+
 *     右侧控件）、边框一律 --background-modifier-border；
 *   - 强调色：Obsidian 紫 hsl(254deg 80% 68%)；深浅色随系统 prefers-color-scheme。
 *
 * 存储格式即 Obsidian：守藏根目录本身是「纯 Markdown + YAML frontmatter +
 * [[双链]]」的目录树，可被 Obsidian 直接作为 vault 打开，本面板不引入任何
 * 非 Obsidian 存储面。
 */
(function () {
  'use strict';

  window.__ModuleLoader__.load({
    id: 'dsh-shoucang-memory',
    factory: function (require) {
      var module = { exports: {} };
      var exports = module.exports;

      var BASE = '/api/shoucang-panel';
      // 入口位：注册进侧栏 footer.action 插槽（现行 cordis client slot 契约）；
      // 直插 footArea 的旧 DOM 方案仅作无 slot 环境的兜底（不再默认启用）
      var inject = ['slots'];

      /* ---------- RPC ---------- */

      /* RPC 统一埋点（2026-09-12 查漏补缺）：
       * 原实现是无上下文的裸 fetch —— 54 处旧调用失败时只剩一句 e.message，无从定位。
       * 现统一注入 ctx（method/path/params）与耗时，并把 ctx 挂在 error 上（e.__ctx）；
       * fail() 会自动读取 e.__ctx ⇒ **所有旧调用点零改动即获得错误定位与调用日志**。 */
      function api(path, opts) {
        var o = opts || {};
        var t0 = Date.now();
        var ctx = { method: (o.method || 'GET'), path: path, params: o.body || null };
        /* C1：慢请求自动反馈——超过 1.5s 未返回则在状态栏显示「执行中…」，
           覆盖全部旧调用点（旧代码看不到进度，"点了没反应"）。
           用 setStatusText 而非 status：不写日志，且结束时清空，避免与业务 status() 互相覆盖。 */
        var busyShown = false;
        var busyTimer = setTimeout(function () { busyShown = true; setStatusText('执行中… ' + path, 'info'); }, 1500);
        function endBusy() { clearTimeout(busyTimer); if (busyShown) { busyShown = false; setStatusText('', 'info'); } }
        return fetch(BASE + path, Object.assign({ headers: { 'content-type': 'application/json' } }, o))
          .then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) {
                var err = new Error((j && j.error) || ('HTTP ' + r.status));
                err.__ctx = ctx;
                throw err;
              }
              endBusy();
              Log.info(ctx.method + ' ' + path + ' ✓ ' + (Date.now() - t0) + 'ms', ctx);
              return j;
            });
          })
          .catch(function (e) {
            if (!e.__ctx) e.__ctx = ctx;
            endBusy();
            Log.error(ctx.method + ' ' + path + ' ✗ ' + (e && e.message ? e.message : String(e)), ctx);
            throw e;
          });
      }

      var SC_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAD90lEQVR4Aeybv65NQRTGL52CB6CRkNAIlUKpoPEIGkoFL6D1ACRaCs+gIFErFBQSJBQKHoBE666v2Mnsndmz98yeNd+cc76bWXfP/7XW9ztz/mafPNIfVQEBoMp/dCQAAkBWgOxeJ0AAyAqQ3esECABZAbJ7nQABICtAdn+YJ4AseuheAEI1CHUBIIgeuhSAUA1CXQAIoocuBSBUg1DvEcB/0yE0a2aVcC3qWYtbT+4RQGsNqP4EgCq/fpAhyy8AhwSAnmuXAeg1gIxFAA4QwDvLGe/P58yGR2Vu3lz/aLE15uah/6uNU0urE3DWskTCsJtW76VcskAQE+ya1ZuXFgBeWVa/zHovHy3A5ifCGwAeWXctsV0pOBHfWwbrCWDp0XTHEj1BMvg219FywXr/mTUpngDwaJom8c06BtFfW51V4HuI43ckiFPWh9ctu/gWLwB46plGft86Lpv1Vs5ZQI/NpqXJ65YXgGkyaL/Ev07ticWFU2GXumVpNw8AsUc/jvtSLOzx2OvCH++gPAB4x9xy/9PezloA2IVH/6DzjaHS6toCQKtcavh5X2OTnD0EIEcth7kC4CBqzpYCkKOWw9zaAPAx3iHM/d2yBADe589ZjS+y5vYu7d9Kb8nvpv1LAGxyqMVjBfYTwDjHrlsCQMZTAgCfbOfstkM+2HPOX6y/dggxH2HfJn8lAFIO36YGC8c89iwMpf6y2gDqR7jnOwoAGbAACABZAbJ7nQABICtAdq8TsD8AyJnsqHudADK42gAeOOTzMGPPnfs9ogRA6vvx5xlirZ361CamfIZjNX6PMHejEu4fq48m5zZKAOT60PyEAgKQEKfFkAC0UDnhowRA+F14rJ5wt2ootueWvlVOE5OWfCeWLg+VAFjeVTNWKyAAq6XymSgAG3XdulwAtiq4cb0AjAW8NW76t1oAwKdH/0zqeHhTZ5v1u7QAsD6a/mb+9Q7JAwDeN0/jdr/XauqwoP0isuZMpK9qlweAWIC41+pqbKCTPtw+e48RixeA2Cn4ZAn2+HqAmL5YbNNyftrh0fYCgFhjd6CjHwnDUGcaYoDFYkDsP2MDtfs8AeAO9FS8SJ5pqdiWYk+tzRrzBIBA8FT0AZUdsc8WJ2K2S5viDQBZXLd/dZOyDR0KYrzisG9yyxYAhgCQIGxo93JFTDBKPC0BDAki2ZQN84brI6uk5odjF23utCzdXzCd37TNAJCb4LOMBT8ic7u+v2AXAEQ03Z8uASCzFAABICtAdq8TIABkBcjuezwB4ft61HMlwprQctc3nZ8BoGlcB+NMAMioBUAAyAqQ3esECABZAbJ7nQABICtAdq8TIABkBcjudQIWAHgPHwMAAP//8UoJFgAAAAZJREFUAwBhOrPBP4+UEwAAAABJRU5ErkJggg==';

      function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
      }

      function svg(paths) {
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
      var ICONS = {
        vault: 'M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z',
        toggles: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M2 14h4|M10 8h4|M18 16h4',
        file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z|M14 3v5h5|M9 13h6|M9 17h6',
        persona: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21v-1a6 6 0 0 1 12 0v1',
        memory: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z|M9 8h6|M9 12h6|M9 16h4'
      };

      /* ---------- 守藏面板 · 统一设计系统（2026-09-12 重构） ----------
       * 背景：原样式由 5 层补丁叠加（基础 → U2.5 → U2.5b → UI 重构 → 样式系统优化），
       *       同一选择器被反复覆盖（.sc-h1 三处、.sc-btn 四处、.sc-h2 三处），且散落 16+ 裸 hex，
       *       导致「同一语义不同表现」。本次收敛为**单一分层系统**：
       *
       *   ① 令牌 Token   颜色 / 间距 / 圆角 / 字号 / 阴影 / 动效 / z 轴
       *   ② 基础 Base    重置 / 滚动条 / 焦点环 / 排版基类
       *   ③ 布局 Layout  mask · modal · nav · main · view · statusbar
       *   ④ 原件 Control 按钮 · 输入 · 下拉 · 开关 · 徽标 · 折叠 · 进度 · 日志
       *   ⑤ 业务 Block   记忆卡 · 指针 · 索引 · 深睡 · 向量 · 根目录 · 画像
       *   ⑥ 适配 Adapt   密度 / 响应式 / 触摸 / 减弱动效
       *
       * 纪律：颜色只走令牌（业务层禁止裸 hex）；尺寸只走标尺（禁止裸 px）。
       * 主题：--sc-* 全量映射 dsh web 宿主语义变量（--dsw-alias-*），宿主深浅色自动跟随。
       */
      var CSS = [
        /* ══════════ ① 令牌层 ══════════ */
        '#scpanl-root,.sc-trigger,.sc-fab{',
        /* 语义色 */
        '--sc-bg1:var(--dsw-alias-bg-layer-1,#1e1e1e);',
        '--sc-bg2:var(--dsw-alias-bg-layer-2,#191919);',
        '--sc-bg3:var(--dsw-alias-bg-layer-3,#262626);',
        '--sc-text:var(--dsw-alias-label-primary,#e6e6e6);',
        '--sc-muted:var(--dsw-alias-label-secondary,#a2a2a2);',
        '--sc-faint:var(--dsw-alias-label-tertiary,#707070);',
        '--sc-border:var(--dsw-alias-border-l2,#2d2d2d);',
        '--sc-border-strong:var(--dsw-alias-border-l1,#404040);',
        '--sc-accent:var(--dsw-alias-brand-primary,hsl(254deg 80% 68%));',
        '--sc-accent-hover:var(--dsw-alias-brand-primary,hsl(254deg 80% 74%));',
        '--sc-ok:var(--dsw-alias-state-success-primary,#3fb950);',
        '--sc-warn:var(--dsw-alias-state-warn-primary,#e8a33d);',
        '--sc-err:var(--dsw-alias-state-error-primary,#e5534b);',
        '--sc-info:#4a9eff;',
        '--sc-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));',
        '--sc-active:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.11));',
        /* 派生色：由主色 color-mix 生成，杜绝业务层散写 rgba 常量 */
        '--sc-accent-bg:color-mix(in srgb,var(--sc-accent) 14%,transparent);',
        '--sc-accent-bd:color-mix(in srgb,var(--sc-accent) 45%,transparent);',
        '--sc-ok-bg:color-mix(in srgb,var(--sc-ok) 15%,transparent);',
        '--sc-warn-bg:color-mix(in srgb,var(--sc-warn) 17%,transparent);',
        '--sc-err-bg:color-mix(in srgb,var(--sc-err) 15%,transparent);',
        '--sc-info-bg:color-mix(in srgb,var(--sc-info) 16%,transparent);',
        /* 标尺：4px 基准 / 8pt 节奏；--sc-gap-* = 「留白即分组」的语义层 */
        '--sc-sp-1:4px;--sc-sp-2:8px;--sc-sp-3:12px;--sc-sp-4:16px;--sc-sp-5:24px;--sc-sp-6:32px;--sc-sp-7:48px;',
        '--sc-gap-row:8px;--sc-gap-item:12px;--sc-gap-group:24px;',
        '--sc-pad-card:12px 14px;',
        /* 字阶（模数 1.15，中文可读下限 12px）+ 行高三档 + 字重 + 字距 */
        '--sc-fs-xs:12px;--sc-fs-sm:13px;--sc-fs-md:14px;--sc-fs-lg:16px;--sc-fs-xl:20px;--sc-fs-2xl:28px;',
        '--sc-lh-tight:1.35;--sc-lh-normal:1.6;--sc-lh-loose:1.75;',
        '--sc-fw-normal:400;--sc-fw-medium:500;--sc-fw-semibold:600;--sc-fw-bold:700;',
        '--sc-ls-tight:-.01em;--sc-ls-wide:.06em;',
        /* 圆角四档 + 阴影三级 + 动效两速 */
        '--sc-r-sm:6px;--sc-r-md:8px;--sc-r-lg:12px;--sc-r-pill:999px;',
        '--sc-shadow-1:0 1px 2px rgba(0,0,0,.20);--sc-shadow-2:0 4px 16px rgba(0,0,0,.28);--sc-shadow-3:0 18px 56px rgba(0,0,0,.45);',
        '--sc-t-fast:.12s;--sc-t-base:.18s;--sc-ease:cubic-bezier(.4,0,.2,1);',
        '--sc-ring:0 0 0 2px color-mix(in srgb,var(--sc-accent) 55%,transparent);',
        '--sc-disabled-op:.45;',
        /* 宽度：控件 / 阅读 / 布局 */
        '--sc-w-control:280px;--sc-w-read:72ch;--sc-w-sm:180px;--sc-w-md:200px;--sc-w-lg:300px;--sc-w-xl:320px;',
        '--sc-nav-w:216px;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",sans-serif;',
        '}',

        /* ══════════ ② 基础层 ══════════ */
        '#scpanl-root *{box-sizing:border-box;}',
        '#scpanl-root :focus{outline:none;}',
        '#scpanl-root :focus-visible{outline:none;box-shadow:var(--sc-ring);border-radius:var(--sc-r-sm);}',
        '#scpanl-root button:disabled,#scpanl-root input:disabled,#scpanl-root select:disabled,',
        '#scpanl-root textarea:disabled{opacity:var(--sc-disabled-op);cursor:not-allowed;}',
        '#scpanl-root [aria-disabled="true"]{opacity:var(--sc-disabled-op);pointer-events:none;}',
        /* 两种「看不见」是**不同语义**，不要共用一个状态位：
           .sc-hidden   = 折叠态（由 Fold 单一数据源驱动）
           .sc-filtered = 检索过滤（由关键词派生）
           旧实现两者都用 .sc-hidden，一旦折叠与检索叠在同一元素上就会互相覆盖（收起/过滤互相打架）。 */
        '#scpanl-root .sc-hidden,#scpanl-root .sc-filtered{display:none !important;}',
        /* 滚动条（WebKit + Firefox 双写） */
        '#scpanl-root .sc-view,#scpanl-root .sc-logwrap,#scpanl-root .sc-card-body,#scpanl-root .sc-nav{',
        'scrollbar-width:thin;scrollbar-color:var(--sc-border-strong) transparent;}',
        '#scpanl-root ::-webkit-scrollbar{width:10px;height:10px;}',
        '#scpanl-root ::-webkit-scrollbar-track{background:transparent;}',
        '#scpanl-root ::-webkit-scrollbar-thumb{background:var(--sc-border-strong);border-radius:5px;',
        'border:2px solid transparent;background-clip:padding-box;}',
        '#scpanl-root ::-webkit-scrollbar-thumb:hover{background:var(--sc-faint);background-clip:padding-box;}',
        /* 排版基类：层级由「字号 + 字重 + 色阶」三重编码，不靠单一变量 */
        '#scpanl-root .sc-h1{font-size:var(--sc-fs-xl);font-weight:var(--sc-fw-bold);line-height:var(--sc-lh-tight);',
        'letter-spacing:var(--sc-ls-tight);color:var(--sc-text);margin:0 0 var(--sc-sp-1);}',
        '#scpanl-root .sc-h2{font-size:var(--sc-fs-lg);font-weight:var(--sc-fw-semibold);line-height:var(--sc-lh-tight);',
        'color:var(--sc-text);margin:var(--sc-gap-group) 0 var(--sc-sp-2);}',
        '#scpanl-root .sc-h3{font-size:var(--sc-fs-xs);font-weight:var(--sc-fw-semibold);line-height:var(--sc-lh-tight);',
        'color:var(--sc-muted);margin:var(--sc-gap-item) 0 var(--sc-sp-1);}',
        '#scpanl-root .sc-desc{font-size:var(--sc-fs-sm);line-height:var(--sc-lh-normal);color:var(--sc-muted);',
        'max-width:var(--sc-w-read);margin:0 0 var(--sc-gap-item);}',
        /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 h1/desc） */
        '#scpanl-root .sc-pagehead{margin:0 0 var(--sc-gap-group);padding-bottom:var(--sc-gap-item);',
        'border-bottom:1px solid var(--sc-border);}',
        '#scpanl-root .sc-pagehead .sc-h1{margin-bottom:var(--sc-sp-1);}',
        '#scpanl-root .sc-pagehead .sc-desc{margin-bottom:0;}',

        /* ══════════ ③ 布局层 ══════════ */
        '#scpanl-mask{position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.55);display:none;',
        'align-items:center;justify-content:center;color:var(--sc-text);padding:var(--sc-sp-5);}',
        '#scpanl-mask.open{display:flex;}',
        '#scpanl-modal{width:min(1040px,100%);height:min(720px,100%);display:flex;overflow:hidden;',
        'border-radius:var(--sc-r-lg);background:var(--sc-bg1);border:1px solid var(--sc-border);',
        'box-shadow:var(--sc-shadow-3);}',
        /* 左导航 */
        '#scpanl-root .sc-nav{width:var(--sc-nav-w);flex:none;background:var(--sc-bg2);',
        'padding:var(--sc-sp-3) var(--sc-sp-2);display:flex;flex-direction:column;gap:2px;',
        'border-right:1px solid var(--sc-border);overflow-y:auto;overflow-x:hidden;}',
        '#scpanl-root .sc-nav-title{font-size:10.5px;letter-spacing:var(--sc-ls-wide);text-transform:uppercase;',
        'color:var(--sc-faint);padding:var(--sc-sp-1) var(--sc-sp-3) var(--sc-sp-3);}',
        '#scpanl-root .sc-nav-group{margin:var(--sc-gap-item) var(--sc-sp-3) var(--sc-sp-1);font-size:10.5px;',
        'letter-spacing:var(--sc-ls-wide);text-transform:uppercase;color:var(--sc-faint);}',
        '#scpanl-root .sc-nav-item{position:relative;display:flex;align-items:center;gap:var(--sc-sp-2);',
        'padding:8px var(--sc-sp-3);border-radius:var(--sc-r-sm);cursor:pointer;',
        'font-size:var(--sc-fs-sm);line-height:var(--sc-lh-tight);color:var(--sc-muted);user-select:none;',
        'transition:background var(--sc-t-base) var(--sc-ease),color var(--sc-t-base) var(--sc-ease),',
        'transform var(--sc-t-fast) var(--sc-ease);}',
        '#scpanl-root .sc-nav-item:hover{background:var(--sc-hover);color:var(--sc-text);}',
        '#scpanl-root .sc-nav-item:active{transform:translateY(1px);}',
        '#scpanl-root .sc-nav-item.active{background:var(--sc-accent-bg);color:var(--sc-accent);',
        'font-weight:var(--sc-fw-semibold);}',
        '#scpanl-root .sc-nav-item.active::before{content:"";position:absolute;left:0;top:50%;',
        'transform:translateY(-50%);width:3px;height:16px;border-radius:0 2px 2px 0;background:var(--sc-accent);}',
        '#scpanl-root .sc-nav-item svg{width:16px;height:16px;flex:none;}',
        '#scpanl-root .sc-nav-spacer{flex:1;}',
        '#scpanl-root .sc-nav-close{display:none;}',
        /* 右内容 */
        '#scpanl-root .sc-main{flex:1;display:flex;flex-direction:column;background:var(--sc-bg1);min-width:0;}',
        '#scpanl-root .sc-view{flex:1;overflow-y:auto;padding:var(--sc-sp-5) var(--sc-sp-6) var(--sc-sp-7);}',
        '#scpanl-root .sc-view>*:last-child{margin-bottom:0;}',
        '#scpanl-root .sc-statusbar{padding:var(--sc-sp-2) var(--sc-sp-5);border-top:1px solid var(--sc-border);',
        'font-size:var(--sc-fs-xs);color:var(--sc-muted);min-height:28px;line-height:20px;',
        'background:var(--sc-bg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '#scpanl-root .sc-status-info{color:var(--sc-muted);}',
        '#scpanl-root .sc-status-warn{color:var(--sc-warn);}',
        '#scpanl-root .sc-status-error{color:var(--sc-err);font-weight:var(--sc-fw-semibold);}',

        /* ══════════ ④ 原件层 ══════════ */
        /* 按钮：主 / 次 / 危险 / 幽灵 + xs 尺寸，统一 min-height 与动效 */
        '#scpanl-root .sc-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;',
        'min-height:30px;padding:5px 12px;border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);',
        'background:var(--sc-bg2);color:var(--sc-text);font:inherit;font-size:var(--sc-fs-sm);line-height:1.4;',
        'cursor:pointer;white-space:nowrap;flex:none;',
        'transition:background var(--sc-t-base) var(--sc-ease),border-color var(--sc-t-base) var(--sc-ease),',
        'color var(--sc-t-base) var(--sc-ease),transform var(--sc-t-fast) var(--sc-ease),',
        'box-shadow var(--sc-t-fast) var(--sc-ease);}',
        '#scpanl-root .sc-btn:hover:not(:disabled){background:var(--sc-hover);border-color:var(--sc-border-strong);}',
        '#scpanl-root .sc-btn:active:not(:disabled){transform:translateY(1px);}',
        '#scpanl-root .sc-btn:disabled{opacity:var(--sc-disabled-op);cursor:not-allowed;}',
        '#scpanl-root .sc-btn-primary{background:var(--sc-accent);border-color:var(--sc-accent);color:#fff;',
        'font-weight:var(--sc-fw-medium);}',
        '#scpanl-root .sc-btn-primary:hover:not(:disabled){background:var(--sc-accent-hover);border-color:var(--sc-accent-hover);}',
        '#scpanl-root .sc-btn-danger{color:var(--sc-err);border-color:var(--sc-err);background:transparent;}',
        '#scpanl-root .sc-btn-danger:hover:not(:disabled){background:var(--sc-err-bg);}',
        '#scpanl-root .sc-btn-ok{color:var(--sc-ok);}',
        '#scpanl-root .sc-btn-muted{color:var(--sc-muted);}',
        '#scpanl-root .sc-btn-xs{min-height:24px;padding:2px 9px;font-size:var(--sc-fs-xs);}',
        /* 输入 / 下拉 / 文本域 —— 统一控件外观（此前 select 完全无样式，深色主题下为系统白底） */
        '#scpanl-root .sc-input,#scpanl-root input[type=text],#scpanl-root input[type=number],',
        '#scpanl-root input[type=password],#scpanl-root select,#scpanl-root textarea{',
        'appearance:none;-webkit-appearance:none;font:inherit;font-size:var(--sc-fs-sm);color:var(--sc-text);',
        'background:var(--sc-bg2);border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);',
        'padding:5px 10px;min-height:30px;outline:none;max-width:var(--sc-in-w,100%);',
        'transition:border-color var(--sc-t-base) var(--sc-ease),box-shadow var(--sc-t-fast) var(--sc-ease);}',
        /* 宽度走 CSS 变量（--sc-in-w）而非 style.maxWidth：样式集中可审，JS 只赋值 */
        '#scpanl-root textarea{min-height:unset;resize:vertical;}',
        '#scpanl-root select{padding-right:28px;cursor:pointer;background-repeat:no-repeat;',
        'background-position:right 9px center;',
        'background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22%3E%3Cpath d=%22M2.5 4.5 6 8l3.5-3.5%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E");}',
        '#scpanl-root select option{background:var(--sc-bg2);color:var(--sc-text);}',
        '#scpanl-root .sc-input:focus,#scpanl-root input:focus,#scpanl-root select:focus,#scpanl-root textarea:focus{',
        'border-color:var(--sc-accent);box-shadow:0 0 0 3px var(--sc-accent-bg);}',
        /* 开关：单一实现 = input.checkbox-container（label 包裹形态亦兼容） */
        '#scpanl-root .checkbox-container{appearance:none;-webkit-appearance:none;position:relative;',
        'width:38px;height:21px;border-radius:var(--sc-r-pill);flex:none;cursor:pointer;margin:0;',
        'background:var(--sc-bg3);border:1px solid var(--sc-border);padding:0;',
        'transition:background var(--sc-t-base) var(--sc-ease),border-color var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .checkbox-container::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;',
        'border-radius:50%;background:var(--sc-muted);box-shadow:var(--sc-shadow-1);',
        'transition:left var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .checkbox-container:checked{background:var(--sc-accent);border-color:var(--sc-accent);}',
        '#scpanl-root .checkbox-container:checked::after{left:19px;background:#fff;}',
        '#scpanl-root .checkbox-container:disabled{opacity:var(--sc-disabled-op);cursor:not-allowed;}',
        '#scpanl-root .checkbox-material{display:none;}',
        'label.checkbox-container{display:inline-flex;align-items:center;}',
        'label.checkbox-container>input[type=checkbox]{position:absolute;inset:0;width:100%;height:100%;',
        'margin:0;opacity:0;cursor:pointer;}',
        'label.checkbox-container:has(>input:checked){background:var(--sc-accent);border-color:var(--sc-accent);}',
        'label.checkbox-container:has(>input:checked)::after{left:19px;background:#fff;}',
        /* 表单行：标题 + 描述 + 控件 */
        '#scpanl-root .setting-item{display:flex;align-items:center;gap:var(--sc-gap-item);',
        'padding:var(--sc-sp-3) 0;border-top:1px solid var(--sc-border);}',
        '#scpanl-root .setting-item:first-child,#scpanl-root .setting-item:first-of-type{border-top:none;}',
        '#scpanl-root .setting-item-info{flex:1;min-width:0;}',
        '#scpanl-root .setting-item-name{font-size:var(--sc-fs-md);line-height:var(--sc-lh-tight);color:var(--sc-text);}',
        '#scpanl-root .setting-item-desc{font-size:var(--sc-fs-xs);line-height:var(--sc-lh-normal);color:var(--sc-muted);',
        'margin-top:2px;max-width:var(--sc-w-read);}',
        '#scpanl-root .setting-item-control{display:flex;align-items:center;gap:var(--sc-sp-2);flex:none;}',
        /* 徽标 / 标签（形状 + 语义色双编码，色弱可辨） */
        '#scpanl-root .sc-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;',
        'border-radius:var(--sc-r-pill);font-size:var(--sc-fs-xs);line-height:18px;',
        'background:var(--sc-hover);color:var(--sc-muted);white-space:nowrap;flex:none;}',
        '#scpanl-root .sc-badge-ok{background:var(--sc-ok-bg);color:var(--sc-ok);}',
        '#scpanl-root .sc-badge-warn{background:var(--sc-warn-bg);color:var(--sc-warn);}',
        '#scpanl-root .sc-badge-error{background:var(--sc-err-bg);color:var(--sc-err);}',
        '#scpanl-root .sc-badge-info{background:var(--sc-info-bg);color:var(--sc-info);}',
        '#scpanl-root .sc-chip{display:inline-flex;align-items:center;padding:0 var(--sc-sp-2);',
        'border-radius:var(--sc-r-pill);border:1px solid var(--sc-border);color:var(--sc-muted);',
        'font-size:var(--sc-fs-xs);line-height:18px;white-space:nowrap;}',
        '#scpanl-root .sc-chip.warn{border-color:var(--sc-warn);color:var(--sc-warn);}',
        '#scpanl-root .sc-tag{display:inline-block;padding:0 6px;margin:0 4px 2px 0;border-radius:var(--sc-r-pill);',
        'background:var(--sc-bg3);border:1px solid var(--sc-border);color:var(--sc-muted);',
        'font-size:var(--sc-fs-xs);line-height:18px;}',
        '#scpanl-root .sc-ctrl-meta{display:flex;flex-wrap:wrap;gap:var(--sc-sp-1);margin-top:var(--sc-sp-1);}',
        /* 折叠（概览—详情分层） */
        '#scpanl-root .sc-fold{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);',
        'margin:var(--sc-gap-row) 0;background:var(--sc-bg1);overflow:hidden;}',
        '#scpanl-root .sc-fold-head{display:flex;align-items:center;gap:var(--sc-sp-2);',
        'padding:9px var(--sc-gap-item);cursor:pointer;font-size:var(--sc-fs-md);',
        'font-weight:var(--sc-fw-semibold);color:var(--sc-text);user-select:none;',
        'transition:background var(--sc-t-base) var(--sc-ease),transform var(--sc-t-fast) var(--sc-ease);}',
        '#scpanl-root .sc-fold-head:hover{background:var(--sc-hover);}',
        '#scpanl-root .sc-fold-head:active{transform:translateY(1px);}',
        '#scpanl-root .sc-fold-arrow{color:var(--sc-muted);width:12px;flex:none;font-size:var(--sc-fs-xs);}',
        '#scpanl-root .sc-fold-summary{margin-left:auto;font-weight:var(--sc-fw-normal);font-size:var(--sc-fs-xs);',
        'color:var(--sc-muted);}',
        '#scpanl-root .sc-fold-body{display:none;padding:2px var(--sc-gap-item) var(--sc-gap-item);}',
        '#scpanl-root .sc-fold.open .sc-fold-body{display:block;}',
        /* 进度 */
        '#scpanl-root .sc-prog{margin:var(--sc-gap-row) 0;}',
        '#scpanl-root .sc-prog-bar{height:6px;border-radius:var(--sc-r-pill);background:var(--sc-bg3);overflow:hidden;}',
        '#scpanl-root .sc-prog-fill{height:100%;width:var(--sc-pct,0);border-radius:var(--sc-r-pill);background:var(--sc-accent);',
        'transition:width .25s var(--sc-ease);}',
        '#scpanl-root .sc-prog-txt{font-size:var(--sc-fs-xs);color:var(--sc-muted);margin-top:var(--sc-sp-1);}',
        /* 键值（display:contents 让 k/v 真正落进栅格，此前被包裹层挡住不生效） */
        '#scpanl-root .sc-kv{display:grid;grid-template-columns:auto 1fr;gap:var(--sc-sp-1) var(--sc-gap-item);',
        'font-size:var(--sc-fs-sm);align-items:baseline;}',
        '#scpanl-root .sc-kv-row{display:contents;}',
        '#scpanl-root .sc-kv-k{color:var(--sc-muted);white-space:nowrap;}',
        '#scpanl-root .sc-kv-v{color:var(--sc-text);word-break:break-all;}',
        /* 日志 */
        '#scpanl-root .sc-logwrap{border-top:1px solid var(--sc-border);background:var(--sc-bg2);',
        'max-height:var(--sc-log-h,150px);overflow:auto;}',
        '#scpanl-root .sc-log-head{display:flex;align-items:center;gap:var(--sc-sp-2);padding:6px var(--sc-gap-item);',
        'font-size:10.5px;text-transform:uppercase;letter-spacing:var(--sc-ls-wide);color:var(--sc-faint);',
        'position:sticky;top:0;background:var(--sc-bg2);border-bottom:1px solid var(--sc-border);z-index:1;}',
        '#scpanl-root .sc-log-row{display:flex;gap:var(--sc-sp-2);padding:3px var(--sc-gap-item);',
        'font-size:var(--sc-fs-xs);font-family:ui-monospace,Menlo,Consolas,monospace;}',
        '#scpanl-root .sc-log-t{color:var(--sc-faint);flex:none;}',
        '#scpanl-root .sc-log-lv{flex:none;width:40px;text-transform:uppercase;font-size:10px;}',
        '#scpanl-root .sc-log-info .sc-log-lv{color:var(--sc-muted);}',
        '#scpanl-root .sc-log-warn .sc-log-lv{color:var(--sc-warn);}',
        '#scpanl-root .sc-log-error .sc-log-lv{color:var(--sc-err);}',
        '#scpanl-root .sc-log-msg{color:var(--sc-text);word-break:break-word;}',
        /* 边界态：加载（空态走 .sc-mem-empty，见业务层 —— 曾并存两套空态组件，.sc-empty 零使用已删） */
        '#scpanl-root .sc-loading{position:relative;pointer-events:none;}',
        '#scpanl-root .sc-loading::after{content:"";position:absolute;inset:0;border-radius:inherit;',
        'background:linear-gradient(90deg,transparent,var(--sc-hover),transparent);background-size:200% 100%;',
        'animation:sc-shimmer 1.2s linear infinite;}',
        '@keyframes sc-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',

        /* ══════════ ⑤ 业务层 ══════════ */
        /* 记忆卡：自适应栅格 + hero 跨列 */
        '#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{display:grid;',
        'grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:var(--sc-gap-item);',
        'margin:var(--sc-sp-2) 0 var(--sc-gap-group);}',
        '#scpanl-root .sc-mem-stat{padding:var(--sc-pad-card);border:1px solid var(--sc-border);',
        'border-radius:var(--sc-r-md);background:var(--sc-bg1);',
        'transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .sc-mem-stat:hover{border-color:var(--sc-border-strong);background:var(--sc-bg2);}',
        '#scpanl-root .sc-mem-stat-label{font-size:var(--sc-fs-xs);color:var(--sc-muted);',
        'line-height:var(--sc-lh-tight);margin-bottom:var(--sc-sp-1);}',
        '#scpanl-root .sc-mem-stat-value{font-size:var(--sc-fs-lg);font-weight:var(--sc-fw-bold);',
        'line-height:var(--sc-lh-tight);color:var(--sc-text);font-variant-numeric:tabular-nums;}',
        '#scpanl-root .sc-mem-stat-sub{font-size:var(--sc-fs-xs);color:var(--sc-faint);',
        'line-height:var(--sc-lh-normal);margin-top:2px;}',
        '#scpanl-root .sc-mem-stat.hero{grid-column:span 2;padding:var(--sc-gap-item) var(--sc-sp-4);',
        'border-color:var(--sc-accent-bd);background:var(--sc-accent-bg);}',
        '#scpanl-root .sc-mem-stat.hero .sc-mem-stat-value{font-size:var(--sc-fs-2xl);}',
        '#scpanl-root .sc-mem-stat.hero .sc-mem-stat-label{font-size:var(--sc-fs-sm);}',
        '#scpanl-root .sc-mem-group-title{font-size:var(--sc-fs-sm);font-weight:var(--sc-fw-bold);',
        'color:var(--sc-accent);letter-spacing:.03em;margin:var(--sc-gap-group) 0 var(--sc-gap-item);',
        'padding-bottom:var(--sc-sp-1);border-bottom:1px solid var(--sc-border);}',
        '#scpanl-root .sc-mem-group-title:first-child{margin-top:var(--sc-sp-2);}',
        '#scpanl-root .sc-mem-empty{margin:0 0 var(--sc-gap-item);padding:var(--sc-pad-card);',
        'font-size:var(--sc-fs-xs);line-height:var(--sc-lh-normal);color:var(--sc-faint);',
        'border:1px dashed var(--sc-border);border-radius:var(--sc-r-md);background:var(--sc-bg2);}',
        '#scpanl-root .sc-mem-sub{font-size:var(--sc-fs-sm);color:var(--sc-muted);',
        'line-height:var(--sc-lh-normal);margin:2px 0 0;padding-bottom:var(--sc-sp-2);}',
        '#scpanl-root .sc-mem-sub.muted{color:var(--sc-muted);}',
        '#scpanl-root .sc-spark{display:block;margin-top:var(--sc-sp-2);}',
        '#scpanl-root .sc-spark path{fill:none;stroke:var(--sc-accent);stroke-width:1.5;stroke-linejoin:round;}',
        '#scpanl-root .sc-spark circle{fill:var(--sc-accent);}',
        '#scpanl-root .sc-spark .base{stroke:var(--sc-border);stroke-width:1;}',
        '#scpanl-root .sc-danger{color:var(--sc-err);font-weight:var(--sc-fw-semibold);}',
        /* 指针卡（可点击跳转） */
        '#scpanl-root .sc-pointer-list{display:flex;flex-direction:column;gap:var(--sc-gap-row);}',
        '#scpanl-root .sc-pointer{display:flex;align-items:center;gap:var(--sc-gap-item);',
        'padding:10px var(--sc-gap-item);border:1px solid var(--sc-border);border-radius:var(--sc-r-md);',
        'background:var(--sc-bg1);cursor:pointer;',
        'transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease),',
        'transform var(--sc-t-fast) var(--sc-ease);}',
        '#scpanl-root .sc-pointer:hover{background:var(--sc-bg2);border-color:var(--sc-accent-bd);}',
        '#scpanl-root .sc-pointer:active{transform:translateY(1px);}',
        '#scpanl-root .sc-pointer-main{flex:1;min-width:0;}',
        '#scpanl-root .sc-pointer-head{display:flex;align-items:baseline;gap:var(--sc-sp-2);}',
        '#scpanl-root .sc-pointer-title{font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);color:var(--sc-text);}',
        '#scpanl-root .sc-pointer-meta{flex:none;font-size:var(--sc-fs-xs);color:var(--sc-faint);}',
        '#scpanl-root .sc-pointer-summary{margin-top:3px;font-size:var(--sc-fs-sm);color:var(--sc-muted);',
        'line-height:var(--sc-lh-normal);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;',
        '-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
        '#scpanl-root .sc-pointer-go{flex:none;color:var(--sc-accent);font-size:var(--sc-fs-md);',
        'font-weight:var(--sc-fw-bold);}',
        /* 索引行 / 笔记 chip */
        '#scpanl-root .sc-idx-list{display:flex;flex-direction:column;gap:1px;margin-bottom:var(--sc-gap-row);}',
        '#scpanl-root .sc-idx-row{display:flex;gap:var(--sc-sp-2);align-items:baseline;padding:4px var(--sc-sp-1);',
        'cursor:pointer;border-radius:var(--sc-r-sm);transition:background var(--sc-t-fast) var(--sc-ease);}',
        '#scpanl-root .sc-idx-row:hover{background:var(--sc-hover);}',
        '#scpanl-root .sc-idx-tag{flex:none;font-size:10px;font-weight:var(--sc-fw-bold);padding:0 7px;',
        'border-radius:var(--sc-r-pill);line-height:18px;background:var(--sc-accent-bg);color:var(--sc-accent);}',
        /* 标签色相：数据驱动的颜色改为「只传一个色相变量」，配色算法留在 CSS（旧实现在 JS 里拼整条 hsl + color-mix）。
           仅 .hued 变体着色（backrefs 处的标签仍用品牌色，不受影响）。 */
        '#scpanl-root .sc-idx-tag.hued{color:hsl(var(--sc-tag-h,254),72%,58%);',
        'background:color-mix(in srgb,hsl(var(--sc-tag-h,254),85%,60%) 15%,transparent);}',
        '#scpanl-root .sc-idx-subject{flex:1;min-width:0;font-size:var(--sc-fs-sm);color:var(--sc-text);',
        'line-height:var(--sc-lh-normal);}',
        '#scpanl-root .sc-idx-pointer{flex:none;font-size:var(--sc-fs-xs);color:var(--sc-muted);',
        'cursor:pointer;margin-left:var(--sc-sp-2);}',
        '#scpanl-root .sc-idx-pointer:hover{color:var(--sc-accent);text-decoration:underline;}',
        '#scpanl-root .sc-idx-more{font-size:var(--sc-fs-sm);color:var(--sc-accent);cursor:pointer;',
        'padding:5px 2px;border:none;background:none;text-align:left;}',
        '#scpanl-root .sc-idx-more:hover{text-decoration:underline;}',
        '#scpanl-root .sc-notes-list{display:flex;flex-direction:column;gap:6px;margin-top:var(--sc-sp-1);}',
        '#scpanl-root .sc-note-chip{display:flex;align-items:center;gap:6px;border:1px solid var(--sc-border);',
        'border-radius:var(--sc-r-sm);padding:5px 9px;cursor:pointer;background:var(--sc-bg1);',
        'font-size:var(--sc-fs-sm);color:var(--sc-text);',
        'transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .sc-note-chip:hover{border-color:var(--sc-accent-bd);background:var(--sc-bg2);}',
        '#scpanl-root .sc-note-chip .sc-tag{background:var(--sc-bg3);color:var(--sc-faint);border:none;',
        'font-weight:var(--sc-fw-semibold);}',
        '#scpanl-root .sc-sec-arrow{display:inline-block;width:12px;flex:none;color:var(--sc-faint);}',
        /* 深度睡眠 */
        '#scpanl-root .sc-ds-badges{display:flex;flex-wrap:wrap;gap:var(--sc-gap-row);margin:var(--sc-sp-2) 0;}',
        '#scpanl-root .sc-ds-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;',
        'border-radius:var(--sc-r-pill);font-size:var(--sc-fs-sm);font-weight:var(--sc-fw-semibold);',
        'line-height:var(--sc-lh-normal);background:var(--sc-bg2);border:1px solid var(--sc-border);',
        'color:var(--sc-text);}',
        '#scpanl-root .sc-ds-badge .dot{width:8px;height:8px;border-radius:50%;flex:none;}',
        '#scpanl-root .sc-ds-badge.running{color:var(--sc-ok);background:var(--sc-ok-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.running .dot{background:var(--sc-ok);}',
        '#scpanl-root .sc-ds-badge.ended{color:var(--sc-muted);}',
        '#scpanl-root .sc-ds-badge.ended .dot{background:var(--sc-faint);}',
        '#scpanl-root .sc-ds-badge.probing{color:var(--sc-info);background:var(--sc-info-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.probing .dot{background:var(--sc-info);animation:scblink 1s infinite;}',
        '#scpanl-root .sc-ds-badge.suspect{color:var(--sc-info);background:var(--sc-info-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.suspect .dot{background:var(--sc-info);}',
        '#scpanl-root .sc-ds-badge.stalled{color:var(--sc-err);background:var(--sc-err-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.stalled .dot{background:var(--sc-err);}',
        '@keyframes scblink{50%{opacity:.3;}}',
        '#scpanl-root .sc-ds-timing{display:flex;flex-wrap:wrap;gap:var(--sc-sp-5);margin:var(--sc-gap-row) 0;}',
        '#scpanl-root .sc-ds-stat{display:flex;flex-direction:column;gap:2px;}',
        '#scpanl-root .sc-ds-stat .k{font-size:var(--sc-fs-xs);color:var(--sc-faint);}',
        '#scpanl-root .sc-ds-stat .v{font-size:var(--sc-fs-md);font-weight:var(--sc-fw-bold);color:var(--sc-text);',
        'font-variant-numeric:tabular-nums;}',
        '#scpanl-root .sc-ds-sessions{display:flex;flex-direction:column;gap:var(--sc-sp-1);margin:var(--sc-gap-row) 0;}',
        '#scpanl-root .sc-ds-session{display:flex;align-items:center;gap:var(--sc-gap-row);',
        'padding:var(--sc-sp-2) var(--sc-sp-3);border:1px solid var(--sc-border);border-radius:var(--sc-r-md);',
        'background:var(--sc-bg1);}',
        '#scpanl-root .sc-ds-dot{width:var(--sc-sp-2);height:var(--sc-sp-2);border-radius:50%;flex:none;}',
        '#scpanl-root .sc-ds-dot.running{background:var(--sc-ok);}',
        '#scpanl-root .sc-ds-dot.ended{background:var(--sc-faint);}',
        '#scpanl-root .sc-ds-dot.probing{background:var(--sc-info);animation:scblink 1s infinite;}',
        '#scpanl-root .sc-ds-dot.suspect{background:var(--sc-info);}',
        '#scpanl-root .sc-ds-dot.stalled{background:var(--sc-err);}',
        '#scpanl-root .sc-ds-session-main{flex:1;min-width:0;}',
        '#scpanl-root .sc-ds-sid{font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);color:var(--sc-text);',
        'font-family:ui-monospace,Menlo,Consolas,monospace;}',
        '#scpanl-root .sc-ds-session-sub{font-size:var(--sc-fs-xs);line-height:var(--sc-lh-normal);',
        'color:var(--sc-muted);margin-top:2px;}',
        '#scpanl-root .sc-ds-alert{margin:var(--sc-gap-row) 0;padding:9px var(--sc-gap-item);',
        'border-radius:var(--sc-r-md);background:var(--sc-err-bg);',
        'border:1px solid color-mix(in srgb,var(--sc-err) 45%,transparent);color:var(--sc-err);',
        'font-size:var(--sc-fs-sm);}',
        '#scpanl-root .sc-ds-ctl{display:flex;gap:var(--sc-gap-row);margin:var(--sc-gap-row) 0;flex-wrap:wrap;}',
        /* 向量 / 模型配置（早期 sc-vec-row/cell/label/... 一套已随向量区改版废弃，零使用已删；
           现向量区走 .sc-mem-grid + .setting-item，与记忆板块同构） */
        '#scpanl-root .sc-prov-btns{display:flex;flex-wrap:wrap;gap:6px;flex:none;max-width:420px;',
        'justify-content:flex-end;}',
        '#scpanl-root .sc-prov-btns .sc-btn{min-height:26px;padding:3px 10px;font-size:var(--sc-fs-xs);',
        'border-color:transparent;background:transparent;color:var(--sc-muted);}',
        '#scpanl-root .sc-prov-btns .sc-btn:hover{color:var(--sc-text);background:var(--sc-hover);}',
        '#scpanl-root .sc-prov-btns .sc-btn.on{color:var(--sc-accent);border-color:var(--sc-accent-bd);',
        'background:var(--sc-accent-bg);}',
        '#scpanl-root .sc-vec-actions{display:flex;gap:var(--sc-gap-row);justify-content:flex-end;',
        'align-items:center;margin:var(--sc-sp-1) 0;}',
        /* 根目录 */
        '#scpanl-root .sc-rootitem{display:flex;align-items:center;gap:var(--sc-gap-row);}',
        '#scpanl-root .sc-rootitem.active .sc-rootname{color:var(--sc-accent);font-weight:var(--sc-fw-semibold);}',
        '#scpanl-root .sc-dot{width:8px;height:8px;border-radius:50%;background:var(--sc-faint);flex:none;}',
        '#scpanl-root .sc-dot.on{background:var(--sc-accent);}',
        '#scpanl-root .sc-rootname{font-size:var(--sc-fs-md);flex:none;max-width:180px;overflow:hidden;',
        'text-overflow:ellipsis;white-space:nowrap;}',
        '#scpanl-root .sc-rootpath{flex:1;font-size:var(--sc-fs-xs);color:var(--sc-faint);overflow:hidden;',
        'text-overflow:ellipsis;white-space:nowrap;}',
        /* 画像 / 滑块 / 区间 */
        '#scpanl-root .sc-persona-slider{display:flex;width:100%;max-width:var(--sc-w-control);height:32px;',
        'border:1px solid var(--sc-border);border-radius:var(--sc-r-md);overflow:hidden;flex:none;',
        'margin:var(--sc-sp-1) 0;background:var(--sc-bg2);}',
        '#scpanl-root .sc-persona-cell{flex:1 1 0;display:flex;align-items:center;justify-content:center;',
        'font-size:var(--sc-fs-xs);color:var(--sc-muted);cursor:pointer;user-select:none;',
        'border-right:1px solid var(--sc-border);white-space:nowrap;padding:0 2px;',
        'transition:background var(--sc-t-base) var(--sc-ease),color var(--sc-t-base) var(--sc-ease),',
        'transform var(--sc-t-fast) var(--sc-ease);}',
        '#scpanl-root .sc-persona-cell:last-child{border-right:none;}',
        '#scpanl-root .sc-persona-cell.active{background:var(--sc-accent);color:#fff;font-weight:var(--sc-fw-semibold);}',
        '#scpanl-root .sc-persona-cell:not(.active):hover{background:var(--sc-hover);color:var(--sc-text);}',
        '#scpanl-root .sc-persona-cell:active{transform:translateY(1px);}',
        'button.sc-persona-cell{appearance:none;-webkit-appearance:none;background:none;border:0;',
        'border-right:1px solid var(--sc-border);font:inherit;}',
        'button.sc-persona-cell:last-child{border-right:none;}',
        'button.sc-persona-cell.active{background:var(--sc-accent);color:#fff;}',
        '#scpanl-root .sc-range-wrap{display:flex;flex-direction:column;gap:var(--sc-sp-1);align-items:flex-start;',
        'flex:none;min-width:var(--sc-w-control);margin:var(--sc-sp-1) 0;}',
        '#scpanl-root .sc-range-label{font-size:var(--sc-fs-xs);color:var(--sc-text);font-weight:var(--sc-fw-semibold);}',
        '#scpanl-root .sc-range-wrap input[type=range]{width:100%;max-width:var(--sc-w-control);',
        'accent-color:var(--sc-accent);}',
        /* 成分 / 小盒 / 笔记体 / 折叠体 */
        '#scpanl-root .sc-comp{margin:var(--sc-gap-row) 0 var(--sc-sp-1);}',
        '#scpanl-root .sc-comp-row{display:grid;grid-template-columns:1fr auto;gap:var(--sc-gap-row);',
        'align-items:baseline;margin:3px 0;padding:2px 0;}',
        '#scpanl-root .sc-comp-k{font-size:var(--sc-fs-sm);color:var(--sc-text);white-space:nowrap;',
        'overflow:hidden;text-overflow:ellipsis;}',
        '#scpanl-root .sc-comp-v{font-size:var(--sc-fs-xs);color:var(--sc-faint);font-variant-numeric:tabular-nums;',
        'text-align:right;}',
        '#scpanl-root .sc-comp-row:hover .sc-comp-k{color:var(--sc-accent);}',
        '#scpanl-root .sc-box{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);',
        'padding:var(--sc-sp-1) var(--sc-sp-2);margin-bottom:var(--sc-sp-1);background:var(--sc-bg1);}',
        '#scpanl-root .sc-card-body{margin:0;padding:var(--sc-pad-card);font-family:ui-monospace,Menlo,Consolas,monospace;',
        'font-size:var(--sc-fs-xs);line-height:var(--sc-lh-loose);color:var(--sc-text);white-space:pre-wrap;',
        'word-break:break-word;max-height:300px;overflow-y:auto;background:var(--sc-bg1);',
        'border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);}',
        '#scpanl-root .sc-card-head{display:flex;align-items:baseline;gap:var(--sc-sp-1);cursor:pointer;',
        'padding:3px var(--sc-sp-1);border-radius:var(--sc-r-sm);',
        'padding-left:calc(var(--sc-sp-2) + var(--sc-indent,0));}',
        '#scpanl-root .sc-card-head:hover{background:var(--sc-hover);}',
        '#scpanl-root .sc-edit-sec{display:inline-block;margin:var(--sc-sp-1) 0 var(--sc-sp-1) ',
        'calc(var(--sc-sp-2) + var(--sc-indent,0));padding:var(--sc-sp-1) var(--sc-sp-2);',
        'font-size:var(--sc-fs-xs);color:var(--sc-accent);cursor:pointer;}',
        '#scpanl-root .sc-more-btn{display:block;width:100%;margin:var(--sc-gap-item) 0 var(--sc-sp-1);',
        'padding:var(--sc-sp-1) var(--sc-sp-3);border:1px solid var(--sc-border);border-radius:var(--sc-r-sm);',
        'color:var(--sc-muted);cursor:pointer;font:inherit;font-size:var(--sc-fs-xs);text-align:left;background:none;}',
        '#scpanl-root .sc-more-btn:hover{background:var(--sc-hover);color:var(--sc-text);}',
        '#scpanl-root .sc-more-body{display:flex;flex-direction:column;}',
        '#scpanl-root .sc-search-bar{display:flex;align-items:center;gap:var(--sc-gap-row);',
        'margin:var(--sc-sp-2) 0 var(--sc-sp-1);}',
        '#scpanl-root .sc-search-count{font-size:var(--sc-fs-xs);color:var(--sc-faint);}',
        '#scpanl-root .sc-recent{display:flex;flex-direction:column;gap:var(--sc-sp-1);margin:var(--sc-sp-1) 0;}',
        '#scpanl-root .sc-recent-row{display:flex;gap:var(--sc-gap-row);font-size:var(--sc-fs-xs);',
        'line-height:var(--sc-lh-normal);}',
        '#scpanl-root .sc-recent-at{color:var(--sc-faint);flex:none;min-width:calc(var(--sc-sp-6) * 3 + var(--sc-sp-5));}',
        '#scpanl-root .sc-recent-msg{color:var(--sc-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        /* 布局原语（供 JS 去内联样式） */
        '#scpanl-root .sc-spacer{margin-left:auto;}',
        '#scpanl-root .sc-row{display:flex;align-items:center;gap:var(--sc-sp-2);flex:none;}',
        '#scpanl-root .sc-col{display:flex;flex-direction:column;gap:var(--sc-sp-2);}',
        '#scpanl-root .sc-row-gap{display:flex;gap:var(--sc-sp-1);flex:none;align-items:center;}',
        '#scpanl-root .sc-col-end{display:flex;flex-direction:column;gap:var(--sc-sp-1);flex:none;align-items:flex-end;}',
        '#scpanl-root .sc-toolbar{display:flex;gap:var(--sc-gap-row);margin-top:var(--sc-sp-1);flex-wrap:wrap;}',
        '#scpanl-root .sc-num-wrap{display:flex;align-items:center;gap:var(--sc-sp-1);flex:none;}',
        '#scpanl-root .sc-num-wrap .sc-input{width:calc(var(--sc-sp-6) * 3);}',
        '#scpanl-root .sc-w-sm{width:var(--sc-w-sm);}#scpanl-root .sc-w-md{width:var(--sc-w-md);}',
        '#scpanl-root .sc-w-lg{width:var(--sc-w-lg);}#scpanl-root .sc-w-xl{width:var(--sc-w-xl);max-width:var(--sc-w-xl);}',
        '#scpanl-root .sc-max-xl{max-width:var(--sc-w-xl);}',
        '#scpanl-root .sc-on{color:var(--sc-accent);}',
        '#scpanl-root .sc-inline-note{margin:var(--sc-sp-1) 0 var(--sc-pad-card);font-size:var(--sc-fs-xs);',
        'color:var(--sc-accent);}',
        '#scpanl-root .sc-ta{width:100%;min-height:calc(var(--sc-sp-6) * 3 + var(--sc-sp-5));',
        'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:var(--sc-fs-xs);}',
        /* YAML 编辑区（id 选择器需两个 id 提升权重，压过 textarea 通用规则） */
        '#scpanl-root #sc-yaml,#scpanl-root .sc-yaml{width:100%;height:260px;padding:var(--sc-sp-2) var(--sc-gap-item);',
        'border-radius:var(--sc-r-md);border:1px solid var(--sc-border);resize:vertical;',
        'background:var(--sc-bg2);color:var(--sc-text);font-family:ui-monospace,Menlo,Consolas,monospace;',
        'font-size:var(--sc-fs-xs);line-height:var(--sc-lh-loose);outline:none;}',
        '#scpanl-root #sc-yaml:focus,#scpanl-root .sc-yaml:focus{border-color:var(--sc-accent);}',
        /* 侧栏入口 / 兜底悬浮按钮 */
        '.sc-trigger{box-sizing:border-box;cursor:pointer;width:calc(100% + 4px);height:42px;',
        'color:var(--dsw-alias-label-primary,var(--sc-text));background:0 0;border:none;',
        'border-radius:var(--sc-r-md);flex:none;align-items:center;gap:var(--sc-sp-2);',
        'margin:var(--sc-sp-1) -2px;padding:0 var(--sc-sp-2);font-family:inherit;font-size:var(--sc-fs-md);',
        'line-height:22px;display:flex;overflow:hidden;user-select:none;',
        'transition:background var(--sc-t-base) var(--sc-ease);}',
        '.sc-trigger:hover{background:var(--sc-hover);}',
        '.sc-trigger-label{white-space:nowrap;overflow:hidden;}',
        '.sc-trigger.sc-rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;',
        'margin:var(--sc-gap-row) 0 10px;padding:0;}',
        '.sc-trigger.sc-rail .sc-trigger-label{display:none;}',
        '#scpanl-root .sc-ic-lg{width:24px;height:24px;display:block;margin:var(--sc-gap-row) auto;pointer-events:none;}',
        '#scpanl-root .sc-ic-sm{width:var(--sc-sp-4);height:var(--sc-sp-4);display:block;pointer-events:none;}',
        '.sc-fab{position:fixed;left:var(--sc-sp-4);bottom:var(--sc-sp-4);z-index:9800;width:40px;height:40px;',
        'border-radius:50%;border:none;cursor:pointer;font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);',
        'color:#fff;background:var(--sc-accent);box-shadow:var(--sc-shadow-2);}',
        /* 旧 footer 类名兼容（DSH 宿主演进后多为死代码，保留防回退） */
        '.hHd-Xa_footerActions{padding-left:var(--sc-sp-2);margin:0;}',
        '.hHd-Xa_settingsArea{margin:0;}',

        /* ══════════ ⑥ 适配层 ══════════ */
        /* 密度：紧凑（隐藏描述、压缩行高与留白） */
        '#scpanl-root .sc-density-compact .setting-item,#scpanl-modal.sc-density-compact .setting-item{padding:var(--sc-sp-1) 0;}',
        '#scpanl-root .sc-density-compact .setting-item-desc,#scpanl-modal.sc-density-compact .setting-item-desc{display:none;}',
        '#scpanl-root .sc-density-compact .sc-fold-head,#scpanl-modal.sc-density-compact .sc-fold-head{padding:5px var(--sc-gap-item);}',
        '#scpanl-root .sc-density-compact .sc-view,#scpanl-modal.sc-density-compact .sc-view{',
        'padding:var(--sc-sp-4) var(--sc-sp-5) var(--sc-sp-6);}',
        '#scpanl-root .sc-density-compact .sc-mem-stat,#scpanl-modal.sc-density-compact .sc-mem-stat{',
        'padding:var(--sc-sp-2) var(--sc-sp-3);}',
        /* 大屏 ≥1440：放宽导航与阅读宽度 */
        '@media (min-width:1440px){',
        '#scpanl-modal{--sc-nav-w:232px;}',
        '#scpanl-root .sc-view{padding:var(--sc-sp-6) 40px var(--sc-sp-7);max-width:1120px;}',
        '}',
        /* 中屏 ≤1180：导航收窄、描述让位 */
        '@media (max-width:1180px){',
        '#scpanl-modal{--sc-nav-w:184px;}',
        '#scpanl-root .sc-view{padding:var(--sc-sp-5) var(--sc-sp-5) var(--sc-sp-6);}',
        '#scpanl-root .setting-item-desc{max-width:52ch;}',
        '}',
        /* 平板 ≤900：表单行转纵向，控件占满整行 */
        '@media (max-width:900px){',
        '#scpanl-modal{--sc-nav-w:160px !important;}',
        '#scpanl-root .sc-nav{padding:var(--sc-sp-2) var(--sc-sp-1);}',
        '#scpanl-root .sc-nav-item{padding:8px var(--sc-sp-2);gap:var(--sc-sp-1);}',
        '#scpanl-root .sc-nav-item svg{width:15px;height:15px;}',
        '#scpanl-root .sc-view{padding:var(--sc-sp-4) var(--sc-sp-4) var(--sc-sp-6);}',
        '#scpanl-root .setting-item:not(.sc-rootitem){flex-direction:column;align-items:stretch;gap:var(--sc-sp-2);}',
        '#scpanl-root .setting-item-control{width:100%;justify-content:flex-start;flex-wrap:wrap;}',
        '#scpanl-root .sc-mem-stat.hero{grid-column:span 2;}',
        '}',
        /* 移动 ≤720：导航转顶部横向 tab，模态全屏，出现关闭按钮（此前移动端无法关闭面板） */
        '@media (max-width:720px){',
        '#scpanl-mask{padding:0;}',
        '#scpanl-modal{--sc-nav-w:100% !important;width:100vw;height:100vh;max-width:100vw;max-height:100vh;',
        'border-radius:0;border:none;flex-direction:column;}',
        '#scpanl-root .sc-nav{width:100% !important;flex:none;flex-direction:row;overflow-x:auto;overflow-y:hidden;',
        'border-right:none;border-bottom:1px solid var(--sc-border);padding:var(--sc-sp-2);gap:var(--sc-sp-1);',
        'align-items:center;}',
        '#scpanl-root .sc-nav-title,#scpanl-root .sc-nav-group,#scpanl-root .sc-nav-spacer{display:none !important;}',
        '#scpanl-root .sc-nav-item{flex:none;white-space:nowrap;border-radius:var(--sc-r-pill);',
        'padding:6px var(--sc-sp-3);}',
        '#scpanl-root .sc-nav-item.active::before{display:none;}',
        '#scpanl-root .sc-nav-close{display:inline-flex;align-items:center;justify-content:center;flex:none;',
        'position:sticky;right:0;margin-left:auto;width:32px;height:32px;border-radius:50%;',
        'border:1px solid var(--sc-border);background:var(--sc-bg1);color:var(--sc-text);',
        'cursor:pointer;font-size:17px;line-height:1;appearance:none;-webkit-appearance:none;padding:0;}',
        '#scpanl-root .sc-view{padding:var(--sc-sp-4) var(--sc-sp-3) var(--sc-sp-6);}',
        '#scpanl-root .sc-h1{font-size:var(--sc-fs-lg);}',
        '#scpanl-root .sc-desc{font-size:var(--sc-fs-xs);}',
        '#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));}',
        '#scpanl-root .sc-mem-stat.hero{grid-column:span 1;}',
        '#scpanl-root .sc-kv{grid-template-columns:1fr;gap:0;}',
        '#scpanl-root .sc-kv-k{padding-top:var(--sc-sp-1);}',
        '#scpanl-root .sc-ds-timing{gap:var(--sc-sp-4);}',
        '#scpanl-root .sc-statusbar{padding:var(--sc-sp-2) var(--sc-sp-4);}',
        '#scpanl-root textarea{font-size:13px;}',
        '}',
        /* 小屏 ≤480：双列卡片，压缩按钮内距 */
        '@media (max-width:480px){',
        '#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{grid-template-columns:1fr 1fr;}',
        '#scpanl-root .sc-mem-stat.hero{grid-column:span 2;}',
        '#scpanl-root .sc-btn{padding:5px 10px;}',
        '#scpanl-root .sc-ds-badges{gap:6px;}',
        '#scpanl-root .sc-prov-btns{max-width:100%;justify-content:flex-start;}',
        '}',
        /* 触摸设备：加大点击热区 */
        '@media (hover:none){',
        '#scpanl-root .sc-nav-item{padding:10px var(--sc-sp-3);}',
        '#scpanl-root .sc-btn{min-height:36px;padding:8px 14px;}',
        '#scpanl-root .sc-fold-head{padding:12px var(--sc-gap-item);}',
        '#scpanl-root .sc-note-chip,#scpanl-root .sc-pointer{padding:12px;}',
        '}',
        /* 尊重系统「减少动效」 */
        '@media (prefers-reduced-motion:reduce){',
        '#scpanl-root *,#scpanl-root *::before,#scpanl-root *::after{',
        'transition-duration:.01ms !important;animation-duration:.01ms !important;}',
        '}',
      ].join('');

      /* ================= 基础设施层（2026-09-12 UI 重构） =================
       * 目的：A1 状态管理 / A2 组件复用 / C2 日志 / C3 错误定位 / 自由度参数化。
       * 约定：ES5（与全文一致），不引入框架，不改动既有函数调用签名。
       */

      /* ---- 1. Bus：事件总线（解耦 UI 与副作用） ---- */
      var Bus = (function () {
        var m = {};
        return {
          on: function (k, fn) {
            (m[k] = m[k] || []).push(fn);
            return function () { m[k] = (m[k] || []).filter(function (f) { return f !== fn; }); };
          },
          emit: function (k, p) {
            (m[k] || []).slice().forEach(function (f) { try { f(p); } catch (e) { /* 监听者异常不得影响主干 */ } });
          }
        };
      })();

      /* ---- 2. Store：单一数据源 + 订阅（替代散落的 refs 状态） ---- */
      var Store = (function () {
        var s = { view: 'file', logs: [], progress: {}, metrics: {}, errors: [] };
        var subs = [];
        return {
          get: function (k) { return k === undefined ? s : s[k]; },
          set: function (k, v) {
            var old = s[k];
            if (old === v) return v;
            s[k] = v;
            subs.forEach(function (f) { try { f(k, v, old); } catch (e) { } });
            Bus.emit('store:' + k, v);
            return v;
          },
          patch: function (k, o) {
            var base = (typeof s[k] === 'object' && s[k]) ? s[k] : {};
            var next = Object.assign({}, base, o || {});
            return Store.set(k, next);
          },
          sub: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }
        };
      })();

      /* ---- 3. Log：分级日志（可追溯，替代"后一条覆盖前一条"的状态栏） ---- */
      var Log = (function () {
        var MAX = 500;
        function add(level, msg, ctx) {
          var e = { t: Date.now(), level: level || 'info', msg: String(msg), ctx: ctx || null };
          var a = (Store.get('logs') || []).concat([e]);
          if (a.length > MAX) a = a.slice(a.length - MAX);
          Store.set('logs', a);
          Bus.emit('log', e);
          // ⚠ 不得回调 status()：status → Log.add → status 会无限递归（实测栈溢出）。
          //   只更新状态栏文本（不写日志），由 status()/fail() 统一负责写日志。
          if (level === 'error') setStatusText(msg, 'error');
          return e;
        }
        return {
          add: add,
          info: function (m, c) { return add('info', m, c); },
          warn: function (m, c) { return add('warn', m, c); },
          error: function (m, c) { return add('error', m, c); },
          clear: function () { Store.set('logs', []); Bus.emit('log', null); }
        };
      })();

      /* ---- 4. Prog：执行进度（C1） ---- */
      var Prog = {
        start: function (id, label) {
          Store.patch('progress', Object.assign({}, Store.get('progress'), make(id, { id: id, label: label || '', pct: 0, note: '进行中', on: true })));
          Bus.emit('progress', Store.get('progress'));
        },
        set: function (id, pct, note) {
          var cur = (Store.get('progress') || {})[id]; if (!cur) return;
          Store.patch('progress', Object.assign({}, Store.get('progress'), make(id, Object.assign({}, cur, { pct: Math.max(0, Math.min(100, pct || 0)), note: note || cur.note }))));
          Bus.emit('progress', Store.get('progress'));
        },
        done: function (id, ok, msg) {
          var cur = (Store.get('progress') || {})[id]; if (!cur) return;
          var p = Object.assign({}, Store.get('progress'));
          p[id] = Object.assign({}, cur, { on: false, pct: 100, note: msg || (ok ? '完成' : '失败'), ok: ok !== false });
          Store.set('progress', p); Bus.emit('progress', p);
          var self = this;
          setTimeout(function () {
            var q = Object.assign({}, Store.get('progress')); delete q[id];
            Store.set('progress', q); Bus.emit('progress', q);
          }, ok === false ? 6000 : 1800);
        }
      };
      function make(k, v) { var o = {}; o[k] = v; return o; }

      /* ---- 5. Cfg：UI 参数化配置（自由度，localStorage 持久化） ---- */
      var Cfg = (function () {
        var KEY = 'shoucang.ui.cfg.v1';
        var DEF = {
          density: 'comfortable',      // comfortable | compact
          navWidth: 200,               // 左导航宽度 px
          autoRefresh: true,           // 打开面板/写操作后自动刷新
          refreshMs: 60000,            // 轮询间隔（0=关闭）
          showLogs: true,              // 状态栏上方是否显示日志面板
          logLevel: 'info',            // info | warn | error
          overviewMode: true,          // 概览—详情分层（列表默认折叠详情）
          maxRows: 50                  // 长列表默认折叠阈值
        };
        var cache = null;
        function load() {
          if (cache) return cache;
          cache = Object.assign({}, DEF);
          try {
            var raw = localStorage.getItem(KEY);
            if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') cache = Object.assign(cache, o); }
          } catch (e) { }
          return cache;
        }
        return {
          get: function (k, d) { var c = load(); return k === undefined ? c : (c[k] !== undefined ? c[k] : d); },
          set: function (k, v) { var c = load(); c[k] = v; cache = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { } Bus.emit('cfg:' + k, v); return v; },
          reset: function () { cache = Object.assign({}, DEF); try { localStorage.removeItem(KEY); } catch (e) { } Bus.emit('cfg', cache); return cache; },
          defs: function () { return Object.assign({}, DEF); }
        };
      })();

      /* ---- 5b. Fold：展开/收起的**唯一数据源**（2026-09-12 重构） ----
       * 背景：此前 4 套折叠实现各自存状态——`UI.collapsible` 存 DOM class、`scheduleFold` 存闭包变量、
       *       高级阈值存局部变量、小节树**从 DOM 反推**（`!body.classList.contains('sc-hidden')`）。
       * 后果：① 状态与渲染互相依赖，任何重绘或编程改动即失同步（笔记小节保存后整棵树塌回）；
       *       ② 嵌套项相互影响（父节点 open 由子节点 DOM 参与计算）；
       *       ③ 无法表达「禁用 / 空数据 / 异步中」三种边界。
       * 约定：**DOM 只反映状态，绝不参与状态判定**；key 稳定 ⇒ 可预置、可复位、可按前缀清空防残留。 */
      var Fold = (function () {
        var m = {};
        var hasOwn = Object.prototype.hasOwnProperty;
        function norm(k) { return String(k === undefined || k === null ? '' : k); }
        return {
          /* 读：未登记 ⇒ 用调用方给的默认值（默认值不入库，各处可各自定义缺省） */
          get: function (key, dflt) {
            var s = norm(key);
            return hasOwn.call(m, s) ? m[s] : !!dflt;
          },
          /* 写：同值不广播（避免 paint↔set 回环） */
          set: function (key, v) {
            var s = norm(key), next = !!v;
            if (hasOwn.call(m, s) && m[s] === next) return next;
            m[s] = next;
            Bus.emit('fold', { key: s, open: next });
            return next;
          },
          toggle: function (key, dflt) { return Fold.set(key, !Fold.get(key, dflt)); },
          /* 清空：按前缀或全清。切视图 / 换数据源时调用，防止旧 key 的状态残留到新数据上。 */
          clear: function (prefix) {
            var p = (prefix === undefined || prefix === null) ? null : String(prefix);
            var hit = Object.keys(m).filter(function (s) { return p === null || s.indexOf(p) === 0; });
            hit.forEach(function (s) { delete m[s]; });
            if (hit.length) Bus.emit('fold:clear', { prefix: p, keys: hit });
            return hit.length;
          },
          keys: function () { return Object.keys(m); },
          size: function () { return Object.keys(m).length; },
          _raw: function () { return m; }
        };
      })();

      /* ---- 5b. Derive：派生状态映射（显式逻辑的单一事实源） ----
       * 病根：此前「provider→徽章色 / provider→中文名 / provider→语义召回态 / 水位→等级 /
       * 成员装配→徽章」五组判定，以三元链形式散在 5 处，同一 provider 的口径还不一致
       * （向量区把 DmlExecutionProvider 视作 running，记忆板块把 fusion 视作 running）。
       * 收敛原则：**只搬不走** —— 表内每一项都与原三元链逐值对齐，行为不变；
       * 口径差异不抹平，改由调用方显式传入「本处视作 running 的 provider 列表」。 */
      var Derive = (function () {
        /* provider 故障态：这两档在任何视图都是 stalled（未开/未连，与调用方口径无关） */
        var VEC_DOWN = { off: 'stalled', unreachable: 'stalled' };
        /* provider → 展示名（记忆板块徽章；缺省 '关'） */
        var VEC_LABEL = {
          fusion: '融合', 'gpu-ready': '本机就绪', lexical: '词法',
          cloud: '云端', unreachable: '服务未连', off: '关'
        };
        /* provider → 语义召回态（记忆板块 §7；仅这两档有正向文案，其余 '—'） */
        var VEC_RECALL = { fusion: '融合中', 'gpu-ready': '就绪' };
        /* 水位阈值（百分比）：≥stalled 红 / ≥suspect 黄 / 其余绿 */
        var CAP_PCT = { stalled: 85, suspect: 60 };
        /* 被引用列表超出该条数时折叠为「… 共 N 处」 */
        var BACKREF_LIMIT = 8;
        /* 成员装配状态 → 徽章文案 + 语义类 */
        var SUITE_STATUS = {
          both: { text: '✓✓ 双基准', kind: 'ok' },
          injected: { text: '✓ 注入器', kind: 'info' },
          profile: { text: '✓ profile', kind: 'info' },
          missing: { text: '✗ 未装配', kind: 'error' }
        };
        var SUITE_FALLBACK = { text: '✗ 未装配', kind: 'info' };
        /* 归一化：null/undefined/空串都算「缺省」。调用点原本用 `p || 'off'` 兜底，
         * 这里把兜底收进来，保证两种写法（外层兜 / 不兜）结果一致。 */
        function s(v, dflt) { return String(v === undefined || v === null || v === '' ? dflt : v); }
        var hasOwn2 = Object.prototype.hasOwnProperty;
        /* 只查自有属性：直接 obj[k] 会沿原型链命中 constructor/toString 等，
         * 把「未登记的 provider」误判成已登记（返回 Function 是 truthy）。 */
        function pick(o, k, dflt) { return hasOwn2.call(o, k) ? o[k] : dflt; }
        return {
          CAP_PCT: CAP_PCT, BACKREF_LIMIT: BACKREF_LIMIT,
          VEC_LABEL: VEC_LABEL, VEC_RECALL: VEC_RECALL, VEC_DOWN: VEC_DOWN,
          SUITE_STATUS: SUITE_STATUS,
          /* provider → 徽章 kind。running 档由调用方显式给出（各视图口径不同，见上注）。 */
          providerKind: function (p, runningList) {
            var k = s(p, 'off');
            if (runningList && runningList.indexOf(k) >= 0) return 'running';
            return pick(VEC_DOWN, k, 'ended');
          },
          /* provider 是否未就绪（off / unreachable）——决定是否出兜底/引导提示。
         * 注意不做 'off' 兜底：原判据 `p === 'off' || p === 'unreachable'` 在 p 缺失时为 false
         * （记忆板块 §7 传的是裸 `data.vector.provider`），兜底会把「未上报」误判成「已关闭」。 */
          providerDown: function (p) { return hasOwn2.call(VEC_DOWN, String(p)); },
          vecLabel: function (p) { return pick(VEC_LABEL, s(p, 'off'), '关'); },
          vecRecall: function (p) { return pick(VEC_RECALL, s(p, ''), '—'); },
          capKind: function (pct) {
            var n = Number(pct) || 0;
            return n >= CAP_PCT.stalled ? 'stalled' : n >= CAP_PCT.suspect ? 'suspect' : 'ended';
          },
          suiteStatus: function (st) { return pick(SUITE_STATUS, String(st), SUITE_FALLBACK); },
          /* 判空：替代散落的 `x && x.length`（20+ 处）。注意与 `!x.length` 的差异——
             后者在 x 为 null/undefined 时直接抛错，has() 返回 false（把崩溃变成空态）。 */
          has: function (v) { return !!(v && v.length); },
          /* 取数：替代 `(x || []).length`（取值场景用，缺省 0） */
          count: function (v) { return (v && v.length) || 0; },
          /* 向量区可见性：原判据 `data.vector && data.vector.enabled !== false` */
          vectorOn: function (data) { return !!(data && data.vector && data.vector.enabled !== false); }
        };
      })();

      /* ---- 6. UI：组件工厂（A2，消除 14 个 render 里的重复实现） ---- */
      var UI = {
        /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item） */
        /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item）。
         * opts:
         *   cls          —— 附加类名
         *   extra        —— 数组，追加进 setting-item-info（如作用域徽标）；用于覆盖"info 内还有额外子节点"的既有写法
         *   wrapControl  —— true(默认) 包进 .setting-item-control；false = 直接挂 row（兼容既有未包装写法）
         *   children     —— 数组，追加为 row 的平级子节点（如 info + badge + slider 三子节点形态）
         * ⚠ 这三个开关是为**等价替换旧写法**而设：既有 DOM 结构千差万别（实测三处三种形态），
         *   组件层必须能无损表达它们，否则替换就会改变 DOM —— 与"结构不变"要求冲突。 */
        item: function (name, desc, control, opts) {
          var o = opts || {};
          var row = el('div', 'setting-item' + (o.cls ? ' ' + o.cls : ''));
          var info = el('div', 'setting-item-info');
          if (name) info.appendChild(el('div', 'setting-item-name', name));
          if (desc) info.appendChild(el('div', 'setting-item-desc', desc));
          (o.extra || []).forEach(function (n) { if (n) info.appendChild(n); });
          row.appendChild(info);
          if (control) {
            if (o.wrapControl === false) row.appendChild(control);
            else { var c = el('div', 'setting-item-control'); c.appendChild(control); row.appendChild(c); }
          }
          (o.children || []).forEach(function (n) { if (n) row.appendChild(n); });
          return row;
        },
        /* 开关：单一实现 = input.checkbox-container（与 makeToggle / 蒸馏 / 向量三处直建写法同源）。
         * 旧实现返回 label 包裹 input —— 内侧原生 checkbox 未被隐藏，胶囊上叠了一个系统勾选框，
         * 与其它三处的开关形态不一致（U4 统一控件规范修复）。 */
        toggle: function (checked, onChange, label) {
          var sw = el('input', 'checkbox-container');
          sw.type = 'checkbox'; sw.checked = !!checked;
          if (label) sw.setAttribute('aria-label', label);
          sw.onchange = function () { onChange(sw.checked); };
          return sw;
        },
        /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 sc-h1 / sc-desc） */
        pageHead: function (title, desc) {
          var box = el('div', 'sc-pagehead');
          box.appendChild(el('h2', 'sc-h1', title));
          if (desc) box.appendChild(el('div', 'sc-desc', desc));
          return box;
        },
        /* 文本/数字输入 */
        input: function (value, onChange, opts) {
          var o = opts || {};
          var i = document.createElement('input');
          i.type = o.type || 'text';
          i.value = value === undefined || value === null ? '' : String(value);
          if (o.placeholder) i.placeholder = o.placeholder;
          if (o.ariaLabel) i.setAttribute('aria-label', o.ariaLabel);
          // 宽度改走 CSS 变量（--sc-in-w），样式判定收进 CSS；缺省时不设 ⇒ 不额外限宽
          if (o.width) i.style.setProperty('--sc-in-w', o.width);
          if (o.onEnter) i.onkeydown = function (e) { if (e.key === 'Enter') o.onEnter(i.value); };
          else if (onChange) i.onchange = function () { onChange(i.value); };
          return i;
        },
        /* 下拉 */
        select: function (options, value, onChange, ariaLabel) {
          var s = document.createElement('select');
          if (ariaLabel) s.setAttribute('aria-label', ariaLabel);
          (options || []).forEach(function (op) {
            var o = document.createElement('option');
            o.value = String(op.value); o.textContent = op.label;
            if (String(op.value) === String(value)) o.selected = true;
            s.appendChild(o);
          });
          s.onchange = function () { onChange(s.value); };
          return s;
        },
        /* 按钮 */
        button: function (text, onClick, opts) {
          var o = opts || {};
          var b = el('button', 'sc-btn' + (o.primary ? ' sc-btn-primary' : '') + (o.danger ? ' sc-btn-danger' : ''), text);
          if (o.title) b.title = o.title;
          b.onclick = function () {
            if (o.confirm && !confirm(o.confirm)) return;
            if (!o.async) { try { onClick(); } catch (e) { fail(e); } return; }
            b.disabled = true; var old = b.textContent; b.textContent = (o.busyText || '执行中…');
            Promise.resolve().then(onClick).then(function (r) { Log.info(o.okText || (text + ' 完成')); return r; })
              .catch(fail).then(function () { b.disabled = false; b.textContent = old; });
          };
          return b;
        },
        /* 徽标 */
        badge: function (text, kind) {
          var b = el('span', 'sc-badge' + (kind ? ' sc-badge-' + kind : ''), text);
          return b;
        },
        /* 状态徽标（sc-ds-badge：圆点 + 文本）—— 后台进程状态行的**唯一构造入口**。
         * 此前 10 处各写三行「建 div → 塞 dot → 塞文本」，其中 3 枚还要异步回填，
         * 靠 `querySelectorAll('span')[1]` 按 DOM 位置取文本节点（改结构即断）。
         * 现返回句柄：setText/setKind 直接持有节点引用，不再依赖位置。 */
        dsBadge: function (text, kind) {
          var box = el('div', 'sc-ds-badge' + (kind ? ' ' + kind : ''));
          box.appendChild(el('span', 'dot'));
          var t = el('span', null, text);
          box.appendChild(t);
          var h = {
            box: box,
            setText: function (s) { t.textContent = s; return h; },
            setKind: function (k) { box.className = 'sc-ds-badge' + (k ? ' ' + k : ''); return h; },
            setTitle: function (s) { box.title = s; return h; }
          };
          return h;
        },
        /* ── 折叠原语：展开/收起的**唯一实现**（collapsible / more / 小节树全部经它） ──
         * 关键差异（对比旧实现）：状态存在 Fold 里而不是 DOM class 或闭包变量，
         *   ⇒ ① 重绘 / 编程改动不会失同步 ② 嵌套项各用各的 key，互不影响
         *     ③ 初始态「先画后插」，无「先展开再收起」的抖动 ④ 支持 disabled / 空数据 / 异步中。
         * opts:
         *   key       必填（缺省用 'fold:'+title）。稳定键；换数据源时用 Fold.clear(前缀) 清残
         *   variant   'card'（默认 .sc-fold 卡片） | 'more'（.sc-more-btn 行式，两个平级节点）
         *   title/summary  card 变体；label = more 变体收起态文案（展开态统一「收起 ▴」）
         *   open      默认展开（仅未登记时生效，之后以 Fold 中登记值为准）
         *   disabled  禁用：不响应点击 + aria-disabled（CSS 的 [aria-disabled] 已负责降透明度）
         *   emptyText seal() 时 body 为空则补此占位；传 false 关闭该行为
         * 返回控件：{ box, head, body, nodes, open(), setOpen(v), sync(), busy(v), seal(), appendTo(host) } */
        fold: function (opts) {
          var o = opts || {};
          var isMore = o.variant === 'more';
          var dflt = !!o.open;
          var label = o.label || '展开';
          var nodes = [];

          var box = isMore ? null : el('div', 'sc-fold');
          var head = isMore ? el('button', 'sc-more-btn') : el('div', 'sc-fold-head');
          if (isMore) head.type = 'button';
          var arrow = isMore ? null : el('span', 'sc-fold-arrow');
          var body = isMore ? el('div', 'sc-more-body') : el('div', 'sc-fold-body');

          if (isMore) {
            nodes.push(head, body);
          } else {
            head.appendChild(arrow);
            head.appendChild(el('span', null, o.title || ''));
            if (o.summary) head.appendChild(el('span', 'sc-fold-summary', o.summary));
            box.appendChild(head); box.appendChild(body);
            nodes.push(box);
          }

          var ctl = { box: box, head: head, body: body, nodes: nodes, key: String(o.key) };
          function current() { return Fold.get(o.key, dflt); }
          /* 把状态一次性画进 DOM —— 调用方插入前就已是正确的开合态 */
          function paint(open) {
            if (isMore) {
              body.classList.toggle('sc-hidden', !open);
              head.textContent = open ? '收起 ▴' : label + ' ▾';
            } else {
              box.classList.toggle('open', open);
              arrow.textContent = open ? '▾' : '▸';
            }
            head.setAttribute('aria-expanded', open ? 'true' : 'false');
          }
          ctl.isOpen = current;
          ctl.setOpen = function (v) { paint(Fold.set(o.key, v)); return ctl; };
          ctl.sync = function () { paint(current()); return ctl; };
          ctl.busy = function (v) { body.classList.toggle('sc-loading', !!v); return ctl; };
          ctl.empty = function () { return body.childNodes.length === 0; };
          ctl.seal = function () {
            if (ctl.empty() && o.emptyText !== false) {
              body.appendChild(el('div', 'sc-mem-empty', o.emptyText || '（无内容）'));
            }
            return ctl;
          };
          ctl.appendTo = function (host) { nodes.forEach(function (n) { host.appendChild(n); }); return ctl; };

          function act() { if (o.disabled) return; paint(Fold.toggle(o.key, dflt)); }
          head.onclick = act;
          if (!isMore) {
            head.setAttribute('role', 'button');
            head.setAttribute('tabindex', '0');
            head.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
          }
          if (o.disabled) head.setAttribute('aria-disabled', 'true');

          paint(current());

          /* 单一数据源同步：任何地方改了同一 key（含 Fold.clear 后的复位），DOM 跟着走。
             节点已从文档移除 ⇒ 自动退订，避免监听器随每次重绘无限堆积。 */
          var everMounted = false;
          function alive() {
            var any = nodes.some(function (n) { return n.isConnected === true; });
            if (any) { everMounted = true; return true; }
            return !everMounted; // 还没 appendTo ⇒ 仍视为存活
          }
          function unsubscribe() { off1(); off2(); }
          var off1 = Bus.on('fold', function (p) {
            if (!alive()) { unsubscribe(); return; }
            if (p && p.key === ctl.key) ctl.sync();
          });
          var off2 = Bus.on('fold:clear', function () {
            if (!alive()) { unsubscribe(); return; }
            ctl.sync();
          });
          return ctl;
        },
        /* 可折叠区块（D2 概览—详情分层）—— 旧实现把状态存在 DOM class 里，现收敛到 Fold */
        collapsible: function (title, bodyNode, opts) {
          var o = opts || {};
          var f = UI.fold({
            key: o.key || ('fold:' + title),
            variant: 'card',
            title: title,
            summary: o.summary,
            open: o.open,
            disabled: o.disabled,
            emptyText: o.emptyText
          });
          if (bodyNode) f.body.appendChild(bodyNode);
          return f.box;
        },
        /* 进度条（C1） */
        progress: function (id) {
          var box = el('div', 'sc-prog');
          var bar = el('div', 'sc-prog-bar');
          var fill = el('div', 'sc-prog-fill');
          bar.appendChild(fill);
          var txt = el('div', 'sc-prog-txt', '');
          box.appendChild(bar); box.appendChild(txt);
          function render(p) {
            var s = (p || {})[id];
            // 显隐用 .sc-hidden（与全站一致），进度值走 CSS 变量 —— 旧实现用 style.display / style.width 直写
            if (!s || !s.on) { box.classList.add('sc-hidden'); return; }
            box.classList.remove('sc-hidden');
            fill.style.setProperty('--sc-pct', (s.pct || 0) + '%');
            txt.textContent = (s.label ? s.label + ' · ' : '') + (s.pct || 0) + '% · ' + (s.note || '');
          }
          render(Store.get('progress'));
          Bus.on('progress', render);
          return box;
        },
        /* 键值对（信息密度） */
        kv: function (pairs) {
          var w = el('div', 'sc-kv');
          (pairs || []).forEach(function (p) {
            var r = el('div', 'sc-kv-row');
            r.appendChild(el('span', 'sc-kv-k', p[0]));
            r.appendChild(el('span', 'sc-kv-v', p[1]));
            w.appendChild(r);
          });
          return w;
        }
      };

      /* ---- 7. 状态栏：分级 + 历史（D1），保持 status(msg) 旧签名可用 ---- */
      /* 只更新状态栏 DOM，不写日志（切断 status ↔ Log 递归的关键） */
      function setStatusText(msg, level) {
        var n = document.getElementById('sc-statusbar');
        if (!n) return;
        n.textContent = (msg || '') + '';
        n.className = 'sc-statusbar sc-status-' + (level || 'info');
      }
      function status(msg, level) {
        var lv = level || 'info';
        setStatusText(msg, lv);
        if (msg) Log.add(lv, msg);
      }
      /* 错误定位（C3）：带端点/参数/堆栈，不再只有一行 message */
      function fail(e, ctx) {
        var err = e instanceof Error ? e : new Error(String(e && e.message ? e.message : e));
        // 关键：优先用显式 ctx，其次从 api() 注入的 e.__ctx 取 —— 旧调用点 `.catch(fail)`
        // 不传 ctx 也能定位到端点（api() 已把 ctx 挂在 error 上）。
        var c = ctx || (e && e.__ctx) || null;
        var where = c ? (' [' + (c.method || '') + ' ' + (c.path || '') + (c.params ? ' ' + JSON.stringify(c.params) : '') + ']') : '';
        var msg = '⚠ ' + err.message + where;
        status(msg, 'error');
        var rec = { t: Date.now(), message: err.message, ctx: c, stack: (err.stack || '').split('\n').slice(0, 4).join(' | ') };
        var a = (Store.get('errors') || []).concat([rec]);
        Store.set('errors', a.slice(-100));
        // api() 已按 path 记过一次 ✗，此处只补堆栈维度，避免日志重复刷屏
        if (!c) Log.error(err.message, { where: null, stack: rec.stack });
        return rec;
      }
      /* 带上下文的 RPC 包装：自动记录耗时/端点/参数，失败可定位 */
      function apiCtx(path, opts, label) {
        var o = opts || {};
        var t0 = Date.now();
        var ctx = { method: (o.method || 'GET'), path: path, params: o.body || null };
        if (label) Prog.start(path, label);
        return api(path, o).then(function (r) {
          if (label) Prog.done(path, true, '完成 ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
          Log.info((o.method || 'GET') + ' ' + path + ' ✓ ' + (Date.now() - t0) + 'ms', ctx);
          return r;
        }).catch(function (e) {
          if (label) Prog.done(path, false, '失败');
          throw Object.assign(new Error(e && e.message ? e.message : String(e)), { __ctx: ctx });
        });
      }

      /* ---------- 页面：开关 ---------- */

      var SWITCH_KEYS = [
        ['injection.hot_memory', '注入热记忆总闸 hot_memory', '关=不注入 agent/用户画像与知识索引任何指针行'],
        // 2026-09-10 审查收敛：archive/lifecycle/merge/scheduler 组开关是 v15 单库化前旧 Python 链路的
        // 遗留控件，其消费端（_meta/*.py）已不随包分发——保留只会误导用户"改了有效"。已移除。
        // 2026-09-11 同类遗漏：boards.memory 是「只写不读」死开关（parseView 解析进 out.boards 后全仓零读取点，
        // 注入总闸只读 level/hot_memory/persona），且旧文案宣称其「注入总闸的父开关」= 假依赖。同批移除。
      ];

      /* ── U1（ADR-122 UI 优化）：作用域/生效态徽章 + 折叠 —— 全部为**增量**补节点/补类，
       *    不改既有 sc-* 语义；回滚=还原 client.js（备份 client.js.pre-u1）。 ── */
      // 控件元数据：写哪（作用域）+ 何时生效（生效态）。缺省 = 全局注入 / 即时。
      var CTRL_META = {
        'injection.hot_memory': { scope: '全局注入', effect: '即时' },
        'injection.level': { scope: '全局注入', effect: '即时' },
        'injection.persona': { scope: '全局注入', effect: '即时' },
        'injection.cap_agent': { scope: '写门容量', effect: '即时' },
        'injection.cap_user': { scope: '写门容量', effect: '即时' },
        'injection.cap_memory': { scope: '写门容量', effect: '即时' },
        recallColdFactorPercent: { scope: '召回融合', effect: '即时' },
        enableDeepSleep: { scope: '调度', effect: '需重载' },
        // U3（B5 能力对齐）：新增控件的作用域与生效态
        injectRelevance: { scope: '注入选行', effect: '即时' },
        injectFreshSlots: { scope: '注入选行', effect: '即时' },
        recallFusion: { scope: '召回融合', effect: '需重载' },
        bankGit: { scope: '库版本化', effect: '需重载' },
        mclEnabled: { scope: '认知环', effect: '需重载' },
        mclFamiliarThreshold: { scope: '认知环', effect: '需重载' },
        mclMaxNudges: { scope: '认知环', effect: '需重载' },
        mclBudgetChars: { scope: '认知环', effect: '需重载' },
        mclTopK: { scope: '认知环', effect: '需重载' },
        mclAudit: { scope: '认知环', effect: '需重载' },
      };
      function metaBadges(key) {
        var m = CTRL_META[key] || { scope: '全局注入', effect: '即时' };
        var box = el('div', 'sc-ctrl-meta');
        box.appendChild(el('span', 'sc-chip', m.scope));
        box.appendChild(el('span', 'sc-chip' + (m.effect === '需重载' ? ' warn' : ''), m.effect));
        return box;
      }
      /** 折叠：把哨兵 mark 之后的所有兄弟节点收进可折叠体（零逐组改动 ⇒ 易回滚）
       *  状态改由 Fold 统一持有（旧实现是闭包里一个局部 open，重绘即丢、多处各写各的）。
       *  @param label 展开按钮文案；@param openDefault 是否默认展开；@param key 稳定键（防残留） */
      function scheduleFold(host, mark, label, openDefault, key) {
        var nodes = [];
        var n = mark.nextSibling;
        while (n) { nodes.push(n); n = n.nextSibling; }
        if (!Derive.has(nodes)) { if (mark.parentNode) mark.parentNode.removeChild(mark); return null; }
        var f = UI.fold({ key: key || ('more:' + label), variant: 'more', label: label, open: !!openDefault });
        nodes.forEach(function (x) { f.body.appendChild(x); });
        // 就地替换哨兵（旧实现先 removeChild 再 append 到末尾，节点已被搬空时二者等价）
        f.appendTo(host);
        if (mark.parentNode) mark.parentNode.removeChild(mark);
        return f;
      }

      /* ── 折叠哨兵的**同步**收口（替代 setTimeout(0)） ──
       * 旧实现：`setTimeout(function(){ scheduleFold(...) }, 0)` —— 要等"后续节点都追加完"。
       * 问题：① 中间隔了一个任务边界，慢渲染时用户能看到内容先铺开再被收起（**抖动闪烁**）；
       *      ② 那一帧 DOM 处于"未收拢"的中间态，任何中途查询都读到不一致结构；
       *      ③ 渲染函数抛异常时哨兵 div 会永久留在 DOM 里。
       * 现在：渲染期只做 deferFold 登记，由 flushFolds() 在**同一个同步流程末尾**统一收口 ——
       * 时序与旧实现等价（仍在所有同步 append 之后、任何网络回调之前），但不再跨任务边界。 */
      var _foldQueue = [];
      function deferFold(host, mark, label, openDefault, key) {
        _foldQueue.push({ host: host, mark: mark, label: label, open: !!openDefault, key: key });
      }
      function flushFolds() {
        var q = _foldQueue;
        _foldQueue = [];
        q.forEach(function (t) {
          try {
            scheduleFold(t.host, t.mark, t.label, t.open, t.key);
          } catch (e) {
            // 收口失败也必须把哨兵摘掉，避免空 div 残留
            if (t.mark && t.mark.parentNode) t.mark.parentNode.removeChild(t.mark);
            Log.warn('折叠收口失败：' + (e && e.message ? e.message : e));
          }
        });
        return q.length;
      }
      function makeToggle(key, name, desc, initial, onToggle) {
        // A2：改用 UI.item（DOM 等价）—— extra 承载作用域徽标；wrapControl:false 保持
        // 既有「开关直接挂 item、无 .setting-item-control 包装」的结构，避免替换改变 DOM。
        var sw = el('input', 'checkbox-container'); sw.type = 'checkbox'; sw.checked = !!initial;
        sw.onchange = function () { onToggle(key, sw); };
        return UI.item(name, desc, sw, { extra: [metaBadges(key)], wrapControl: false });
      }

      function renderViewToggles(view, parsed, global) {
        view.textContent = '';
        view.appendChild(UI.pageHead('参数调节', '注入参数（全局，写 ~/.dsh/suite/scheduler.json）与运行时通道。改动即时写回（scheduler.json 备份先行）。注入配置已迁全局，不再随 root 切换变化（root YAML 仅剩「配置原文」页可直接编辑）。'));
        /* U1：参数检索（前端过滤，零新端点）——匹配 name/desc/键名，隐藏不匹配行并报数 */
        (function () {
          var bar = el('div', 'sc-search-bar');
          var q = el('input', 'sc-input'); q.type = 'search'; q.placeholder = '检索参数（名称 / 键名 / 说明）…';
          var cnt = el('span', 'sc-search-count', '');
          bar.appendChild(q); bar.appendChild(cnt);
          q.oninput = function () {
            var kw = String(q.value || '').trim().toLowerCase();
            var items = view.querySelectorAll('.setting-item');
            var hit = 0;
            items.forEach(function (it) {
              var t = (it.textContent || '').toLowerCase();
              var show = !kw || t.indexOf(kw) > -1;
              it.classList.toggle('sc-filtered', !show); // 检索过滤 ≠ 折叠态，不再复用 .sc-hidden
              if (show) hit++;
            });
            cnt.textContent = kw ? ('匹配 ' + hit + ' / ' + items.length + ' 项') : '';
          };
          view.appendChild(bar);
        })();
        // 注入配置全局值（P1-2：global 优先；parsed 回落兼容旧 root YAML）
        var g = global || {};
        // R1：global 是最终生效值（scheduler ?? 默认），不回 root YAML——显示=实际注入值
        function gVal(key, fallback) { return (g[key] !== undefined && g[key] !== null) ? g[key] : fallback; }
        /* ── U2（IA 重排）：参数分 4 桶（B6）——按用户心智而非后端模型分桶；桶内子节降级为 sc-h3 ── */
        view.appendChild(el('div', 'sc-mem-group-title', '① 注入与画像（即时生效）'));
        // 画像 persona 四档滑块：关闭 / 仅注入我 / 仅注入你 / 全注入
        var personaMode = String(gVal('persona', 'both'));
        var PERSONA_TIERS = [['off', '关闭'], ['me', '仅注入我'], ['you', '仅注入你'], ['both', '全注入']];
        var slider = el('div', 'sc-persona-slider');
        PERSONA_TIERS.forEach(function (tier, i) {
          var cell = el('button', 'sc-persona-cell' + (tier[0] === personaMode ? ' active' : ''));
          cell.type = 'button';
          cell.setAttribute('role', 'radio');
          cell.setAttribute('aria-checked', tier[0] === personaMode ? 'true' : 'false');
          cell.textContent = tier[1];
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.persona', value: tier[0] }) })
              .then(function () {
                status('✓ persona 档位 = ' + tier[1]);
                slider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
                cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
              })
              .catch(fail);
          };
          slider.appendChild(cell);
        });
        // A2：改用 UI.item（DOM 等价）——保持 info → 作用域徽标 → 滑块 的原有顺序，均不包装
        view.appendChild(UI.item('画像 persona 注入档位 injection.persona', 'v17 已生效：关闭=不注入画像；仅注入我=只注入 agent 画像 AGENT.md（含 [原则] 习得原则与 [路径] 任务路径）；仅注入你=只注入用户画像 USER.md；全注入=双画像（默认）', null, { children: [metaBadges('injection.persona'), slider] }));
        SWITCH_KEYS.forEach(function (it) {
          // P1-2：hot_memory 显示全局 scheduler.json 值（root YAML flags 已非真源）
          var cur = it[0] === 'injection.hot_memory' ? gVal('hot_memory', true) : parsed.flags[it[0]];
          if (typeof cur !== 'boolean') return;
          view.appendChild(makeToggle(it[0], it[1], it[2], cur, function (key, sw) {
            api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
              .then(function () { status('✓ 已切换 ' + key); })
              .catch(function (e) { fail(e); sw.checked = !sw.checked; });
          }));
        });
        // 热记忆注入强度（五格滑块：off/low/medium/high/smart）
        var levelMode = String(gVal('level', 'smart'));
        var LEVEL_TIERS = [['off', 'off'], ['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['smart', 'smart']];
        var lSlider = el('div', 'sc-persona-slider');
        LEVEL_TIERS.forEach(function (tier, i) {
          var cell = el('button', 'sc-persona-cell' + (tier[0] === levelMode ? ' active' : ''));
          cell.type = 'button';
          cell.setAttribute('role', 'radio');
          cell.setAttribute('aria-checked', tier[0] === levelMode ? 'true' : 'false');
          cell.textContent = tier[1];
          cell.title = 'injection.level = ' + tier[0];
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.level', value: tier[0] }) })
              .then(function () {
                status('✓ injection.level = ' + tier[0]);
                lSlider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
                cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
              })
              .catch(fail);
          };
          lSlider.appendChild(cell);
        });
        // A2：改用 UI.item（DOM 等价）——保持 info → 作用域徽标 → 滑块 的原有顺序，均不包装
        view.appendChild(UI.item('热记忆注入强度 injection.level', 'off=不注入 / low(2 条) / medium(4 条) / high(8 条) / smart=智能上限(10 条)；当前：' + levelMode + '；改动即时生效（缓存作废）', null, { children: [metaBadges('injection.level'), lSlider] }));
        // U3（B5 能力对齐）：注入选行两键 —— panel 早已读取 injectRelevance/injectFreshSlots，此前无控件（UI 调不了）
        view.appendChild(makeToggle('injectRelevance', '注入相关性重排 injectRelevance', '开=按相关性选行（缺省）；关=回落「基线 + 新鲜度」选行。即时生效（下次注入即用）', gVal('injectRelevance', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（即时）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        view.appendChild(numSetting('新鲜度保底槽 injectFreshSlots', '注入时优先保留「最近新增条目」的槽位数（0–6，缺省 2）', gVal('injectFreshSlots', 2), 'injectFreshSlots', '条', 1));

        // 注入容量预算（v16）：总预算 + 三板块字符上限（0=不裁）
        function numSetting(name, desc, val, key, unit, step) {
          var isFloat = typeof step === 'number' && step < 1; // U3：小数键（如 MCL 熟悉度阈值）支持
          var wrap = el('div', 'sc-num-wrap'); // U2.5：内联样式 → 类（令牌化，可统一/可回滚）
          var inp = el('input'); inp.type = 'number'; inp.className = 'sc-input'; inp.min = '0'; inp.step = String(step || 100); inp.value = String(val);
          var unitEl = el('span', 'sc-range-label', unit || '');
          inp.onchange = function () {
            var v = String(isFloat ? (Math.max(0, parseFloat(inp.value) || 0)) : Math.max(0, parseInt(inp.value, 10) || 0));
            api('/set', { method: 'POST', body: JSON.stringify({ key: key, value: v }) })
              .then(function () { status('✓ ' + key + ' = ' + v); })
              .catch(fail);
          };
          wrap.appendChild(inp); wrap.appendChild(unitEl);
          // A2：改用 UI.item（DOM 等价）——children 保持「info + 作用域徽标 + 控件」的原有顺序与结构
          return UI.item(name, desc, null, { children: [metaBadges(key), wrap] });
        }
        view.appendChild(el('div', 'sc-mem-group-title', '② 记忆与容量（写门 + 活性/遗忘）'));
        // 2026-09-10 用户拍板：三上限=记忆库「容量门」（蒸馏/扩增超限拒写），不裁注入——
        // 任务执行时 agent 总看到完整双画像+记忆指针（裁切会漏记忆影响执行）；容量门控制记忆库能长多大
        var actualChars = (g && g.actual) || { agent: 0, user: 0, memory: 0 };
        view.appendChild(numSetting('AGENT.md 容量门 cap_agent', 'agent 画像记忆库容量（字符）：蒸馏/深睡写入超限会被 write_gate 拒（AGENT.md 当前实际 ' + (actualChars.agent || 0) + ' 字符）。**不影响任务执行注入**——注入总看完整画像', gVal('cap_agent', 3000), 'injection.cap_agent', '字符'));
        view.appendChild(numSetting('USER.md 容量门 cap_user', '用户画像记忆库容量（字符）：写入超限被拒（当前实际 ' + (actualChars.user || 0) + ' 字符）。不影响任务执行注入', gVal('cap_user', 3000), 'injection.cap_user', '字符'));
        view.appendChild(numSetting('MEMORY.md 容量门 cap_memory', '知识索引记忆库容量（字符）：写入超限被拒（当前实际 ' + (actualChars.memory || 0) + ' 字符）。注入按档位行数不受此限', gVal('cap_memory', 5000), 'injection.cap_memory', '字符'));
        // ── v7 活性/遗忘 · 校准阈值（2026-09-10）：条目活性状态机判定天数 + 融合召回降权系数；
        //    经 /set 写入 scheduler.json，深睡巡检/召回运行时生效（缺省 14/44/90/5/35 与 scheduler zod 默认一致）
        view.appendChild(el('div', 'sc-h3', '活性 / 遗忘阈值（v7）'));
        view.appendChild(el('div', 'sc-desc', '记忆条目活性状态机（active→warm→cold）与遗忘/加深候选的判定阈值，以及融合召回对 cold/retired 条目的降权系数。改动经 /set 即时写回 scheduler.json（与注入/蒸馏配置同通道，重载后按新阈值运行）。'));
        view.appendChild(numSetting('活性降级 warm 阈值 activityWarmDays', 'active→warm 无命中天数（缺省 14）', gVal('activityWarmDays', 14), 'activityWarmDays', '天')); // 与 scheduler zod 默认一致
        view.appendChild(numSetting('遗忘冷降 cold 阈值 activityColdDays', 'warm→cold 无命中天数（缺省 44 = warm+30）', gVal('activityColdDays', 44), 'activityColdDays', '天')); // 与 scheduler zod 默认一致
        view.appendChild(numSetting('遗忘候选 archive 阈值 activityArchiveDays', 'cold 后超此天数未命中 → 遗忘候选清单（缺省 90，只建议不删除）', gVal('activityArchiveDays', 90), 'activityArchiveDays', '天')); // 与 scheduler zod 默认一致
        view.appendChild(numSetting('加深候选命中数 activityHotHits', '近 30 天命中 ≥ 此值 → 加深候选 B（缺省 5，喂深睡归纳）', gVal('activityHotHits', 5), 'activityHotHits', '次')); // 与 scheduler zod 默认一致
        // 百分比项：numSetting 的 step=100 不适用百分比（会出问题），自建输入块（step=5, min=5, max=95，parseInt 后 clamp [5,95]）
        var pctItem = el('div', 'setting-item');
        var pctInfo = el('div', 'setting-item-info');
        pctInfo.appendChild(el('div', 'setting-item-name', '召回冷条目降权 recallColdFactorPercent'));
        pctInfo.appendChild(el('div', 'setting-item-desc', 'cold/retired 小节在融合召回中的降权系数（百分比 → /100；缺省 35%，后端范围校验 [5,95] 兜底）'));
        var pctWrap = el('div', 'sc-num-wrap'); // U2.5：内联 → 类
        var pctInp = el('input'); pctInp.type = 'number'; pctInp.className = 'sc-input'; pctInp.min = '5'; pctInp.max = '95'; pctInp.step = '5'; pctInp.value = String(gVal('recallColdFactorPercent', 35)); // 与 scheduler zod 默认一致
        var pctUnit = el('span', 'sc-range-label', '%');
        pctInp.onchange = function () {
          var raw = parseInt(pctInp.value, 10);
          if (isNaN(raw)) raw = 35;
          var v = Math.max(5, Math.min(95, raw));
          pctInp.value = String(v);
          api('/set', { method: 'POST', body: JSON.stringify({ key: 'recallColdFactorPercent', value: String(v) }) })
            .then(function () { status('✓ recallColdFactorPercent = ' + v + '%'); })
            .catch(fail);
        };
        pctWrap.appendChild(pctInp); pctWrap.appendChild(pctUnit);
        pctItem.appendChild(pctInfo); pctItem.appendChild(pctWrap);
        view.appendChild(pctItem);
        // 当前实际注入统计（调用 /inject/preview 算 token：中文 ~2 字符/token）
        var injectInfo = el('div', 'sc-desc');
        injectInfo.classList.add('sc-inline-note');
        view.appendChild(injectInfo);
        api('/inject/preview').then(function (r) {
          var txt = (r && r.text) || '';
          if (!txt) { injectInfo.textContent = '当前注入：空（hot_memory 关或画像/记忆为空）'; return; }
          var chars = txt.replace(/\s+/g, '').length;
          var tokens = Math.ceil(chars / 2); // 中文粗估 ~2 字符/token
          var lineCount = txt.split('\n').filter(function (l) { return l.trim().indexOf('- [') === 0; }).length;
          injectInfo.textContent = '当前直接注入 ≈ ' + tokens + ' token（' + chars + ' 字符 · 双画像+记忆指针 ' + lineCount + ' 条）——每轮随提示词注入';
        }).catch(function () { injectInfo.textContent = ''; });

        // ── G-19（2026-09-12）：深睡未消化策略（B 全重捞 / C 分级）──
        //    此前两种取向写死在代码里，用户无法选；现经 /set 写 scheduler.json
        //    （distill.ts 的 liveFailPolicy 实时读这两个键），改动即时生效，无需重载。
        view.appendChild(el('div', 'sc-h3', '深睡未消化策略'));
        view.appendChild(el('div', 'sc-desc', '深睡每轮用 deepSleepLanded 判定本轮是否「已消化」。未消化时的两种取向在此切换——全重捞保证不丢料但可能无限重试；分级在连败达上限后放行并告警，避免无限重试烧 LLM。'));
        view.appendChild(UI.item(
          '深睡未消化策略 deepSleep.failPolicy',
          '全重捞（retry）= 永不放弃，未消化就一直重捞本批（保证不丢料；材料永久失败时每轮都会重试）；分级（graded）= 连续失败达 N 轮后放行水位并记审计告警（避免无限重试烧 LLM）。缺省 graded。',
          UI.select([
            { value: 'retry', label: '全重捞（不丢料，永不放弃）' },
            { value: 'graded', label: '分级（连败 N 轮后放行并告警）' }
          ], String(gVal('deepSleepFailPolicy', 'graded')), function (v) {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'deepSleep.failPolicy', value: v }) })
              .then(function () { status('✓ 深睡未消化策略 = ' + v); })
              .catch(fail);
          }, 'deepSleep.failPolicy')
        ));
        // 连败上限：仅在 graded 下生效（retry 永不放弃，此项不参与判定）
        var roundsInput = UI.input(String(gVal('deepSleepFailMaxRounds', 3)), function (raw) {
          var n = parseInt(raw, 10);
          if (isNaN(n)) n = 3;
          n = Math.max(1, Math.min(100, n));
          roundsInput.value = String(n); // 非法/越界就地回落，显示值=实际写入值
          api('/set', { method: 'POST', body: JSON.stringify({ key: 'deepSleep.failPolicyMaxRounds', value: String(n) }) })
            .then(function () { status('✓ 分级策略连败上限 = ' + n + ' 轮'); })
            .catch(fail);
        }, { type: 'number', width: '120px', ariaLabel: 'deepSleep.failPolicyMaxRounds' });
        roundsInput.min = '1'; roundsInput.max = '100'; roundsInput.step = '1';
        view.appendChild(UI.item(
          '分级策略连败上限 deepSleep.failPolicyMaxRounds',
          '仅在「分级」策略下生效（1–100，缺省 3）：连续失败达此轮数后放行深睡水位并记一条审计告警；全重捞策略下此项不参与判定。',
          roundsInput
        ));

        // 2026-09-10 审查收敛：以下旧控件已移除——
        //  archive/lifecycle/merge 组（蒸馏空闲 idle_review_ms/归档模式/成熟时长/指纹阈值等）消费端为 v15 单库化前
        //  旧 Python 链路（_meta/*.py 已不随包分发），改了无效。真蒸馏节流/深睡阈值在下方「蒸馏节流」与
        //  「深度睡眠」页（scheduler.json 通道）。

        // 2026-09-10 审查收敛：旧「向量检索（召回面）」区（模型下载/部署/重建）已移除——
        // 其驱动链路 vector_search.py/model_manager.py 为 v15 单库化前遗留，不随包分发（改了无效）。
        // 真向量（vec.ts + bge-m3 GPU）的状态/开关/清缓存见下方「向量与模型 · 当前链路」。
        // ── U6「向量与模型 · 当前链路」（2026-09-09）：真实 vec.ts+GPU 服务的状态与开关——
        // 旧「向量检索」区驱动已退役 vector_search.py 链路；本节展示/控制新链路（本地 bge-m3 GPU / 云端可配）。
        // 数据源：GET /vector/status2（运行态+provider+缓存）+ GET/POST /embed/config（scheduler.json，重载生效）。
        view.appendChild(el('div', 'sc-mem-group-title', '③ 模型与向量（链路 + 蒸馏/深睡模型）'));
        view.appendChild(el('div', 'sc-h3', '向量与模型 · 当前链路'));
        view.appendChild(el('div', 'sc-desc', '语义召回（vec.ts + bge-m3）运行态与开关。改动写 ~/.dsh/suite/scheduler.json，**需重载插件后生效**。本地 GPU 零 token；换云端在下方填 baseUrl/model。'));
        var vzone = el('div');
        function refreshVecZone() {
          api('/vector/status2').then(function (s2) {
            vzone.textContent = '';
            // 状态行（pill 风格，复用 sc-ds-badges）
            var vb = el('div', 'sc-ds-badges');
            var st = (s2.provider || 'off');
            vb.appendChild(UI.dsBadge('provider ' + st, Derive.providerKind(st, ['DmlExecutionProvider'])).box);
            vb.appendChild(UI.dsBadge('缓存 ' + String((s2.cache && s2.cache.lines) || 0) + ' 行', 'ended').box);
            if (s2.stats && s2.stats.queries) {
              vb.appendChild(UI.dsBadge(
                '召回 ' + String(s2.stats.queries) + ' 次 · ' + String(s2.stats.lastMode || '') + ' · ' + String(s2.stats.lastMs || 0) + 'ms',
                'ended'
              ).setTitle('最近查询: ' + String(s2.stats.lastQuery || '')).box);
            }
            vzone.appendChild(vb);
            // 开关（embedEnabled）
            var sw = el('input'); sw.type = 'checkbox'; sw.className = 'checkbox-container';
            sw.checked = !!(s2.running && s2.running.enabled);
            sw.addEventListener('change', function () {
              api('/embed/config', { method: 'POST', body: JSON.stringify({ embedEnabled: sw.checked }) })
                .then(function () { status('✓ 向量 ' + (sw.checked ? '开' : '关') + '（重载后生效）'); })
                .catch(function (e) { fail(e); sw.checked = !sw.checked; });
            });
            // A2：改用 UI.item（DOM 等价：info + 包进 setting-item-control 的开关）
            vzone.appendChild(UI.item('语义召回开关 embedEnabled', '开=融合召回（dense0.7+lexical0.3）；关=纯词法。写 scheduler.json', sw));
            // M2（2026-09-10 方案1·浏览器直连）：Provider 预设卡 + URL(datalist) + 模型下拉三态。
            // 探测由浏览器 fetch 目标服务（绕 DSH 宿主 panel 网络限制；Ollama/9915 CORS 均放行）。
            // 照抄 AnythingLLM EmbeddingSelection + Open WebUI 三态模式（考古蓝图 docs/model-config-impl-blueprint.md）。
            var curUrl = (s2.running && s2.running.baseUrl) || 'http://127.0.0.1:11434/v1';
            var curModel = (s2.running && s2.running.model) || 'bge-m3';
            var curKeyEnv = (s2.running && s2.running.apiKeyEnv) || 'EMBED_API_KEY';
            var EMBED_PROVIDERS = [
              { id: 'ollama', name: 'Ollama（本机缺省）', base: 'http://127.0.0.1:11434/v1' },
              { id: 'bge', name: '自建 bge-m3 桥（可选）', base: 'http://127.0.0.1:9915/v1', noEnum: true },
              { id: 'lmstudio', name: 'LM Studio', base: 'http://127.0.0.1:1234/v1' },
              { id: 'custom', name: '自定义 OpenAI 兼容（云端）', base: '' }
            ];
            var provWrap = el('div', 'sc-prov-btns'); // 样式优化：等宽胶囊按钮组
            EMBED_PROVIDERS.forEach(function (p) {
              var card = el('button', 'sc-btn' + (curUrl.indexOf(p.base) === 0 && p.base ? ' on' : ''), p.name);
              card.type = 'button';
              card.addEventListener('click', function () {
                uInp.value = p.base;
                var all = provWrap.querySelectorAll('button');
                all.forEach(function (b) { b.classList.remove('on'); });
                card.classList.add('on');
                if (p.id === 'custom') { uInp.value = ''; uInp.focus(); }
                enumModels(); // 立即探测
              });
              provWrap.appendChild(card);
            });
            // A2：改用 UI.item（DOM 等价）——provWrap 原本直接挂 item，故用 children 而非包装控件
            vzone.appendChild(UI.item('语义检索来源', '选服务 → 自动填地址 → 下方自动探测并列出可用模型（浏览器直连）。换服务/模型后请点「清缓存重建」。', null, { children: [provWrap] }));
            // URL + datalist 预设 + key env
            var urlWrap = el('div', 'sc-col-end');
            var uInp = el('input', 'sc-input sc-w-xl'); uInp.value = curUrl; uInp.placeholder = 'http://127.0.0.1:11434/v1';
            var dlist = el('datalist'); dlist.id = 'sc-embed-endpoints';
            ['http://127.0.0.1:11434/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:9915/v1', 'http://127.0.0.1:1234/v1', 'https://api.openai.com/v1', 'https://api.deepseek.com/v1'].forEach(function (ep) {
              var o = el('option'); o.value = ep; dlist.appendChild(o);
            });
            document.body.appendChild(dlist);
            uInp.setAttribute('list', 'sc-embed-endpoints');
            var mSel = el('select', 'sc-input sc-w-xl'); mSel.title = 'embedModel';
            var kInp = el('input', 'sc-input sc-w-md'); kInp.value = curKeyEnv; kInp.title = 'embedApiKeyEnv'; kInp.placeholder = 'key 环境变量名（本地免填）';
            var probeHint = el('div', 'sc-mem-sub muted'); probeHint.classList.add('sc-max-xl');
            urlWrap.appendChild(uInp); urlWrap.appendChild(mSel); urlWrap.appendChild(kInp); urlWrap.appendChild(probeHint);
            // A2：改用 UI.item（DOM 等价）——urlWrap 原本直接挂 item，故用 children 而非包装控件
            vzone.appendChild(UI.item('服务地址（OpenAI 兼容 /v1 根）', '如 http://127.0.0.1:11434/v1（Ollama）或 http://127.0.0.1:9915/v1（自建桥）；改完回车自动探测。', null, { children: [urlWrap] }));
            // 保存 + 状态行
            var saveWrap = el('div', 'sc-vec-actions'); // 样式优化：统一按钮高对齐
            var probeBtn = el('button', 'sc-btn subtle', '重新探测');
            probeBtn.type = 'button'; probeBtn.classList.add('sc-btn-xs');
            probeBtn.addEventListener('click', enumModels);
            var saveBtn = el('button', 'sc-btn', '保存配置');
            saveBtn.type = 'button'; saveBtn.classList.add('sc-btn-xs');
            saveBtn.addEventListener('click', function () {
              saveBtn.disabled = true; saveBtn.textContent = '保存中…';
              api('/embed/config', { method: 'POST', body: JSON.stringify({ embedBaseUrl: uInp.value.trim(), embedModel: mSel.value || curModel, embedApiKeyEnv: kInp.value.trim() || 'EMBED_API_KEY' }) })
                .then(function () { status('✓ 已保存（重载后生效——若换了服务/模型请点「清缓存重建」）'); saveBtn.disabled = false; saveBtn.textContent = '保存配置'; })
                .catch(function (e) { saveBtn.disabled = false; saveBtn.textContent = '保存配置'; fail(e); });
            });
            saveWrap.appendChild(probeBtn); saveWrap.appendChild(saveBtn);
            vzone.appendChild(saveWrap);
            // 浏览器直连枚举（三态：加载/空/失败/成功）——方案1 绕宿主 panel 网络限制
            var probing = false;
            var probeDone = false; // ①+② 全程只结算一次（fetch 链 + health 降级共享）
            function setSelectState(disabled, placeholder) {
              mSel.disabled = disabled;
              mSel.textContent = '';
              var opt = el('option'); opt.value = ''; opt.textContent = placeholder || '选择模型…';
              mSel.appendChild(opt);
            }
            function enumModels() {
              var b = uInp.value.trim().replace(/\/+$/, '');
              var root = b.replace(/\/v1$/, ''); // 统一服务根（uInp 可能带 /v1 或不带）
              probeDone = false;
              if (!root) { setSelectState(true, '先填写服务地址'); probeHint.textContent = ''; return; }
              // 校验 URL
              try { var u = new URL(root); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('x'); } catch (e) { setSelectState(true, 'URL 无效'); probeHint.textContent = '需 http(s):// 开头'; return; }
              if (probing) return;
              probing = true; setSelectState(true, '加载可用模型中…'); probeHint.textContent = '';
              var finish = function (models, mode, note) {
                if (probeDone) return; probeDone = true; probing = false;
                if (Derive.has(models)) {
                  mSel.disabled = false; mSel.textContent = '';
                  models.forEach(function (md) {
                    var o = el('option'); o.value = md.id;
                    o.textContent = md.id + (isEmbedLike(md.id) ? '（嵌入）' : '');
                    if (md.id === curModel) o.selected = true;
                    mSel.appendChild(o);
                  });
                  probeHint.textContent = '✓ ' + models.length + ' 个模型 · ' + (mode || '') + (note ? ' · ' + note : '');
                } else {
                  setSelectState(true, '（无可枚举模型）');
                  probeHint.textContent = note || '未探测到模型';
                }
              };
              // ① OpenAI 兼容 GET {root}/v1/models（浏览器直连；CORS 由服务端控制）
              fetch(root + '/v1/models', { signal: AbortSignal.timeout(6000) })
                .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(function (j) {
                  var models = ((j && j.data) || []).map(function (m) { return { id: m.id }; });
                  if (Derive.has(models)) { finish(models, 'openai-compatible'); return; }
                  probeHealth(root, finish); // 空 data → 尝试 bge 降级
                })
                .catch(function () { probeHealth(root, finish); });
            }
            function isEmbedLike(id) { return /embed|bge|m3|nomic|e5|text-embed/i.test(String(id)); }
            function probeHealth(root, finish) {
              fetch(root + '/health', { signal: AbortSignal.timeout(5000) })
                .then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
                .then(function (j) {
                  var fixed = (j && j.model) || 'bge-m3';
                  finish([{ id: fixed }], 'health-fixed', '服务在但无 /models——用固定 ' + fixed + (j && j.dims ? '（' + j.dims + 'd）' : ''));
                })
                .catch(function () {
                  if (!probeDone) { probeDone = true; probing = false; }
                  setSelectState(true, '（连接失败）');
                  probeHint.textContent = '无法连接该服务（/v1/models 与 /health 均无响应）——检查地址/服务是否在跑/CORS';
                });
            }
            // URL 变化 → 自动重探（onBlur 提交，非击键）
            uInp.addEventListener('change', function () { enumModels(); });
            probeHint.textContent = curModel ? '当前：' + curModel + ' @ ' + curUrl : '';
            enumModels(); // 初始自动探测
            // P0（2026-09-10）：清缓存重建——换 embedding 模型后旧向量失效，须清后按新模型重嵌
            var clearRow = el('div', 'setting-item');
            var clearInfo = el('div', 'setting-item-info');
            clearInfo.appendChild(el('div', 'setting-item-name', '向量缓存'));
            clearInfo.appendChild(el('div', 'setting-item-desc', '缓存按 模型+行文本+地址 指纹命中；换模型/改云端后点「清缓存重建」，下次召回按新模型自动重嵌（当前 ' + String((s2.cache && s2.cache.lines) || 0) + ' 行薄行，~秒级）'));
            clearRow.appendChild(clearInfo);
            var clearBtn = el('button', 'sc-btn subtle', '清缓存重建');
            clearBtn.type = 'button';
            clearBtn.classList.add('sc-btn-xs');
            clearBtn.addEventListener('click', function () {
              if (!window.confirm('清空向量缓存并重建？换模型后必须执行（否则旧向量混用导致语义失真）。')) return;
              clearBtn.disabled = true; clearBtn.textContent = '清理中…';
              api('/vector/cache/clear', { method: 'POST', body: '{}' })
                .then(function (r) { status('✓ 向量缓存已清' + (r && r.removed ? '（删除 ' + r.removed + '）' : '') + '——下次召回按当前模型自动重嵌'); clearBtn.disabled = false; clearBtn.textContent = '清缓存重建'; })
                .catch(function (e) { clearBtn.disabled = false; clearBtn.textContent = '清缓存重建'; fail(e); });
            });
            var clearCtl = el('div', 'setting-item-control'); clearCtl.appendChild(clearBtn);
            clearRow.appendChild(clearCtl);
            vzone.appendChild(clearRow);
            // R2（2026-09-10）：服务未就绪引导——新装用户默认无 bge 服务（词法兜底运行，语义未启用）
            if (Derive.providerDown(st)) {
              var guide = el('div');
              guide.appendChild(el('div', 'sc-mem-group-title', '如何启用语义检索'));
              var g1 = el('div', 'setting-item');
              var g1i = el('div', 'setting-item-info');
              g1i.appendChild(el('div', 'setting-item-name', '方案 A · 本地 GPU 服务（推荐，零 token 成本）'));
              g1i.appendChild(el('div', 'setting-item-desc', '需自备嵌入服务（OpenAI 兼容 /v1/embeddings）：Ollama（ollama pull bge-m3，:11434）或自建 bge-m3 桥（:9915）。当前检测不可达。'));
              g1.appendChild(g1i);
              guide.appendChild(g1);
              var g2 = el('div', 'setting-item');
              var g2i = el('div', 'setting-item-info');
              g2i.appendChild(el('div', 'setting-item-name', '方案 B · 云端 API'));
              g2i.appendChild(el('div', 'setting-item-desc', '手写 ~/.dsh/suite/scheduler.json：embedBaseUrl=云端端点 + embedModel=模型名 + embedApiKeyEnv=key 环境变量名；改后重载并「清缓存重建」。'));
              g2.appendChild(g2i);
              guide.appendChild(g2);
              guide.appendChild(el('div', 'sc-desc', '未配置时自动词法召回（可用但无语义）；配置后本页 provider 变就绪。'));
              vzone.appendChild(guide);
            }
          }).catch(function (e) { vzone.textContent = ''; vzone.appendChild(el('div', 'sc-desc', '向量状态不可用: ' + e.message)); });
        }
        view.appendChild(vzone);
        refreshVecZone();
        // 视图级轮询：先清旧再建（renderViewToggles 重渲染时防定时器叠加泄漏）
        if (window._scVecTimer) { clearInterval(window._scVecTimer); window._scVecTimer = null; }
        window._scVecTimer = setInterval(function () { try { refreshVecZone(); } catch (e) { /* 轮询异常静默 */ } }, 30000);

        // ── LLM 模型配置（2026-09-10 用户拍板：蒸馏/深睡模型直接用 Harness 宿主模型体系，各自独立可选）──
        // 数据源 GET /llm/models（宿主 listProviders→listModels）；「继承主会话」= 空键。
        // 仿 AnythingLLM LLMProviderModelPicker：provider→model 两级联动 + 空=继承。
        view.appendChild(el('div', 'sc-h3', '蒸馏 / 深睡模型'));
        view.appendChild(el('div', 'sc-desc', '蒸馏与深度睡眠各自可选宿主模型（直接用 DeepSeek Harness 模型——先在 Harness 配置好模型，这里下拉选即可）。「继承主会话」= 不指定，跟随当前会话模型。改动写 scheduler.json，需重载生效。'));
        var llmCard = el('div');
        var hostModels = null; // GET /llm/models 缓存 [{provider,id,name}]
        var llmVal = {}; // 当前持久值 {distillProvider,distillModel,sleepProvider,sleepModel}
        // LLM 模型单下拉（2026-09-10 用户拍板：仿 Harness 对话模型选择——一个下拉框，'跟随主模型'作为默认选项）
        function renderLlmSelect(container, keyP, keyM, label, desc) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', label));
          info.appendChild(el('div', 'setting-item-desc', desc));
          item.appendChild(info);
          var wrap = el('div', 'sc-row');
          var sel = el('select', 'sc-input sc-w-lg'); sel.title = keyP + '/' + keyM;
          var inherit = (llmVal[keyP] || '') === '';
          function rebuild() {
            sel.textContent = '';
            var optMain = el('option'); optMain.value = ''; optMain.textContent = '跟随主模型（默认）';
            optMain.selected = inherit; sel.appendChild(optMain);
            var seen = {};
            (hostModels || []).forEach(function (m) {
              var combo = m.provider + '/' + m.id;
              if (!seen[combo]) { seen[combo] = 1; var o = el('option'); o.value = combo; o.textContent = combo; if (!inherit && m.provider === llmVal[keyP] && m.id === llmVal[keyM]) o.selected = true; sel.appendChild(o); }
            });
            if (!sel.value) sel.value = ''; // 无匹配时落跟随主模型
          }
          sel.addEventListener('change', function () {
            var v = sel.value;
            var patch = {};
            if (!v) { patch[keyP] = ''; patch[keyM] = ''; llmVal[keyP] = ''; llmVal[keyM] = ''; }
            else {
              var sp = v.indexOf('/');
              var prov = v.slice(0, sp), model = v.slice(sp + 1);
              patch[keyP] = prov; patch[keyM] = model; llmVal[keyP] = prov; llmVal[keyM] = model;
            }
            api('/distill/config', { method: 'POST', body: JSON.stringify(patch) })
              .then(function () { status('✓ ' + label + ' 已设' + (v ? '：' + v : '（跟随主模型）') + '——重载后生效'); })
              .catch(fail);
          });
          rebuild();
          wrap.appendChild(sel);
          item.appendChild(wrap);
          container.appendChild(item);
        }

        function renderLlmCard() {
          llmCard.textContent = '';
          // 两用途：蒸馏 / 深睡（独立键，空=回落 llmProvider/llmModel→继承）
          renderLlmSelect(llmCard, 'distillProvider', 'distillModel', '蒸馏模型', '事件蒸馏（会话闲置提炼可复用知识）用的模型。继承=跟随主会话。');
          renderLlmSelect(llmCard, 'sleepProvider', 'sleepModel', '深睡归纳模型', '深度睡眠（离线回想提炼 [原则]/[路径] 画像成长）用的模型。继承=跟随主会话。');
          var note = el('div', 'sc-mem-sub muted'); note.textContent = hostModels ? '宿主可用 ' + hostModels.length + ' 个模型' : '读取宿主模型…';
          llmCard.appendChild(note);
        }
        api('/llm/models').then(function (r) {
          hostModels = (r && r.models) || [];
          llmCard.textContent = '';
          // 读当前持久值
          return api('/distill/config').then(function (d) {
            var run = (d && d.running) || {}, p = (d && d.persisted) || {};
            llmVal.distillProvider = run.distillProvider != null ? run.distillProvider : (p.distillProvider || '');
            llmVal.distillModel = run.distillModel != null ? run.distillModel : (p.distillModel || '');
            llmVal.sleepProvider = run.sleepProvider != null ? run.sleepProvider : (p.sleepProvider || '');
            llmVal.sleepModel = run.sleepModel != null ? run.sleepModel : (p.sleepModel || '');
            renderLlmCard();
          });
        }).catch(function () { llmCard.appendChild(el('div', 'sc-desc', '⚠ 宿主模型不可用')); });
        view.appendChild(llmCard);

        // ── 蒸馏节流（运行时通道 · 2026-09-09 新增）──
        // 背景：enableDistill/idleWakeMs/minTurnChars/distillPrescan/llmProvider/llmModel 六个键有插件 Config
        // 但不持久（注入插件不进 loader 配置持久化），此前只能手写 ~/.dsh/suite/scheduler.json；
        // 现经 /distill/config 读写同一文件（与深度睡眠同通道），**改动需重载插件后生效**。
        view.appendChild(el('div', 'sc-mem-group-title', '④ 后台与调度（高级 · 改后需重载）'));
        view.appendChild(el('div', 'sc-h3', '蒸馏节流（运行时通道）'));
        /* U2：桶④ 默认折叠（B6 高级后置）——哨兵 + 自调度，后续节点自动收进折叠体 */
        var tglFoldMark = el('div', 'sc-fold-mark');
        view.appendChild(tglFoldMark);
        deferFold(view, tglFoldMark, '展开后台与调度（蒸馏节流）', false, 'toggles:distill');
        // U3（B5 能力对齐）：召回融合策略（v2 回滚开关）+ 库版本化 + 认知环 6 键 —— 均在桶④折叠体内
        view.appendChild(el('div', 'sc-h3', '召回与库版本'));
        var fusRow = el('div', 'setting-item');
        var fusInfo = el('div', 'setting-item-info');
        fusInfo.appendChild(el('div', 'setting-item-name', '召回融合策略 recallFusion'));
        fusInfo.appendChild(el('div', 'setting-item-desc', 'rrf=排名融合（缺省，对离群分稳健）；weighted=旧 min-max 加权（回滚用）。阈值口径与融合解耦——始终用绝对余弦（ACT-024）'));
        fusInfo.appendChild(metaBadges('recallFusion'));
        var fusRowCtrl = el('div', 'sc-persona-slider');
        var FUS_TIERS = [['rrf', 'RRF'], ['weighted', '加权']];
        var fusMode = String(gVal('recallFusion', 'rrf'));
        FUS_TIERS.forEach(function (tier) {
          var cell = el('button', 'sc-persona-cell' + (tier[0] === fusMode ? ' active' : ''));
          cell.type = 'button';
          cell.setAttribute('role', 'radio');
          cell.setAttribute('aria-checked', tier[0] === fusMode ? 'true' : 'false');
          cell.textContent = tier[1];
          cell.title = 'recallFusion = ' + tier[0] + '（需重载生效）';
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'recallFusion', value: tier[0] }) })
              .then(function () {
                status('✓ recallFusion = ' + tier[0] + '（需重载插件生效）');
                fusRowCtrl.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); });
                cell.classList.add('active'); cell.setAttribute('aria-checked', 'true');
              })
              .catch(fail);
          };
          fusRowCtrl.appendChild(cell);
        });
        fusRow.appendChild(fusInfo); fusRow.appendChild(fusRowCtrl);
        view.appendChild(fusRow);
        view.appendChild(makeToggle('bankGit', '记忆库 git 版本化 bankGit', '每次成功写入后提交库快照（可 diff/revert；库在 ~/.dsh 下，不入公开树）。缺省开', gVal('bankGit', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（需重载生效）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        view.appendChild(el('div', 'sc-h3', '认知环（MCL · 熟悉度分流 + 有界再引导）'));
        view.appendChild(makeToggle('mclEnabled', '启用认知环 mclEnabled', '慢通道首步注入「薄契约 + top-k 指针」并按需再引导一次；快通道零额外往返。缺省开（false = 一键回滚）', gVal('mclEnabled', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（需重载生效）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        view.appendChild(numSetting('熟悉度阈值 mclFamiliarThreshold', '「用户文本 ↔ 命中索引行」的绝对余弦阈值（0–1，缺省 0.65；ACT-024 校准：0.65 → 触发率 ~2% 且阈上全为真命中）', gVal('mclFamiliarThreshold', 0.65), 'mclFamiliarThreshold', '', 0.01));
        view.appendChild(numSetting('再引导上限 mclMaxNudges', '慢通道最多再引导次数（0–3，缺省 1；绝不死锁）', gVal('mclMaxNudges', 1), 'mclMaxNudges', '次', 1));
        view.appendChild(numSetting('材料预算 mclBudgetChars', '慢通道材料硬预算（120–4000 字符，缺省 600；只作用于慢通道首步）', gVal('mclBudgetChars', 600), 'mclBudgetChars', '字符', 50));
        view.appendChild(numSetting('指针条数 mclTopK', '慢通道注入的指针条数（1–5，缺省 3）', gVal('mclTopK', 3), 'mclTopK', '条', 1));
        view.appendChild(makeToggle('mclAudit', '认知环审计流 mclAudit', '每步一行写 suite/knowledge/audit/mcl-audit.jsonl（通道/熟悉度/注入/再引导/合规）', gVal('mclAudit', true) !== false, function (key, sw) {
          api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
            .then(function () { status('✓ 已切换 ' + key + '（需重载生效）'); })
            .catch(function (e) { fail(e); sw.checked = !sw.checked; });
        }));
        // 说明文本动态化（2026-09-10）：不写死缺省值，拿到 /distill/config 后回填**当前生效值**
        var dDesc = el('div', 'sc-desc', '写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前值读取中…');
        view.appendChild(dDesc);
        var dZone = el('div');
        dZone.appendChild(el('div', 'sc-desc', '读取中…'));
        view.appendChild(dZone);
        function distillSave(patch, onFail) {
          return api('/distill/config', { method: 'POST', body: JSON.stringify(patch) })
            .then(function () { status('✓ 已写入 ' + Object.keys(patch).join(',') + '（重载后生效）'); })
            .catch(function (e) { fail(e); if (onFail) onFail(); });
        }
        function distillToggle(key, name, desc, initial) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', name));
          info.appendChild(el('div', 'setting-item-desc', desc));
          var sw = el('input', 'checkbox-container'); sw.type = 'checkbox'; sw.checked = !!initial;
          sw.onchange = function () {
            var patch = {}; patch[key] = sw.checked;
            distillSave(patch, function () { sw.checked = !sw.checked; });
          };
          item.appendChild(info); item.appendChild(sw);
          return item;
        }
        function distillInput(key, name, desc, initial, kind, min) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', name));
          info.appendChild(el('div', 'setting-item-desc', desc));
          var wrap = el('div', 'sc-num-wrap');
          var inp = el('input', 'sc-input'); inp.value = String(initial);
          if (kind === 'minutes') { inp.type = 'number'; inp.min = String(min || 1); inp.step = '1'; }
          else if (kind === 'chars') { inp.type = 'number'; inp.min = '0'; inp.step = '50'; }
          else { inp.type = 'text'; inp.placeholder = '留空=继承主会话模型'; inp.className = 'sc-input sc-w-sm'; }
          var unitEl = el('span', 'sc-range-label', kind === 'minutes' ? '分钟' : (kind === 'chars' ? '字符' : ''));
          inp.onchange = function () {
            var v;
            if (kind === 'text') v = inp.value.trim();
            else v = Math.max(kind === 'minutes' ? (min || 1) : 0, parseInt(inp.value, 10) || 0);
            var patch = {}; patch[key] = kind === 'minutes' ? v * 60000 : v;
            distillSave(patch, function () { inp.value = String(initial); });
          };
          wrap.appendChild(inp); wrap.appendChild(unitEl);
          item.appendChild(info); item.appendChild(wrap);
          return item;
        }
        api('/distill/config').then(function (d) {
          var r = (d && d.running) || {};
          var p = (d && d.persisted) || {};
          function val(k, dflt) { return r[k] != null ? r[k] : (p[k] != null ? p[k] : dflt); }
          // 动态回填当前生效值（不写死缺省）：蒸馏开关 / 空闲唤醒 / 最少字符 / 预筛 / 模型
          var curModelTxt = (function () {
            var dp = val('distillProvider', ''), dm = val('distillModel', '');
            return (dp && dm) ? (dp + '/' + dm) : '继承主会话';
          })();
          dDesc.textContent = '写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。当前：蒸馏 ' + (val('enableDistill', true) ? '开' : '关') + ' / 空闲 ' + Math.round(val('idleWakeMs', 600000) / 60000) + ' 分钟 / 本轮最少 ' + val('minTurnChars', 200) + ' 字符 / 预筛 ' + (val('distillPrescan', true) ? '开' : '关') + ' / 蒸馏模型 ' + curModelTxt + '。';
          dZone.textContent = '';
          dZone.appendChild(distillToggle('enableDistill', '守藏蒸馏器 enableDistill', '关=不注册蒸馏器（/suite 等只读视图仍可用）；改动需重载生效', val('enableDistill', true)));
          dZone.appendChild(distillToggle('distillPrescan', '零成本预筛 distillPrescan', 'spawn 前先扫增量信号词 + pending 候选，皆无则跳过（不唤醒 LLM，省成本）', val('distillPrescan', true)));
          dZone.appendChild(distillInput('idleWakeMs', '空闲唤醒 idleWakeMs', 'turn 结束后空闲满此时长才蒸馏（≥1 分钟，默认 10 分钟）', Math.round(val('idleWakeMs', 600000) / 60000), 'minutes', 1));
          dZone.appendChild(distillInput('minTurnChars', '本轮最少字符 minTurnChars', '本轮新增正文少于此值跳过蒸馏（水位仍推进；0=不设限，默认 200）', val('minTurnChars', 200), 'chars'));
          // 模型配置已移至上方「蒸馏/深睡模型」卡（2026-09-10）——此处不再重复 provider/model 文本输入
          // 2026-09-10：立即处理 pending（project-defer 回流等）——手动触发一轮蒸馏
          var pendRow = el('div', 'setting-item');
          var pendInfo = el('div', 'setting-item-info');
          pendInfo.appendChild(el('div', 'setting-item-name', '立即处理 pending 候选'));
          pendInfo.appendChild(el('div', 'setting-item-desc', '手动触发一轮蒸馏——携带 pending/ 候选（如 project-defer 降级卡）重裁决入册。workspace 反解修复后 project 卡直写工作区 devref。'));
          pendRow.appendChild(pendInfo);
          var pendBtn = el('button', 'sc-btn subtle', '立即蒸馏一次');
          pendBtn.type = 'button';
          pendBtn.classList.add('sc-btn-xs');
          pendBtn.addEventListener('click', function () {
            pendBtn.disabled = true; pendBtn.textContent = '蒸馏中…（约 1-2 分钟）';
            api('/distill/run', { method: 'POST', body: '{}' })
              .then(function (rr) {
                pendBtn.disabled = false; pendBtn.textContent = '立即蒸馏一次';
                if (rr && rr.ok) status('✓ ' + (rr.note || '蒸馏完成'));
                else status('⚠ ' + ((rr && rr.note) || '蒸馏未触发') + '——根会话活跃中会跳过，等闲置自动跑');
              })
              .catch(function (e) { pendBtn.disabled = false; pendBtn.textContent = '立即蒸馏一次'; fail(e); });
          });
          var pendCtl = el('div', 'setting-item-control'); pendCtl.appendChild(pendBtn);
          pendRow.appendChild(pendCtl);
          dZone.appendChild(pendRow);
          if (d && d.active === false) {
            dZone.appendChild(el('div', 'sc-desc', '⚠ 调度器未就绪：显示值为持久文件值，运行时值需插件激活后读取'));
          }
        }).catch(function (e) { dZone.textContent = ''; dZone.appendChild(el('div', 'sc-desc', '⚠ 读取失败：' + e.message)); });
        flushFolds(); // 同步收口：本函数所有同步 append 已完成（异步追加的内容仍在折叠体外，与旧行为一致）
      }

      function renderViewRoots(view, rootListWrap) {
        view.textContent = '';
        view.appendChild(UI.pageHead('守藏根目录', '指向含 shoucang.config.yaml 的工作区目录。该目录本身即为 Obsidian 兼容 vault（Markdown + frontmatter + [[双链]]），可用 Obsidian 直接打开。'));

        var listWrap = el('div'); rootListWrap(listWrap);
        view.appendChild(listWrap);
        var addItem = el('div', 'setting-item');
        var info = el('div', 'setting-item-info');
        info.appendChild(el('div', 'setting-item-name', '添加根目录'));
        info.appendChild(el('div', 'setting-item-desc', '绝对路径，须包含 shoucang.config.yaml'));
        var input = el('input', 'sc-input'); input.placeholder = 'D:\\…\\my-vault';
        var btn = el('button', 'sc-btn', '添加并启用');
        btn.onclick = function () {
          var p = input.value.trim(); if (!p) return;
          api('/set_root', { method: 'POST', body: JSON.stringify({ path: p }) })
            .then(function () { input.value = ''; status('✓ 根目录已启用'); refreshCurrentView(); })
            .catch(fail);
        };
        addItem.appendChild(info); addItem.appendChild(input); addItem.appendChild(btn);
        view.appendChild(addItem);

        function draw(r) {
          listWrap.textContent = '';
          if (!Derive.has(r.roots)) {
            var empty = el('div', 'setting-item');
            empty.appendChild(el('div', 'setting-item-desc', '尚未登记任何根目录——在上方输入路径添加。'));
            listWrap.appendChild(empty);
          }
          r.roots.forEach(function (root) {
            var item = el('div', 'setting-item sc-rootitem' + (root.id === r.active ? ' active' : ''));
            var dot = el('span', 'sc-dot' + (root.id === r.active ? ' on' : '')); void dot;
            item.appendChild(dot.cloneNode ? dot : dot);
            item.appendChild(el('span', 'sc-rootname', root.name));
            item.appendChild(el('span', 'sc-rootpath', root.path)).title = root.path;
            var useBtn = el('button', 'sc-btn subtle', root.id === r.active ? '当前' : '启用');
            if (root.id === r.active) useBtn.disabled = true;
            else useBtn.onclick = function () {
              api('/set_root', { method: 'POST', body: JSON.stringify({ path: root.path }) })
                .then(function () { status('✓ 已启用 ' + root.name); refreshCurrentView(); })
                .catch(fail);
            };
            item.appendChild(useBtn);
            listWrap.appendChild(item);
          });
        }
        renderViewRoots._draw = draw;
      }

      /* ---------- 页面：配置原文 ---------- */

      function renderViewYaml(view, ta, saveRow) {
        view.textContent = '';
        view.appendChild(UI.pageHead('配置原文', '直接编辑 shoucang.config.yaml 全文。保存时原文件自动备份为 .bak-时间戳。'));
        ta.id = 'sc-yaml'; ta.spellcheck = false;
        view.appendChild(ta);
        saveRow.className = 'setting-item';
        var spacer = el('div', 'setting-item-info');
        saveRow.appendChild(spacer);
        saveRow.appendChild(saveRow._btn = el('button', 'sc-btn', '保存'));
        view.appendChild(saveRow);
        /* U2（B9）：最近改动 5 条 —— 读库 git reflog + 配置 mtime（按需端点，零新增常驻注入） */
        view.appendChild(el('div', 'sc-mem-group-title', '最近改动（5 条）'));
        var recentBox = el('div', 'sc-recent');
        recentBox.appendChild(el('div', 'sc-recent-row', '读取中…'));
        view.appendChild(recentBox);
        api('/config/recent').then(function (r) {
          recentBox.textContent = '';
          var cfg = r && r.configMtime ? ('配置文件改动：' + fmtTime(r.configMtime)) : '配置文件尚无记录';
          recentBox.appendChild(el('div', 'sc-recent-row', cfg));
          var items = (r && r.recent) || [];
          if (!Derive.has(items)) { recentBox.appendChild(el('div', 'sc-recent-row', '记忆库尚无 git 快照（写入一次即出现）')); return; }
          items.forEach(function (it) {
            var row = el('div', 'sc-recent-row');
            row.appendChild(el('span', 'sc-recent-at', it.at ? fmtTime(it.at) : '-'));
            row.appendChild(el('span', 'sc-recent-msg', it.msg || ''));
            row.title = it.msg || '';
            recentBox.appendChild(row);
          });
        }).catch(function () { recentBox.textContent = ''; recentBox.appendChild(el('div', 'sc-recent-row', '读取失败（/config/recent）')); });
      }

      /* ---------- 页面：画像 / 记忆板块 ---------- */

      /** 记忆库指针行：点击打开 notes 小节（只读 /memory/sections）；pointer=null 时不跳转。 */
      function openMemoryNote(pointer, autoSection, returnRender) {
        if (!pointer) { status('该条目无 notes 跳转目标'); return; }
        var rel = String(pointer).split('§')[0].trim();
        if (!/^notes\/[a-z]+\.md$/.test(rel)) { status('指针目标非 notes 白名单：' + pointer); return; }
        memoryViewScroll = refs.view.scrollTop; // 记录进入前滚动位置（返回时恢复）
        noteReturnRender = returnRender || null; // 来源板块上下文（返回时回原板块，默认记忆板块）
        api('/memory/sections?rel=' + encodeURIComponent(rel)).then(function (r) {
          if (!r || !r.present) { status((r && r.error) || '小节不可用'); return; }
          Fold.clear('note:'); // 换笔记 ⇒ 清掉上一篇的小节开合态，避免 key 无界增长与旧态串味
          renderNoteSections(refs.view, r);
          if (autoSection) {
            /* 旧实现用 `h.click()` 模拟点击来展开——依赖 DOM 结构（nextElementSibling 恰是 body）
               且会连带触发一次真实 toggle（若该节点本就展开则反而被收起）。
               现直接对单一数据源置位，由各自的 paint 订阅同步 DOM，幂等且不碰结构。 */
            refs.view.querySelectorAll('[data-fold-key]').forEach(function (h) {
              if ((h.textContent || '').indexOf(autoSection) !== -1) Fold.set(h.getAttribute('data-fold-key'), true);
            });
          }
        }).catch(fail);
      }
      function makeMemoryPointerRow(title, pointer, meta, summary) {
        var row = el('div', 'sc-pointer');
        var main = el('div', 'sc-pointer-main');
        var head = el('div', 'sc-pointer-head');
        head.appendChild(el('span', 'sc-pointer-title', title));
        if (meta) head.appendChild(el('span', 'sc-pointer-meta', meta));
        main.appendChild(head);
        if (summary) main.appendChild(el('div', 'sc-pointer-summary', summary));
        row.appendChild(main);
        if (pointer) row.appendChild(el('span', 'sc-pointer-go', '↗'));
        var p = pointer, sec = String(pointer || '').split('§')[1] || '';
        row.addEventListener('click', function () { openMemoryNote(p, sec.trim() || null); });
        return row;
      }

      /** 标签 → 色相（tag pill 着色；未知回落品牌紫）。 */
      function idxHue(tag) {
        var map = { env: 180, tool: 212, flow: 262, lesson: 28, release: 320, 身份: 330, 偏好: 348, 习惯: 12, 硬件: 200, 环境: 190, 演化: 150, 经验: 45 };
        return map[tag] != null ? map[tag] : 254;
      }
      function idxPill(tag) {
        var h = idxHue(tag);
        var pill = el('span', 'sc-idx-tag hued', String(tag || '?'));
        // 只传色相，配色算法在 CSS（.sc-idx-tag.hued）—— 旧实现在 JS 里拼整条颜色，样式散在两处
        pill.style.setProperty('--sc-tag-h', String(h));
        pill.title = tag || '';
        return pill;
      }
      /** 索引指针行（tag pill + subject + notes 指针），点击直达 notes 小节。 */
      /** 知识索引行渲染：按 tag 语义分组排序（环境→工具→流程→教训→发布→画像→其他），组内保持书写序（稳定排序）。 */
      var TAG_ORDER = ['env', 'tool', 'flow', 'lesson', 'release', 'user', 'agent'];
      function renderIndexRows(container, lines, returnRender) {
        var arr = (lines || []).slice();
        arr.sort(function (a, b) {
          var ia = TAG_ORDER.indexOf(String(a.tag || '').toLowerCase()); if (ia === -1) ia = TAG_ORDER.length;
          var ib = TAG_ORDER.indexOf(String(b.tag || '').toLowerCase()); if (ib === -1) ib = TAG_ORDER.length;
          return ia - ib;
        });
        arr.forEach(function (ln) {
          var row = el('div', 'sc-idx-row');
          row.appendChild(idxPill(ln.tag));
          row.appendChild(el('span', 'sc-idx-subject', ln.subject || ''));
          if (ln.pointer) row.appendChild(el('span', 'sc-idx-pointer', ln.pointer));
          var ptr = ln.pointer, sec = String(ln.pointer || '').split('§')[1] || '';
          // R3：索引行只读（指针，编辑会与 notes 详情错位）——点击进详情小节，编辑在详情页做
          row.addEventListener('click', function () { openMemoryNote(ptr, sec.trim() || null, returnRender); });
          row.title = (ln.subject || '') + (ln.pointer ? ' → ' + ln.pointer : '') + ' · 点击进详情';
          container.appendChild(row);
        });
      }
      /** ISO → 本地 'MM-DD HH:MM'（蒸馏水位展示用）。 */
      function fmtTime(iso) {
        if (!iso) return '—';
        try {
          var d = new Date(iso);
          var p = function (n) { return (n < 10 ? '0' : '') + n; };
          return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        } catch (e) { return String(iso).slice(0, 16); }
      }

      /** 迷你趋势图（sparkline，Tufte）：纯 SVG 无依赖；values 全为同一值时不画（无趋势信息）。 */
      function sparkline(values, w, h) {
        if (!values || values.length < 2) return null;
        var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
        if (min === max) return null; // 无变化 → 无趋势可表达（data-ink：不画装饰性平线）
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', 'sc-spark');
        svg.setAttribute('width', w || 120); svg.setAttribute('height', h || 26);
        svg.setAttribute('viewBox', '0 0 ' + (w || 120) + ' ' + (h || 26));
        var W = (w || 120) - 4, H = (h || 26) - 6, x0 = 2, y0 = 3;
        var pts = values.map(function (v, i) {
          var x = x0 + (values.length === 1 ? 0 : i * W / (values.length - 1));
          var y = y0 + (H - (v - min) * H / (max - min));
          return [x, y];
        });
        var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        var lastPt = pts[pts.length - 1];
        var dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', lastPt[0].toFixed(1)); dot.setAttribute('cy', lastPt[1].toFixed(1)); dot.setAttribute('r', 2);
        svg.appendChild(dot);
        return svg;
      }

      /** 认知可视化（v9）：睡眠/记忆两视图共用 —— 单端点 /cognition/report。
       *  mode='sleep'：本轮产出回执 + 下轮材料预估 + 历次趋势；mode='memory'：仅归档区（冷热分布/超 R 节/指针健康 已按用户要求移除）。
       *  端点不可用=静默（不阻塞主视图）。 */
      function renderCognitionReport(view, mode) {
        api('/cognition/report').then(function (r) {
          if (!r || !r.ok) return;
          var group = function (t) { view.appendChild(el('div', 'sc-mem-group-title', t)); };
          var sleeps = r.sleeps || [], last = Derive.has(sleeps) ? sleeps[sleeps.length - 1] : null;
          if (mode === 'sleep') {
            group('本轮产出回执' + (last && last.at ? ' · ' + fmtTime(last.at) : ''));
            if (!last) { view.appendChild(el('div', 'sc-mem-empty', '（尚无深睡记录）')); }
            else {
              var wrap = el('div', 'sc-comp');
              [['新增原则', last.added], ['替换原则', last.replaced], ['画像更新', last.profiles],
               ['指针更新', last.pointers], ['树操作', last.tree],
               ['归档（遗忘）', last.forgetArchived], ['保留（遗忘）', last.forgetKept]].forEach(function (kv) {
                var line = el('div', 'sc-comp-row');
                line.appendChild(el('span', 'sc-comp-k', kv[0]));
                line.appendChild(el('span', 'sc-comp-v', String(kv[1] || 0)));
                wrap.appendChild(line);
              });
              view.appendChild(wrap);
              if (last.stop && last.stop !== 'completed') {
                view.appendChild(el('div', 'sc-ds-alert', '⚠ 上次未完成（stop=' + last.stop + '）——按「深睡水位护栏」水位已回滚，同批痕迹下轮重试'));
              }
            }
            var m = r.materials || {};
            group('下轮材料预估 · ' + (r.day || ''));
            var mw = el('div', 'sc-comp');
            [['遗忘候选（cold 且 ≥90 天零命中）', m.forget], ['加深候选（hits30≥5）', m.hot],
             ['互抑候选（§ 名重叠 0.5–0.66）', m.interference]].forEach(function (kv) {
              var line = el('div', 'sc-comp-row');
              line.appendChild(el('span', 'sc-comp-k', kv[0]));
              line.appendChild(el('span', 'sc-comp-v', String(kv[1] == null ? 0 : kv[1]) + ' 条'));
              mw.appendChild(line);
            });
            view.appendChild(mw);
            var nums = sleeps.map(function (s) { return (s.added || 0) + (s.replaced || 0); });
            var sp = sparkline(nums, 160, 28);
            if (sp) { group('历次产出趋势（原则条数 · 近 ' + nums.length + ' 次）'); view.appendChild(sp); }
          } else {
            var ar = r.archive || [];
            if (Derive.has(ar)) {
              group('归档区 notes/archive/ · ' + ar.length + ' 个文件（forgetOps 产物，复制回 notes/ 即恢复）');
              view.appendChild(el('div', 'sc-mem-sub', ar.map(function (x) { return x.file + '（' + x.chars + ' 字）'; }).join(' · ')));
            }
          }
        }).catch(function () { /* 端点不可用：静默 */ });
      }
      /** 画像板块（F-003）：USER.md/AGENT.md 画像专属视图——容量与指针行**只在此板块**展示（记忆板块不重复统计画像）。 */
      function renderPersona(view, data) {
        view.textContent = '';
        view.appendChild(UI.pageHead('画像板块', 'USER.md（用户画像）· AGENT.md（Agent 画像）——画像容量与指针行的唯一展示位（记忆板块不重复）。指针行 → 点击直达 notes/ 详情小节。'));
        if (!data || !data.present || !Derive.has(data.indexes)) {
          status((data && data.error) || '记忆库画像不可用');
          return;
        }
        var pair = data.indexes.filter(function (f) { return f.name === 'USER.md' || f.name === 'AGENT.md' });
        var totalRows = 0;
        // v9.1 画像容量卡（2026-09-11 用户拍板：**框要留**——「画像的那个框的容量怎么也删了」）：
        //   只给静态数字「已用 / 上限 + 画像条数」，**不含百分比、不含进度条、不含健康度标记**（那三类已按用户要求移除）。
        //   容量红线仍由 write_gate 在写入时强制。
        var grid = el('div', 'sc-mem-grid');
        pair.forEach(function (f) {
          var card = el('div', 'sc-mem-stat');
          card.appendChild(el('div', 'sc-mem-stat-label', f.name.replace('.md', '') + ' 容量'));
          card.appendChild(el('div', 'sc-mem-stat-value', f.chars + ' / ' + f.cap));
          card.appendChild(el('div', 'sc-mem-stat-sub', Derive.count(f.lines) + ' 条画像'));
          grid.appendChild(card);
        });
        view.appendChild(grid);

        // 指针行（tag pill + subject + pointer，点击跳 notes 小节）
        pair.forEach(function (f) {
          totalRows += Derive.count(f.lines);
          view.appendChild(el('div', 'sc-mem-group-title', f.label + ' · ' + Derive.count(f.lines)));
          if (!Derive.has(f.lines)) { view.appendChild(el('div', 'sc-mem-empty', '（暂无指针行）')); return; }
          var list = el('div', 'sc-idx-list');
          renderIndexRows(list, f.lines, renderPersona); // 画像来源：返回时回画像板块；索引行只读，编辑进详情
          view.appendChild(list);
        });
        status('画像 · ' + totalRows + ' 条指针');
      }

      /** 记忆板块（阶段4 UI 重排 2026-09-06）：分区展示——蒸馏运行 / 记忆库状态 / 知识索引 / pending / notes / 守藏知识区。
       * 去重原则：USER/AGENT 画像只在画像板块；MEMORY 容量百分比只在进度条；蒸馏水位读 suite 活水位。 */
      function renderMemoryExpanded(view, data) {
        view.textContent = '';
        view.appendChild(UI.pageHead('记忆板块', '蒸馏运行 → 记忆库状态 → 知识索引 → 候选与详情。画像（USER/AGENT）见「画像板块」。'));
        if (!data || !data.present) {
          status((data && data.error) || '记忆库不可用');
          return;
        }
        var memoryFile = null;
        (data.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') memoryFile = f; });
        var mkStat = function (label, value, sub) {
          var card = el('div', 'sc-mem-stat');
          card.appendChild(el('div', 'sc-mem-stat-label', label));
          card.appendChild(el('div', 'sc-mem-stat-value', value));
          if (sub) card.appendChild(el('div', 'sc-mem-stat-sub', sub));
          return card;
        };
        var group = function (t) { view.appendChild(el('div', 'sc-mem-group-title', t)); };
        // v9：认知可视化——仅归档区（冷热分布 / 超 R 节 / 指针健康 已按 2026-09-11 用户要求移除）
        renderCognitionReport(view, 'memory');

        /* U1（ADR-122 UI）：判据注册表卡已**移出记忆板块** → 落在「运行」视图（renderRunExtras），
         * 判因：记忆板块此前 11 组、判据卡又在最前，首屏过载（方案 §3 A5 自我修正）。 */

        /* ── §0 状态徽章行（U4，ui-impl-plan：后台进程状态可见——Cognee/dsh-auto-memory 借鉴；复用 sc-ds-badges） ── */
        var badges = el('div', 'sc-ds-badges');
        var ds0 = data.distillStats;
        /* 徽章统一入口：原先 7 枚各写三行「建 div → 塞 dot → 塞文本」，3 枚异步回填
         * 还靠 `querySelectorAll('span')[1]` 按位置取文本节点（改 DOM 结构即断）。 */
        function addBadge(text, kind) { var h = UI.dsBadge(text, kind); badges.appendChild(h.box); return h; }
        if (ds0) addBadge('蒸馏 ' + String(ds0.runs || 0) + ' 次' + (ds0.last ? '' : ' · 待命中'), (ds0.runs || 0) ? 'ended' : 'running');
        if (Derive.vectorOn(data)) {
          var vp = data.vector.provider || 'off';
          addBadge('向量 ' + Derive.vecLabel(vp), Derive.providerKind(vp, ['fusion']));
        }
        if (data.pending && data.pending.count) addBadge('候选 ' + String(data.pending.count), 'suspect');
        // U1（ADR-122 UI）：徽章扩容 3→7 —— 容量水位（同步）+ 认知环 / 判据台账 / 库版本（异步填充）
        var memFile0 = null;
        (data.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') memFile0 = f; });
        if (memFile0 && memFile0.cap) {
          var pct0 = Math.round((memFile0.chars || 0) / memFile0.cap * 100);
          addBadge('记忆 ' + pct0 + '% · ' + (memFile0.chars || 0) + '/' + memFile0.cap, Derive.capKind(pct0));
        }
        var bMcl = addBadge('认知环 …');
        var bCrit = addBadge('判据台账 …');
        var bGit = addBadge('库版本 …');
        api('/mcl/status').then(function (m) {
          bMcl.setText('认知环 ' + (m && m.active ? ('快' + (m.fast || 0) + '/慢' + (m.slow || 0)) : '未装配'))
            .setKind(m && m.active ? 'ended' : 'stalled');
        }).catch(function () { bMcl.setText('认知环 读取失败').setKind('stalled'); });
        api('/criteria').then(function (c) {
          bCrit.setText('判据台账 ' + (((c || {}).ledger || {}).rows || 0) + ' 行').setKind(c && c.active ? 'ended' : 'stalled');
          var bg = (c || {}).bankGit || {};
          bGit.setText('库版本 ' + (bg.commits || 0) + ' 提交').setKind((bg.commits || 0) ? 'ended' : 'stalled');
        }).catch(function () { bCrit.setText('判据台账 读取失败').setKind('stalled'); });
        if (Derive.has(badges.childNodes)) view.appendChild(badges);

        /* ── §1 蒸馏运行（等大一排；sparkline 保留在卡内） ── */
        group('蒸馏运行');
        var g1 = el('div', 'sc-mem-grid');
        var ds = data.distillStats;
        if (ds) {
          var byRoute = ds.byRoute || {};
          var routeParts = [];
          ['memory', 'project', 'discard'].forEach(function (k) { if (byRoute[k]) routeParts.push(k + ' ' + byRoute[k]); });
          var heroSub = '入册 ' + String(ds.added || 0) + ' 条';
          var warnText = '';
          if (!(ds.runs || 0)) {
            heroSub = '待命中：会话空闲 10 分钟后自动蒸馏'; // 空状态：解释机制 + 预期（NN/g）
          } else {
            var byDay = ds.byDay || [];
            var today = byDay[byDay.length - 1], yday = byDay[byDay.length - 2];
            if (today && yday && today.runs !== yday.runs) heroSub += ' · 今日 ' + today.runs + ' 次（昨日 ' + yday.runs + '）';
            if ((ds.failed || 0) > 0 || (ds.gateRejects || 0) > 0) warnText = '失败 ' + String(ds.failed || 0) + (ds.gateRejects ? ' · 门拒 ' + ds.gateRejects : '');
          }
          var hero = mkStat('守藏蒸馏', String(ds.runs || 0) + ' 次', heroSub);
          hero.appendChild(el('div', 'sc-mem-stat-sub', '近 7 日入册趋势'));
          var spark = sparkline((ds.byDay || []).map(function (d) { return d.added; }), 130, 24);
          if (spark) hero.appendChild(spark);
          if (warnText) {
            var warn = el('div', 'sc-mem-stat-sub');
            warn.appendChild(el('span', 'sc-danger', warnText)); // 语义色仅强化，文字数字仍是唯一信息通道（色盲可达）
            hero.appendChild(warn);
          }
          g1.appendChild(hero);
          // 伴卡：路由分布
          g1.appendChild(mkStat('路由分布', Derive.has(routeParts) ? routeParts.join(' / ') : '—', (ds.rejected || 0) + ' 拒收' + ((ds.rejected || 0) || (ds.failed || 0) ? '' : ' · 全部放行')));
          // 伴卡：蒸馏水位
          var dLast = data.distill && data.distill.last;
          g1.appendChild(mkStat('蒸馏水位', dLast ? fmtTime(dLast.at) : '—', dLast ? ('lastSeq ' + String(dLast.lastSeq) + ' · ' + String(dLast.sessionId || '').replace(/^session-/, '').slice(0, 8)) : 'watcher 事件驱动'));
        }
        view.appendChild(g1);

        /* ── 路线③ 本月成长（审计聚合 + AGENT 画像快照；零定时器，纯读） ── */
        var gGrowth = data.growth;
        if (gGrowth) {
          group('本月成长 · ' + gGrowth.month);
          var g3 = el('div', 'sc-mem-grid');
          var s3 = gGrowth.sleep || {}, d3 = gGrowth.distill || {}, n3 = gGrowth.now || {};
          g3.appendChild(mkStat('深睡归纳', String(s3.passes || 0) + ' 次', '习得 ' + String(s3.principleAdded || 0) + ' · 替换 ' + String(s3.replaced || 0) + ' · 画像 ' + String(s3.profilesAdded || 0)));
          g3.appendChild(mkStat('蒸馏', String(d3.runs || 0) + ' 次', '成功 ' + String(d3.ok || 0) + ' · 异常 ' + String(d3.bad || 0) + ' · 预筛跳过 ' + String(d3.skips || 0)));
          g3.appendChild(mkStat('AGENT 画像', String(n3.tagRows != null ? n3.tagRows : '—') + ' 行', '原则 ' + String(n3.principleRows || 0) + ' · 路径 ' + String(n3.pathRows || 0) + ' · ' + String(n3.agentChars || 0) + ' 字符'));
          view.appendChild(g3);
          var rds = gGrowth.recentDeep || [];
          if (Derive.has(rds)) {
            view.appendChild(el('div', 'sc-mem-group-title', '本月有效深睡产出'));
            var dl3 = el('div', 'sc-idx-list');
            rds.forEach(function (r) {
              dl3.appendChild(el('div', 'sc-mem-sub', String(r.at || '').slice(0, 10) + '  原则 +' + String(r.added || 0) + '/替换 ' + String(r.replaced || 0) + ' · 画像 +' + String(r.profiles || 0) + ' · gate=' + String(r.gate || '')));
            });
            view.appendChild(dl3);
          } else if ((s3.passes || 0) > 0) {
            view.appendChild(el('div', 'sc-mem-empty', '本月深睡有运行但无产出（内容判据合规保守：材料不足宁缺毋滥）'));
          }
        }

        /* ── §2 记忆库状态（MEMORY 容量 + pending；百分比只在进度条，卡不重复） ── */
        group('记忆库状态');
        var g2 = el('div', 'sc-mem-grid');
        // v9：MEMORY.md 容量卡与容量健康行**整体移除**（用户拍板 2026-09-11：「板块容量健康度都直接不需要」）
        //   保留「索引 N 行」这一条纯计数信息（非容量健康度），容量红线仍由 write_gate 强制。
        if (memoryFile) g2.appendChild(mkStat('知识索引', String(Derive.count(memoryFile.lines)) + ' 行', 'MEMORY.md'));
        var pMeta = data.pending || {};
        var pSub = 'ADD-only 暂存 · 非权威';
        if (pMeta.count && typeof pMeta.last24h === 'number' && pMeta.last24h > 0) pSub = '24h 内新增 ' + pMeta.last24h + ' 条 · 蒸馏分批消化';
        g2.appendChild(mkStat('pending 候选', String(pMeta.count || 0), pSub));
        // 归档队列降级为次级卡（守藏语境的 so-what 弱：数据保留但不占蒸馏主行）
        var undone = data.queue ? data.queue.undone : 0;
        g2.appendChild(mkStat('待归档会话', String(undone), undone ? '记忆插件归档队列' : '无积压'));
        view.appendChild(g2);

        /* ── §3 知识索引 MEMORY.md（progressive disclosure：默认 8 条 + 展开全部） ── */
        if (Derive.has(memoryFile && memoryFile.lines)) {
          group('知识索引 MEMORY.md · ' + memoryFile.lines.length + ' 条');
          view.appendChild(el('div', 'sc-desc', '点击行直达 notes 详情小节（只读）。'));
          var idxWrap = el('div');
          idxWrap.classList.add('sc-box');
          var IDX_PREVIEW = 8;
          var allLines = memoryFile.lines || [];
          renderIndexRows(idxWrap, allLines.slice(0, IDX_PREVIEW), renderMemoryExpanded);
          if (allLines.length > IDX_PREVIEW) {
            var moreBtn = el('button', 'sc-idx-more', '展开全部 ' + allLines.length + ' 条');
            moreBtn.type = 'button';
            moreBtn.addEventListener('click', function () {
              idxWrap.textContent = '';
              renderIndexRows(idxWrap, allLines);
            });
            idxWrap.appendChild(moreBtn);
          }
          view.appendChild(idxWrap);
        }

        /* ── §4 pending 候选队列（U5：行尾加批准/忽略——Cursor/Mem0 审核态借鉴；写走 /memory/approve 门禁） ── */
        if (data.pending && data.pending.count) {
          group('pending 候选队列 · ' + data.pending.count + ' 条');
          var plist = el('div', 'sc-pointer-list');
          (data.pending.recent || []).forEach(function (p2) {
            var row = makeMemoryPointerRow(String(p2.name || '').replace(/\.md$/, ''), null, (p2.mtime || '').slice(0, 10));
            // 批准=确认有价值（移 .processed 跳过后续蒸馏裁决）；忽略=同语义手动处置；均只读安全
            var act = el('div', 'sc-row-gap');
            var fname = String(p2.name || '');
            var okBtn = el('button', 'sc-btn subtle', '批准');
            okBtn.type = 'button';
            okBtn.classList.add('sc-btn-xs', 'sc-btn-ok');
            okBtn.addEventListener('click', function () {
              api('/memory/approve', { method: 'POST', body: JSON.stringify({ pendingFile: fname }) })
                .then(function () { status('✓ 已批准 ' + fname + '（移 .processed，内容由蒸馏正常入册）'); })
                .catch(fail);
            });
            var rmBtn = el('button', 'sc-btn subtle', '忽略');
            rmBtn.type = 'button';
            rmBtn.classList.add('sc-btn-xs', 'sc-btn-muted');
            rmBtn.addEventListener('click', function () {
              if (!window.confirm('忽略并移出候选队列：' + fname + '？')) return;
              api('/memory/approve', { method: 'POST', body: JSON.stringify({ pendingFile: fname }) })
                .then(function () { status('已忽略 ' + fname); })
                .catch(fail);
            });
            act.appendChild(okBtn); act.appendChild(rmBtn);
            row.appendChild(act);
            plist.appendChild(row);
          });
          view.appendChild(plist);
          view.appendChild(el('div', 'sc-desc', '共 ' + data.pending.count + ' 条（仅显示最近 ' + Derive.count(data.pending.recent) + ' 条）· 批准=确认有价值入册，忽略=移出队列'));
        }

        /* U1：折叠哨兵 —— 之后的所有组（notes 详情 / 本地知识区 / 向量召回 / delta / 周增量）收进「展开更多」。
         * 用 setTimeout(0) 自调度：本函数同步渲染完毕后才折叠，故无需改动任何后续分组代码（易回滚）。 */
        var foldMark = el('div', 'sc-fold-mark');
        view.appendChild(foldMark);
        deferFold(view, foldMark, '展开更多（notes 详情 / 本地知识区 / 向量 / 成长增量）', false, 'memory:more');
        /* ── §5 notes 详情小节 ── */
        group('notes 详情小节');
        var nw = el('div', 'sc-notes-list');
        (data.notes || []).forEach(function (nf) {
          var chip = el('div', 'sc-note-chip');
          chip.appendChild(el('span', null, nf.name));
          chip.appendChild(el('span', 'sc-tag', String(nf.sections.length)));
          chip.title = nf.rel + ' · ' + nf.sections.map(function (s) { return s.title }).join(' / ');
          chip.addEventListener('click', function () {
            memoryViewScroll = view.scrollTop; // 记录进入前滚动位置（返回时恢复）
            noteReturnRender = null; // 来源=记忆板块
            api('/memory/sections?rel=' + encodeURIComponent(nf.rel)).then(function (r) {
              renderNoteSections(view, r);
            }).catch(fail);
          });
          nw.appendChild(chip);
        });
        view.appendChild(nw);

        /* ── §6 守藏本地知识区（单行摘要，不再重复三索引卡；画像/索引详情在画像与记忆分区） ── */
        var suite = data.suite;
        if (suite && suite.present) {
          group('守藏本地知识区 · suite/knowledge');
          var sMemory = null;
          (suite.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') sMemory = f; });
          view.appendChild(el('div', 'sc-desc', '守藏蒸馏器事实源（ADR-0002）：MEMORY ' + (sMemory ? sMemory.chars + '/' + sMemory.cap + ' · ' + Derive.count(sMemory.lines) + ' 行' : '—') + ' · pending ' + String(suite.pending ? suite.pending.count : 0) + ' 条。'));
          if (Derive.has(suite.notes)) {
            var snw = el('div', 'sc-notes-list');
            suite.notes.forEach(function (nf) {
              var chip = el('div', 'sc-note-chip');
              chip.appendChild(el('span', null, nf.name));
              chip.appendChild(el('span', 'sc-tag', String(nf.sections.length)));
              chip.title = 'suite · ' + nf.rel + ' · ' + nf.sections.map(function (s) { return s.title }).join(' / ');
              chip.addEventListener('click', function () {
                memoryViewScroll = view.scrollTop; // 记录进入前滚动位置（返回时恢复）
                noteReturnRender = null; // 来源=记忆板块（suite 区板块本身在记忆视图内）
                api('/memory/sections?rel=' + encodeURIComponent(nf.rel) + '&root=suite').then(function (r) {
                  renderNoteSections(view, r);
                }).catch(fail);
              });
              snw.appendChild(chip);
            });
            view.appendChild(snw);
          }
        } else {
          view.appendChild(el('div', 'sc-mem-empty', '守藏本地知识区未启用（suite/knowledge 不存在）'));
        }

        /* ── §7 向量召回状态（U4，ui-impl-plan：只读展示真实链路 vec.ts+GPU；复用 sc-mem-grid/sc-ds-badges） ── */
        if (Derive.vectorOn(data)) {
          group('向量召回 · ' + (data.vector.provider || 'off'));
          var g7 = el('div', 'sc-mem-grid');
          g7.appendChild(mkStat('provider', String(data.vector.provider || '—'), '本机 OpenAI 兼容端点（Ollama 11434 / 自建桥 9915 / LM Studio 1234）'));
          g7.appendChild(mkStat('向量缓存', String(data.vector.cacheLines || 0) + ' 行', '行 hash 惰性补齐 · 可随时重建'));
          g7.appendChild(mkStat('语义召回', Derive.vecRecall(data.vector.provider), 'dense0.7 ⊕ lexical0.3'));
          view.appendChild(g7);
          if (Derive.providerDown(data.vector.provider)) {
            view.appendChild(el('div', 'sc-mem-empty', '向量服务未就绪（本机端点，如 Ollama :11434 / 自建桥 :9915）——词法召回兜底运行，语义召回待服务启动'));
          }
        }

        /* ── §8 晨起摘要 delta（U4：深睡产出可见物；只读，存在才渲染） ── */
        if (data.delta && data.delta.present && Derive.has(data.delta.rows)) {
          group('最近成长 delta · 深睡产出');
          var dl8 = el('div', 'sc-idx-list');
          data.delta.rows.forEach(function (row) {
            var r8 = el('div', 'sc-idx-row');
            r8.appendChild(el('span', 'sc-idx-subject', String(row).replace(/^\[/, '[')));
            dl8.appendChild(r8);
          });
          view.appendChild(dl8);
          var staleNote = '';
          if (data.delta.staleAt) {
            try { var remain = Math.max(0, new Date(data.delta.staleAt) - Date.now()); staleNote = ' · 剩余 ' + Math.ceil(remain / 3600e3) + 'h 有效'; } catch (e) { /* */ }
          }
          view.appendChild(el('div', 'sc-mem-sub muted', '本次深睡归纳产出（48h 有效' + staleNote + '）· 已在会话注入可见'));
        }

        /* ── §9 本周成长 diff（U4：增量可见物——Basic Memory 借鉴：总量已有成长卡，此处补增量） ── */
        if (data.weekDiff && ((data.weekDiff.deepAdded || 0) > 0)) {
          group('本周成长 · 增量');
          var g9 = el('div', 'sc-mem-grid');
          g9.appendChild(mkStat('深睡新习得', String(data.weekDiff.deepAdded || 0) + ' 条', '近 7 天 [原则]/[路径] 归纳'));
          view.appendChild(g9);
        }

        status('记忆 · MEMORY ' + (memoryFile ? memoryFile.chars + '/' + memoryFile.cap + ' · ' + Derive.count(memoryFile.lines) + ' 行' : '不可用') + ' · 蒸馏 ' + (ds ? String(ds.runs || 0) + ' 次' : '—'));
        flushFolds(); // 同步收口（见 deferFold 注释：消除 setTimeout 造成的"先铺开再收起"抖动）
      }

      /* notes 小节的稳定折叠键：rel + 层级路径 + 标题。
       * 带路径是必要的——同一笔记里不同层级的兄弟小节可能同名，只按标题取键会互相串状态。 */
      function secFoldKey(rel, path, title) {
        return 'note:' + (rel || '') + ':' + (path || '') + '§' + (title || '');
      }

      /** notes 小节正文浏览（只读；/memory/sections）。返回时恢复来源板块与滚动位置（记忆/画像/守藏区均可进入）。 */
      var memoryViewScroll = 0; // 进二级视图前的 .sc-view 滚动位置
      var noteReturnRender = null; // 来源板块渲染器（null=记忆板块 renderMemoryExpanded）
      function renderNoteSections(view, data) {
        if (!data || !data.present || !data.sections) { status((data && data.error) || '无小节'); return; }
        view.textContent = '';
        view.appendChild(UI.pageHead(data.name, (data.root === 'suite' ? 'suite 知识区 · ' : '') + data.rel + ' · ' + data.sections.length + ' 个小节（白名单只读）'));
        var back = el('button', 'sc-btn subtle', '← 返回' + (noteReturnRender === renderPersona ? '画像板块' : data.root === 'suite' ? '守藏知识区' : '记忆库'));
        back.type = 'button';
        back.addEventListener('click', function () {
          var backRender = noteReturnRender || renderMemoryExpanded;
          api('/memory/overview').then(function (r) {
            backRender(view, r);
            requestAnimationFrame(function () { view.scrollTop = memoryViewScroll; }); // 恢复滚动位置，不跳顶
          }).catch(fail);
        });
        view.appendChild(back);
        view.scrollTop = 0; // 二级视图自身从顶部开始读
        // U5：反链聚合（Logseq/思源借鉴）——引用此文件小节的来源清单
        if (Derive.has(data.backrefs)) {
          var bl = el('div');
          bl.appendChild(el('div', 'sc-mem-group-title', '被引用 · ' + data.backrefs.length));
          var bList = el('div', 'sc-idx-list');
          data.backrefs.slice(0, 8).forEach(function (br) {
            var row = el('div', 'sc-idx-row');
            row.appendChild(el('span', 'sc-idx-tag', String(br.from || '').split('/').pop()));
            row.appendChild(el('span', 'sc-idx-subject', String(br.line || '').slice(0, 90)));
            row.title = br.line || '';
            bList.appendChild(row);
          });
          bl.appendChild(bList);
          if (data.backrefs.length > Derive.BACKREF_LIMIT) bl.appendChild(el('div', 'sc-mem-sub muted', '… 共 ' + data.backrefs.length + ' 处引用'));
          view.appendChild(bl);
        }
        // v5.4 树状：递归渲染小节树（## 顶层 → children ###/#### 子树逐层展开）
        /* 状态改造（原实现最脆的一处）：旧代码**从 DOM 反推开合**
         *   `var open = !body.classList.contains('sc-hidden') || !kidsWrap.classList.contains('sc-hidden')`
         * ⇒ ① 状态与渲染互为因果，任何重绘/编程改动即失同步（保存小节后整棵树塌回）；
         *    ② 父节点 open 依赖子容器 class，嵌套项相互影响；③ 无法预置、无法禁用。
         * 现改为：开合只由 Fold 中该节点 key 的值决定，DOM 仅负责把状态画出来。 */
        function renderSecNode(sec, depth, container, path) {
          var pad = Math.min(depth, 4) * 14; // 子树缩进（最多 4 层视觉缩进）
          var hasKids = !!(sec.children && sec.children.length);
          var key = secFoldKey(data.rel, path, sec.title);
          var head = el('div', 'sc-mem-group-title' + (depth > 0 ? ' sub' : ''));
          var arrow = el('span', 'sc-sec-arrow');
          head.appendChild(arrow);
          head.appendChild(document.createTextNode(sec.title));
          head.title = '点击展开/收起' + (depth > 0 ? '（子树）' : '');
          head.classList.add('sc-card-head'); // U2.5b：cursor/布局入 CSS；动态缩进走 --sc-indent
          head.setAttribute('data-fold-key', key); // 供 openMemoryNote 精确置位（替代模拟 click）
          if (pad) head.style.setProperty('--sc-indent', pad + 'px');
          var body = el('div', 'sc-card-body');
          body.textContent = sec.body || (hasKids ? '' : '（空小节）');
          var editSec = el('button', 'sc-btn subtle sc-edit-sec', '✎ 编辑此小节');
          editSec.type = 'button';
          if (pad) editSec.style.setProperty('--sc-indent', pad + 'px');
          editSec.addEventListener('click', function () { editNoteSection(data, sec, view); });
          var kidsWrap = el('div');

          function paint(open) {
            body.classList.toggle('sc-hidden', !open);
            editSec.classList.toggle('sc-hidden', !open);
            kidsWrap.classList.toggle('sc-hidden', !open || !hasKids); // 无子节点 ⇒ 容器恒空
            arrow.textContent = open ? '▾' : '▸';
            head.classList.toggle('sc-on', open);
          }
          paint(Fold.get(key, false)); // 先画后插：插入即正确开合态，无闪动
          head.addEventListener('click', function () { paint(Fold.toggle(key, false)); });
          var off = Bus.on('fold', function (p) {
            if (!head.isConnected && !body.isConnected) { off(); return; }
            if (p && p.key === key) paint(Fold.get(key, false));
          });

          container.appendChild(head);
          container.appendChild(body);
          container.appendChild(editSec);
          if (hasKids) {
            var kidPath = (path ? path + '/' : '') + sec.title;
            (sec.children || []).forEach(function (c) { renderSecNode(c, depth + 1, kidsWrap, kidPath); });
            container.appendChild(kidsWrap);
          }
        }
        (data.sections || []).forEach(function (sec) { renderSecNode(sec, 0, view, ''); });
        status(data.rel + ' · ' + Derive.count(data.sections) + ' 顶层小节（树状，点击逐层展开；编辑在节点细节）');
      }
      /** R3：notes 小节正文编辑（走 /memory/section-edit 门禁；索引指针不动，只改详情正文） */
      function editNoteSection(data, sec, view) {
        if (!data || !data.rel || !sec) return;
        var bodyTxt = sec.body || '';
        var ta = el('textarea', 'sc-input sc-ta');
        ta.value = bodyTxt;
        var wrap = el('div');
        wrap.appendChild(el('div', 'sc-desc', '编辑 §' + sec.title + ' 正文（' + data.rel + '）——保留开头摘要行最佳；保存走写门（备份+容量红线），索引指针不变。'));
        wrap.appendChild(ta);
        var bar = el('div', 'sc-toolbar');
        var saveBtn = el('button', 'sc-btn', '保存正文');
        saveBtn.type = 'button';
        saveBtn.addEventListener('click', function () {
          var next = ta.value.trim();
          if (!next) { status('正文不能为空——如需清空请用删除'); return; }
          saveBtn.disabled = true; saveBtn.textContent = '保存中…';
          api('/memory/section-edit', { method: 'POST', body: JSON.stringify({ rel: data.rel, section: sec.title, newBody: next }) })
            .then(function () { status('✓ §' + sec.title + ' 正文已保存（write_gate 通过）'); api('/memory/sections?rel=' + encodeURIComponent(data.rel) + (data.root === 'suite' ? '&root=suite' : '')).then(function (r) { renderNoteSections(view, r); }).catch(fail); })
            .catch(function (e) { saveBtn.disabled = false; saveBtn.textContent = '保存正文'; fail(e); });
        });
        var cancelBtn = el('button', 'sc-btn subtle', '取消');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', function () { view.removeChild(wrap); });
        bar.appendChild(saveBtn); bar.appendChild(cancelBtn);
        wrap.appendChild(bar);
        view.appendChild(wrap);
      }

      /** 记忆板块：Obsidian 仓库文件夹（文件树 + 笔记预览 + 属性块 + 双链跳转）。 */
      /* ---------- 组装 ---------- */

      var VIEWS = [
        ['persona', '画像板块', 'persona', '记忆'],
        ['memory', '记忆板块', 'memory', '记忆'],
        ['suite', '插件集合', 'file', '运行'],
        ['deepsleep', '深度睡眠', 'toggles', '运行'],
        ['observe', '运行观测', 'toggles', '运行'],
        ['toggles', '参数调节', 'toggles', '配置'],
        ['settings', '界面设置', 'toggles', '配置'],
        ['file', '配置原文', 'file', '配置']
      ];

      /* ---------- 运行观测视图（C1 进度 / C2 日志 / C3 错误定位 / C4 指标） ---------- */
      function renderViewObserve(view) {
        view.textContent = '';
        view.appendChild(UI.pageHead('运行观测', '执行进度、调用日志、错误定位与关键指标。日志保留最近 500 条，错误带端点/参数/堆栈，便于定位而非只剩一行提示。'));

        // 1) 进度
        var pbox = el('div');
        var p = Store.get('progress') || {};
        var ids = Object.keys(p);
        if (!Derive.has(ids)) pbox.appendChild(el('div', 'sc-desc', '当前无进行中的任务。'));
        else ids.forEach(function (id) { pbox.appendChild(UI.progress(id)); });
        view.appendChild(UI.collapsible('执行进度', pbox, { open: true, summary: ids.length + ' 项' }));

        // 2) 错误（C3 可定位）
        var errs = Store.get('errors') || [];
        var ebox = el('div');
        if (!Derive.has(errs)) ebox.appendChild(el('div', 'sc-desc', '暂无错误。'));
        else {
          var list = el('div');
          errs.slice().reverse().slice(0, 30).forEach(function (r) {
            var ctx = r.ctx;
            var where = ctx ? ((ctx.method || '') + ' ' + (ctx.path || '') + (ctx.params ? ' ' + JSON.stringify(ctx.params) : '')) : '—';
            list.appendChild(UI.collapsible(
              new Date(r.t).toLocaleTimeString() + '  ' + r.message,
              UI.kv([['端点', where], ['堆栈', r.stack || '—']]),
              {}
            ));
          });
          ebox.appendChild(list);
          ebox.appendChild(UI.button('清空错误', function () { Store.set('errors', []); refreshCurrentView(); }, { danger: true, confirm: '确认清空错误记录？' }));
        }
        view.appendChild(UI.collapsible('错误定位', ebox, { open: errs.length > 0, summary: errs.length + ' 条' }));

        // 3) 关键指标（C4）
        var mbox = el('div');
        var m = Store.get('metrics') || {};
        var mk = Object.keys(m);
        if (!Derive.has(mk)) mbox.appendChild(el('div', 'sc-desc', '暂无指标（切换各视图会自动采集）。'));
        else mbox.appendChild(UI.kv(mk.map(function (k) { return [k, String(m[k])]; })));
        view.appendChild(UI.collapsible('关键指标', mbox, { open: true }));

        // 4) 日志（C2）
        view.appendChild(UI.collapsible('调用日志', buildLogPanel(400), { open: true, summary: Derive.count(Store.get('logs')) + ' 条' }));

        /* 运维操作（B1）：为后端已实现但界面无入口的端点补齐入口 —— /embed/test、/root/bootstrap */
        var ops = el('div');
        var embedRes = el('div', 'sc-desc', '未测试');
        ops.appendChild(UI.item('嵌入服务连通性', 'POST /embed/test —— 验证当前 embedding 配置是否可用（配完即可验证，不必等实际调用失败）。',
          UI.button('测试连接', function () {
            embedRes.textContent = '读取配置…';
            // /embed/test 需要 { baseUrl, apiKey }——先从 /embed/config 取当前配置再测（不可发空 body）
            return api('/embed/config').then(function (c) {
              var g = (c && c.global) || {};
              var baseUrl = String(g.embedBaseUrl || '').trim();
              if (!baseUrl) { embedRes.textContent = '✗ 未配置 embedBaseUrl，请先到「参数调节」填写。'; return; }
              embedRes.textContent = '测试中… ' + baseUrl;
              return apiCtx('/embed/test', {
                method: 'POST',
                body: JSON.stringify({ baseUrl: baseUrl, apiKey: String(g.embedApiKey || '').trim() })
              }, '嵌入连通性').then(function (r) {
                var n = Derive.count(r && r.models);
                embedRes.textContent = (r && r.error) ? ('✗ ' + r.error) : ('✓ 可达 · ' + n + ' 个模型');
                Log.info('嵌入服务连通性测试' + ((r && r.error) ? '失败：' + r.error : '通过'));
              });
            }).catch(function (e) { embedRes.textContent = '✗ ' + e.message; });
          }, { async: true, busyText: '测试中…', okText: '嵌入连通性测试完成' }), {}));
        ops.appendChild(embedRes);

        var bootRes = el('div', 'sc-desc', '未执行');
        ops.appendChild(UI.item('根目录引导', 'POST /root/bootstrap —— 初始化/修复记忆根目录结构。',
          UI.button('执行引导', function () {
            if (!confirm('执行根目录引导会尝试创建缺失的目录结构，确认继续？')) return;
            bootRes.textContent = '执行中…';
            return apiCtx('/root/bootstrap', { method: 'POST', body: JSON.stringify({}) }, '根目录引导')
              .then(function (r) { bootRes.textContent = '✓ ' + JSON.stringify(r).slice(0, 240); })
              .catch(function (e) { bootRes.textContent = '✗ ' + e.message; });
          }, { async: true, busyText: '执行中…' }), {}));
        ops.appendChild(bootRes);

        view.appendChild(UI.collapsible('运维操作', ops, { open: false }));

        /* 高级（B1 收口）：/memory/edit · /memory/remove 为**行级**原语，作用对象是记忆文件本身。
         * 注意：既有设计 R3 明确「索引行只读——直接改索引行会与 notes 详情错位」，常规编辑请走小节编辑
         * （/memory/section-edit）。此处仅为「无死角入口」要求暴露，并附显式风险提示，默认折叠。 */
        var adv = el('div');
        adv.appendChild(el('div', 'sc-desc', '⚠ 行级直接改写记忆文件。改索引行可能导致指针与 notes 正文不一致（详见 R3），常规编辑请用「记忆板块 → 小节编辑」。'));
        var fInp = UI.input('MEMORY.md', null, { placeholder: '文件，如 MEMORY.md / notes/lessons.md', width: '260px', ariaLabel: '记忆文件' });
        var lInp = UI.input('', null, { placeholder: '待匹配的原始行文本', width: '320px', ariaLabel: '原始行' });
        var nInp = UI.input('', null, { placeholder: '新行文本（仅编辑需要）', width: '320px', ariaLabel: '新行' });
        adv.appendChild(UI.item('目标文件', 'isWritable 白名单内的记忆文件。', fInp, {}));
        adv.appendChild(UI.item('原始行', '必须与原文件中的一行完全一致（后端按行匹配）。', lInp, {}));
        adv.appendChild(UI.item('新行文本', '编辑时必填；删除时忽略。', nInp, {}));
        var advRes = el('div', 'sc-desc', '未执行');
        var row = el('div', 'sc-toolbar'); // 与全站「操作按钮行」同一原语（旧实现三行内联样式各写各的间距）
        row.appendChild(UI.button('按行编辑', function () {
          var file = fInp.value.trim(), line = lInp.value.trim(), nt = nInp.value.trim();
          if (!file || !line || !nt) { advRes.textContent = '✗ 文件 / 原始行 / 新行 三项均必填'; return; }
          return apiCtx('/memory/edit', { method: 'POST', body: JSON.stringify({ file: file, line: line, newText: nt }) }, '行级编辑')
            .then(function () { advRes.textContent = '✓ 已改写该行'; Log.warn('行级编辑已执行（可能需同步索引）：' + file); })
            .catch(function (e) { advRes.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '提交中…' }));
        row.appendChild(UI.button('按行删除', function () {
          var file = fInp.value.trim(), line = lInp.value.trim();
          if (!file || !line) { advRes.textContent = '✗ 文件与原始行必填'; return; }
          if (!confirm('确认删除该行？此操作不可撤销（会由写门备份）。\n\n' + line)) return;
          return apiCtx('/memory/remove', { method: 'POST', body: JSON.stringify({ file: file, line: line }) }, '行级删除')
            .then(function () { advRes.textContent = '✓ 已删除该行'; Log.warn('行级删除已执行（可能需同步索引）：' + file); })
            .catch(function (e) { advRes.textContent = '✗ ' + e.message; });
        }, { async: true, busyText: '提交中…', danger: true, confirm: '确认执行行级删除？' }));
        adv.appendChild(row);
        adv.appendChild(advRes);
        view.appendChild(UI.collapsible('高级：行级编辑 / 删除（谨慎）', adv, { open: false }));
      }

      /* 日志面板（状态栏上方 + 观测视图共用） */
      function buildLogPanel(maxH) {
        var wrap = el('div', 'sc-logwrap');
        if (maxH) wrap.style.setProperty('--sc-log-h', maxH + 'px'); // 高度走变量（CSS 兜底 150px）
        var head = el('div', 'sc-log-head');
        head.appendChild(el('span', null, '日志'));
        var lvSel = UI.select(
          [{ value: 'info', label: '全部' }, { value: 'warn', label: '警告+' }, { value: 'error', label: '仅错误' }],
          Cfg.get('logLevel', 'info'),
          function (v) { Cfg.set('logLevel', v); render(); }
        );
        lvSel.setAttribute('aria-label', '日志级别');
        head.appendChild(lvSel);
        var cnt = el('span', null, '');
        head.appendChild(cnt);
        head.appendChild(el('span', 'sc-spacer')); // 推右侧（原为内联 marginLeft:auto）
        head.appendChild(UI.button('清空', function () { Log.clear(); render(); }));
        wrap.appendChild(head);
        var body = el('div');
        wrap.appendChild(body);
        var ORDER = { info: 0, warn: 1, error: 2 };
        function render() {
          var min = ORDER[Cfg.get('logLevel', 'info')] || 0;
          var all = (Store.get('logs') || []).filter(function (l) { return (ORDER[l.level] || 0) >= min; });
          cnt.textContent = all.length + ' 条';
          body.textContent = '';
          if (!Derive.has(all)) { body.appendChild(el('div', 'sc-log-row', '（无）')); return; }
          all.slice(-200).reverse().forEach(function (l) {
            var row = el('div', 'sc-log-row sc-log-' + l.level);
            row.appendChild(el('span', 'sc-log-t', new Date(l.t).toLocaleTimeString()));
            row.appendChild(el('span', 'sc-log-lv', l.level));
            row.appendChild(el('span', 'sc-log-msg', l.msg + (l.ctx && l.ctx.path ? '  ⟨' + l.ctx.path + '⟩' : '')));
            body.appendChild(row);
          });
        }
        render();
        Bus.on('log', render);
        return wrap;
      }

      /* ---------- 界面设置视图（自由度：密度/布局/刷新/日志；统一配置入口 D5） ---------- */
      function renderViewSettings(view) {
        view.textContent = '';
        view.appendChild(UI.pageHead('界面设置', '把此前写死的行为参数化：显示密度、导航宽度、自动刷新与轮询频率、日志与概览方式。设置保存在浏览器 localStorage，立即生效。'));

        // 外观
        var look = el('div');
        look.appendChild(UI.item('显示密度', '紧凑模式隐藏描述文字、压缩行高，提升信息密度。',
          UI.select([{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }], Cfg.get('density', 'comfortable'),
            function (v) { Cfg.set('density', v); applyDensity(); }), {}));
        look.appendChild(UI.item('导航宽度', '左侧导航像素宽度（140–320）；窄屏（≤900px）由响应式断点接管。',
          UI.input(Cfg.get('navWidth', 216), function (v) {
            var n = parseInt(v, 10); if (isNaN(n)) return;
            Cfg.set('navWidth', Math.max(140, Math.min(320, n))); applyNavWidth();
          }, { type: 'number', width: '120px', ariaLabel: '导航宽度' }), {}));
        view.appendChild(UI.collapsible('外观', look, { open: true }));

        // 行为
        var beh = el('div');
        beh.appendChild(UI.item('打开时自动刷新', '打开面板即重新拉取当前视图数据。',
          UI.toggle(Cfg.get('autoRefresh', true), function (v) { Cfg.set('autoRefresh', v); }), {}));
        beh.appendChild(UI.item('轮询间隔（毫秒）', '0 = 关闭轮询。影响运行态数据刷新频率。',
          UI.input(Cfg.get('refreshMs', 60000), function (v) {
            var n = parseInt(v, 10); if (isNaN(n)) return;
            Cfg.set('refreshMs', Math.max(0, n)); restartPolling();
          }, { type: 'number', width: '140px', ariaLabel: '轮询间隔' }), {}));
        beh.appendChild(UI.item('概览—详情分层', '列表默认折叠详情，先给概览再按需展开。',
          UI.toggle(Cfg.get('overviewMode', true), function (v) { Cfg.set('overviewMode', v); }), {}));
        beh.appendChild(UI.item('长列表折叠阈值', '超过该行数的列表默认折叠。',
          UI.input(Cfg.get('maxRows', 50), function (v) {
            var n = parseInt(v, 10); if (isNaN(n)) return;
            Cfg.set('maxRows', Math.max(5, Math.min(500, n)));
          }, { type: 'number', width: '120px', ariaLabel: '折叠阈值' }), {}));
        view.appendChild(UI.collapsible('行为', beh, { open: true }));

        // 可观察性
        var obs = el('div');
        obs.appendChild(UI.item('显示日志面板', '在状态栏上方常驻显示调用日志。',
          UI.toggle(Cfg.get('showLogs', true), function (v) { Cfg.set('showLogs', v); applyLogPanel(); }), {}));
        obs.appendChild(UI.item('日志级别', '过滤日志面板显示的最低级别。',
          UI.select([{ value: 'info', label: '全部' }, { value: 'warn', label: '警告+' }, { value: 'error', label: '仅错误' }],
            Cfg.get('logLevel', 'info'), function (v) { Cfg.set('logLevel', v); Bus.emit('log', null); }), {}));
        view.appendChild(UI.collapsible('可观察性', obs, { open: true }));

        // 快捷键
        var keys = el('div');
        keys.appendChild(UI.kv([
          ['打开/关闭面板', 'Ctrl/⌘ + Shift + S'],
          ['关闭面板', 'Esc'],
          ['切换日志面板', 'Ctrl/⌘ + Shift + L']
        ]));
        view.appendChild(UI.collapsible('快捷键', keys, { open: true }));

        view.appendChild(el('div', 'sc-desc', ''));
        view.appendChild(UI.button('恢复默认设置', function () {
          if (!confirm('确认恢复全部界面设置为默认值？')) return;
          Cfg.reset(); applyDensity(); applyNavWidth(); applyLogPanel(); restartPolling(); refreshCurrentView();
          Log.info('界面设置已恢复默认');
        }, { danger: true }));
      }

      /* ---------- 插件集合视图（#3） ---------- */
      function renderSuite(view, data) {
        view.textContent = '';
        view.appendChild(UI.pageHead('插件集合', '守藏 = 集合中枢：装守藏 = 获得集合入口；成员插件独立可装。装配状态 = 注入器 registry + profiles 双基准。'));
        var members = (data && data.members) || [];
        if (!Derive.has(members)) { view.appendChild(el('div', 'sc-desc', '无成员数据。')); return; }
        members.forEach(function (m) {
          /* A2：改用 UI.item 组件层（DOM 结构与手写完全一致，属等价替换）。
             状态徽标由原先的行内 style.color 改为 UI.badge 语义类 ⇒ 颜色统一走 --sc-ok-bg/--sc-err-bg 令牌，
             不再散落十六进制/rgba（原 CSS 中有 16 种十六进制色）。 */
          var stMeta = Derive.suiteStatus(m.status); // 装配状态 → 徽章（文案+语义类）单一映射
          var badgeText = stMeta.text, badgeKind = stMeta.kind;
          view.appendChild(UI.item(
            (m.id || m.package) + '  ·  ' + (m.status || '?'),
            m.package + (m.role ? ' · role ' + m.role : '') + (m.repo ? ' · ' + m.repo : '') + (m.detail ? ' — ' + m.detail : ''),
            UI.badge(badgeText, badgeKind)
          ));
        });
        if (data && data.summary) view.appendChild(el('div', 'sc-desc', data.summary));
      }

      /* ---------- 深度睡眠视图（T1 状态机 + T2 计时/控制；docs/ui-todo.md） ---------- */

      function dsFmtAgo(ts) {
        if (!ts) return '—';
        var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (s < 60) return s + ' 秒';
        var m = Math.floor(s / 60); if (m < 60) return m + ' 分钟';
        var h = Math.floor(m / 60); if (h < 24) return h + ' 小时 ' + (m % 60) + ' 分';
        return Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小时';
      }
      function dsFmtCountdown(ts) {
        if (!ts) return '—';
        var s = Math.floor((ts - Date.now()) / 1000);
        if (s <= 0) return '随时';
        var m = Math.floor(s / 60); if (m < 60) return m + ' 分钟后';
        var h = Math.floor(m / 60); if (h < 24) return h + ' 小时 ' + (m % 60) + ' 分后';
        return Math.floor(h / 24) + ' 天后';
      }
      function dsFmtTime(ts) {
        if (!ts) return '从未';
        try { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); } catch (e) { return String(ts); }
      }
      var DS_STATE_TEXT = { running: '活跃（有事件）', ended: '已结束', probing: '探测中', suspect: '待复核', stalled: '疑似卡住' };
      var DS_PROBE_TEXT = {
        'long-run': '正常长任务（唯一拦睡）',
        'suspect': '待复核（阻塞睡眠）',
        'conflict': '证据冲突（阻塞睡眠待复核）',
        'stall': '已确认卡住（不阻塞·请人工确认）',
        'exit': '异常退出（正常睡）',
        'no-transcript': '探针不可用（正常睡·请排查）',
        'error': '探测异常（正常睡）'
      };
      /* 深睡会话状态徽标：参数序 (state, count, label) 与 UI.dsBadge 不同，
       * 只做参数适配，DOM 构造仍走 UI.dsBadge 唯一实现（此前这里另写一份三行）。 */
      function dsBadge(state, count, label) {
        return UI.dsBadge(label + ' ' + (count || 0), state || '').box;
      }
      function dsStat(k, v) {
        var s = el('div', 'sc-ds-stat');
        s.appendChild(el('div', 'k', k)); s.appendChild(el('div', 'v', v));
        return s;
      }
      function dsNumber(name, desc, initial, min, max, unit, encode, key) {
        var item = el('div', 'setting-item');
        var info = el('div', 'setting-item-info');
        info.appendChild(el('div', 'setting-item-name', name));
        info.appendChild(el('div', 'setting-item-desc', desc));
        var wrap = el('div'); wrap.className = 'sc-range-wrap';
        var lab = el('span', 'sc-range-label'); lab.textContent = initial + ' ' + unit;
        var range = el('input'); range.type = 'range'; range.min = String(min); range.max = String(max); range.step = '1'; range.value = String(initial);
        range.addEventListener('input', function () { lab.textContent = range.value + ' ' + unit; });
        range.addEventListener('change', function () {
          var o = {}; o[key] = encode(range.value);
          api('/deepsleep/config', { method: 'POST', body: JSON.stringify(o) })
            .then(function () { status('✓ ' + name + ' = ' + range.value + ' ' + unit + '（重载生效）'); })
            .catch(fail);
        });
        wrap.appendChild(lab); wrap.appendChild(range);
        item.appendChild(info); item.appendChild(wrap);
        return item;
      }
      /** U1（ADR-122 UI）：运行面扩展 —— 判据与对账 + 认知环（MCL）。
       *  判因：这两块此前在记忆板块（判据卡在最前）→ 首屏过载；改落既有「运行」视图，数据走按需端点，零新增常驻注入。 */
      function renderRunExtras(view) {
        var group2 = function (t) { view.appendChild(el('div', 'sc-mem-group-title', t)); };
        var mk = function (label, value, sub) {
          var card = el('div', 'sc-mem-stat');
          card.appendChild(el('div', 'sc-mem-stat-label', label));
          card.appendChild(el('div', 'sc-mem-stat-value', value));
          if (sub) card.appendChild(el('div', 'sc-mem-stat-sub', sub));
          return card;
        };
        group2('判据与对账（v2 · ADR-122）');
        var cw = el('div', 'sc-mem-stats');
        cw.appendChild(mk('判据源', '…', '读取中'));
        view.appendChild(cw);
        api('/criteria').then(function (c) {
          cw.textContent = '';
          if (!c || !c.active) { cw.appendChild(mk('判据源', '未就绪', '跑 npm run gen:criteria')); return; }
          var fus = ((c.surface || {}).fusion) || {};
          var thr = ((c.surface || {}).threshold) || {};
          var gate = c.rerankGate || {};
          var bg = c.bankGit || {};
          cw.appendChild(mk('注册表版本', String(c.version || '-'), '唯一事实源 criteria.json · 机检 check:criteria'));
          cw.appendChild(mk('融合 / 阈值', String(fus.kind || '-') + ' / ' + String(thr.metric || '-'), 'RRF(k=' + String(fus.k || '-') + ') 排序 · 绝对余弦做阈值'));
          cw.appendChild(mk('判据台账', String(((c.ledger || {}).rows) || 0) + ' 行', '对账 criteria-audit.mjs · 报告 audit/criteria-report-*.md'));
          cw.appendChild(mk('rerank 门', gate.ready ? '已达' : '未达', '索引行 ' + String(gate.indexRows || 0) + ' / ' + String(gate.threshold || 200)));
          cw.appendChild(mk('库版本', String(bg.commits || 0) + ' 提交', bg.lastAt ? ('最近 ' + fmtTime(bg.lastAt)) : '本地 git（可 diff/revert）'));
        }).catch(function () { cw.textContent = ''; cw.appendChild(mk('判据源', '读取失败', '/criteria')); });
        group2('账本对账与产出健康（v2.1 M3）');
        var rw = el('div', 'sc-mem-stats');
        rw.appendChild(mk('对账', '…', '读取中'));
        view.appendChild(rw);
        api('/reconcile').then(function (r) {
          rw.textContent = '';
          if (!r || !r.active) { rw.appendChild(mk('对账', '未就绪', (r && r.error) || 'memory-reconcile.mjs 未部署')); return; }
          var cl = r.closure || {};
          var h = r.health || {};
          var ly = (r.layers || {}).counts || {};
          var P = ly.P || { index: 0, profile: 0 }, R = ly.R || { index: 0, profile: 0 }, E = ly.E || { index: 0, profile: 0 };
          rw.appendChild(mk('账本闭合', cl.ok === null ? '样本不足' : cl.ok ? '✅ 差异 0' : '⚠ 有差异', '台账 ' + ((r.window || {}).ledgerRows || 0) + ' 行 · 写事件 ' + (h.writeEvents || 0) + ' 次'));
          rw.appendChild(mk('上次有效深睡', h.lastSuccessfulWrite ? fmtTime(h.lastSuccessfulWrite) : '（无）', '连续空转 ' + (h.idleStreak || 0) + ' 轮 · 深睡轮次 ' + (h.deepSleepRounds || 0)));
          rw.appendChild(mk('写入被拒率', h.rejectRate === null || h.rejectRate === undefined ? 'n/a' : (h.rejectRate * 100).toFixed(0) + '%', '拒 ' + (h.rejectedWrites || 0) + ' / 写事件 ' + (h.writeEvents || 0) + ' · 尝试 ' + (h.attemptedTotal || 0) + ' 条'));
          rw.appendChild(mk('三层占比', 'P ' + (P.index + P.profile) + ' · R ' + R.index + ' · E ' + (E.index + E.profile), 'P=恒常（索引+P 层画像行 ≤' + ((r.layers || {}).profileCap || 3) + '/档）· R=任务门控 · E=相关性门控'));
        }).catch(function () { rw.textContent = ''; rw.appendChild(mk('对账', '读取失败', '/reconcile')); });

        group2('认知环（MCL · 快/慢双通道）');
        var mw = el('div', 'sc-mem-stats');
        mw.appendChild(mk('状态', '…', '读取中'));
        view.appendChild(mw);
        api('/mcl/status').then(function (m) {
          mw.textContent = '';
          if (!m || !m.active) { mw.appendChild(mk('状态', '未装配', 'mclEnabled=false 或未注入')); return; }
          mw.appendChild(mk('状态', m.enabled ? '启用' : '停用', '阈值 ' + m.familiarThreshold + ' · 材料预算 ' + m.budgetChars + ' 字符'));
          mw.appendChild(mk('通道计数', '快 ' + (m.fast || 0) + ' / 慢 ' + (m.slow || 0), '末次 ' + (m.lastChannel || '-') + ' · sim ' + (m.lastSim != null ? m.lastSim : '-')));
          mw.appendChild(mk('注入', String(m.injected || 0) + ' 次', 'Nudge ' + (m.nudged || 0) + ' 次 · 步数 ' + (m.steps || 0)));
        }).catch(function () { mw.textContent = ''; mw.appendChild(mk('状态', '读取失败', '/mcl/status')); });
      }

      function renderDeepSleep(view) {
        view.textContent = '';
        view.appendChild(UI.pageHead('深度睡眠 · 会话状态机', '全部根会话停滞 ≥ 阈值后自动回想当天记忆、提炼原则层 PRINCIPLES.md。状态机区分「正常长任务 / 卡住 / 异常退出」：仅长任务正在推进才拦睡，其余正常睡。'));
        renderRunExtras(view); // U1：判据与对账 + 认知环（从记忆板块移入运行面）
        api('/deepsleep').then(function (r) {
          if (!r.active) {
            view.appendChild(el('div', 'sc-desc', '深度睡眠归纳器当前未激活（蒸馏器 enableDistill 未启用或尚未就绪）。'));
            return;
          }
          // T1：会话状态徽章（2026-09-10 收敛：五桶互斥且和为总数——铺开 0 值冗余；
          // 改为「会话总数 + 活跃 + 仅非零异常桶（探测中/待复核/疑似卡住）」，异常出现即浮现，正常态零噪音）
          var totalSessions = r.running + r.ended + r.probing + r.suspect + r.stalled;
          var badges = el('div', 'sc-ds-badges');
          badges.appendChild(UI.dsBadge(
            '会话 ' + totalSessions + (r.ended ? ' · 已结束 ' + r.ended : ''), 'ended'
          ).setTitle('在册会话总数（活跃+已结束+异常）；五态互斥分桶').box);
          if (r.running > 0) badges.appendChild(dsBadge('running', r.running, '活跃'));
          if (r.probing > 0) badges.appendChild(dsBadge('probing', r.probing, '探测中'));
          if (r.suspect > 0) badges.appendChild(dsBadge('suspect', r.suspect, '待复核'));
          if (r.stalled > 0) badges.appendChild(dsBadge('stalled', r.stalled, '疑似卡住'));
          view.appendChild(badges);
          // T2：计时
          var timing = el('div', 'sc-ds-timing');
          timing.appendChild(dsStat('已停滞', dsFmtAgo(r.lastActivityAt)));
          timing.appendChild(dsStat('下次预计入睡', dsFmtCountdown(r.nextEligibleAt)));
          timing.appendChild(dsStat('上次入睡', dsFmtTime(r.lastDeepSleepAt)));
          view.appendChild(timing);
          // v9：认知可视化——本轮产出回执 / 下轮材料预估 / 历次趋势（此前"睡完做了什么"完全不可见）
          renderCognitionReport(view, 'sleep');
          /* ── v2.2 睡眠期自检裁决（宿主义务：子代理只归纳，检测在其完成后由宿主执行；点按钮可手动跑） ── */
          view.appendChild(el('div', 'sc-mem-group-title', '睡眠期自检（判据门 / 载体门 / 分层 / 成熟度 / 影子 / 对账）'));
          var scBox = el('div', 'sc-mem-stats');
          var scCard = function (label, value, sub) {
            var c = el('div', 'sc-mem-stat');
            c.appendChild(el('div', 'sc-mem-stat-label', label));
            c.appendChild(el('div', 'sc-mem-stat-value', value));
            if (sub) c.appendChild(el('div', 'sc-mem-stat-sub', sub));
            return c;
          };
          scBox.appendChild(scCard('自检', '…', '读取中'));
          view.appendChild(scBox);
          api('/selfcheck').then(function (s) {
            scBox.textContent = '';
            if (!s || !s.active) {
              scBox.appendChild(scCard('自检', '尚未跑过', (s && s.error) || '定时器/深睡后会自动执行'));
            } else {
              var v = String(s.verdict || '?');
              var sm = s.summary || {};
              var ck = sm.checks || {};
              scBox.appendChild(scCard('裁决', v === 'ok' ? '✅ ok' : v === 'adjust' ? '🔧 adjust' : '⚠ warn', '于 ' + fmtTime(s.at)));
              scBox.appendChild(scCard('六项检测', Object.keys(ck).map(function (k) { return (ck[k] === 'pass' ? '✅' : ck[k] === 'skipped' ? '⏭' : '❌') + k; }).join(' '), '影子 flipReady=' + sm.flipScoreWeights + ' · 成熟度就绪=' + sm.maturationReady + ' · 闭合=' + (sm.closureOk === null ? 'n/a' : sm.closureOk)));
              scBox.appendChild(scCard('白名单调整', (Derive.has(s.adjustments) ? s.adjustments.map(function (a) { return a.id; }).join(' · ') : '无'), '仅窄动作且可回滚；改 α/gate/判据 一律只建议'));
            }
            var runBtn = el('button', 'sc-btn sc-btn-xs', '立即跑一次自检');
            runBtn.type = 'button';
            runBtn.onclick = function () { status('自检执行中…'); api('/selfcheck/run', { method: 'POST', body: '{}' }).then(function (rr) { status('✓ 自检完成：' + (rr.verdict || '?')); renderDeepSleep(view); }).catch(fail); };
            view.appendChild(runBtn);
          }).catch(function () { scBox.textContent = ''; scBox.appendChild(scCard('自检', '读取失败', '/selfcheck')); });
          // T1：会话明细
          if (Derive.has(r.sessions)) {
            view.appendChild(el('div', 'sc-h3', '会话明细'));
            var listWrap = el('div', 'sc-ds-sessions');
            r.sessions.forEach(function (s) {
              var row = el('div', 'sc-ds-session');
              row.appendChild(el('span', 'sc-ds-dot ' + s.state));
              var main = el('div', 'sc-ds-session-main');
              main.appendChild(el('div', 'sc-ds-sid', s.sid));
              var sub = (DS_STATE_TEXT[s.state] || s.state) + ' · 停滞 ' + dsFmtAgo(s.state === 'ended' ? s.lastEndAt : s.lastEventAt);
              if (s.probeResult) sub += ' · ' + (DS_PROBE_TEXT[s.probeResult] || s.probeResult);
              main.appendChild(el('div', 'sc-ds-session-sub', sub));
              row.appendChild(main);
              listWrap.appendChild(row);
            });
            view.appendChild(listWrap);
          }
          // 卡住告警（T2）
          var hasStall = r.stalled > 0 || (r.sessions || []).some(function (s) { return s.probeResult === 'stall'; });
          if (hasStall) {
            view.appendChild(el('div', 'sc-ds-alert', '⚠ 检测到疑似卡住的会话（无输出增长但会话仍在）：已正常计入停滞并安排睡眠，但建议你确认该任务是否真的卡住——必要时手动重启该会话。'));
          }
          // T2：控制
          view.appendChild(el('div', 'sc-h3', '控制'));
          var ctl = el('div', 'sc-ds-ctl');
          var triggerBtn = el('button', 'sc-btn', '立即归纳一次');
          triggerBtn.onclick = function () {
            if (!window.confirm('立即触发一次深度睡眠归纳？将调用归纳子代理回顾当天记忆痕迹。')) return;
            status('深度睡眠归纳中…');
            api('/deepsleep/trigger', { method: 'POST', body: '{}' })
              .then(function (rr) { status(rr.ok ? '✓ 已触发归纳（见日志）' : '⚠ 触发失败：' + (rr.error || '')); })
              .catch(fail);
          };
          ctl.appendChild(triggerBtn);
          var pauseBtn = el('button', 'sc-btn', '暂停到明天');
          pauseBtn.onclick = function () {
            if (!window.confirm('暂停深度睡眠自动归纳（enableDeepSleep=false）？可在下方重新开启，或重载插件恢复。')) return;
            api('/deepsleep/config', { method: 'POST', body: JSON.stringify({ enableDeepSleep: false }) })
              .then(function () { status('✓ 已暂停自动归纳（重载生效）'); renderDeepSleep(view); })
              .catch(fail);
          };
          ctl.appendChild(pauseBtn);
          view.appendChild(ctl);
          // T2：可调阈值（U2：并入折叠体 —— 显式容器接管异步追加的节点，避免落在折叠体之外）
          view.appendChild(el('div', 'sc-h3', '阈值（改后需重载插件生效）'));
          // 与其余折叠同一原语：状态进 Fold（旧实现是局部 advOpen，60s 轮询重绘即被重置）
          var advFold = UI.fold({
            key: 'deepsleep:adv', variant: 'more',
            label: '展开高级阈值（4 项 · 改后需重载）', open: false
          });
          advFold.appendTo(view);
          var advBody = advFold.body;
          advFold.busy(true); // 异步边界：配置在请求中 —— 骨架微光，避免"点了展开却是空的"
          api('/deepsleep/config').then(function (cfg) {
            advFold.busy(false);
            var run = cfg.running || {};
            advBody.appendChild(makeToggle('enableDeepSleep', '启用深度睡眠自动归纳 enableDeepSleep', '全部会话停滞 ≥ 阈值后自动提炼原则层（关闭=暂停）', !!run.enableDeepSleep, function (key, sw) {
              api('/deepsleep/config', { method: 'POST', body: JSON.stringify({ enableDeepSleep: sw.checked }) })
                .then(function () { status('✓ 已保存（重载生效）'); })
                .catch(function (e) { fail(e); sw.checked = !sw.checked; });
            }));
            advBody.appendChild(dsNumber('停滞阈值 deepSleepIdleMs', '全部会话无活动持续满此毫秒数才触发（默认 3 小时）', Math.round((run.deepSleepIdleMs || 10800000) / 60000), 10, 720, '分钟', function (m) { return m * 60000; }, 'deepSleepIdleMs'));
            advBody.appendChild(dsNumber('探测发起延迟 deepSleepProbeAfterMs', 'running 无事件持续此毫秒后发起输出增长探测（默认 3 小时）', Math.round((run.deepSleepProbeAfterMs || 10800000) / 60000), 10, 720, '分钟', function (m) { return m * 60000; }, 'deepSleepProbeAfterMs'));
            advBody.appendChild(dsNumber('探测采样间隔 deepSleepProbeWindowMs', '两轮采样之间的间隔（默认 60 秒）', Math.round((run.deepSleepProbeWindowMs || 60000) / 1000), 5, 600, '秒', function (s) { return s * 1000; }, 'deepSleepProbeWindowMs'));
          }).catch(function (e) {
            // 异步边界：失败也必须先解除 loading，否则骨架微光永久转圈；错误就地显示（用户点开的地方）
            advFold.busy(false);
            advBody.appendChild(el('div', 'sc-mem-empty', '阈值加载失败：' + (e && e.message ? e.message : e)));
            fail(e);
          });
        }).catch(function (e) {
          view.appendChild(el('div', 'sc-desc', '加载失败：' + (e && e.message ? e.message : e)));
        });
      }
      var refs = {};
      var state = { parsed: null };

      var currentView = 'file';
      function refreshCurrentView() { show(currentView); }
      function show(name) {
        /* 折叠态的生命周期边界：**换视图**才清空（避免上一个视图的 key 残留到新数据上）；
           同一视图内的重绘（自动轮询 / 保存后重取 / 手动刷新）**保留**开合态 ——
           这正是旧实现最难受的一点：60s 一轮询，用户展开的区块就被强制收起。 */
        if (currentView !== name) Fold.clear();
        currentView = name;
        // A6：记住最后视图（面板重开即回到上次位置）
        try { Cfg.set('lastView', name); } catch (e) { }
        // D6：视图区变化时给读屏一个可识别的名字
        if (refs.view) {
          var vv = null;
          for (var i = 0; i < VIEWS.length; i++) { if (VIEWS[i][0] === name) { vv = VIEWS[i]; break; } }
          refs.view.setAttribute('role', 'region');
          if (vv) refs.view.setAttribute('aria-label', vv[1] + '（' + vv[3] + '）');
        }
        refs.navItems.forEach(function (it) { it.el.classList.toggle('active', it.name === name); });
        refs.view.textContent = '';
        _foldQueue.length = 0;   // 丢弃上一次渲染未收口的登记（异常路径残留），防止串到本次
        refs.view.scrollTop = 0; // 切视图回到顶部（此前长视图切页后停在上一页滚动位置）
        if (name === 'persona') {
          api('/memory/overview').then(function (r) { renderPersona(refs.view, r); }).catch(fail);
        } else if (name === 'memory') {
          api('/memory/overview').then(function (r) { renderMemoryExpanded(refs.view, r); }).catch(fail);
        } else if (name === 'suite') {
          api('/suite').then(function (r) {
            renderSuite(refs.view, r);
          }).catch(fail);
        } else if (name === 'toggles') {
          api('/config').then(function (r) {
            // P2：注入配置全局可用（无 root 也能调——global 来自 scheduler.json）
            if (!r.global) { status(r.error === 'no-active-root' ? '未激活根目录——请到「配置原文」页根目录区添加。' : (r.error || '')); return; }
            if (!r.parsed) status('注入参数已全局可用（scheduler.json）；root 未登记——「记忆板块显示」开关待登记后可用。');
            else status('已加载 ' + (r.file || ''));
            renderViewToggles(refs.view, r.parsed || {}, r.global);
          }).catch(fail);
        } else if (name === 'deepsleep') {
          renderDeepSleep(refs.view);
        } else if (name === 'observe') {
          renderViewObserve(refs.view);
          collectMetrics();
        } else if (name === 'settings') {
          renderViewSettings(refs.view);
        } else if (name === 'file') {
          // 根目录管理并入配置页（不再单独导航界面）
          refs.view.textContent = '';
          var rootSection = el('div');
          var yamlSection = el('div');
          var ta = document.createElement('textarea'); refs.ta = ta;
          var saveRow = el('div');
          saveRow._btn && 0;
          renderViewRoots(rootSection, function (w) { refs.rootListWrap = w; });
          renderViewYaml(yamlSection, ta, saveRow);
          refs.view.appendChild(rootSection);
          refs.view.appendChild(yamlSection);
          api('/roots').then(function (r) { if (renderViewRoots._draw) renderViewRoots._draw(r); }).catch(fail);
          saveRow._btn.onclick = function () {
            api('/save', { method: 'POST', body: JSON.stringify({ text: ta.value }) })
              .then(function () { status('✓ 已保存，原文件已备份为 .bak-*'); })
              .catch(fail);
          };
          api('/config').then(function (r) {
            ta.value = r.text || '';
            if (!r.text) status(r.error === 'no-active-root' ? '未激活根目录——请在上方根目录区添加。' : (r.error || ''));
            else status('已加载 ' + (r.file || '') + ' · mtime ' + (r.mtime || '-'));
          }).catch(fail);
        }
      }

      /* ---------- 界面设置的运行时应用（自由度） ---------- */
      function applyDensity() {
        var m = document.getElementById('scpanl-modal');
        if (!m) return;
        m.classList.toggle('sc-density-compact', Cfg.get('density', 'comfortable') === 'compact');
      }
      /* 导航宽度：写 CSS 变量而非内联 width —— 内联样式会压过媒体查询（除 !important），
         导致用户在宽屏设的宽度被带到移动端。改变量后，响应式断点可正常接管。 */
      function applyNavWidth() {
        var m = document.getElementById('scpanl-modal');
        if (!m) return;
        var n = parseInt(Cfg.get('navWidth', 216), 10);
        if (!n) n = 216;
        m.style.setProperty('--sc-nav-w', Math.max(140, Math.min(320, n)) + 'px');
      }
      function applyLogPanel() {
        var main = document.querySelector('.sc-main');
        if (!main) return;
        var old = main.querySelector('.sc-logwrap');
        if (old) old.remove();
        if (!Cfg.get('showLogs', true)) return;
        var bar = document.getElementById('sc-statusbar');
        var lp = buildLogPanel(150);
        if (bar && bar.parentNode === main) main.insertBefore(lp, bar); else main.appendChild(lp);
      }

      /* 轮询：间隔可配（0=关闭），替代写死的 setInterval */
      var pollTimer = null;
      function restartPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        var ms = parseInt(Cfg.get('refreshMs', 60000), 10) || 0;
        if (ms <= 0) return;
        pollTimer = setInterval(function () {
          // 仅在面板打开时轮询，关闭时不空转
          var mask = document.getElementById('scpanl-mask');
          if (!mask || !mask.classList.contains('open')) return;
          if (Cfg.get('autoRefresh', true)) refreshCurrentView();
        }, ms);
      }

      /* 关键指标采集（C4）——同时为 /inject/stats 提供 UI 入口（B1） */
      function collectMetrics() {
        var m = {};
        function put(k, v) { m[k] = v; Store.patch('metrics', m); }
        api('/mcl/status').then(function (r) {
          put('MCL 状态', (r && (r.mode || r.state)) || '—');
          if (r && r.familiarity != null) put('熟悉度', String(r.familiarity));
        }).catch(function () { put('MCL 状态', '获取失败'); });
        api('/vector/status2').then(function (r) {
          put('向量档', r && r.present ? (String(r.rows || 0) + ' 行') : '未启用');
        }).catch(function () { put('向量档', '获取失败'); });
        api('/inject/stats').then(function (r) {
          put('注入统计', r && typeof r === 'object' ? JSON.stringify(r).slice(0, 160) : String(r));
        }).catch(function () { put('注入统计', '获取失败'); });
        api('/get_root').then(function (r) {
          put('当前根', (r && (r.root || r.path || r.active)) || '—');
        }).catch(function () { put('当前根', '获取失败'); });
      }

      /* 快捷键（C5）：Ctrl/⌘+Shift+S 开关面板；Esc 关闭；Ctrl/⌘+Shift+L 切日志面板 */
      function installShortcuts() {
        if (installShortcuts._done) return;
        installShortcuts._done = true;
        document.addEventListener('keydown', function (e) {
          var mod = e.ctrlKey || e.metaKey;
          if (mod && e.shiftKey && (e.key === 'S' || e.key === 's')) {
            e.preventDefault(); togglePanel(); return;
          }
          if (mod && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
            e.preventDefault();
            Cfg.set('showLogs', !Cfg.get('showLogs', true));
            applyLogPanel();
            status('日志面板已' + (Cfg.get('showLogs') ? '显示' : '隐藏'), 'info');
            return;
          }
          if (e.key === 'Escape') {
            var mask = document.getElementById('scpanl-mask');
            if (mask && mask.classList.contains('open')) { e.preventDefault(); closePanel(); }
          }
        });
      }
      function togglePanel() {
        var mask = document.getElementById('scpanl-mask');
        if (!mask) return;
        if (mask.classList.contains('open')) closePanel(); else openPanel();
      }
      function closePanel() {
        var mask = document.getElementById('scpanl-mask');
        if (mask) mask.classList.remove('open');
      }

      function buildModal(mask) {
        var modal = el('div'); modal.id = 'scpanl-modal';
        // D6：语义化——对话框角色 + 无障碍标签（读屏可识别，原缺失）
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', '守藏记忆面板');

        // 左导航（Obsidian settings 侧栏；分组=记忆/运行/配置，2026-09-09 布局重排对齐宿主排版）
        var nav = el('div', 'sc-nav');
        nav.appendChild(el('div', 'sc-nav-title', '守藏 SHOUCANG'));
        refs.navItems = [];
        var lastGroup = null;
        VIEWS.forEach(function (v) {
          if (v[3] && v[3] !== lastGroup) {
            nav.appendChild(el('div', 'sc-nav-group', v[3]));
            lastGroup = v[3];
          }
          var item = el('div', 'sc-nav-item');
          item.appendChild(svg(ICONS[v[2]]));
          item.appendChild(el('span', null, v[1]));
          // D6：导航项可聚焦、可被读屏识别
          item.setAttribute('role', 'button');
          item.setAttribute('tabindex', '0');
          item.setAttribute('aria-label', v[1]);
          item.onclick = function () { show(v[0]); };
          item.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(v[0]); } };
          refs.navItems.push({ name: v[0], el: item });
          nav.appendChild(item);
        });
        nav.appendChild(el('div', 'sc-nav-spacer'));
        nav.appendChild(el('div', 'sc-nav-title', 'storage = obsidian vault'));
        /* 移动端关闭按钮（≤720px 才显示）：此前移动端模态为全屏 100vw/100vh，
           遮罩被完全盖住 ⇒ 点遮罩关闭失效，只剩 Esc 键——移动端无键盘即无法关闭面板。
           sticky right:0 + margin-left:auto ⇒ 横向 tab 滚动时始终吸在右侧。 */
        var navClose = el('button', 'sc-nav-close', '✕');
        navClose.type = 'button';
        navClose.title = '关闭面板';
        navClose.setAttribute('aria-label', '关闭面板');
        navClose.onclick = function () { closePanel(); };
        nav.appendChild(navClose);
        modal.appendChild(nav);

        // 右内容
        var main = el('div', 'sc-main');
        refs.view = el('div', 'sc-view');
        main.appendChild(refs.view);
        var bar = el('div', 'sc-statusbar'); bar.id = 'sc-statusbar'; // 类挂样式 + id 供 status() 定位（此前只挂 id，.sc-statusbar 类样式永不命中）
        bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); // U3（A10）：状态变化被读屏播报
        main.appendChild(bar);
        modal.appendChild(main);

        mask.appendChild(modal);
        // 应用界面设置（密度 / 导航宽度 / 日志面板 / 快捷键 / 轮询）
        applyDensity();
        applyNavWidth();
        applyLogPanel();
        installShortcuts();
        restartPolling();
        /* A6 深链 + 记忆：优先读 #sc=<视图名>（只读取，不写 URL —— 写 hash 可能干扰宿主路由，
           故默认不做写入式深链）；其次用上次记住的视图；都没有则回落到 file。 */
        var startView = 'file';
        try {
          var hm = String(location.hash || '').match(/[#&]sc=([a-z0-9_-]+)/i);
          if (hm && VIEWS.some(function (v) { return v[0] === hm[1]; })) startView = hm[1];
          else if (Cfg.get('lastView')) {
            var lv = String(Cfg.get('lastView'));
            if (VIEWS.some(function (v) { return v[0] === lv; })) startView = lv;
          }
        } catch (e) { }
        show(startView);
      }

      function openPanel() {
        var mask = document.getElementById('scpanl-mask');
        if (!mask) return;
        // 幂等打开：模态框只构建一次，重复开关只切换显隐，避免叠加出多个面板
        if (!mask.querySelector('#scpanl-modal')) buildModal(mask);
        mask.classList.add('open');
        // 打开即刷新 UI 状态：重置知识库索引缓存并重渲染当前视图（画像/记忆/wiki/配置原文数据重新拉取，免手动刷新）
        refreshCurrentView();
      }

      function mount() {
        if (document.getElementById('scpanl-mask')) return true;
        var rootEl = el('div'); rootEl.id = 'scpanl-root';
        document.body.appendChild(rootEl);
        var styleHost = el('style'); styleHost.textContent = CSS; rootEl.appendChild(styleHost);
        var mask = el('div'); mask.id = 'scpanl-mask';
        mask.onclick = function (ev) { if (ev.target === mask) mask.classList.remove('open'); };
        rootEl.appendChild(mask);
        return false;
      }

      // 兜底：找不到侧栏 footArea 时，左下角固定入口
      function mountFallbackEntry() {
        if (document.getElementById('scpanl-btn')) return;
        var btn = el('button'); btn.id = 'scpanl-btn'; btn.title = '守藏面板';
        var ic = el('img', 'sc-ic-lg'); ic.src = SC_ICON; ic.alt = '守';
        btn.appendChild(ic);
        btn.dataset.fallback = '1';
        btn.classList.add('sc-fab'); // U2.5b：内联 → 类（令牌化；样式只在 CSS）
        btn.onclick = openPanel;
        document.body.appendChild(btn);
      }

      // 上移入口：直插侧栏 footArea 首行（记忆插件(footerActions 单行)上方、设置上方），不占 Cordis 插槽
      var sidebarObserver = null;
      var sidebarTries = 0;
      function mountSidebarEntry() {
        if (document.getElementById('scpanl-btn')) return true;
        var foot = null;
        var mneme = document.querySelector('.mneme-trigger');
        if (mneme) foot = mneme.closest('[class*="footArea"]') || mneme.closest('[class*="foot-area"]');
        if (!foot) foot = document.querySelector('[class*="footArea"]') || document.querySelector('[class*="foot-area"]');
        if (!foot) {
          if (sidebarTries++ < 40) { setTimeout(mountSidebarEntry, 500); return false; }
          mountFallbackEntry();
          return false;
        }
        // 2026-09-10 审查：入口与 DSH 设置样式完全一致——克隆宿主设置按钮（同款类/结构，随宿主主题自动适配）
        var btn = null;
        var settingsBtn = null;
        try { settingsBtn = document.querySelector('[class*="triggerRow"] button') || [...document.querySelectorAll('button')].find(function (b) { return (b.textContent || '').trim() === '设置'; }); } catch (e) { settingsBtn = null; }
        if (settingsBtn && settingsBtn.cloneNode) {
          try {
            btn = settingsBtn.cloneNode(true); // 克隆按钮（保留宿主类 VOzbGW_trigger + 内部 slot 结构）
            btn.id = 'scpanl-btn';
            btn.removeAttribute('aria-haspopup'); btn.removeAttribute('aria-expanded');
            btn.title = '守藏面板';
            // 换内部 label 文本（span.UQsH_q_triggerLabel 或 data-slot 容器）
            var lab = btn.querySelector('span, [data-slot] span');
            if (lab) lab.textContent = '守藏';
            // 图标（2026-09-10 审查三）：保留宿主克隆 svg 原样（与设置图标 100% 同质、清晰随主题）。
            // 说明：曾尝试 PNG/自绘 path 替代——PNG 96px 缩小有锯齿、手写 path 不可靠易变形；
            // 为保证"与设置完全一致且清晰"，暂用宿主同款图标（视觉协调优先，后续可换验证过的同规格矢量）。
            btn.onclick = openPanel;
          } catch (e) { btn = null; }
        }
        if (!btn) {
          // 回退：无设置按钮可克隆时用 sc-trigger（保持可用）
          btn = el('button'); btn.id = 'scpanl-btn'; btn.type = 'button'; btn.title = '守藏面板';
          btn.className = 'sc-trigger';
          var icF = el('img', 'sc-ic-sm'); icF.src = SC_ICON; icF.alt = '守';
          btn.appendChild(icF);
          btn.appendChild(el('span', 'sc-trigger-label', '守藏'));
          btn.onclick = openPanel;
        }
        // 2026-09-10 审查二：守藏与设置**上下两行**——克隆按钮包进独立 triggerRow（同款宿主类），
        // 插到设置所在 triggerRow 前（同 settingsArea），两行上下排列、各自与设置同款样式。
        var settingsRow = settingsBtn ? settingsBtn.closest('[class*="triggerRow"]') : null;
        if (settingsBtn && settingsRow && btn.getAttribute('class') && String(btn.className).indexOf('sc-trigger') < 0) {
          var ownRow = el('div');
          ownRow.className = settingsRow.className; // 复用宿主 triggerRow 类（样式同设置行；宿主类自带 flex，不再内联覆盖）
          ownRow.appendChild(btn);
          settingsRow.parentElement.insertBefore(ownRow, settingsRow); // 设置在下方一行
          // 记录 btn 真实父（重挂判断用）
        } else if (settingsBtn && settingsBtn.parentElement) {
          // 回退：同容器并排（无法建独立行时保可用）
          settingsBtn.parentElement.insertBefore(btn, settingsBtn);
        } else {
          foot.insertBefore(btn, foot.firstChild); // 回退：foot 首行
        }
        var root = foot.parentElement;
        var isClone = !!settingsBtn && !!btn.dataset && btn.getAttribute('class') !== null && String(btn.className).indexOf('sc-trigger') < 0;
        var sync = function () {
          if (!btn.isConnected) {
            var wr = btn.parentElement;
            btn.remove();
            if (wr && wr !== foot && wr.children.length === 0) wr.remove(); // 清空独立行容器
            sidebarTries = 0;
            mountSidebarEntry();
            return;
          }
          if (isClone) return; // 克隆宿主按钮：样式随宿主，不干预 className（折叠由宿主侧栏整体处理）
          var collapsed = root && (root.classList.contains('hHd-Xa_collapsed') || root.clientWidth < 200);
          btn.className = collapsed ? 'sc-trigger sc-rail' : 'sc-trigger';
        };
        sync();
        if (root && typeof MutationObserver !== 'undefined') {
          sidebarObserver = new MutationObserver(sync);
          sidebarObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
          sidebarObserver.observe(foot, { childList: true });
        }
        return true;
      }

      // cordis client plugin 激活：注入 slots（满足契约）+ DOM 入口始终挂载（React 不可用时真实入口）
      function apply(ctx) {
        mount(); // root + mask + CSS（幂等）
        // 2026-09-10：窗口重新聚焦时刷新当前视图——面板停留期间后台数据（蒸馏/深睡/记忆写入）变化，
        // 切回窗口即取最新；仅面板打开时生效 + 1.5s 防抖（轻量替代全局轮询）。
        if (!window.__scFocusBound) {
          window.__scFocusBound = true;
          var lastFocusRefresh = 0;
          var focusRefresh = function () {
            try {
              var mk = document.getElementById('scpanl-mask');
              if (!mk || !mk.classList.contains('open')) return; // 面板未打开=不刷
              if (document.hidden) return; // 页面隐藏中不刷（visibilitychange 返回时再刷）
              var now = Date.now();
              if (now - lastFocusRefresh < 1500) return; // 防抖
              lastFocusRefresh = now;
              refreshCurrentView();
            } catch (e) { /* 聚焦刷新零抛出 */ }
          };
          window.addEventListener('focus', focusRefresh);
          document.addEventListener('visibilitychange', function () { if (!document.hidden) focusRefresh(); });
        }
        // 0.1.2 起 React slot 按钮与 DOM 直插按钮（mountSidebarEntry）会同时显示为两个入口，
        // 暂禁用 slot 按钮、只保留 DOM 直插真实入口；如需恢复 React slot 改回 true。
        var ENABLE_SLOT_BUTTON = false;
        if (ENABLE_SLOT_BUTTON && ctx && typeof ctx.effect === 'function' && ctx.slots && typeof ctx.slots.inject === 'function') {
          ctx.effect(function () {
            return ctx.slots.inject('sidebar.footer.action', function () {
              // 0.1.2 契约：React 组件作为 register 的第二个参数（options.component 已不再被读取）
              var reactEl = null;
              try { reactEl = require('react'); } catch (e) { reactEl = null; }
              var open = openPanel;
              var ShoucangToggle = function () {
                // 纯 DOM 插件无 react 运行时 → 渲染 null（React 组件返回 null 合法，空槽不崩）；DOM 入口由 mountSidebarEntry 提供
                if (!reactEl || typeof reactEl.createElement !== 'function') return null;
                return reactEl.createElement(
                  'button',
                  { type: 'button', title: '守藏面板', className: 'sc-trigger', onClick: function () { open(); } },
                  reactEl.createElement('img', { src: SC_ICON, alt: '守', style: { width: 22, height: 22, display: 'block', pointerEvents: 'none' } }),
                  reactEl.createElement('span', { className: 'sc-trigger-label' }, '守藏')
                );
              };
              return ctx.slots.register({
                name: 'sidebar.footer.action',
                id: 'shoucang-panel-toggle',
                label: function () { return '守藏面板'; }
              }, ShoucangToggle);
            });
          }, 'shoucang-panel: footer action');
        }
        // 真实入口：DOM 直插（无论 slot 是否渲染成功都可用）
        if (!document.getElementById('scpanl-btn')) mountSidebarEntry();
        return function () {
          if (sidebarObserver) { try { sidebarObserver.disconnect(); } catch (e) { /* noop */ } }
          var n = document.getElementById('scpanl-root'); if (n) n.remove();
          var b = document.getElementById('scpanl-btn'); if (b) b.remove();
        };
      }

      exports.inject = inject;
      exports.apply = apply;
      return module.exports;
    }
  });
})();
