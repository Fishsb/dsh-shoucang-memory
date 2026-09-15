/**
 * panes-config.js — 配置类视图（UI1/U2 **验证刀** · 2026-09-15）
 *
 * **为什么先拿它开刀**：精确依赖实测（剥注释/字符串后按词边界）——它是 24 个 render 里
 *   **依赖最少**的（原 2 个），且在 `fmtTime` 归位 `derive.js`、`api` 进 `appState` 之后**只剩 1 个**。
 *
 * **取依赖的方式**：从 `appState` 取（`appState.api` / `appState.refs` 等），**不是** import 服务模块 ——
 *   那会让"谁都能 import 全局服务"、pane 与入口的依赖方向变乱。
 *   ⚠ `appState` 字段由**入口**（`body.js` 的 `factory`）在启动时注入 ⇒ 调用时必已就绪。
 */
import { UI } from './ui-kit.js'
import { el } from './dom.js'
import { fmtTime } from './derive.js'
import { appState } from './app-state.js'

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

export { renderViewYaml };
