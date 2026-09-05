#!/usr/bin/env node
/*
 * gen-default-project.mjs — 生成「默认项目资料」（目录结构 + _index.md 规则模板）
 * 作用：切换根目录时，宿主按此资料自动构建新 vault 的目录骨架与 _index.md 规范（只补缺失）。
 * 用法：node scripts/gen-default-project.mjs [vaultRoot]  （缺省取 env SHOUCANG_VAULT）
 * 输出：plugins/shoucang-panel/default-project.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || process.env.SHOUCANG_VAULT || '';
if (!ROOT || !existsSync(ROOT)) {
  console.log('生成器跳过：未提供 vault 根（用法: node scripts/gen-default-project.mjs <vaultRoot> 或设置 SHOUCANG_VAULT）；保留已提交的 default-project.json');
  process.exit(0);
}

// 当前正式目录结构（含子目录）
const STRUCTURE = {
  画像: { 我: {}, 你: {} },
  记忆: { 日记忆: {}, 参考: {}, 工具: {}, 规则: {}, 环境: {}, 配置: {} },
  笔记: {},
  归档: {},
};

function specBlock(rel) {
  const f = join(ROOT, rel, '_index.md');
  if (!existsSync(f)) return '';
  const t = readFileSync(f, 'utf8');
  const i = t.search(/\n## 目录文件规范/);
  return i === -1 ? '' : t.slice(i).trim();
}

function subdirSection(rel, children) {
  const f = join(ROOT, rel, '_index.md');
  let existing = '';
  if (existsSync(f)) {
    const t = readFileSync(f, 'utf8');
    const m = t.match(/\n## 子目录\n([\s\S]*?)(?=\n## |$)/);
    if (m) existing = m[1].trim();
  }
  if (existing) return ['## 子目录', '', existing, ''].join('\n');
  const names = Object.keys(children);
  if (!names.length) return '';
  return ['## 子目录', '', ...names.map((n) => `- [[${n}]]`), ''].join('\n');
}

function template(rel, name, children) {
  const today = new Date().toISOString().slice(0, 10);
  const block = specBlock(rel);
  const lines = [
    '---',
    'type: index',
    `title: "${name} 指针表"`,
    `updated: ${today}`,
    '---',
    '',
    `# ${name}`,
    '',
    '| 条目 | 摘要 | 链接 |',
    '| --- | --- | --- |',
    '',
  ];
  const subs = subdirSection(rel, children);
  if (subs) lines.push(subs);
  if (block) lines.push(block);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

const index_templates = {};
const walk = (tree, prefix) => {
  for (const [name, children] of Object.entries(tree)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    index_templates[rel] = template(rel, name, children);
    walk(children, rel);
  }
};
walk(STRUCTURE, '');

const out = {
  purpose: '守藏默认项目资料：切换根目录时按此构建目录骨架与 _index.md 规范（幂等，只补缺失）',
  version: '2026-08-27',
  structure: STRUCTURE,
  index_templates,
  note: 'index_templates 中的「目录文件规范」块来自当前 vault 各目录 _index.md（网络检索定稿版）',
};
const dest = join(__dirname, '..', 'default-project.json');
writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');
console.log(`已生成 ${dest}`);
console.log(`目录模板数: ${Object.keys(index_templates).length}`);