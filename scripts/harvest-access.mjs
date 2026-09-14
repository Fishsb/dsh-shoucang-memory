#!/usr/bin/env node
// harvest-access.mjs — 真实读路径 → audit/access-real.jsonl（活性/遗忘/回想强度模型的**真实信号源**）
//
// 为什么需要它（ACT-023）：
//   `audit/access.log` 目前**只由 read_section.mjs 写**，而 agent 的真实读路径是 `read`/`grep`/`pwsh`
//   ⇒ 三模型长期失真（实测「假冷 26 条」：49 条冷条目里 26 条从未被记录过命中）。
//   本脚本从**会话转录**派生真实读记录补齐断链；转录是既有的权威落盘（archive-lib.decodeTranscript）。
//
// 幂等：按「会话 → 已处理 seq 水位」增量追加（水位存 audit/access-real-watermark.json），
//   重复运行不会重复计数；水位随行记录会话格式代，代际迁移即作废重扫（同蒸馏水位双证思路）。
//
// 记录形状与 access.log **完全一致**（`{t,f,s}`）⇒ activity.ts 无需改判定逻辑即可消费（日志驱动、每轮全量重算）。
//
// 语义：
//   · args 含 `§小节` → 记该小节（多个 § 逐个记）
//   · 仅提到 `notes/x.md`（整文件 read/grep）→ 记该文件的**全部已登记小节**
//     （读整文件确实使 agent 看到其全部内容；`--file-only` 可改为只记文件级 `s='*'`）
// 索引之外的小节不入账（避免污染 topics 宇宙），由调用方按索引文件解析出的登记表限定。
//
// 用法: node scripts/harvest-access.mjs [--bank <记忆库根>] [--sessions <会话根>] [--dry] [--verbose]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import * as lib from './archive-lib.mjs';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = argv.includes('--dry');
const VERBOSE = argv.includes('--verbose');
const sessionsRoot = argOf('--sessions', lib.pathConfig().sessionsRoot);
const bank = argOf('--bank',
  process.env.MEMORY_ROOT
  || (existsSync(join(lib.rootDir, 'MEMORY.md')) ? lib.rootDir : join(homedir(), '.dsh', 'skills', 'managing-memory')));
const auditDir = join(bank, 'audit');
const outFile = join(auditDir, 'access-real.jsonl');
const wmFile = join(auditDir, 'access-real-watermark.json');

const FILE_RE = /notes[\\/]{1,2}([A-Za-z0-9_.-]+\.md)/g;
const SECT_RE = /§\s*([^\s"'\\,;)]+)/g;

// 已登记小节表：section → 文件名（由索引行 `→ notes/x.md §小节` 解析，口径同 activity.ts）
function registeredSections() {
  const byFile = new Map(); // file → Set(section)
  for (const idx of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
    let raw = '';
    try { raw = readFileSync(join(bank, idx), 'utf8'); } catch { continue; }
    for (const l of raw.split(/\r?\n/)) {
      const m = l.match(/→\s*notes\/([A-Za-z0-9_-]+\.md)\s*§(.+)$/);
      if (!m) continue;
      const file = m[1];
      const sec = m[2].trim().split(/\s*\/\s*/)[0].replace(/^§+/, '');
      if (!sec || file === 'INDEX.md') continue;
      if (!byFile.has(file)) byFile.set(file, new Set());
      byFile.get(file).add(sec);
    }
  }
  return byFile;
}

async function walk(dir, acc = []) {
  let ents = [];
  try { ents = await (await import('node:fs/promises')).readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name.endsWith('.zstd') || e.name.endsWith('.jsonl')) acc.push(p); // .jsonl 兼容明文夹具/归档
  }
  return acc;
}

const byFile = registeredSections();
if (!byFile.size) {
  console.error(`未在记忆库找到已登记小节（bank=${bank}）；请用 --bank <记忆库根> 或设 MEMORY_ROOT。`);
  process.exit(2);
}
const allSections = new Set();
for (const s of byFile.values()) for (const x of s) allSections.add(x);

let wm = {};
try { wm = JSON.parse(await readFile(wmFile, 'utf8')); } catch { wm = {}; }

const files = await walk(sessionsRoot);
const records = [];
let scanned = 0, skipped = 0, hits = 0;

for (const p of files) {
  const seg = p.split(/[\\/]/).filter((x) => x.startsWith('session-')).pop();
  if (!seg) continue;
  const sid = lib.normalizeSid(seg);
  let txt;
  try { txt = await lib.decodeTranscript(p); } catch { continue; }
  const lines = txt.split('\n');
  const from = Number(wm[sid]?.seq ?? 0); // 已处理到的 seq（不含）
  let maxSeq = from;
  scanned++;
  for (const line of lines) {
    if (!line.includes('"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const seq = Number(o?.seq ?? 0);
    if (seq > maxSeq) maxSeq = seq;
    if (seq <= from) continue;
    if (o?.type !== 'tool/call') continue;
    const name = o?.data?.name || '';
    if (!/^(read|grep|glob|pwsh)$/.test(name)) continue;
    const args = String(o?.data?.arguments || '');
    // arguments 是 JSON 串：路径分隔符为**双反斜杠**，比较前须归一转义（同 recall-eval 的教训）。
    const argsNorm = args.replace(/\\\\/g, '\\');
    if (!(args.includes(bank) || argsNorm.includes(bank) || /managing-memory/i.test(args))) continue;
    const at = new Date(Number(o?.time) || Date.now()).toISOString();
    // 目标文件
    const targets = new Set();
    FILE_RE.lastIndex = 0;
    let m;
    while ((m = FILE_RE.exec(args))) targets.add(m[1]);
    // 显式 §小节（可多个）
    const secs = [];
    SECT_RE.lastIndex = 0;
    while ((m = SECT_RE.exec(args))) {
      const kw = decodeURIComponent(m[1]).replace(/^§/, '').trim();
      if (kw && !/^[→（]/.test(kw)) secs.push(kw);
    }
    for (const file of targets) {
      const reg = byFile.get(file);
      if (!reg) { skipped++; continue; }
      if (secs.length) {
        for (const kw of secs) {
          const hit = [...reg].find((r) => r === kw || r.includes(kw) || kw.includes(r));
          if (hit) { records.push({ t: at, f: 'notes/' + file, s: hit }); hits++; }
          else skipped++;
        }
      } else {
        // 整文件读/grep：记该文件全部已登记小节（读整文件即看到全部内容）
        for (const r of reg) { records.push({ t: at, f: 'notes/' + file, s: r }); hits++; }
      }
    }
  }
  if (from === 0 && lines.length) { /* 首次扫描该会话 */ }
  wm[sid] = { seq: maxSeq, at: new Date().toISOString() };
}

if (VERBOSE) {
  console.log(`扫描会话 ${scanned} 个；新记录 ${records.length} 条（命中 ${hits}，越界跳过 ${skipped}）`);
}
if (!DRY && records.length) {
  await mkdir(auditDir, { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const { appendFileSync } = await import('node:fs');
  appendFileSync(outFile, body, 'utf8');
}
if (!DRY) {
  await mkdir(dirname(wmFile), { recursive: true });
  await writeFile(wmFile, JSON.stringify(wm, null, 2), 'utf8');
}
console.log(`harvest-access: ${DRY ? '[dry] ' : ''}会话 ${scanned} · 新记录 ${records.length} · 统计小节 ${allSections.size} 个 · 落盘 ${DRY ? '(未写)' : outFile}`);
