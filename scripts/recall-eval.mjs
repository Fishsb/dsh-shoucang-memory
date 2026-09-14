#!/usr/bin/env node
// recall-eval.mjs — 记忆「注入 / 召回」效果评测器（只读；MCL 方案 P0 观测面）
//
// 为什么需要它：实测发现「记忆材料在场、认知动作不在」——横幅内容被取用率高，而 agent 自发召回近零。
// 要判断后续改动（注入相关性化 / 双通道门禁 / 粒度治理）是否真的有效，必须先有**可复现的口径**。
//
// 四项口径（全部只读转录，不触碰记忆库）：
//   ① 横幅取用：索引行**主题词**出现在 assistant 内容（reasoning/text）中 —— 出现即「被取用」
//      （横幅注入在系统侧，不会出现在 assistant 内容里，故命中≠恰好存在）
//      按来源分列：AGENT/USER = 画像行；MEMORY = 知识索引行
//   ② 专用召回工具：tool/call name === shoucang_recall
//   ③ 指针跟读：read/grep/glob/pwsh 的参数命中记忆库 notes/*.md
//   ④ 主档直读：参数命中记忆库 MEMORY.md / USER.md / AGENT.md
//
// 用法:
//   node scripts/recall-eval.mjs [--n 20] [--exclude sid1,sid2] [--sessions <dir>] [--json] [--out <file>]
//   node scripts/recall-eval.mjs --since 2026-09-01 --n 50      # 固定窗口下界（绝对日期或 12h/3d/2w）
//   node scripts/recall-eval.mjs --sids <sid8,...>              # 固定样本（按会话白名单，A/B 对比用）
//   --exclude 用于剔除审计会话（自身会把三项计数顶高，污染基线）
//   ⚠ 基线纪律（2026-09-11 审查）：不固定窗口时，每次跑取的都是「**当时**最新的 N 个会话」——
//     两次跑可差 2–8 倍（实测 260 轮 vs 212 轮）。要对比基线（A/B、P3 验收）必须固定 --since / --sids。
// 路径全部派生（ARCHIVE_SESSIONS / MEMORY_ROOT / ~/.dsh），脚本内无本机硬编码。
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import * as lib from './archive-lib.mjs';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const N = Number(argOf('--n', '20'));
const EXCLUDE = new Set(argOf('--exclude', '').split(',').map((s) => s.trim()).filter(Boolean));
const AS_JSON = argv.includes('--json');
// 采样窗口固定（2026-09-11 审查修复）：--since 下界（绝对日期或 12h/3d/2w）+ --sids 样本白名单。
const SINCE = argOf('--since', '').trim();
const SIDS = new Set(argOf('--sids', '').split(',').map((s) => s.trim()).filter(Boolean));
const sinceMs = (() => {
  if (!SINCE) return 0;
  const rel = /^(\d+)([hdw])$/.exec(SINCE);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2] === 'h' ? 3600e3 : rel[2] === 'd' ? 86400e3 : 7 * 86400e3;
    return Date.now() - n * unit;
  }
  const t = Date.parse(SINCE);
  return Number.isFinite(t) ? t : 0;
})();

const sessionsRoot = argOf('--sessions', lib.pathConfig().sessionsRoot);
// 记忆库根（索引所在处）：--bank > MEMORY_ROOT > rootDir（技能副本） > ~/.dsh/skills/managing-memory（生产库）
// 末项与 candidate_grep 推导 ~/.dsh/sessions 同法（家目录相对，非本机盘符硬编码）。
const bank = argOf('--bank',
  process.env.MEMORY_ROOT
  || (existsSync(join(lib.rootDir, 'MEMORY.md')) ? lib.rootDir : join(homedir(), '.dsh', 'skills', 'managing-memory')));
const BANK_RE = /managing-memory/i;
// 「是否访问本记忆库」按 **bank 路径**判定（评测器已知道 bank）；字面名仅作兜底，以便夹具容器也能被测。
// 注意：tool/call 的 arguments 是 JSON 串，路径里的分隔符是**双反斜杠**（目录转义），
// 故须先归一转义再比较，否则 args.includes(bank) 永远为 false（本仓 test.mjs 的夹具用例即据此抓出）。
const hitBank = (args) => args.includes(bank) || args.replace(/\\\\/g, '\\').includes(bank) || BANK_RE.test(args);

// 探针词：从索引行派生（`[tag] 主题 · 概况 → …` 里的「主题」），避免硬编码词表过期。
// 分列画像行（AGENT/USER）与知识索引行（MEMORY），以便区分「哪一半在生效」。
function probes(name) {
  const p = join(bank, name);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^\[.+\]/.test(l))
    .map((l) => (l.replace(/^\[[^\]]+\]\s*/, '').split('·')[0] || '').trim())
    .filter((t) => t.length >= 3 && t.length <= 20);
}
const PROFILE = [...probes('AGENT.md'), ...probes('USER.md')];
const KNOWLEDGE = probes('MEMORY.md');
// 探针为空 ⇒ 口径①会静默恒 0，与「真的没被取用」不可区分 —— 必须显式失败，避免假零值骗过基线。
if (!PROFILE.length && !KNOWLEDGE.length) {
  console.error(`未在记忆库找到索引文件（bank=${bank}）；请用 --bank <记忆库根> 或设 MEMORY_ROOT。\n` +
    '（此处必须报错而非返回 0：探针为空时口径①恒 0，与「未取用」无法区分。）');
  process.exit(2);
}
const NOTES_RE = /notes[\\/]{1,2}([A-Za-z0-9_.-]+\.md)/g;
const MAIN_RE = /(?:^|[\\/\s"'])(MEMORY|USER|AGENT)\.md/g;

async function walk(dir, acc = []) {
  let ents = [];
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name.endsWith('.zstd') || e.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}

const all = await walk(sessionsRoot);
const withStat = [];
for (const p of all) withStat.push({ p, mtime: (await stat(p)).mtimeMs });
withStat.sort((a, b) => b.mtime - a.mtime);

const rows = [];
const totals = { turns: 0, profileHit: 0, knowledgeHit: 0, recallTool: 0, recallZero: 0, follow: 0, mainRead: 0, sessions: 0, excluded: 0 };
// v2.2：自查会话自动剔除（本仓=记忆系统本体）
const EXCLUDE_SELF = argv.includes('--exclude-self');
// **保守**缺省：只剔"明显是记忆系统本体开发"的会话（自查词出现次数 ≥300）——阈值可调，剔除清单会打印**供人工过目**
// （宁少剔勿多剔：剔除即丢数据，符合「数据先问」；要精确控制请用 --exclude/--sids）
const SELF_HITS = Number(argOf('--self-hits', '300')) || 300;
const SELF_WORDS = ['守藏', '记忆库', 'recall-eval', '深睡', '蒸馏', 'judgement-ledger', 'memory-reconcile', 'carriers', '判据注册表', 'shadow-sim'];
const selfExcluded = [];

for (const { p, mtime } of withStat) {
  if (rows.length >= N) break;
  const sid = lib.normalizeSid(p.split(/[\\/]/).filter((x) => x.startsWith('session-')).pop()?.replace(/^session-/, '') || '');
  if (sinceMs && mtime < sinceMs) continue; // 窗口下界：早于该时刻的会话不纳入（固定基线）
  if (SIDS.size && !SIDS.has(sid) && !SIDS.has(sid.slice(0, 8))) continue; // 固定样本白名单
  if (EXCLUDE.has(sid) || EXCLUDE.has(sid.slice(0, 8))) { totals.excluded++; continue; }
  let txt;
  try { txt = await lib.decodeTranscript(p); } catch { continue; }
  // v2.2：`--exclude-self` —— 自动剔除**自查会话**（本仓=记忆系统本体，自查会顶高 ①② 口径）。
  //   判据：会话文本里自查词命中 ≥ `--self-hits`（缺省 6）⇒ 视为自查，剔除并在结尾列名。
  if (EXCLUDE_SELF) {
    let selfHits = 0;
    for (const w of SELF_WORDS) selfHits += txt.split(w).length - 1; // 按**出现次数**计（词是否出现太粗：单次出现不代表自查会话）
    if (selfHits >= SELF_HITS) { totals.excluded++; selfExcluded.push(`${sid.slice(0, 8)}(${selfHits})`); continue; }
  }
  const r = { sid: sid.slice(0, 8), when: new Date(mtime).toISOString().slice(5, 16).replace('T', ' '), turns: 0, profileHit: 0, knowledgeHit: 0, recallTool: 0, recallZero: 0, follow: 0, mainRead: 0, targets: {} };
  let lastRecallCall = false;
  for (const line of txt.split('\n')) {
    if (!line.includes('"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === 'user/message') { r.turns++; continue; }
    if (o.type === 'assistant/message') {
      const c = o.data?.message?.content || [];
      const s = c.filter((b) => b.type === 'reasoning' || b.type === 'text').map((b) => b.text).join('\n');
      if (!s) continue;
      for (const t of PROFILE) if (s.includes(t)) r.profileHit++;
      for (const t of KNOWLEDGE) if (s.includes(t)) r.knowledgeHit++;
      continue;
    }
    // v2.2：**零命中列** —— 召回调用后若结果文本显示"命中 0 条 / 未命中 / 无命中"，计一次零命中
    if (lastRecallCall && o.type === 'tool/result') {
      const body = JSON.stringify(o.data || {});
      if (/命中\s*0\s*条|未命中|无命中|no-hit|zero-hit/.test(body)) r.recallZero++;
      lastRecallCall = false;
    }
    if (o.type !== 'tool/call') continue;
    const name = o.data?.name || '';
    if (name === 'shoucang_recall') { r.recallTool++; lastRecallCall = true; continue; }
    if (!/^(read|grep|glob|pwsh)$/.test(name)) continue;
    const args = String(o.data?.arguments || '');
    if (!hitBank(args)) continue;
    let m;
    NOTES_RE.lastIndex = 0;
    while ((m = NOTES_RE.exec(args))) { r.follow++; r.targets[m[1]] = (r.targets[m[1]] || 0) + 1; }
    MAIN_RE.lastIndex = 0;
    while (MAIN_RE.exec(args)) r.mainRead++;
  }
  rows.push(r);
  totals.turns += r.turns; totals.profileHit += r.profileHit; totals.knowledgeHit += r.knowledgeHit;
  totals.recallTool += r.recallTool; totals.recallZero += r.recallZero; totals.follow += r.follow; totals.mainRead += r.mainRead;
  totals.sessions++;
}

// v2.2：`--out <file>` 让基线成为**一等产物**（可存档、可跨次逐字对比；此前只有 --json 打到 stdout）
const OUT = argOf('--out', '');
const payload = { at: new Date().toISOString(), window: { n: N, since: SINCE || null, sinceMs: sinceMs || null, sids: [...SIDS] }, totals, rows, probes: { profile: PROFILE, knowledge: KNOWLEDGE } }
if (OUT) {
  try {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { dirname: dn } = await import('node:path')
    mkdirSync(dn(OUT), { recursive: true })
    writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
    console.log(`已写出基线 ${OUT}`)
  } catch (e) { console.error(`基线写出失败: ${e.message}`) }
}
if (AS_JSON) { console.log(JSON.stringify(payload, null, 2)); process.exit(0) }
if (!rows.length) { console.error(`未发现会话（sessionsRoot=${sessionsRoot}）；可用 --sessions 指定。`); process.exit(1); }

const per100 = (v) => totals.turns ? (100 * v / totals.turns).toFixed(1) : '0.0';
console.log(`记忆库根: ${bank}\n会话根: ${sessionsRoot}\n采样窗口: 最新 ${N} 个${SINCE ? ` · since=${SINCE}` : ''}${SIDS.size ? ` · sids=${[...SIDS].join(',')}` : ''}${!SINCE && !SIDS.size ? '（⚠ 未固定窗口：跨次对比不可复现，请加 --since/--sids）' : ''}\n探针: 画像行 ${PROFILE.length} 词 / 知识索引行 ${KNOWLEDGE.length} 词\n`);
console.log('会话      时间(UTC)   轮数  画像取用  知识取用  召回工具  零命中  跟读  主档读');
for (const r of rows) console.log(`${r.sid.padEnd(10)}${r.when.padEnd(12)}${String(r.turns).padStart(5)}${String(r.profileHit).padStart(10)}${String(r.knowledgeHit).padStart(10)}${String(r.recallTool).padStart(10)}${String(r.recallZero).padStart(8)}${String(r.follow).padStart(6)}${String(r.mainRead).padStart(8)}`);
console.log(`\n=== 合计（${totals.sessions} 会话 / ${totals.turns} 轮${totals.excluded ? `；已排除 ${totals.excluded} 个` : ''}）===`);
console.log(`  ① 横幅取用: 画像行 ${totals.profileHit} · 知识索引行 ${totals.knowledgeHit}（合计 ${totals.profileHit + totals.knowledgeHit}）`);
console.log(`  ② shoucang_recall: ${totals.recallTool}`);
console.log(`  ⑤ 召回零命中: ${totals.recallZero}（占召回调用 ${totals.recallTool ? ((totals.recallZero / totals.recallTool) * 100).toFixed(0) : 0}%；越高=召回了但没命中）`);
if (EXCLUDE_SELF) console.log(`  自查会话已剔除 ${selfExcluded.length} 个（--exclude-self，自查词≥${SELF_HITS}）：${selfExcluded.slice(0, 12).join(' ')}${selfExcluded.length > 12 ? ' …' : ''}`);
console.log(`  ③ 指针跟读(notes): ${totals.follow}`);
console.log(`  ④ 主档直读: ${totals.mainRead}`);
console.log(`  ⇒ 每 100 轮: 画像 ${per100(totals.profileHit)} · 知识 ${per100(totals.knowledgeHit)} · 召回工具 ${per100(totals.recallTool)} · 跟读 ${per100(totals.follow)} · 主档 ${per100(totals.mainRead)}`);
console.log('\n口径说明: ①在 assistant 内容中命中主题词即计一次（横幅在系统侧，命中=被取用）；②③④按 tool/call 参数匹配记忆库路径。');
console.log('注意: 若把「审计/排查记忆系统」这类会话算进基线，①②会被自身操作顶高 —— 用 --exclude 剔除后再看基线。');
