#!/usr/bin/env node
// memory_health_check.mjs — managing-memory 记忆体检脚本（DSH 环境，无依赖）v4
// 用法: node scripts/memory_health_check.mjs [技能目录] [--out <相对路径>]
//   缺省目录 = 脚本所在目录的上一级（自定位，不依赖 cwd）
//   --out audit\<日期>.md：把完整报告归档到技能目录（可观测性：审计轨迹可回溯）
// 适配纯索引格式：MEMORY/USER 按行解析（`[tag] 主题（日期）[溯源] → notes/x.md §小节`）
// v18（ACT-030）：索引文件的行分两类——索引行（`[tag] … → notes/…`）与**画像行**（`- … ← 源: …`，
//   写入口=蒸馏 profileUpdates / 深睡 profileOps）。画像行不参与索引行的标签/指针判定，但必须带 `← 源:`，
//   缺源=exit 5。原先只认索引行 ⇒ 画像行被误判「无标签+无指针」长期假红（实测 AGENT 1 + USER 3 条）。
// 退出码: 0=健康  2=任一文件容量>85%  3=存在重复条目  4=文件缺失  5=子文档/指针/格式问题
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const selfDir = dirname(fileURLToPath(import.meta.url)); // .../scripts
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const outFile = outIdx > -1 ? argv[outIdx + 1] : null;
const arg = argv.find((a, i) => !a.startsWith('--') && (outIdx === -1 || i !== outIdx + 1)); // 位置参数（技能目录）要跳过 --out 的值
const rawDir = arg ?? process.env.MEMORY_ROOT ?? join(selfDir, '..');
const skillDir = rawDir.replace(/[\\/]+$/, '').endsWith('scripts') ? join(rawDir.replace(/[\\/]+$/, ''), '..') : rawDir;

// 审计模式：捕获 stdout，末尾归档
const outLines = [];
if (outFile) {
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, enc, cb) => { outLines.push(String(chunk)); return origWrite(chunk, enc, cb); };
}

// 索引文件（主文档=会话注入面）：按行解析，标题行（#）与空行不算条目
// v9：容量红线只对主文档生效；详情子文档为按需读取层，不设硬限（超 NOTES_WARN 仅提示）
// v16：PRINCIPLES.md 独立层退役——习得原则 [原则] 行并入 AGENT.md，AGENT 容量 2,000→3,000
// v17：AGENT tags 增 '路径'——[路径] 通用任务路径行（对标 AWM，概要 ≤40 字）
const INDEX_FILES = [
  { name: 'MEMORY.md', limit: 5000, tags: ['env', 'tool', 'flow', 'lesson'] },
  { name: 'USER.md', limit: 3000, tags: ['身份', '环境', '硬件', '偏好', '习惯'] },
  { name: 'AGENT.md', limit: 3000, tags: ['身份', '使命', '边界', '偏好', '习惯', '经验', '演化', '教训', '原则', '路径'] },
];
// 详情子文档（注册表见 notes/INDEX.md；缺少任一 → exit 4）
const NOTES = ['env.md', 'tools.md', 'flows.md', 'lessons.md', 'release.md', 'user.md', 'agent.md'];
const NOTES_WARN = 8000; // 辅助文档高警戒提示线（不拦截，仅提示按需拆分）

let exitCode = 0;

// v16：PRINCIPLES.md 段移除（原则层退役）——习得原则随 AGENT.md 段体检（tags 含 '原则'）

function parseIndex(raw) {
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

for (const { name, limit, tags } of INDEX_FILES) {
  const p = join(skillDir, name);
  let raw;
  try {
    raw = await readFile(p, 'utf8');
  } catch {
    console.log(`[FAIL] ${name}: 文件不存在 (${p})`);
    exitCode = Math.max(exitCode, 4);
    continue;
  }

  const entries = parseIndex(raw);
  const chars = raw.replace(/\s/g, '').length;
  const pct = Math.min(100, Math.round((chars / limit) * 100));

  const seen = new Map();
  const duplicates = [];
  for (const e of entries) {
    const key = e.toLowerCase();
    if (seen.has(key)) duplicates.push(key);
    else seen.set(key, e);
  }
  // v18（ACT-030 修复）：画像行是**与索引行并列的第二类合法行**——写入口=蒸馏 profileUpdates
  //   （`- <文本> ← 源: distill <sid> <date>`）与深度睡眠 profileOps（`- <文本> ← 源: notes/x.md §小节`）。
  //   体检原先只认索引行格式 ⇒ 每条画像行都被误判「无标签 + 无指针」并置 exit 5（实测 AGENT 1 + USER 3）。
  //   现分离两类：画像行不参与索引行的标签/指针判定，但**必须带源标记**（`← 源:`），缺源仍 exit 5。
  //   判据「`- ` 前缀」与写门同源（memory_write_gate 只对 `^[` 行做索引行格式校验）⇒ 两处口径一致。
  const isProfileLine = (e) => /^-\s/.test(e);
  const noTag = entries.filter((e) => !isProfileLine(e) && !new RegExp(`^\\[(${tags.join('|')})\\]`).test(e));
  const noDate = []; // v11：日期移入 INDEX 元数据表
  const noOwner = []; // v11：溯源移入 INDEX 元数据表
  const noPointer = entries.filter((e) => !isProfileLine(e) && !/→\s*notes\/[A-Za-z0-9_-]+\.md/.test(e));
  const noSummary = entries.filter((e) => /→/.test(e) && !/·\s*\S+/.test(e)); // 有指针但缺概况段（v10 规范）
  const profiles = entries.filter(isProfileLine);
  const profileNoSrc = profiles.filter((e) => !/←\s*源:\s*\S/.test(e));

  console.log(`\n=== ${name} (${p}) ===`);
  console.log(`字符数: ${chars} / ${limit} (${pct}%)${pct > 85 ? ' ⚠️ 超85%需审计' : pct > 80 ? ' ⚠️ 超80%需合并' : ''}`);
  console.log(`索引条目数: ${entries.length}`);
  if (duplicates.length) { console.log(`重复条目: ${duplicates.length} 条 ❌`); exitCode = Math.max(exitCode, 3); }
  else console.log('重复条目: 0 ✅');
  console.log(`无标签: ${noTag.length} ${noTag.length ? '❌' : '✅'} | 无日期戳: ${noDate.length}（v11 移入元数据表） | 缺溯源: ${noOwner.length}（v11 移入元数据表）`);
  if (profiles.length) console.log(`画像行: ${profiles.length} 条（带源 ${profiles.length - profileNoSrc.length} / 缺源 ${profileNoSrc.length}）${profileNoSrc.length ? ' ❌' : ' ✅'}`);
  if (profileNoSrc.length) { console.log(`画像行缺源标记: ${profileNoSrc.length} 条 ❌（${profileNoSrc.map((e) => e.slice(0, 30)).join(' | ')}）——每条画像行须带 \`← 源:\``); exitCode = Math.max(exitCode, 5); }
  if (noPointer.length) { console.log(`无指针索引行: ${noPointer.length} 条 ❌（${noPointer.map((e) => e.slice(0, 30)).join(' | ')}）`); exitCode = Math.max(exitCode, 5); }
  if (noSummary.length) console.log(`缺概况段索引行: ${noSummary.length} 条 ⚠️（规范 v10，应含 · 概况短语）`);
  else console.log('指针完整性: 全部索引行带 → 指针 ✅');
  if (pct > 85) exitCode = Math.max(exitCode, 2);
}

// notes 子文档体检（注册 + 指针存在性；容量超 NOTES_WARN 仅提示，不拦截——v9）
console.log('\n=== notes/ 子文档 ===');
const notesDir = join(skillDir, 'notes');
try {
  const notes = await readdir(notesDir);
  for (const n of NOTES) {
    const p = join(notesDir, n);
    try {
      const raw = await readFile(p, 'utf8');
      const chars = raw.replace(/\s/g, '').length;
      const sections = (raw.match(/^#{2,3} /gm) || []).length; // ADR-015：## 大节 + ### 子节
      // v18：并列报「最大小节」——ADR-015 两级检索单元后，**单次跟读成本 = 小节体量**（非文件体量），
      // 故文件级警戒线必须与最大小节一起判读，否则「文件超 8000」会被误读成读取代价失控。
      const segs = raw.split(/^(?=#{2,3} )/m).filter((x) => /^#{2,3} /.test(x));
      const maxSec = segs.reduce((mx, x) => Math.max(mx, x.replace(/\s/g, '').length), 0);
      // v21（§8.1 分裂律）：超 R(1000) 的节 —— ## 按**子树**（含 ### 子节）判「该裂」；### 按**自身**判读取代价。
      // 只提示不 exit（R 是内容律不是硬门，与 NOTES_WARN 同策略；结构决策归模型，见 memory-core-model §2.7.2）。
      const R = 1000;
      const own = (blk) => blk.split('\n').slice(1).join('\n').replace(/\s/g, '').length;
      const title = (blk) => (blk.split('\n')[0] || '').trim().replace(/^#+\s*/, '').replace(/（[^）]*）$/, '').trim();
      const over = [];
      for (const blk of raw.split(/^(?=## )/m).filter((x) => /^## /.test(x))) {
        const s = own(blk);
        if (s > R) over.push(`§${title(blk)} ${s}`);
      }
      for (const blk of segs.filter((x) => /^### /.test(x))) {
        const s = own(blk);
        if (s > R) over.push(`§${title(blk)} ${s}`);
      }
      const overNote = over.length ? ` ⚠️ 超 R(${R}) 节 ${over.length} 个: ${over.slice(0, 4).join(' · ')}${over.length > 4 ? ' …' : ''}` : '';
      console.log(`${n}: ${chars} 字符 ${sections} 小节 最大小节 ${maxSec} 字 ${chars > NOTES_WARN ? `⚠️ 超 ${NOTES_WARN} 警戒线（按需拆分，不拦截；判读看最大小节）` : '✅'}${overNote}`);
    } catch {
      console.log(`[FAIL] notes/${n}: 缺失`);
      exitCode = Math.max(exitCode, 4);
    }
  }
  const indexRaw = await readFile(join(notesDir, 'INDEX.md'), 'utf8').catch(() => '');
  const unregistered = notes.filter((f) => /\.md$/.test(f) && !indexRaw.includes(f));
  if (unregistered.length) {
    console.log(`未登记 INDEX 子文档: ${unregistered.join(', ')} ❌`);
    exitCode = Math.max(exitCode, 5);
  }
  const dangling = [];
  for (const idx of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
    const idxRaw = await readFile(join(skillDir, idx), 'utf8').catch(() => '');
    for (const m of idxRaw.matchAll(/notes\/([A-Za-z0-9_-]+)\.md/g)) {
      if (!notes.includes(m[1] + '.md')) dangling.push(`${idx} → notes/${m[1]}.md 不存在`);
      else if (!indexRaw.includes(m[1] + '.md')) dangling.push(`${idx} → notes/${m[1]}.md 未注册`);
    }
  }
  if (dangling.length) { console.log(`指针悬空: ${dangling.join(', ')} ❌`); exitCode = Math.max(exitCode, 5); }
  else console.log('指针存在性: 全部通过 ✅');

  // G1 修复：索引主题 → 条目元数据表覆盖校验（v11 分离原则下的漂移兜底）
  const metaSec = (indexRaw.split('## 条目元数据表')[1] || '');
  if (metaSec) {
    const missMeta = [];
    for (const idx of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
      const idxRaw = await readFile(join(skillDir, idx), 'utf8').catch(() => '');
      for (const l of idxRaw.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))) {
        if (/^-\s/.test(l)) continue; // v18：画像行非「子文档主题」（自由文本，无 tag/主题结构），不参与覆盖校验
        const topic = l.replace(/^\[[^\]]+\]\s*/, '').split('·')[0].split('→')[0].trim().split(/[=：]/)[0].slice(0, 8);
        if (topic && !metaSec.includes(topic)) missMeta.push(`${idx}:${topic}`);
      }
    }
    if (missMeta.length) console.log(`未登记元数据表主题: ${missMeta.length} 条 ⚠️（${missMeta.slice(0, 3).join(' | ')}…）——移至 INDEX.md「条目元数据表」`);
    else console.log('元数据表覆盖: 索引主题全部登记 ✅');
  }
} catch {
  console.log('[FAIL] notes/ 目录不存在');
  exitCode = Math.max(exitCode, 4);
}

// G3 修复：archive-progress 失效 mark 提示（转录已不存在 → 建议清理）
try {
  const accRaw = await readFile(join(skillDir, 'audit', 'archive-progress.jsonl'), 'utf8').catch(() => '');
  const marks = accRaw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (marks.length) {
    let stale = 0;
    for (const m of marks) {
      if (typeof m.sessionId === 'string' && (m.sessionId.includes('\\') || m.sessionId.includes('/'))) continue; // 路径形式跳过
      const found = await readdir(join(os.homedir(), '.dsh', 'sessions'), { withFileTypes: true }).catch(() => []);
      // 浅层无法确定时按缺少会话目录计（简化：仅当明确找不到目录前缀）
      let ok = false;
      const walk = async (d, depth) => {
        if (ok || depth > 3) return;
        for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
          if (e.isDirectory()) { if (e.name === m.sessionId || e.name === 'session-' + m.sessionId) { ok = true; return; } await walk(join(d, e.name), depth + 1); }
        }
      };
      await walk(join(os.homedir(), '.dsh', 'sessions'), 0);
      if (!ok) stale++;
    }
    if (stale) console.log(`archive-progress 失效 mark: ${stale}/${marks.length} 条（转录已不存在）——建议清理 audit\\archive-progress.jsonl 对应行`);
    else console.log(`archive-progress 检查: ${marks.length} 条 mark 全部有效 ✅`);
  }
} catch { /* 无文件跳过 */ }

// pending/ 候选滞留提示（候选暂存通道，非权威记忆）
try {
  const pend = (await readdir(join(skillDir, 'pending'))).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  if (pend.length) console.log(`\npending/ 待评估候选: ${pend.length} 个（${pend.join(', ')}）——审计时四问评估后入册或删除`);
} catch { /* 无 pending 目录：跳过 */ }

// 候选统计段（供 --out 报告；含 pending 滞留 + access.log 命中 top，可观测/提升判据核验）
let candStats = '';
try {
  const pendDir = join(skillDir, 'pending');
  const pend = (await readdir(pendDir)).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const accRaw = await readFile(join(skillDir, 'audit', 'access.log'), 'utf8').catch(() => '');
  const lines = accRaw.split(/\r?\n/).filter(Boolean);
  const counts = {};
  for (const l of lines) {
    try { const o = JSON.parse(l); const k = `${o.f} §${o.s}`; counts[k] = (counts[k] || 0) + 1; } catch {}
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // 零召回清单（降级提纯候选；判据见 audit-protocol §5：连续 2 次审计零命中且非 env/release）
  const normCounts = {};
  for (const l of lines) {
    try { const o = JSON.parse(l); const k = `${String(o.f || '').replace(/^notes\//, '')} §${o.s}`; normCounts[k] = (normCounts[k] || 0) + 1; } catch {}
  }
  const zeroList = [];
  try {
    const notesDir = join(skillDir, 'notes');
    const files = (await readdir(notesDir)).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');
    for (const f of files) {
      const raw = await readFile(join(notesDir, f), 'utf8');
      for (const m of raw.matchAll(/^#{2,3} (.+)$/gm)) {
        const sec = m[1].replace(/（[^）]*）$/, '').trim();
        if (!counts[`${f} §${sec}`] && !normCounts[`${f} §${sec}`]) zeroList.push(`${f} §${sec}`);
      }
    }
  } catch { /* 无 notes 目录跳过 */ }
  candStats = `\n候选统计: pending 滞留 ${pend.length} 个 | access.log 命中 ${lines.length} 次${top.length ? '\n  top 主题: ' + top.map(([k, v]) => `${k}×${v}`).join(' · ') : ''}（近 5 次审计 ≥3 次 → 提升评估）${zeroList.length ? `\n  零召回主题 ${zeroList.length} 个: ${zeroList.slice(0, 8).join(' · ')}${zeroList.length > 8 ? ' …' : ''}（连续 2 次审计零命中且非 env/release → 提纯降级，见 audit-protocol §3/§5）` : ''}`;
} catch { candStats = ''; }

if (candStats) console.log(candStats);

// ═══ v2（ADR-122）新增：判据参数投影 + 注入 token 账 + 放置审计（只提示，不改变 exit 语义）═══
try {
  const gatePath = join(skillDir, 'engine', 'criteria-gate.json');
  let gate = null;
  try { gate = JSON.parse(await readFile(gatePath, 'utf8')); } catch { gate = null; }
  console.log(`\n判据参数源: ${gate ? `engine/criteria-gate.json（${gate.version}）` : '内建缺省（criteria-gate.json 未就位 → 常量散落风险）'}`);
  const capsEff = gate?.caps || {};
  const injectTokenEst = (chars) => Math.round(chars / 1.5); // 中英混排粗估（仅作预算监控，非精确计数）
  const budget = gate?.surface?.injection?.budgetChars ?? 3000;
  const capRows = gate?.surface?.injection?.levelCaps?.smart ?? 10; // smart 档注入行数（缺省 10）
  let totalChars = 0
  let injectChars = 0
  for (const { name } of INDEX_FILES) {
    try {
      const t = await readFile(join(skillDir, name), 'utf8');
      const lines = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      const chars = t.replace(/\s+/g, '').length;
      totalChars += chars;
      // 注入量口径：画像行（`- … ← 源:` 全量注入）+ 知识索引行按档位 cap 截断（其余靠指针懒加载，不进常驻面）
      const profileLines = lines.filter((l) => /←\s*源:/.test(l));
      const indexLines = lines.filter((l) => /^\[/.test(l));
      const taken = profileLines.length + Math.min(capRows, indexLines.length);
      const avg = indexLines.length ? indexLines.reduce((n, l) => n + l.replace(/\s+/g, '').length, 0) / indexLines.length : 0;
      const est = profileLines.reduce((n, l) => n + l.replace(/\s+/g, '').length, 0) + avg * Math.min(capRows, indexLines.length);
      injectChars += est;
      console.log(`  ${name}: 全档 ${chars} 字符（${lines.length} 行 · 取 ${taken} 行 → 估算注入 ${Math.round(est)} 字符 ≈ ${injectTokenEst(est)} token；容量门 ${capsEff[name] ?? '内建'}）`);
    } catch { /* 缺文件已由主流程报 */ }
  }
  console.log(`  注入面合计（估算）: ${Math.round(injectChars)} 字符 ≈ ${injectTokenEst(injectChars)} token（预算 ${budget} 字符 → 占比 ${(injectChars / budget * 100).toFixed(0)}%；全档体量 ${totalChars} 字符仅作参考）`);
  // 放置审计：每主档的行标签必须在本档允许标签集内（防止"画像行误入 MEMORY / env 类误入 AGENT"）
  const misplaced = [];
  for (const { name, tags } of INDEX_FILES) {
    try {
      const t = await readFile(join(skillDir, name), 'utf8');
      for (const l of t.split(/\r?\n/)) {
        const s = l.trim();
        const m = s.match(/^\[([^\]]+)\]/);
        if (!m) continue;
        if (!tags.includes(m[1])) misplaced.push(`${name}: [${m[1]}] ${s.slice(0, 30)}`);
      }
    } catch { /* 跳过 */ }
  }
  console.log(misplaced.length
    ? `  放置审计: ⚠️ ${misplaced.length} 行标签不在本档白名单内 —— ${misplaced.slice(0, 4).join(' | ')}${misplaced.length > 4 ? ' …' : ''}`
    : '  放置审计: 全部主档行标签在本档白名单内 ✅');
} catch { /* 附加检查失败不影响主流程 */ }

console.log(`\n退出码: ${exitCode} (0=健康 2=超85% 3=重复 4=缺失 5=子文档/指针/格式问题)`);

// 审计归档（可观测性）：--out 指定相对技能目录的路径
if (outFile) {
  await mkdir(join(skillDir, dirname(outFile)), { recursive: true }).catch(() => {});
  await writeFile(join(skillDir, outFile), outLines.join(''), 'utf8').catch((e) => console.error(`报告写入失败: ${e.message}`));
  console.log(`\n审计报告已归档: ${join(skillDir, outFile)}`);
}

process.exit(exitCode);