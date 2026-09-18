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
/* S-P2（2026-09-16）**纪元日志第二源：工具使用**（同一遍转录遍历，零额外 IO）。
 * 为什么复用本件而不新建遍历器（仓规则 5「不从零造轮子」）：本循环**已经**在解析 `tool/call` 事件，
 *   再写第二个转录遍历器 = 重复 IO + 两份水位须各自维护（漂移源）。
 * ⚠ **隐私红线（本册最易踩的一条）**：转录里的工具参数**必然带项目路径与专名**。
 *   ⇒ 本件**只落** `{ t, sid, tool, n }`（时间 / 会话短码 / 工具名 / 次数），
 *     **绝不落** arguments 原文、路径、命令、文件内容。落点：`audit/tool-usage.jsonl`。
 *   同水位（同一遍处理同一 seq 区间）⇒ 幂等语义与 access-real 一致。 */
const toolOut = join(auditDir, 'tool-usage.jsonl');
const toolAgg = new Map(); // `${sid}|${tool}` → { t, sid, tool, n }

/* J5/U3（2026-09-16）**收益信号取证：注入材料之后模型实际做了什么**（同一遍遍历，零额外 IO）。
 * 判因（实测）：`compliant` 恒 false（1061/1061）⇒ 合规率 0.0% ⇒ 收益判据**信号源已死**
 *   （`nextZeroGain` 永远递增、`switchSource` 82.8% 恒真）。⚠ 2026-09-18（IR1 附册 F2）：该审计键
 *   **已更名 `topicEcho`**（它测的是"是否回引材料主题词"，不是"材料被用上了"）⇒ 本件不再依赖它。
 *   「注入之后模型做了什么」——而这**必须从转录取**（台账只记到"注入了多少材料"为止）。
 * 连接键 = **时间**：台账 `phase:'compliance'` 行的 `at` × 转录事件的 `time`（同一 sid）。
 * ⚠ **隐私面不扩大**：只落**工具名序列**（ASCII 标识符，与 tool-usage 同级），
 *   **不落 arguments、不落 topics 原文**（topics 来自用户提问内容 —— 落它等于把查询内容写进日志）。
 * ⚠ **幂等**：与本件同款水位文件按 sid 记"已处理到的注入时刻"，重复运行不重发。 */
const yieldOut = join(auditDir, 'yield-rounds.jsonl');
const yieldWmFile = join(auditDir, 'yield-watermark.json');
const YIELD_NEXT_N = Number(process.env.SHOUCANG_YIELD_NEXT_N) || 3;
const ledgerPath = process.env.SHOUCANG_LEDGER || join(homedir(), '.dsh', 'suite', 'knowledge', 'audit', 'ledger.jsonl');
const injectionsBySid = new Map(); // shortSid → [{ atMs, atISO, materialChars, sim }]
try {
  const { readFileSync } = await import('node:fs');
  for (const l of readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o?.phase !== 'compliance') continue;
    const short = String(o.sid || '').slice(0, 8);
    if (!short) continue;
    const atMs = Date.parse(String(o.at || ''));
    if (!Number.isFinite(atMs)) continue;
    const arr = injectionsBySid.get(short) || [];
    // ⚠ **不取 topics**（含查询内容 ⇒ 隐私面）；只取数字与时刻
    arr.push({ atMs, atISO: new Date(atMs).toISOString(), materialChars: Number(o.materialChars) || 0, sim: Number(o.sim) || 0 });
    injectionsBySid.set(short, arr);
  }
} catch { /* 台账不可读 ⇒ 无注入记录（不影响本件既有两条产线） */ }
let yieldWm = {};
try { yieldWm = JSON.parse(await readFile(yieldWmFile, 'utf8')); } catch { yieldWm = {}; }
const yieldRows = [];
const sessionCalls = new Map(); // shortSid → [{ t, n }]

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
    // S-P2：**先记工具使用聚合**（在任何过滤之前 —— 要的是"当天用了什么工具"，与是否读到库无关）。
    //   只累加计数，**不碰 arguments**（隐私红线）。
    if (name) {
      const shortSid = sid.startsWith('session-') ? sid.slice(8, 16) : sid.slice(0, 8);
      const k = `${shortSid}|${name}`;
      const cur = toolAgg.get(k);
      if (cur) cur.n += 1;
      else toolAgg.set(k, { t: new Date(Number(o?.time) || Date.now()).toISOString().slice(0, 10), sid: shortSid, tool: String(name).slice(0, 40), n: 1 });
    }
    // J5/U3：把本会话的**工具调用时刻**记下来（后面与"注入时刻"按时间连接）—— 只记名与时刻
    if (name) {
      const shortSid0 = sid.startsWith('session-') ? sid.slice(8, 16) : sid.slice(0, 8);
      const arr0 = sessionCalls.get(shortSid0) || [];
      arr0.push({ t: Number(o?.time) || 0, n: String(name).slice(0, 40) });
      sessionCalls.set(shortSid0, arr0);
    }
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
if (!DRY && toolAgg.size) {
  await mkdir(auditDir, { recursive: true });
  const { appendFileSync } = await import('node:fs');
  const rows = [...toolAgg.values()].sort((a, b) => (a.sid + a.tool).localeCompare(b.sid + b.tool));
  appendFileSync(toolOut, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}
/* J5/U3：把「注入时刻 × 之后的工具名序列」连接成收益取证行（**幂等**：水位记已处理到的注入时刻）。 */
{
  for (const [shortSid, injs] of injectionsBySid) {
    const done = Number(yieldWm[shortSid]?.atMs ?? 0);
    const todo = injs.filter((x) => x.atMs > done).sort((a, b) => a.atMs - b.atMs);
    if (!todo.length) continue;
    const calls = (sessionCalls.get(shortSid) || []).slice().sort((a, b) => a.t - b.t);
    let maxAt = done;
    for (const inj of todo) {
      const after = calls.filter((c) => c.t >= inj.atMs).slice(0, YIELD_NEXT_N);
      yieldRows.push({ sid: shortSid, at: inj.atISO, materialChars: inj.materialChars, sim: inj.sim, nextTools: after.map((c) => c.n), idleSteps: after.length });
      if (inj.atMs > maxAt) maxAt = inj.atMs;
    }
    yieldWm[shortSid] = { atMs: maxAt, at: new Date().toISOString() };
  }
}
if (!DRY && yieldRows.length) {
  await mkdir(auditDir, { recursive: true });
  const { appendFileSync } = await import('node:fs');
  appendFileSync(yieldOut, yieldRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}
if (!DRY && Object.keys(yieldWm).length) {
  await mkdir(dirname(yieldWmFile), { recursive: true });
  await writeFile(yieldWmFile, JSON.stringify(yieldWm, null, 2), 'utf8');
}
if (!DRY) {
  await mkdir(dirname(wmFile), { recursive: true });
  await writeFile(wmFile, JSON.stringify(wm, null, 2), 'utf8');
}
console.log(`harvest-access: ${DRY ? '[dry] ' : ''}会话 ${scanned} · 新记录 ${records.length} · 统计小节 ${allSections.size} 个 · 落盘 ${DRY ? '(未写)' : outFile}`);
if (VERBOSE || toolAgg.size) console.log(`harvest-access · 工具使用聚合：${toolAgg.size} 组（工具名+会话短码+次数；**不含参数原文**）→ ${DRY ? '(未写)' : toolOut}`);
