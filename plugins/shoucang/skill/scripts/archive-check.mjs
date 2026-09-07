#!/usr/bin/env node
// archive-check.mjs — 会话归档增量检测（复用 archive-lib 公共层，纯只读）
// 用法: node scripts/archive-check.mjs <sessionId|转录文件路径> [--sig] [--json]
// 输出: mark 状态 + 增量范围 (lastRow, total] + 可选信号召回；--json 结构化（timer/插件/队列用）
// 退出码: 0=有增量 2=无增量/转录缺失 3=用法错
import { basename, dirname } from 'node:path';
import * as lib from './archive-lib.mjs';

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const wantSig = argv.includes('--sig');
const wantJson = argv.includes('--json');
if (!target) { console.error('用法: node scripts/archive-check.mjs <sessionId|转录文件路径> [--sig] [--json]'); process.exit(3); }

const file = await lib.locateTranscript(target);
if (!file) { console.error(`转录未找到: ${target}`); process.exit(2); }

let text = '';
try { text = await lib.decodeTranscript(file); } catch (e) { console.error('解码失败:', e.message); process.exit(2); }
const total = lib.countLines(text);
const mark = await lib.findMark(target);
const lastRow = mark && Number.isFinite(mark.lastRow) ? mark.lastRow : 0;
const hasDelta = total > lastRow;

if (wantJson) {
  const lines = text.split('\n').filter(Boolean);
  const signals = wantSig && hasDelta ? lib.recallSignals(lines, lastRow + 1) : [];
  console.log(JSON.stringify({
    sessionId: target,
    file,
    total,
    lastRow,
    hasDelta,
    done: !!mark?.done,
    silentMs: lib.pathConfig().silentMs,
    delta: hasDelta ? { from: lastRow + 1, to: total, count: total - lastRow } : null,
    signals,
  }, null, 2));
  process.exit(hasDelta ? 0 : 2);
}

console.log(`会话 ${target}`);
console.log(`转录 ${basename(dirname(file))} | 总行数 ${total} | 已归档行 ${lastRow}${mark ? (mark.done ? '（done 完成态）' : '') : ''}`);
if (total <= lastRow) { console.log('无新增行（无增量或 done）；done 将在行数增长后自动失效再触发'); process.exit(2); }
console.log(`增量范围: (${lastRow}, ${total}] — ${total - lastRow} 行待检测`);

if (wantSig) {
  const lines = text.split('\n').filter(Boolean);
  const hits = lib.recallSignals(lines, lastRow + 1);
  console.log(`\n信号召回（增量内 ${hits.length} 条命中，纯召回不写库）：`);
  hits.forEach((h) => console.log(`  ${h.row}: ${h.text}`));
}
process.exit(0);
