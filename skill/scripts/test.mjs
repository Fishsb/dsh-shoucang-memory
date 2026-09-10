#!/usr/bin/env node
// test.mjs — managing-memory 冒烟测试（Anthropic「用真实使用测试」落地）
// 覆盖：体检（exit 0 / 超容量 2 / 悬空指针 5）+ 门禁（正常 0 / 超容量 1 / 悬空 2 / 用法 3）
// 用法: node scripts/test.mjs （只读 + 临时副本，不改动真实记忆）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); // 公开树（规则/引擎/脚本）
// 数据根：MEMORY_ROOT 显式 > 自动探测 _memory/（ADR-0006 开发仓布局）> repoDir（生产技能副本旧布局兼容）
const dataDir = process.env.MEMORY_ROOT
  || (fs.existsSync(path.join(repoDir, '_memory', 'MEMORY.md')) ? path.join(repoDir, '_memory')
    // ADR-0006 开发仓布局：数据在「仓根 `_memory/`」，而脚本在「<仓根>/skill/scripts/」——repoDir 指向 skill/，
    // 故须再向上一层探测；缺此分支时开发仓内 dataDir 落回 skill/（无 MEMORY.md）→ 夹具 ENOENT 中止整套。
    : (fs.existsSync(path.join(repoDir, '..', '_memory', 'MEMORY.md')) ? path.join(repoDir, '..', '_memory') : repoDir));
const health = path.join(repoDir, 'scripts', 'memory_health_check.mjs');
const gate = path.join(repoDir, 'scripts', 'memory_write_gate.mjs');
const cand = path.join(repoDir, 'scripts', 'candidate_grep.mjs');
// 容器工厂：公开树副本 + 私人数据并入根（数据根=容器根，脚本自定位即可用，无本机路径）
function makeContainer() {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'amem-t-'));
  fs.cpSync(repoDir, t, { recursive: true, filter: (s) => !/(node_modules|\\.git(?:[\\\\/]|$)|_memory|\\.internal|\\.gov-bench)/.test(s) });
  if (dataDir !== repoDir) { for (const e of fs.readdirSync(dataDir, { withFileTypes: true })) fs.cpSync(path.join(dataDir, e.name), path.join(t, e.name), { recursive: true, force: true }); }
  return t;
}

// 夹具净化（体检类）：体检退出码是 **max 语义**（5>4>3>2），故「容量」类用例的容器必须不含指针/格式类问题，
// 否则容器里既有的 5 级问题会压过容量的 2，用例永远拿不到期望码 —— 真实库积累告警后即失效（2026-09-10 实测）。
// 只净化夹具副本，不改真实库。（同 cleanContainer 的隔离思路，见下方归档段）
function sanitizeIndexes(c) {
  for (const name of ['MEMORY.md', 'USER.md', 'AGENT.md']) {
    const p = path.join(c, name);
    if (!fs.existsSync(p)) continue;
    const kept = fs.readFileSync(p, 'utf8').split(/\r?\n/)
      .filter((l) => !/^\s*[-[]/.test(l) || /→\s*notes\//.test(l));
    fs.writeFileSync(p, kept.join('\n'));
  }
  return c;
}

let pass = 0, fail = 0;
function run(label, cmd, args, expected, root) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', cwd: root || dataDir, env: dataDir === repoDir ? process.env : { ...process.env, MEMORY_ROOT: dataDir } });
    const ok = expected.includes(0);
    if (ok) pass++; else fail++;
    console.log(`${ok ? '✅' : '❌'} ${label} (exit=0，期望 ${expected.join('/')})`);
  } catch (e) {
    const code = e.status ?? -1;
    const ok = expected.includes(code);
    if (ok) pass++; else fail++;
    console.log(`${ok ? '✅' : '❌'} ${label} (exit=${code}，期望 ${expected.join('/')})`);
  }
}

// 取输出而不因非零退出抛错：体检在真实库上会带告警退出（max 语义 5>4>3>2），
// 而下列用例断言的是「输出内容」（零召回清单 / AGENT 段 / 标签样例），与退出码无关。
// 同 runC（archive-check）既有先例：非零也取 stdout。
function execOut(cmd, args, opts) {
  try { return { code: 0, out: execFileSync(cmd, args, { encoding: 'utf8', ...opts }) }; }
  catch (e) { return { code: e.status ?? -1, out: String(e.stdout || '') }; }
}

// 容量红线（= spec v20 默认：画像 3,000 · 记忆 5,000）——夹具尺寸一律由此推导，勿散落字面量
const CAP = { 'MEMORY.md': 5000, 'USER.md': 3000, 'AGENT.md': 3000 }

// 1) 真实目录体检 —— 冒烟：必须跑完并给出「档内退出码」。
// 注：真实库是活的，会合法积累告警级问题（无指针索引行 / 未登记元数据主题 / 失效 archive mark 等），
// 而体检退出码是 max 语义（5>4>3>2），故不能断言健康码 0/2 —— 那会随库增长而红（2026-09-10 实测 exit=5）。
// 「健康路径 → 0」由 1b 净容器用例覆盖。
run('体检-真实目录（冒烟：档内码）', 'node', [health], [0, 2, 3, 4, 5]);

// 1b) 净容器体检 → exit 0（健康路径回归覆盖：夹具净化 + 压低容量至 85% 以下，纯夹具操作）
const t0 = sanitizeIndexes(makeContainer());
{
  const p0 = path.join(t0, 'MEMORY.md');
  const ls0 = fs.readFileSync(p0, 'utf8').split(/\r?\n/);
  while (ls0.length > 3 && ls0.join('\n').replace(/\s/g, '').length > 0.8 * CAP['MEMORY.md']) ls0.pop();
  fs.writeFileSync(p0, ls0.join('\n'));
}
run('体检-净容器', 'node', [health, t0], [0]);
fs.rmSync(t0, { recursive: true, force: true });

// 2) 构造超容量副本 → exit 2（先净化掉指针/格式类问题，再垫到 ~90%：>85% 警戒线且 <100% 硬限）
const t1 = sanitizeIndexes(makeContainer());
const memPath = path.join(t1, 'MEMORY.md');
const baseChars = fs.readFileSync(memPath, 'utf8').replace(/\s/g, '').length;
const padChars = Math.max(0, Math.ceil(0.9 * CAP['MEMORY.md']) - baseChars); // 夹取到 0：真实库可能已超 90%，原算式曾致 repeat(-58) 中止整套
fs.appendFileSync(memPath, '\n[env] 测试填充（2026-09-01）[agent] → notes/env.md §填充：' + '填充内容'.repeat(Math.ceil(padChars / 4)));
run('体检-超容量>85%', 'node', [health, t1], [2]);

// 3) 构造悬空指针副本 → exit 5
const t2 = makeContainer();
fs.appendFileSync(path.join(t2, 'MEMORY.md'), '\n[env] 悬空指针（2026-09-01）[agent] → notes/nofile.md');
run('体检-悬空指针', 'node', [health, t2], [5]);

// 门禁用例基座：**必须压到容量线以下**。真实 MEMORY.md 曾顶格（2026-09-11 改前实测 2935/3000 = 98%；
// 容量门默认调为 5,000 后为 3109/5000 = 62%），直接在其上追加任意一行就会先撞 exit 1（容量），
// 从而**掩蔽**用例真正要验的码（如悬空 exit 2）——与 ACT-028 修过的「夹具未隔离缺陷类」同一类问题，此处是**门禁侧的漏网**。
const gateBase = (p) => {
  const lines = fs.readFileSync(path.join(dataDir, 'MEMORY.md'), 'utf8').split(/\r?\n/);
  while (lines.length > 3 && lines.join('\n').replace(/\s/g, '').length > 0.8 * CAP['MEMORY.md']) lines.pop();
  fs.writeFileSync(p, lines.join('\n'));
  return p;
};

// 4) 门禁-正常 → exit 0
const g1 = gateBase(path.join(t2, 'gate1.txt'));
run('门禁-正常', 'node', [gate, 'MEMORY.md', g1], [0]);

// 5) 门禁-超容量 → exit 1
// 追加量按实际基座推导：原固定 '内容'×1000=2,000 字在容量 5,000 下**不再必然越线**
//（2026-09-11 实测基座 2,951 + 2,026 = 4,977 < 5,000 ⇒ 落成格式错 exit 4，用例假红）。
const g2 = path.join(t2, 'gate2.txt');
fs.copyFileSync(g1, g2);
{
  const baseChars2 = fs.readFileSync(g2, 'utf8').replace(/\s/g, '').length;
  const over = CAP['MEMORY.md'] - baseChars2 + 200; // 保证越过容量线 200 字（含追加行前缀）
  fs.appendFileSync(g2, '\n§\n' + '[env] 超量（2026-09-01）[agent]：' + '内容'.repeat(Math.ceil(Math.max(0, over) / 2)));
}
run('门禁-超容量', 'node', [gate, 'MEMORY.md', g2], [1]);

// 6) 门禁-悬空指针 → exit 2
const g3 = path.join(t2, 'gate3.txt');
fs.copyFileSync(g1, g3);
fs.appendFileSync(g3, '\n§\n[env] 悬空（2026-09-01）[agent]：细节→ notes/nofile.md');
run('门禁-悬空指针', 'node', [gate, 'MEMORY.md', g3], [2]);

// 7) 门禁-用法错误 → exit 3
run('门禁-用法错误', 'node', [gate], [3]);

// 8) 门禁-notes 子文档目标 → exit 0
const g4 = path.join(t2, 'gate4.txt');
fs.writeFileSync(g4, '# notes/tools.md — 工具配置详情\n\n## 测试\n- 占位（2026-09-01）\n');
run('门禁-notes目标', 'node', [gate, 'notes/tools.md', g4], [0]);

// 9) 候选召回-冒烟（存在明文会话 exit 0/1 均可，重点不崩溃、输出含"召回"字样）
run('候选召回-冒烟', 'node', [cand], [0, 1]);

// 10) 候选召回-纯只读验证（运行后技能目录无新文件/无 pending 新增）
const pendBefore = fs.readdirSync(path.join(dataDir, 'pending')).filter((f) => f.endsWith('.md') && f !== 'README.md').length;
try { execFileSync('node', [cand, '--max', '1'], { encoding: 'utf8', cwd: dataDir, stdio: 'ignore' }); } catch {}
const pendAfter = fs.readdirSync(path.join(dataDir, 'pending')).filter((f) => f.endsWith('.md') && f !== 'README.md').length;
const clean = pendBefore === pendAfter;
if (clean) pass++; else fail++;
console.log(`${clean ? '✅' : '❌'} 候选召回-纯只读（pending ${pendBefore}→${pendAfter}，无写入）`);

// 11) read_section-access.log 追加（临时副本验证）
try {
  const t3 = makeContainer();
  fs.rmSync(path.join(t3, 'audit', 'access.log'), { force: true });
  execFileSync('node', [path.join(t3, 'scripts', 'read_section.mjs'), 'notes/env.md', '视觉方案'], { encoding: 'utf8', cwd: t3, env: { ...process.env, MEMORY_ROOT: t3 }, stdio: 'ignore' });
  const acc = fs.readFileSync(path.join(t3, 'audit', 'access.log'), 'utf8');
  const okAcc = /视觉方案/.test(acc);
  if (okAcc) pass++; else fail++;
  console.log(`${okAcc ? '✅' : '❌'} read_section-access.log（定位后追加 "${acc.trim().slice(0, 60)}..."）`);
  fs.rmSync(t3, { recursive: true, force: true });
} catch { fail++; console.log('❌ read_section-access.log（异常）'); }

// 清理临时副本
fs.rmSync(t1, { recursive: true, force: true });
fs.rmSync(t2, { recursive: true, force: true });

// 12) archive-mark upsert（每会话仅一条，后写生效）
try {
  const t4 = makeContainer();
  const mk = path.join(t4, 'scripts', 'archive-mark.mjs');
  const log = path.join(t4, 'audit', 'archive-progress.jsonl');
  execFileSync('node', [mk, 'sid-aaa', '5', '--total', '100'], { cwd: t4, env: { ...process.env, MEMORY_ROOT: t4 }, stdio: 'ignore' });
  execFileSync('node', [mk, 'sid-aaa', '42', '--total', '100', '--done'], { cwd: t4, env: { ...process.env, MEMORY_ROOT: t4 }, stdio: 'ignore' });
  const ls = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  const cnt = ls.filter((l) => JSON.parse(l).sessionId === 'sid-aaa').length;
  const okU = cnt === 1 && JSON.parse(ls.find((l) => l.includes('sid-aaa'))).lastRow === 42;
  if (okU) pass++; else fail++;
  console.log(`${okU ? '✅' : '❌'} archive-mark-upsert（${cnt} 条/最后值 ${okU ? '' : '✗'}）`);
  fs.rmSync(t4, { recursive: true, force: true });
} catch { fail++; console.log('❌ archive-mark-upsert（异常）'); }

// 13) archive-check 增量范围（mark lastRow 后只报新增行 + 信号召回命中）
try {
  const t5 = makeContainer();
  const src = path.join(t5, 'tmp-transcript.txt');
  fs.writeFileSync(src, 'l1\nl2\nl3\nl4\n记住这个坑：用前端封装\nl6\nl7\n');
  execFileSync('node', [path.join(t5, 'scripts', 'archive-mark.mjs'), src, '4'], { cwd: t5, env: { ...process.env, MEMORY_ROOT: t5 }, stdio: 'ignore' });
  const out = execFileSync('node', [path.join(t5, 'scripts', 'archive-check.mjs'), src, '--sig'], { encoding: 'utf8', cwd: t5, env: { ...process.env, MEMORY_ROOT: t5 } });
  const okC = /增量范围: \(4, 7\]/.test(out) && /记住这个坑/.test(out);
  if (okC) pass++; else fail++;
  console.log(`${okC ? '✅' : '❌'} archive-check-增量（只报新增行+召回命中）`);
  fs.rmSync(t5, { recursive: true, force: true });
} catch { fail++; console.log('❌ archive-check-增量（异常）'); }

// ===== 方案 B：定时唤醒归档检测（T14-T18；临时容器 + env 隔离，真实 audit/pending 不触碰）=====
const realLog = path.join(dataDir, 'audit', 'archive-progress.jsonl');
const realPendDir = path.join(dataDir, 'audit', 'archive-pending');
const REAL_LOG_BEFORE = fs.existsSync(realLog) ? fs.readFileSync(realLog, 'utf8') : '';
const REAL_PEND_BEFORE = fs.existsSync(realPendDir) ? fs.readdirSync(realPendDir).length : 0;
const failMsg = (e) => String((e && (e.message || e.stderr)) || e).split('\n').filter((l) => l.trim() && !/inspector/.test(l)).slice(0, 3).join(' | ').slice(0, 200);
// 容器夹具净化：cpSync 会把真实 progress log（含 armed 的真实 mark）与 pending 文件复制进容器——
// 若不清理，容器内 due 会误处理「借尸还魂」的真实 mark（armed 恰在两轮 due 间到期 → 断言抖动）。dev 日志空故不触发、prod 非空必触发。
const cleanContainer = (c) => {
  const log = path.join(c, 'audit', 'archive-progress.jsonl');
  if (fs.existsSync(log)) fs.writeFileSync(log, '');
  const pd = path.join(c, 'audit', 'archive-pending');
  if (fs.existsSync(pd)) for (const f of fs.readdirSync(pd)) fs.rmSync(path.join(pd, f), { force: true });
};

// 14) touch/due 状态机：touch 重计时 → due 到点触发落队列 → pending/fireAt 清理 → 幂等不重触发
try {
  const t6 = makeContainer();
  cleanContainer(t6);
  const sess = path.join(t6, 'sessions', 'sess-x');
  fs.mkdirSync(sess, { recursive: true });
  fs.writeFileSync(path.join(sess, 'session.jsonl'), Array.from({ length: 60 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
  fs.utimesSync(path.join(sess, 'session.jsonl'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3)); // 回拨 mtime：消除活跃保护 1ms 竞态
  const env = { ...process.env, ARCHIVE_SESSIONS: path.join(t6, 'sessions'), ARCHIVE_LOG: path.join(t6, 'audit', 'archive-progress.jsonl'), ARCHIVE_PENDING: path.join(t6, 'audit', 'archive-pending'), ARCHIVE_SILENT_MS: '1', ARCHIVE_MECH_NOOP_LINES: '0', MEMORY_ROOT: t6 };
  const jx = (f, a) => JSON.parse(execFileSync('node', [path.join(t6, 'scripts', f), ...a], { encoding: 'utf8', env }));
  jx('archive-mark.mjs', ['sess-x', '--touch', '--lastRow', '0', '--json']);
  const st1 = jx('archive-timer.mjs', ['--status', '--json']);
  execFileSync('node', [path.join(t6, 'scripts', 'archive-timer.mjs'), '--due'], { encoding: 'utf8', env });
  const st2 = jx('archive-timer.mjs', ['--status', '--json']);
  const q = JSON.parse(fs.readFileSync(path.join(t6, 'audit', 'archive-pending', 'sess-x.json'), 'utf8'));
  const due2 = jx('archive-timer.mjs', ['--due', '--json']);
  const s1 = st1.find((m) => m.sessionId === 'sess-x'); // 按 sid 取数：容器 log 可能含复制进来的真实会话条目，位置不可靠
  const s2 = st2.find((m) => m.sessionId === 'sess-x');
  const okB = s1?.fireAt > 0 && s1?.pending === false
    && s2?.pending === true && s2?.fireAt == null
    && q.delta === 60 && Array.isArray(q.signals)
    && due2.count === 0;
  if (okB) pass++; else fail++;
  console.log(`${okB ? '✅' : '❌'} 方案B-touch/due（fireAt→fired→pending/幂等不重触发）`);
  fs.rmSync(t6, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-touch/due（异常: ' + failMsg(e) + '）'); }

// 15) 资格门控：行数不足 → rearm 不入队；资格达标后 → fired
try {
  const t7 = makeContainer();
  cleanContainer(t7);
  const sess = path.join(t7, 'sessions', 'sess-y');
  fs.mkdirSync(sess, { recursive: true });
  fs.writeFileSync(path.join(sess, 'session.jsonl'), Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
  const env = { ...process.env, ARCHIVE_SESSIONS: path.join(t7, 'sessions'), ARCHIVE_LOG: path.join(t7, 'audit', 'archive-progress.jsonl'), ARCHIVE_PENDING: path.join(t7, 'audit', 'archive-pending'), ARCHIVE_SILENT_MS: '1', ARCHIVE_MECH_NOOP_LINES: '0', MEMORY_ROOT: t7 };
  const jx = (f, a, e2 = env) => JSON.parse(execFileSync('node', [path.join(t7, 'scripts', f), ...a], { encoding: 'utf8', env: e2 }));
  jx('archive-mark.mjs', ['sess-y', '--touch', '--lastRow', '0', '--json']);
  execFileSync('node', [path.join(t7, 'scripts', 'archive-timer.mjs'), '--due'], { encoding: 'utf8', env }); // MIN_LINES=50 → rearm
  const st1 = jx('archive-timer.mjs', ['--status', '--json']);
  const noQueue = !fs.existsSync(path.join(t7, 'audit', 'archive-pending', 'sess-y.json'));
  const env2 = { ...env, ARCHIVE_MIN_LINES: '10' }; // 资格达标（10≥10）→ fired
  execFileSync('node', [path.join(t7, 'scripts', 'archive-timer.mjs'), '--due'], { encoding: 'utf8', env: env2 });
  const st2 = jx('archive-timer.mjs', ['--status', '--json']);
  const s1 = st1.find((m) => m.sessionId === 'sess-y'); // 按 sid 取数（同 T14）
  const s2 = st2.find((m) => m.sessionId === 'sess-y');
  const okG = s1?.fireAt != null && noQueue && s2?.pending === true;
  if (okG) pass++; else fail++;
  console.log(`${okG ? '✅' : '❌'} 方案B-资格门控（不足 rearm 不入队/达标 fired）`);
  fs.rmSync(t7, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-资格门控（异常: ' + failMsg(e) + '）'); }

// 16) done+新行：done 态出现新行 → touch 重武装（数据驱动失效）→ due fired（队列带 done 标记）
try {
  const t8 = makeContainer();
  cleanContainer(t8);
  const sess = path.join(t8, 'sessions', 'sess-z');
  fs.mkdirSync(sess, { recursive: true });
  const sessFile = path.join(sess, 'session.jsonl');
  fs.writeFileSync(sessFile, Array.from({ length: 60 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
  const env = { ...process.env, ARCHIVE_SESSIONS: path.join(t8, 'sessions'), ARCHIVE_LOG: path.join(t8, 'audit', 'archive-progress.jsonl'), ARCHIVE_PENDING: path.join(t8, 'audit', 'archive-pending'), ARCHIVE_SILENT_MS: '1', ARCHIVE_MECH_NOOP_LINES: '0', MEMORY_ROOT: t8 };
  const jx = (f, a) => JSON.parse(execFileSync('node', [path.join(t8, 'scripts', f), ...a], { encoding: 'utf8', env }));
  execFileSync('node', [path.join(t8, 'scripts', 'archive-mark.mjs'), 'sess-z', '60', '--total', '60', '--done'], { env, stdio: 'ignore' });
  const runC = (a) => { try { return { code: 0, out: execFileSync('node', [path.join(t8, 'scripts', 'archive-check.mjs'), ...a], { encoding: 'utf8', env }) }; } catch (e) { return { code: e.status, out: e.stdout || '' }; } };
  const c1 = JSON.parse(runC(['sess-z', '--json']).out); // done 无增量：check 按契约 exit 2，消费其 JSON
  fs.appendFileSync(sessFile, Array.from({ length: 10 }, (_, i) => `l${i + 61}`).join('\n') + '\n');
  const c2r = runC(['sess-z', '--json']);
  const c2 = JSON.parse(c2r.out);
  jx('archive-mark.mjs', ['sess-z', '--touch', '--lastRow', '60', '--json']);
  execFileSync('node', [path.join(t8, 'scripts', 'archive-timer.mjs'), '--due'], { encoding: 'utf8', env });
  const q = JSON.parse(fs.readFileSync(path.join(t8, 'audit', 'archive-pending', 'sess-z.json'), 'utf8'));
  const okD = c2r.code === 0 && c1.done === true && c1.hasDelta === false
    && c2.hasDelta === true && c2.delta.count === 10
    && q.delta === 10 && q.done === true;
  if (okD) pass++; else fail++;
  console.log(`${okD ? '✅' : '❌'} 方案B-done+新行（数据失效/touch 重武装/队列带 done）`);
  fs.rmSync(t8, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-done+新行（异常: ' + failMsg(e) + '）'); }

// 17) --json 结构化：check --json --sig 字段契约（增量内信号）+ 召回降噪（todo/title 元数据行不进召回）
try {
  const t9 = makeContainer();
  const src = path.join(t9, 'tmp-transcript.txt');
  const todoLine = JSON.stringify({ type: 'todo/write', seq: 1, data: { todos: [{ content: '方案B 决策 todo 内容' }] } });
  const userLine = JSON.stringify({ type: 'user/message', seq: 2, data: { content: [{ type: 'text', text: '记住这个坑：用前端封装' }] } });
  fs.writeFileSync(src, 'l1\n' + todoLine + '\n' + userLine + '\nl4\nl5\n');
  execFileSync('node', [path.join(t9, 'scripts', 'archive-mark.mjs'), src, '1'], { cwd: t9, env: { ...process.env, MEMORY_ROOT: t9 }, stdio: 'ignore' });
  const c = JSON.parse(execFileSync('node', [path.join(t9, 'scripts', 'archive-check.mjs'), src, '--json', '--sig'], { encoding: 'utf8', cwd: t9, env: { ...process.env, MEMORY_ROOT: t9 } }));
  const hitTexts = c.signals.map((s) => s.text).join('|');
  const okJ = c.total === 5 && c.lastRow === 1 && c.hasDelta === true
    && c.delta.from === 2 && c.delta.to === 5 && c.delta.count === 4
    && Array.isArray(c.signals) && c.signals.length >= 1
    && hitTexts.includes('记住这个坑') && !hitTexts.includes('todo'); // 用户正文命中；todo 元数据行降噪
  if (okJ) pass++; else fail++;
  console.log(`${okJ ? '✅' : '❌'} 方案B-check--json（字段契约+正文召回+元数据降噪）`);
  fs.rmSync(t9, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-check--json（异常: ' + failMsg(e) + '）'); }

// 19) 会话发现：静默未 mark 会话 → due 自动建 mark → 立即处理（fired 或 rearm），真实会话零触碰
try {
  const ta = makeContainer();
  cleanContainer(ta); // 必须净化：真实库 progress log 非空（含真实 mark），否则容器内「借尸还魂」的 mark 会让 due2.count===0 幂等断言必败（见 L143-144 注释）
  const sessRoot = path.join(ta, 'sessions', 'proj');
  const sd = path.join(sessRoot, 'session-d1');
  fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(sd, 'session.jsonl'), Array.from({ length: 60 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
  fs.utimesSync(path.join(sd, 'session.jsonl'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3)); // mtime 1h 前=已静默
  const env = { ...process.env, ARCHIVE_SESSIONS: sessRoot, ARCHIVE_LOG: path.join(ta, 'audit', 'archive-progress.jsonl'), ARCHIVE_PENDING: path.join(ta, 'audit', 'archive-pending'), ARCHIVE_SILENT_MS: '1', ARCHIVE_DISCOVER: '1', ARCHIVE_MECH_NOOP_LINES: '0', MEMORY_ROOT: ta };
  const due1 = JSON.parse(execFileSync('node', [path.join(ta, 'scripts', 'archive-timer.mjs'), '--due', '--json'], { encoding: 'utf8', env }));
  const st = JSON.parse(execFileSync('node', [path.join(ta, 'scripts', 'archive-timer.mjs'), '--status', '--json'], { encoding: 'utf8', env }));
  const m = st.find((x) => x.sessionId === 'd1'); // sid 约定：目录名 session-d1 → mark 键 d1（无前缀，与 touch/check 一致）
  const due1d = due1.fired.find((f) => f.sid === 'd1' && f.action === 'discovered');
  const due1p = due1.fired.find((f) => f.sid === 'd1' && (f.action === 'fired' || f.action === 'rearm'));
  const due2 = JSON.parse(execFileSync('node', [path.join(ta, 'scripts', 'archive-timer.mjs'), '--due', '--json'], { encoding: 'utf8', env }));
  const okN = due1d && due1p && m?.pending === true && due2.count === 0;
  if (okN) pass++; else fail++;
  console.log(`${okN ? '✅' : '❌'} 方案B-会话发现（未 mark 静默→discover→${due1p?.action || '?'}→幂等不重复）`);
  fs.rmSync(ta, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-会话发现（异常: ' + failMsg(e) + '）'); }

// 18) env 隔离（溯源断言）：容器跑完，真实 audit 不得出现任何测试容器 sid（daemon 常驻会合法增删真实 mark，
//     故不做逐字节比对；只验「测试未污染真实库」= 真实日志无测试 sid 条目）
{
  const TEST_SIDS = ['sess-x', 'sess-y', 'sess-z', 'act', 'd1', 'sess-frag', 'drain-a', 'drain-b', 'drain-c', 'sess-act', 'session-act', 'session-d1'];
  const logRaw = fs.existsSync(realLog) ? fs.readFileSync(realLog, 'utf8') : '';
  const leaked = logRaw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).sessionId; } catch { return ''; } }).filter((sid) => TEST_SIDS.includes(sid));
  const pendAfter = fs.existsSync(realPendDir) ? fs.readdirSync(realPendDir).length : 0;
  const okI = leaked.length === 0; // 测试 sid 不得泄漏进真实 progress log
  if (okI) pass++; else fail++;
  console.log(`${okI ? '✅' : '❌'} 方案B-env隔离（真实库无测试 sid 泄漏 ${leaked.length} / pending 现状 ${pendAfter}）`);
}

// 20) 活跃保护 + 数据驱动重武装：①到点但转录新鲜（忘 touch 模拟）→rearm 不入队；②静默后→fired；③clear 后转录变化→数据重武装→再 fired
try {
  const tb = makeContainer();
  cleanContainer(tb);
  const sessRoot = path.join(tb, 'sessions', 'p2');
  const sd = path.join(sessRoot, 'session-act');
  fs.mkdirSync(sd, { recursive: true });
  const sf = path.join(sd, 'session.jsonl');
  fs.writeFileSync(sf, Array.from({ length: 60 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
  const env = { ...process.env, ARCHIVE_SESSIONS: sessRoot, ARCHIVE_LOG: path.join(tb, 'audit', 'archive-progress.jsonl'), ARCHIVE_PENDING: path.join(tb, 'audit', 'archive-pending'), ARCHIVE_SILENT_MS: '60000', ARCHIVE_DISCOVER: '0', ARCHIVE_MECH_NOOP_LINES: '0', MEMORY_ROOT: tb }; // 保护窗口=60s
  const due = () => JSON.parse(execFileSync('node', [path.join(tb, 'scripts', 'archive-timer.mjs'), '--due', '--json'], { encoding: 'utf8', env }));
  const jx = (f, a) => JSON.parse(execFileSync('node', [path.join(tb, 'scripts', f), ...a], { encoding: 'utf8', env }));
  const logP = path.join(tb, 'audit', 'archive-progress.jsonl');
  const expireFireAt = () => { const ls = fs.readFileSync(logP, 'utf8').split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); if (o.sessionId === 'act') o.fireAt = Date.now() - 1000; return JSON.stringify(o); }); fs.writeFileSync(logP, ls.join('\n') + '\n'); };
  // ① touch 后把 fireAt 置为已过期（模拟忘 touch 的活跃会话：fireAt 到点但转录 mtime 新鲜）→ 活跃保护 rearm
  jx('archive-mark.mjs', ['act', '--touch', '--lastRow', '0', '--json']);
  expireFireAt();
  const r1 = due().fired.filter((f) => f.sid === 'act');
  const guard = r1.some((f) => f.action === 'rearm' && /活跃保护/.test(f.reason));
  const st1 = JSON.parse(execFileSync('node', [path.join(tb, 'scripts', 'archive-timer.mjs'), '--status', '--json'], { encoding: 'utf8', env })).find((x) => x.sessionId === 'act');
  // ② 回拨 mtime=已静默 → fireAt 已过期 → 真正 fired
  expireFireAt();
  fs.utimesSync(sf, new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  const r2 = due().fired.filter((f) => f.sid === 'act');
  const firedNow = r2.some((f) => f.action === 'fired' && f.delta === 60);
  // ③ 裁决清队 → 转录追加（模拟追加后归于静默：回拨 mtime）→ 数据驱动重武装 → 再 fired（fired 不改 lastRow，delta=62）
  execFileSync('node', [path.join(tb, 'scripts', 'archive-timer.mjs'), '--dequeue', 'act'], { env, stdio: 'ignore' });
  fs.appendFileSync(sf, 'new1\nnew2\n');
  fs.utimesSync(sf, new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  const r3a = due().fired.filter((f) => f.sid === 'act');
  const dataRearm = r3a.some((f) => f.action === 'rearm' && /数据驱动/.test(f.reason));
  const r3b = due().fired.filter((f) => f.sid === 'act');
  const firedAgain = r3b.some((f) => f.action === 'fired' && f.delta === 62);
  const okT = guard && st1?.pending === false && firedNow && dataRearm && firedAgain;
  if (okT) pass++; else fail++;
  console.log(`${okT ? '✅' : '❌'} 方案B-活跃保护+数据重武装（新鲜 rearm→静默 fired→clear 后变化再武装 fired）`);
  fs.rmSync(tb, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-活跃保护+数据重武装（异常: ' + failMsg(e) + '）'); }

// 21) 机械消化：无信号小会话（<500 行）→ 直接 done 不进裁决队列（碎片治理，不需 LLM）
try {
  const tc = makeContainer();
  cleanContainer(tc);
  const sess = path.join(tc, 'sessions', 'sess-frag');
  fs.mkdirSync(sess, { recursive: true });
  fs.writeFileSync(path.join(sess, 'session.jsonl'), Array.from({ length: 60 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
  fs.utimesSync(path.join(sess, 'session.jsonl'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  const env = { ...process.env, ARCHIVE_SESSIONS: path.join(tc, 'sessions'), ARCHIVE_LOG: path.join(tc, 'audit', 'archive-progress.jsonl'), ARCHIVE_PENDING: path.join(tc, 'audit', 'archive-pending'), ARCHIVE_SILENT_MS: '1', ARCHIVE_MECH_NOOP_LINES: '500', MEMORY_ROOT: tc };
  const d1 = JSON.parse(execFileSync('node', [path.join(tc, 'scripts', 'archive-timer.mjs'), '--due', '--json'], { encoding: 'utf8', env }));
  const st = JSON.parse(execFileSync('node', [path.join(tc, 'scripts', 'archive-timer.mjs'), '--status', '--json'], { encoding: 'utf8', env }));
  const m = st.find((x) => x.sessionId === 'sess-frag');
  const noopHit = d1.fired.some((f) => f.sid === 'sess-frag' && f.action === 'noop');
  const noQueue = !fs.existsSync(path.join(tc, 'audit', 'archive-pending', 'sess-frag.json'));
  const okF = noopHit && m?.done === true && m?.pending === false && noQueue;
  if (okF) pass++; else fail++;
  console.log(`${okF ? '✅' : '❌'} 方案B-机械消化（无信号小会话直接 done，不进队列）`);
  fs.rmSync(tc, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-机械消化（异常: ' + failMsg(e) + '）'); }

// 22) 排空模式 --drain：多个静默未 mark 会话一次性捞完消化（终结边清边长）
try {
  const td = makeContainer();
  cleanContainer(td);
  const sessRoot = path.join(td, 'sessions', 'proj');
  for (const sid of ['drain-a', 'drain-b', 'drain-c']) {
    const sd = path.join(sessRoot, 'session-' + sid);
    fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, 'session.jsonl'), Array.from({ length: 80 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
    fs.utimesSync(path.join(sd, 'session.jsonl'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  }
  const env = { ...process.env, ARCHIVE_SESSIONS: sessRoot, ARCHIVE_LOG: path.join(td, 'audit', 'archive-progress.jsonl'), ARCHIVE_PENDING: path.join(td, 'audit', 'archive-pending'), ARCHIVE_SILENT_MS: '1', ARCHIVE_MECH_NOOP_LINES: '500', MEMORY_ROOT: td };
  const d = JSON.parse(execFileSync('node', [path.join(td, 'scripts', 'archive-timer.mjs'), '--drain', '--json'], { encoding: 'utf8', env }));
  const nooped = ['drain-a', 'drain-b', 'drain-c'].every((sid) => (d.byAct || {})[sid] || (d.total >= 3)); // 简化：total≥3 且 action 含 noop
  const st = JSON.parse(execFileSync('node', [path.join(td, 'scripts', 'archive-timer.mjs'), '--status', '--json'], { encoding: 'utf8', env }));
  const allDone = ['drain-a', 'drain-b', 'drain-c'].every((sid) => st.find((x) => x.sessionId === sid)?.done === true);
  const okD = d.total >= 3 && d.byAct?.noop >= 3 && allDone && (d.byAct?.discovered || 0) >= 3;
  if (okD) pass++; else fail++;
  console.log(`${okD ? '✅' : '❌'} 方案B-排空drain（${d.total} 动作/rounds ${d.rounds}：一次性捞完静默未mark）`);
  fs.rmSync(td, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案B-排空drain（异常: ' + failMsg(e) + '）'); }

// 23) memory-append 固化安全阀：正常追加 / 无锚 exit 2 / 白名单外 exit 2（ADR-0002 v2 全自动固化基础）
try {
  const te = makeContainer();
  const ap = path.join(te, 'scripts', 'memory-append.mjs');
  const target = 'notes/tools.md'; // 容器内路径（append 自定位 te）
  // 锚点动态取容器 tools.md 首个小节名（小节标题带（日期）后缀，剥掉；不随夹具迁移漂移）
  const toolsText = fs.readFileSync(path.join(te, 'notes', 'tools.md'), 'utf8');
  const anchor = (toolsText.match(/^## (.+?)（/m) || [null, 'Zhihu 检索'])[1];
  const r1 = execFileSync('node', [ap, target, anchor, 'T23 验证条目 abcdef'], { encoding: 'utf8', cwd: te, env: { ...process.env, MEMORY_ROOT: te } }).trim();
  const okAppend = new RegExp('append notes/tools\\.md :: ' + anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(r1) && fs.readFileSync(path.join(te, 'notes', 'tools.md'), 'utf8').includes('T23 验证条目 abcdef');
  const r2 = (() => { try { execFileSync('node', [ap, target, '不存在的小节xyz', 'x'], { cwd: te, env: { ...process.env, MEMORY_ROOT: te }, stdio: 'pipe' }); return 0; } catch (e) { return e.status; } })();
  const r3 = (() => { try { execFileSync('node', [ap, 'docs/evil.md', 'x', 'y'], { cwd: te, env: { ...process.env, MEMORY_ROOT: te }, stdio: 'pipe' }); return 0; } catch (e) { return e.status; } })();
  const okErr = r2 === 2 && r3 === 2;
  const okGate = (() => { try { execFileSync('node', [ap, 'MEMORY.md', 'x', '--new', '[env] ' + '超限填充内容'.repeat(1000) + ' → notes/env.md §x'], { cwd: te, env: { ...process.env, MEMORY_ROOT: te }, stdio: 'pipe' }); return 0; } catch (e) { return e.status; } })() === 1;
  if (okAppend && okErr && okGate) pass++; else fail++;
  console.log(`${okAppend && okErr && okGate ? '✅' : '❌'} 方案C-memory-append（追加/无锚exit2/白名单exit2/主文档超限exit1）`);
  fs.rmSync(te, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 方案C-memory-append（异常: ' + failMsg(e) + '）'); }

// 24) health_check 零召回清单：稀疏 access.log → 报告含「零召回主题」段（降级提纯候选输出，exit 0/2 均可）
try {
  const tf = sanitizeIndexes(makeContainer());
  // 构造稀疏 access.log：只命中 env.md 一个小节，其余 notes 小节应进零召回清单
  const envText = fs.readFileSync(path.join(tf, 'notes', 'env.md'), 'utf8');
  const hitSec = (envText.match(/^## (.+?)（/m) || [null, 'DSH 环境'])[1];
  fs.mkdirSync(path.join(tf, 'audit'), { recursive: true });
  fs.writeFileSync(path.join(tf, 'audit', 'access.log'), JSON.stringify({ t: '2026-09-08T00:00:00Z', f: 'notes/env.md', s: hitSec }) + '\n');
  const out = execOut('node', [path.join(tf, 'scripts', 'memory_health_check.mjs')], { cwd: tf, env: { ...process.env, MEMORY_ROOT: tf } }).out;
  const listed = (out.match(/零召回主题 (\d+) 个/) || [])[1];
  const okFmt = /零召回主题 \d+ 个/.test(out) && /提纯降级/.test(out) && Number(listed) > 0;
  if (okFmt) pass++; else fail++;
  console.log(`${okFmt ? '✅' : '❌'} health-零召回清单（${listed || 0} 个候选，含提纯降级指引）`);
  fs.rmSync(tf, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ health-零召回清单（异常: ' + failMsg(e) + '）'); }

// 25) 习得原则写门与体检（v16：[原则] 行并入 AGENT.md）：正常 exit 0 / 超限 exit 1 / 格式违规 exit 4 / 体检 AGENT 段含原则 tag
try {
  const tg = sanitizeIndexes(makeContainer());
  const gate = path.join(tg, 'scripts', 'memory_write_gate.mjs');
  const p1 = path.join(tg, 'p1.txt');
  fs.writeFileSync(p1, '[原则] 排障先看根因 · 先验证成本低再修改成本高 → notes/lessons.md §网络坑\n');
  run('原则门-正常', 'node', [gate, 'AGENT.md', p1], [0]);
  const p2 = path.join(tg, 'p2.txt');
  fs.writeFileSync(p2, ('[原则] 超限填充 · 原则填充内容超限'.repeat(200) + ' → notes/lessons.md §x') + '\n');
  run('原则门-超容量', 'node', [gate, 'AGENT.md', p2], [1]);
  const p3 = path.join(tg, 'p3.txt');
  fs.writeFileSync(p3, '[经验] 缺概况段与指针行\n');
  run('原则门-格式违规', 'node', [gate, 'AGENT.md', p3], [4]);
  const hp = execOut('node', [path.join(tg, 'scripts', 'memory_health_check.mjs')], { cwd: tg, env: { ...process.env, MEMORY_ROOT: tg } }).out;
  const okP = /=== AGENT\.md/.test(hp) && /3,?000|3000/.test(hp);
  if (okP) pass++; else fail++;
  console.log(`${okP ? '✅' : '❌'} health-AGENT 段（容量 3000 输出，v16 原则并入）`);
  fs.rmSync(tg, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 习得原则门禁/体检（异常: ' + failMsg(e) + '）'); }

// 26) v17 [路径] 任务路径行门禁（对标 AWM）：正常 exit 0 / 步内 → 违规 exit 4 / 概要 >40 字 exit 4 / 体检 tags 含 '路径'
try {
  const tj = sanitizeIndexes(makeContainer());
  const gate = path.join(tj, 'scripts', 'memory_write_gate.mjs');
  const a1 = path.join(tj, 'a1.txt');
  fs.writeFileSync(a1, '[路径] DSH 插件升级 · ①构建验证 ②覆盖 lib ③重启 ④四端点 200 → notes/lessons.md §网络坑\n');
  run('路径门-正常', 'node', [gate, 'AGENT.md', a1], [0]);
  const a2 = path.join(tj, 'a2.txt');
  fs.writeFileSync(a2, '[路径] 升级 · ①备份 → ②覆盖 → ③重启 → notes/lessons.md §网络坑\n');
  run('路径门-步内箭头', 'node', [gate, 'AGENT.md', a2], [4]);
  const a3 = path.join(tj, 'a3.txt');
  fs.writeFileSync(a3, '[路径] 升级 · ' + '①②'.repeat(30) + ' → notes/lessons.md §网络坑\n');
  run('路径门-概要超40字', 'node', [gate, 'AGENT.md', a3], [4]);
  fs.appendFileSync(path.join(tj, 'AGENT.md'), '\n[路径] DSH 插件升级 · ①构建 ②覆盖 lib ③重启 ④验证 → notes/lessons.md §网络坑\n');
  const hp2 = execOut('node', [path.join(tj, 'scripts', 'memory_health_check.mjs')], { cwd: tj, env: { ...process.env, MEMORY_ROOT: tj } }).out;
  const agentSeg = (hp2.split('=== AGENT.md')[1] || '').split('===')[0]; // AGENT 段
  // tags 含 '路径' → 追加的 [路径] 行不得被判无标签：无标签为 0，或夹具自身有不合规行时该行不得出现在样例里
  const okPath = /无标签: 0/.test(agentSeg) || !/DSH 插件升级/.test(agentSeg);
  if (okPath) pass++; else fail++;
  console.log(`${okPath ? '✅' : '❌'} v17-[路径] 行门禁（正常0/步内箭头4/超40字4/体检 tag 含路径）`);
  fs.rmSync(tj, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ v17-[路径] 行门禁（异常: ' + failMsg(e) + '）'); }

// 27) § 小节存在性校验（2026-09-09 补缺：深睡产物曾指向 notes/flows.md §深睡蒸馏 空壳小节仍 gate=pass）：
//     真实小节 exit 0 / 空壳小节 exit 2 / 关键词缩写（双向包含）exit 0
try {
  const tx = makeContainer();
  const gate = path.join(tx, 'scripts', 'memory_write_gate.mjs');
  const s1 = path.join(tx, 's1.txt');
  fs.writeFileSync(s1, '[原则] 排障先看根因 · 先验证成本低再修改成本高 → notes/lessons.md §网络坑\n');
  run('小节门-真实小节', 'node', [gate, 'AGENT.md', s1], [0]);
  const s2 = path.join(tx, 's2.txt');
  fs.writeFileSync(s2, '[原则] 排障先看根因 · 先验证成本低再修改成本高 → notes/lessons.md §深睡蒸馏\n');
  run('小节门-空壳小节拒', 'node', [gate, 'AGENT.md', s2], [2]);
  const s3 = path.join(tx, 's3.txt');
  fs.writeFileSync(s3, '[路径] 深睡归纳 · ①起点先取值 ②三通道提炼 ③done 推进水位 → notes/lessons.md §网络坑\n');
  run('小节门-关键词缩写', 'node', [gate, 'AGENT.md', s3], [0]);
  fs.rmSync(tx, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ § 小节存在性校验（异常: ' + failMsg(e) + '）'); }

// 28) 召回评测器 recall-eval（只读观测工具，MCL/P0 观测面）：夹具会话 → 四项口径可复现；
//     无索引库 → 显式 exit 2（**防假零值**：探针为空时①恒 0，与「未被取用」不可区分，故必须报错）
try {
  const tk = makeContainer();
  const sessDir = path.join(tk, 'sessions', 'proj', 'session-eval1');
  fs.mkdirSync(sessDir, { recursive: true });
  const rp = path.join(tk, 'notes', 'env.md').replace(/\\/g, '\\\\');
  fs.writeFileSync(path.join(sessDir, 'session.jsonl'), [
    JSON.stringify({ type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: '任务' }] } }),
    JSON.stringify({ type: 'tool/call', seq: 2, data: { name: 'shoucang_recall', arguments: '{"query":"x"}' } }),
    JSON.stringify({ type: 'tool/call', seq: 3, data: { name: 'read', arguments: '{"file_path":"' + rp + '"}' } }),
  ].join('\n') + '\n');
  const jr = execOut('node', [path.join(tk, 'scripts', 'recall-eval.mjs'), '--sessions', path.join(tk, 'sessions'), '--bank', tk, '--n', '5', '--json'], { cwd: tk });
  let okEval = false;
  try { const j = JSON.parse(jr.out); okEval = j.totals.turns === 1 && j.totals.recallTool === 1 && j.totals.follow === 1; } catch { okEval = false; }
  if (okEval) pass++; else fail++;
  console.log(`${okEval ? '✅' : '❌'} 召回评测器（夹具会话：1 轮 / 召回 1 / 跟读 1）` +
    (okEval ? '' : ` [诊断: exit=${jr.code} out=${JSON.stringify(jr.out.slice(0, 160))}]`));

  const noBank = fs.mkdtempSync(path.join(os.tmpdir(), 'amem-nobank-'));
  const r2 = execOut('node', [path.join(tk, 'scripts', 'recall-eval.mjs'), '--sessions', path.join(tk, 'sessions'), '--bank', noBank, '--n', '3'], { cwd: tk });
  const okGuard = r2.code === 2;
  if (okGuard) pass++; else fail++;
  console.log(`${okGuard ? '✅' : '❌'} 召回评测器-防假零值（无索引库 → exit 2，不得静默 0）`);
  fs.rmSync(tk, { recursive: true, force: true });
  fs.rmSync(noBank, { recursive: true, force: true });
} catch (e) { fail += 2; console.log('❌ 召回评测器（异常: ' + failMsg(e) + '）'); }

// 29) 真实读采集器 harvest-access（ACT-023）：转录 → access-real.jsonl；水位幂等（复跑 0 新增）
try {
  const th = makeContainer();
  // 夹具隔离：容器并入的真实 audit/access-real.jsonl 与水位会让「记录数」失去意义（假绿），先清掉
  for (const f of ['access-real.jsonl', 'access-real-watermark.json']) fs.rmSync(path.join(th, 'audit', f), { force: true });
  const sd2 = path.join(th, 'sessions', 'proj', 'session-h1');
  fs.mkdirSync(sd2, { recursive: true });
  const rp2 = path.join(th, 'notes', 'env.md').replace(/\\/g, '\\\\');
  fs.writeFileSync(path.join(sd2, 'session.jsonl'),
    JSON.stringify({ type: 'tool/call', seq: 1, time: Date.now(), data: { name: 'read', arguments: '{"file_path":"' + rp2 + '"}' } }) + '\n');
  const hs = path.join(th, 'scripts', 'harvest-access.mjs');
  const hArgs = ['--bank', th, '--sessions', path.join(th, 'sessions')];
  const r1 = execOut('node', [hs, ...hArgs], { cwd: th });
  const outF = path.join(th, 'audit', 'access-real.jsonl');
  const n1 = fs.existsSync(outF) ? fs.readFileSync(outF, 'utf8').split('\n').filter(Boolean).length : 0;
  const r2 = execOut('node', [hs, ...hArgs], { cwd: th });
  const n2 = fs.existsSync(outF) ? fs.readFileSync(outF, 'utf8').split('\n').filter(Boolean).length : 0;
  const okH = r1.code === 0 && n1 > 0 && n2 === n1; // 首跑有记录；复跑按水位幂等不新增
  if (okH) pass++; else fail++;
  console.log(`${okH ? '✅' : '❌'} 真实读采集器（记录 ${n1} → 复跑 ${n2}，幂等）` +
    (okH ? '' : ` [诊断: code1=${r1.code} code2=${r2.code} out1=${JSON.stringify(r1.out.slice(0, 120))}]`));
  fs.rmSync(th, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 真实读采集器（异常: ' + failMsg(e) + '）'); }

// 30) 体检-画像行类（ACT-030 修复，v18）：画像行（`- … ← 源:`；写入口=蒸馏 profileUpdates / 深睡 profileOps）
//     与索引行**并列**，不再是「格式违规」——体检不得再把它误判为「无标签 + 无指针」而假红 exit 5；
//     但**缺源标记仍必须报**（否则等于放水，把无出处的自由文本当成合法记忆行）。
//     断言用「AGENT.md 段的内容」（非退出码）：容器并入真实库的告警会按 max 语义压过期望码（套件既有结论）。
try {
  const tm = makeContainer();
  const secOf = (out, name) => { const p = out.split(`=== ${name} (`)[1]; return p ? p.split('=== ')[0] : ''; };
  const mhArgs = [path.join(tm, 'scripts', 'memory_health_check.mjs'), tm];
  fs.writeFileSync(path.join(tm, 'AGENT.md'), [
    '# AGENT 画像索引',
    '',
    '[原则] 夹具原则甲 · 概况 → notes/lessons.md §网络坑',
    '',
    '## 能力边界',
    '- [边界] 夹具边界乙 · 不自重启 ← 源: notes/lessons.md §网络坑',
  ].join('\n') + '\n');
  const sec1 = secOf(execOut('node', mhArgs, { cwd: tm }).out, 'AGENT.md');
  const withSrc = /画像行: 1 条（带源 1 \/ 缺源 0）/.test(sec1) && !/无指针索引行/.test(sec1) && /无标签: 0/.test(sec1);
  fs.writeFileSync(path.join(tm, 'AGENT.md'), ['# AGENT 画像索引', '', '- [边界] 夹具边界乙 · 不自重启'].join('\n') + '\n');
  const sec2 = secOf(execOut('node', mhArgs, { cwd: tm }).out, 'AGENT.md');
  const noSrc = /画像行: 1 条（带源 0 \/ 缺源 1）/.test(sec2) && /画像行缺源标记: 1 条/.test(sec2);
  const okCase = withSrc && noSrc;
  if (okCase) pass++; else fail++;
  console.log(`${okCase ? '✅' : '❌'} 体检-画像行类（带源不误判 / 缺源必报）` +
    (okCase ? '' : ` [诊断: 带源=${withSrc} 缺源=${noSrc} sec1=${JSON.stringify(sec1.slice(0, 200))}]`));
  fs.rmSync(tm, { recursive: true, force: true });
} catch (e) { fail++; console.log('❌ 体检-画像行类（异常: ' + failMsg(e) + '）'); }

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);