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
const LIMITS = { 'MEMORY.md': 3000, 'USER.md': 2000, 'AGENT.md': 3000 };
const NOTES_WARN = 8000;

const tmpText = fs.readFileSync(tmp, 'utf8');
const chars = tmpText.replace(/\s+/g, '').length;

const issues = [];
// 指针核对：MEMORY.md / USER.md / AGENT.md 的拟写入内容会引用 notes/ 子文档（v16：PRINCIPLES.md 退役，习得原则并入 AGENT.md）
if (base === 'MEMORY.md' || base === 'USER.md' || base === 'AGENT.md') {
  const notesDir = join(skillDir, 'notes');
  const indexText = fs.existsSync(join(notesDir, 'INDEX.md')) ? fs.readFileSync(join(notesDir, 'INDEX.md'), 'utf8') : '';
  for (const m of tmpText.matchAll(/notes\/([A-Za-z0-9_-]+)\.md/g)) {
    if (!fs.existsSync(join(notesDir, m[1] + '.md'))) issues.push('指针悬空: notes/' + m[1] + '.md 不存在');
    else if (!indexText.includes(m[1] + '.md')) issues.push('未注册 INDEX: notes/' + m[1] + '.md');
  }
}

// v16：PRINCIPLES.md 专用行格式校验移除（习得原则并入 AGENT.md，走下方 [tag] 索引行格式校验）

const formatIssues = [];
const formatHints = [];

// v13：索引行格式校验（spec §8 概况规则 1-4 硬化；主题约束软提示）
if (base === 'MEMORY.md' || base === 'USER.md' || base === 'AGENT.md') {
  for (const raw of tmpText.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('[') || !line.includes(']')) continue;
    const short = line.length > 30 ? line.slice(0, 28) + '…' : line;
    if (!line.includes('·')) { formatIssues.push('缺概况段(·): ' + short); continue; }
    if (!/→\s*notes\//.test(line)) formatIssues.push('缺 notes 指针(→): ' + short);
    const isPath = line.startsWith('[路径]');
    const arrowCount = (line.match(/→/g) || []).length;
    const summary = line.split('·').slice(1).join('·').split('→')[0].replace(/\s+/g, '');
    if (isPath && arrowCount > 1) formatIssues.push('路径步骤勿用 →（与 → notes/ 指针歧义），请用 ①②③ 串联: ' + short);
    else if (summary.length > (isPath ? 40 : 30)) formatIssues.push((isPath ? '路径概要超40字' : '概况超30字') + '(' + summary.length + '): ' + summary.slice(0, 30) + '…');
    if (/（?20\d{2}-\d{1,2}-\d{1,2}）?/.test(line)) formatIssues.push('禁带日期戳（维护元信息归 notes/INDEX.md）: ' + short);
    const topic = line.slice(line.indexOf(']') + 1).split('·')[0].trim();
    if (topic.replace(/\s/g, '').length > 12) formatHints.push('主题超12字（建议精简，不拦截）: ' + short);
    else if (/[:：]/.test(topic)) formatHints.push('主题含冒号复合（补充说明移概况或详情，不拦截）: ' + short);
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
  console.error('exit=1 超容量 | ' + detail.join(' | ') + hint);
  process.exit(1);
}
if (issues.length) {
  console.error('exit=2 ' + detail.join(' | '));
  process.exit(2);
}
if (formatIssues.length) {
  console.error('exit=4 索引行格式违规（spec §8 v13） | ' + formatIssues.join(' | ') + hint);
  process.exit(4);
}
console.log('exit=0 允许写入 | ' + detail.join(' | ') + hint);
process.exit(0);