/**
 * styles.js — 面板样式表（自 `body.js` 抽出 · UI1/U1 · 2026-09-15）
 *
 * **为什么抽出**：这 900+ 行是 `body.js` 的 17%，且**与逻辑无耦合**（纯字符串数组）—— 属"零风险高收益"的
 *   第一刀。抽出后 `body.js` 5476 → 约 4540 行（`check-module-growth` 的棘轮随之下调）。
 *
 * ⚠ **锚点契约（不可改）**：三件仓内工具按 `window.__SC_CSS__ = [ ... ].join('')` 的**字面量形态**
 *   从**产物**里抽取样式（`check-layout-px` / `audit-css-usage` / `gen-ui-preview`）。
 *   故本件**保留该字面量赋值**（而不是 `window.__SC_CSS__ = CSS`）—— 后者会让正则失配。
 *   相关判因见 `entry.js` 头注与 `check-layout-px.mjs` 的锚点正则。
 */

      export const CSS = (window.__SC_CSS__ = [
        /* ══════════ ① 令牌层 ══════════ */
        '#scpanl-root,.sc-trigger,.sc-fab{',
        /* 语义色 */
        '--sc-bg1:var(--dsw-alias-bg-layer-1,#1e1e1e);',
        '--sc-bg-card:#2a2a2f; /* v9 对齐：卡面比页面亮一档（凸卡体系）；sc-dark/sc-light 会覆盖 */',
        '--sc-bg2:var(--dsw-alias-bg-layer-2,#191919);',
        '--sc-bg3:var(--dsw-alias-bg-layer-3,#262626);',
        '--sc-text:var(--dsw-alias-label-primary,#e6e6e6);',
        '--sc-muted:var(--dsw-alias-label-secondary,#a2a2a2);',
        '--sc-faint:var(--dsw-alias-label-tertiary,#707070);',
        '--sc-border:var(--dsw-alias-border-l2,#2d2d2d);',
        '--sc-border-strong:var(--dsw-alias-border-l1,#404040);',
        /* 分隔线（卡内/页头）——v9 的 --border2：比 --sc-border 亮一档（深色 #33333a）。
         * v7 一致性补丁的实测结论：「分隔线与卡面只差 1/255 会看不见」，故分隔线随卡面一起提亮。 */
        '--sc-border2:var(--dsw-alias-border-l3,#33333a);',
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
        /* 选中态底（导航/标签）：v9 的 --brand-soft 是**实色**（dark #251f3a / light #f0ecff），
         * 用 color-mix 叠出来的同色系偏亮偏蓝 ⇒ 两套皮肤各给实色，host 皮肤退回按主色派生。 */
        '--sc-accent-soft:color-mix(in srgb,var(--sc-accent) 16%,var(--sc-bg2));',
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
        /* 容器级内距（v9 对齐）：`.sc-nav`/`.sc-statusbar` 属容器级选择器，门禁禁裸 px ⇒ 收敛为令牌 */
        '--sc-nav-pad:14px 10px 10px;--sc-nav-item-pad:8px 10px;--sc-statusbar-pad:7px 16px;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",sans-serif;',
        /* 根字号对齐 v9 的 body（13px/1.6）：面板此前继承宿主 16px ⇒ 未显式定字号的文本比方案大一档 */
        'font-size:13px;line-height:1.6;',
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
        '#scpanl-root .sc-h1{font-size:clamp(15px,1.35vw,18px);font-weight:650;line-height:var(--sc-lh-normal);',
        'letter-spacing:.2px;color:var(--sc-text);margin:0 0 var(--sc-sp-1);}',
        /* .sc-h2 已于 2026-09-13 删除（S3 门禁收口）：JS 零使用 = 死规则；标题层级由 .sc-h1（页级）/ .sc-h3（组级）承担 */
        '#scpanl-root .sc-h3{font-size:var(--sc-fs-xs);font-weight:var(--sc-fw-semibold);line-height:var(--sc-lh-tight);',
        'color:var(--sc-muted);margin:var(--sc-gap-item) 0 var(--sc-sp-1);}',
        '#scpanl-root .sc-desc{font-size:clamp(12px,.98vw,13px);line-height:1.55;color:var(--sc-muted);',
        'max-width:640px;margin:0 0 var(--sc-gap-item);}',
        /* 动作行（v9 .acts）：左按钮 + 右侧说明文字，与卡间留白一致（设置页「恢复默认」用） */
        '#scpanl-root .sc-acts{display:flex;align-items:center;gap:var(--sc-gap-item);flex-wrap:wrap;}',
        '#scpanl-root .sc-acts-note{font-size:var(--sc-fs-xs);color:var(--sc-faint);line-height:var(--sc-lh-normal);}',
        /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 h1/desc）。
         * v9 对齐（2026-09-13）：页头**不随内容滚动** —— 结构上移入 .sc-headslot（钉在 .sc-main 顶部，
         * 与 v9 的 .pagehead 同为 flex:none + 底部分隔线全宽），内距取 v9 实测 18/24/14。 */
        '#scpanl-root .sc-headslot{flex:none;background:var(--sc-bg-page);}',
        '#scpanl-root .sc-headslot:empty{display:none;}',
        '#scpanl-root .sc-pagehead{margin:0;padding:18px 24px 14px;border-bottom:1px solid var(--sc-border2);display:flex;flex-wrap:wrap;align-items:flex-start;gap:var(--sc-gap-item);}',
        '#scpanl-root .sc-pagehead .sc-h1{margin-bottom:var(--sc-sp-1);}',
        '#scpanl-root .sc-pagehead .sc-desc{margin-bottom:0;}',
        /* 架构视图（2026-09-13）：小节标题 / 事实行 / JSON 原文——供 renderFacts 与 rawDetails 使用 */
        '#scpanl-root .sc-sub{margin:var(--sc-sp-2) 0 var(--sc-sp-1);font-size:clamp(12px,.95vw,13px);font-weight:600;color:var(--sc-fg2);}',
        '#scpanl-root .sc-facts-row{padding:var(--sc-sp-1) 0;border-bottom:1px dashed var(--sc-border2);}',
        '#scpanl-root .sc-code{margin:var(--sc-sp-1) 0 0;padding:var(--sc-sp-2);background:var(--sc-bg2);border:1px solid var(--sc-border2);border-radius:var(--sc-radius,8px);font-size:clamp(11px,.88vw,12px);line-height:1.5;color:var(--sc-fg2);overflow:auto;max-height:320px;}',

        /* ══════════ ③ 布局层 ══════════ */
        '#scpanl-mask{position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.55);display:none;',
        'align-items:center;justify-content:center;color:var(--sc-text);padding:clamp(8px,2vw,24px);}',
        '#scpanl-mask.open{display:flex;}',
        '#scpanl-modal{width:min(1480px,96vw);height:min(900px,92vh);display:flex;overflow:hidden;',
        'border-radius:var(--sc-r-lg);background:var(--sc-bg1);border:1px solid var(--sc-border);',
        'box-shadow:var(--sc-shadow-3);}',
        /* 左导航 */
        '#scpanl-root .sc-nav{width:var(--sc-nav-w);flex:none;background:var(--sc-bg2);',
        'padding:var(--sc-nav-pad);display:flex;flex-direction:column;gap:2px;',
        'border-right:1px solid var(--sc-border);overflow-y:auto;overflow-x:hidden;}',
        /* 导航标题/分组标题：v9 的 .nav-title 规格（10.5px / 700 / .9px 字距 / 10-10-6 内距），首项顶距归零 */
        '#scpanl-root .sc-nav-title{font-size:10.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;',
        'color:var(--sc-faint);padding:10px 10px 6px;}',
        '#scpanl-root .sc-nav-title:first-child{padding-top:0;}',
        '#scpanl-root .sc-nav-group{margin:0;padding:10px 10px 6px;font-size:10.5px;font-weight:700;',
        'letter-spacing:.9px;text-transform:uppercase;color:var(--sc-faint);}',
        '#scpanl-root .sc-nav-item{position:relative;display:flex;align-items:center;gap:10px;',
        'padding:var(--sc-nav-item-pad);border-radius:var(--sc-r-sm);cursor:pointer;',
        'font-size:var(--sc-fs-sm);line-height:var(--sc-lh-normal);color:var(--sc-muted);user-select:none;',
        'transition:background var(--sc-t-base) var(--sc-ease),color var(--sc-t-base) var(--sc-ease),',
        'transform var(--sc-t-fast) var(--sc-ease);}',
        '#scpanl-root .sc-nav-item:hover{background:var(--sc-hover);color:var(--sc-text);}',
        '#scpanl-root .sc-nav-item:active{transform:translateY(1px);}',
        '#scpanl-root .sc-nav-item.active{background:var(--sc-accent-soft);',
        'color:var(--sc-accent);font-weight:var(--sc-fw-semibold);}',
        /* v9 对齐：方案选中态**无左侧强调竖条**（真机多一条 3px 紫条） */
        '#scpanl-root .sc-nav-item.active::before{display:none;}',
        '#scpanl-root .sc-nav-item svg{width:16px;height:16px;flex:none;}',
        '#scpanl-root .sc-nav-spacer{flex:1;}',
        '#scpanl-root .sc-nav-close{display:none;}',
        /* 右内容 */
        '#scpanl-root .sc-main{flex:1;display:flex;flex-direction:column;background:var(--sc-bg-page);min-width:0;min-height:0}',
        /* 内容区：v9 实测内距 18 / 24 / 26（保弹性 —— clamp 在 1280 档收敛到方案值） */
        '#scpanl-root .sc-view{flex:1;overflow-y:auto;padding:clamp(16px,1.45vw,20px) clamp(18px,1.9vw,28px) clamp(22px,2vw,28px);min-height:0}',
        /* v9 的块节奏：同级块间 16px（.view > * + * {margin-top:16px}）；下方自有 margin-bottom 的块与之取大 */
        '#scpanl-root .sc-view>*+*{margin-top:var(--sc-sp-4);}',
        '#scpanl-root .sc-view>*:last-child{margin-bottom:0;}',
        /* 异步填充的卡槽（深睡页：回执 / 材料预估由 /cognition/report 异步回填）——
         *   占位必须在**同步阶段**插入，否则异步返回晚于后续同步块 ⇒ 卡片落到页面末尾（实测踩到）。 */
        '#scpanl-root .sc-stack>*+*{margin-top:var(--sc-sp-4);}',
        '#scpanl-root .sc-statusbar{padding:var(--sc-statusbar-pad);border-top:1px solid var(--sc-border);',
        'font-size:11.5px;color:var(--sc-muted);min-height:28px;line-height:20px;',
        'background:var(--sc-bg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '#scpanl-root .sc-status-info{color:var(--sc-muted);}',
        '#scpanl-root .sc-status-warn{color:var(--sc-warn);}',
        '#scpanl-root .sc-status-error{color:var(--sc-err);font-weight:var(--sc-fw-semibold);}',
        /* ── 卡片层（v9 `.card`：卡头 11/14 · 12.5px/620 · 底分隔 1px --sc-border2；卡体 13/14）──
         * 与 .sc-fold 的分工：.sc-fold 是**可折叠**容器（带箭头/开合态），.sc-card 是**静态分组**容器。 */
        '#scpanl-root .sc-card{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);',
        'background:var(--sc-bg-card);overflow:hidden;}',
        '#scpanl-root .sc-card-hd{display:flex;align-items:center;gap:var(--sc-sp-2);padding:11px 14px;',
        'border-bottom:1px solid var(--sc-border2);font-size:12.5px;font-weight:620;color:var(--sc-text);}',
        '#scpanl-root .sc-card-hd .sub{font-weight:400;font-size:11.5px;color:var(--sc-faint);}',
        '#scpanl-root .sc-card-hd .right{margin-left:auto;display:flex;align-items:center;gap:var(--sc-sp-2);font-weight:400;}',
        '#scpanl-root .sc-card-bd{padding:13px 14px;display:flex;flex-direction:column;gap:var(--sc-gap-item);}',
        /* 卡内首末元素边距归零（v9 的卡片内不存在"末元素还带 24px 下边距"的空带——
         * 实测：卡体 221px = 内容 163 + 内距 26 + 网格上 8/下 24，底部多出 24px 暗带） */
        '#scpanl-root .sc-card-bd>*:first-child{margin-top:0;}',
        '#scpanl-root .sc-card-bd>*:last-child{margin-bottom:0;}',
        /* 卡内数值网格用更小列宽下限：v9 的三列（容量/成长）在卡内**一行排开**，
         * 沿用页面级 168px 下限会被挤成两行（实测 1.3fr 卡宽 ~540px）。 */
        '#scpanl-root .sc-card-bd .sc-mem-grid,#scpanl-root .sc-card-bd .sc-mem-stats{',
        'grid-template-columns:repeat(auto-fit,minmax(120px,1fr));}',
        /* 卡内**不再套卡**（v9 的卡体里是纯列：label/值/明细，没有第二层边框盒子——
         * 套卡会让"卡片层"失去语义，视觉上多一层噪声） */
        '#scpanl-root .sc-card-bd .sc-mem-stat{border:0;background:transparent;padding:0;border-radius:0;}',
        '#scpanl-root .sc-card-bd .sc-mem-stat:hover{border:0;background:transparent;}',
        /* 页头路由 chip（v9 的 .pagehead .src：等宽字体 + 胶囊 + panel2 底） */
        /* ⚠ 2026-09-13：此处原有 `#scpanl-root .sc-pagehead{display:flex;…}` 与上方同名顶层规则**重复定义**
           （CSS 审计门禁判「同层重复」）——已合并进上方唯一规则，勿在此再写第二份。 */
        '#scpanl-root .sc-ph-main{flex:1;min-width:0;}',
        '#scpanl-root .sc-ph-acts{margin-left:auto;display:flex;align-items:center;gap:var(--sc-sp-2);flex:none;}',
        '#scpanl-root .sc-srch{display:flex;align-items:center;gap:6px;border:1px solid var(--sc-border);',
        'border-radius:var(--sc-r-sm);background:var(--sc-bg2);padding:0 9px;min-width:190px;}',
        '#scpanl-root .sc-srch svg{width:14px;height:14px;color:var(--sc-faint);flex:none;}',
        '#scpanl-root .sc-srch input{border:0;background:none;outline:none;font:inherit;font-size:12px;',
        'color:var(--sc-text);padding:5px 0;width:100%;min-width:0;}',
        '#scpanl-root .sc-routes{display:flex;flex-wrap:wrap;gap:var(--sc-sp-1);margin-top:var(--sc-sp-2);}',
        '#scpanl-root .sc-src{display:inline-block;padding:2px 8px;border-radius:var(--sc-r-pill);',
        'border:1px solid var(--sc-border);background:var(--sc-bg2);color:var(--sc-faint);',
        'font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;}',
        /* v9 容量占用组件（.cap：三列 / 标签 / 大数值 / 明细 / 无门虚线槽）+ 卡内说明段（v7 一致性补丁第 5 条） */
        '#scpanl-root .sc-cap3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:var(--sc-gap-item);}',
        /* 记忆库容量区：与标准 KPI（.sc-kpi-*）**同一组排版值** —— 原型该区就是标准 .kpi（110 高、
         *   k-val 26px / min-height 34、条沉底共线），面板此前是自定的紧凑数值（22px 固定、88 高）⇒ 高度与
         *   字号都对不上。此处收敛为同一组声明（含 clamp 弹性，非定值），并用 margin-top:auto 让条槽共线。 */
        '#scpanl-root .sc-cap-item{display:flex;flex-direction:column;}',
        '#scpanl-root .sc-cap-top{font-size:11.5px;line-height:var(--sc-lh-normal);color:var(--sc-muted);}',
        '#scpanl-root .sc-cap-val{min-height:34px;display:flex;align-items:baseline;margin:5px 0 1px;line-height:1.15;',
        'font-size:clamp(22px,2.05vw,26px);font-weight:680;letter-spacing:-.3px;color:var(--sc-text);',
        'font-variant-numeric:tabular-nums;word-break:break-word;}',
        '#scpanl-root .sc-cap-sub{min-height:18px;font-size:11px;color:var(--sc-faint);}',
        '#scpanl-root .sc-cap-track{margin-top:auto;height:6px;border-radius:3px;background:var(--sc-border2);overflow:hidden;}',
        '#scpanl-root .sc-cap-track i{display:block;height:100%;width:var(--sc-pct,0);border-radius:3px;background:var(--sc-accent);}',
        '#scpanl-root .sc-cap-track i.ok{background:var(--sc-ok);}',
        '#scpanl-root .sc-cap-track i.warn{background:var(--sc-warn);}',
        '#scpanl-root .sc-cap-track i.err{background:var(--sc-err);}',
        '#scpanl-root .sc-cap-track.na{background:repeating-linear-gradient(90deg,var(--sc-border) 0 6px,transparent 6px 12px);}',
        '#scpanl-root .sc-cap-track.na i{display:none;}',
        '#scpanl-root .sc-cap-note{font-size:11.5px;color:var(--sc-faint);line-height:1.7;}',
        /* 卡下注脚（v9 `.bp-note`：小字灰） */
        '#scpanl-root .sc-note{font-size:11.5px;color:var(--sc-faint);line-height:1.7;}',
        /* ── 插件集合页（v9 `.grid2 > .pcard` + 矩阵表）── */
        '#scpanl-root .sc-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(232px,100%),1fr));gap:var(--sc-gap-item);}',
        '#scpanl-root .sc-pcard{display:flex;flex-direction:column;border:1px solid var(--sc-border);border-radius:var(--sc-r-md);',
        'padding:13px;background:var(--sc-bg-card);transition:border-color var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .sc-pcard:hover{border-color:var(--sc-accent-bd);}',
        '#scpanl-root .sc-pcard .ph{display:flex;align-items:center;gap:var(--sc-sp-2);margin-bottom:var(--sc-sp-2);}',
        '#scpanl-root .sc-pcard .ph .ic{width:26px;height:26px;border-radius:7px;background:var(--sc-accent-bg);',
        'color:var(--sc-accent);display:grid;place-items:center;flex:none;}',
        '#scpanl-root .sc-pcard .ph .ic svg{width:14px;height:14px;}',
        '#scpanl-root .sc-pcard .ph b{font-size:13px;font-weight:600;color:var(--sc-text);}',
        '#scpanl-root .sc-pcard .pd{font-size:12px;color:var(--sc-muted);line-height:1.6;}',
        '#scpanl-root .sc-pcard .pmeta{display:flex;align-items:center;gap:var(--sc-sp-2);margin-top:9px;',
        'font-size:11.5px;color:var(--sc-faint);font-variant-numeric:tabular-nums;}',
        /* 「添加目标库」虚线卡（v9 同款：非动作卡，提示需在白名单登记） */
        '#scpanl-root .sc-pcard.is-add{border-style:dashed;background:transparent;color:var(--sc-faint);}',
        '#scpanl-root .sc-pcard.is-add .ph .ic{background:var(--sc-bg3);color:var(--sc-faint);}',
        /* 矩阵表（v9 表格：th 11.5px faint / td 底分隔 --sc-border2 / 数字等宽） */
        '#scpanl-root .sc-table{width:100%;border-collapse:collapse;font-size:12.5px;}',
        '#scpanl-root .sc-table th{text-align:left;font-weight:600;font-size:11.5px;color:var(--sc-faint);',
        'padding:6px 9px;border-bottom:1px solid var(--sc-border2);}',
        '#scpanl-root .sc-table td{text-align:left;padding:8px 9px;border-bottom:1px solid var(--sc-border2);',
        'color:var(--sc-text);vertical-align:top;}',
        '#scpanl-root .sc-table tr:last-child td{border-bottom:0;}',
        '#scpanl-root .sc-table .num{font-variant-numeric:tabular-nums;color:var(--sc-muted);}',
        '#scpanl-root .sc-table .tgt{font-weight:600;}',
        /* v9 的 .pill（表格状态列）：11px / 2px 8px / 20px 圆角 / hover 底；.pill.ok 走 ok 语义底 */
        '#scpanl-root .sc-table .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;',
        'padding:2px 8px;border-radius:var(--sc-r-pill);background:var(--sc-hover);color:var(--sc-muted);white-space:nowrap;}',
        '#scpanl-root .sc-table .pill.ok{background:var(--sc-ok-bg);color:var(--sc-ok);}',
        '#scpanl-root .sc-table .pill.warn{background:var(--sc-warn-bg);color:var(--sc-warn);}',
        /* 段/面板：v9 的 `.tabs`/`.pane` —— 面板已有的 .sc-tabbox/.sc-tabpane 直接复用 */
        '#scpanl-root .sc-cols2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);',
        'gap:var(--sc-gap-item);align-items:start;}',
        /* 导航脚状态块（v9 .nav-foot：分隔线 + 状态点 + 名称 + 副行） */
        '#scpanl-root .sc-nav-foot{margin-top:auto;padding:10px 10px 6px;border-top:1px solid var(--sc-border);}',
        '#scpanl-root .sc-nav-health{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--sc-muted);}',
        '#scpanl-root .sc-nav-health b{color:var(--sc-text);font-size:12px;font-weight:600;}',
        '#scpanl-root .sc-nav-foot-sub{margin-top:3px;font-size:11px;color:var(--sc-faint);}',
        '#scpanl-root .sc-nav-foot .sc-dot{width:7px;height:7px;}',

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
        '#scpanl-root .sc-btn-ok{color:var(--sc-ok);}',
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
        /* 界面偏好两枚开关的作用面（设置页「导航分组显示 / 页脚健康条」）：只切显示，不动结构 */
        '#scpanl-modal.sc-nogroups .sc-nav-group{display:none;}',
        '#scpanl-modal.sc-nofoot .sc-nav-foot{display:none;}',
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
        /* 作用域/生效态徽标组（接缝① 阶段 2b · 2026-09-17）：**必须 fit-content**。
         *  判因（实测几何，比初判更精确）：本元素是 `display:flex` 的**块级 div**，
         *  在**块级父**（`.setting-item-info`，`extra` 挂载路径）里按块级宽度**撑满** = 966px，
         *  在 **flex 父**（`.setting-item`，`children` 挂载路径）里按内容宽 = 112px
         *  ⇒ 同一组件两态宽、徽标左边界漂在 286/898/1066 三处（用户实测「chip 位置漂移」）。
         *  `width:fit-content` 让**两种父容器下都是内容宽** ⇒ 一处定义根治两条路径。 */
        '#scpanl-root .sc-ctrl-meta{display:flex;flex-wrap:wrap;gap:var(--sc-sp-1);margin-top:var(--sc-sp-1);width:fit-content;}',
        /* 折叠（概览—详情分层） */
        '#scpanl-root .sc-fold{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);background:var(--sc-bg-card);',
        'margin:var(--sc-gap-row) 0;overflow:hidden;}',
        /* 卡头规格对齐 v9 的 .card > .hd（11px 14px / 12.5px / 620） */
        '#scpanl-root .sc-fold-head{display:flex;align-items:center;gap:var(--sc-sp-2);',
        'padding:11px 14px;cursor:pointer;font-size:12.5px;',
        'font-weight:620;color:var(--sc-text);user-select:none;',
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
        /* P0-1（2026-09-13）：条体改由 <wa-progress-bar> 承载 ⇒ 用组件暴露的 CSS 变量接管尺寸与配色。
         *   **必须显式接管**：组件自带 `--track-height:1rem`(=16px)，比方案 6px 高 10px、且自带
         *   `min-height`/`padding`/`margin` ⇒ 不接管就会把整页网格顶开（首版直接替换实测
         *   `ui-geo-regress` 93 → 70 PASS）。变量名取自组件源码 `progress-bar.styles.ts`。 */
        '#scpanl-root wa-progress-bar.sc-prog-bar{--track-height:6px;--track-color:var(--sc-bg3);',
        '--indicator-color:var(--sc-accent);display:block;}',
        '#scpanl-root .sc-prog-txt{font-size:var(--sc-fs-xs);color:var(--sc-muted);margin-top:var(--sc-sp-1);}',
        /* 键值（display:contents 让 k/v 真正落进栅格，此前被包裹层挡住不生效） */
        '#scpanl-root .sc-kv{display:grid;grid-template-columns:auto 1fr;gap:var(--sc-sp-1) var(--sc-gap-item);',
        'font-size:var(--sc-fs-sm);align-items:baseline;}',
        '#scpanl-root .sc-kv-row{display:contents;}',
        '#scpanl-root .sc-kv-k{color:var(--sc-muted);white-space:nowrap;}',
        '#scpanl-root .sc-kv-v{color:var(--sc-text);word-break:break-all;}',
        /* 日志 */
        /* v9 对齐：折叠态只留标题行（一行 ~33px），展开态才给滚动高度 */
        '#scpanl-root .sc-logwrap.sc-log-collapsed{max-height:none;}',
        '#scpanl-root .sc-logwrap.sc-log-collapsed .sc-log-row{display:none;}',
        '#scpanl-root .sc-log-toggle{cursor:pointer;user-select:none;}',
        /* v9 对齐：折叠态是**单行细条**（v9 .logbar-hd 只有箭头 + 计数）——
         * 级别下拉与清空按钮在方案里属日志**正文工具**（.logtools），折叠时不该占高。 */
        '#scpanl-root .sc-log-collapsed .sc-log-head select,',
        '#scpanl-root .sc-log-collapsed .sc-log-head wa-button{display:none;}',
        '#scpanl-root .sc-logwrap{border-top:1px solid var(--sc-border);background:var(--sc-bg2);',
        'max-height:min(34vh,320px);overflow:auto;}',
        '#scpanl-root .sc-log-head{display:flex;align-items:center;gap:var(--sc-sp-2);padding:6px var(--sc-gap-item);',
        'font-size:10.5px;text-transform:uppercase;letter-spacing:var(--sc-ls-wide);color:var(--sc-faint);',
        'position:sticky;top:0;background:var(--sc-bg2);border-bottom:1px solid var(--sc-border);z-index:1;}',
        /* v9 对齐（§6-4）：日志行改**原型形态**——`✓ GET /memory/overview 42ms 200`
         *   （级别图标 + 方法 + 端点 + 耗时 + 状态码），时间戳右对齐 faint 保留（原型无，但排障必需）。
         *   定宽列改 flex：方法/端点长度不一，定宽反会把端点折断。 */
        '#scpanl-root .sc-log-row{display:flex;gap:8px;align-items:baseline;',
        'padding:3px var(--sc-gap-item);font-size:var(--sc-fs-xs);font-family:ui-monospace,Menlo,Consolas,monospace;}',
        '#scpanl-root .sc-log-t{color:var(--sc-faint);font-variant-numeric:tabular-nums;flex:none;}',
        '#scpanl-root .sc-log-lv{font-size:11px;flex:none;}',
        '#scpanl-root .sc-log-info .sc-log-lv{color:var(--sc-muted);}',
        '#scpanl-root .sc-log-warn .sc-log-lv{color:var(--sc-warn);}',
        '#scpanl-root .sc-log-error .sc-log-lv{color:var(--sc-err);}',
        '#scpanl-root .sc-log-m{color:var(--sc-faint);flex:none;}',
        '#scpanl-root .sc-log-p{color:var(--sc-text);word-break:break-all;flex:1;min-width:0;}',
        '#scpanl-root .sc-log-ms,#scpanl-root .sc-log-st{color:var(--sc-muted);font-variant-numeric:tabular-nums;flex:none;}',
        '#scpanl-root .sc-log-msg{color:var(--sc-text);word-break:break-word;flex:1;min-width:0;}',
        /* 边界态：加载（空态走 .sc-mem-empty，见业务层 —— 曾并存两套空态组件，.sc-empty 零使用已删） */
        '#scpanl-root .sc-loading{position:relative;pointer-events:none;}',
        '#scpanl-root .sc-loading::after{content:"";position:absolute;inset:0;border-radius:inherit;',
        'background:linear-gradient(90deg,transparent,var(--sc-hover),transparent);background-size:200% 100%;',
        'animation:sc-shimmer 1.2s linear infinite;}',
        '@keyframes sc-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',

        '/* ---------- 分段 Tab（P2） ---------- */',
        '#scpanl-root .sc-tabbox{display:flex;flex-direction:column;gap:var(--sc-gap-item);}',
        '#scpanl-root .sc-tabpane{margin-top:var(--sc-sp-1);min-height:0}',
        /* 组件库按钮（S3）：宿主元素不自带盒模型（尺寸/配交组件自身与 --wa-* 令牌），字号接方案标尺。
         * .sc-btn 规则保留：宿主设置中心里的 React 按钮仍在用（跨运行时共用同一套类名）。 */
        /* 注意（实测踩坑）：**不要在宿主上覆盖 font-size** —— 组件尺寸是 em 派生，
         *   覆盖成 11px 会让 size="m" 也只有 19px 高。字号交给组件自身的 size 标尺。 */
        /* 令牌桥（S3）：组件库的**尺寸/圆角标尺**接到方案标尺上（颜色由 wa-dark + --dsw/--sc 令牌决定）。
         *   不做这层桥，组件会按自带 16px 字号/大内距渲染（实测按钮 43px 高、日志折叠条被撑到 57px）。 */
        /* 令牌桥（S3）：一条规则装齐 —— 颜色走方案令牌、字号/间距/圆角接方案标尺。
         *   踩坑：此前拆成两条且第一条**未闭合** ⇒ CSS 解析器把后续 87 条规则吞进该块（含网格规则），
         *   表现为「KPI 4 行 / 操作卡 3 行 / 徽章 7 行」的布局塌陷 + 审计报 87 个缺样式。 */
        '#scpanl-root{',
        '--wa-color-brand-fill-loud:var(--sc-accent);--wa-color-brand-fill-normal:var(--sc-accent);',
        '--wa-color-brand-on:#ffffff;--wa-color-danger-fill-loud:var(--sc-err);--wa-color-danger-on:#ffffff;',
        '--wa-color-neutral-on:#ffffff;',
        '--wa-color-surface-default:var(--sc-bg-card);--wa-color-text-normal:var(--sc-text);',
        /* 尺寸层接管（关键，2026-09-13）：WA 的字号/间距/圆角**全部由三个 scale 令牌派生** ——
         *   --wa-font-size-m = 1rem × fontSize-scale；--wa-space-m = 1rem × space-scale；
         *   --wa-border-radius-m = 0.375rem × radius-scale。
         *   直接覆盖派生值无效（上轮实测被其 calc 覆盖）。故只改这三个源头：
         *   字号 scale .78 ⇒ m≈12.5px / s≈11px（对齐方案 --sc-fs-sm/xs）；间距 scale .375 ⇒ m≈6px（紧凑）；圆角保持 1 ⇒ 6px。 */
        '--wa-font-size-scale:.78;--wa-space-scale:.375;--wa-border-radius-scale:1;}',




        /* 组件库 Tab（S3）：把方案令牌接到 wa-tab-group 的 CSS 变量上，使其跟随皮肤/主题 */
        '#scpanl-root wa-button{vertical-align:middle;}',
        '#scpanl-root wa-switch,#scpanl-root wa-select{vertical-align:middle;}',
        /* 注：曾用 '#scpanl-root wa-select::part(combobox){…}' 对齐填充，**实测未生效**（复核测得的填充仍等于卡底）。
         *   要不要用 ::part、部件名是什么，必须**先核对组件导出的 parts 再落**（本次是照经验猜名，属教训）。 */
        /* 组件开关定形（S3 视觉复核判定后）：圆点回白、宽度提到方案档 —— 均走其公开扩展点
         *   （switch.d.ts 的 @cssproperty --width 与 @csspart thumb），非 hack。 */
        '#scpanl-root wa-switch{--width:2.4rem;}',
        '#scpanl-root wa-switch::part(thumb){background:#ffffff;}',
        /* 按钮文字色（S3 实测）：组件库的 on 色令牌在本面板上下文未解析成白，实测标签为蓝 rgb(110,179,255)
         *   （压紫底 ≈1.2:1，视觉复核判为不可读）。改用它公开的扩展点 ::part(button) 显式定色 ——
         *   这是组件库文档化的定制方式，非 hack；并由几何回归的「标签亮度 ≥0.7」断言长期守住。 */
        '#scpanl-root wa-button[variant="brand"]::part(button),#scpanl-root wa-button[variant="danger"]::part(button){color:#ffffff;}',
        '#scpanl-root wa-button[variant="neutral"]::part(button){color:var(--sc-text);}',
        /* 分段控件对齐 v9 `.tabs`（第二轮）：**仍走组件库** wa-tab-group（保留 S3 决策与门禁断言），
         * 用**实测存在**的部件名改造成胶囊分段：外框 --sc-bg1 + 1px 边 + 8px 圆角 + 2px 内距；
         * 每个 tab = 28px 胶囊（内距 0/14 · 12.5px · 圆角 6）；激活项 bg --sc-bg-card + shadow-1；
         * 组件自带的**下划线指示器关掉**（v9 无下划线）：--indicator-color:transparent。
         * 部件名来源：shadow DOM 实测 wa-tab-group::part(base/nav/tabs/body) · wa-tab::part(base)。 */
        '#scpanl-root wa-tab-group{--indicator-color:transparent;--track-color:transparent;}',
        '#scpanl-root wa-tab-group::part(nav){background:var(--sc-bg1);border:1px solid var(--sc-border);',
        'border-radius:var(--sc-r-md);padding:2px;display:inline-flex;width:auto;align-self:flex-start;height:auto;}',
        '#scpanl-root wa-tab-group::part(tabs){display:inline-flex;gap:2px;}',
        '#scpanl-root wa-tab::part(base){height:28px;padding:0 14px;border-radius:var(--sc-r-sm);',
        'font-size:12.5px;font-weight:400;color:var(--sc-muted);background:transparent;}',
        '#scpanl-root wa-tab[active]::part(base){background:var(--sc-bg-card);color:var(--sc-text);',
        'font-weight:600;box-shadow:var(--sc-shadow-1);}',
        '#scpanl-root wa-tab{font-size:12.5px;color:var(--sc-muted);}',
        /* ═══ 皮肤层（2026-09-13 用户拍板：**v9 皮肤为准 + 宿主皮肤可选**）═══
         * 结构：① 上面是宿主变量兜底（无皮肤标记时的向后兼容）② 下面是两套显式皮肤，同一层语义令牌、只换值：
         *   · .sc-skin-v9（默认）：方案调色板，分 .sc-dark/.sc-light 两态（对应 v9 的 dark/light token 块）
         *   · .sc-skin-host：单一真源 = 宿主 --dsw-alias-*（面板与 DSH 同色，跟随宿主换肤）
         * 切换：Cfg('skin')（面板「设置」页 + 宿主设置中心「守藏」分区均有入口）；syncTheme() 负责打标记。 */
        '#scpanl-root.sc-skin-v9.sc-dark{',
        /* P0-1/v9 严格对齐（2026-09-13）：新增**页面级**令牌 --sc-bg-page。
         * 原型 v9 的层级是 bg(#131315) < panel2(#171719) < panel(#1b1b1e) < panel3(#2a2a2f) ——
         * 面板此前把 --panel 的值(#1b1b1e)当成了**页面底**，比原型亮一档（vfiff 实测 --bg DIFF）。
         * 不直接改 --sc-bg1 的值：它还服务按钮/输入/胶囊等部件（改了会连锁引入新差异），
         * 故拆出"页面底"这一层语义，只让 .sc-main / .sc-headslot 用它。 */
        '--sc-bg-page:#131315;',
        '--sc-bg1:#1b1b1e;--sc-bg2:#171719;--sc-bg3:#232327;--sc-bg-card:#2a2a2f;',
        '--sc-border:#2c2c31;--sc-border-strong:#3a3a40;--sc-border2:#33333a;',
        '--sc-text:#e8e8ea;--sc-muted:#9a9aa2;--sc-faint:#6e6e76;',
        '--sc-accent:#a78bfa;--sc-accent-hover:#b9a3fb;--sc-accent-soft:#251f3a;--sc-ok:#3fb950;--sc-warn:#d29922;--sc-err:#f85149;--sc-info:#58a6ff;',
        '--sc-hover:#242428;--sc-active:#2c2c31;',
        '--sc-r-sm:6px;--sc-r-md:10px;--sc-r-lg:14px;',
        '--sc-shadow-1:0 1px 2px rgba(0,0,0,.4);--sc-shadow-2:0 4px 14px rgba(0,0,0,.45);--sc-shadow-3:0 12px 40px rgba(0,0,0,.6);',
        '}',
        '#scpanl-root.sc-skin-v9.sc-light{',
        /* 浅色态：原型 --bg 与 --panel 同为 #f4f5f7 ⇒ 页面底不再分层（与 v9 一致） */
        '--sc-bg-page:#f4f5f7;',
        '--sc-bg1:#f4f5f7;--sc-bg2:#fafbfc;--sc-bg3:#eef0f3;--sc-bg-card:#ffffff;',
        '--sc-border:#e3e6ea;--sc-border-strong:#d5d9de;--sc-border2:#eef0f3;',
        '--sc-text:#1f2328;--sc-muted:#656d76;--sc-faint:#8c959f;',
        '--sc-accent:#7c5cff;--sc-accent-soft:#f0ecff;--sc-ok:#1a7f37;--sc-warn:#9a6700;--sc-err:#cf222e;--sc-info:#0969da;',
        '--sc-hover:#f2f3f5;--sc-r-sm:6px;--sc-r-md:10px;--sc-r-lg:14px;',
        '}',
        /* 宿主原生皮肤：全部颜色令牌单一取自宿主 --dsw-alias-*（卡面用 color-mix 提亮一档，保持"凸卡"结构） */
        '#scpanl-root.sc-skin-host{',
        '--sc-bg-page:var(--dsw-alias-bg-layer-1,#1b1b1e);',
        '--sc-bg1:var(--dsw-alias-bg-layer-1,#1b1b1e);--sc-bg2:var(--dsw-alias-bg-layer-2,#171719);',
        '--sc-bg3:var(--dsw-alias-bg-layer-3,#232327);',
        '--sc-bg-card:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#1b1b1e) 88%,#ffffff 12%);',
        '--sc-border:var(--dsw-alias-border-l2,#2c2c31);--sc-border-strong:var(--dsw-alias-border-l1,#3a3a40);',
        '--sc-border2:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2,#33333a));',
        '--sc-text:var(--dsw-alias-label-primary,#e8e8ea);--sc-muted:var(--dsw-alias-label-secondary,#9a9aa2);',
        '--sc-faint:var(--dsw-alias-label-tertiary,#6e6e76);',
        '--sc-accent:var(--dsw-alias-brand-primary,#7c5cff);--sc-accent-hover:var(--dsw-alias-brand-primary,#7c5cff);',
        '--sc-ok:var(--dsw-alias-state-success-primary,#3fb950);--sc-warn:var(--dsw-alias-state-warn-primary,#d29922);',
        '--sc-err:var(--dsw-alias-state-error-primary,#f85149);',
        '--sc-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));',
        '}',
        /* 组件规格对齐 v9：凸卡体系 / 字号标尺 / 圆角 / 按钮 / 分段 / 导航选中（去掉左侧竖条） */
        
        
        
        
        
        
        
        
        
        
        
        
        
        /* ══════════ ⑤ 业务层 ══════════ */
        /* 记忆卡：自适应栅格 + hero 跨列 */
        '#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{display:grid;',
        'grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:var(--sc-gap-item);',
        'margin:var(--sc-sp-2) 0 var(--sc-gap-group);}',
        '#scpanl-root .sc-mem-stat{padding:var(--sc-pad-card);border:1px solid var(--sc-border);background:var(--sc-bg-card);',
        'border-radius:var(--sc-r-md);',
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
        /* v9 严格对齐（第五轮 · 画像页）：USER/AGENT 构成用 sc-mem-stat 形态后，
         * stat-box 底部需要一条"红线 / 容量门 / 路径"提示行（v9 原型 `.rule`）。
         * 与 .sc-mem-stat-sub 同字号但有左色条 + 顶距，便于视觉分组。 */
        '#scpanl-root .sc-mem-stat-rule{margin-top:var(--sc-sp-2);padding-top:var(--sc-sp-2);',
        'border-top:1px dashed var(--sc-border);font-size:11px;line-height:1.55;color:var(--sc-faint);}',
        /* v9 严格对齐（第五轮 · 画像页）：成熟度分布柱状图（5 根柱，0–.2 / .2–.4 / … / .8–1） */
        '#scpanl-root .sc-hist-wrap{padding:var(--sc-sp-2) 0;}',
        '#scpanl-root .sc-hist{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));',
        'gap:var(--sc-gap-item);align-items:end;height:88px;}',
        '#scpanl-root .sc-hist i{position:relative;display:block;height:0;min-height:1px;',
        'background:var(--sc-accent);border-radius:3px 3px 0 0;transition:height var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .sc-hist i b{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);',
        'font-size:11px;font-weight:400;color:var(--sc-muted);white-space:nowrap;}',
        /* v9 严格对齐（第五轮 · 深睡页）：状态机（三节点指示器 + 睡眠水位条）
         * 形态对齐 v9 原型 .sm / .sm-node / .sm-circle / .sm-seg（96px 节点 / 34px 圆 / 2px 连线）。 */
        '#scpanl-root .sc-sm{display:flex;align-items:flex-start;gap:0;margin:var(--sc-sp-1) 0 var(--sc-sp-3);}',
        '#scpanl-root .sc-sm-node{display:flex;flex-direction:column;align-items:center;gap:var(--sc-sp-1);',
        'flex:none;width:96px;}',
        '#scpanl-root .sc-sm-circle{width:34px;height:34px;border-radius:50%;border:2px solid var(--sc-border);',
        'display:grid;place-items:center;background:var(--sc-bg2);color:var(--sc-faint);',
        'transition:border-color var(--sc-t-base) var(--sc-ease),background var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .sc-sm-node.on .sc-sm-circle{border-color:var(--sc-accent);background:var(--sc-accent-soft);',
        'color:var(--sc-accent);}',
        '#scpanl-root .sc-sm-node.done .sc-sm-circle{border-color:var(--sc-ok);background:var(--sc-ok-bg);',
        'color:var(--sc-ok);}',
        '#scpanl-root .sc-sm-label{font-size:11.5px;line-height:1.4;color:var(--sc-muted);text-align:center;}',
        '#scpanl-root .sc-sm-node.on .sc-sm-label{font-weight:var(--sc-fw-semibold);}',
        '#scpanl-root .sc-sm-seg{flex:1;height:2px;background:var(--sc-border);margin-top:16px;}',
        '#scpanl-root .sc-sm-seg.done{background:var(--sc-ok);}',
        /* v9 总览对齐（2026-09-13）：原型 .pill / .tl / .mini 三组原子类的面板实现 ——
         * 原型总览页用它们承载「晨起摘要 / 最近动态 / 判据与重排门」三张卡，面板此前无对应类。 */
        '#scpanl-root .sc-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:2px 8px;',
        'border-radius:20px;background:var(--sc-hover);color:var(--sc-muted);font-weight:var(--sc-fw-medium);white-space:nowrap;}',
        '#scpanl-root .sc-pill.ok{background:var(--sc-ok-bg);color:var(--sc-ok);}',
        '#scpanl-root .sc-pill.warn{background:var(--sc-warn-bg);color:var(--sc-warn);}',
        '#scpanl-root .sc-pill.info{background:var(--sc-info-bg);color:var(--sc-info);}',
        '#scpanl-root .sc-pill.brand{background:var(--sc-accent-bg);color:var(--sc-accent);}',
        '#scpanl-root .sc-pill.mono{font-family:ui-monospace,Consolas,monospace;}',
        /* 时间线（原型 .tl）：1px 竖线 + 9px 圆点（2px 语义色描边，ok/warn 变色） */
        '#scpanl-root .sc-tl{position:relative;padding-left:20px;}',
        '#scpanl-root .sc-tl:before{content:"";position:absolute;left:5px;top:6px;bottom:6px;width:1px;background:var(--sc-border);}',
        '#scpanl-root .sc-tl-item{position:relative;padding:0 0 15px;}',
        '#scpanl-root .sc-tl-item:last-child{padding-bottom:0;}',
        '#scpanl-root .sc-tl-item:before{content:"";position:absolute;left:-18px;top:5px;width:9px;height:9px;',
        'border-radius:50%;background:var(--sc-bg-card);border:2px solid var(--sc-accent);}',
        '#scpanl-root .sc-tl-item.ok:before{border-color:var(--sc-ok);}',
        '#scpanl-root .sc-tl-item.warn:before{border-color:var(--sc-warn);}',
        '#scpanl-root .sc-tl-t{font-size:12.5px;font-weight:var(--sc-fw-medium);}',
        '#scpanl-root .sc-tl-d{font-size:11.5px;color:var(--sc-faint);margin-top:2px;}',
        '#scpanl-root .sc-tl-time{font-size:11px;color:var(--sc-faint);font-variant-numeric:tabular-nums;}',
        /* 键值双列（原型 .mini 的 auto/1fr 两列版，去掉原型的空占位列） */
        '#scpanl-root .sc-mini{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px;}',
        '#scpanl-root .sc-mini .k{color:var(--sc-muted);}',
        '#scpanl-root .sc-mini .v{color:var(--sc-text);font-variant-numeric:tabular-nums;}',
        /* 告警条：原型 .alert > b（加粗前缀）+ a（跳转链接） */
        '#scpanl-root .sc-ds-alert b{font-weight:var(--sc-fw-semibold);}',
        '#scpanl-root .sc-ds-alert a{color:var(--sc-accent);cursor:pointer;margin-left:4px;}',
        /* 卡内行（原型 .card > .bd .row）：**不能复用 .sc-row** —— 后者是表单行语义
         * （flex:none、无内距无下边框），混用会把表单布局带坏。故单列 .sc-crow。 */
        '#scpanl-root .sc-crow{display:flex;align-items:center;gap:11px;padding:10px 14px;',
        'border-bottom:1px solid var(--sc-border2);transition:background var(--sc-t-base) var(--sc-ease);}',
        '#scpanl-root .sc-crow:last-child{border-bottom:0;}',
        '#scpanl-root .sc-crow:hover{background:var(--sc-bg2);}',
        '#scpanl-root .sc-crow .sc-ct{font-size:13px;font-weight:var(--sc-fw-medium);}',
        '#scpanl-root .sc-crow .sc-cd{font-size:11.5px;color:var(--sc-faint);margin-top:1px;}',
        '#scpanl-root .sc-crow .sc-right{margin-left:auto;display:flex;align-items:center;gap:9px;',
        'font-size:11.5px;color:var(--sc-muted);}',
        '#scpanl-root .sc-crow .sc-right b{color:var(--sc-text);font-variant-numeric:tabular-nums;}',
        /* 索引行右列（v9 记忆库页：tag 胶囊 + 「N 条」）—— 复用 .sc-right 的右靠语义 */
        '#scpanl-root .sc-idx-row .sc-right{margin-left:auto;display:flex;align-items:center;gap:9px;',
        'font-size:11.5px;color:var(--sc-muted);}',
        /* v9 原型 .proto-note 形态：虚线边框 + 透明背景 + 灰字（页头右侧占位说明）
         * 与运行时实操作 chip 区分（实操作 chip 是 .sc-btn 实色）。 */
        '#scpanl-root .sc-proto-note{border:1px dashed var(--sc-border);background:transparent;',
        'color:var(--sc-faint);font-size:11.5px;border-radius:8px;padding:3px 8px;}',
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
        /* UI1/U2（2026-09-15）：此处原有 4 条 `.sc-spark` 规则（迷你趋势图）—— 已随
         *   **死代码 `sparkline()` 一并删除**。此前未被发现，是因为 `audit-css-usage` 用
         *   子串包含判"是否被使用"，而产物里恰有 `sparkline` 这个**函数名** ⇒ 误判为在用。
         *   函数迁到 pane 模块后无人 import ⇒ tree-shaking 掉函数名 ⇒ 真死规则暴露。
         *   ⇒ 删函数 + 删规则（**不是加 ALLOW_NO_STYLE 白名单掩盖**）。 */
        /* 注：`.sc-danger` 规则已随 v9 严格对齐删除（其唯一使用者是记忆库页「蒸馏运行」段内的失败文字，
         *   该段属「运行态」Tab —— 原型记忆库页无此 Tab ⇒ 一并移除；CSS 审计门禁正是靠"死规则"抓到的）。 */
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
        /* 索引组头（接缝① · 2026-09-17 阶段 2）：标签与「N 条」在此**只出现一次** ——
         *  修「每行重复 N 条」与「标签两页前后不一」两处用户实测症状。 */
        '#scpanl-root .sc-idx-group{display:flex;align-items:center;gap:var(--sc-sp-2);margin:var(--sc-sp-3) 0 var(--sc-sp-1);}',
        '#scpanl-root .sc-idx-group:first-child{margin-top:0;}',
        '#scpanl-root .sc-idx-group-n{color:var(--sc-faint);font-size:var(--sc-fs-xs);font-variant-numeric:tabular-nums;}',
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
        '#scpanl-root .sc-ds-badges{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:var(--sc-gap-row);margin:0 0 var(--sc-sp-3);}',
        /* v9 严格对齐：睡眠状态分布 —— 分段条 + 图例（原型深睡页第 2 张卡）。
         *   五态语义色与总览徽章同源（running 绿 / ended 蓝 / probing 黄 / suspect 紫 / stalled 红）。 */
        '#scpanl-root .sc-dseg{display:flex;height:8px;border-radius:var(--sc-r-pill);overflow:hidden;background:var(--sc-bg3);margin-bottom:var(--sc-sp-3);}',
        '#scpanl-root .sc-dseg i{display:block;height:100%;min-width:2px;}',
        '#scpanl-root .sc-dseg i.running,#scpanl-root .sc-segdot.running{background:var(--sc-ok);}',
        '#scpanl-root .sc-dseg i.ended,#scpanl-root .sc-segdot.ended{background:var(--sc-info);}',
        '#scpanl-root .sc-dseg i.probing,#scpanl-root .sc-segdot.probing{background:var(--sc-warn);}',
        '#scpanl-root .sc-dseg i.suspect,#scpanl-root .sc-segdot.suspect{background:var(--sc-accent);}',
        '#scpanl-root .sc-dseg i.stalled,#scpanl-root .sc-segdot.stalled{background:var(--sc-err);}',
        '#scpanl-root .sc-dlegend{display:flex;flex-wrap:wrap;gap:var(--sc-sp-3) var(--sc-gap-item);font-size:var(--sc-fs-xs);color:var(--sc-muted);}',
        '#scpanl-root .sc-dlegend-i{display:inline-flex;align-items:center;gap:6px;}',
        '#scpanl-root .sc-segdot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none;}',
        /* 状态徽标规格对齐 v9 的 .badge（4px 10px / 12px / 999px / panel2 底 + border2 边） */
        '#scpanl-root .sc-ds-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;',
        'border-radius:var(--sc-r-pill);font-size:12px;font-weight:var(--sc-fw-medium);',
        'line-height:var(--sc-lh-normal);background:var(--sc-bg2);border:1px solid var(--sc-border2);',
        'color:var(--sc-text);}',
        '#scpanl-root .sc-ds-badge .dot{width:8px;height:8px;border-radius:50%;flex:none;}',
        '#scpanl-root .sc-ds-badge.running{color:var(--sc-ok);background:var(--sc-ok-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.running .dot{background:var(--sc-ok);}',
        '#scpanl-root .sc-ds-badge.ended{color:var(--sc-ok);background:var(--sc-ok-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.ended .dot{background:var(--sc-faint);}',
        '#scpanl-root .sc-ds-badge.probing{color:var(--sc-info);background:var(--sc-info-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.probing .dot{background:var(--sc-info);animation:scblink 1s infinite;}',
        '#scpanl-root .sc-ds-badge.suspect{color:var(--sc-info);background:var(--sc-info-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.suspect .dot{background:var(--sc-info);}',
        '#scpanl-root .sc-ds-badge.stalled{color:var(--sc-err);background:var(--sc-err-bg);border-color:transparent;}',
        '#scpanl-root .sc-ds-badge.stalled .dot{background:var(--sc-err);}',
        /* v9 深睡页重排（2026-09-13）后零使用的规则已删：.sc-ds-timing / .sc-ds-stat（计时条）、
         *   .sc-ds-sessions / .sc-ds-session* / .sc-ds-dot* / .sc-ds-sid（会话明细列表）、@keyframes scblink
         *   —— 三者分别被状态机卡的水位条、分布卡图例、「最近会话」卡（.row + pill）取代。
         *   死规则由 check-runner 的 CSS 审计门禁守（本轮正是它抓出来的）。 */
        '#scpanl-root .sc-ds-alert{margin:var(--sc-gap-row) 0;padding:9px var(--sc-gap-item);',
        'border-radius:var(--sc-r-md);background:var(--sc-err-bg);',
        'border:1px solid color-mix(in srgb,var(--sc-err) 45%,transparent);color:var(--sc-err);',
        'font-size:var(--sc-fs-sm);}',
        /* v9 对齐：**待处理**类提示是 amber（方案 .alert.warn：琥珀底 + 琥珀字 + 22% 边），
         * 红色只留真错误（如深睡水位回滚、会话卡住）。此前一律红 ⇒ 语义被放大。 */
        '#scpanl-root .sc-ds-alert.warn{background:var(--sc-warn-bg);',
        'border-color:color-mix(in srgb,var(--sc-warn) 22%,transparent);color:var(--sc-warn);}',
        /* v9 记忆库页新增两种语义：候选区 `.alert.info`（说明性）/ 归档区 `.alert.ok`（安全声明）。 */
        '#scpanl-root .sc-ds-alert.info{background:var(--sc-info-bg);',
        'border-color:color-mix(in srgb,var(--sc-info) 22%,transparent);color:var(--sc-info);}',
        '#scpanl-root .sc-ds-alert.ok{background:var(--sc-ok-bg);',
        'border-color:color-mix(in srgb,var(--sc-ok) 22%,transparent);color:var(--sc-ok);}',
        '#scpanl-root .sc-ds-alert code{font-family:ui-monospace,Consolas,monospace;',
        'background:color-mix(in srgb,currentColor 12%,transparent);border-radius:4px;padding:0 4px;}',
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
        /* 状态色点四态（v9 的 .dot.ok/.warn/.err/.info）：KPI 顶行与导航脚状态块共用 */
        '#scpanl-root .sc-dot.ok{background:var(--sc-ok);}',
        '#scpanl-root .sc-dot.warn{background:var(--sc-warn);}',
        '#scpanl-root .sc-dot.err{background:var(--sc-err);}',
        '#scpanl-root .sc-dot.info{background:var(--sc-info);}',
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
        '#scpanl-root .sc-box{border:1px solid var(--sc-border);border-radius:var(--sc-r-md);',
        'padding:var(--sc-sp-1) var(--sc-sp-2);margin-bottom:var(--sc-sp-1);background:var(--sc-bg1);}',
        '#scpanl-root .sc-card-body{margin:0;padding:var(--sc-pad-card);font-family:ui-monospace,Menlo,Consolas,monospace;',
        'font-size:var(--sc-fs-xs);line-height:var(--sc-lh-loose);color:var(--sc-text);white-space:pre-wrap;',
        'word-break:break-word;max-height:min(60vh,420px);overflow-y:auto;background:var(--sc-bg1);',
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
        '#scpanl-root #sc-yaml,#scpanl-root .sc-yaml{width:100%;height:clamp(160px,30vh,320px);padding:var(--sc-sp-2) var(--sc-gap-item);',
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

        '/* ---------- 运行总览组件（P1-1） ---------- */',
        '#scpanl-root .sc-opgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:var(--sc-gap-item);margin-bottom:var(--sc-sp-4);}',
        /* v9 严格对齐：操作卡标题行 = 图标 + 标题（原型三张卡各带一个线框图标） */
        '#scpanl-root .sc-opcard-head{display:flex;align-items:center;gap:var(--sc-sp-2);}',
        '#scpanl-root .sc-opcard-ic{display:inline-flex;align-items:center;color:var(--sc-accent);}',
        '#scpanl-root .sc-opcard{display:flex;flex-direction:column;border:1px solid var(--sc-border);border-radius:var(--sc-r-md);padding:var(--sc-pad-card);background:var(--sc-bg-card);}',
        '#scpanl-root .sc-opcard-t{font-size:var(--sc-fs-md);font-weight:var(--sc-fw-semibold);color:var(--sc-text);}',
        '#scpanl-root .sc-opcard-d{margin-top:var(--sc-sp-2);font-size:var(--sc-fs-xs);line-height:var(--sc-lh-normal);color:var(--sc-muted);}',
        '#scpanl-root .sc-opcard-f{margin-top:auto;padding-top:var(--sc-sp-3);display:flex;align-items:center;gap:var(--sc-sp-2);}',
        '#scpanl-root .sc-opcard-f .sc-btn{min-width:84px;}',
        /* v9 严格对齐：原型 .kpis 是 **固定 4 列**（此前用 auto-fit+minmax，实测在 946px 下算出 5 列，
         *   多出一个 0 宽的轨道）；画像页则是 **2×2** ⇒ 专用 .sc-kpis-2（见下）。 */
        '#scpanl-root .sc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sc-gap-item);margin-bottom:var(--sc-sp-4);}',
        '#scpanl-root .sc-kpis-2{grid-template-columns:repeat(2,minmax(0,1fr));}',
        '#scpanl-root .sc-kpi{display:flex;flex-direction:column;border:1px solid var(--sc-border);border-radius:var(--sc-r-md);padding:13px 14px;background:var(--sc-bg-card);}',
        '#scpanl-root .sc-kpi-top{display:flex;align-items:center;gap:7px;font-size:11.5px;line-height:var(--sc-lh-normal);color:var(--sc-muted);}',
        /* v9 对齐：KPI 顶行的**状态色点**（7px，随 KPI 状态变色）—— 此前面板无点，状态只能靠进度条读 */
        '#scpanl-root .sc-kpi-top .sc-dot{width:7px;height:7px;flex:none;}',
        '#scpanl-root .sc-kpi-val{min-height:34px;display:flex;align-items:baseline;margin:5px 0 1px;line-height:1.15;font-size:clamp(22px,2.05vw,26px);font-weight:680;letter-spacing:-.3px;color:var(--sc-text);}',
        '#scpanl-root .sc-kpi-val.txt{font-size:17px;font-weight:var(--sc-fw-semibold);letter-spacing:0;}',
        '#scpanl-root .sc-kpi-sub{min-height:18px;font-size:11px;color:var(--sc-faint);}',
        '#scpanl-root .sc-kpi-bar{margin-top:auto;height:6px;border-radius:3px;background:var(--sc-border2);overflow:hidden;}',
        '#scpanl-root .sc-kpi-bar i{display:block;height:100%;width:var(--sc-pct,0);border-radius:3px;background:var(--sc-accent);}',
        '#scpanl-root .sc-kpi-bar i.ok{background:var(--sc-ok);}',
        '#scpanl-root .sc-kpi-bar i.info{background:var(--sc-info);}',
        '#scpanl-root .sc-kpi-bar i.suspect{background:var(--sc-warn);}',
        '#scpanl-root .sc-kpi-bar i.stalled{background:var(--sc-err);}',
        '#scpanl-root .sc-kpi-bar.na{background:repeating-linear-gradient(90deg,var(--sc-border) 0 6px,transparent 6px 12px);}',
        '#scpanl-root .sc-kpi-bar.na i{display:none;}',
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
        '#scpanl-root .sc-view{padding:clamp(16px,2.2vw,32px) clamp(20px,3vw,48px) clamp(24px,3vw,48px);max-width:min(1120px,100%);min-height:0}',
        '}',
        /* 中屏 ≤1180：导航收窄、描述让位 */
        '@media (max-width:1180px){',
        '#scpanl-modal{--sc-nav-w:184px;}',
        '#scpanl-root .sc-view{padding:var(--sc-sp-5) var(--sc-sp-5) var(--sc-sp-6);min-height:0}',
        '#scpanl-root .setting-item-desc{max-width:52ch;}',
        '}',
        /* 平板 ≤900：表单行转纵向，控件占满整行 */
        '@media (max-width:900px){',
        /* v9 严格对齐：原型在此档把 .kpis 收敛为 2 列 */
        '#scpanl-root .sc-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}',
        '#scpanl-modal{--sc-nav-w:160px !important;}',
        '#scpanl-root .sc-nav{padding:var(--sc-sp-2) var(--sc-sp-1);}',
        '#scpanl-root .sc-nav-item{padding:8px var(--sc-sp-2);gap:var(--sc-sp-1);}',
        '#scpanl-root .sc-nav-item svg{width:15px;height:15px;}',
        '#scpanl-root .sc-view{padding:var(--sc-sp-4) var(--sc-sp-4) var(--sc-sp-6);min-height:0}',
        '#scpanl-root .setting-item:not(.sc-rootitem){flex-direction:column;align-items:stretch;gap:var(--sc-sp-2);}',
        '#scpanl-root .setting-item-control{width:100%;justify-content:flex-start;flex-wrap:wrap;}',
        '#scpanl-root .sc-mem-stat.hero{grid-column:span 2;}',
        '}',
        /* 移动 ≤720：导航转顶部横向 tab，模态全屏，出现关闭按钮（此前移动端无法关闭面板） */
        '@media (max-width:720px){',
        '#scpanl-mask{padding:0;}',
        '#scpanl-modal{--sc-nav-w:100% !important;width:min(1480px,96vw);height:min(900px,92vh);max-width:100vw;max-height:100vh;',
        'border-radius:0;border:none;flex-direction:column;}',
        '#scpanl-root .sc-nav{width:100% !important;flex:none;flex-direction:row;overflow-x:auto;overflow-y:hidden;',
        'border-right:none;border-bottom:1px solid var(--sc-border);padding:var(--sc-sp-2);gap:var(--sc-sp-1);',
        'align-items:center;}',
        '#scpanl-root .sc-nav-title,#scpanl-root .sc-nav-group,#scpanl-root .sc-nav-spacer{display:none !important;}',
        '#scpanl-root .sc-nav-item{flex:none;white-space:nowrap;border-radius:var(--sc-r-pill);',
        'padding:6px var(--sc-sp-3);}',
        
        '#scpanl-root .sc-nav-close{display:inline-flex;align-items:center;justify-content:center;flex:none;',
        'position:sticky;right:0;margin-left:auto;width:32px;height:32px;border-radius:50%;',
        'border:1px solid var(--sc-border);background:var(--sc-bg1);color:var(--sc-text);',
        'cursor:pointer;font-size:17px;line-height:1;appearance:none;-webkit-appearance:none;padding:0;}',
        '#scpanl-root .sc-view{padding:var(--sc-sp-4) var(--sc-sp-3) var(--sc-sp-6);min-height:0}',
        '#scpanl-root .sc-h1{font-size:clamp(15px,1.15vw,18px);}',
        '#scpanl-root .sc-desc{font-size:clamp(12px,.85vw,13px);}',
        '#scpanl-root .sc-mem-grid,#scpanl-root .sc-mem-stats{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));}',
        '#scpanl-root .sc-mem-stat.hero{grid-column:span 1;}',
        '#scpanl-root .sc-kv{grid-template-columns:1fr;gap:0;}',
        '#scpanl-root .sc-kv-k{padding-top:var(--sc-sp-1);}',
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
      ].join(''));
