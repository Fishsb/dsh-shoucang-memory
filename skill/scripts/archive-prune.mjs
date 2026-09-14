#!/usr/bin/env node
// archive-prune.mjs — 清理 audit/archive-progress.jsonl 中的失效 mark（会话转录已不存在）
// 用法: node scripts/archive-prune.mjs [--apply] [--json] [--skill <技能目录>]
//   缺省 dry-run（只报告）；--apply 才重写文件（先备份为 archive-progress.jsonl.bak-prune-<ts>）
//
// 判因（为什么删是安全的）：
//   archive-progress.jsonl 由 archive-lib.upsertMark 维护——**按 sessionId upsert、天然只增不删**，
//   每会话一条。消费端 findMark(sid) 只会对**磁盘上仍存在的会话**查询（archive-timer 枚举 sessions 根），
//   因此「会话目录已不存在」的 mark 永远不会再被读到 = 纯死重量（实测 548/549 条为 2026-09-03 前
//   已被归档移走的会话）。保留路径形式 sessionId 的条目（检测器显式跳过，属另一种寻址）。
// 退出码: 0=完成（含无需清理） 2=未找到 mark 文件 3=用法错误
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as lib from './archive-lib.mjs';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const asJson = argv.includes('--json');
const si = argv.indexOf('--skill');
const skillDir = si > -1 ? argv[si + 1] : lib.rootDir;
if (si > -1 && !skillDir) { console.error('用法: node scripts/archive-prune.mjs [--apply] [--json] [--skill <技能目录>]'); process.exit(3); }

const cfg = lib.pathConfig();
const logFile = join(skillDir, 'audit', 'archive-progress.jsonl');
const sessionsRoot = cfg.sessionsRoot;

const marks = await lib.readMarks(logFile).catch(() => []);
if (!marks.length) { console.error('未找到 archive-progress mark（或文件为空）:', logFile); process.exit(2); }

// 会话目录存在性判定：sessionsRoot/<工作区>/<sid|session-sid>（与体检脚本同口径，含容错遍历）
const dirCache = new Map();
async function sessionExists(sid) {
  const key = lib.normalizeSid(sid);
  if (dirCache.has(key)) return dirCache.get(key);
  const names = new Set([key, 'session-' + key]);
  let ok = false;
  const walk = async (d, depth) => {
    if (ok || depth > 3) return;
    const entries = await readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (names.has(e.name)) { ok = true; return; }
      await walk(join(d, e.name), depth + 1);
      if (ok) return;
    }
  };
  await walk(sessionsRoot, 0);
  dirCache.set(key, ok);
  return ok;
}

const keep = [];
const dropped = [];
for (const m of marks) {
  const sid = typeof m.sessionId === 'string' ? m.sessionId : '';
  // 路径形式 / 缺失 sessionId：不判定存在性，一律保留（非会话目录寻址）
  if (!sid || sid.includes('\\') || sid.includes('/')) { keep.push(m); continue; }
  if (await sessionExists(sid)) keep.push(m);
  else dropped.push(sid);
}

const summary = { file: logFile, total: marks.length, kept: keep.length, dropped: dropped.length, applied: apply };
if (asJson) console.log(JSON.stringify({ ...summary, droppedSample: dropped.slice(0, 10) }, null, 2));
else {
  console.log(`archive-progress: ${marks.length} 条 mark`);
  console.log(`  有效（会话在盘）: ${keep.length}`);
  console.log(`  失效（转录已不存在）: ${dropped.length}${dropped.length ? ' —— ' + dropped.slice(0, 5).join(', ') + (dropped.length > 5 ? ' …' : '') : ''}`);
}

if (!dropped.length) { if (!asJson) console.log('无需清理 ✅'); process.exit(0); }
if (!apply) { if (!asJson) console.log('（dry-run；加 --apply 才重写文件）'); process.exit(0); }

const bak = `${logFile}.bak-prune-${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;
writeFileSync(bak, readFileSync(logFile, 'utf8'), 'utf8');
const tmp = `${logFile}.tmp`;
writeFileSync(tmp, keep.length ? keep.map((m) => JSON.stringify(m)).join('\n') + '\n' : '', 'utf8');
renameSync(tmp, logFile);
if (!asJson) console.log(`已清理 ${dropped.length} 条失效 mark → ${logFile}\n备份: ${bak}`);
process.exit(0);
