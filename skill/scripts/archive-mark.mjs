#!/usr/bin/env node
// archive-mark.mjs — 会话归档进度标记（复用 archive-lib；upsert by sessionId）
// 用法:
//   node scripts/archive-mark.mjs <sessionId> <lastRow> [--total N] [--done]   # 标记检测进度
//   node scripts/archive-mark.mjs <sessionId> --touch [--lastRow N]            # 活跃重计时（清 pending/fireAt）
//   node scripts/archive-mark.mjs <sessionId> --pending                        # 查看该会话 mark
// 数据: audit/archive-progress.jsonl（env ARCHIVE_LOG 可覆盖）；每会话仅最后一条有效
// 行结构: { sessionId, lastRow, total?, done, pending, lastTurnAt, fireAt, at }
import * as lib from './archive-lib.mjs';

const argv = process.argv.slice(2);
const VAL_OPTS = new Set(['--total', '--lastRow']);
const pos = []; // 位置参数（值感知：跳过带值选项及其参数值，防 '--total 100' 的 100 被误收）
for (let i = 0; i < argv.length; i++) {
  if (VAL_OPTS.has(argv[i])) { i++; continue; }
  if (!argv[i].startsWith('--')) pos.push(argv[i]);
}
const sid = pos[0];
const touch = argv.includes('--touch');
const showPending = argv.includes('--pending');
if (!sid || pos.length > 2 || (touch && pos.length !== 1) || (!touch && !showPending && pos.length !== 2)) {
  console.error('用法: node scripts/archive-mark.mjs <sessionId> <lastRow> [--total N] [--done] | <sessionId> --touch [--lastRow N] | <sessionId> --pending');
  process.exit(3);
}
const cfg = lib.pathConfig();

if (showPending) {
  const m = await lib.findMark(sid);
  if (!m) { console.log(`（无 mark：${sid}）`); process.exit(2); }
  console.log(JSON.stringify(m, null, 2));
  process.exit(0);
}

if (touch) {
  const prev = await lib.findMark(sid);
  const lrIdx = argv.indexOf('--lastRow');
  const lastRow = lrIdx > -1 ? Number(argv[lrIdx + 1]) : (prev?.lastRow ?? 0);
  const now = Date.now();
  const entry = {
    sessionId: lib.normalizeSid(sid),
    lastRow,
    ...(prev?.total != null ? { total: prev.total } : {}),
    done: prev?.done ?? false,
    pending: false,
    lastTurnAt: now,
    fireAt: now + cfg.silentMs,
    at: new Date().toISOString(),
  };
  await lib.upsertMark(entry);
  if (argv.includes('--json')) console.log(JSON.stringify(entry));
  else console.log(`touch ${entry.sessionId}: 重计时 ${cfg.silentMs}ms（fireAt ${new Date(entry.fireAt).toISOString()}），pending 已清`);
  process.exit(0);
}

const lr = Number(pos[1]);
if (!Number.isFinite(lr)) { console.error('lastRow 必须为数字'); process.exit(3); }
const totalIdx = argv.indexOf('--total');
const done = argv.includes('--done');
const prev = await lib.findMark(sid);
const now = Date.now();
const entry = {
  sessionId: sid,
  lastRow: lr,
  ...(totalIdx > -1 ? { total: Number(argv[totalIdx + 1]) } : (prev?.total != null ? { total: prev.total } : {})),
  done,
  pending: false,
  lastTurnAt: now,
  fireAt: done ? null : now + cfg.silentMs,
  at: new Date().toISOString(),
};
await lib.upsertMark(entry);
console.log(`mark ${lib.normalizeSid(sid)}: lastRow=${lr}${entry.total ? ' total=' + entry.total : ''}${done ? ' done' : ''} → ${cfg.log}`);
