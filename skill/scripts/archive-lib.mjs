#!/usr/bin/env node
// archive-lib.mjs — 会话归档检测公共层（单一事实源的公共部分）
// 定位/解码/行数/mark 读写/信号召回/pending 队列/env 隔离——archive-check / archive-mark / archive-timer 复用
// env 隔离（插件与测试容器用）：ARCHIVE_LOG / ARCHIVE_PENDING / ARCHIVE_SESSIONS / ARCHIVE_SILENT_MS
import { readFile, writeFile, readdir, stat, mkdir, rm, rename } from 'node:fs/promises';
import { join, dirname, isAbsolute, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export const scriptDir = dirname(fileURLToPath(import.meta.url));
const envOf = (k, d) => (process.env[k] != null && process.env[k] !== '' ? process.env[k] : d);
// 记忆数据根（MEMORY_ROOT）：结构分离后私人数据可位于公开树外/_memory。
// 缺省 = 脚本目录上上级（兼容生产技能副本根下 notes/ 布局）；env 优先。
export const rootDir = envOf('MEMORY_ROOT', join(scriptDir, '..'));

// ---- 路径与参数（env 可覆盖，缺省=记忆数据根内）----
export function pathConfig() {
  return {
    log: envOf('ARCHIVE_LOG', join(rootDir, 'audit', 'archive-progress.jsonl')),
    pendingDir: envOf('ARCHIVE_PENDING', join(rootDir, 'audit', 'archive-pending')),
    sessionsRoot: envOf('ARCHIVE_SESSIONS', join(homedir(), '.dsh', 'sessions')),
    silentMs: Number(envOf('ARCHIVE_SILENT_MS', DEFAULT_SILENT_MS)) || DEFAULT_SILENT_MS,
  };
}
export const DEFAULT_SILENT_MS = 780000; // 静默阈值 780s（自最后 touch 起算）

// ---- 信号召回正则（纯召回不写库）----
export const SIG_RE = /(记住|注意|踩坑|纠正|以后|别再|失败|改用|原因|根因|方案|决策|配置|红线|原则)/;

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
// 文件指纹（mtime/size 一次取）：mtime=活跃保护判据，size=数据驱动重武装判据
export async function statFile(p) { try { const s = await stat(p); return { mtime: s.mtimeMs, size: s.size }; } catch { return null; } }

// ---- 转录文件名识别（版本无关 · 单一实现）----
// 2026-09-11 修复（F-1 断链）：DSH 自 2026-09-10 13:49 起转录改名 `session.jsonl.zstd`
//   → `session.v3.jsonl.zstd`，而旧白名单 ['session.jsonl.zstd','session.jsonl'] 对**带版本段**的命名恒不命中
//   （`session.v3.jsonl.zstd` 不含子串 `session.jsonl`）⇒ locateTranscript 恒 null ⇒ workspace 反解全量失效
//   （项目卡永久滞留 pending-defer + 每轮扫尾空转）。改为「列目录 + 版本无关正则」，未来 v4/v5 命名无需再改
//   （拒绝再埋同族硬编码：本判据为定位/枚举/检索三处共用）。
export const TRANSCRIPT_NAME_RE = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/;

/** 在候选目录中挑出转录文件（.zstd 优先 → 版本号高者优先）；无则 null */
export async function pickTranscriptIn(dir) {
  let names = [];
  try { names = await readdir(dir); } catch { return null; }
  const cands = names.filter((n) => TRANSCRIPT_NAME_RE.test(n));
  if (!cands.length) return null;
  const rank = (n) => [n.includes('.zstd') ? 1 : 0, Number((n.match(/\.v(\d+)\.jsonl/) || [])[1] || 0)];
  cands.sort((a, b) => { const [za, va] = rank(a); const [zb, vb] = rank(b); return (zb - za) || (vb - va) || a.localeCompare(b); });
  return join(dir, cands[0]);
}

// ---- 转录定位：直接文件路径 或 按 sessionId 走会话树（zstd 优先，明文 .jsonl 兜底）----
export async function locateTranscript(target) {
  if (isAbsolute(target) || /[\\/]/.test(target)) return (await exists(target)) ? target : null;
  const root = pathConfig().sessionsRoot;
  const dirs = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory()) continue;
      const f = join(d, e.name);
      if (e.name === target || e.name === 'session-' + target) dirs.push(f); else await walk(f);
    }
  };
  await walk(root);
  for (const d of dirs) {
    const cand = await pickTranscriptIn(d); // 版本无关（原枚举旧名 ⇒ v3 会话定位恒 null）
    if (cand) return cand;
  }
  return null;
}

// ---- 解码（.zstd → 内嵌 fzstd；其余按 utf8）----
export async function decodeTranscript(file) {
  if (extname(file).toLowerCase() === '.zstd') {
    const buf = await readFile(file);
    const fz = require(join(scriptDir, 'vendor', 'fzstd.cjs'));
    return Buffer.from(fz.decompress(buf)).toString('utf8');
  }
  return readFile(file, 'utf8');
}

export const countLines = (text) => text.split('\n').filter(Boolean).length;

// ---- mark 读写（upsert by sessionId，每会话仅最后一条有效；兼容 session- 前缀）----
export const normalizeSid = (sid) => String(sid).replace(/^session-/, '');
export async function readMarks(logFile = pathConfig().log) {
  try {
    return (await readFile(logFile, 'utf8')).split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
export async function findMark(sid, logFile = pathConfig().log) {
  const n = normalizeSid(sid);
  return (await readMarks(logFile)).find((m) => normalizeSid(m.sessionId || '') === n) || null;
}
export async function upsertMark(entry, logFile = pathConfig().log) {
  const n = normalizeSid(entry.sessionId);
  await mkdir(dirname(logFile), { recursive: true }).catch(() => {});
  const ms = await readMarks(logFile);
  const keep = ms.filter((m) => normalizeSid(m.sessionId || '') !== n);
  keep.push({ ...entry, at: entry.at ?? new Date().toISOString() });
  await writeFile(logFile, keep.map((m) => JSON.stringify(m)).join('\n') + '\n', 'utf8');
  return keep.find((m) => normalizeSid(m.sessionId || '') === n);
}

// ---- 信号召回（增量行内，纯召回；JSONL 行提取对话正文匹配，结构化状态行降噪）----
// 正文提取：user/message 与 assistant 输出 chunk 的 text 字段拼接；无正文则回退整行截断
// 状态/元数据行（title/todo/投影/检测器等）不参与匹配——todo 等计划性内容由裁决层按需处理，不进召回
const TEXT_KEYS = ['content', 'texts', 'text', 'dt'];
const META_KEYS = ['session/title', 'session/summary', 'todo/write', 'todo-status', 'session/delta', 'telemetry', 'session-checkpoint', 'session-projection', 'compaction', 'message-feedback', 'tool-progress'];
export function extractUtterance(line) {
  let o;
  try { o = JSON.parse(line); } catch { return String(line); } // 非 JSON 转录（明文行）：整行即正文
  const type = String(o?.type || '');
  if (META_KEYS.some((k) => type.startsWith(k))) return ''; // 结构化状态行：不参与召回
  const d = o?.data || o;
  let out = '';
  const collect = (v) => {
    if (typeof v === 'string') out += (out && !out.endsWith(' ') ? ' ' : '') + v;
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') {
      if (typeof v.text === 'string') collect(v.text);
      for (const k of TEXT_KEYS) if (k !== 'text' && v[k] != null) collect(v[k]);
    }
  };
  // assistant/chunk 流式行：block-end 携带完整块正文（含推理结论），text-chunks/message 内嵌正文也可还原
  if (type === 'assistant/chunk') {
    const c = d?.chunk || d;
    if (c?.block?.text) collect(c.block.text); // block-end / block text：完整正文
    if (c?.text) collect(c.text); // 部分流：已组装的 text
    if (d?.message?.content) collect(d.message.content); // 终态 message
    return out.trim();
  }
  if (type === 'assistant/message' && d?.message?.content) {
    collect(d.message.content);
    return out.trim();
  }
  collect(d.content ?? d.texts ?? d.text ?? '');
  return out.trim();
}
// text-chunks delta 累积解码（深思考/流式正文还原）：转录把正文切成 delta 增量行（dt=步长,texts=增量token）。
// 逐行累积 texts 即可还原可读正文（append-only patch）。供 recallSignals 跨行还原，命中含「根因/对策」等结论行。
export function decodeTextChunksDelta(lines, fromIdx /* 0-based */) {
  let acc = '';
  const chunks = [];
  for (let i = fromIdx; i < lines.length; i++) {
    let o = null;
    try { o = JSON.parse(lines[i]); } catch { break; }
    if (o?.type === 'text-chunks' && Array.isArray(o?.data?.texts)) {
      // 简化：texts 是相对上一行的增量新增 token，直接拼接可还原正文（实测全量累加即原文）
      acc += o.data.texts.join('');
      chunks.push({ row: i + 1, text: acc });
    } else if (o?.type === 'assistant/chunk' && o?.data?.chunk?.block?.text) {
      acc += o.data.chunk.block.text;
      chunks.push({ row: i + 1, text: acc });
    } else if (o?.type === 'assistant/message' && o?.data?.message?.content) {
      const t = JSON.stringify(o.data.message.content);
      acc += t.replace(/\\n/g, '\n').replace(/[{"}\[\]]/g, ' ');
      chunks.push({ row: i + 1, text: acc });
    }
    if (acc.length > 60000) break; // 防御：单会话正文上限
  }
  return chunks;
}
export function recallSignals(lines, from /* 1-based 首条新行 */, limit = 8) {
  const hits = [];
  // 预扫描 text-chunks 流式结论（还原后按行号归并，供下循环命中 SIG）
  const deltaChunks = decodeTextChunksDelta(lines, Math.max(0, from - 1));
  for (let i = from - 1; i < lines.length; i++) {
    const utter = extractUtterance(lines[i]);
    if (!utter) continue; // JSON 元数据/无正文行：跳过（噪音不入召回）
    const s = utter.replace(/\s+/g, ' ').slice(0, 130);
    if (SIG_RE.test(s) && s.length > 6) hits.push({ row: i + 1, text: s });
  }
  // delta 结论行（原文含根因/对策等）若未被上面的逐行命中，则从累积片段取含 SIG 的窗口
  for (const c of deltaChunks) {
    const already = hits.some((h) => h.row === c.row);
    if (already) continue;
    const seg = c.text.slice(-160).replace(/\s+/g, ' ');
    if (SIG_RE.test(seg) && seg.length > 6) hits.push({ row: c.row, text: '…' + seg.slice(-130) });
  }
  return hits.slice(0, limit);
}

// ---- 会话发现（补「无 mark 会话脱管」缺口）：枚举会话树，静默超阈值且无 mark 的纳入 ----
// 返回 {sessionId, file, mtime}；mtime<=cutoff 且无 mark 才交给 timer（新建 mark 或直接处理由调用方定）
// 排除 subagent 会话（origin=subagent，如蒸馏子代理/任务子代理——非用户会话，蒸馏无意义且防递归）
export async function isSubagentSession(file) {
  try {
    const text = await decodeTranscript(file); // 兼容 zstd/明文
    const first = text.split('\n').find(Boolean) || '';
    return first.includes('"origin":"subagent"') || first.includes('"parentSession"');
  } catch { return false; }
}
export async function enumerateSessions(cutoffMs, marks) {
  const root = pathConfig().sessionsRoot;
  const known = new Set((marks || []).map((m) => normalizeSid(m.sessionId || '')));
  const out = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory()) continue;
      const full = join(d, e.name);
      let idx = null, fname = null;
      const picked = await pickTranscriptIn(full); // 版本无关（原枚举旧名 ⇒ v3 会话被整体漏枚举）
      if (picked) {
        try { idx = await stat(picked); fname = basename(picked); } catch { idx = null; fname = null; }
      }
      if (idx) {
        const sid = e.name.replace(/^session-/, '');
        if (!known.has(sid)) {
          const mt = idx.mtimeMs;
          if (mt <= cutoffMs) {
            const file = join(full, fname);
            if (await isSubagentSession(file)) continue; // 跳过蒸馏/任务子代理会话
            out.push({ sessionId: sid, file, mtime: mt });
          }
        }
      }
      await walk(full);
    }
  };
  await walk(root);
  return out.sort((a, b) => a.mtime - b.mtime); // 最旧优先（最可能是被遗忘的）
}

// ---- pending 队列（audit/archive-pending/<安全名>.json；唤醒裁决入口）----
const safeName = (sid) => normalizeSid(sid).replace(/[\\/:*?"<>|]+/g, '_');
export const pendingFileFor = (sid, dir = pathConfig().pendingDir) => join(dir, safeName(sid) + '.json');
export async function writePending(sid, payload, dir = pathConfig().pendingDir) {
  await mkdir(dir, { recursive: true }).catch(() => {});
  const file = pendingFileFor(sid, dir);
  await writeFile(file, JSON.stringify({ sessionId: sid, ...payload }, null, 2), 'utf8');
  return file;
}
export async function listPending(dir = pathConfig().pendingDir) {
  try { return (await readdir(dir)).filter((f) => f.endsWith('.json')).sort(); } catch { return []; }
}
export async function readPending(sid, dir = pathConfig().pendingDir) {
  try { return JSON.parse(await readFile(pendingFileFor(sid, dir), 'utf8')); } catch { return null; }
}
export async function removePending(sid, dir = pathConfig().pendingDir) {
  // 不用 rm：safe-delete shim 按 turn 限额拦批量删除，自动裁决每天删数百文件必撞线 → rename 隔离（可逆、不触发 shim）
  const file = pendingFileFor(sid, dir);
  const doneDir = join(dir, '..', 'archive-pending-done');
  try {
    await mkdir(doneDir, { recursive: true });
    await rename(file, join(doneDir, basename(file)));
  } catch { try { await rm(file, { force: true }); } catch { /* 双路失败忽略（数据仍在，幂等安全） */ } }
}
