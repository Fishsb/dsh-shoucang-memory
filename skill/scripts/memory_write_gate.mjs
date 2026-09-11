// memory_write_gate.mjs — 记忆写入前置门（重建版，v3：主文档硬限 / 辅助文档不拦截）
// 原脚本随 2026-08-22 备份丢失未逐字还原；本版按 SKILL.md §6 接口重建。
// 用法: node scripts/memory_write_gate.mjs <目标文件> <临时文件>
//   目标文件: MEMORY.md | USER.md | AGENT.md | notes/<file>.md（可绝对路径或相对技能目录）
// 容量红线只对主文档（MEMORY/USER/AGENT=会话注入面）生效；notes 等辅助文档按需读取，不设硬限（超 NOTES_WARN 仅提示）
// exit 0=允许（附核对：容量数字/占比、指针清单） 1=主文档超容量（合并精简或下沉 notes/） 2=指针悬空/未注册（先建子文档或 INDEX 注册） 3=用法错误
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = process.env.MEMORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..'); // 数据根（开发经 MEMORY_ROOT 指向私人区；缺省=脚本上一级兼容生产副本）

const [target, tmp] = process.argv.slice(2);
if (!target || !tmp) {
  console.error('用法: node memory_write_gate.mjs <MEMORY.md|USER.md|AGENT.md|notes/<file>.md> <临时文件>');
  process.exit(3);
}
if (!fs.existsSync(tmp)) {
  console.error('临时文件不存在:', tmp);
  process.exit(3);
}

const targetPath = target.replace(/[\\/]+$/, '');
const base = targetPath.split(/[\\/]/).pop();
const isNotes = /^notes[\\/]/.test(targetPath) || base.startsWith('notes');

// v9：主文档（注入面）硬限扩容；辅助文档不拦截（仅超 NOTES_WARN 提示）
// v16：PRINCIPLES.md 独立层退役——习得原则以 [原则] 行并入 AGENT.md，AGENT 容量 2,000→3,000
// v17：AGENT.md 索引行新增 [路径] 通用任务路径（对标 AWM）——概况段上限按标签区分：普通行 ≤30 字、[路径] 概要 ≤40 字；
//      [路径] 步内禁用 →（与 → notes/ 指针歧义，步骤请用 ①②③ 串联）
// 2026-09-10：容量门可被 env 覆盖（SHOUCANG_CAP_MEMORY/USER/AGENT）——守藏面板「容量门」可调；未设用默认红线
// 2026-09-11（v21）：下列常量是「§8.1 分层预算公式（指针嵌套树）」的**派生值，不是独立手感数**——只加注释，不改数。
//   推导：行预算 100 字符 = 固定段 56（[tag]8+主题12+·3+概况30+→3）+ 指针 44；故
//     MEMORY.md 5000 = 50 行 × 100；USER.md / AGENT.md 3000 = 30 行 × 100；
//     NOTES_WARN 8000 = 8 × 读取单元 R(1000)（一个 notes 文件 ≤8 节、每节 ≤R）。
//   ⚠️ 断链风险：改任一常量前先读 skill/memory-whitelist-spec.md §8.1，并同步数值表 +
//     memory-whitelist-spec §2/§4/§5 + memory-core-model §2.7 + 投影四处
//     （本文件 / memory-append.mjs / memory_health_check.mjs / engine/target-registry.json）
//     + 宿主侧（scheduler.ts 容量门 / panel.ts CAP_GATES / client.js 输入框 / distill.ts liveCaps）。
const CAP_ENV = {
  'MEMORY.md': Number(process.env.SHOUCANG_CAP_MEMORY) || 5000,
  'USER.md': Number(process.env.SHOUCANG_CAP_USER) || 3000,
  'AGENT.md': Number(process.env.SHOUCANG_CAP_AGENT) || 3000,
};
const LIMITS = { 'MEMORY.md': 5000, 'USER.md': 3000, 'AGENT.md': 3000, ...CAP_ENV };
let NOTES_WARN = 8000;

// v2（ADR-122）：硬门参数可从判据投影读取（唯一事实源 = engine/criteria.json → engine/criteria-gate.json）。
// 优先级：env（面板容量门 SHOUCANG_CAP_*）> criteria-gate.json 投影 > 本文件内建缺省。
try {
  const proj = JSON.parse(fs.readFileSync(join(skillDir, 'engine', 'criteria-gate.json'), 'utf8'));
  for (const [k, v] of Object.entries(proj.caps || {})) {
    const envName = proj.envOverride?.[k];
    if (envName && process.env[envName]) continue; // env 优先
    if (typeof v === 'number') LIMITS[k] = v;
  }
  if (typeof proj.notesWarn === 'number' && proj.notesWarn > 0) NOTES_WARN = proj.notesWarn;
} catch { /* 投影未部署 = 用内建缺省（不报错） */ }

const tmpText = fs.readFileSync(tmp, 'utf8');
const chars = tmpText.replace(/\s+/g, '').length;

const issues = [];
// notes 根与小节索引（v17 § 存在性校验共用；模块级避免作用域分裂）
const notesDir = join(skillDir, 'notes');
const sectionIndexCache = {};
const listSections = (stem) => {
  if (sectionIndexCache[stem]) return sectionIndexCache[stem];
  const f = join(notesDir, stem + '.md');
  const out = new Set();
  if (fs.existsSync(f)) {
    const body = fs.readFileSync(f, 'utf8');
    // ADR-015：小节枚举纳入 ### 子节（两级检索单元）⇒ §子节 指针可选，不再误判悬空
    for (const m of body.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)) {
      out.add(String(m[1]).replace(/\s*（20\d{2}[-/]\d{1,2}[-/]\d{1,2}）\s*$/, '').trim());
    }
  }
  sectionIndexCache[stem] = out;
  return out;
};

// 指针核对：MEMORY.md / USER.md / AGENT.md 的拟写入内容会引用 notes/ 子文档（v16：PRINCIPLES.md 退役，习得原则并入 AGENT.md）
// v17 补缺（2026-09-09 实态：深睡产物指向 notes/flows.md §深睡蒸馏 空壳小节仍 gate=pass——只校验了文件存在）：
// 索引行指针必须指向**真实存在的 §小节**（含「A/B 斜杠双小节」与「小节名含括号日期」两种形态），空壳小节=悬空指针 exit 2。
if (base === 'MEMORY.md' || base === 'USER.md' || base === 'AGENT.md') {
  const indexText = fs.existsSync(join(notesDir, 'INDEX.md')) ? fs.readFileSync(join(notesDir, 'INDEX.md'), 'utf8') : '';
  for (const m of tmpText.matchAll(/notes\/([A-Za-z0-9_-]+)\.md/g)) {
    if (!fs.existsSync(join(notesDir, m[1] + '.md'))) issues.push('指针悬空: notes/' + m[1] + '.md 不存在');
    else if (!indexText.includes(m[1] + '.md')) issues.push('未注册 INDEX: notes/' + m[1] + '.md');
  }
}

// v16：PRINCIPLES.md 专用行格式校验移除（习得原则并入 AGENT.md，走下方 [tag] 索引行格式校验）

const formatIssues = [];
const formatHints = [];

// v2.2 修复（实测根因）：格式上限从**判据投影**读（单一真源）——此前硬编码 30/40，注册表改了门不动；
//   且 prompt 未携带该约束 ⇒ 模型产出普遍超标被逐条拦掉（2026-09-11 深睡 attempted=3 → all-rejected）。
// ⚠ 自足解析（不复用上方 `proj`：它定义在更窄的块内 → 实测直接 ReferenceError 被 exit=1 伪装成"容量超限"）。
const FMT_LIMITS = (() => {
  const dflt = { summaryMax: 30, pathSummaryMax: 40 };
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'criteria-gate.json');
    const f = JSON.parse(fs.readFileSync(p, 'utf8')).format || {};
    if (f.summaryMax || f.pathSummaryMax) return { summaryMax: Number(f.summaryMax) || 30, pathSummaryMax: Number(f.pathSummaryMax) || 40 };
  } catch { /* 投影未部署 → 内建缺省 */ }
  return dflt;
})();
const fmtLimits = FMT_LIMITS; // 下方引用

// v13：索引行格式校验（spec §8 概况规则 1-4 硬化；主题约束软提示）
if (base === 'MEMORY.md' || base === 'USER.md' || base === 'AGENT.md') {
  for (const raw of tmpText.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('[') || !line.includes(']')) continue;
    const short = line.length > 30 ? line.slice(0, 28) + '…' : line;
    if (!line.includes('·')) { formatIssues.push('缺概况段(·): ' + short); }
    if (!/→\s*notes\//.test(line)) { formatIssues.push('缺 notes 指针(→): ' + short); }
    const isPath = line.startsWith('[路径]');
    const arrowCount = (line.match(/→/g) || []).length;
    const summary = line.split('·').slice(1).join('·').split('→')[0].replace(/\s+/g, '');
    if (isPath && arrowCount > 1) { formatIssues.push('路径步骤勿用 →（与 → notes/ 指针歧义），请用 ①②③ 串联: ' + short); }
    if (summary.length > (isPath ? fmtLimits.pathSummaryMax : fmtLimits.summaryMax)) { formatIssues.push((isPath ? `路径概要超${fmtLimits.pathSummaryMax}字` : `概况超${fmtLimits.summaryMax}字`) + '(' + summary.length + '): ' + summary.slice(0, 30) + '…'); }
    if (/（?20\d{2}-\d{1,2}-\d{1,2}）?/.test(line)) { formatIssues.push('禁带日期戳（维护元信息归 notes/INDEX.md）: ' + short); }
    const topic = line.slice(line.indexOf(']') + 1).split('·')[0].trim();
    if (topic.replace(/\s/g, '').length > 12) formatHints.push('主题超12字（建议精简，不拦截）: ' + short);
    else if (/[:：]/.test(topic)) formatHints.push('主题含冒号复合（补充说明移概况或详情，不拦截）: ' + short);
    // § 小节存在性（2026-09-10 修「遮蔽缺口」：原先仅在 lineOk（行格式通过）时才检查，导致
    // 同一行既有格式违规又有悬空指针时，悬空指针被静默跳过、长期隐形——实测 MEMORY.md L45 即此例。
    // 现改为**所有索引行都检查**，两类问题并报；exit 优先级仍是 1(容量) > 2(指针/小节) > 4(格式)。）
    // 匹配口径=read_section.mjs 权威：title===kw || title.includes(kw) || kw.includes(title)（双向包含，§=关键词锚）
    const pm = line.match(/notes\/([A-Za-z0-9_-]+)\.md\s*§(.+)$/);
    if (pm) {
      const titles = [...listSections(pm[1])];
      // § 后可能并列多小节「§A/§B」或单小节名（可含空格/括号），逐个核对
      for (const part of pm[2].split('/')) {
        const kw = part.replace(/^§/, '').trim().toLowerCase();
        if (!kw || /^[→（]/.test(kw)) continue;
        const hit = titles.some((t) => { const tl = t.toLowerCase(); return tl === kw || tl.includes(kw) || kw.includes(tl); });
        if (!hit) issues.push('指针悬空小节: notes/' + pm[1] + '.md §' + kw + ' 不存在（先建小节或修正指针）');
      }
    }
  }
}

// v13：notes 教程式软提示（详情小节=目标/编号步骤/注意三段；纯事实类可省步骤）
let notesHint = '';
if (isNotes) {
  const bodyLines = tmpText.split('\n').map((l) => l.trim()).filter(Boolean);
  const stepish = bodyLines.filter((l) => /^(目标：|\d+[.、)]|注意：)/.test(l)).length;
  if (bodyLines.length >= 3 && stepish === 0) notesHint = ' | ⚠️ 建议教程式三段（目标：/1. 2. …/注意：，spec §8 v13）';
}

if (isNotes) {
  // 辅助文档：不拦截容量；超警戒线仅提示
  const warn = chars > NOTES_WARN ? ` ⚠️ 超 ${NOTES_WARN} 警戒线（按需拆分，不拦截）` : '';
  console.log(`exit=0 允许写入（notes 辅助文档） | 容量: ${chars} 字符${warn}${notesHint}${issues.length ? ' | ' + issues.join(' | ') : ''}`);
  process.exit(0);
}

const limit = LIMITS[base] ?? 3000;
const pct = Math.round((chars / limit) * 100);
const hint = formatHints.length ? ' | ' + formatHints.join(' | ') : '';
const detail = ['容量: ' + chars + '/' + limit + ' 字符 (' + pct + '%)', ...issues];
if (chars > limit) {
  const fmt = formatIssues.length ? ' | 另有格式违规: ' + formatIssues.join(' | ') : '';
  console.error('exit=1 超容量 | ' + detail.join(' | ') + hint + fmt);
  process.exit(1);
}
if (issues.length) {
  const fmt = formatIssues.length ? ' | 另有格式违规: ' + formatIssues.join(' | ') : '';
  console.error('exit=2 ' + detail.join(' | ') + fmt);
  process.exit(2);
}
if (formatIssues.length) {
  console.error('exit=4 索引行格式违规（spec §8 v13） | ' + formatIssues.join(' | ') + hint);
  process.exit(4);
}
console.log('exit=0 允许写入 | ' + detail.join(' | ') + hint);
process.exit(0);