// test-atomic-write.mjs — 【memory-append 原子性 · 中间态观测回归】
//
// 为什么单独一个文件：原子性的定义是「不存在中间态」，它不是终态性质。
//   「写入完成后内容对不对」这条终态断言，在原子实现与非原子实现下**结果完全相同**，
//   因此对原子性的证据力为零。本文件只断言**故障路径 / 并发观测路径**下的状态。
//
// 可证伪性声明（本文件不是恒真断言，已做反向证伪，见文件末尾注释）：
//   · A3 把 writeFile 改成「写一半抛 ENOSPC」。原子实现写的是 tmp ⇒ 目标零损伤；
//     若把实现退回 D3 前的 writeFile(目标) 直接覆盖，目标会被 truncate + 写半截 ⇒ A3 必红。
//   · A2 把 rename 改成抛 EPERM。若实现不依赖 rename（非原子）则注入根本不会触发 ⇒ A2 必红。
//   两次反向证伪的 exit code 与输出原文见 scripts/test-atomic-write.mjs 末尾 FALSIFICATION 注释块。
//
// 用法: node scripts/test-atomic-write.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SUT = join(repoRoot, 'skill', 'scripts', 'memory-append.mjs');
const INJECTOR = join(here, 'atomic-fault-injector.mjs');
// 运行时实际加载的副本（主理人已 md5 校验一致；此处复验，保证「测的就是跑的那个」）
const DEPLOYED = process.env.SC_DEPLOYED_APPEND || join(homedir(), '.dsh', 'skills', 'managing-memory', 'scripts', 'memory-append.mjs');
const NODE = process.env.NODE_BIN || process.execPath;

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`✅ ${m}`); } else { fail++; console.log(`❌ ${m}`); } };
const md5 = (b) => createHash('md5').update(b).digest('hex');
const md5f = (p) => md5(readFileSync(p));
const stamp = () => new Date().toISOString();

// ── 夹具：独立 tmp 数据根（MEMORY_ROOT），绝不碰真库 ──
function newRoot(tag) {
  const root = mkdtempSync(join(tmpdir(), `sc-atomic-${tag}-`));
  mkdirSync(join(root, 'notes'), { recursive: true });
  writeFileSync(join(root, 'MEMORY.md'), '# MEMORY\n\n## 原子节\n- 旧条目一\n- 旧条目二\n', 'utf8');
  return root;
}
const before = () => readFileSync(join(root0, 'MEMORY.md'), 'utf8');

// ── 驱动器：spawn 子进程执行被测脚本，可带故障注入 ──
function runAppend(root, args, fault = '', targetPath = '', samplesPath = '') {
  const env = { ...process.env, MEMORY_ROOT: root };
  // SC_EXTRA_FAULT：反向证伪用。给每一轮调用叠加额外故障（如 nonatomic），
  // 用于证明「测试变红确实源于实现不原子」，无需改动被测源码。
  const extra = process.env.SC_EXTRA_FAULT || '';
  const effFault = [fault, extra].filter(Boolean).join(',');
  if (effFault) fault = effFault;
  if (fault) {
    env.NODE_OPTIONS = `--import ${pathToFileURL(INJECTOR).href}`;
    env.SC_FAULT = fault;
    if (targetPath) env.SC_TARGET = targetPath;
    if (samplesPath) env.SC_SAMPLES = samplesPath;
  }
  const r = spawnSync(NODE, [SUT, ...args], { env, encoding: 'utf8', cwd: root });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const tmpLeftovers = (dir) => readdirSync(dir).filter((f) => /^\..*\.tmp-\d+-[a-z0-9]+$/.test(f));

let root0 = newRoot('a1');

console.log(`\n=== test-atomic-write @ ${stamp()} ===`);
console.log(`SUT      : ${SUT} (${statSync(SUT).size}B, mtime ${statSync(SUT).mtime.toISOString()})`);
console.log(`INJECTOR : ${INJECTOR} (${statSync(INJECTOR).size}B)`);
console.log(`NODE     : ${NODE}\n`);

// ── A0 部署一致性：测的副本 == 跑的副本 ──
console.log('── A0 部署一致性 ──');
if (existsSync(DEPLOYED)) {
  ok(md5f(SUT) === md5f(DEPLOYED), `仓库副本 md5 == 运行时副本 md5 (${md5f(SUT)})`);
} else {
  console.log(`⚠️  运行时副本不存在，跳过 A0：${DEPLOYED}`);
}

// ── A1 成功路径（终态）—— 仅证明脚手架可用，【不证明原子性】 ──
console.log('── A1 成功路径终态（非原子性证据，仅脚手架自检）──');
const r1 = runAppend(root0, ['MEMORY.md', '原子节', '- 新条目一']);
ok(r1.code === 0, `A1.1 成功路径 exit=0（实际 ${r1.code}）`);
ok(md5f(join(root0, 'MEMORY.md')) !== md5('# MEMORY\n\n## 原子节\n- 旧条目一\n- 旧条目二\n'), 'A1.2 目标文件确实变了');
ok(readFileSync(join(root0, 'MEMORY.md'), 'utf8').includes('- 新条目一'), 'A1.3 新条目已落地');
ok(tmpLeftovers(root0).length === 0, `A1.4 成功路径无 tmp 残留（实际 ${JSON.stringify(tmpLeftovers(root0))}）`);
ok(readdirSync(join(root0, 'audit')).some((d) => /^backup-\d{12}$/.test(d)), 'A1.5 写前备份已生成');

// ── A2 替换步骤（rename）失败 ⇒ 目标必须原样 ──
console.log('── A2 rename 注入失败：目标文件必须零损伤 + tmp 清理 ──');
root0 = newRoot('a2');
const t2 = join(root0, 'MEMORY.md');
const old2 = readFileSync(t2, 'utf8');
const md5Old2 = md5(old2);
const r2 = runAppend(root0, ['MEMORY.md', '原子节', '- 绝不该出现的条目'], 'rename-fail');
ok(r2.code === 5, `A2.1 失败时 exit=5（实际 ${r2.code}）`);
ok(md5f(t2) === md5Old2, `A2.2 目标文件字节级未变（md5 ${md5f(t2).slice(0, 8)}… == 写前 ${md5Old2.slice(0, 8)}…）`);
ok(!readFileSync(t2, 'utf8').includes('绝不该出现'), 'A2.3 目标文件不是「新态」');
ok(readFileSync(t2, 'utf8') === old2, 'A2.4 目标文件也不是「半新态」（全文等于写前）');
ok(tmpLeftovers(root0).length === 0, `A2.5 失败后无 tmp 残留（实际 ${JSON.stringify(tmpLeftovers(root0))}）`);
ok(/原文件未改动/.test(r2.err), `A2.6 stderr 明确声明原文件未改动（实际: ${r2.err.slice(0, 60)}）`);

// ── A3 落盘中途失败（写一半 ENOSPC）⇒ 目标必须原样 —— 最强用例，确定性、不依赖时序 ──
console.log('── A3 writeFile 写一半失败：目标必须零损伤（模拟断电）──');
root0 = newRoot('a3');
const t3 = join(root0, 'MEMORY.md');
const old3 = readFileSync(t3, 'utf8');
const md5Old3 = md5(old3);
const r3 = runAppend(root0, ['MEMORY.md', '原子节', '- 断电条目'], 'write-half', t3);
ok(r3.code === 5, `A3.1 落盘中断 exit=5（实际 ${r3.code}）`);
ok(md5f(t3) === md5Old3, `A3.2 目标文件字节级未变（md5 ${md5f(t3).slice(0, 8)}…）`);
ok(readFileSync(t3, 'utf8') === old3, 'A3.3 目标文件未被 truncate，全文完整');
ok(readFileSync(t3, 'utf8').length === old3.length, `A3.4 长度未缩短（${readFileSync(t3, 'utf8').length} == ${old3.length}）`);
ok(tmpLeftovers(root0).length === 0, `A3.5 半截 tmp 已清理（实际 ${JSON.stringify(tmpLeftovers(root0))}）`);

// A3 续：故障后原文件仍可正常写入 —— 直接回答「被打断后数据会不会丢」
const r3b = runAppend(root0, ['MEMORY.md', '原子节', '- 断电后补写']);
ok(r3b.code === 0, `A3.6 中断后重跑成功 exit=0（实际 ${r3b.code}）`);
const after3 = readFileSync(t3, 'utf8');
ok(after3.includes('旧条目二') && after3.includes('断电后补写'), 'A3.7 旧数据未丢 且 新数据可继续写');

// ── A4 并发观测：替换动作执行期间，观测者只能看到「旧全文」或「新全文」 ──
console.log('── A4 并发观测：不存在第三态 ──');
root0 = newRoot('a4');
const t4 = join(root0, 'notes', 'INDEX.md');
const filler = 'X'.repeat(255) + '\n';
writeFileSync(t4, '# notes/INDEX.md\n\n## 观测节\n' + filler.repeat(1000), 'utf8'); // ~256KB
const stOld4 = statSync(t4);
const samplesPath = join(root0, 'samples.json');
const r4 = runAppend(root0, ['notes/INDEX.md', '观测节', '- 观测条目'], 'observe', t4, samplesPath);
ok(r4.code === 0, `A4.1 观测轮次正常完成 exit=0（实际 ${r4.code}${r4.err ? ' / ' + r4.err.slice(0, 80) : ''}）`);
const stNew4 = statSync(t4);
const keyOld = `${stOld4.size}:${stOld4.mtimeMs}`;
const keyNew = `${stNew4.size}:${stNew4.mtimeMs}`;
ok(stNew4.size !== stOld4.size, `A4.2 新旧尺寸不同，观测才有意义（${stOld4.size} → ${stNew4.size}）`);
ok(existsSync(samplesPath), 'A4.3 采样文件已产出');
let samples = [];
try { samples = JSON.parse(readFileSync(samplesPath, 'utf8')); } catch { /* 下方断言会红 */ }
const uniq = [...new Set(samples)];
console.log(`   [采样] 次数=${samples.length} 去重态数=${uniq.length} 态集合=${JSON.stringify(uniq.slice(0, 6))}`);
ok(samples.length > 0, `A4.4 采样非空（${samples.length} 次）`);
ok(samples.includes(keyNew), 'A4.5 采样确实跨越了切换点（观测到新全文态）');
const third = uniq.filter((s) => s !== keyOld && s !== keyNew);
ok(third.length === 0, `A4.6 无第三态（中间态 ${third.length} 种：${third.slice(0, 4).join(' | ')}）`);

// ── A5 静态必要条件：tmp 必须与目标同目录（否则跨卷 rename 退化成拷贝，原子性失效）──
console.log('── A5 静态：tmp 与目标同目录 ──');
const src = readFileSync(SUT, 'utf8');
ok(/const tmpPath = join\(dirname\(filePath\)/.test(src), 'A5.1 tmp 路径由 dirname(filePath) 构造（同目录）');
ok(/await rename\(tmpPath, filePath\)/.test(src), 'A5.2 替换动作是 rename(tmp → 目标)');
ok(/await unlink\(tmpPath\)\.catch/.test(src), 'A5.3 失败分支清理 tmp');
ok(!/await writeFile\(filePath,/.test(src), 'A5.4 源码中不存在「直接覆盖目标」的 writeFile(filePath');

console.log(`\n=== 结果: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);

// ─────────────────────────────────────────────────────────────────────────
// FALSIFICATION（反向证伪记录，2026-09-12 by Tessa · 三轮，全部真实执行）
//
// 【基线】真原子实现（SUT md5 b2ec9cd22fc2757b083974f6107e8607, 11119B）
//   $ node scripts/test-atomic-write.mjs
//   === 结果: 29 passed, 0 failed ===   BASELINE_EXIT=0
//
// 【M1 源码级】把 memory-append.mjs 的 `writeFile(tmpPath)` + `rename(tmpPath,filePath)`
//   临时改成 D3 修复前的 `writeFile(filePath, content, 'utf8')`（SUT md5 变 9d120867…, 11238B）
//   $ node scripts/test-atomic-write.mjs
//   ❌ A0 / ❌ A2.1 A2.2 A2.3 A2.4 A2.6 / ❌ A3.2 A3.3 A3.4 A3.6 A3.7 / ❌ A4.6 / ❌ A5.2 A5.4
//   === 结果: 15 passed, 14 failed ===   M1_EXIT=1
//   ⚠️ 关键对照：A1.1–A1.5 终态断言**全部保持绿色**。非原子实现下终态一模一样，
//      这就是「用终态证明原子性」证据力为零的实证。
//   ⚠️ A3.2 实测 md5 d41d8cd9…（空文件）、A3.4 长度 0 == 31 ⇒ 目标被 truncate 且未写回
//      ⇒ 打断即丢数据，正是本审计要回答的问题。
//
// 【恢复】cp 备份回原位，md5 复验 b2ec9cd22fc2757b083974f6107e8607 / 11119B
//   $ node scripts/test-atomic-write.mjs
//   === 结果: 29 passed, 0 failed ===   RECOVERY_EXIT=0
//
// 【M2 注入级 · 源码零改动】SC_EXTRA_FAULT=nonatomic（rename 退化为覆盖写，且无 tmp）
//   === 结果: 15 passed, 14 failed ===   M2_EXIT=1
//   [采样] 次数=10 去重态数=3 态集合=["256031:…","0:…","256046:…"]  ❌ A4.6 抓到中间态 0 字节
//
// 【M3 注入级】SC_EXTRA_FAULT=nonatomic-half（分段慢速覆盖）
//   === 结果: 15 passed, 14 failed ===   M3_EXIT=1
//   [采样] 次数=14 去重态数=3 态集合=["256031:…","0:…","256046:…"]  ❌ A4.6 抓到中间态 0 字节
// ─────────────────────────────────────────────────────────────────────────
