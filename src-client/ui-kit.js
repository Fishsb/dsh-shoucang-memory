/**
 * ui-kit.js — 面板渲染元件（自 `body.js` 抽出 · UI1/U1 · 2026-09-15）
 *
 * **为什么最后抽它**：`UI` 依赖 `dom.js`（el/svg/ICONS）与 `state.js`（Bus/Store/Log/Cfg/Fold）——
 *   按依赖拓扑，它必须排在它们之后（先抽会让它反向 import `body.js` ⇒ 造环）。
 *
 * ⚠ **状态归属变更（打破闭包的必要改造）**：`headEpoch`/`headUsed`（页头**渲染轮次**）原定义在
 *   `body.js` 渲染层（距 UI 定义 3400+ 行，靠 `var` 提升被 `UI.pageHead` 读到）。抽出后跨模块闭包
 *   不再成立 ⇒ **随 `UI` 一起搬入本模块**（它本就是 `UI.pageHead` 的状态，内聚更合理），
 *   并暴露 `UI.bumpHeadEpoch()` 供渲染层推轮次（原 `headEpoch++` 的调用点随之改写）。
 */
import { ICONS, el, svg } from './dom.js'
import { Bus, Cfg, Fold, Log, Store } from './state.js'
import { appState } from './app-state.js'
import { lang, tr } from './i18n.js'
/* U2（2026-09-26）：宿主 UI 组件接入层。
 *   判因：我们自带整套 Web Awesome（570KB）只为用 7 个组件，而宿主 primitives
 *   已含同名同义实现（Button/Switch/Pill/StateDot/DisclosureRow/SegmentedTabs）。
 *   本件把「优先宿主、失败降级自建」收敛在一处 —— 下方各构件照此模式改。 */
import { hostComponent, reactEl, mountReact } from './host-ui.js'

/* 页头槽的**渲染轮次**（原在 body.js 渲染层；见本件头注的"状态归属变更"） */
var headEpoch = 0, headUsed = -1;

/* ---- 6. UI：组件工厂（A2，消除 14 个 render 里的重复实现） ---- */
var UI = {
  /** 渲染层每轮调用：允许本轮写入一次页头（原 `headEpoch++` 的等价物）。
   *  ⚠ **必须写在对象字面量里**，不得事后 `UI.bumpHeadEpoch = …` 赋值 ——
   *  `check-ui-contract` ②b 从 UI 对象的**花括号切片**取成员名单，赋值式添加它扫不到
   *  （实测因此报「UI 成员缺失：bumpHeadEpoch」—— 而该护栏的语义正是"渲染时会抛 TypeError"）。 */
  bumpHeadEpoch: function () { headEpoch++; },
  /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item） */
  /* 标准设置行：标题 + 描述 + 右侧控件（对齐 Obsidian setting-item）。
 * opts:
 *   cls          —— 附加类名
 *   children     —— 数组，追加为 row 的平级子节点（如徽标 + 控件）
 *
 * ⚠ 开关收敛（接缝① · 2026-09-17 阶段 2c）：原设计有 **四开关**（文件自陈「三处三种形态」）——
 *   extra（挂进 .setting-item-info **内**）与 children（挂 row **平级**）让**同一语义**
 *   （作用域徽标）落在两处 ⇒ 实测徽标左边界在设置页与参数页**相差 612px**（898 vs 286）。
 *   现只留 children：行形状**唯一** —— [info] [children…]，次序与内容由调用方决定。
 *   （extra 唯一使用点 panes-settings.js 已改；wrapControl 随之无消费者，一并删除。） */
  item: function (name, desc, control, opts) {
    var o = opts || {};
    var row = el('div', 'setting-item' + (o.cls ? ' ' + o.cls : ''));
    var info = el('div', 'setting-item-info');
    if (name) info.appendChild(el('div', 'setting-item-name', name));
    if (desc) info.appendChild(el('div', 'setting-item-desc', desc));

    row.appendChild(info);
    if (control) {
      var c = el('div', 'setting-item-control'); c.appendChild(control); row.appendChild(c);
    }
    (o.children || []).forEach(function (n) { if (n) row.appendChild(n); });
    return row;
  },
  /* 开关：单一实现 = input.checkbox-container（与 makeToggle / 蒸馏 / 向量三处直建写法同源）。
   * 旧实现返回 label 包裹 input —— 内侧原生 checkbox 未被隐藏，胶囊上叠了一个系统勾选框，
   * 与其它三处的开关形态不一致（U4 统一控件规范修复）。 */
  /* 开关（S3：手写 checkbox → 组件库 <wa-switch>）。
   * 契约读自 switch.d.ts：`checked` 属性 + `change` 事件；parts switch/control/thumb/label。
   * 旧实现挂的 .checkbox-container 类随之退役（对应 CSS 规则已删，避免死规则）。 */
  toggle: function (checked, onChange, label) {
    /* U2-a（2026-09-26）：优先宿主 Switch（契约同构：checked/onChange/label/disabled/title）。
     *   拿不到 ⇒ 降级既有 wa-switch，行为与旧版一致（零回归）。
     *   ⚠ **必须走 React root**：primitives 组件用 hooks，直接函数调用非法
     *     （见 host-ui.js 的 mountReact 头注）。 */
    var HS = hostComponent('Switch'), h = reactEl();
    if (HS && h) {
      var box = el('span', 'sc-host-switch');
      var cur = !!checked;
      var m = mountReact(box, function () {
        return h(HS, {
          checked: cur,
          label: label || '',
          onChange: function (next) { cur = !!next; onChange(!!next); m && m.update(); }
        });
      });
      if (m) return box;
    }
    /* 降级（U2 · 2026-09-26）：**自绘开关**，彻底去掉 wa-switch 依赖。
     *   CSS 基座早已在位（.checkbox-container 的 appearance:none 胶囊 + ::after 圆点 +
     *   checked/disabled 三态，见 styles.js「开关：单一实现」段）——它本就是本面板的既有实现，
     *   WA switch 反而是后来的替换。此处回落即**回到自有实现**，观感由既有 CSS 保证。 */
    var sw = el('input', 'checkbox-container');
    sw.type = 'checkbox';
    sw.checked = !!checked;
    if (label) sw.setAttribute('aria-label', label);
    sw.addEventListener('change', function () { onChange(!!sw.checked); });
    return sw;
  },
  /* ── 卡片原语（v9 对齐 · 补上缺失的「卡片层」）──
   * v9 的层级是 页头 → **卡片(.card：卡头 + 卡体)** → 卡内小节 → 行；
   * 面板此前是「分节标题 + 平铺卡片」，整页少一层容器 ⇒ 多板块读起来是散块而非分组。
   * opts: { sub } 卡头副文本；{ right } 卡头右侧节点（数组或单节点，v9 放路由 chip / pill）。
   * 返回 { box, head, body }：**后续内容 append 到 body**（= v9 的 .card > .bd）。 */
  card: function (title, opts) {
    var o = opts || {};
    var box = el('div', 'sc-card');
    var head = null;
    if (title) {
      head = el('div', 'sc-card-hd');
      head.appendChild(el('span', null, title));
      if (o.sub) head.appendChild(el('span', 'sub', o.sub));
      if (o.right) {
        var r = el('div', 'right');
        (Array.isArray(o.right) ? o.right : [o.right]).forEach(function (n) { if (n) r.appendChild(n); });
        head.appendChild(r);
      }
      box.appendChild(head);
    }
    var body = el('div', 'sc-card-bd');
    box.appendChild(body);
    return { box: box, head: head, body: body };
  },
  /* 卡进 Tab 面板（v9 §7）：原型的每个 Tab 内是**一张卡**（div.card.plain，卡体直接含设置行），
   * 面板此前是裸行平铺 ⇒ 少一层容器。返回卡体，调用方直接 appendChild 设置行。 */
  cardIn: function (pane, opts) {
    var c = UI.card(null, opts);
    if (pane) pane.appendChild(c.box);
    return c.body;
  },
  /* 页头：统一「标题 + 描述 + 分隔线」节奏（替代各处裸拼 sc-h1 / sc-desc）。
   * v9 对齐：页头挂在固定槽 #scpanl-headslot（**不随内容滚动**），渲染时自清上一次的页头；
   * 槽不可用时（老结构/单测夹具）回退为返回游离节点，调用方 appendChild 仍可用。 */
  pageHead: function (title, desc, opts) {
    var o = opts || {};
    var box = el('div', 'sc-pagehead');
    var main = el('div', 'sc-ph-main');
    main.appendChild(el('h2', 'sc-h1', title));
    var descEl = null;
    if (desc) { descEl = el('div', 'sc-desc', desc); main.appendChild(descEl); }
    /* v9 对齐：路由 chip 两种排布随页而定 ——
     *   · routesInline：**接在 desc 句子末尾**（v9 插件集合页 `<p>…共用。<span class="src">/suite</span></p>`）；
     *   · 默认：desc 下方独立一行（v9 记忆库页三枚 chip）。 */
    if (o.routes && o.routes.length) {
      if (o.routesInline && descEl) {
        o.routes.forEach(function (r) { descEl.appendChild(el('span', 'sc-src', r)); });
      } else {
        var row = el('div', 'sc-routes');
        o.routes.forEach(function (r) { row.appendChild(el('span', 'sc-src', r)); });
        main.appendChild(row);
      }
    }
    box.appendChild(main);
    /* v9 对齐：页头右侧**搜索框 + 刷新按钮**（方案每页头都有；此前无页级检索入口） */
    var acts = el('div', 'sc-ph-acts');
    if (o.search) {
      var srch = el('label', 'sc-srch');
      srch.appendChild(svg(ICONS.search));
      var inp = document.createElement('input');
      inp.type = 'search';
      inp.placeholder = o.search.placeholder || tr("过滤…");
      inp.setAttribute('aria-label', o.search.placeholder || tr("过滤"));
      inp.oninput = function () { if (o.search.onInput) o.search.onInput(String(inp.value || '').trim()); };
      srch.appendChild(inp);
      acts.appendChild(srch);
    }
    if (o.refresh) {
      acts.appendChild(UI.button(tr("刷新"), function () { appState.refreshView(); appState.statusFn(tr("已重新取数")); }, { title: tr("重新取数并重绘本页") }));
    }
    /* 页头自定义动作（v9 页头右侧可放主操作，如插件集合页的「重新装配」） */
    (o.actions || []).forEach(function (n) { if (n) acts.appendChild(n); });
    if (acts.children.length) box.appendChild(acts);
    var slot = document.getElementById('scpanl-headslot');
    if (slot) {
      if (headUsed === headEpoch) return box;      /* 本轮已有页头：嵌套调用不抢槽 */
      slot.textContent = ''; slot.appendChild(box); headUsed = headEpoch;
    }
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
  /* 下拉：**原生 <select>**（S3 二度回滚 · 2026-09-13）。
   * 两次尝试 <wa-select> 均判退化，判因（第二次是**视觉复核+像素穷举**给出的，不是自评）：
   *   ① **箭头没画出来**——shadow DOM 里确实有 <wa-icon> 元素，但**渲染尺寸为 0**（像素扫描：文字右侧全空）。
   *      注意教训：我当时的断言只验「元素存在」，于是**假绿**；必须验**渲染尺寸**（bbox > 0）。
   *   ② ::part(combobox) 填充未生效（实测填充 = 卡片底色，与同排数字输入"一亮一暗"）。
   *   ③ 宽度失控：控件 173px vs 原 ~66px，左缘与同排输入不再对齐。
   * 结论：WA select 的采用**前置未真正满足**（图标 registry 注册了但图标没渲染出来）。原生 select 三项都对，
   * 故回滚；要再采用，先把「图标真能渲染」用**渲染尺寸断言**证明，再谈替换。 */
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
  /* 按钮（S3：组件库 <wa-button>，2026-09-13 前置条件达成后**重做**）。
   * 上一轮曾因观感退化回滚，根因是**没有接管 WA 的尺寸层**（其字号由 --wa-font-size-scale 派生，
   *   默认 1rem=16px ⇒ 按钮 35–43px、品牌蓝）。本轮先做了尺寸层接管（font-size-scale .78 / space-scale .375 /
   *   radius-scale 1）并**实测**：xs 27px / **s 30px** / m 34px / l 43px（字号 10/11/12.48/16px）
   *   ⇒ 选 size="s" 与手写实现（30px）等高，观感一致。
   * 契约读自 webawesome button.d.ts：variant neutral|brand|danger、appearance filled|outlined、size、loading、pill。
   * API 与行为完全保留（text/onClick/{primary,danger,title,confirm,async,busyText,okText}）⇒ 13 个调用点零改动。 */
  button: function (text, onClick, opts) {
    var o = opts || {};
    /* U2-e（2026-09-26）：**优先宿主 Button**，拿不到降级 wa-button。
     *   宿主契约实测：variant = 'primary'|'ghost'|'outline'|'toolbar'（**无 danger**），
     *     size = 'md'(36px) | 'sm'(28px)。
     *   ⚠ 映射口径：danger 用 'outline' 承载（宿主无破坏性色族）——**观感差异如实声明**，
     *     不假装等价；primary→'primary'、其余→'ghost'。
     *   ⚠ 封装语义（confirm / async / busyText / loading）**与渲染无关，原样保留**：
     *     它们作用于按钮节点的 disabled 与文本，两种实现下行为一致。 */
    var HB = hostComponent('Button'), h = reactEl();
    var b = null, hostMode = false, m = null, curDis = false, curText = text;
    if (HB && h) {
      var box = el('span', 'sc-host-btn');
      hostMode = true;
      m = mountReact(box, function () {
        return h(HB, {
          variant: o.primary ? 'primary' : (o.danger ? 'outline' : 'ghost'),
          size: 'sm',
          className: o.pill ? 'sc-pill' : '',
          disabled: curDis,
          title: o.title || '',
          onClick: handleClick
        }, curText);
      });
      if (m) b = box;
    }
    if (!hostMode) {
      /* 降级（U2 · 2026-09-26）：**自绘按钮**，彻底去掉 wa-button 依赖。
       *   .sc-btn 基座早已在位（30px 高 / 1px 边 / --sc-r-sm 圆角 / hover·disabled 态 /
       *   .sc-btn-primary 变体），它本就是本面板的既有实现 —— WA button 是后来的替换。
       *   ⚠ 变体映射：primary→sc-btn-primary、其余→sc-btn（与宿主路径的 variant 映射同源：
       *     ghost/outline/primary；danger 在宿主无对应色族，两条路径都退为中性，观感一致）。 */
      b = el('button', 'sc-btn' + (o.primary ? ' sc-btn-primary' : ''));
      b.type = 'button';
      if (o.title) b.title = o.title;
      b.textContent = text;
      b.onclick = handleClick;
    }
    /* 点击行为（两路径共用同一实现 —— 单一逻辑，避免两套分叉） */
    function handleClick () {
      if (o.confirm && !confirm(o.confirm)) return;
      if (!o.async) { try { onClick(); } catch (e) { appState.failFn(e); } return; }
      setDisabled(true, o.busyText || null);
      Promise.resolve().then(onClick).then(function (r) { Log.info(o.okText || (text + tr(' 完成'))); return r; })
        .catch(appState.failFn).then(function () { setDisabled(false, null); });
    }
    function setDisabled (d, busyText) {
      curDis = !!d;
      if (busyText != null) curText = busyText; else curText = text;
      if (hostMode) {
        if (m) m.update();
      } else {
        b.disabled = curDis;
        if (curDis) b.setAttribute('loading', ''); else b.removeAttribute('loading');
        b.textContent = curText;
      }
    }
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
    var t = el('span', null, '');
    box.appendChild(t);
    /* v9 对齐：徽章里**变化的那一段加粗**（方案为 `标签 <b>值</b>`：向量 <b>fusion</b> / 候选 <b>9</b> /
     * 认知环 快<b>23</b>/慢<b>7</b>）。判据：文本尾部的第一段「含数字」的连续片段加粗，其余保常重。 */
    function render(s) {
      t.textContent = '';
      var str = String(s === undefined || s === null ? '' : s);
      var m = /^(.*?)([^\s]*\d[^\s]*)\s*$/.exec(str);
      if (m && m[1]) {
        t.appendChild(document.createTextNode(m[1]));
        t.appendChild(el('b', null, m[2]));
      } else { t.textContent = str; }
    }
    var h = {
      box: box,
      setText: function (s) { render(s); return h; },
      setKind: function (k) { box.className = 'sc-ds-badge' + (k ? ' ' + k : ''); return h; },
      setTitle: function (s) { box.title = s; return h; }
    };
    render(text);
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
    var label = o.label || tr("展开");
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
        head.textContent = open ? tr("收起 ▴") : label + ' ▾';
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
        body.appendChild(el('div', 'sc-mem-empty', o.emptyText || tr("（无内容）")));
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

  /* 分段 Tab（P2）：一次只面对一组。选中态存 Cfg（重绘后保持）；**绝不触碰 Fold** ——
   * 折叠态的生命周期边界只有「换视图」（L3096），Tab 切换只切 .sc-hidden。 */
  /* 分段 Tab（S3：改用组件库 <wa-tab-group>，不再手写 tab 逻辑与样式）。
   * 契约（读自 webawesome tab-group.d.ts）：<wa-tab slot="nav" panel=ID> + <wa-tab-panel name=ID>；
   *   active 属性设初始态；wa-tab-show 事件回写 Cfg ⇒ 选中态持久化与旧实现等价；parts: nav/tabs/body。
   * 返回句柄与旧实现**完全一致**（{ box, select(id), pane(id) }），故调用点零改动、可随时回滚。 */
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

  /* 容量/指标 KPI 卡（P3）：**画像 / 记忆库 / 运行总览三处共用的唯一实现**。
   * v9 裁决：容量类信息统一为「大数值 + 百分比 + 进度条」；无容量门的载体给 .na 虚线空槽保持槽位一致。
   * opts: { val, txt(文字型主值), sub, pct(null=无门), kind('' | ok | suspect | stalled) }
   * 返回 { box, set(val, sub, isTxt), fill(pct, kind) } */

  tabs: function (key, defs) {
    var box = el('div', 'sc-tabbox');
    /* U2（2026-09-26）：Tab 改走**宿主 SegmentedTabs**（契约实测：items[{value,label,id,panelId}]
     *   + value + onChange + label，**面板由调用方持有**——与本函数原有的 d.pane 模式天然契合）。
     *   ⚠ 语义变化如实声明：宿主 SegmentedTabs 只渲染 **tab 条**，不渲染面板容器；
     *     故面板改由本函数直接挂进 box（原来是塞进 wa-tab-panel）。**可见行为不变**
     *     （同一时刻只显示一个 pane，由 .sc-pane-on 类控制），但 DOM 层次与旧版不同。
     *   ⚠ 持久化与 API **逐字保留**（Cfg('tab:'+key) / select(id) / pane(id)），调用点零改动。 */
    var cur = Cfg.get('tab:' + key, (defs[0] || {}).id);
    var valid = false;
    defs.forEach(function (d) { if (d.id === cur) valid = true; });
    if (!valid) cur = (defs[0] || {}).id;
    var panes = {};
    /* 全部 pane **常驻挂载**，非激活者用 .sc-hidden 隐藏 —— 与旧版（wa-tab-group）**DOM 等价**。
     *   判因（实测取证，两次对照，2026-09-26）：
     *   · 第一版（本实现）：全挂载 + .sc-hidden ⇒ i18n-parity 抓到的文本长度 **2574 = HEAD 的 2574**
     *     （逐段 diff 只剩「时间格式 + 4 个 tab 标签」两类差异）⇒ **WA 并不移除未激活 panel 的内容**，
     *     它只是隐藏。这一点曾被我依据"shadow DOM 里抓不到"误判成"内容不在 DOM"。
     *   · 第二版（按该误判改成"只挂激活 pane"）：长度掉到 **2068（少 506 字）** ——
     *     直接把未激活 pane 的内容从 DOM 里**删掉了**，那是**真的行为变更**（调用方可能持有该节点、
     *     屏幕阅读器/任何遍历 DOM 的消费方都会少读），比"多挂"更危险。故回退。
     *   ⇒ 结论：**.sc-hidden 是对的**；真正的差异只是「tab 标签本实现落在 light DOM（旧版在 WA 的
     *     shadow DOM 里）」，属实现介质差异，非行为回归（标签在两条路径下**用户都看得见、都点得到**）。 */
    defs.forEach(function (d) {
      d.pane.classList.add('sc-tabpane');
      panes[d.id] = d.pane;
      box.appendChild(d.pane);
    });
    function applyPane(id) {
      defs.forEach(function (d) {
        if (d.id === id) d.pane.classList.remove('sc-hidden'); else d.pane.classList.add('sc-hidden');
      });
    }
    function setCur(id) { cur = id; applyPane(id); }
    var HST = hostComponent('SegmentedTabs'), h = reactEl();
    var m = null;
    if (HST && h) {
      var navBox = el('div', 'sc-tabnav');
      box.insertBefore(navBox, box.firstChild);
      m = mountReact(navBox, function () {
        return h(HST, {
          items: defs.map(function (d) { return { value: d.id, label: d.label, id: 'tab-' + key + '-' + d.id, panelId: 'panel-' + key + '-' + d.id } }),
          value: cur,
          label: key,
          onChange: function (id) { setCur(id); Cfg.set('tab:' + key, id); if (m) m.update(); }
        });
      });
    }
    if (!m) {
      /* 降级：自绘胶囊分段（与宿主观感对齐，去掉 wa-tab-group 依赖） */
      var nav = el('div', 'sc-tabnav');
      box.insertBefore(nav, box.firstChild);
      defs.forEach(function (d) {
        var t = el('button', 'sc-tabbtn', d.label);
        t.onclick = function () {
          defs.forEach(function (x) { x.btn.className = 'sc-tabbtn' });
          t.className = 'sc-tabbtn sc-on';
          setCur(d.id); Cfg.set('tab:' + key, d.id);
        };
        d.btn = t;
        nav.appendChild(t);
      });
      m = { update: function () {} };
    }
    applyPane(cur);
    return {
      box: box,
      select: function (id) { setCur(id); if (m) m.update(); },
      pane: function (id) { return panes[id] || null; }
    };
  },
  kpi: function (top, opts) {
    var o = opts || {};
    var c = el('div', 'sc-kpi');
    /* v9 对齐：顶行 = 状态色点 + 标签（点随 kind 走；未给 kind 时不画点，保持旧调用点不变） */
    var topEl = el('div', 'sc-kpi-top');
    /* 状态词表（ds-badge 语义）→ 色点四态：ended/running=ok · probing=info · suspect=warn · stalled=err */
    var DOTK = { ended: 'ok', running: 'ok', probing: 'info', suspect: 'warn', stalled: 'err' };
    var dotCls = function (k) { return 'sc-dot ' + (DOTK[k] || k || 'ok'); };
    var dot = null;
    if (o.kind) { dot = el('span', dotCls(o.kind)); topEl.appendChild(dot); }
    topEl.appendChild(el('span', null, top));
    c.appendChild(topEl);
    var v = el('div', 'sc-kpi-val' + (o.txt ? ' txt' : ''), o.val === undefined || o.val === null ? '—' : String(o.val));
    c.appendChild(v);
    var sub = el('div', 'sc-kpi-sub', o.sub || '');
    c.appendChild(sub);
    /* v9 观测页的 KPI **无状态点、无进度条**（DOM 实测 kpi:4 内零 dot/bar，卡高 104）；
     * 容量类 KPI（记忆库 / 画像 / 总览）才带条与点 ⇒ 由 opts.plain 区分，
     * 不用「改一处对齐、别处跟着走样」的做法。 */
    var bar = null;
    if (!o.plain) {
      bar = el('div', 'sc-kpi-bar' + (o.pct === null || o.pct === undefined ? ' na' : ''));
      var fill = el('i', o.kind || '');
      if (o.pct !== null && o.pct !== undefined) fill.style.setProperty('--sc-pct', o.pct + '%');
      bar.appendChild(fill);
      c.appendChild(bar);
    }
    var h = {
      box: c,
      set: function (val, subText, isTxt) {
        v.textContent = val === undefined || val === null ? '—' : String(val);
        v.className = 'sc-kpi-val' + (isTxt ? ' txt' : '');
        if (subText !== undefined) sub.textContent = subText || '';
        return h;
      },
      fill: function (pct, kind) {
        /* 状态点与进度条同步（点只在创建时给了 kind 才存在）：ended→ok 是既有语义映射 */
        if (dot && kind !== undefined) dot.className = dotCls(kind);
        if (!bar) return h; // plain：无条可填
        if (pct === null || pct === undefined) { bar.classList.add('na'); return h; }
        bar.classList.remove('na');
        bar.firstChild.style.setProperty('--sc-pct', pct + '%');
        if (kind !== undefined) bar.firstChild.className = (kind === 'ended' ? 'ok' : kind);
        return h;
      }
    };
    return h;
  },
  /* 进度条（C1）。P0-1（2026-09-13）：条体改由组件库承载 ——
   *   外壳 `div.sc-prog` 保留（承载行间距与下方文字），`<wa-progress-bar>` 负责条本身。
   *   尺寸/配色由 CSS 侧接管组件变量（见上方 .sc-prog-bar 规则），此处只驱动 `value`。 */
  progress: function (id) {
    var box = el('div', 'sc-prog');
    /* U2（2026-09-26）：**自绘轨道 + 填充**，去掉最后一个 wa-* 依赖。
     *   判因：宿主 primitives **没有进度条原语**（组件面 59 项里无 Progress 类），
     *   故此处不是"换宿主"而是"自绘"——目的是让 wa-progress-bar 彻底退场，
     *   从而卸掉整个 Web Awesome 与它 300KB 的主题 CSS（实测产物构成：vendor 主题 CSS 300KB）。
     *   ⚠ 尺寸与配色**沿用组件时代实测过的值**（6px 轨道 / --sc-bg3 底 / --sc-accent 填充）——
     *     这是当年为对齐方案逐项接管 WA 变量定下来的，自绘必须逐值保持，否则会顶开网格。
     *     （历史教训：WA 自带 --track-height 是 16px，不接管时 ui-geo-regress 93 → 70 PASS。） */
    var track = el('div', 'sc-prog-track');
    var fill = el('div', 'sc-prog-fill');
    track.appendChild(fill);
    var txt = el('div', 'sc-prog-txt', '');
    box.appendChild(track); box.appendChild(txt);
    function render(p) {
      var s = (p || {})[id];
      // 显隐用 .sc-hidden（与全站一致）
      if (!s || !s.on) { box.classList.add('sc-hidden'); return; }
      box.classList.remove('sc-hidden');
      fill.style.width = Math.max(0, Math.min(100, s.pct || 0)) + '%';
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

/** 渲染层每轮调用：允许本轮写入一次页头（原 `headEpoch++` 的等价物）
 *  ⚠ 已**移入 `UI` 对象字面量**（见文件上部）—— 赋值式添加会让 `check-ui-contract` ②b 扫不到成员。 */

/* ══ 数值/枚举设置控件（2026-09-22 · ADR-333 归位）══════════════════════════════════════
 * 为什么从 `panes-toggles.js` 迁到本件：② 记忆与容量 pane 抽出为 `panes-capacity.js` 后，
 *   两个 pane 都要用 `numSetting` ⇒ 若由 `panes-toggles.js` 导出并被 capacity import，
 *   就形成 **`panes-toggles → panes-capacity → panes-toggles` 静态循环**，
 *   被 `audit-architecture --dir src-client --gate` 当场判红（实测）。
 * 正解不是"允许那对互相 import"，而是**把共用控件下沉到中立层** —— 本件本就是控件工厂域
 *   （`UI.item` / `UI.select` / `UI.input` 都在此处），两个控件与它们同域且依赖齐备
 *   （`el` / `appState` / `tr` 本件都已 import）⇒ 归位后**环消失**，且"同一控件只有一份实现"。
 * ⚠ 不得再在 pane 内复制这两份实现（复制会产生"同一控件两种行为"）。
 */

/** 数值设置行（走 `/set`；整数或小数由 `step < 1` 判）。 */
function numSetting(name, desc, val, key, unit, step) {
  var isFloat = typeof step === 'number' && step < 1; // U3：小数键（如 MCL 熟悉度阈值）支持
  var wrap = el('div', 'sc-num-wrap'); // U2.5：内联样式 → 类（令牌化，可统一/可回滚）
  var inp = el('input'); inp.type = 'number'; inp.className = 'sc-input'; inp.min = '0'; inp.step = String(step || 100); inp.value = String(val);
  var unitEl = el('span', 'sc-range-label', unit || '');
  inp.onchange = function () {
    var v = String(isFloat ? (Math.max(0, parseFloat(inp.value) || 0)) : Math.max(0, parseInt(inp.value, 10) || 0));
    appState.api('/set', { method: 'POST', body: JSON.stringify({ key: key, value: v }) })
      .then(function () { appState.statusFn('✓ ' + key + ' = ' + v); })
      .catch(appState.failFn);
  };
  wrap.appendChild(inp); wrap.appendChild(unitEl);
  // A2：改用 UI.item（DOM 等价）——children 保持「info + 作用域徽标 + 控件」的原有顺序与结构
  return UI.item(name, desc, null, { children: [appState.metaBadges(key), wrap] });
}

/**
 * 枚举设置行（ADR-333 新增；走 `/set` 的**字符串枚举**键）。
 * 为什么需要它（不复用 `numSetting`）：枚举值域如 `on|off`，走 numSetting 的 `parseInt` 通道
 *   会写出 `NaN→0` —— 正是写入侧明确防的「枚举键落进 Number 分支 ⇒ 看着成功、值是坏的」。
 * 为什么不用 `/toggle` 通道：其 `SUITE_BOOL` 分支语义是 **「缺省 true，翻转」**，
 *   而本控件服务的键**缺省 false** ⇒ 复用会把"未设置"读成 true，首次点击方向相反。
 */
function enumSetting(name, desc, val, key, options) {
  var wrap = el('div', 'sc-num-wrap');
  var sel = el('select', 'sc-input');
  (options || []).forEach(function (o) {
    var opt = el('option'); opt.value = o.v; opt.textContent = o.label;
    if (String(o.v) === String(val)) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = function () {
    var v = String(sel.value);
    appState.api('/set', { method: 'POST', body: JSON.stringify({ key: key, value: v }) })
      .then(function () { appState.statusFn('✓ ' + key + ' = ' + v); })
      .catch(appState.failFn);
  };
  wrap.appendChild(sel);
  return UI.item(name, desc, null, { children: [appState.metaBadges(key), wrap] });
}

export { UI, numSetting, enumSetting };
