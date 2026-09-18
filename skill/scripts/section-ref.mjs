#!/usr/bin/env node
// section-ref.mjs — 小节寻址**单一语义**（S1R · D1/D2，2026-09-19）
//
// ⚠ **单一实现声明（跨面）**：本件与宿主侧 `src/section-ref.ts` 是**同一语义的两份物理实现**
//   —— 子进程活件必须**零依赖**（不得 import src/），故不能共用一份代码（与 `secret-redact.ts`
//   ↔ 本目录 `memory_write_gate.mjs#findSecretHits` 的先例同型）。
//   **改任一处必须同批改另一处**，一致由 `scripts/check-section-ref-parity.mjs`（差分锁）守：
//   同一夹具集逐例比对 `state + 候选集`，不一致即红。
//
// 判因：`§小节名` 是内容锚，但解析在仓内曾有**四份实现**（read_section 取首个 / 写门集合去重 /
//   treeops#matchSection 多命中⇒null / memory-append 逐级取首个）⇒ 同一指针三种结论。
//   本件把它收敛为**三态** `exists | ambiguous | missing`：**歧义 ≠ 不存在**；
//   spec 级（`§父/子`）另有第四态 `partial`（部分可解析 ⇒ 读侧回落父节，准入放行 + 提示）。
//
// 用法: node section-ref.mjs <notes/x.md|env.md> "<小节名>" [--json] [--root <库根>]
//       node section-ref.mjs --row "<索引行原文>" [--json] [--root <库根>]   # 索引行准入（唯一强制点）
// exit: 0=exists  2=ambiguous  1=missing（与「指针悬空是硬错」的既有语义对齐：2 亦可判错）
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORE_TAIL_RE = /\s*[（(]\s*20\d{2}[-/]\d{1,2}[-/]\d{1,2}[^）)]*[）)]\s*$/;
/** 标题核心名：去行尾维护元信息括号（与 src/treeops.ts#coreName 同口径） */
export const coreName = (t) => String(t == null ? '' : t).trim().replace(CORE_TAIL_RE, '').trim();
/** 归一：核心名 → 小写 → 去全部空白 */
export const sectionCore = (s) => coreName(s).toLowerCase().replace(/\s+/g, '');
/** 归一 notes 文件名（容忍 `notes/x.md`；禁 INDEX.md 与穿越） */
export function normNotesFile(f) {
  const raw = String(f == null ? '' : f).trim().replace(/\\/g, '/');
  const name = raw.startsWith('notes/') ? raw.slice('notes/'.length) : raw;
  if (!/^[A-Za-z0-9_-]+\.md$/i.test(name)) return null;
  if (name.toLowerCase() === 'index.md') return null;
  return name;
}
const HEAD_RE = /^(#{2,})[ \t]+(.*)$/;
/** 标题清单（`##`/`###` 两级；ADR-015）。文件不可读 ⇒ null */
export function sectionTitles(root, file) {
  const f = normNotesFile(file);
  if (!f) return null;
  const p = join(String(root || ''), 'notes', f);
  let text = '';
  try { text = readFileSync(p, 'utf8'); } catch { return null; }
  const out = [];
  const ls = text.split(/\r?\n/);
  for (let i = 0; i < ls.length; i++) {
    const m = HEAD_RE.exec(ls[i]);
    if (!m) continue;
    const level = m[1].length;
    if (level !== 2 && level !== 3) continue;
    out.push({ title: m[2].trim(), level, idx: i });
  }
  return out;
}
/** 纯函数裁决（差分锁逐例比对本函数） */
export function resolveFromTitles(titles, name, fileExists = true) {
  const kw = sectionCore(name);
  if (!kw) return { state: 'missing', exact: false, cands: [], fileExists, reason: '小节名为空' };
  const cand = (t) => { const core = sectionCore(t.title); return { title: t.title, core, level: t.level, idx: t.idx, exact: core === kw }; };
  const exactHits = titles.filter((t) => sectionCore(t.title) === kw);
  if (exactHits.length === 1) return { state: 'exists', exact: true, cands: [cand(exactHits[0])], fileExists };
  const uniq = new Map();
  for (const t of titles) {
    const c = sectionCore(t.title);
    if (c && (c === kw || c.includes(kw) || kw.includes(c))) uniq.set(t.idx, t);
  }
  const list = [...uniq.values()].sort((a, b) => a.idx - b.idx);
  if (list.length === 1) return { state: 'exists', exact: exactHits.length > 0, cands: [cand(list[0])], fileExists };
  if (list.length > 1) return { state: 'ambiguous', exact: exactHits.length > 0, cands: list.map(cand), fileExists };
  return { state: 'missing', exact: false, cands: [], fileExists };
}
/** 单一小节名 → 三态 */
export function resolveSection(root, file, name) {
  const f = normNotesFile(file);
  if (!f) return { state: 'missing', exact: false, cands: [], fileExists: false, reason: '文件名非法（仅 notes/<name>.md）' };
  const p = join(String(root || ''), 'notes', f);
  const fileExists = existsSync(p);
  if (!fileExists) return { state: 'missing', exact: false, cands: [], fileExists: false, reason: '文件不存在 notes/' + f };
  const titles = sectionTitles(root, f) || [];
  return resolveFromTitles(titles, name, true);
}
/** `§A/§B` 逐部分三态 + **聚合四态**（全部 exists ⇒ exists；部分可解析 ⇒ `partial`；
 *  无 missing 但有 ambiguous ⇒ ambiguous；全不可解析 ⇒ missing）。
 *  ⚠ `partial` 只作用于准入策略（放行 + 提示）——名字级判定始终三态。 */
export function resolveSectionSpec(root, file, spec) {
  const names = String(spec == null ? '' : spec).split('/').map((s) => s.replace(/^§/, '').trim()).filter(Boolean);
  if (!names.length) return { agg: 'missing', parts: [] };
  const parts = names.map((name) => ({ name, res: resolveSection(root, file, name) }));
  const nMissing = parts.filter((p) => p.res.state === 'missing').length;
  const nAmbig = parts.filter((p) => p.res.state === 'ambiguous').length;
  const nOk = parts.length - nMissing - nAmbig;
  const agg = nMissing === 0
    ? (nAmbig > 0 ? 'ambiguous' : 'exists')
    : (nOk + nAmbig === 0 ? 'missing' : 'partial');
  return { agg, parts };
}
/** 一行可含**多个文件指针**与 `§A/§B` 并列 ⇒ 状态机扫描（不吞掉后续文件指针、不把 `/notes/x.md` 当小节名）。
 *  ⚠ 必须与 `src/section-ref.ts#pointersOfRow` 逐例同结论（差分锁守）。 */
export function pointersOfRow(line) {
  const s = String(line == null ? '' : line);
  const toks = [];
  const re = /notes\/([A-Za-z0-9_.-]+)\.md/g;
  let m;
  while ((m = re.exec(s)) !== null) toks.push({ file: m[1] + '.md', at: m.index, end: m.index + m[0].length });
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const stop = i + 1 < toks.length ? toks[i + 1].at : s.length;
    const tail = s.slice(toks[i].end, stop);
    if (!/^\s*§/.test(tail)) continue; // 该文件 token 后没有 § 段 ⇒ 不是小节指针
    const spec = [];
    for (const seg of tail.split('/').map((x) => x.trim()).filter(Boolean)) {
      if (/\.md$/.test(seg)) break; // 已进入下一个文件指针（由上层 token 处理）
      spec.push(seg.replace(/^§/, '').trim());
    }
    if (spec.length) out.push({ file: toks[i].file, spec: spec.join('/') });
  }
  return out;
}
/** 索引行准入（S1R · D3 唯一强制点）：`missing`（全不可解析）⇒ 不可写；
 *  `partial`（父节可回落）/ `ambiguous`（同名多候选）⇒ **放行 + 提示**
 *  ⚠ **2026-09-19 收口（真库实测病灶）**：`partial` 里**末段缺失**的那一支 ⇒ **视同 missing，拒写**。
 *   病灶形状：`§npm 失效与残留 shim 修复/junction 装配漂移` —— 父节在、子节**没落地**（同批 append 失败）
 *   ⇒ 旧策略"partial 一律放行"把它写成**孤儿指针**（真库 `check-section-refs` partial 0→1 翻红）。
 *   索引行与明细**同写 / 同不写**才是准入的本意；中段缺失仍放行（读侧可回落）。 */
export function admitIndexRow(root, line) {
  const missing = []; const partial = []; const ambiguous = [];
  for (const p of pointersOfRow(line)) {
    const { agg, parts } = resolveSectionSpec(root, p.file, p.spec);
    if (agg === 'missing') {
      const bad = parts.find((x) => x.res.state === 'missing');
      missing.push({ file: p.file, spec: p.spec, name: bad ? bad.name : p.spec });
    } else if (agg === 'partial') {
      partial.push({
        file: p.file,
        spec: p.spec,
        missing: parts.filter((x) => x.res.state === 'missing').map((x) => x.name),
        resolved: parts.filter((x) => x.res.state !== 'missing').map((x) => x.name),
      });
      const last = parts[parts.length - 1];
      if (last && last.res.state === 'missing') missing.push({ file: p.file, spec: p.spec, name: last.name });
    } else if (agg === 'ambiguous') {
      const amb = parts.find((x) => x.res.state === 'ambiguous');
      ambiguous.push({ file: p.file, spec: p.spec, cands: (amb ? amb.res.cands : []).map((c) => c.title) });
    }
  }
  return { ok: missing.length === 0, missing, partial, ambiguous };
}

// ── CLI（被直接执行时）──
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === (isAbsolute(process.argv[1]) ? process.argv[1] : join(process.cwd(), process.argv[1]));
if (isMain) {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx > -1 && argv[rootIdx + 1] ? argv[rootIdx + 1]
    : (process.env.MEMORY_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));
  const asJson = argv.includes('--json');
  const rowIdx = argv.indexOf('--row');
  if (rowIdx > -1) {
    const line = argv[rowIdx + 1] || '';
    const r = admitIndexRow(root, line);
    if (asJson) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`索引行准入: ${r.ok ? '允许' : '拒绝'} | 全不可解析 ${r.missing.length} 处 | 路径部分悬空 ${r.partial.length} 处 | 歧义 ${r.ambiguous.length} 处`);
      for (const m of r.missing) console.log(`  ⛔ notes/${m.file} §${m.name} 不存在`);
      for (const p of r.partial) console.log(`  ⚠ notes/${p.file} §${p.spec} 子节缺 ${p.missing.join('/')}（读侧回落 ${p.resolved.join('/')}）`);
      for (const a of r.ambiguous) console.log(`  ⚠ notes/${a.file} §${a.spec} 有 ${a.cands.length} 个同名候选：${a.cands.join(' | ')}`);
    }
    process.exit(r.ok ? 0 : 2);
  }
  const pos = argv.filter((a, i) => !a.startsWith('--') && i !== rootIdx + 1);
  const [fileArg, nameArg] = pos;
  if (!fileArg || !nameArg) {
    console.error('用法: node section-ref.mjs <notes/x.md|env.md> "<小节名>" [--json] [--root <库根>]');
    console.error('      node section-ref.mjs --row "<索引行原文>" [--json] [--root <库根>]');
    process.exit(3);
  }
  const r = resolveSection(root, fileArg, nameArg);
  if (asJson) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`state=${r.state} exact=${r.exact} fileExists=${r.fileExists}${r.reason ? ' reason=' + r.reason : ''}`);
    for (const c of r.cands) console.log(`  ${'#'.repeat(c.level)} ${c.title}  (core=${c.core}${c.exact ? ' · 精确' : ''})`);
  }
  process.exit(r.state === 'exists' ? 0 : r.state === 'ambiguous' ? 2 : 1);
}
