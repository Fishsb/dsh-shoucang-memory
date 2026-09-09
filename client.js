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

      function api(path, opts) {
        return fetch(BASE + path, Object.assign({ headers: { 'content-type': 'application/json' } }, opts))
          .then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
              return j;
            });
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

      /* ---------- Obsidian 样式（默认主题变量还原，深浅色自适应） ---------- */

      var CSS = [
        /* 主题跟随宿主（2026-09-09 拍板）：--sc-* 全量映射到 dsh web 宿主语义变量 --dsw-alias-*，
         * 宿主深浅色切换时面板自动跟随，不再依赖 prefers-color-scheme（原 media query 已删）；
         * fallback 保留原深色值（宿主变量缺失时兜底）。状态色直接消费宿主 state-* 语义。 */
        '#scpanl-root,.sc-trigger{',
        '--sc-bg1:var(--dsw-alias-bg-layer-1,#1e1e1e);--sc-bg2:var(--dsw-alias-bg-layer-2,#161616);--sc-bg3:var(--dsw-alias-bg-layer-3,#252525);',
        '--sc-text:var(--dsw-alias-label-primary,#dadada);--sc-muted:var(--dsw-alias-label-secondary,#999);--sc-faint:var(--dsw-alias-label-tertiary,#666);',
        '--sc-border:var(--dsw-alias-border-l2,#2a2a2a);--sc-accent:var(--dsw-alias-brand-primary,hsl(254deg 80% 68%));--sc-accent-hover:var(--dsw-alias-brand-primary,hsl(254deg 80% 74%));',
        '--sc-ok:var(--dsw-alias-state-success-primary,#3fb950);--sc-warn:var(--dsw-alias-state-warn-primary,#e8a33d);--sc-err:var(--dsw-alias-state-error-primary,#e5534b);',
        '--sc-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",sans-serif;}',

        '.sc-trigger{box-sizing:border-box;cursor:pointer;width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary,var(--sc-text));',
        'background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -2px;padding:0 10px 0 8px;',
        'font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden;user-select:none;}',
        '.sc-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,var(--sc-bg3))}',
        '.sc-trigger-label{white-space:nowrap;overflow:hidden;}',
        '.sc-trigger.sc-rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0;}',
        '.sc-trigger.sc-rail .sc-trigger-label{display:none;}',

        '.sc-persona-slider{display:flex;width:100%;max-width:290px;height:34px;border:1px solid var(--sc-border);border-radius:10px;overflow:hidden;flex:none;margin:6px 0 2px;background:var(--sc-bg2);}',
        '.sc-persona-cell{flex:1 1 0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--sc-muted);cursor:pointer;user-select:none;border-right:1px solid var(--sc-border);transition:background .15s,color .15s;white-space:nowrap;padding:0 2px;}',
        '.sc-persona-cell:last-child{border-right:none;}',
        '.sc-persona-cell.active{background:var(--sc-accent);color:#fff;font-weight:600;}',
        '.sc-persona-cell:not(.active):hover{background:var(--sc-bg3);color:var(--sc-text);}',
        '.sc-range-wrap{display:flex;flex-direction:column;gap:4px;align-items:flex-start;flex:none;min-width:220px;margin:6px 0 2px;}',
        '.sc-range-label{font-size:12px;color:var(--sc-text);font-weight:600;}',
        '.sc-range-wrap input[type=range]{width:100%;max-width:290px;accent-color:var(--sc-accent);}',
        /* 左下角设置元素：垂直标签统一两字、对齐、间距均衡（2026-08-27） */
        '.sc-trigger{height:34px;margin:2px 0 4px;}',
        '.sc-trigger-label{min-width:2em;overflow:hidden;white-space:nowrap;margin-left:-3px;}',
        '.hHd-Xa_footerActions{padding-left:30px;margin:4px 0;}',
        '.hHd-Xa_footerActions span{display:inline-block;width:2em;overflow:hidden;white-space:nowrap;vertical-align:middle;}',
        '.UQsH_q_triggerLabel{display:inline-block;width:2em;overflow:hidden;white-space:nowrap;vertical-align:middle;}',
        '.hHd-Xa_settingsArea{margin:4px 0;}',

        '#scpanl-mask{position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.5);display:none;',
        'align-items:center;justify-content:center;color:var(--sc-text);}',
        '#scpanl-mask.open{display:flex;}',

        '#scpanl-modal{width:min(880px,94vw);height:min(600px,88vh);display:flex;border-radius:12px;overflow:hidden;',
        'background:var(--sc-bg1);border:1px solid var(--sc-border);box-shadow:0 18px 60px rgba(0,0,0,.45);}',

        '.sc-nav{width:200px;flex:none;background:var(--sc-bg2);padding:14px 10px;display:flex;flex-direction:column;gap:2px;}',
        '.sc-nav-title{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--sc-muted);padding:4px 10px 10px;}',
        '.sc-nav-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:6px;cursor:pointer;',
        'font-size:13px;color:var(--sc-muted);user-select:none;}',
        '.sc-nav-item:hover{background:var(--sc-hover);color:var(--sc-text);}',
        '.sc-nav-item.active{background:var(--sc-hover);color:var(--sc-accent);font-weight:600;}',
        '.sc-nav-group{margin:12px 10px 3px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--sc-faint);}',
        '.sc-nav-spacer{flex:1;}',

        '.sc-main{flex:1;display:flex;flex-direction:column;background:var(--sc-bg1);min-width:0;}',
        '.sc-view{flex:1;overflow-y:auto;padding:22px 30px 48px;max-width:980px;}',
        '.sc-view::-webkit-scrollbar{width:10px;}',
        '.sc-view::-webkit-scrollbar-thumb{background:var(--sc-border);border-radius:5px;}',

        '.sc-h1{margin:0 0 4px;font-size:19px;font-weight:700;color:var(--sc-text);}',
        '.sc-desc{margin:0 0 18px;font-size:13px;color:var(--sc-muted);line-height:1.6;}',

        '.setting-item{display:flex;align-items:center;padding:12px 2px;border-top:1px solid var(--sc-border);gap:12px;}',
        '.setting-item:first-of-type{border-top:none;}',
        '.setting-item-info{flex:1;min-width:0;}',
        '.setting-item-name{font-size:13.5px;color:var(--sc-text);}',
        '.setting-item-desc{font-size:11.5px;color:var(--sc-muted);margin-top:2px;line-height:1.45;',
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px;}',
        '.sc-vec-row{display:flex;align-items:center;gap:8px;min-width:0;}',
        '.sc-vec-cell{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}',
        '.sc-vec-label{font-size:12px;color:var(--sc-text);max-width:480px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.sc-vec-progress{font-size:11px;color:var(--sc-accent);max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;}',
        '.sc-vec-status{flex:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--sc-muted);margin-left:auto;}',
        '.sc-vec-ctrl{display:flex;align-items:center;gap:6px;flex:none;}',

        '.checkbox-container{appearance:none;width:38px;height:21px;border-radius:21px;flex:none;cursor:pointer;',
        'background:var(--sc-bg3);border:1px solid var(--sc-border);position:relative;transition:background .15s,border-color .15s;margin:0;}',
        '.checkbox-container:checked{background:var(--sc-accent);border-color:var(--sc-accent);}',
        '.checkbox-container::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;',
        'border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s;}',
        '.checkbox-container:checked::after{left:19px;}',

        '.sc-input{flex:none;width:300px;padding:6px 10px;border-radius:5px;font-size:12.5px;color:var(--sc-text);',
        'border:1px solid var(--sc-border);background:var(--sc-bg2);outline:none;}',
        '.sc-input:focus{border-color:var(--sc-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--sc-accent) 22%,transparent);}',
        '.sc-btn{padding:6px 14px;border-radius:5px;cursor:pointer;font-size:12.5px;border:none;flex:none;',
        'background:var(--sc-accent);color:#fff;transition:background .15s;}',
        '.sc-btn:hover{background:var(--sc-accent-hover);}',
        '.sc-btn.subtle{background:transparent;color:var(--sc-muted);border:1px solid var(--sc-border);}',
        '.sc-btn.subtle:hover{color:var(--sc-text);background:var(--sc-bg3);}',

        '.sc-rootitem{display:flex;align-items:center;gap:8px;}',
        '.sc-rootitem.active .sc-rootname{color:var(--sc-accent);font-weight:600;}',
        '.sc-dot{width:7px;height:7px;border-radius:50%;background:var(--sc-faint);flex:none;}',
        '.sc-dot.on{background:var(--sc-accent);}',
        '.sc-rootname{font-size:13px;flex:none;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.sc-rootpath{flex:1;font-size:11px;color:var(--sc-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',

        '#sc-yaml{width:100%;height:260px;padding:10px;border-radius:6px;border:1px solid var(--sc-border);resize:vertical;',
        'background:var(--sc-bg2);color:var(--sc-text);font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;',
        'font-size:11.5px;line-height:1.55;outline:none;}',
        '#sc-yaml:focus{border-color:var(--sc-accent);}',
        '.sc-statusbar{padding:8px 26px;border-top:1px solid var(--sc-border);font-size:11px;color:var(--sc-muted);',
        'min-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--sc-bg1);}',

        /* 旧板块列表/卡片头样式已删（2026-09-09 pmg 移除后清理：sc-board-list/sc-card/sc-card-head/
         * sc-card-name/sc-card-meta DOM 零使用；sc-card-body 保留——notes 小节折叠体在用） */
        '.sc-card-body{margin:0;padding:10px 12px;font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;',
        'font-size:12px;line-height:1.65;color:var(--sc-text);white-space:pre-wrap;word-break:break-word;',
        'max-height:300px;overflow-y:auto;background:var(--sc-bg1);}',

        /* 旧 vault 文件树/笔记详情渲染样式已删（2026-09-09 wiki explorer/pmg 治理知识库时代遗留：
         * sc-explorer、sc-tree 系列、sc-note(容器)、sc-note-placeholder/title/meta/props、sc-prop 系列、
         * sc-wl-link、sc-note-body 全部 DOM 零使用）；.sc-tag 保留（notes chips 计数在用） */
        '.sc-tag{display:inline-block;padding:0 6px;margin:0 4px 2px 0;border-radius:999px;background:var(--sc-bg3);',
        'border:1px solid var(--sc-border);color:var(--sc-text);font-size:11px;line-height:16px;}',
        '.sc-mem-group-title{font-size:12px;font-weight:700;color:var(--sc-accent);letter-spacing:.05em;',
        'margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--sc-border);}',
        '.sc-mem-group-title:first-of-type{margin-top:0;}',
        '.sc-mem-empty{margin:0 0 14px;padding:6px 10px;font-size:12px;color:var(--sc-faint);',
        'border:1px dashed var(--sc-border);border-radius:8px;background:var(--sc-bg2);}',
        '.sc-pointer-list{display:flex;flex-direction:column;gap:8px;}',
        '.sc-pointer{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--sc-border);',
        'border-radius:10px;background:var(--sc-bg1);cursor:pointer;transition:background .12s;}',
        '.sc-pointer:hover{background:var(--sc-bg3);border-color:var(--sc-accent);}',
        '.sc-pointer-main{flex:1;min-width:0;}',
        '.sc-pointer-head{display:flex;align-items:baseline;gap:10px;}',
        '.sc-pointer-title{font-size:13px;font-weight:600;color:var(--sc-text);}',
        '.sc-pointer-meta{flex:none;font-size:11px;color:var(--sc-faint);}',
        '.sc-pointer-summary{margin-top:3px;font-size:12px;color:var(--sc-muted);line-height:1.5;',
        'overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
        '.sc-pointer-go{flex:none;color:var(--sc-accent);font-size:14px;font-weight:700;}',
        /* 记忆库实况（2026-09-06）：容量条 / stat 卡 / 标签 chip */
        '.sc-mem-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:6px 0 16px;}',
        '.sc-mem-stat{border:1px solid var(--sc-border);border-radius:12px;padding:10px 12px;background:var(--sc-bg1);transition:border-color .16s;}',,
        '.sc-mem-stat-label{font-size:11px;color:var(--sc-muted);letter-spacing:.04em;margin-bottom:4px;}',
        '.sc-mem-stat-value{font-size:20px;font-weight:700;color:var(--sc-text);font-variant-numeric:tabular-nums;}',
        '.sc-mem-stat-sub{font-size:11px;color:var(--sc-faint);margin-top:2px;}',
        '.sc-mem-stat:hover{border-color:var(--sc-faint);}',
        '.sc-cap{width:100%;height:6px;border-radius:3px;background:var(--sc-bg3);overflow:hidden;margin:6px 0 3px;}',
        '.sc-cap-fill{height:100%;border-radius:3px;background:var(--sc-accent);transition:width .3s;}',
        '.sc-cap.warn .sc-cap-fill{background:var(--sc-warn);}',
        '.sc-cap.crit .sc-cap-fill{background:var(--sc-err);}',
        /* 面板信息层级（Tufte/Few/NN-g 方法论落地 2026-09-06）：hero 卡 / sparkline / 语义色 / 折叠 */
        '.sc-mem-stat.hero{grid-column:span 2;padding:14px 16px;border-color:color-mix(in srgb,var(--sc-accent) 40%,var(--sc-border));}',
        '.sc-mem-stat.hero .sc-mem-stat-value{font-size:30px;line-height:1.1;}',
        '.sc-mem-stat.hero .sc-mem-stat-label{font-size:12px;}',
        '.sc-spark{display:block;margin-top:8px;}',
        '.sc-spark path{fill:none;stroke:var(--sc-accent);stroke-width:1.5;stroke-linejoin:round;}',
        '.sc-spark circle{fill:var(--sc-accent);}',
        '.sc-spark .base{stroke:var(--sc-border);stroke-width:1;}',
        '.sc-danger{color:var(--sc-err);font-weight:600;}',
        '.sc-idx-more{font-size:12px;color:var(--sc-accent);cursor:pointer;padding:5px 2px;border:none;background:none;text-align:left;}',
        '.sc-idx-more:hover{text-decoration:underline;}',
        '.sc-mem-sub{font-size:12px;color:var(--sc-text);margin:2px 0 0;padding-bottom:6px;}',
        '.sc-mem-sub.muted{color:var(--sc-muted);}',
        '.sc-mem-sub.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--sc-faint);}',
        '.sc-idx-list{display:flex;flex-direction:column;gap:1px;margin-bottom:10px;}',
        '.sc-idx-row{display:flex;gap:8px;align-items:baseline;padding:3px 2px;cursor:pointer;}',
        '.sc-idx-row:hover{background:var(--sc-bg3);border-radius:6px;}',
        '.sc-idx-tag{flex:none;font-size:10px;font-weight:700;padding:0 7px;border-radius:999px;line-height:16px;',
        'background:color-mix(in srgb,var(--sc-accent) 16%,transparent);color:var(--sc-accent);}',
        '.sc-idx-subject{flex:1;min-width:0;font-size:12.5px;color:var(--sc-text);line-height:1.5;}',
        '.sc-idx-pointer{flex:none;font-size:11px;color:var(--sc-muted);cursor:pointer;margin-left:8px;}',
        '.sc-idx-pointer:hover{color:var(--sc-accent);text-decoration:underline;}',
        '.sc-notes-list{display:flex;flex-direction:column;gap:6px;margin-top:4px;}',
        '.sc-note-chip{display:flex;align-items:center;gap:6px;border:1px solid var(--sc-border);border-radius:8px;',
        'padding:5px 9px;cursor:pointer;background:var(--sc-bg1);font-size:12px;color:var(--sc-text);}',
        '.sc-note-chip:hover{border-color:var(--sc-accent);background:var(--sc-bg3);}',
        '.sc-note-chip .sc-tag{background:var(--sc-bg3);color:var(--sc-faint);border:none;font-weight:600;}',
        '.sc-sec-arrow{display:inline-block;width:12px;flex:none;color:var(--sc-faint);transition:color .12s;}',
        /* 深度睡眠视图（T1 状态机 + T2 计时/控制；docs/ui-todo.md） */
        '.sc-h2{margin:18px 0 6px;font-size:14px;font-weight:700;color:var(--sc-muted);letter-spacing:.02em;}',
        '.sc-ds-badges{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px;}',
        '.sc-ds-badge{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;font-size:12.5px;font-weight:600;background:var(--sc-bg2);border:1px solid var(--sc-border);color:var(--sc-text);}',
        '.sc-ds-badge .dot{width:8px;height:8px;border-radius:50%;flex:none;}',
        '.sc-ds-badge.running{color:var(--sc-ok);}',
        '.sc-ds-badge.running .dot{background:var(--sc-ok);}',
        '.sc-ds-badge.ended{color:var(--sc-muted);}',
        '.sc-ds-badge.ended .dot{background:#999;}',
        '.sc-ds-badge.probing{color:#4a9eff;}',
        '.sc-ds-badge.probing .dot{background:#4a9eff;animation:scblink 1s infinite;}',
        '.sc-ds-badge.suspect{color:#4a9eff;}',
        '.sc-ds-badge.suspect .dot{background:#4a9eff;}',
        '.sc-ds-badge.stalled{color:#f85149;}',
        '.sc-ds-badge.stalled .dot{background:#f85149;}',
        '@keyframes scblink{50%{opacity:.3;}}',
        '.sc-ds-timing{display:flex;flex-wrap:wrap;gap:18px;margin:6px 0 4px;}',
        '.sc-ds-stat{display:flex;flex-direction:column;gap:2px;}',
        '.sc-ds-stat .k{font-size:11px;color:var(--sc-faint);}',
        '.sc-ds-stat .v{font-size:15px;font-weight:700;color:var(--sc-text);font-variant-numeric:tabular-nums;}',
        '.sc-ds-sessions{display:flex;flex-direction:column;gap:6px;margin:6px 0;}',
        '.sc-ds-session{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--sc-border);border-radius:8px;background:var(--sc-bg1);}',
        '.sc-ds-dot{width:10px;height:10px;border-radius:50%;flex:none;}',
        '.sc-ds-dot.running{background:var(--sc-ok);}',
        '.sc-ds-dot.ended{background:#999;}',
        '.sc-ds-dot.probing{background:#4a9eff;animation:scblink 1s infinite;}',
        '.sc-ds-dot.suspect{background:#4a9eff;}',
        '.sc-ds-dot.stalled{background:#f85149;}',
        '.sc-ds-session-main{flex:1;min-width:0;}',
        '.sc-ds-sid{font-size:13px;font-weight:600;color:var(--sc-text);font-family:monospace;}',
        '.sc-ds-session-sub{font-size:11.5px;color:var(--sc-muted);margin-top:2px;}',
        '.sc-ds-alert{margin:10px 0;padding:9px 12px;border-radius:8px;background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.4);color:#f85149;font-size:12.5px;}',
        '.sc-ds-ctl{display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;}',
      ].join('');

      function status(msg) { var n = document.getElementById('sc-statusbar'); if (n) n.textContent = msg || ''; }
      function fail(e) { status('⚠ ' + e.message); }

      /* ---------- 页面：开关 ---------- */

      var SWITCH_KEYS = [
        ['boards.memory', '记忆板块 memory', '日记忆 → 温层类型目录 归档主链（三层记忆）'],
        ['injection.hot_memory', '注入热记忆总闸 hot_memory', '关=不注入 agent/用户画像与知识索引任何指针行；需 boards.memory 总闸开启'],
        ['boards.wiki', 'Wiki 板块 wiki', '知识库文件树 + frontmatter 属性 + 双链（含 _index 默认隐藏）'],
        ['archive.enabled', '归档管线', '日记忆成熟归档入温层 + 归档/ 快照与 TTL 到期销毁'],
        ['lifecycle.enabled', '生命周期沉降 lifecycle', '置信度结算：boost/decay + 淘汰进归档（settle）'],
        ['lifecycle.archive.apply_confirm', '归档自动应用 apply_confirm', '蒸馏附带归档：开=仅 DRY 报告（需显式 --apply）；关=随蒸馏直接归档应用'],
        ['merge.enabled', '合并去重 merge', '归档移动/写门落库时检索重复：重复→并入既有条目，改版→时序 supersede'],
        ['scheduler.enabled', '调度执行器 scheduler', 'G0-G3 门状态机（route/verify 工具）']
      ];

      function makeToggle(key, name, desc, initial, onToggle) {
        var item = el('div', 'setting-item');
        var info = el('div', 'setting-item-info');
        info.appendChild(el('div', 'setting-item-name', name));
        info.appendChild(el('div', 'setting-item-desc', desc));
        var sw = el('input', 'checkbox-container'); sw.type = 'checkbox'; sw.checked = !!initial;
        sw.onchange = function () { onToggle(key, sw); };
        item.appendChild(info); item.appendChild(sw);
        return item;
      }

      function renderViewToggles(view, parsed) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '参数调节'));
        view.appendChild(el('div', 'sc-desc', '守藏根目录的运行参数：布尔开关一键切换、注入档位滑块调节，改动即时写回配置文件（备份先行）。标量参数（预算/阈值/时间窗）经「配置原文」编辑，后续逐步收编为本页控件。'));
        // 画像 persona 四档滑块：关闭 / 仅注入我 / 仅注入你 / 全注入
        var personaMode = parsed.flags['injection.persona'] || 'both';
        var PERSONA_TIERS = [['off', '关闭'], ['me', '仅注入我'], ['you', '仅注入你'], ['both', '全注入']];
        var pItem = el('div', 'setting-item');
        var pInfo = el('div', 'setting-item-info');
        pInfo.appendChild(el('div', 'setting-item-name', '画像 persona 注入档位 injection.persona'));
        pInfo.appendChild(el('div', 'setting-item-desc', 'v17 已生效：关闭=不注入画像；仅注入我=只注入 agent 画像 AGENT.md（含 [原则] 习得原则与 [路径] 任务路径）；仅注入你=只注入用户画像 USER.md；全注入=双画像（默认）'));
        var slider = el('div', 'sc-persona-slider');
        PERSONA_TIERS.forEach(function (tier, i) {
          var cell = el('div', 'sc-persona-cell' + (tier[0] === personaMode ? ' active' : ''));
          cell.textContent = tier[1];
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.persona', value: tier[0] }) })
              .then(function () {
                status('✓ persona 档位 = ' + tier[1]);
                slider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); });
                cell.classList.add('active');
              })
              .catch(fail);
          };
          slider.appendChild(cell);
        });
        pItem.appendChild(pInfo); pItem.appendChild(slider);
        view.appendChild(pItem);
        SWITCH_KEYS.forEach(function (it) {
          var cur = parsed.flags[it[0]];
          if (typeof cur !== 'boolean') return;
          view.appendChild(makeToggle(it[0], it[1], it[2], cur, function (key, sw) {
            api('/toggle', { method: 'POST', body: JSON.stringify({ key: key }) })
              .then(function () { status('✓ 已切换 ' + key); })
              .catch(function (e) { fail(e); sw.checked = !sw.checked; });
          }));
        });
        // 热记忆注入强度（五格滑块：off/low/medium/high/smart）
        var levelMode = parsed.injection_level || 'smart';
        var LEVEL_TIERS = [['off', 'off'], ['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['smart', 'smart']];
        var lItem = el('div', 'setting-item');
        var lInfo = el('div', 'setting-item-info');
        lInfo.appendChild(el('div', 'setting-item-name', '热记忆注入强度 injection.level'));
        lInfo.appendChild(el('div', 'setting-item-desc', 'off=不注入 / low(2) / medium(4) / high(8) / smart=智能上限(10)·默认；改动即时生效（缓存作废）'));
        var lSlider = el('div', 'sc-persona-slider');
        LEVEL_TIERS.forEach(function (tier, i) {
          var cell = el('div', 'sc-persona-cell' + (tier[0] === levelMode ? ' active' : ''));
          cell.textContent = tier[1];
          cell.title = 'injection.level = ' + tier[0];
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'injection.level', value: tier[0] }) })
              .then(function () {
                status('✓ injection.level = ' + tier[0]);
                lSlider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); });
                cell.classList.add('active');
              })
              .catch(fail);
          };
          lSlider.appendChild(cell);
        });
        lItem.appendChild(lInfo); lItem.appendChild(lSlider);
        view.appendChild(lItem);

        // 注入容量预算（v16）：总预算 + 三板块字符上限（0=不裁）
        function numSetting(name, desc, val, key, unit) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', name));
          info.appendChild(el('div', 'setting-item-desc', desc));
          var wrap = el('div'); wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:none;';
          var inp = el('input'); inp.type = 'number'; inp.className = 'sc-input'; inp.style.width = '96px'; inp.min = '0'; inp.step = '100'; inp.value = String(val);
          var unitEl = el('span', 'sc-range-label', unit || '');
          inp.onchange = function () {
            var v = String(Math.max(0, parseInt(inp.value, 10) || 0));
            api('/set', { method: 'POST', body: JSON.stringify({ key: key, value: v }) })
              .then(function () { status('✓ ' + key + ' = ' + v); })
              .catch(fail);
          };
          wrap.appendChild(inp); wrap.appendChild(unitEl);
          item.appendChild(info); item.appendChild(wrap);
          return item;
        }
        view.appendChild(numSetting('注入总预算 injection.max_tokens', '整轮指针注入的 token 预算（100–8000，默认 3000；中文粗估 ~2 字符/token），超出整体裁切——v16 起生效', parsed.max_tokens != null ? parsed.max_tokens : 3000, 'injection.max_tokens', 'tokens'));
        view.appendChild(numSetting('agent 画像上限 injection.agent_max_chars', 'AGENT.md（含 [原则] 习得原则与 [路径] 任务路径）注入字符上限，逐行裁切不切半行；0=不裁（默认，靠容量门 3000 兜底）', parsed.caps_agent != null ? parsed.caps_agent : 0, 'injection.agent_max_chars', '字符'));
        view.appendChild(numSetting('用户画像上限 injection.user_max_chars', 'USER.md 注入字符上限；0=不裁（默认，靠容量门 2000 兜底）', parsed.caps_user != null ? parsed.caps_user : 0, 'injection.user_max_chars', '字符'));
        view.appendChild(numSetting('知识索引上限 injection.memory_max_chars', 'MEMORY.md 注入字符上限（在档位行数基础上二次裁切）；0=不裁（默认）', parsed.caps_memory != null ? parsed.caps_memory : 0, 'injection.memory_max_chars', '字符'));

        // 蒸馏时间：会话静默触发蒸馏阈值（分钟滑块）
        var distMin = Math.round((parsed.idle_review_ms || 600000) / 60000);
        view.appendChild(rangeSetting('蒸馏空闲触发 idle_review_ms', '会话静默 N 分钟后触发蒸馏（毫秒存档，默认 10 分钟）', distMin, 1, 60, '分钟', function (m) {
          return String(m * 60000);
        }, 'archive.idle_review_ms', '1'));
        // 归档触发：模式（固定时间/成熟时长）2 格滑块 + 条件控件
        var archMode = parsed.archive_mode || 'age';
        var aItem = el('div', 'setting-item');
        var aInfo = el('div', 'setting-item-info');
        aInfo.appendChild(el('div', 'setting-item-name', '归档触发 archive.mode'));
        aInfo.appendChild(el('div', 'setting-item-desc', '固定时间=每日 HH:MM 到点归档；成熟时长=日记忆至少停留 N 天。每次蒸馏执行时触发日计划检查'));
        var aSlider = el('div', 'sc-persona-slider');
        var aCells = [['fixed', '固定时间'], ['age', '成熟时长']];
        aCells.forEach(function (tier) {
          var cell = el('div', 'sc-persona-cell' + (tier[0] === archMode ? ' active' : ''));
          cell.textContent = tier[1];
          cell.onclick = function () {
            api('/set', { method: 'POST', body: JSON.stringify({ key: 'lifecycle.archive.mode', value: tier[0] }) })
              .then(function () {
                status('✓ 归档模式 = ' + tier[1]);
                aSlider.querySelectorAll('.sc-persona-cell').forEach(function (c) { c.classList.remove('active'); });
                cell.classList.add('active');
              })
              .catch(fail);
          };
          aSlider.appendChild(cell);
        });
        aItem.appendChild(aInfo); aItem.appendChild(aSlider);
        view.appendChild(aItem);
        // 固定时间输入（mode=fixed 时启用）
        var tItem = el('div', 'setting-item');
        var tInfo = el('div', 'setting-item-info');
        tInfo.appendChild(el('div', 'setting-item-name', '每日归档时间 lifecycle.archive.fixed_time'));
        tInfo.appendChild(el('div', 'setting-item-desc', 'HH:MM（默认 21:30）；到点后每次蒸馏触发日计划归档'));
        var tInput = el('input'); tInput.type = 'time'; tInput.step = '60'; tInput.value = parsed.fixed_time || '21:30';
        tInput.className = 'sc-input'; tInput.style.maxWidth = '120px';
        tInput.onchange = function () {
          api('/set', { method: 'POST', body: JSON.stringify({ key: 'lifecycle.archive.fixed_time', value: tInput.value }) })
            .then(function () { status('✓ fixed_time = ' + tInput.value); })
            .catch(fail);
        };
        tItem.appendChild(tInfo); tItem.appendChild(tInput);
        view.appendChild(tItem);
        // 归档成熟时长（同款 range 滑动条样式 · 10 档位置映射）
        var AGE_TIERS = [[0.125, '3小时'], [0.25, '6小时'], [0.5, '12小时'], [1, '1天'], [2, '2天'], [3, '3天'], [5, '5天'], [7, '7天'], [15, '15天'], [30, '30天']];
        var curAge = parsed.age_days != null ? parsed.age_days : 1;
        var ageIdx = 3;
        AGE_TIERS.forEach(function (tier, i) { if (Math.abs(tier[0] - curAge) < 1e-9) ageIdx = i; });
        var gItem = el('div', 'setting-item');
        var gInfo = el('div', 'setting-item-info');
        gInfo.appendChild(el('div', 'setting-item-name', '归档成熟时长 archive.age_days'));
        gInfo.appendChild(el('div', 'setting-item-desc', '日记忆条目至少停留该时长才可归档入温层（3小时~30天，默认 1 天；每次蒸馏触发日计划检查）'));
        var gWrap = el('div'); gWrap.className = 'sc-range-wrap';
        var gLab = el('span', 'sc-range-label'); gLab.textContent = AGE_TIERS[ageIdx][1];
        var gRange = el('input'); gRange.type = 'range'; gRange.min = '0'; gRange.max = String(AGE_TIERS.length - 1); gRange.step = '1'; gRange.value = String(ageIdx);
        gRange.addEventListener('input', function () { gLab.textContent = AGE_TIERS[Number(gRange.value)][1]; });
        gRange.addEventListener('change', function () {
          var tier = AGE_TIERS[Number(gRange.value)];
          api('/set', { method: 'POST', body: JSON.stringify({ key: 'lifecycle.archive.age_days', value: String(tier[0]) }) })
            .then(function () { status('✓ 归档成熟时长 = ' + tier[1]); gLab.textContent = tier[1]; })
            .catch(fail);
        });
        gWrap.appendChild(gLab); gWrap.appendChild(gRange);
        gItem.appendChild(gInfo); gItem.appendChild(gWrap);
        view.appendChild(gItem);
        // 合并去重阈值（规则层）
        view.appendChild(rangeSetting('指纹阈值 merge.fingerprint_threshold', '正文指纹 Jaccard ≥ 此值=完全重复（并入元数据）；低阈值区间=补充合并', parsed.merge_fpr != null ? parsed.merge_fpr : 0.85, 0.5, 0.95, '', function (v) { return String(v); }, 'merge.fingerprint_threshold', '0.05'));
        view.appendChild(rangeSetting('补充下限 merge.complement_floor', '同名低于此值=改版/矛盾，走时序 supersede', parsed.merge_floor != null ? parsed.merge_floor : 0.4, 0.1, 0.6, '', function (v) { return String(v); }, 'merge.complement_floor', '0.05'));
        // 向量检索（召回面 · 状态机单按钮 2026-08-27 重构）
        // 设计：单一主操作按钮随状态机切换文案/行为；布局预算明确——label/状态/进度均为单行省略号
        // （text-overflow），文件级长内容进 title；控件组 flex:none 不参与换行（参考 prompt-enhancer 范式）。
        view.appendChild(el('div', 'sc-h1', '向量检索（召回面）'));
        // ── 模型仓库：下载（HF 镜像断点）或导入本地目录 ──
        var mWrap = el('div');
        var mRow = el('div', 'setting-item');
        var mInfo = el('div', 'setting-item-info');
        mInfo.appendChild(el('div', 'setting-item-name', '模型仓库'));
        mInfo.appendChild(el('div', 'setting-item-desc', '从 HuggingFace 下载或导入本机已有目录；下载/部署动作见下方状态行按钮'));
        var mSel = el('select'); mSel.className = 'sc-input'; mSel.style.maxWidth = '200px';
        [['Xenova/bge-m3', 'Xenova/bge-m3 (1024)'], ['Xenova/bge-small-en-v1.5', 'Xenova/bge-small-en-v1.5 (384)'], ['Xenova/gte-small', 'Xenova/gte-small (384)']].forEach(function (p) {
          var o = el('option'); o.value = p[0]; o.textContent = p[1]; mSel.appendChild(o);
        });
        var dlBtn = el('button', 'sc-btn', '下载');
        // 下载按钮状态机（2026-08-27 修复）：随所选 repo 的本地状态切换——已下载/运行中/下载中均禁用，
        // 防「已有模型仍反复下载」；点击后立即置下载中防重复提交
        _dlSel = mSel; _dlBtn = dlBtn;
        mSel.onchange = function () { syncDownloadBtn(); };
        dlBtn.onclick = function () {
          var repo = mSel.value; var id = repo.split('/').pop();
          var cur = _lastModels.find(function (m) { return m.id === id; });
          if (cur && cur.status !== 'downloading' && cur.status !== 'downloaded' && cur.status !== 'starting' && cur.status !== 'running') cur = null;
          if (cur) { status('⚠ ' + id + ' 已存在（状态 ' + cur.status + '），无需重复下载'); syncDownloadBtn(); return; }
          dlBtn.disabled = true; dlBtn.textContent = '下载中…';
          api('/model/pull', { method: 'POST', body: JSON.stringify({ id: id, repo: repo, dim: repo.indexOf('bge-m3') >= 0 ? 1024 : 384 }) })
            .then(function () { status('✓ 开始下载 ' + id + '（进度见模型状态行）'); })
            .catch(function (e) { dlBtn.disabled = false; dlBtn.textContent = '下载'; status('⚠ ' + e.message); });
        };
        var impBtn = el('button', 'sc-btn subtle', '导入本地目录');
        impBtn.title = '选择本机已有 transformers.js 布局模型目录（config.json + onnx），登记后即可部署';
        impBtn.onclick = function () {
          impBtn.disabled = true; impBtn.textContent = '选择中…';
          api('/model/import', { method: 'POST' })
            .then(function (d) {
              impBtn.disabled = false; impBtn.textContent = '导入本地目录';
              if (d.cancelled) { status('已取消选择'); return; }
              if (d.error) { status('⚠ ' + d.error); return; }
              status('✓ 已导入 ' + d.id + '（' + d.dim + '维）→ 状态行「部署并启用」');
              syncDownloadBtn();
            })
            .catch(function (e) { impBtn.disabled = false; impBtn.textContent = '导入本地目录'; status('⚠ ' + e.message); });
        };
        var mCtrl = el('div', 'sc-vec-ctrl');
        mCtrl.appendChild(mSel); mCtrl.appendChild(dlBtn); mCtrl.appendChild(impBtn);
        mRow.appendChild(mInfo); mRow.appendChild(mCtrl);
        mWrap.appendChild(mRow);
        // ── 模型状态行（随状态切换主按钮；label 省略、进度单行）──
        var lItem = el('div', 'setting-item');
        var lInfo = el('div', 'setting-item-info');
        lInfo.appendChild(el('div', 'setting-item-name', '本地模型'));
        lInfo.appendChild(el('div', 'setting-item-desc', '单活约束：至多一个嵌入服务运行——部署新模型自动停旧服务并接管配置；左侧状态行按钮随状态切换'));
        var lList = el('div'); lList.style.flex = '1'; lList.style.minWidth = '0';
        lItem.appendChild(lInfo); lItem.appendChild(lList);
        mWrap.appendChild(lItem);
        view.appendChild(mWrap);
        // ── 检索索引状态行（主按钮随状态切换 + 状态省略）──
        var iItem = el('div', 'setting-item');
        var iInfo = el('div', 'setting-item-info');
        iInfo.appendChild(el('div', 'setting-item-name', '检索索引'));
        iInfo.appendChild(el('div', 'setting-item-desc', '与配置一致性：未建→构建索引；模型已切换→重建索引'));
        var iCtrl = el('div', 'sc-vec-row');
        var iBtnWrap = el('div', 'sc-vec-ctrl');
        var iLabel = el('span', 'sc-vec-status'); iLabel.textContent = '…';
        iCtrl.appendChild(iBtnWrap); iCtrl.appendChild(iLabel);
        iItem.appendChild(iInfo); iItem.appendChild(iCtrl);
        view.appendChild(iItem);
        // ── 向量配置（只读展示 · 2026-08-27 定稿）：由模型「部署/导入」自动写入 config，面板不提供手动编辑
        //（消除手工改配置与自动接管的双路径漂移；自动路径=唯一写入者，高级定制走「配置原文」YAML）
        var emb = parsed.embedding || {};
        function embRead(name, desc, value, emptyText) {
          var it = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', name));
          info.appendChild(el('div', 'setting-item-desc', desc));
          var val = el('span', 'sc-vec-label');
          val.textContent = (value != null && value !== '') ? String(value) : (emptyText || '（空）');
          val.style.maxWidth = '320px';
          info.appendChild(val);
          it.appendChild(info);
          return it;
        }
        view.appendChild(embRead('向量端点 embedding.base_url', '模型部署/导入时自动写入；留空=禁用语义检索（自动配置，面板只读）', emb.base_url, '（未配置）'));
        view.appendChild(embRead('嵌入模型 embedding.model', '当前生效模型；切换/重建在下方状态行操作（自动配置，面板只读）', emb.model, '（未配置）'));
        view.appendChild(embRead('维度 embedding.dimension', '与模型输出一致；与旧索引不一致触发迁移重嵌（自动配置，面板只读）', emb.dimension, '（未配置）'));
        view.appendChild(embRead('API Key embedding.api_key', '本地服务无鉴权，留空即可（如需 Bearer 可到「配置原文」YAML 填写）', emb.api_key, '（未配置）'));
        // ── 首次渲染 + 自动轮询（面板开着即刷新）──
        renderVectorZone(lList, iLabel, iBtnWrap);
        startVectorPoll(lList, iLabel, iBtnWrap);
        // ── 蒸馏节流（运行时通道 · 2026-09-09 新增）──
        // 背景：enableDistill/idleWakeMs/minTurnChars/distillPrescan/llmProvider/llmModel 六个键有插件 Config
        // 但不持久（注入插件不进 loader 配置持久化），此前只能手写 ~/.dsh/suite/scheduler.json；
        // 现经 /distill/config 读写同一文件（与深度睡眠同通道），**改动需重载插件后生效**。
        view.appendChild(el('div', 'sc-h1', '蒸馏节流（运行时通道）'));
        view.appendChild(el('div', 'sc-desc', '写入自持配置 ~/.dsh/suite/scheduler.json（深度睡眠同通道）。改动不会立刻作用到在跑的会话——**需重载插件后生效**。缺省：蒸馏开 / 空闲 10 分钟 / 本轮最少 200 字符 / 预筛开 / 模型继承主会话。'));
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
          var wrap = el('div'); wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:none;';
          var inp = el('input'); inp.className = 'sc-input'; inp.value = String(initial);
          if (kind === 'minutes') { inp.type = 'number'; inp.min = String(min || 1); inp.step = '1'; inp.style.width = '96px'; }
          else if (kind === 'chars') { inp.type = 'number'; inp.min = '0'; inp.step = '50'; inp.style.width = '96px'; }
          else { inp.type = 'text'; inp.placeholder = '留空=继承主会话模型'; inp.style.width = '180px'; }
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
          dZone.textContent = '';
          dZone.appendChild(distillToggle('enableDistill', '守藏蒸馏器 enableDistill', '关=不注册蒸馏器（/suite 等只读视图仍可用）；改动需重载生效', val('enableDistill', true)));
          dZone.appendChild(distillToggle('distillPrescan', '零成本预筛 distillPrescan', 'spawn 前先扫增量信号词 + pending 候选，皆无则跳过（不唤醒 LLM，省成本）', val('distillPrescan', true)));
          dZone.appendChild(distillInput('idleWakeMs', '空闲唤醒 idleWakeMs', 'turn 结束后空闲满此时长才蒸馏（≥1 分钟，默认 10 分钟）', Math.round(val('idleWakeMs', 600000) / 60000), 'minutes', 1));
          dZone.appendChild(distillInput('minTurnChars', '本轮最少字符 minTurnChars', '本轮新增正文少于此值跳过蒸馏（水位仍推进；0=不设限，默认 200）', val('minTurnChars', 200), 'chars'));
          dZone.appendChild(distillInput('llmProvider', '蒸馏模型 provider llmProvider', '蒸馏子代理指定 provider；留空=继承主会话模型（连败≥2 次自动回落继承）', val('llmProvider', ''), 'text'));
          dZone.appendChild(distillInput('llmModel', '蒸馏模型 llmModel', '蒸馏子代理指定 model；留空=继承主会话模型', val('llmModel', ''), 'text'));
          if (d && d.active === false) {
            dZone.appendChild(el('div', 'sc-desc', '⚠ 调度器未就绪：显示值为持久文件值，运行时值需插件激活后读取'));
          }
        }).catch(function (e) { dZone.textContent = ''; dZone.appendChild(el('div', 'sc-desc', '⚠ 读取失败：' + e.message)); });
      }

      function fmtVectorStatus(d) {
        if (!d || typeof d !== 'object') return '无响应';
        if (d.error) return '⚠ ' + String(d.error || '');
        var c = d.configured || {};
        if (!c.enabled) return '禁用（base_url 为空）';
        var ix = d.index;
        if (d.index_missing) return '索引未建（配置 ' + c.model + '@' + c.dimension + '）';
        if (d.needs_rebuild) return '不匹配：' + (d.why || '') + ' → 须重建索引';
        return '一致：' + (ix && ix.model) + '@' + (ix && ix.dimension) + ' · ' + (ix && ix.rows) + ' 行' + (ix && ix.built_at ? ' · ' + ix.built_at : '');
      }

      /* 向量区模块级联动（2026-08-27）：模型列表缓存 + 下载按钮状态机 + 状态行文案联动 */
      var _lastModels = [];
      var _dlSel = null, _dlBtn = null, _vecLabel = null;

      function syncDownloadBtn() {
        if (!_dlSel || !_dlBtn) return;
        var id = _dlSel.value.split('/').pop();
        var m = null;
        for (var i = 0; i < _lastModels.length; i++) if (_lastModels[i].id === id) { m = _lastModels[i]; break; }
        if (!m) { _dlBtn.disabled = false; _dlBtn.textContent = '下载'; return; }
        if (m.status === 'downloading') { _dlBtn.disabled = true; _dlBtn.textContent = '下载中 ' + (m.progress != null ? m.progress + '%' : '…'); return; }
        if (m.status === 'running' || m.status === 'starting') { _dlBtn.disabled = true; _dlBtn.textContent = '✓ 已启用'; return; }
        // downloaded / imported / stopped：已有，防反复下载 → 提示去状态行部署
        _dlBtn.disabled = true;
        _dlBtn.textContent = m.status === 'imported' ? '已导入' : '已下载';
        _dlBtn.title = m.id + ' 已在本机，无需重复下载；到下方「本地模型」状态行点「部署并启用」';
      }

      function vecHint(txt) { if (_vecLabel) { _vecLabel.textContent = txt; _vecLabel.title = txt; } }

      function fmtSize(n) {
        if (!n) return '-';
        return n > 1048576 ? (n / 1048576).toFixed(0) + ' MB' : (n / 1024).toFixed(0) + ' KB';
      }

      /* 模型行主按钮状态机（2026-08-27）：下载中→进度禁用；已下载/已导入→部署并启用；运行中→✓ 已启用 */
      function modelMainBtn(m, after) {
        var b;
        if (m.status === 'downloading') {
          b = el('button', 'sc-btn subtle', '下载中' + (m.progress != null ? ' ' + m.progress + '%' : '…'));
          b.disabled = true;
        } else if (m.status === 'running') {
          b = el('button', 'sc-btn subtle', '✓ 已启用');
          b.disabled = true;
          b.title = '运行于 :' + (m.port || '?') + '；切换模型后请在下文「检索索引」重建';
        } else {
          b = el('button', 'sc-btn', '部署并启用');
          b.onclick = function () {
            b.disabled = true; b.textContent = '部署中…';
            vecHint('部署中（加载模型可能 10-60 秒）…');
            api('/model/deploy', { method: 'POST', body: JSON.stringify({ id: m.id }) })
              .then(function (r) {
                if (r.configured) { status('✓ 已部署并接管 embedding 配置'); vecHint('✓ 已部署 —— 状态自动刷新中'); if (after) after(); return; }
                if (r.error) { b.textContent = '重试'; vecHint('⚠ 部署失败：' + String(r.error).slice(0, 140)); status('⚠ ' + r.error); return; }
                if (r.ok) { vecHint('服务已启动（端口 :' + (r.port || '?') + '），索引待重建'); if (after) after(); return; }
                // 未就绪（starting）：保持提示，轮询会自动跟踪 starting→running
                b.textContent = '部署中（未就绪）';
                vecHint('服务启动中（模型加载较慢），稍后自动刷新状态…');
              })
              .catch(function (e) { b.textContent = '部署并启用'; vecHint('⚠ 部署失败：' + String(e.message || e).slice(0, 140)); status('⚠ ' + e.message); });
          };
        }
        return b;
      }

      function renderVectorModels(listEl, after) {
        api('/model/list', { method: 'GET' }) // 差量渲染：不重置 listEl（2026-08-27 修复残留 textContent='' 导致的每轮整表重建闪烁）
          .then(function (d) {
            if (d.error) { listEl.textContent = '⚠ ' + d.error; return; }
            var ms = d.models || [];
            var keyed = {};
            ms.forEach(function (m) { keyed[m.id] = m; });
            if (!ms.length) { listEl.textContent = '（尚无模型：上方选仓库下载，或导入本地目录）'; return; }
            if (listEl.textContent === '（尚无模型：上方选仓库下载，或导入本地目录）') listEl.textContent = '';
            _lastModels = ms; // 缓存供下载按钮状态机
            syncDownloadBtn();
            // 移除已消失的行（差量，不重建整表）
            Array.prototype.forEach.call(listEl.children, function (row) {
              if (row.dataset && row.dataset.id && !keyed[row.dataset.id]) row.remove();
            });
            ms.forEach(function (m) {
              var structSig = m.status + '|' + (m.dim || '') + '|' + (m.port || '') + '|' + fmtSize(m.size);
              var row = null;
              Array.prototype.forEach.call(listEl.children, function (r) { if (r.dataset && r.dataset.id === m.id) row = r; });
              if (row && row.dataset.sig === structSig) {
                // 结构未变：仅进度文本原地更新（不重建 DOM → 不闪烁）
                if (row._prog && m.status === 'downloading') {
                  row._prog.textContent = (m.progress != null ? m.progress + '%' : '…') + (m.progress_cur ? ' · ' + m.progress_cur : '');
                  row._prog.title = row._prog.textContent;
                }
                return;
              }
              var rebuilt = el('div', 'sc-vec-row'); rebuilt.style.padding = '3px 0';
              rebuilt.dataset.id = m.id; rebuilt.dataset.sig = structSig;
              var cell = el('div', 'sc-vec-cell');
              var labelText = m.id + ' · ' + (m.dim || '?') + '维 · ' + fmtSize(m.size) + (m.port ? ' @' + m.port : '');
              var label = el('span', 'sc-vec-label'); label.textContent = labelText; label.title = labelText;
              cell.appendChild(label);
              var btn = modelMainBtn(m, after);
              rebuilt.appendChild(cell); rebuilt.appendChild(btn);
              if (m.status === 'downloading') {
                var prog = el('span', 'sc-vec-progress');
                prog.textContent = (m.progress != null ? m.progress + '%' : '…') + (m.progress_cur ? ' · ' + m.progress_cur : '');
                prog.title = prog.textContent;
                cell.appendChild(prog);
                rebuilt._prog = prog; // 轮询时仅更新此文本
              }
              if (row) row.replaceWith(rebuilt); else listEl.appendChild(rebuilt);
            });
          })
          .catch(function (e) { listEl.textContent = '⚠ ' + e.message; });
      }

      function renderVectorIdx(iLabel, iBtnWrap, after) {
        _vecLabel = iLabel; // 部署/重建进度文案联动（2026-08-27）
        api('/vector/status', { method: 'GET' })
          .then(function (st) {
            var txt = fmtVectorStatus(st);
            // 文本差量：内容未变不重赋值（textContent 同值赋值也会替换文本节点 → 重绘闪烁）
            if (iLabel._last !== txt) { iLabel._last = txt; iLabel.textContent = txt; iLabel.title = txt; }
            if (!st || st.error || !st.configured || !st.configured.enabled) return;
            var branch = st.index_missing ? 'build' : (st.needs_rebuild ? 'rebuild-warn' : 'rebuild-ok');
            // 分支未变：保留现有按钮（仅文本更新 → 不闪烁；含重建中 disabled 状态不被重置）
            if (iBtnWrap.dataset.branch === branch && iBtnWrap.children.length) return;
            iBtnWrap.textContent = '';
            iBtnWrap.dataset.branch = branch;
            var b;
            var rebuild = function (ev) {
              var btn = ev.target;
              btn.disabled = true; btn.textContent = '重建中…';
              vecHint('重建中（全量重嵌，可能 10-60 秒）…');
              api('/vector/build', { method: 'POST', body: JSON.stringify({ force: true }) })
                .then(function (d) {
                  // 失败判别：py error / raw 含 Traceback|Error（2026-08-27 修复：此前 fetch 200 即误报成功）
                  var raw = d && (d.raw || '');
                  if (d && (d.error || (typeof raw === 'string' && (raw.indexOf('Error') >= 0 || raw.indexOf('Traceback') >= 0)))) {
                    btn.disabled = false; btn.textContent = '重试';
                    vecHint('⚠ 重建失败：' + String(d.error || raw).slice(0, 140));
                    status('⚠ 索引重建失败——请检查嵌入服务（见「向量检索」状态行）');
                    return;
                  }
                  status('✓ 索引重建完成'); if (after) after();
                })
                .catch(function (e) { btn.disabled = false; btn.textContent = '重试'; vecHint('⚠ 重建失败：' + String(e.message || e).slice(0, 140)); status('⚠ 重建失败：' + e.message); });
            };
            if (branch === 'build') { b = el('button', 'sc-btn', '构建索引'); }
            else if (branch === 'rebuild-warn') { b = el('button', 'sc-btn', '重建索引（模型已切换）'); }
            else { b = el('button', 'sc-btn subtle', '重建索引'); }
            b.onclick = rebuild;
            iBtnWrap.appendChild(b);
          })
          .catch(function (e) { iLabel.textContent = '⚠ ' + e.message; });
      }

      function renderVectorZone(lList, iLabel, iBtnWrap) {
        renderVectorModels(lList, function () { renderVectorIdx(iLabel, iBtnWrap, null); });
        renderVectorIdx(iLabel, iBtnWrap, null);
      }

      function startVectorPoll(lList, iLabel, iBtnWrap) {
        // 面板开着（modal 可见）期间每 3s 刷新模型/索引状态；关闭自动停
        var n = 0;
        var iv = setInterval(function () {
          var modal = document.getElementById('scpanl-modal');
          if (!modal || modal.style.display === 'none') { clearInterval(iv); return; }
          renderVectorModels(lList, function () { renderVectorIdx(iLabel, iBtnWrap, null); });
          renderVectorIdx(iLabel, iBtnWrap, null);
          if (++n > 1200) clearInterval(iv);
        }, 3000);
      }

      function rangeSetting(name, desc, initial, min, max, unit, encode, key, step) {
        var item = el('div', 'setting-item');
        var info = el('div', 'setting-item-info');
        info.appendChild(el('div', 'setting-item-name', name));
        info.appendChild(el('div', 'setting-item-desc', desc));
        var wrap = el('div'); wrap.className = 'sc-range-wrap';
        var lab = el('span', 'sc-range-label'); lab.textContent = initial + ' ' + unit;
        var range = el('input'); range.type = 'range'; range.min = String(min); range.max = String(max); range.step = step || '1'; range.value = String(initial);
        range.addEventListener('input', function () { lab.textContent = range.value + ' ' + unit; });
        range.addEventListener('change', function () {
          api('/set', { method: 'POST', body: JSON.stringify({ key: key, value: encode(range.value) }) })
            .then(function () { status('✓ ' + name + ' = ' + range.value + ' ' + unit); lab.textContent = range.value + ' ' + unit; })
            .catch(fail);
        });
        wrap.appendChild(lab); wrap.appendChild(range);
        item.appendChild(info); item.appendChild(wrap);
        return item;
      }

      /* ---------- 页面：root ---------- */

      function renderViewRoots(view, rootListWrap) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '守藏根目录'));
        view.appendChild(el('div', 'sc-desc', '指向含 shoucang.config.yaml 的工作区目录。该目录本身即为 Obsidian 兼容 vault（Markdown + frontmatter + [[双链]]），可用 Obsidian 直接打开。'));

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
          if (!r.roots.length) {
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
        view.appendChild(el('div', 'sc-h1', '配置原文'));
        view.appendChild(el('div', 'sc-desc', '直接编辑 shoucang.config.yaml 全文。保存时原文件自动备份为 .bak-时间戳。'));
        ta.id = 'sc-yaml'; ta.spellcheck = false;
        view.appendChild(ta);
        saveRow.className = 'setting-item';
        var spacer = el('div', 'setting-item-info');
        saveRow.appendChild(spacer);
        saveRow.appendChild(saveRow._btn = el('button', 'sc-btn', '保存'));
        view.appendChild(saveRow);
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
          renderNoteSections(refs.view, r);
          if (autoSection) {
            var heads = refs.view.querySelectorAll('.sc-mem-group-title');
            heads.forEach(function (h) {
              if (h.textContent.indexOf(autoSection) !== -1) {
                var body = h.nextElementSibling;
                if (body && body.classList.contains('sc-card-body') && body.style.display === 'none') h.click();
              }
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
        var pill = el('span', 'sc-idx-tag', String(tag || '?'));
        pill.style.color = 'hsl(' + h + 'deg 72% 58%)';
        pill.style.background = 'color-mix(in srgb, hsl(' + h + 'deg 85% 60%) 15%, transparent)';
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
          row.addEventListener('click', function () { openMemoryNote(ptr, sec.trim() || null, returnRender); });
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

      /** 画像板块（F-003）：USER.md/AGENT.md 画像专属视图——容量与指针行**只在此板块**展示（记忆板块不重复统计画像）。 */
      function renderPersona(view, data) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '画像板块'));
        view.appendChild(el('div', 'sc-desc', 'USER.md（用户画像）· AGENT.md（Agent 画像）——画像容量与指针行的唯一展示位（记忆板块不重复）。指针行 → 点击直达 notes/ 详情小节。'));
        if (!data || !data.present || !(data.indexes && data.indexes.length)) {
          status((data && data.error) || '记忆库画像不可用');
          return;
        }
        var pair = data.indexes.filter(function (f) { return f.name === 'USER.md' || f.name === 'AGENT.md' });
        var totalRows = 0;
        // 顶栏容量卡（% 不在卡上，与进度条不重复）
        var grid = el('div', 'sc-mem-grid');
        pair.forEach(function (f) {
          var card = el('div', 'sc-mem-stat');
          card.appendChild(el('div', 'sc-mem-stat-label', f.name.replace('.md', '') + ' 容量'));
          card.appendChild(el('div', 'sc-mem-stat-value', f.chars + ' / ' + f.cap));
          card.appendChild(el('div', 'sc-mem-stat-sub', (f.lines || []).length + ' 条画像'));
          grid.appendChild(card);
        });
        view.appendChild(grid);
        // 容量进度条（% 唯一出现位，warn 80 / crit 95 阈值与记忆板块一致）
        pair.forEach(function (f) {
          var pp = f.cap ? Math.round(f.chars / f.cap * 100) : 0;
          var row = el('div');
          row.appendChild(el('div', 'sc-mem-sub', f.label + ' · ' + f.chars + '/' + f.cap + ' (' + pp + '%)'));
          var bar = el('div', 'sc-cap' + (pp >= 95 ? ' crit' : pp >= 80 ? ' warn' : ''));
          var fill = el('div', 'sc-cap-fill'); fill.style.width = Math.min(pp, 100) + '%';
          bar.appendChild(fill); row.appendChild(bar);
          view.appendChild(row);
        });
        // 指针行（tag pill + subject + pointer，点击跳 notes 小节）
        pair.forEach(function (f) {
          totalRows += (f.lines || []).length;
          view.appendChild(el('div', 'sc-mem-group-title', f.label + ' · ' + (f.lines || []).length));
          if (!(f.lines || []).length) { view.appendChild(el('div', 'sc-mem-empty', '（暂无指针行）')); return; }
          var list = el('div', 'sc-idx-list');
          renderIndexRows(list, f.lines, renderPersona); // 画像来源：返回时回画像板块
          view.appendChild(list);
        });
        status('画像 · ' + totalRows + ' 条指针');
      }

      /** 记忆板块（阶段4 UI 重排 2026-09-06）：分区展示——蒸馏运行 / 记忆库状态 / 知识索引 / pending / notes / 守藏知识区。
       * 去重原则：USER/AGENT 画像只在画像板块；MEMORY 容量百分比只在进度条；蒸馏水位读 suite 活水位。 */
      function renderMemoryExpanded(view, data) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '记忆板块'));
        view.appendChild(el('div', 'sc-desc', '蒸馏运行 → 记忆库状态 → 知识索引 → 候选与详情。画像（USER/AGENT）见「画像板块」。'));
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
          g1.appendChild(mkStat('路由分布', routeParts.length ? routeParts.join(' / ') : '—', (ds.rejected || 0) + ' 拒收' + ((ds.rejected || 0) || (ds.failed || 0) ? '' : ' · 全部放行')));
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
          if (rds.length) {
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
        if (memoryFile) g2.appendChild(mkStat('MEMORY.md 容量', memoryFile.chars + ' / ' + memoryFile.cap, '索引 ' + (memoryFile.lines || []).length + ' 行'));
        var pMeta = data.pending || {};
        var pSub = 'ADD-only 暂存 · 非权威';
        if (pMeta.count && typeof pMeta.last24h === 'number' && pMeta.last24h > 0) pSub = '24h 内新增 ' + pMeta.last24h + ' 条 · 蒸馏分批消化';
        g2.appendChild(mkStat('pending 候选', String(pMeta.count || 0), pSub));
        // 归档队列降级为次级卡（守藏语境的 so-what 弱：数据保留但不占蒸馏主行）
        var undone = data.queue ? data.queue.undone : 0;
        g2.appendChild(mkStat('待归档会话', String(undone), undone ? '记忆插件归档队列' : '无积压'));
        view.appendChild(g2);
        if (memoryFile && memoryFile.cap) {
          var p = Math.round(memoryFile.chars / memoryFile.cap * 100);
          var row = el('div');
          row.appendChild(el('div', 'sc-mem-sub', memoryFile.label + ' · ' + memoryFile.chars + '/' + memoryFile.cap + ' (' + p + '%)'));
          var bar = el('div', 'sc-cap' + (p >= 95 ? ' crit' : p >= 80 ? ' warn' : ''));
          var fill = el('div', 'sc-cap-fill'); fill.style.width = Math.min(p, 100) + '%';
          bar.appendChild(fill); row.appendChild(bar);
          view.appendChild(row);
        }

        /* ── §3 知识索引 MEMORY.md（progressive disclosure：默认 8 条 + 展开全部） ── */
        if (memoryFile && (memoryFile.lines || []).length) {
          group('知识索引 MEMORY.md · ' + memoryFile.lines.length + ' 条');
          view.appendChild(el('div', 'sc-desc', '点击行直达 notes 详情小节（只读）。'));
          var idxWrap = el('div');
          idxWrap.style.cssText = 'border:1px solid var(--sc-border);border-radius:10px;padding:6px 10px;margin-bottom:6px;background:var(--sc-bg1);';
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

        /* ── §4 pending 候选队列 ── */
        if (data.pending && data.pending.count) {
          group('pending 候选队列 · ' + data.pending.count + ' 条');
          var plist = el('div', 'sc-pointer-list');
          (data.pending.recent || []).forEach(function (p2) {
            var name = String(p2.name || '').replace(/\.md$/, '');
            plist.appendChild(makeMemoryPointerRow(name, null, (p2.mtime || '').slice(0, 10)));
          });
          view.appendChild(plist);
          view.appendChild(el('div', 'sc-desc', '共 ' + data.pending.count + ' 条（仅显示最近 ' + (data.pending.recent || []).length + ' 条）· 只读展示'));
        }

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
          view.appendChild(el('div', 'sc-desc', '守藏蒸馏器事实源（ADR-0002）：MEMORY ' + (sMemory ? sMemory.chars + '/' + sMemory.cap + ' · ' + (sMemory.lines || []).length + ' 行' : '—') + ' · pending ' + String(suite.pending ? suite.pending.count : 0) + ' 条。'));
          if (suite.notes && suite.notes.length) {
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

        status('记忆 · MEMORY ' + (memoryFile ? memoryFile.chars + '/' + memoryFile.cap + ' · ' + (memoryFile.lines || []).length + ' 行' : '不可用') + ' · 蒸馏 ' + (ds ? String(ds.runs || 0) + ' 次' : '—'));
      }

      /** notes 小节正文浏览（只读；/memory/sections）。返回时恢复来源板块与滚动位置（记忆/画像/守藏区均可进入）。 */
      var memoryViewScroll = 0; // 进二级视图前的 .sc-view 滚动位置
      var noteReturnRender = null; // 来源板块渲染器（null=记忆板块 renderMemoryExpanded）
      function renderNoteSections(view, data) {
        if (!data || !data.present || !data.sections) { status((data && data.error) || '无小节'); return; }
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', data.name));
        view.appendChild(el('div', 'sc-desc', (data.root === 'suite' ? 'suite 知识区 · ' : '') + data.rel + ' · ' + data.sections.length + ' 个小节（白名单只读）'));
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
        data.sections.forEach(function (sec) {
          var head = el('div', 'sc-mem-group-title');
          var arrow = el('span', 'sc-sec-arrow', '▸');
          head.appendChild(arrow);
          head.appendChild(document.createTextNode(sec.title));
          head.style.cursor = 'pointer';
          head.title = '点击展开/收起';
          head.style.display='flex'; head.style.alignItems='baseline'; head.style.gap='6px';
          var body = el('div', 'sc-card-body');
          body.style.maxHeight = 'none';
          body.style.display = 'none';
          body.textContent = sec.body || '（空小节）';
          var toggle = function () {
            var open = body.style.display !== 'none';
            body.style.display = open ? 'none' : 'block';
            arrow.textContent = open ? '▸' : '▾';
            head.style.color = open ? '' : 'var(--sc-accent)';
          };
          head.addEventListener('click', toggle);
          view.appendChild(head);
          view.appendChild(body);
        });
        status(data.rel + ' · ' + data.sections.length + ' 小节（点击标题展开）');
      }

      /** 记忆板块：Obsidian 仓库文件夹（文件树 + 笔记预览 + 属性块 + 双链跳转）。 */
      /* ---------- 组装 ---------- */

      var VIEWS = [
        ['persona', '画像板块', 'persona', '记忆'],
        ['memory', '记忆板块', 'memory', '记忆'],
        ['suite', '插件集合', 'file', '运行'],
        ['deepsleep', '深度睡眠', 'toggles', '运行'],
        ['toggles', '参数调节', 'toggles', '配置'],
        ['file', '配置原文', 'file', '配置']
      ];

      /* ---------- 插件集合视图（#3） ---------- */
      function renderSuite(view, data) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '插件集合'));
        view.appendChild(el('div', 'sc-desc', '守藏 = 集合中枢：装守藏 = 获得集合入口；成员插件独立可装。装配状态 = 注入器 registry + profiles 双基准。'));
        var members = (data && data.members) || [];
        if (!members.length) { view.appendChild(el('div', 'sc-desc', '无成员数据。')); return; }
        members.forEach(function (m) {
          var item = el('div', 'setting-item');
          var info = el('div', 'setting-item-info');
          info.appendChild(el('div', 'setting-item-name', (m.id || m.package) + '  ·  ' + (m.status || '?')));
          info.appendChild(el('div', 'setting-item-desc', m.package + (m.role ? ' · role ' + m.role : '') + (m.repo ? ' · ' + m.repo : '') + (m.detail ? ' — ' + m.detail : '')));
          item.appendChild(info);
          var badge = el('div', 'setting-item-control');
          var color = m.status === 'both' ? 'var(--sc-accent)' : m.status === 'missing' ? 'var(--sc-muted)' : 'var(--text-normal, inherit)';
          badge.style.color = color;
          badge.appendChild(el('span', null, m.status === 'both' ? '✓✓ 双基准' : m.status === 'injected' ? '✓ 注入器' : m.status === 'profile' ? '✓ profile' : '✗ 未装配'));
          item.appendChild(badge);
          view.appendChild(item);
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
      function dsBadge(state, count, label) {
        var b = el('div', 'sc-ds-badge ' + state);
        b.appendChild(el('span', 'dot'));
        b.appendChild(el('span', null, label + ' ' + (count || 0)));
        return b;
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
      function renderDeepSleep(view) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '深度睡眠 · 会话状态机'));
        view.appendChild(el('div', 'sc-desc', '全部根会话停滞 ≥ 阈值后自动回想当天记忆、提炼原则层 PRINCIPLES.md。状态机区分「正常长任务 / 卡住 / 异常退出」：仅长任务正在推进才拦睡，其余正常睡。'));
        api('/deepsleep').then(function (r) {
          if (!r.active) {
            view.appendChild(el('div', 'sc-desc', '深度睡眠归纳器当前未激活（蒸馏器 enableDistill 未启用或尚未就绪）。'));
            return;
          }
          // T1：状态机徽章
          var badges = el('div', 'sc-ds-badges');
          badges.appendChild(dsBadge('running', r.running, '活跃'));
          badges.appendChild(dsBadge('ended', r.ended, '已结束'));
          badges.appendChild(dsBadge('probing', r.probing, '探测中'));
          badges.appendChild(dsBadge('suspect', r.suspect, '待复核'));
          badges.appendChild(dsBadge('stalled', r.stalled, '疑似卡住'));
          view.appendChild(badges);
          // T2：计时
          var timing = el('div', 'sc-ds-timing');
          timing.appendChild(dsStat('已停滞', dsFmtAgo(r.lastActivityAt)));
          timing.appendChild(dsStat('下次预计入睡', dsFmtCountdown(r.nextEligibleAt)));
          timing.appendChild(dsStat('上次入睡', dsFmtTime(r.lastDeepSleepAt)));
          view.appendChild(timing);
          // T1：会话明细
          if (r.sessions && r.sessions.length) {
            view.appendChild(el('div', 'sc-h2', '会话明细'));
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
          view.appendChild(el('div', 'sc-h2', '控制'));
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
          // T2：可调阈值
          view.appendChild(el('div', 'sc-h2', '阈值（改后需重载插件生效）'));
          api('/deepsleep/config').then(function (cfg) {
            var run = cfg.running || {};
            view.appendChild(makeToggle('enableDeepSleep', '启用深度睡眠自动归纳 enableDeepSleep', '全部会话停滞 ≥ 阈值后自动提炼原则层（关闭=暂停）', !!run.enableDeepSleep, function (key, sw) {
              api('/deepsleep/config', { method: 'POST', body: JSON.stringify({ enableDeepSleep: sw.checked }) })
                .then(function () { status('✓ 已保存（重载生效）'); })
                .catch(function (e) { fail(e); sw.checked = !sw.checked; });
            }));
            view.appendChild(dsNumber('停滞阈值 deepSleepIdleMs', '全部会话无活动持续满此毫秒数才触发（默认 3 小时）', Math.round((run.deepSleepIdleMs || 10800000) / 60000), 10, 720, '分钟', function (m) { return m * 60000; }, 'deepSleepIdleMs'));
            view.appendChild(dsNumber('探测发起延迟 deepSleepProbeAfterMs', 'running 无事件持续此毫秒后发起输出增长探测（默认 3 小时）', Math.round((run.deepSleepProbeAfterMs || 10800000) / 60000), 10, 720, '分钟', function (m) { return m * 60000; }, 'deepSleepProbeAfterMs'));
            view.appendChild(dsNumber('探测采样间隔 deepSleepProbeWindowMs', '两轮采样之间的间隔（默认 60 秒）', Math.round((run.deepSleepProbeWindowMs || 60000) / 1000), 5, 600, '秒', function (s) { return s * 1000; }, 'deepSleepProbeWindowMs'));
          }).catch(fail);
        }).catch(function (e) {
          view.appendChild(el('div', 'sc-desc', '加载失败：' + (e && e.message ? e.message : e)));
        });
      }
      var refs = {};
      var state = { parsed: null };

      var currentView = 'file';
      function refreshCurrentView() { show(currentView); }
      function show(name) {
        currentView = name;
        refs.navItems.forEach(function (it) { it.el.classList.toggle('active', it.name === name); });
        refs.view.textContent = '';
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
            if (!r.parsed) { status(r.error === 'no-active-root' ? '未激活根目录——请到「配置原文」页根目录区添加。' : (r.error || '')); return; }
            status('已加载 ' + (r.file || ''));
            renderViewToggles(refs.view, r.parsed);
          }).catch(fail);
        } else if (name === 'deepsleep') {
          renderDeepSleep(refs.view);
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

      function buildModal(mask) {
        var modal = el('div'); modal.id = 'scpanl-modal';

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
          item.onclick = function () { show(v[0]); };
          refs.navItems.push({ name: v[0], el: item });
          nav.appendChild(item);
        });
        nav.appendChild(el('div', 'sc-nav-spacer'));
        nav.appendChild(el('div', 'sc-nav-title', 'storage = obsidian vault'));
        modal.appendChild(nav);

        // 右内容
        var main = el('div', 'sc-main');
        refs.view = el('div', 'sc-view');
        main.appendChild(refs.view);
        var bar = el('div', 'sc-statusbar'); bar.id = 'sc-statusbar'; // 类挂样式 + id 供 status() 定位（此前只挂 id，.sc-statusbar 类样式永不命中）
        main.appendChild(bar);
        modal.appendChild(main);

        mask.appendChild(modal);
        show('file');
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
        var ic = el('img'); ic.src = SC_ICON; ic.alt = '守'; ic.style.cssText = 'width:24px;height:24px;display:block;margin:8px auto;pointer-events:none;';
        btn.appendChild(ic);
        btn.dataset.fallback = '1';
        btn.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9800;width:40px;height:40px;border-radius:50%;' +
          'border:none;cursor:pointer;font-size:15px;font-weight:600;color:#fff;background:hsl(254deg 80% 68%);' +
          'box-shadow:0 2px 12px rgba(0,0,0,.28);';
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
        var btn = el('button'); btn.id = 'scpanl-btn'; btn.type = 'button'; btn.title = '守藏面板';
        btn.className = 'sc-trigger sc-rail';
        var ic = el('img'); ic.src = SC_ICON; ic.alt = '守'; ic.style.cssText = 'width:22px;height:22px;display:block;pointer-events:none;margin-left:-5px;';
        btn.appendChild(ic);
        btn.appendChild(el('span', 'sc-trigger-label', '守藏'));
        btn.onclick = openPanel;
        foot.insertBefore(btn, foot.firstChild); // 上移：记忆入口上方
        var root = foot.parentElement;
        var sync = function () {
          if (!btn.isConnected) {
            btn.remove();
            sidebarTries = 0;
            mountSidebarEntry();
            return;
          }
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
