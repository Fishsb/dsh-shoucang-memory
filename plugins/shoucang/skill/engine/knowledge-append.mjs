#!/usr/bin/env node
// knowledge-append.mjs — 泛化知识写入安全阀（ADR-0005 阶段 1b，从 scripts/memory-append.mjs 泛化）
// 语义（与 memory-append 一致）：只 append 不覆盖；写前备份；小节不存在→exit 2 不自动建散落小节；
//        主文档容量硬限；目标白名单由 target-registry.json 参数化（memory / project 双库）。
// 新增（v2）：--registry <path> 指定注册表；--root <库根目录> 覆盖库根（project 库按项目指定）；
//        --project-card 落 route=project 卡（项目卡库未就绪时进 pending/，带 [route:project] 标记）。
// 新增（v3，借鉴 dsh-git-memory preview 流）：--dry-run 只校验+预览不落盘（无备份、无写入），
//        输出结构化预览（落点/小节/插入行/前后字符数/容量余量），供蒸馏裁决人工复核。
// 用法:
//   node knowledge-append.mjs <目标> <小节名> <条目文本> [--registry <path>] [--root <库根>] [--dry-run]
//   node knowledge-append.mjs <MEMORY.md> <小节名> --new <索引行>
//   node knowledge-append.mjs --project-card --title <标题> --card-type how-to|reference|decision --text <正文> [--source <溯源>] [--registry <path>] [--root <库根>]
// 退出码: 0=写入成功 1=超容量 2=白名单外/小节悬空/参数非法 3=用法错误 4=文件不存在
import { readFile, writeFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineDir = dirname(fileURLToPath(import.meta.url));

// ---- 参数解析 ----
const argv = process.argv.slice(2);
const getOpt = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null; };
const hasFlag = (name) => argv.includes(name);
const isProjectCard = hasFlag('--project-card');
const registryArg = getOpt('--registry');
const rootArg = getOpt('--root');
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--registry') && !(i > 0 && argv[i - 1] === '--root'));
const rest = argv.slice(argv.indexOf('--new') > -1 ? argv.indexOf('--new') + 1 : argv.length);

function usage() {
  console.error('用法: node knowledge-append.mjs <目标> <小节名> <条目文本> | <目标> <小节名> --new <索引行> | --project-card --title <标题> --card-type <how-to|reference|decision> --text <正文> [--source <溯源>] [--registry <path>] [--root <库根>] [--dry-run]');
  process.exit(3);
}
const dryRun = hasFlag('--dry-run');
if (isProjectCard) {
  if (!getOpt('--title') || !getOpt('--card-type') || !getOpt('--text')) usage();
} else if (positional.length < 2 || (positional.length < 3 && !hasFlag('--new'))) {
  usage();
}

// ---- 注册表解析（默认本 engine/target-registry.json）----
const registryPath = registryArg ? resolve(registryArg) : join(engineDir, 'target-registry.json');
const registryRaw = await readFile(registryPath, 'utf8').catch(() => { console.error(`注册表不可读: ${registryPath}`); process.exit(3); });
const registry = JSON.parse(registryRaw.replace(/^\uFEFF/, '')); // BOM 防御（pwsh Set-Content UTF8 带 BOM 坑）
const placeholders = {
  dshHome: process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '', '.dsh'),
  skillName: 'managing-memory',
  projectRoot: rootArg || '',
};
const expandRoot = (tpl, { exitOnFail = true } = {}) => {
  const out = tpl.replace(/<(\w+)>/g, (_, k) => {
    if (!(k in placeholders) || placeholders[k] === '') {
      if (exitOnFail) { console.error(`注册表 root 占位 <${k}> 无值（用 --root 指定）`); process.exit(3); }
      return null; // 探测模式：占位无值 → null（调用方判降级）
    }
    return placeholders[k];
  });
  return exitOnFail ? out : (out.includes(null) ? null : out);
};

function resolveTargetLib(fileArg) {
  // 判定目标库：project 卡显式；否则按 fileArg 形态匹配（notes/* 或主文档名在哪个库白名单）
  const norm = fileArg.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const [libId, lib] of Object.entries(registry.targets)) {
    const root = expandRoot(lib.root);
    const wl = lib.whitelist;
    const all = [...(wl.main || []), ...(wl.notes || [])];
    if (all.includes(norm)) return { libId, lib, root, norm };
    // notes/<file>.md 泛匹配（目标库 notes 子文档形态一致）
    if (/^notes\//.test(norm) && (wl.notes || []).some((n) => n === norm)) return { libId, lib, root, norm };
  }
  return null;
}

// ---- 备份（库根 audit/，主文档与 notes 一致）----
async function backup(filePath, relName, root) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bakDir = join(root, 'audit', 'backup-' + ts.replace(/[-T:]/g, '').slice(0, 12));
  try { await mkdir(bakDir, { recursive: true }); await copyFile(filePath, join(bakDir, relName.replace(/\//g, '_'))); return bakDir; } catch { return null; }
}

// ---- 小节定位（复用 read_section 锚语义）----
function locateSection(raw, sectionArg) {
  const lines = raw.split(/\r?\n/);
  const hIdx = [];
  lines.forEach((l, i) => { if (/^## /.test(l)) hIdx.push(i); });
  const kw = String(sectionArg).trim().toLowerCase();
  let start = -1;
  for (const i of hIdx) { const t = lines[i].slice(3).toLowerCase(); if (t === kw || t.includes(kw) || kw.includes(t)) { start = i; break; } }
  return { lines, hIdx, start };
}

// ---- 主路径 A：project 卡（route=project 宿主分流落点）----
if (isProjectCard) {
  // 项目库 root 不可解析（<projectRoot> 无 --root 值，单装记忆插件场景）→ 降级 memory 库 pending
  const proj = registry.targets.project || null;
  const mem = registry.targets.memory || null;
  let useLib = proj, projResolvable = false;
  if (proj) {
    projResolvable = expandRoot(proj.root, { exitOnFail: false }) !== null;
  }
  if (!projResolvable) useLib = mem;
  if (!useLib) { console.error('注册表既无可解析 project 也无 memory 库，project 卡无处可落'); process.exit(2); }
  const root = expandRoot(useLib.root);
  const pendDir = join(root, useLib.pendingDir || 'pending');
  const libTag = (proj && projResolvable) ? 'project' : 'memory-pending';
  const cardType = getOpt('--card-type');
  if (!['how-to', 'reference', 'decision'].includes(cardType)) { console.error(`card-type 非法: ${cardType}（how-to|reference|decision）`); process.exit(2); }
  const title = getOpt('--title');
  const text = getOpt('--text');
  const source = getOpt('--source') || '';
  await mkdir(pendDir, { recursive: true });
  const slug = title.replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 30) || 'card';
  const date = new Date().toISOString().slice(0, 10);
  const file = join(pendDir, `${date}-proj-${cardType}-${slug}.md`);
  const body = [
    `# [route:project] ${cardType} · ${title}`,
    '',
    `- 卡类型：${cardType}`,
    source ? `- 溯源：${source}` : null,
    `- 源会话：${process.env.DSH_SESSION_ID || 'unknown'}`,
    (proj && projResolvable)
      ? `- 落点：项目卡库 ${root}（就绪后由 pending 迁移）`
      : `- 落点：项目卡库未就绪 → 记忆库 pending 暂存（[route:project] 标记，pmg devref 就绪后迁移；不进记忆 notes/注入面）`,
    '',
    text,
    '',
  ].filter((l) => l !== null).join('\n');
  if (dryRun) {
    console.log(`[dry-run] project-card 将落 ${libTag} pending: ${file}（${cardType} · ${title}）`);
    console.log('--- 预览内容 ---');
    console.log(body.trimEnd());
    console.log('--- 未写入任何文件 ---');
    process.exit(0);
  }
  await writeFile(file, body, 'utf8');
  console.log(`project-card 落 ${libTag} pending: ${file}（${cardType} · ${title}）`);
  process.exit(0);
}

// ---- 主路径 B：记忆/项目库白名单写入（memory-append 语义不变）----
const [fileArg, sectionArg] = positional;
const entryText = (hasFlag('--new') ? rest : positional.slice(2)).join(' ').trim();
const hit = resolveTargetLib(fileArg);
if (!hit) { console.error(`目标不在注册表白名单: ${fileArg}（registry=${registryPath}）`); process.exit(2); }
const { libId, lib, root, norm } = hit;
const filePath = isAbsolute(fileArg) ? fileArg : join(root, norm);
const raw = await readFile(filePath, 'utf8').catch(() => { console.error(`文件不存在: ${filePath}`); process.exit(4); });

const { lines, hIdx, start } = locateSection(raw, sectionArg);
let content;
if (hasFlag('--new')) {
  if (!/^\[(env|tool|flow|lesson|身份|环境|硬件|偏好|习惯|使命|边界|经验|演化|教训)\]/.test(entryText)) {
    console.error(`新索引行标签非法: ${entryText.slice(0, 30)}`); process.exit(2);
  }
  content = raw.replace(/\s+$/, '\n') + entryText + '\n';
} else {
  if (start === -1) {
    console.error(`小节「${sectionArg}」不存在（不自动建散落小节，需先建锚）。可用小节：`);
    for (const i of hIdx) console.error(`  - ${lines[i].slice(3)}`);
    process.exit(2);
  }
  const end = hIdx.find((i) => i > start) ?? lines.length;
  const bullet = entryText.replace(/^[-•]?\s*/, '- ');
  const insertAt = end > start + 1 && !lines[end - 1].trim() ? end - 1 : end;
  lines.splice(insertAt, 0, bullet);
  content = lines.join('\n');
}

const caps = lib.capacity || {};
if (lib.capacity && caps[norm]) {
  const chars = content.replace(/\s+/g, '').length;
  if (chars > caps[norm]) { console.error(`exit=1 追加后超容量 ${chars}/${caps[norm]}（不写，需合并/下沉）`); process.exit(1); }
}

if (dryRun) {
  const charsBefore = raw.replace(/\s+/g, '').length;
  const charsAfter = content.replace(/\s+/g, '').length;
  const newLines = content !== raw ? content.split(/\r?\n/).filter((l) => !raw.split(/\r?\n/).includes(l)) : [];
  console.log(`[dry-run] append[${libId}] ${norm} :: ${sectionArg}${hasFlag('--new') ? ' [--new]' : ''}`);
  console.log(`  落点: ${filePath}`);
  console.log(`  字符数: ${charsBefore} → ${charsAfter}${caps[norm] ? `（容量上限 ${caps[norm]}，余量 ${caps[norm] - charsAfter}）` : '（无容量门禁）'}`);
  if (newLines.length) {
    console.log('  将插入:');
    for (const l of newLines) console.log(`    + ${l}`);
  } else {
    console.log('  内容无变化（不写入）');
  }
  console.log('  未写入任何文件、未生成备份');
  process.exit(0);
}

const bak = await backup(filePath, norm, root);
await writeFile(filePath, content, 'utf8');
console.log(`append[${libId}] ${norm} :: ${sectionArg}${hasFlag('--new') ? ' [--new]' : ''} — ${entryText.slice(0, 60)}…${bak ? `（备份 ${bak}）` : ''}`);
process.exit(0);
