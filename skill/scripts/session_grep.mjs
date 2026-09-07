#!/usr/bin/env node
// session_grep.mjs — 会话回忆（Episodic）检索（DSH 环境，无依赖）
// 用法: node scripts/session_grep.mjs <关键词> [--max N] [--dir <明文目录>]
// 说明: 完整会话转录存于 ~/.dsh/sessions/**（zstd 压缩，不可直接 grep）；
//       本脚本检索明文会话记录 ~/.dsh/memory/conversations/*.jsonl（逐行匹配）。
// 输出: 匹配的 文件:行号: 内容片段（默认前 160 字符，--max 控制条数）
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const keyword = args.find((a) => !a.startsWith('--'));
const max = Number(args[args.indexOf('--max') + 1] ?? 20);
const convDir = process.argv.includes('--dir') ? args[args.indexOf('--dir') + 1] : join(os.homedir(), '.dsh', 'memory', 'conversations');

if (!keyword) {
  console.error('用法: node session_grep.mjs <关键词> [--max N] [--dir <明文目录>]');
  process.exit(3);
}

let files = [];
try { files = (await readdir(convDir)).filter((f) => f.endsWith('.jsonl')); } catch { files = []; }

if (!files.length) {
  console.error(`明文会话目录无可用文件: ${convDir}`);
  console.error('提示：完整会话转录在 ~/.dsh/sessions/**（zstd 压缩），需解压（如 fzstd）后再 grep，勿直接对 .zstd 文件 grep。');
  process.exit(1);
}

const rx = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
let hits = 0;
for (const f of files) {
  if (hits >= max) break;
  const p = join(convDir, f);
  const raw = await readFile(p, 'utf8').catch(() => '');
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length && hits < max; i++) {
    if (rx.test(lines[i])) {
      hits++;
      const frag = lines[i].slice(0, 160);
      console.log(`${f}:${i + 1}: ${frag}`);
    }
  }
}
console.log(`\n共 ${hits} 条匹配（目录: ${convDir}；完整转录 zstd 需解压后检索）`);
process.exit(hits ? 0 : 1);