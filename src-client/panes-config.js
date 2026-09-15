/**
 * panes-config.js — 自 `body.js` 抽出的 pane 模块（UI1/U2 · 2026-09-15）
 *
 * **抽取方式**：`scripts/extract-pane.mjs`，用 **TypeScript AST** 取精确区间
 *   （花括号配平与缩进边界都试过、都会切错 —— 见该脚本头注）。
 *
 * **取依赖**：从 `appState` 取（入口注入），不 import 全局服务模块。
 */
import { UI } from './ui-kit.js'
import { el } from './dom.js'
import { Derive, fmtTime } from './derive.js'
import { appState } from './app-state.js'

function renderViewRoots(view, rootListWrap) {
  view.textContent = '';
  UI.pageHead('守藏根目录', '指向含 shoucang.config.yaml 的工作区目录。该目录本身即为 Obsidian 兼容 vault（Markdown + frontmatter + [[双链]]），可用 Obsidian 直接打开。', { routes: ['/roots', '/get_root', '/root/bootstrap'] });

  var listWrap = el('div'); rootListWrap(listWrap);
  view.appendChild(listWrap);
  var addItem = el('div', 'setting-item');
  var info = el('div', 'setting-item-info');
  info.appendChild(el('div', 'setting-item-name', '添加根目录'));
  info.appendChild(el('div', 'setting-item-desc', '绝对路径，须包含 shoucang.config.yaml'));
  var input = el('input', 'sc-input'); input.placeholder = '请输入 vault 的绝对路径';
  var btn = el('button', 'sc-btn', '添加并启用');
  btn.onclick = function () {
    var p = input.value.trim(); if (!p) return;
    appState.api('/set_root', { method: 'POST', body: JSON.stringify({ path: p }) })
      .then(function () { input.value = ''; appState.statusFn('✓ 根目录已启用'); appState.refreshView(); })
      .catch(appState.failFn);
  };
  addItem.appendChild(info); addItem.appendChild(input); addItem.appendChild(btn);
  view.appendChild(addItem);

  function draw(r) {
    listWrap.textContent = '';
    if (!Derive.has(r.roots)) {
      var empty = el('div', 'setting-item');
      empty.appendChild(el('div', 'setting-item-desc', '尚未登记任何根目录——在上方输入路径添加。'));
      listWrap.appendChild(empty);
      return; // 空态必须收口：原实现缺 return，紧接着 r.roots.forEach 在 /roots 未返回对象时必抛
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
        appState.api('/set_root', { method: 'POST', body: JSON.stringify({ path: root.path }) })
          .then(function () { appState.statusFn('✓ 已启用 ' + root.name); appState.refreshView(); })
          .catch(appState.failFn);
      };
      item.appendChild(useBtn);
      listWrap.appendChild(item);
    });
  }
  renderViewRoots._draw = draw;
}

function renderViewYaml(view, ta, saveRow) {
  view.textContent = '';
  UI.pageHead('配置原文', '直接编辑 shoucang.config.yaml 全文。保存时原文件自动备份为 .bak-时间戳。', { routes: ['/config', '/save'] });
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
  appState.api('/config/recent').then(function (r) {
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

function renderConfigRaw(host) {
  var rootSection = el('div');
  var yamlSection = el('div');
  var ta = document.createElement('textarea'); appState.refs.ta = ta;
  var saveRow = el('div');
  renderViewRoots(rootSection, function (w) { appState.refs.rootListWrap = w; });
  renderViewYaml(yamlSection, ta, saveRow);
  host.appendChild(rootSection);
  host.appendChild(yamlSection);
  appState.api('/roots').then(function (r) { if (renderViewRoots._draw) renderViewRoots._draw(r); }).catch(appState.failFn);
  if (saveRow._btn) {
    saveRow._btn.onclick = function () {
      appState.api('/save', { method: 'POST', body: JSON.stringify({ text: ta.value }) })
        .then(function () { appState.statusFn('✓ 已保存，原文件已备份为 .bak-*'); })
        .catch(appState.failFn);
    };
  }
  appState.api('/config').then(function (r) {
    ta.value = r.text || '';
    if (!r.text) appState.statusFn(r.error === 'no-active-root' ? '未激活根目录——请在「高级 · 根目录」区添加。' : (r.error || ''));
  }).catch(appState.failFn);
}

export { renderViewRoots, renderViewYaml, renderConfigRaw };
