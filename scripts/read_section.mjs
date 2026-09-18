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
// ADR-015：两级检索单元（## 大节 + ### 子节）。读取终点 = 下一个**同级或更高级**标题：
// 读 ### 子节止于下一个 ##/###；读 ## 大节仍止于下一个 ##（保持既有行为，向后兼容）。
// S1R（2026-09-19）：**标题解析与匹配口径收敛到 `section-ref.mjs`（单一语义）**——
//   本件原先自己实现「双向包含 + 取首个命中」，与写门（集合去重）、材料侧（多命中⇒null）口径分叉
//   ⇒ 同一指针三种结论。现由三态寻址统一：exists / ambiguous / missing。
//   歧义处置（用户拍板 D-Q1a）：**返回首个候选正文 + 顶部横幅列出其余候选**（保可用性、不静默）；
//   环境变量 `SHOUCANG_SECTION_STRICT=1` ⇒ 歧义即拒（exit 2，要求写父/子全路径消歧）。
import { resolveSection, resolveSectionSpec } from './section-ref.mjs';

const heads = [];
lines.forEach((l, i) => { const m = l.match(/^(#{2,3})[ \t]+(.*)$/); if (m) heads.push({ i, lvl: m[1].length, title: m[2].trim() }); });

// `§父/子` 路径：逐段解析，取**最深的可解析段**（段序越靠后越具体）；
// 无路径分隔符时等价于单段（既有用法）。
const specParts = String(sectionArg).split('/').map((s) => s.replace(/^§/, '').trim()).filter(Boolean);
let resolved = null;
for (let k = specParts.length - 1; k >= 0; k--) {
  const r = resolveSection(skillDir, fileArg, specParts[k]);
  if (r.state !== 'missing') { resolved = { name: specParts[k], res: r }; break; }
}
const strict = process.env.SHOUCANG_SECTION_STRICT === '1';

if (!resolved) {
  const full = resolveSectionSpec(skillDir, fileArg, sectionArg);
  const why = full.parts.length && full.parts.every((p) => !p.res.fileExists) ? '（目标文件不存在）' : '';
  console.error(`小节「${sectionArg}」不存在${why}。可用小节：`);
  for (const h of heads) console.error(`  - ${h.title}`);
  process.exit(1);
}
if (resolved.res.state === 'ambiguous' && strict) {
  console.error(`小节「${resolved.name}」有 ${resolved.res.cands.length} 个同名候选（strict：拒读，请写父/子全路径消歧）：`);
  for (const c of resolved.res.cands) console.error(`  - ${'#'.repeat(c.level)} ${c.title}`);
  process.exit(2);
}

const start = resolved.res.cands[0].idx;
const hitLvl = (lines[start].match(/^(#+)/) || ['', '##'])[1].length;
const end = (heads.find((h) => h.i > start && h.lvl <= hitLvl) || { i: lines.length }).i;

// 歧义横幅（非 strict）：显式列出其它候选，避免"读到哪个全凭运气"却看不出来
if (resolved.res.state === 'ambiguous') {
  const others = resolved.res.cands.slice(1);
  console.error(`# ⚠ 「${resolved.name}」有 ${resolved.res.cands.length} 个同名/近似候选，本次返回第 1 个（${'#'.repeat(hitLvl)} ${lines[start].replace(/^#+[ \t]*/, '').trim()}）；`
    + `其余：${others.map((c) => `${'#'.repeat(c.level)} ${c.title}`).join(' · ')}（要消歧请写「父/子」全路径）`);
}
// v8（认知对照 P1「降权贯穿三通道」）：冷节标记 —— 该 § 在 activity.jsonl 里为 cold 时**只加提示、不改内容**
//   判因：v7 的 coldFactor 只作用于向量召回；grep/read_section 兜底路径与注入面此前**完全不感知冷热**，
//   故「下调」实际只生效三分之一。此处补兜底通道的提示（内容仍完整返回，可读性不受损）。
let coldNote = '';
try {
  const title = lines[start].replace(/^#+\s*/, '').trim();
  const core = title.replace(/\s*[（(]\s*20\d{2}[^）)]*[）)]\s*$/, '').trim().toLowerCase();
  const base = fileArg.replace(/^notes\//, '').replace(/\.md$/, '');
  const ar = await readFile(join(skillDir, 'audit', 'activity.jsonl'), 'utf8').catch(() => '');
  for (const l of String(ar).split(/\r?\n/)) {
    if (!l.trim()) continue;
    try {
      const o = JSON.parse(l);
      const of = String(o.f || '').replace(/^notes\//, '').replace(/\.md$/, '');
      const os = String(o.s || '').trim().toLowerCase();
      if (of !== base) continue;
      if (!(os === core || os.includes(core) || core.includes(os))) continue;
      if (o.status === 'cold') {
        coldNote = o.retired
          ? '# ⚠️ 该节已 retired（人工 supersede/merged/archived/removed）——内容保留、不占注入/召回优先'
          : `# ⚠️ 该节已冷（历史命中 ${o.hits || 0} 次，近 90 天零命中）——内容保留；再命中一次即回温`;
      }
      break;
    } catch { /* 坏行跳过 */ }
  }
} catch { /* 无 activity 文件 = 不标记 */ }

process.stdout.write(lines.slice(start, end).join('\n') + '\n');
if (coldNote) process.stdout.write(coldNote + '\n');
console.log(`\n# src: ${fileArg} :: ${lines[start].replace(/^#+\s*/, '')}（${end - start} 行，行号${start + 1}-${end}，勿依赖行号定位）`);

// 访问记录（生命周期"检索命中"判据核验；失败静默不阻塞）
try {
  const auditDir = join(skillDir, 'audit');
  await mkdir(auditDir, { recursive: true });
  const entry = JSON.stringify({ t: new Date().toISOString(), f: fileArg, s: lines[start].slice(3).split('（')[0].trim() }) + '\n';
  await writeFile(join(auditDir, 'access.log'), entry, { flag: 'a' });
} catch { /* 记录失败不影响定位 */ }