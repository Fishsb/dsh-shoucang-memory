#!/usr/bin/env node
// locate-transcript-probe.mjs — 会话转录定位探针（ADR-0005 E3 桥配套）
// 语义：输出 <sessionId> 的转录文件绝对路径（复用 archive-lib.locateTranscript 唯一权威定位）。
// 消费方：记忆插件 resolveWorkspace（从路径反解 workspace → knowledge-append --root 直写项目 pending）。
// 用法: node locate-transcript-probe.mjs <sessionId>
// 退出码: 0=找到（stdout=路径） 1=未找到 2=用法错误
import { locateTranscript } from './archive-lib.mjs';

const sid = process.argv[2];
if (!sid) { console.error('用法: node locate-transcript-probe.mjs <sessionId>'); process.exit(2); }
const file = await locateTranscript(sid);
if (!file) { console.error(`转录未找到: ${sid}`); process.exit(1); }
console.log(file);
process.exit(0);
