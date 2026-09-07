#!/usr/bin/env node
// memory-append.mjs — 记忆追加写入（全自动固化层安全阀，ADR-0002 v2）
// 语义：只 append 不覆盖——定位既有小节，在该小节末插入条目；新条目行（MEMORY/USER/AGENT 索引）可 --new 追加文件尾。
// 安全网：① 写前备份 audit/backup-<ts>/ ② 小节不存在→exit 2（列出可选，不自动新建散落小节）
//        ③ 主文档容量硬限（追加后总量超限→exit 1 不写）④ 目标文件白名单（仅 notes/<7个> + MEMORY/USER/AGENT）
// 用法: node scripts/memory-append.mjs <MEMORY.md|USER.md|AGENT.md|notes/<file>.md> <小节名> <条目文本>
//       node scripts/memory-append.mjs <目标> <小节名> --new <索引行>     # 主文档新条目行（文件尾）
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = process.env.MEMORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..'); // 数据根（结构分离：开发经 MEMORY_ROOT 指向私人区；缺省=脚本上一级兼容生产副本）
const [fileArg, sectionArg, ...rest] = process.argv.slice(2);
const isNewIndexLine = rest.includes('--new');
const entryText = (isNewIndexLine ? rest.slice(rest.indexOf('--new') + 1) : rest).join(' ').trim();

if (!fileArg || !sectionArg || !entryText) {
  console.error('用法: node scripts/memory-append.mjs <目标> <小节名> <条目文本> | <MEMORY.md> <小节名> --new <索引行>');
  process.exit(3);
}

// 白名单：辅助文档仅 notes/ 七件；主文档仅三索引（防 LLM 落点乱写）
const NOTES = ['notes/env.md', 'notes/tools.md', 'notes/flows.md', 'notes/lessons.md', 'notes/release.md', 'notes/user.md', 'notes/agent.md', 'notes/INDEX.md'];
const MAIN = ['MEMORY.md', 'USER.md', 'AGENT.md'];
const norm = fileArg.replace(/\\/g, '/').replace(/^\.\//, '');
const isNotes = NOTES.includes(norm);
const isMain = MAIN.includes(norm);
if (!isNotes && !isMain) { console.error(`目标不在白名单: ${fileArg}（允许 ${MAIN.concat(NOTES).join(' / ')}）`); process.exit(2); }

const filePath = isAbsolute(fileArg) ? fileArg : join(skillDir, fileArg);
const raw = await readFile(filePath, 'utf8').catch(() => null);
if (raw === null) { console.error(`文件不存在: ${filePath}`); process.exit(4); }

// 备份（回滚安全网）
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bakDir = join(skillDir, 'audit', 'backup-' + ts.replace(/[-T:]/g, '').slice(0, 12));
try { await mkdir(bakDir, { recursive: true }); await copyFile(filePath, join(bakDir, norm.replace(/\//g, '_'))); } catch { /* 备份失败不阻塞（尽力） */ }

// 小节定位（复用 read_section 锚语义：title===kw || includes 双向）
const lines = raw.split(/\r?\n/);
const hIdx = [];
lines.forEach((l, i) => { if (/^## /.test(l)) hIdx.push(i); });
const kw = String(sectionArg).trim().toLowerCase();
let start = -1;
for (const i of hIdx) { const t = lines[i].slice(3).toLowerCase(); if (t === kw || t.includes(kw) || kw.includes(t)) { start = i; break; } }

let content;
if (isNewIndexLine) {
  // 主文档新条目行：追加文件尾（在 trailing 空行前）
  if (!/^\[(env|tool|flow|lesson|身份|环境|硬件|偏好|习惯|使命|边界|经验|演化|教训)\]/.test(entryText)) {
    console.error(`新索引行标签非法: ${entryText.slice(0, 30)}`); process.exit(2);
  }
  content = raw.replace(/\s+$/, '\n') + entryText + '\n';
} else {
  if (start === -1) {
    console.error(`小节「${sectionArg}」不存在（全自动固化不自动建散落小节，需先人工建锚）。可用小节：`);
    for (const i of hIdx) console.error(`  - ${lines[i].slice(3)}`);
    process.exit(2);
  }
  const end = hIdx.find((i) => i > start) ?? lines.length;
  const bullet = entryText.replace(/^[-•]?\s*/, '- '); // 规范成列表项
  // 插到小节末尾（end-1 若为空行则插其前），保持前后空行
  const insertAt = end > start + 1 && !lines[end - 1].trim() ? end - 1 : end;
  lines.splice(insertAt, 0, bullet);
  content = lines.join('\n');
}

// 容量门禁（主文档硬限；notes 不拦——全文件口径，同 write_gate）
const LIMITS = { 'MEMORY.md': 3000, 'USER.md': 2000, 'AGENT.md': 2000 };
if (isMain) {
  const chars = content.replace(/\s+/g, '').length;
  const limit = LIMITS[norm] ?? 3000;
  if (chars > limit) { console.error(`exit=1 追加后超容量 ${chars}/${limit}（不写，需合并/下沉）`); process.exit(1); }
}

await writeFile(filePath, content, 'utf8');
console.log(`append ${norm} :: ${sectionArg}${isNewIndexLine ? ' [--new]' : ''} — ${entryText.slice(0, 60)}…（备份 ${bakDir}）`);
process.exit(0);
