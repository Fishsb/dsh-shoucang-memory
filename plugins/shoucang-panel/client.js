/**
 * @dsh-external/shoucang-panel — client 半区（纯 DOM，样式照搬 Obsidian 设置窗口）。
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
    id: '@dsh-external/shoucang-panel',
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
        '#scpanl-root,.sc-trigger{',
        '--sc-bg1:#1e1e1e;--sc-bg2:#161616;--sc-bg3:#252525;',
        '--sc-text:#dadada;--sc-muted:#999;--sc-faint:#666;',
        '--sc-border:#2a2a2a;--sc-accent:hsl(254deg 80% 68%);--sc-accent-hover:hsl(254deg 80% 74%);',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",sans-serif;}',
        '@media (prefers-color-scheme: light){#scpanl-root,.sc-trigger{',
        '--sc-bg1:#ffffff;--sc-bg2:#f6f6f6;--sc-bg3:#e9e9e9;',
        '--sc-text:#222222;--sc-muted:#777777;--sc-faint:#999999;',
        '--sc-border:#e0e0e0;}}',

        '.sc-trigger{box-sizing:border-box;cursor:pointer;width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);',
        'background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -2px;padding:0 10px 0 8px;',
        'font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden;user-select:none;}',
        '.sc-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.sc-trigger-glyph{flex:none;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;',
        'font-size:15px;font-weight:600;line-height:1;color:inherit;}',
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
        '.sc-nav-item:hover{background:var(--sc-bg3);color:var(--sc-text);}',
        '.sc-nav-item.active{background:var(--sc-bg3);color:var(--sc-accent);font-weight:600;}',
        '.sc-nav-spacer{flex:1;}',

        '.sc-main{flex:1;display:flex;flex-direction:column;background:var(--sc-bg1);min-width:0;}',
        '.sc-view{flex:1;overflow-y:auto;padding:20px 26px 44px;}',
        '.sc-view::-webkit-scrollbar{width:10px;}',
        '.sc-view::-webkit-scrollbar-thumb{background:var(--sc-border);border-radius:5px;}',

        '.sc-h1{margin:0 0 4px;font-size:19px;font-weight:700;color:var(--sc-text);}',
        '.sc-desc{margin:0 0 18px;font-size:12px;color:var(--sc-muted);line-height:1.5;}',

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

        '.sc-board-list{display:flex;flex-direction:column;gap:10px;}',
        '.sc-card{border:1px solid var(--sc-border);border-radius:10px;overflow:hidden;background:var(--sc-bg1);}',
        '.sc-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 12px;',
        'border-bottom:1px solid var(--sc-border);background:var(--sc-bg2);}',
        '.sc-card-name{font-size:12.5px;font-weight:600;color:var(--sc-text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.sc-card-meta{flex:none;font-size:11px;color:var(--sc-faint);}',
        '.sc-card-body{margin:0;padding:10px 12px;font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;',
        'font-size:12px;line-height:1.65;color:var(--sc-text);white-space:pre-wrap;word-break:break-word;',
        'max-height:300px;overflow-y:auto;background:var(--sc-bg1);}',

        '.sc-explorer{display:flex;align-items:stretch;height:100%;gap:0;}',
        '.sc-tree{width:216px;flex:none;min-width:0;border-right:1px solid var(--sc-border);overflow-y:auto;padding:6px 4px;}',
        '.sc-tree-row{display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:6px;cursor:pointer;',
        'font-size:12.5px;color:var(--sc-muted);white-space:nowrap;user-select:none;}',
        '.sc-tree-row:hover{background:var(--sc-bg3);color:var(--sc-text);}',
        '.sc-tree-row.active{background:var(--sc-bg3);color:var(--sc-accent);font-weight:600;}',
        '.sc-tree-row.sc-tree-folder{color:var(--sc-text);font-weight:500;}',
        '.sc-tree-arrow{flex:none;width:13px;text-align:center;color:var(--sc-faint);}',
        '.sc-tree-children{margin-left:12px;border-left:1px solid var(--sc-border);}',
        '.sc-note{flex:1;min-width:0;overflow-y:auto;padding:2px 16px 18px;}',
        '.sc-note-placeholder{color:var(--sc-faint);font-size:12.5px;padding:30px 8px;text-align:center;}',
        '.sc-note-title{font-size:15px;font-weight:700;color:var(--sc-text);margin:12px 0 2px;}',
        '.sc-note-meta{font-size:11px;color:var(--sc-faint);margin-bottom:8px;word-break:break-all;}',
        '.sc-note-props{margin:4px 0 12px;border:1px solid var(--sc-border);border-radius:8px;overflow:hidden;}',
        '.sc-prop-row{display:flex;gap:10px;padding:4px 10px;font-size:12px;border-top:1px solid var(--sc-border);}',
        '.sc-prop-row:first-of-type{border-top:none;}',
        '.sc-prop-name{flex:none;width:110px;color:var(--sc-muted);font-weight:600;}',
        '.sc-prop-value{flex:1;min-width:0;color:var(--sc-text);word-break:break-all;}',
        '.sc-tag{display:inline-block;padding:0 6px;margin:0 4px 2px 0;border-radius:999px;background:var(--sc-bg3);',
        'border:1px solid var(--sc-border);color:var(--sc-text);font-size:11px;line-height:16px;}',
        '.sc-note-props + .sc-note-body{border-top:1px solid var(--sc-border);padding-top:10px;}',
        '.sc-note-body{font-size:12.5px;line-height:1.7;color:var(--sc-text);white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}',
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
        '.sc-wl-link{color:var(--sc-accent);cursor:pointer;text-decoration:none;',
        'border-bottom:1px dashed color-mix(in srgb,var(--sc-accent) 45%,transparent);}',
        '.sc-wl-link:hover{text-decoration:underline;}',
        /* 记忆库实况（2026-09-06）：容量条 / stat 卡 / 标签 chip */
        '.sc-mem-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:6px 0 16px;}',
        '.sc-mem-stat{border:1px solid var(--sc-border);border-radius:10px;padding:10px 12px;background:var(--sc-bg1);}',
        '.sc-mem-stat-label{font-size:11px;color:var(--sc-muted);letter-spacing:.04em;margin-bottom:4px;}',
        '.sc-mem-stat-value{font-size:20px;font-weight:700;color:var(--sc-text);font-variant-numeric:tabular-nums;}',
        '.sc-mem-stat-sub{font-size:11px;color:var(--sc-faint);margin-top:2px;}',
        '.sc-cap{width:100%;height:6px;border-radius:3px;background:var(--sc-bg3);overflow:hidden;margin:6px 0 3px;}',
        '.sc-cap-fill{height:100%;border-radius:3px;background:var(--sc-accent);transition:width .3s;}',
        '.sc-cap.warn .sc-cap-fill{background:#e8a33d;}',
        '.sc-cap.crit .sc-cap-fill{background:#e5534b;}',
        '.sc-mem-sub{font-size:12px;color:var(--sc-text);margin:2px 0 0;padding-bottom:6px;}',
        '.sc-mem-sub.muted{color:var(--sc-muted);}',
        '.sc-mem-sub.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--sc-faint);}',
        '.sc-idx-group{margin-bottom:14px;}',
        '.sc-idx-group-head{display:flex;align-items:baseline;gap:8px;padding-bottom:5px;margin-bottom:4px;border-bottom:1px solid var(--sc-border);}',
        '.sc-idx-file{font-size:12.5px;font-weight:700;color:var(--sc-text);}',
        '.sc-idx-cap{font-size:11px;color:var(--sc-faint);font-variant-numeric:tabular-nums;}',
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
      ].join('');

      function status(msg) { var n = document.getElementById('sc-statusbar'); if (n) n.textContent = msg || ''; }
      function fail(e) { status('⚠ ' + e.message); }

      /* ---------- 页面：开关 ---------- */

      var SWITCH_KEYS = [
        ['boards.memory', '记忆板块 memory', '日记忆 → 温层类型目录 归档主链（三层记忆）'],
        ['injection.hot_memory', '注入日记忆指针 hot_memory', '热记忆是否包含当日蒸馏指针行（画像常驻；需 boards.memory 总闸开启）'],
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
        view.appendChild(el('div', 'sc-h1', '板块与管线'));
        view.appendChild(el('div', 'sc-desc', '⚠ deprecated：旧记忆三板块（画像/记忆/wiki）业务已由记忆插件+pmg 承接（facts F-003），本页仅存根目录配置兼容；配置入口见「配置原文」。'));
        // 画像 persona 四档滑块：关闭 / 仅注入我 / 仅注入你 / 全注入
        var personaMode = parsed.flags['injection.persona'] || 'both';
        var PERSONA_TIERS = [['off', '关闭'], ['me', '仅注入我'], ['you', '仅注入你'], ['both', '全注入']];
        var pItem = el('div', 'setting-item');
        var pInfo = el('div', 'setting-item-info');
        pInfo.appendChild(el('div', 'setting-item-name', '画像 persona 注入档位 injection.persona'));
        pInfo.appendChild(el('div', 'setting-item-desc', '关闭=不注入画像；仅注入我=只注入用户画像；仅注入你=只注入 agent画像；全注入=两者（默认）'));
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

      function stripFrontmatter(text) {
        var m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
        if (!m) return { meta: {}, body: text }
        var meta = {}
        m[1].split(/\r?\n/).forEach(function (line) {
          var kv = line.match(/^([\w-]+):\s*(.*)$/)
          if (kv) meta[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '')
        })
        return { meta: meta, body: text.slice(m[0].length) }
      }

      /* ---- Obsidian 仓库索引：[[双链]] 解析与跳转 ---- */

      var memoryState = { treeLoaded: false, tree: [], index: {}, collapsed: {}, selected: null }
      var pendingSelect = null

      function ensureMemoryIndex() {
        if (memoryState.treeLoaded) return Promise.resolve(true)
        return api('/boards/tree').then(function (r) {
          memoryState.tree = r.tree || []
          memoryState.index = {}
          memoryState.visibleCount = 0
          var walk = function (nodes) {
            nodes.forEach(function (n) {
              if (n.type === 'file') {
                if (n.name !== '_index.md') memoryState.visibleCount++ // _index.md 默认不显示
                var key = n.rel.replace(/\.md$/, '')
                var base = n.name.replace(/\.md$/, '')
                var leaf = key.split('/').pop()
                memoryState.index[key] = n.rel
                if (!(base in memoryState.index)) memoryState.index[base] = n.rel
                if (!(leaf in memoryState.index)) memoryState.index[leaf] = n.rel
              }
              if (n.children) walk(n.children)
            })
          }
          walk(memoryState.tree)
          memoryState.treeLoaded = true
          return true
        })
      }

      function resolveNote(target) {
        var raw = String(target || '').trim().split('|')[0].trim()
        if (!raw) return null
        if (memoryState.index[raw]) return memoryState.index[raw]
        var lc = raw.toLowerCase()
        var hit = Object.keys(memoryState.index).find(function (k) {
          return k.toLowerCase() === lc || k.toLowerCase().endsWith('/' + lc)
        })
        return hit ? memoryState.index[hit] : null
      }

      /** Obsidian 式双链渲染：[[目标]]（支持 [[路径|别名]]）→ 可点击跳转。 */
      function makeWikilink(label) {
        var a = el('a', 'sc-wl-link', label)
        a.href = '#'
        a.addEventListener('click', function (ev) {
          ev.preventDefault()
          openNoteTarget(label) // 闭包按次捕获，避免 var 循环共享末值
        })
        return a
      }

      function renderWikilinks(container, text) {
        var re = /\[\[([^\]|#]+)(?:\|[^\]|#]+)?\]\]/g
        var last = 0, m
        while ((m = re.exec(text))) {
          if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)))
          container.appendChild(makeWikilink((m[1] || '').trim()))
          last = m.index + m[0].length
        }
        if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)))
      }

      function openNoteTarget(target) {
        ensureMemoryIndex().then(function () {
          var rel = resolveNote(target)
          if (!rel) { status('未找到互链条目：' + target); return }
          if (currentView !== 'wiki') {
            pendingSelect = rel
            var item = refs.navItems.find(function (it) { return it.name === 'wiki' })
            if (item) { item.el.click(); return }
          }
          selectNote(rel)
        }).catch(fail)
      }

      function selectNote(rel) {
        memoryState.selected = rel
        var treeEl = document.querySelector('.sc-tree')
        if (treeEl) renderTreeInto(treeEl)
        api('/boards/note?rel=' + encodeURIComponent(rel)).then(function (r) {
          var noteEl = document.querySelector('.sc-note')
          if (!noteEl) return
          noteEl.textContent = ''
          var fm = stripFrontmatter(r.text || '')
          noteEl.appendChild(el('div', 'sc-note-title', (r.name || rel).replace(/\.md$/, '') + (r.name === '_index.md' ? ' · 指针表' : '')))
          var metaArr = [rel]
          if (fm.meta.subtype) metaArr.push(fm.meta.subtype)
          if (fm.meta.stage) metaArr.push(fm.meta.stage)
          if (fm.meta.updated) metaArr.push(fm.meta.updated)
          metaArr.push((r.mtime || '').slice(0, 10))
          noteEl.appendChild(el('div', 'sc-note-meta', metaArr.join(' · ')))
          renderNoteProps(noteEl, fm.meta) // Obsidian 属性块
          var bodyEl = el('div', 'sc-note-body')
          renderWikilinks(bodyEl, (fm.body || r.text || '').trim())
          noteEl.appendChild(bodyEl)
          status('已打开 ' + rel)
        }).catch(fail)
      }

      /** Obsidian 属性面板：frontmatter 逐行展示（名称+值，tags 转 chip）。 */
      function renderNoteProps(container, meta) {
        var keys = Object.keys(meta)
        if (!keys.length) return
        var box = el('div', 'sc-note-props')
        keys.forEach(function (k) {
          var row = el('div', 'sc-prop-row')
          row.appendChild(el('div', 'sc-prop-name', k))
          var valWrap = el('div', 'sc-prop-value')
          var v = meta[k]
          if (k === 'tags') {
            String(v).split(',').forEach(function (t) {
              var tag = t.trim().replace(/^"|"$/g, '')
              if (tag) valWrap.appendChild(el('span', 'sc-tag', tag))
            })
          } else {
            valWrap.textContent = v
          }
          row.appendChild(valWrap)
          box.appendChild(row)
        })
        container.appendChild(box)
      }

      function renderTreeInto(treeEl) {
        if (!treeEl || !memoryState.tree.length) return
        treeEl.textContent = ''
        var walk = function (nodes, depth, parent) {
          nodes.forEach(function (n) {
            if (n.type === 'dir') {
              var open = memoryState.collapsed[n.rel] !== true // 默认展开；仅 _index.md 文件默认隐藏
              var row = el('div', 'sc-tree-row sc-tree-folder')
              row.style.paddingLeft = (6 + depth * 10) + 'px'
              row.appendChild(el('span', 'sc-tree-arrow', open ? '▾' : '▸'))
              row.appendChild(el('span', 'sc-tree-folder-name', n.name))
              row.onclick = function () { memoryState.collapsed[n.rel] = open; renderTreeInto(treeEl) }
              parent.appendChild(row)
              if (open) {
                var box = el('div', 'sc-tree-children')
                walk(n.children || [], depth + 1, box)
                parent.appendChild(box)
              }
            } else {
              if (n.name === '_index.md') return // 默认不显示 _index.md
              var row2 = el('div', 'sc-tree-row' + (n.rel === memoryState.selected ? ' active' : ''))
              row2.style.paddingLeft = (6 + depth * 10) + 'px'
              row2.appendChild(el('span', 'sc-tree-arrow', '·'))
              row2.appendChild(el('span', null, n.name.replace(/\.md$/, '')))
              row2.onclick = function () { selectNote(n.rel) }
              parent.appendChild(row2)
            }
          })
        }
        var rootBox = el('div', 'sc-tree-children')
        walk(memoryState.tree, 0, rootBox)
        treeEl.appendChild(rootBox)
      }

      /** 记忆库指针行：点击打开 notes 小节（只读 /memory/sections）；pointer=null 时不跳转。 */
      function openMemoryNote(pointer, autoSection) {
        if (!pointer) { status('该条目无 notes 跳转目标'); return; }
        var rel = String(pointer).split('§')[0].trim();
        if (!/^notes\/[a-z]+\.md$/.test(rel)) { status('指针目标非 notes 白名单：' + pointer); return; }
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
      function renderIndexRows(container, lines) {
        (lines || []).forEach(function (ln) {
          var row = el('div', 'sc-idx-row');
          row.appendChild(idxPill(ln.tag));
          row.appendChild(el('span', 'sc-idx-subject', ln.subject || ''));
          if (ln.pointer) row.appendChild(el('span', 'sc-idx-pointer', ln.pointer));
          var ptr = ln.pointer, sec = String(ln.pointer || '').split('§')[1] || '';
          row.addEventListener('click', function () { openMemoryNote(ptr, sec.trim() || null); });
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

      /** 画像板块（F-003 重定义 2026-09-06）：真实画像 = USER.md/AGENT.md 指针行 + 容量（记忆库事实源）。 */
      function renderPersona(view, data) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '画像板块'));
        view.appendChild(el('div', 'sc-desc', '记忆库画像实况（managing-memory 事实源）：USER.md（用户画像）· AGENT.md（Agent 画像）。指针行 → 点击直达 notes/ 详情小节。'));
        if (!data || !data.present || !(data.indexes && data.indexes.length)) {
          status((data && data.error) || '记忆库画像不可用');
          return;
        }
        var pair = data.indexes.filter(function (f) { return f.name === 'USER.md' || f.name === 'AGENT.md' });
        var totalRows = 0;
        // 顶栏容量卡（对齐记忆页结构）
        var grid = el('div', 'sc-mem-grid');
        pair.forEach(function (f) {
          var pp = f.cap ? Math.round(f.chars / f.cap * 100) : 0;
          var card = el('div', 'sc-mem-stat');
          card.appendChild(el('div', 'sc-mem-stat-label', f.name.replace('.md', '') + ' 容量'));
          card.appendChild(el('div', 'sc-mem-stat-value', f.chars + ' / ' + f.cap));
          card.appendChild(el('div', 'sc-mem-stat-sub', pp + '% · ' + (f.lines || []).length + ' 条画像'));
          grid.appendChild(card);
        });
        view.appendChild(grid);
        // 指针行（tag pill + subject + pointer，点击跳 notes 小节）
        pair.forEach(function (f) {
          totalRows += (f.lines || []).length;
          view.appendChild(el('div', 'sc-mem-group-title', f.label + ' · ' + (f.lines || []).length));
          if (!(f.lines || []).length) { view.appendChild(el('div', 'sc-mem-empty', '（暂无指针行）')); return; }
          var list = el('div', 'sc-idx-list');
          list.style.cssText = 'display:flex;flex-direction:column;gap:1px;margin-bottom:10px;';
          renderIndexRows(list, f.lines);
          view.appendChild(list);
        });
        status('画像 · ' + totalRows + ' 条指针');
      }

      /** 记忆板块（F-003 重定义 2026-09-06）：记忆库总览仪表盘 + MEMORY.md 索引指针。 */
      function renderMemoryExpanded(view, data) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '记忆板块'));
        view.appendChild(el('div', 'sc-desc', '记忆库实况（managing-memory 事实源）：容量水位 / pending 候选 / 蒸馏运行 / 知识索引 MEMORY.md。'));
        if (!data || !data.present) {
          status((data && data.error) || '记忆库不可用');
          return;
        }
        var memoryFile = null;
        (data.indexes || []).forEach(function (f) { if (f.name === 'MEMORY.md') memoryFile = f; });

        // 顶栏 stat 卡：索引容量 / 指针数 / pending / 蒸馏水位
        var grid = el('div', 'sc-mem-grid');
        var mkStat = function (label, value, sub) {
          var card = el('div', 'sc-mem-stat');
          card.appendChild(el('div', 'sc-mem-stat-label', label));
          card.appendChild(el('div', 'sc-mem-stat-value', value));
          if (sub) card.appendChild(el('div', 'sc-mem-stat-sub', sub));
          return card;
        };
        if (memoryFile) {
          var pct = memoryFile.cap ? Math.round(memoryFile.chars / memoryFile.cap * 100) : 0;
          grid.appendChild(mkStat('MEMORY.md 容量', memoryFile.chars + ' / ' + memoryFile.cap, pct + '% · 索引 ' + (memoryFile.lines || []).length + ' 行'));
        }
        (data.indexes || []).filter(function (f) { return f.name === 'USER.md' || f.name === 'AGENT.md' }).forEach(function (f) {
          var p2 = f.cap ? Math.round(f.chars / f.cap * 100) : 0;
          grid.appendChild(mkStat(f.name.replace('.md', ''), f.chars + ' / ' + f.cap, p2 + '% · ' + (f.lines || []).length + ' 行'));
        });
        grid.appendChild(mkStat('pending 候选', String(data.pending ? data.pending.count : 0), 'ADD-only 暂存 · 非权威'));
        // 蒸馏：最近蒸馏时间 + 待归档队列
        var dLast = data.distill && data.distill.last;
        grid.appendChild(mkStat('蒸馏水位', dLast ? fmtTime(dLast.at) : '—', dLast ? ('lastSeq ' + String(dLast.lastSeq) + ' · ' + String(dLast.sessionId || '').replace(/^session-/, '').slice(0, 8)) : 'watcher 事件驱动'));
        var undone = data.queue ? data.queue.undone : 0;
        grid.appendChild(mkStat('待归档会话', String(undone), undone ? 'archive-progress 未 done' : '无积压'));
        view.appendChild(grid);

        // 容量进度条
        if (memoryFile) {
          var pctv = memoryFile.cap ? Math.round(memoryFile.chars / memoryFile.cap * 100) : 0;
          var capWrap = el('div', 'sc-mem-group-title');
          capWrap.textContent = '索引容量水位';
          view.appendChild(capWrap);
          (data.indexes || []).forEach(function (f) {
            if (!f.cap) return;
            var p = Math.round(f.chars / f.cap * 100);
            var row = el('div');
            row.appendChild(el('div', 'sc-mem-sub', f.label + ' · ' + f.chars + '/' + f.cap + ' (' + p + '%)'));
            var bar = el('div', 'sc-cap' + (p >= 95 ? ' crit' : p >= 80 ? ' warn' : ''));
            var fill = el('div', 'sc-cap-fill'); fill.style.width = Math.min(p, 100) + '%';
            bar.appendChild(fill); row.appendChild(bar);
            view.appendChild(row);
          });
        }


          // MEMORY.md 知识索引（tag pill + 主题 + notes 跳转）
          if (memoryFile && (memoryFile.lines || []).length) {
            view.appendChild(el('div', 'sc-mem-group-title', '知识索引 MEMORY.md · ' + memoryFile.lines.length + ' 条'));
            view.appendChild(el('div', 'sc-desc', '点击行直达 notes 详情小节（只读）。'));
            var idxWrap = el('div');
            idxWrap.style.cssText = 'border:1px solid var(--sc-border);border-radius:10px;padding:6px 10px;margin-bottom:6px;background:var(--sc-bg1);';
            renderIndexRows(idxWrap, memoryFile.lines);
            view.appendChild(idxWrap);
          }
        // pending 最近候选
        if (data.pending && data.pending.count) {
          view.appendChild(el('div', 'sc-mem-group-title', 'pending 候选队列 · ' + data.pending.count + ' 条'));
          var plist = el('div', 'sc-pointer-list');
          (data.pending.recent || []).forEach(function (p) {
            var name = String(p.name || '').replace(/\.md$/, '');
            plist.appendChild(makeMemoryPointerRow(name, null, (p.mtime || '').slice(0, 10)));
          });
          view.appendChild(plist);
          view.appendChild(el('div', 'sc-desc', '共 ' + data.pending.count + ' 条（仅显示最近 ' + (data.pending.recent || []).length + ' 条）· 只读展示'));
        } else {
          view.appendChild(el('div', 'sc-mem-empty', 'pending 队列为空'));
        }

        // notes/ 小节索引（可点开）
        view.appendChild(el('div', 'sc-mem-group-title', 'notes 详情小节'));
        var nw = el('div', 'sc-notes-list');
        (data.notes || []).forEach(function (nf) {
          var chip = el('div', 'sc-note-chip');
          chip.appendChild(el('span', null, nf.name));
          chip.appendChild(el('span', 'sc-tag', String(nf.sections.length)));
          chip.title = nf.rel + ' · ' + nf.sections.map(function (s) { return s.title }).join(' / ');
          chip.addEventListener('click', function () {
            api('/memory/sections?rel=' + encodeURIComponent(nf.rel)).then(function (r) {
              renderNoteSections(view, r);
            }).catch(fail);
          });
          nw.appendChild(chip);
        });
        view.appendChild(nw);

        status('记忆 · MEMORY ' + (memoryFile ? memoryFile.chars + '/' + memoryFile.cap + ' · ' + (memoryFile.lines || []).length + ' 行' : '不可用'));
      }

      /** notes 小节正文浏览（只读；/memory/sections）。 */
      function renderNoteSections(view, data) {
        if (!data || !data.present || !data.sections) { status((data && data.error) || '无小节'); return; }
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', data.name));
        view.appendChild(el('div', 'sc-desc', data.rel + ' · ' + data.sections.length + ' 个小节（白名单只读）'));
        var back = el('button', 'sc-btn subtle', '← 返回记忆库');
        back.type = 'button';
        back.addEventListener('click', function () { api('/memory/overview').then(function (r) { renderMemoryExpanded(view, r); }).catch(fail); });
        view.appendChild(back);
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
      function renderMemory(view) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '知识库 wiki'));
        view.appendChild(el('div', 'sc-desc', '四目录直接切换：画像 / 记忆 / 笔记 / 归档。'));
        var wrap = el('div', 'sc-explorer');
        var treeEl = el('div', 'sc-tree');
        var noteEl = el('div', 'sc-note');
        noteEl.appendChild(el('div', 'sc-note-placeholder', '选择左侧条目查看内容'));
        wrap.appendChild(treeEl);
        wrap.appendChild(noteEl);
        view.appendChild(wrap);
        status('加载仓库索引…');
        ensureMemoryIndex().then(function () {
          renderTreeInto(treeEl);
          var all = memoryState.visibleCount;
          status('知识库 · 仓库 ' + all + ' 个条目');
          if (pendingSelect) { var rel = pendingSelect; pendingSelect = null; selectNote(rel); }
        }).catch(fail);
      }

      /* ---------- 组装 ---------- */

      var VIEWS = [
        ['persona', '画像板块', 'persona'],
        ['memory', '记忆板块', 'memory'],
        ['wiki', '知识库 wiki (旧 vault)', 'file'],
        ['suite', '插件集合', 'file'],
        ['toggles', '板块与管线 (deprecated)', 'toggles'],
        ['file', '配置原文', 'file']
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
        } else if (name === 'wiki') {
          renderMemory(refs.view);
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

        // 左导航（Obsidian settings 侧栏）
        var nav = el('div', 'sc-nav');
        nav.appendChild(el('div', 'sc-nav-title', '守藏 SHOUCANG'));
        refs.navItems = [];
        VIEWS.forEach(function (v) {
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
        var bar = el('div'); bar.id = 'sc-statusbar';
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
        memoryState.treeLoaded = false;
        memoryState.tree = [];
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
