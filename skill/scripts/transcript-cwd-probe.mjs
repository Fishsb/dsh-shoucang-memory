#!/usr/bin/env node
// transcript-cwd-probe.mjs — 转录 cwd 探针（2026-09-10）：读会话转录首行 session 记录的 cwd
// 背景：resolveWorkspace 目录名 decode 有歧义（盘符冒号被压成 -，目录内连字符无法区分），
//       转录首行 {"type":"session",...,"cwd":"D:\\..."} 是权威无歧义工作区源。
// 用法: node transcript-cwd-probe.mjs <session.jsonl|.zstd 路径>
// 退出码: 0=输出 cwd（stdout） 1=无 cwd/失败
import { decodeTranscript } from './archive-lib.mjs';

const file = process.argv[2];
if (!file) { console.error('用法: node transcript-cwd-probe.mjs <转录路径>'); process.exit(2); }
try {
  const text = await decodeTranscript(file);
  const first = text.split('\n').find((l) => l.trim().startsWith('{'));
  if (!first) { console.error('转录空'); process.exit(1); }
  const o = JSON.parse(first);
  if (o && o.cwd && typeof o.cwd === 'string' && o.cwd.trim()) {
    console.log(o.cwd.trim());
    process.exit(0);
  }
  console.error('首行无 cwd'); process.exit(1);
} catch (e) {
  console.error('cwd 探针失败: ' + String(e?.message || e).slice(0, 120)); process.exit(1);
}
