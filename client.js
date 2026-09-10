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
        /* 侧栏入口对齐 DSH 标准（2026-09-10 审查）：DSH 设置/各入口按钮=42px 高、margin 0——
           height 覆盖已移除（此前 34px 为旧 footer 布局遗留，与宿主入口不齐）；label 宽度由 L85 体系控 */
        '.sc-trigger-label{overflow:hidden;white-space:nowrap;}',
        '.sc-trigger.sc-rail .sc-trigger-label{display:none;}',
        /* 旧 footer 类名兼容（DSH 版本演进后多为死代码，保留防回退） */
        '.hHd-Xa_footerActions{padding-left:8px;margin:0;}',
        '.hHd-Xa_settingsArea{margin:0;}',

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

        /* 向量/模型配置卡样式优化（2026-09-10）：分组卡、Provider 按钮整齐、间距归属 */
        '.sc-vec-group{border:1px solid var(--sc-border);border-radius:10px;padding:2px 14px 10px;margin:0 0 14px;background:var(--sc-bg2);}',
        '.sc-vec-group-h{font-size:11px;font-weight:600;letter-spacing:.05em;color:var(--sc-faint);text-transform:uppercase;margin:10px 0 2px;}',
        '.sc-prov-btns{display:flex;flex-wrap:wrap;gap:6px;flex:none;max-width:420px;justify-content:flex-end;}',
        '.sc-prov-btns .sc-btn{padding:5px 12px;font-size:11.5px;border:1px solid transparent;background:transparent;color:var(--sc-muted);}',
        '.sc-prov-btns .sc-btn:hover{color:var(--sc-text);background:var(--sc-bg3);}',
        '.sc-prov-btns .sc-btn.on{color:var(--sc-accent);border-color:var(--sc-accent);background:color-mix(in srgb,var(--sc-accent) 10%,transparent);}',
        '.sc-vec-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin:4px 0 2px;}',
        '.sc-vec-actions .sc-btn{height:28px;padding:0 12px;display:inline-flex;align-items:center;}',

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
        ['boards.memory', '记忆板块 memory', '记忆板块显示开关（同时是热记忆注入总闸的父开关）'],
        ['injection.hot_memory', '注入热记忆总闸 hot_memory', '关=不注入 agent/用户画像与知识索引任何指针行；需 boards.memory 开启'],
        // 2026-09-10 审查收敛：archive/lifecycle/merge/scheduler 组开关是 v15 单库化前旧 Python 链路的
        // 遗留控件，其消费端（_meta/*.py）已不随包分发——保留只会误导用户"改了有效"。已移除。
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

      function renderViewToggles(view, parsed, global) {
        view.textContent = '';
        view.appendChild(el('div', 'sc-h1', '参数调节'));
        view.appendChild(el('div', 'sc-desc', '注入参数（全局，写 ~/.dsh/suite/scheduler.json）与运行时通道。改动即时写回（scheduler.json 备份先行）。面板 root 仅管理「配置原文」的 boards 显示项——注入配置已迁全局，不再随 root 切换变化。'));
        // 注入配置全局值（P1-2：global 优先；parsed 回落兼容旧 root YAML）
        var g = global || {};
        // R1：global 是最终生效值（scheduler ?? 默认），不回 root YAML——显示=实际注入值
        function gVal(key, fallback) { return (g[key] !== undefined && g[key] !== null) ? g[key] : fallback; }
        // 画像 persona 四档滑块：关闭 / 仅注入我 / 仅注入你 / 全注入
        var personaMode = String(gVal('persona', 'both'));
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
        // 2026-09-10 用户拍板：三上限=记忆库「容量门」（蒸馏/扩增超限拒写），不裁注入——
        // 任务执行时 agent 总看到完整双画像+记忆指针（裁切会漏记忆影响执行）；容量门控制记忆库能长多大
        var actualChars = (g && g.actual) || { agent: 0, user: 0, memory: 0 };
        view.appendChild(numSetting('AGENT.md 容量门 cap_agent', 'agent 画像记忆库容量（字符）：蒸馏/深睡写入超限会被 write_gate 拒（AGENT.md 当前实际 ' + (actualChars.agent || 0) + ' 字符）。**不影响任务执行注入**——注入总看完整画像', gVal('cap_agent', 3000), 'injection.cap_agent', '字符'));
        view.appendChild(numSetting('USER.md 容量门 cap_user', '用户画像记忆库容量（字符）：写入超限被拒（当前实际 ' + (actualChars.user || 0) + ' 字符）。不影响任务执行注入', gVal('cap_user', 2000), 'injection.cap_user', '字符'));
        view.appendChild(numSetting('MEMORY.md 容量门 cap_memory', '知识索引记忆库容量（字符）：写入超限被拒（当前实际 ' + (actualChars.memory || 0) + ' 字符）。注入按档位行数不受此限', gVal('cap_memory', 3000), 'injection.cap_memory', '字符'));
        // ── v7 活性/遗忘 · 校准阈值（2026-09-10）：条目活性状态机判定天数 + 融合召回降权系数；
        //    经 /set 写入 scheduler.json，深睡巡检/召回运行时生效（缺省 14/44/90/5/35 与 scheduler zod 默认一致）
        view.appendChild(el('div', 'sc-h1', '活性/遗忘 · 校准阈值（v7）'));
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
        var pctWrap = el('div'); pctWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:none;';
        var pctInp = el('input'); pctInp.type = 'number'; pctInp.className = 'sc-input'; pctInp.style.width = '96px'; pctInp.min = '5'; pctInp.max = '95'; pctInp.step = '5'; pctInp.value = String(gVal('recallColdFactorPercent', 35)); // 与 scheduler zod 默认一致
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
        injectInfo.style.cssText = 'margin:2px 0 10px;font-size:12px;color:var(--sc-accent);';
        view.appendChild(injectInfo);
        api('/inject/preview').then(function (r) {
          var txt = (r && r.text) || '';
          if (!txt) { injectInfo.textContent = '当前注入：空（hot_memory 关或画像/记忆为空）'; return; }
          var chars = txt.replace(/\s+/g, '').length;
          var tokens = Math.ceil(chars / 2); // 中文粗估 ~2 字符/token
          var lineCount = txt.split('\n').filter(function (l) { return l.trim().indexOf('- [') === 0; }).length;
          injectInfo.textContent = '当前直接注入 ≈ ' + tokens + ' token（' + chars + ' 字符 · 双画像+记忆指针 ' + lineCount + ' 条）——每轮随提示词注入';
        }).catch(function () { injectInfo.textContent = ''; });

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
        view.appendChild(el('div', 'sc-h1', '向量与模型 · 当前链路'));
        view.appendChild(el('div', 'sc-desc', '语义召回（vec.ts + bge-m3）运行态与开关。改动写 ~/.dsh/suite/scheduler.json，**需重载插件后生效**。本地 GPU 零 token；换云端在下方填 baseUrl/model。'));
        var vzone = el('div');
        function refreshVecZone() {
          api('/vector/status2').then(function (s2) {
            vzone.textContent = '';
            // 状态行（pill 风格，复用 sc-ds-badges）
            var vb = el('div', 'sc-ds-badges');
            var st = (s2.provider || 'off');
            var b0 = el('div', 'sc-ds-badge ' + (st === 'DmlExecutionProvider' ? 'running' : st === 'off' || st === 'unreachable' ? 'stalled' : 'ended'));
            b0.appendChild(el('span', 'dot'));
            b0.appendChild(el('span', null, 'provider ' + st));
            vb.appendChild(b0);
            var b1 = el('div', 'sc-ds-badge ended'); b1.appendChild(el('span', 'dot'));
            b1.appendChild(el('span', null, '缓存 ' + String((s2.cache && s2.cache.lines) || 0) + ' 行'));
            vb.appendChild(b1);
            if (s2.stats && s2.stats.queries) {
              var b2 = el('div', 'sc-ds-badge ended'); b2.appendChild(el('span', 'dot'));
              b2.appendChild(el('span', null, '召回 ' + String(s2.stats.queries) + ' 次 · ' + String(s2.stats.lastMode || '') + ' · ' + String(s2.stats.lastMs || 0) + 'ms'));
              b2.title = '最近查询: ' + String(s2.stats.lastQuery || '');
              vb.appendChild(b2);
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
            var swItem = el('div', 'setting-item');
            var swInfo = el('div', 'setting-item-info');
            swInfo.appendChild(el('div', 'setting-item-name', '语义召回开关 embedEnabled'));
            swInfo.appendChild(el('div', 'setting-item-desc', '开=融合召回（dense0.7+lexical0.3）；关=纯词法。写 scheduler.json'));
            swItem.appendChild(swInfo);
            var swCtl = el('div', 'setting-item-control'); swCtl.appendChild(sw);
            swItem.appendChild(swCtl);
            vzone.appendChild(swItem);
            // M2（2026-09-10 方案1·浏览器直连）：Provider 预设卡 + URL(datalist) + 模型下拉三态。
            // 探测由浏览器 fetch 目标服务（绕 DSH 宿主 panel 网络限制；Ollama/9915 CORS 均放行）。
            // 照抄 AnythingLLM EmbeddingSelection + Open WebUI 三态模式（考古蓝图 docs/model-config-impl-blueprint.md）。
            var curUrl = (s2.running && s2.running.baseUrl) || 'http://127.0.0.1:9915/v1';
            var curModel = (s2.running && s2.running.model) || 'bge-m3';
            var curKeyEnv = (s2.running && s2.running.apiKeyEnv) || 'EMBED_API_KEY';
            var EMBED_PROVIDERS = [
              { id: 'bge', name: '本地 bge-m3（守藏 GPU）', base: 'http://127.0.0.1:9915/v1', noEnum: true },
              { id: 'ollama', name: 'Ollama', base: 'http://127.0.0.1:11434/v1' },
              { id: 'lmstudio', name: 'LM Studio', base: 'http://127.0.0.1:1234/v1' },
              { id: 'custom', name: '自定义 OpenAI 兼容（云端）', base: '' }
            ];
            var provItem = el('div', 'setting-item');
            var provInfo = el('div', 'setting-item-info');
            provInfo.appendChild(el('div', 'setting-item-name', '语义检索来源'));
            provInfo.appendChild(el('div', 'setting-item-desc', '选服务 → 自动填地址 → 下方自动探测并列出可用模型（浏览器直连）。换服务/模型后请点「清缓存重建」。'));
            provItem.appendChild(provInfo);
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
            provItem.appendChild(provWrap);
            vzone.appendChild(provItem);
            // URL + datalist 预设 + key env
            var urlItem = el('div', 'setting-item');
            var urlInfo = el('div', 'setting-item-info');
            urlInfo.appendChild(el('div', 'setting-item-name', '服务地址（OpenAI 兼容 /v1 根）'));
            urlInfo.appendChild(el('div', 'setting-item-desc', '如 http://127.0.0.1:9915/v1 或 http://localhost:11434/v1；改完回车自动探测。'));
            urlItem.appendChild(urlInfo);
            var urlWrap = el('div'); urlWrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;flex:none;align-items:flex-end;';
            var uInp = el('input', 'sc-input'); uInp.value = curUrl; uInp.style.width = '320px'; uInp.placeholder = 'http://127.0.0.1:9915/v1';
            var dlist = el('datalist'); dlist.id = 'sc-embed-endpoints';
            ['http://127.0.0.1:9915/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'https://api.openai.com/v1', 'https://api.deepseek.com/v1'].forEach(function (ep) {
              var o = el('option'); o.value = ep; dlist.appendChild(o);
            });
            document.body.appendChild(dlist);
            uInp.setAttribute('list', 'sc-embed-endpoints');
            var mSel = el('select', 'sc-input'); mSel.style.width = '320px'; mSel.title = 'embedModel';
            var kInp = el('input', 'sc-input'); kInp.value = curKeyEnv; kInp.style.width = '200px'; kInp.title = 'embedApiKeyEnv'; kInp.placeholder = 'key 环境变量名（本地免填）';
            var probeHint = el('div', 'sc-mem-sub muted'); probeHint.style.cssText = 'max-width:320px;font-size:11px;';
            urlWrap.appendChild(uInp); urlWrap.appendChild(mSel); urlWrap.appendChild(kInp); urlWrap.appendChild(probeHint);
            urlItem.appendChild(urlWrap);
            vzone.appendChild(urlItem);
            // 保存 + 状态行
            var saveWrap = el('div', 'sc-vec-actions'); // 样式优化：统一按钮高对齐
            var probeBtn = el('button', 'sc-btn subtle', '重新探测');
            probeBtn.type = 'button'; probeBtn.style.cssText = 'padding:3px 12px;font-size:11.5px;';
            probeBtn.addEventListener('click', enumModels);
            var saveBtn = el('button', 'sc-btn', '保存配置');
            saveBtn.type = 'button'; saveBtn.style.cssText = 'padding:3px 14px;font-size:12px;';
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
                if (models && models.length) {
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
                  if (models.length) { finish(models, 'openai-compatible'); return; }
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
            clearInfo.appendChild(el('div', 'setting-item-desc', '缓存按 模型+行文本 指纹命中；换模型/改云端后点「清缓存重建」，下次召回按新模型自动重嵌（39 行薄行，~秒级）'));
            clearRow.appendChild(clearInfo);
            var clearBtn = el('button', 'sc-btn subtle', '清缓存重建');
            clearBtn.type = 'button';
            clearBtn.style.cssText = 'padding:4px 12px;font-size:12px;flex:none;';
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
            if (st === 'off' || st === 'unreachable') {
              var guide = el('div');
              guide.appendChild(el('div', 'sc-mem-group-title', '如何启用语义检索'));
              var g1 = el('div', 'setting-item');
              var g1i = el('div', 'setting-item-info');
              g1i.appendChild(el('div', 'setting-item-name', '方案 A · 本地 GPU 服务（推荐，零 token 成本）'));
              g1i.appendChild(el('div', 'setting-item-desc', '需自备 bge-m3 嵌入服务（OpenAI 兼容 /v1/embeddings，端口 9915）。当前检测不可达。'));
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
        view.appendChild(el('div', 'sc-h1', '蒸馏/深睡模型'));
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
          var wrap = el('div'); wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:none;';
          var sel = el('select', 'sc-input'); sel.style.width = '300px'; sel.title = keyP + '/' + keyM;
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
          // 模型配置已移至上方「蒸馏/深睡模型」卡（2026-09-10）——此处不再重复 provider/model 文本输入
          // 2026-09-10：立即处理 pending（project-defer 回流等）——手动触发一轮蒸馏
          var pendRow = el('div', 'setting-item');
          var pendInfo = el('div', 'setting-item-info');
          pendInfo.appendChild(el('div', 'setting-item-name', '立即处理 pending 候选'));
          pendInfo.appendChild(el('div', 'setting-item-desc', '手动触发一轮蒸馏——携带 pending/ 候选（如 project-defer 降级卡）重裁决入册。workspace 反解修复后 project 卡直写工作区 devref。'));
          pendRow.appendChild(pendInfo);
          var pendBtn = el('button', 'sc-btn subtle', '立即蒸馏一次');
          pendBtn.type = 'button';
          pendBtn.style.cssText = 'padding:5px 14px;font-size:12px;flex:none;';
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
      }

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
          renderIndexRows(list, f.lines, renderPersona); // 画像来源：返回时回画像板块；索引行只读，编辑进详情
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

        /* ── §0 状态徽章行（U4，ui-impl-plan：后台进程状态可见——Cognee/dsh-auto-memory 借鉴；复用 sc-ds-badges） ── */
        var badges = el('div', 'sc-ds-badges');
        var ds0 = data.distillStats;
        if (ds0) {
          var bDist = el('div', 'sc-ds-badge ' + ((ds0.runs || 0) ? 'ended' : 'running'));
          bDist.appendChild(el('span', 'dot'));
          bDist.appendChild(el('span', null, '蒸馏 ' + String(ds0.runs || 0) + ' 次' + (ds0.last ? '' : ' · 待命中')));
          badges.appendChild(bDist);
        }
        if (data.vector && data.vector.enabled !== false) {
          var vp = data.vector.provider || 'off';
          var bVec = el('div', 'sc-ds-badge ' + (vp === 'fusion' ? 'running' : vp === 'off' || vp === 'unreachable' ? 'stalled' : 'ended'));
          bVec.appendChild(el('span', 'dot'));
          bVec.appendChild(el('span', null, '向量 ' + (vp === 'fusion' ? '融合' : vp === 'gpu-ready' ? 'GPU就绪' : vp === 'lexical' ? '词法' : vp === 'cloud' ? '云端' : vp === 'unreachable' ? '服务未连' : '关')));
          badges.appendChild(bVec);
        }
        if (data.pending && data.pending.count) {
          var bPend = el('div', 'sc-ds-badge suspect');
          bPend.appendChild(el('span', 'dot'));
          bPend.appendChild(el('span', null, '候选 ' + String(data.pending.count)));
          badges.appendChild(bPend);
        }
        if (badges.childNodes.length) view.appendChild(badges);

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

        /* ── §4 pending 候选队列（U5：行尾加批准/忽略——Cursor/Mem0 审核态借鉴；写走 /memory/approve 门禁） ── */
        if (data.pending && data.pending.count) {
          group('pending 候选队列 · ' + data.pending.count + ' 条');
          var plist = el('div', 'sc-pointer-list');
          (data.pending.recent || []).forEach(function (p2) {
            var row = makeMemoryPointerRow(String(p2.name || '').replace(/\.md$/, ''), null, (p2.mtime || '').slice(0, 10));
            // 批准=确认有价值（移 .processed 跳过后续蒸馏裁决）；忽略=同语义手动处置；均只读安全
            var act = el('div'); act.style.cssText = 'display:flex;gap:6px;flex:none;align-items:center;';
            var fname = String(p2.name || '');
            var okBtn = el('button', 'sc-btn subtle', '批准');
            okBtn.type = 'button';
            okBtn.style.cssText = 'padding:3px 10px;font-size:11.5px;color:var(--sc-ok,var(--sc-accent));';
            okBtn.addEventListener('click', function () {
              api('/memory/approve', { method: 'POST', body: JSON.stringify({ pendingFile: fname }) })
                .then(function () { status('✓ 已批准 ' + fname + '（移 .processed，内容由蒸馏正常入册）'); })
                .catch(fail);
            });
            var rmBtn = el('button', 'sc-btn subtle', '忽略');
            rmBtn.type = 'button';
            rmBtn.style.cssText = 'padding:3px 10px;font-size:11.5px;color:var(--sc-muted);';
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
          view.appendChild(el('div', 'sc-desc', '共 ' + data.pending.count + ' 条（仅显示最近 ' + (data.pending.recent || []).length + ' 条）· 批准=确认有价值入册，忽略=移出队列'));
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

        /* ── §7 向量召回状态（U4，ui-impl-plan：只读展示真实链路 vec.ts+GPU；复用 sc-mem-grid/sc-ds-badges） ── */
        if (data.vector && data.vector.enabled !== false) {
          group('向量召回 · ' + (data.vector.provider || 'off'));
          var g7 = el('div', 'sc-mem-grid');
          g7.appendChild(mkStat('provider', String(data.vector.provider || '—'), '本地 bge-m3 · DirectML GPU'));
          g7.appendChild(mkStat('向量缓存', String(data.vector.cacheLines || 0) + ' 行', '行 hash 惰性补齐 · 可随时重建'));
          g7.appendChild(mkStat('语义召回', data.vector.provider === 'fusion' ? '融合中' : data.vector.provider === 'gpu-ready' ? '就绪' : '—', 'dense0.7 ⊕ lexical0.3'));
          view.appendChild(g7);
          if (data.vector.provider === 'off' || data.vector.provider === 'unreachable') {
            view.appendChild(el('div', 'sc-mem-empty', '向量服务未就绪（本地 bge-m3 :9915）——词法召回兜底运行，语义召回待服务启动'));
          }
        }

        /* ── §8 晨起摘要 delta（U4：深睡产出可见物；只读，存在才渲染） ── */
        if (data.delta && data.delta.present && data.delta.rows && data.delta.rows.length) {
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
        // U5：反链聚合（Logseq/思源借鉴）——引用此文件小节的来源清单
        if (data.backrefs && data.backrefs.length) {
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
          if (data.backrefs.length > 8) bl.appendChild(el('div', 'sc-mem-sub muted', '… 共 ' + data.backrefs.length + ' 处引用'));
          view.appendChild(bl);
        }
        // v5.4 树状：递归渲染小节树（## 顶层 → children ###/#### 子树逐层展开）
        function renderSecNode(sec, depth, container) {
          var pad = Math.min(depth, 4) * 14; // 子树缩进（最多 4 层视觉缩进）
          var head = el('div', 'sc-mem-group-title' + (depth > 0 ? ' sub' : ''));
          var arrow = el('span', 'sc-sec-arrow', '▸');
          head.appendChild(arrow);
          head.appendChild(document.createTextNode(sec.title));
          head.title = '点击展开/收起' + (depth > 0 ? '（子树）' : '');
          head.style.cursor = 'pointer';
          head.style.cssText = 'display:flex;align-items:baseline;gap:6px;padding-left:' + pad + 'px;';
          var body = el('div', 'sc-card-body');
          body.style.maxHeight = 'none';
          body.style.display = 'none';
          body.textContent = sec.body || (sec.children && sec.children.length ? '' : '（空小节）');
          var editSec = el('button', 'sc-btn subtle', '✎ 编辑此小节');
          editSec.type = 'button';
          editSec.style.cssText = 'margin:2px 0 6px ' + pad + 'px;padding:2px 10px;font-size:11px;color:var(--sc-accent);display:none;';
          editSec.addEventListener('click', function () { editNoteSection(data, sec, view); });
          var kidsWrap = el('div'); kidsWrap.style.cssText = 'display:none;';
          var toggle = function () {
            var open = body.style.display !== 'none' || kidsWrap.style.display !== 'none';
            if (open) { body.style.display = 'none'; kidsWrap.style.display = 'none'; editSec.style.display = 'none'; }
            else {
              body.style.display = 'block';
              editSec.style.display = 'inline-block';
              if (sec.children && sec.children.length) kidsWrap.style.display = 'block';
            }
            arrow.textContent = open ? '▸' : '▾';
            head.style.color = open ? '' : 'var(--sc-accent)';
          };
          head.addEventListener('click', toggle);
          container.appendChild(head);
          container.appendChild(body);
          container.appendChild(editSec);
          if (sec.children && sec.children.length) {
            (sec.children || []).forEach(function (c) { renderSecNode(c, depth + 1, kidsWrap); });
            container.appendChild(kidsWrap);
          }
        }
        (data.sections || []).forEach(function (sec) { renderSecNode(sec, 0, view); });
        status(data.rel + ' · ' + (data.sections || []).length + ' 顶层小节（树状，点击逐层展开；编辑在节点细节）');
      }
      /** R3：notes 小节正文编辑（走 /memory/section-edit 门禁；索引指针不动，只改详情正文） */
      function editNoteSection(data, sec, view) {
        if (!data || !data.rel || !sec) return;
        var bodyTxt = sec.body || '';
        var ta = el('textarea', 'sc-input'); ta.style.cssText = 'width:100%;min-height:120px;font-family:ui-monospace,monospace;font-size:12px;';
        ta.value = bodyTxt;
        var wrap = el('div');
        wrap.appendChild(el('div', 'sc-desc', '编辑 §' + sec.title + ' 正文（' + data.rel + '）——保留开头摘要行最佳；保存走写门（备份+容量红线），索引指针不变。'));
        wrap.appendChild(ta);
        var bar = el('div'); bar.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
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
          // T1：会话状态徽章（2026-09-10 收敛：五桶互斥且和为总数——铺开 0 值冗余；
          // 改为「会话总数 + 活跃 + 仅非零异常桶（探测中/待复核/疑似卡住）」，异常出现即浮现，正常态零噪音）
          var totalSessions = r.running + r.ended + r.probing + r.suspect + r.stalled;
          var badges = el('div', 'sc-ds-badges');
          var bt = el('div', 'sc-ds-badge ended');
          bt.appendChild(el('span', 'dot'));
          bt.appendChild(el('span', null, '会话 ' + totalSessions + (r.ended ? ' · 已结束 ' + r.ended : '')));
          bt.title = '在册会话总数（活跃+已结束+异常）；五态互斥分桶';
          badges.appendChild(bt);
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
            // P2：注入配置全局可用（无 root 也能调——global 来自 scheduler.json）
            if (!r.global) { status(r.error === 'no-active-root' ? '未激活根目录——请到「配置原文」页根目录区添加。' : (r.error || '')); return; }
            if (!r.parsed) status('注入参数已全局可用（scheduler.json）；root 未登记——「记忆板块显示」开关待登记后可用。');
            else status('已加载 ' + (r.file || ''));
            renderViewToggles(refs.view, r.parsed || {}, r.global);
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
          var icF = el('img'); icF.src = SC_ICON; icF.alt = '守'; icF.style.cssText = 'width:16px;height:16px;display:block;pointer-events:none;';
          btn.appendChild(icF);
          btn.appendChild(el('span', 'sc-trigger-label', '守藏'));
          btn.onclick = openPanel;
        }
        // 2026-09-10 审查二：守藏与设置**上下两行**——克隆按钮包进独立 triggerRow（同款宿主类），
        // 插到设置所在 triggerRow 前（同 settingsArea），两行上下排列、各自与设置同款样式。
        var settingsRow = settingsBtn ? settingsBtn.closest('[class*="triggerRow"]') : null;
        if (settingsBtn && settingsRow && btn.getAttribute('class') && String(btn.className).indexOf('sc-trigger') < 0) {
          var ownRow = el('div');
          ownRow.className = settingsRow.className; // 复用宿主 triggerRow 类（样式同设置行）
          ownRow.style.cssText = ''; // 宿主类自带 flex；不覆盖
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
