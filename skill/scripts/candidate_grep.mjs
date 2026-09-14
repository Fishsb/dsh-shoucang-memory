#!/usr/bin/env node
// candidate_grep.mjs — 价值候选召回（只读，绝不写记忆库）v2
// v2（E9 修复，2026-09-06）：双源扫描——
//   源1 明文会话 ~/.dsh/memory/conversations/*.jsonl（历史，2026-08-26 止）
//   源2 zstd 转录 ~/.dsh/sessions/--workspace--/<sid>/session[.vN].jsonl.zstd（现行落盘格式；文件名由
//       archive-lib.pickTranscriptIn 版本无关识别，archive-lib.decodeTranscript 解码，
//       extractUtterance 提对话正文，结构化状态行降噪）——修复「收尾召回对近期会话空转」断链
// 信号词与 archive-lib.recallSignals / engine/signals.mjs 同源（强：记住/踩坑/纠正…；中：失败换路/原因…）。
// 输出 时间|来源:行|置信|片段。纯召回不写库；判定入册由 R0+四问（§7）+ 审计负责。
// 用法: node scripts/candidate_grep.mjs [关键词] [--max N] [--dir <明文目录>] [--sessions <目录>] [--no-sessions]
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import * as lib from './archive-lib.mjs';

const argv = process.argv.slice(2);
const kw = argv.find((a) => !a.startsWith('--'));
const max = Number(argv[argv.indexOf('--max') + 1] ?? 20);
const dirArg = argv.indexOf('--dir') > -1 ? argv[argv.indexOf('--dir') + 1] : join(os.homedir(), '.dsh', 'memory', 'conversations');
const sessArg = argv.indexOf('--sessions') > -1 ? argv[argv.indexOf('--sessions') + 1] : join(os.homedir(), '.dsh', 'sessions');
const noSessions = argv.includes('--no-sessions');

const STRONG = ['记住', '以后', '注意', '踩坑', '原来是这样', '应该改成', '别再用', '纠正', '别忘了', '务必'];
const MID = [/失败.{0,24}(换|改)用/, /(报错|失败).{0,16}(换|改)用/, /改用.{0,12}(工具|方式|方案|命令)/, /原因.{0,12}(是|为|在于)/, /(记|存).{0,6}(到|进)/];

const rxKw = kw ? new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
let hits = 0;

// ---- 源1：明文 conversations/*.jsonl（历史记录）----
let files = [];
try { files = (await readdir(dirArg)).filter((f) => f.endsWith('.jsonl')).sort(); } catch { files = []; }
for (const f of files) {
  if (hits >= max) break;
  const raw = await readFile(join(dirArg, f), 'utf8').catch(() => '');
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length && hits < max; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const strong = STRONG.some((s) => line.includes(s));
    if (!strong && !MID.some((re) => re.test(line))) continue;
    if (rxKw && !rxKw.test(line)) continue;
    hits++;
    const t = (line.match(/"recordedAt":"([^"]+)"/) || [, f])[1].slice(0, 19) || f;
    console.log(`${t} | ${f}:${i + 1} | ${strong ? '【强】' : '【中】'} ${line.slice(0, 140)}`);
  }
}

// ---- 源2：zstd 转录 sessions/--workspace--/<sid>/session[.vN].jsonl.zstd（现行格式 · 文件名版本无关识别）----
if (!noSessions && hits < max) {
  let workspaces = [];
  try { workspaces = (await readdir(sessArg, { withFileTypes: true })).filter((d) => d.isDirectory()); } catch { workspaces = []; }
  for (const ws of workspaces) {
    if (hits >= max) break;
    const wsDir = join(sessArg, ws.name);
    let sids = [];
    try { sids = (await readdir(wsDir, { withFileTypes: true })).filter((d) => d.isDirectory()); } catch { continue; }
    for (const sid of sids) {
      if (hits >= max) break;
      const tfile = await lib.pickTranscriptIn(join(wsDir, sid.name)); // 版本无关（原硬编码 session.jsonl.zstd ⇒ v3 会话漏扫）
      if (!tfile) continue;
      const st = await stat(tfile).catch(() => null);
      if (!st || st.size === 0) continue;
      let text = '';
      try { text = await lib.decodeTranscript(tfile); } catch { continue; } // 解码失败跳过（损坏/非转录）
      const lines = text.split('\n');
      for (let i = 0; i < lines.length && hits < max; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        // 粗筛原始行（省 extractUtterance 成本）；流式 delta 行无信号词但结论在 chunk 内 → 对 assistant/chunk 行跳过粗筛
        const isChunk = line.includes('"assistant/chunk"');
        if (!isChunk && !STRONG.some((s) => line.includes(s)) && !MID.some((re) => re.test(line))) continue;
        const utter = lib.extractUtterance(line);
        const pieces = Array.isArray(utter) ? utter : [utter];
        for (const piece of pieces) {
          if (!piece || typeof piece !== 'string' || piece.length < 8) continue;
          const strong = STRONG.some((s) => piece.includes(s));
          const mid = MID.some((re) => re.test(piece));
          if (!strong && !mid) continue;
          if (rxKw && !rxKw.test(piece)) continue;
          hits++;
          console.log(`${st.mtime.toISOString().slice(0, 19)} | ${ws.name.slice(2, 20)}…/${sid.name.slice(0, 8)}:${i + 1} | ${strong ? '【强】' : '【中】'} ${piece.slice(0, 140)}`);
          if (hits >= max) break;
        }
      }
    }
  }
}

console.log(`\n共召回 ${hits} 条候选（源=明文 conversations + zstd sessions 转录；强：记住/踩坑/纠正/以后…；中：失败换路/原因…）。纯召回不写库，判定入册走 R0+四问+审计。`);
process.exit(hits ? 0 : 1);
