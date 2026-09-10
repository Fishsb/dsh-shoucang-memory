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
// v5.4 树状定位：section 支持路径（父/子/孙…），逐级定位；深层小节不存在自动分裂（###+），顶层 ## 须锚。
// 安全策略：先只读解析定位（不改 lines），若最深层缺 → 计算从最深已存在父往下需新建的层级链；
// 插入阶段统一在「最深层已存在小节的末尾」追加（保正文在子节前不被打乱）。
const pathParts = String(sectionArg).trim().split('/').map((s) => s.trim()).filter(Boolean);
if (!pathParts.length) { console.error('小节路径为空'); process.exit(2); }

const headingAt = (l) => (/^(#{2,6}) /.test(l) ? /^(#{2,6}) /.exec(l)[1].length : 0);
const cleanTitle = (l) => l.replace(/^#{2,6} /, '').trim();
const matches = (title, kw) => { const t = title.toLowerCase(); const k = kw.toLowerCase(); return t === k || t.includes(k) || k.includes(t); };

// 建标题行索引：[{line, level, title}]
const heads = [];
lines.forEach((l, i) => { const lv = headingAt(l); if (lv >= 2) heads.push({ line: i, level: lv, title: cleanTitle(l) }); });

// 在 heads 中找「parent 之后、level 层的 kw 标题」；parentIdx 为父标题在 heads 的下标（-1=文件级）
const findChild = (parentIdx, level, kw) => {
  const from = parentIdx < 0 ? 0 : parentIdx + 1;
  for (let i = from; i < heads.length; i++) {
    if (heads[i].level <= (parentIdx < 0 ? 1 : heads[parentIdx].level)) break; // 出父范围
    if (heads[i].level === level && matches(heads[i].title, kw)) return i;
  }
  return -1;
};

// 逐级下钻：维护「当前父标题下标」链
let parentIdx = -1; // 当前父级（在 heads 中的下标；-1=文件顶）
const anchored = []; // 已命中的各级 heads 下标（供定位最深层已存在节）；缺失层记负值 -(pi+1)
for (let pi = 0; pi < pathParts.length; pi++) {
  const level = 2 + pi;
  const hi = findChild(parentIdx, level, pathParts[pi]);
  if (hi === -1) {
    // 本层缺失：记录「从第 pi 层起需新建」，跳出
    anchored.push(-pi - 1); // 负标记：第 pi 层缺失
    break;
  }
  anchored.push(hi);
  parentIdx = hi;
}

let content;
if (isNewIndexLine) {
  // 主文档新条目行：追加文件尾（在 trailing 空行前）
  if (!/^\[(env|tool|flow|lesson|身份|环境|硬件|偏好|习惯|使命|边界|经验|演化|教训)\]/.test(entryText)) {
    console.error(`新索引行标签非法: ${entryText.slice(0, 30)}`); process.exit(2);
  }
  content = raw.replace(/\s+$/, '\n') + entryText + '\n';
} else {
  const bullet = entryText.replace(/^[-•]?\s*/, '- '); // 规范成列表项
  const lastAnchored = [...anchored].reverse().find((x) => x >= 0); // 最深层已存在节的 heads 下标（可能 -1=无顶层）
  const missingFrom = anchored.find((x) => x < 0); // 首个缺失层（负数，值为 -(pi+1)）
  const missingPi = missingFrom === undefined ? -1 : -missingFrom - 1; // 首个缺失层下标
  const bulletLines = []; // 需新增的子节标题行 + 内容行（自缺失层起逐级建）
  // 内容最终插入点 = 最深层已存在节的末尾（该节内容区尾部）
  if (lastAnchored === undefined || lastAnchored === -1) {
    // 顶层 ## 都不存在 → 报错要求锚（防散落大节）
    console.error(`顶层小节「${pathParts[0]}」不存在（顶层 ## 需人工建锚，不自动建散落大节）。可用小节：`);
    for (const h of heads) if (h.level === 2) console.error(`  - ${h.title}`);
    process.exit(2);
  }
  const lastHead = heads[lastAnchored];
  // 该节末尾 = 下一个同层或更高层标题 或 文件尾
  let secEnd = lines.length;
  for (let i = lastHead.line + 1; i < lines.length; i++) { const lv = headingAt(lines[i]); if (lv <= lastHead.level) { secEnd = i; break; } }
  // 剔除末尾空行（插入点在正文最后非空行后）
  while (secEnd > lastHead.line + 1 && !lines[secEnd - 1].trim()) secEnd--;
  // 若缺失层存在（需分裂）：从缺失层 pi 开始逐级建子节标题（内容放最深缺失层）
  let insertPos = secEnd;
  if (missingPi >= 0) {
    const padBase = lastHead.level; // 已存在最深节层级
    // 缺失层从 missingPi 开始：层标题 pad = # 数 = padBase + 1 + (pi - missingPi)
    const createAt = secEnd; // 分裂插在已存在节正文末尾后
    // 构建：最浅缺失层标题在最上？——按记忆惯例「父在浅、子在深」，分裂应自 missingPi 逐层嵌套：
    //   ### 子  \n (空行) \n #### 孙 \n (空行) \n - 内容
    const missingTitles = pathParts.slice(missingPi);
    const insBlocks = [];
    missingTitles.forEach((t, j) => {
      insBlocks.push('');
      insBlocks.push('#'.repeat(padBase + 1 + j) + ' ' + t);
      insBlocks.push('');
    });
    // 插入位置前补一个空行（与已存在正文分隔），后接内容
    bulletLines.push(...insBlocks, bullet);
    insertPos = createAt;
  } else {
    // 全命中：直接插最深节正文末尾
    bulletLines.push(bullet);
    insertPos = secEnd;
  }
  lines.splice(insertPos, 0, ...bulletLines);
  content = lines.join('\n');
}

// 容量门禁（主文档硬限；notes 不拦——全文件口径，同 write_gate）
// 2026-09-11：默认值与容量门同源（画像 AGENT/USER 3,000 · 记忆 MEMORY 5,000）；env SHOUCANG_CAP_* 可覆盖
//（蒸馏/深睡调用 memory-append 时由宿主注入 = scheduler.json 实时容量门，见 src/distill.ts capEnv()）
const CAP_ENV = {
  'MEMORY.md': Number(process.env.SHOUCANG_CAP_MEMORY) || 5000,
  'USER.md': Number(process.env.SHOUCANG_CAP_USER) || 3000,
  'AGENT.md': Number(process.env.SHOUCANG_CAP_AGENT) || 3000,
}
const LIMITS = { 'MEMORY.md': 5000, 'USER.md': 3000, 'AGENT.md': 3000, ...CAP_ENV }
if (isMain) {
  const chars = content.replace(/\s+/g, '').length;
  const limit = LIMITS[norm] ?? LIMITS['MEMORY.md'];
  if (chars > limit) { console.error(`exit=1 追加后超容量 ${chars}/${limit}（不写，需合并/下沉）`); process.exit(1); }
}

await writeFile(filePath, content, 'utf8');
console.log(`append ${norm} :: ${sectionArg}${isNewIndexLine ? ' [--new]' : ''} — ${entryText.slice(0, 60)}…（备份 ${bakDir}）`);
process.exit(0);
