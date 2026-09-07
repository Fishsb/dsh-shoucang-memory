#!/usr/bin/env node
// read_section.mjs — 按「内容锚（小节名）」定位读取笔记小节（无行号维护，DSH 环境，无依赖）
// 用法: node scripts/read_section.mjs notes/env.md "视觉方案"
// 行为: 输出目标小节（## 标题 至下一个 ## 之前）；小节不存在 → 列出全部小节并 exit 1
// 原则: 指针 § = 小节名 = 内容锚，与行号无关；内容增删不影响定位，仅重命名小节需同步索引
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = process.env.MEMORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..'); // 数据根（开发经 MEMORY_ROOT 指向私人区；缺省=脚本上一级兼容生产副本）
const [fileArg, sectionArg] = process.argv.slice(2);

if (!fileArg || !sectionArg) {
  console.error('用法: node scripts/read_section.mjs <notes/xxx.md> <小节名>');
  process.exit(3);
}

const filePath = isAbsolute(fileArg) ? fileArg : join(skillDir, fileArg);
const raw = await readFile(filePath, 'utf8').catch(() => null);
if (raw === null) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(4);
}

const lines = raw.split(/\r?\n/);
const hIdx = [];
lines.forEach((l, i) => { if (/^## /.test(l)) hIdx.push(i); });

const kw = String(sectionArg).trim().toLowerCase();
let start = -1;
for (const i of hIdx) {
  const title = lines[i].slice(3).toLowerCase();
  if (title === kw || title.includes(kw) || kw.includes(title)) { start = i; break; }
}

if (start === -1) {
  console.error(`小节「${sectionArg}」不存在。可用小节：`);
  for (const i of hIdx) console.error(`  - ${lines[i].slice(3)}`);
  process.exit(1);
}

const end = hIdx.find((i) => i > start) ?? lines.length;
process.stdout.write(lines.slice(start, end).join('\n') + '\n');
console.log(`\n# src: ${fileArg} :: ${lines[start].slice(3)}（${end - start} 行，行号${start + 1}-${end}，勿依赖行号定位）`);

// 访问记录（生命周期"检索命中"判据核验；失败静默不阻塞）
try {
  const auditDir = join(skillDir, 'audit');
  await mkdir(auditDir, { recursive: true });
  const entry = JSON.stringify({ t: new Date().toISOString(), f: fileArg, s: lines[start].slice(3).split('（')[0].trim() }) + '\n';
  await writeFile(join(auditDir, 'access.log'), entry, { flag: 'a' });
} catch { /* 记录失败不影响定位 */ }