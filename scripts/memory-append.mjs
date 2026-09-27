#!/usr/bin/env node
// memory-append.mjs — 记忆追加写入（全自动固化层安全阀，ADR-0002 v2）
// 语义：只 append 不覆盖——定位既有小节，在该小节末插入条目；新条目行（MEMORY/USER/AGENT 索引）可 --new 追加文件尾。
// 安全网：① 写前备份 audit/backup-<ts>/（保留最近 SHOUCANG_BACKUP_KEEP=30 个，0=不裁剪）② 小节不存在→exit 2（列出可选，不自动新建散落小节）
//        ③ 主文档容量硬限（追加后总量超限→exit 1 不写）④ 目标文件白名单（仅 notes/<7个> + MEMORY/USER/AGENT）
//        ⑤ 原子写（同目录 tmp + rename，2026-09-11 D3 修复：中断不留半文件）；tmp 落盘/替换失败→exit 5 且原文件未改动
// 退出码：0 成功 · 1 超容量（仅 SHOUCANG_CAP_STRICT=1）· 2 白名单外/小节缺失/标签或 § 非法 · 3 用法 · 4 文件不存在 · 5 tmp 写或 rename 失败 · **6 库锁被占用（拒写）**
// 用法: node scripts/memory-append.mjs <MEMORY.md|USER.md|AGENT.md|notes/<file>.md> <小节名> <条目文本>
//       node scripts/memory-append.mjs <目标> <小节名> --new <索引行>     # 主文档新条目行（文件尾）
import { readFile, writeFile, copyFile, mkdir, rename, unlink, readdir, rm } from 'node:fs/promises';
/* 2026-09-26：索引行遇悬空指针时**自动建节**（用户拍板「索引和小节都自动判断」）——
 *   建节复用本脚本自身的 append 通道 ⇒ 需 spawn 自己。 */
import { execFileSync } from 'node:child_process';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
// S1R（2026-09-19）：索引行准入复用**单一语义件**（与宿主侧 `src/section-ref.ts` 同口径，差分锁守）
import { pointersOfRow, resolveSectionSpec, planPlacement, sectionCore } from './section-ref.mjs';
// S2S3 册零（2026-09-19）：**库级单写者锁**（与宿主 `src/bank-lock.ts` 同语义，差分锁守）
import { acquireBankLock, releaseBankLock } from './bank-lock.mjs';

const skillDir = process.env.MEMORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..'); // 数据根（结构分离：开发经 MEMORY_ROOT 指向私人区；缺省=脚本上一级兼容生产副本）
const [fileArg, sectionArg, ...rest] = process.argv.slice(2);
const isNewIndexLine = rest.includes('--new');
const entryText = (isNewIndexLine ? rest.slice(rest.indexOf('--new') + 1) : rest).join(' ').trim();

if (!fileArg || !sectionArg || !entryText) {
  console.error('用法: node scripts/memory-append.mjs <目标> <小节名> <条目文本> | <MEMORY.md> <小节名> --new <索引行>');
  process.exit(3);
}

// 白名单：辅助文档仅 notes/ 七件；主文档仅三索引（防 LLM 落点乱写）
const NOTES = ['notes/env.md', 'notes/tools.md', 'notes/flows.md', 'notes/lessons.md', 'notes/release.md', 'notes/user.md', 'notes/agent.md', 'notes/INDEX.md'];
const MAIN = ['MEMORY.md', 'USER.md', 'AGENT.md'];
const norm = fileArg.replace(/\\/g, '/').replace(/^\.\//, '');
const isNotes = NOTES.includes(norm);
const isMain = MAIN.includes(norm);
if (!isNotes && !isMain) { console.error(`目标不在白名单: ${fileArg}（允许 ${MAIN.concat(NOTES).join(' / ')}）`); process.exit(2); }

const filePath = isAbsolute(fileArg) ? fileArg : join(skillDir, fileArg);

// ── S2S3 册零（2026-09-19）：**取库锁**（本脚本是「读 → 改 → 原子写」的读改写，两个并发调用会互相覆盖：
//    末写者吃掉前者的条目 = 实测丢更新）。锁粒度 = 库根；父进程已持锁时经 env 重入（不重复加锁、不释放）。
//    拿不到锁 ⇒ **拒写**（exit 6），绝不静默放行。释放挂在 `exit` 钩子上，覆盖本脚本全部退出路径。
const bankHandle = acquireBankLock(skillDir, { note: 'memory-append' });
if (!bankHandle) {
  console.error('库锁被占用（拒写）：另一写者正在改库（见 <库>/.write-lock.log），请稍后重试');
  process.exit(6);
}
process.on('exit', () => { releaseBankLock(bankHandle); });
const raw = await readFile(filePath, 'utf8').catch(() => null);
if (raw === null) { console.error(`文件不存在: ${filePath}`); process.exit(4); }

// 备份（回滚安全网）
// 2026-09-11 修复：备份目录原为「分钟级、永不清理」，实测累积 98 个目录（= 98 份主文档全量副本）。
// 改为保留最近 N 个（SHOUCANG_BACKUP_KEEP，缺省 30；置 0 = 不裁剪，保留旧行为）。
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bakDir = join(skillDir, 'audit', 'backup-' + ts.replace(/[-T:]/g, '').slice(0, 12));
try {
  await mkdir(bakDir, { recursive: true });
  await copyFile(filePath, join(bakDir, norm.replace(/\//g, '_')));
  const keep = Number(process.env.SHOUCANG_BACKUP_KEEP ?? 30);
  if (keep > 0) {
    const auditDir = join(skillDir, 'audit');
    // S1R（2026-09-19 · P3）：保留面从 `^backup-\d{12}$` 放宽为**全部 `backup-*`** ——
    //   实测库内 45 个备份目录中 15 个是历史命名（`backup-split-*`/`backup-notes-*`/`backup-v21-*`…），
    //   旧正则永不匹配 ⇒ 那些目录**永久留存**（保留策略形同对它们失效）。
    const all = (await readdir(auditDir).catch(() => [])).filter((d) => /^backup-/.test(d)).sort();
    // 目录名即时间戳，字典序 == 时间序；只裁最旧的，本次刚写的永远保留
    for (const old of all.slice(0, Math.max(0, all.length - keep))) {
      await rm(join(auditDir, old), { recursive: true, force: true }).catch(() => {});
    }
  }
} catch { /* 备份/裁剪失败不阻塞（尽力） */ }

// 小节定位（复用 read_section 锚语义：title===kw || includes 双向）
const lines = raw.split(/\r?\n/);
// v5.4 树状定位：section 支持路径（父/子/孙…），逐级定位；深层小节不存在自动分裂（###+），顶层 ## 须锚。
// 安全策略：先只读解析定位（不改 lines），若最深层缺 → 计算从最深已存在父往下需新建的层级链；
// 插入阶段统一在「最深层已存在小节的末尾」追加（保正文在子节前不被打乱）。
//
// ══ 修（2026-09-19 · 真机实证 · 与 ADR-246「后端/工具侧=唯一语义层」同边界）══════════════════
// **判因**：本行原**无条件**按 `/` 分割 `sectionArg`，而**小节标题本身常含 `/`**
//   （实测形状：`网络坑（2026-08-13/14，2026-09-03 增补）`）。
//   ⇒ 标题被劈成 `网络坑（2026-08-13` + `14，2026-09-03 增补）`，第二段被当作子节路径
//   ⇒ 自动创建出**残片标题** `### 14，2026-09-03 增补）`（真机两处：`lessons.md` L10 与 L102，
//     且蒸馏每次写入会**再产生一处** ⇒ 修数据必被下一次写入覆盖，属**写入端缺陷**而非数据问题）。
// **修法**：先按**整串**在小节标题里找（归一后精确 → 双向包含唯一）；命中即视为**单个标题**、
//   **不做分段**（`/` 是标题的一部分）。只有整串不命中时，才按 `/` 分段走既有「父/子」路径语义。
//   ⇒ 两种语义各归其位，且**不新增第二份匹配实现**（仍复用 `planPlacement` / `resolveLevelInParent`）。
const rawSpec = String(sectionArg).trim();

const headingAt = (l) => (/^(#{2,6}) /.test(l) ? /^(#{2,6}) /.exec(l)[1].length : 0);
const cleanTitle = (l) => l.replace(/^#{2,6} /, '').trim();

// 建标题行索引：[{line, level, title}]
const heads = [];
lines.forEach((l, i) => { const lv = headingAt(l); if (lv >= 2) heads.push({ line: i, level: lv, title: cleanTitle(l) }); });

/* ⚠ 归一核心名**复用 `section-ref#sectionCore`**（库侧唯一实现，与宿主 `src/section-ref.ts` 差分锁守），
 *   不在本文件另写一份——「同一语义多份实现」正是本缺陷的成因类别（ADR-246 边界）。 */
/* 整串优先：只有当整串**能在标题集合里唯一命中**时才不分段（避免把真的「父/子」路径误当标题）。
 * ⚠ 口径：`网络坑（2026-08-13/14，…）` 的 core 是 `网络坑`；整串命中即视为单个标题。 */
const wholeHit = (() => {
  if (!rawSpec.includes('/')) return null   // 无 `/` 时无需特判（分段结果与整串同）
  const kw = sectionCore(rawSpec)
  if (!kw) return null
  const exact = heads.filter((h) => sectionCore(h.title) === kw)
  if (exact.length === 1) return exact[0]
  const loose = heads.filter((h) => { const c = sectionCore(h.title); return c && (c.includes(kw) || kw.includes(c)) })
  return loose.length === 1 ? loose[0] : null
})();
const pathParts = wholeHit ? [rawSpec] : rawSpec.split('/').map((s) => s.trim()).filter(Boolean);
if (!pathParts.length) { console.error('小节路径为空'); process.exit(2); }

// ══ 册三（2026-09-19 · docs/pointer-supply-plan.md §5-1）**放置收敛** ══════════════════════════
// 判因（方案 §2.2 G5 实测坐实）：本件原自带 `matches`（**双向包含**）+ `findChild`（逐级取**首个**），
//   与 `section-ref` 的三态语义不统一 ⇒ 夹具库只有 `## DSH 环境` 时写「环境」会**误配**进「DSH 环境」
//   （exit 0 无提示）。现统一走 `planPlacement`（exact → loose 唯一命中 → **多命中 ⇒ 拒绝并要求「父/子」全路径**）。
// 应急回退（`SHOUCANG_APPEND_PLACEMENT_CHECK=0`）：歧义时**取首个命中**（旧行为）并**显式告警**（不静默）。
const LEGACY_FIRST = process.env.SHOUCANG_APPEND_PLACEMENT_CHECK === '0';
const titles = heads.map((h) => ({ title: h.title, level: h.level, idx: h.line }));
// 应急回退 = **同一实现的参数化**（`loose:'contains'` 恢复读侧宽容语义），不留第二份匹配代码
let plan = planPlacement(titles, pathParts, LEGACY_FIRST ? { loose: 'contains' } : {});
if (plan.refused) {
  if (!LEGACY_FIRST) {
    console.error(`小节名有 ${plan.refused.cands.length} 个同层候选（**拒绝写入**，请写「父/子」全路径消歧）: ${plan.refused.name} ⇒ ${plan.refused.cands.join(' | ')}`);
    console.error('  ⇒ 或用 `node section-ref.mjs <notes/x.md> "<小节名>"` 查看候选；应急回退：SHOUCANG_APPEND_PLACEMENT_CHECK=0（取首个，旧行为）');
    process.exit(2);
  }
  console.error(`⚠ 放置歧义（${plan.refused.name} ⇒ ${plan.refused.cands.join(' | ')}）⇒ 应急回退**取首个**（旧行为，请尽快改成「父/子」全路径）`);
  const first = plan.refused.cands[0];
  const at = titles.findIndex((t) => t.title === first && t.level === plan.refused.level);
  const steps = plan.steps.slice();
  const prevParent = plan.parentIdx;
  // 强制以首个候选作为该层落点（等价旧 findChild 取首个），后续层级继续按需新建
  plan = { refused: null, steps: [...steps, { pi: plan.refused.pi, level: plan.refused.level, state: 'loose', name: plan.refused.name, at, title: first }], parentIdx: at, missingPi: -1 };
  if (prevParent < 0 && at < 0) plan.missingPi = plan.refused.pi; // 兜底：候选定位失败 ⇒ 当作缺失（不猜）
}
const anchored = plan.steps.filter((s) => s.state !== 'missing').map((s) => s.at);
if (plan.missingPi >= 0) anchored.push(-plan.missingPi - 1);
let parentIdx = plan.parentIdx;

let content;
if (isNewIndexLine) {
  // 主文档新条目行：追加文件尾（在 trailing 空行前）
  if (!/^\[(env|tool|flow|lesson|身份|环境|硬件|偏好|习惯|使命|边界|经验|演化|教训)\]/.test(entryText)) {
    console.error(`新索引行标签非法: ${entryText.slice(0, 30)}`); process.exit(2);
  }
  // ══ S1R（2026-09-19 · D3/P1）**索引行准入（唯一强制点）** ══════════════════════════════
  // 判因（只读复查实测）：本分支原先**只校验行首标签**，对行内 `→ notes/x.md §y` **零校验**；
  //   而唯一做 §校验的 `memory_write_gate.mjs` **不在这条路上** ⇒ 蒸馏产线是**悬空指针的持续来源**
  //   （先红实证：隔离库塞一条悬空指针 ⇒ 本件 exit 0 落盘；库 git 取证：`§ZCode 环境`/`§会话开头注入`
  //   首现 2026-09-18，`§环境与通道` 等仍在新增）。
  // 口径：**同一实现** `section-ref.mjs`（三态）—— `missing` ⇒ 拒（exit 2，与该件既有 exit 2 语义一致）；
  //   `ambiguous`（同名多候选）⇒ 放行 + stderr 提示写「父/子」全路径消歧。
  // 回退开关：`SHOUCANG_APPEND_SECTION_CHECK=0` ⇒ 恢复旧行为（只校标签）。
  if (process.env.SHOUCANG_APPEND_SECTION_CHECK !== '0') {
    const bad = []; const amb = []; const part = [];
    let line2 = entryText;
    for (const ptr of pointersOfRow(entryText)) {
      const { agg, parts } = resolveSectionSpec(skillDir, ptr.file, ptr.spec);
      if (agg === 'missing') {
        for (const p of parts.filter((x) => x.res.state === 'missing')) bad.push(`notes/${ptr.file} §${p.name}`);
      } else if (agg === 'partial') {
        // **指针归一**（2026-09-19 定）：父节在、子节缺 ⇒ 把 spec 收敛到**可解析前缀**（读侧本来就会回落父节，
        //   归一只是把它写实）。判因：实测 14 组存量属此类；若一律拒收，会把"模型的深层锚"整行挡掉（丢知识）。
        const keep = [];
        for (const p of parts.slice().reverse()) { if (p.res.state === 'missing') break; keep.unshift(p.name); }
        const oldSpec = `notes/${ptr.file} §${ptr.spec}`;
        const newSpec = `notes/${ptr.file} §${keep.join('/')}`;
        if (keep.length && line2.includes(oldSpec)) {
          line2 = line2.split(oldSpec).join(newSpec);
          part.push(`${oldSpec} ⇒ ${newSpec}（子节缺，已归一为可解析路径）`);
        } else {
          part.push(`${oldSpec}（子节缺，读侧回落父节）`);
        }
      } else if (agg === 'ambiguous') {
        for (const p of parts.filter((x) => x.res.state === 'ambiguous')) amb.push(`notes/${ptr.file} §${p.name}（${p.res.cands.length} 个同名候选）`);
      }
    }
    /* ── 2026-09-26 放开「悬空指针一律拒写」（用户拍板：索引与小节都自动判断）──────
     * 【旧行为】索引行指向的 notes 小节不存在 ⇒ `exit 2` **整行拒写**。
     *   实测后果：**蒸馏产线是悬空指针的持续来源**（注释原文），而拒写只保护了
     *   "不写坏行"，代价是**那条知识直接丢失**（模型的产出被整行挡掉）。
     * 【新行为】**自动在该 notes 文件里建出缺失小节**，然后照常写索引行。
     *   建节复用 `memory-append` 自身的 append 通道（同一实现，不新写建节器）；
     *   建节失败（如 notes 文件不在白名单）⇒ **降级为「归一为可解析前缀」**（既有 partial 分支
     *   的同一语义）而不是整行丢，并在 stderr 显式提示（不静默）。
     * ⚠ 安全性：小节名来自索引行里**已经写好**的 §指针（即"声明的落点"），
     *   不是模型临时编的第二个名字；建节前仍走 section-ref 的存在性判定。 */
    if (bad.length) {
      const built = [];
      const stillBad = [];
      for (const b of bad) {
        const m = /^notes\/([A-Za-z0-9_.-]+)\.md §(.+)$/.exec(b);
        if (!m) { stillBad.push(b); continue; }
        const target = 'notes/' + m[1] + '.md';
        const spec = m[2];
        if (!NOTES.includes(target)) { stillBad.push(b); continue; }
        /* 复用本脚本自身的 append 通道建节（子进程调用自己，带 --build-only 语义：
         * 写一条占位条目到该节，随后整行照常落盘）。 */
        try {
          /* ⚠ **库锁重入**（实测踩过）：父进程此刻**已持库锁**
           *   （`acquireBankLock(skillDir)` 在文件头），子进程若不带重入凭据
           *   ⇒ `exit 6 库锁被占用` 直接失败。
           *   `bank-lock` 的重入机制就是 env `SHOUCANG_BANK_LOCK_OWNER`（两边都比对 owner，
           *   防陈旧 env 免锁）⇒ 此处必须把父进程的 owner 传下去。
           *   首版漏了这条，表现为"建节失败：Command failed"而看不出原因。 */
          /* ⚠ **库锁重入的正确凭据来源**（实测纠正）：
           *   `acquireBankLock` **不写回 env** —— 重入凭据要由父进程**显式**传给子进程。
           *   首版我读 `process.env.SHOUCANG_BANK_LOCK_OWNER`，但父进程自己也不是从 env 拿的
           *   （它是宿主的孙进程）⇒ 该 env 为空 ⇒ 子进程拿不到锁 ⇒ `exit 6 库锁被占用`。
           *   正解：**从持锁句柄取 owner**（`bankHandle.owner` 就是本次加锁生成的 owner）。 */
          const lockEnv = 'SHOUCANG_BANK_LOCK_OWNER'
          const childEnv = { ...process.env, MEMORY_ROOT: skillDir, SHOUCANG_CAP_STRICT: '0' }
          const lockOwner = String((bankHandle && bankHandle.owner) || process.env[lockEnv] || '')
          if (lockOwner) childEnv[lockEnv] = lockOwner
          execFileSync(process.execPath, [fileURLToPath(import.meta.url), target, spec, '- ' + spec + '（占位：由索引行建节自动生成）'], {
            env: childEnv,
            stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000
          });
          built.push(b);
        } catch (e) {
          /* 取证：把子进程 stderr 带出来（否则只剩 "Command failed"，无从诊断）。 */
          const se = (e && e.stderr) ? String(e.stderr).trim().split('\n').slice(-2).join(' | ') : '';
          stillBad.push(b + '（建节失败：' + (se || String(e.message || e)).slice(0, 140) + '）');
        }
      }
      if (built.length) console.error(`⚠ 已自动为悬空指针建出小节（${built.length} 个）: ${built.join(' · ')}`);
      if (stillBad.length) {
        console.error(`指针悬空且无法自动建节（索引行准入拒绝）: ${stillBad.join(' · ')}`);
        console.error('  ⇒ 该 notes 文件可能不在白名单；可用 `node section-ref.mjs <notes/x.md> "<小节名>"` 查候选。');
        process.exit(2);
      }
    }
    for (const a of amb) console.error(`⚠ 同名小节歧义（已放行，建议写「父/子」全路径消歧）: ${a}`);
    for (const p of part) console.error(`⚠ 指针已归一/部分悬空: ${p}`);
    if (line2 !== entryText) entryText = line2; // 归一后的行落盘（幂等：再写一次即 no-op）
  }
  content = raw.replace(/\s+$/, '\n') + entryText + '\n';
} else {
  const bullet = entryText.replace(/^[-•]?\s*/, '- '); // 规范成列表项
  const lastAnchored = [...anchored].reverse().find((x) => x >= 0); // 最深层已存在节的 heads 下标（可能 -1=无顶层）
  const missingFrom = anchored.find((x) => x < 0); // 首个缺失层（负数，值为 -(pi+1)）
  const missingPi = missingFrom === undefined ? -1 : -missingFrom - 1; // 首个缺失层下标
  const bulletLines = []; // 需新增的子节标题行 + 内容行（自缺失层起逐级建）
  /* ⚠ 2026-09-26：`insertPos` 提升到分支外 —— 「顶层缺失 ⇒ 自动建锚」分支也要用它
   *   （原为分支内 `let` ⇒ 新分支赋值会 ReferenceError，实测撞过）。 */
  let insertPos = lines.length;   /* 缺省 = 文件尾（顶层完全缺失时的落点） */
  // 内容最终插入点 = 最深层已存在节的末尾（该节内容区尾部）
  /* ── 2026-09-26 放开「顶层必须人工建锚」的限制（用户拍板）────────────────────
   * 【旧行为】顶层 `##` 不存在 ⇒ `exit 2` **拒写**，要求人工建锚（注释理由："防散落大节"）。
   *   实测后果（真库取证）：`MEMORY.md` **从来没有过 ##** ⇒ 每个带小节名的写入**全被拒**
   *   ⇒ **永远建不出第一个小节** ⇒ 锁死。真库现状：MEMORY.md 1400 行**纯索引 0 小节**、
   *   90323 字符（超 5000 门 18 倍），而细节**无处下沉**；同仓 `USER.md`/`AGENT.md`
   *   因当初被人工建过锚，各有 54/41 个小节 ⇒ **三档形态不一致**，且容量只增不减。
   * 【新行为】顶层缺失 ⇒ **自动按路径逐级建节**（与"缺失中间层"既有逻辑同一实现，
   *   只是把 padBase 从「已存在最深节」换成 0 = 文件顶层）。
   * ⚠ 原「防散落大节」的意图**未被丢弃**：小节名仍来自调用方（蒸馏/AI），
   *   且写入前仍过 `planPlacement` 的歧义拒绝与指针准入 ⇒ 落点依然受控。
   *   本改动只去掉「必须有人先手工建第一个 ##」这道**先有鸡还是先有蛋**的门。 */
  /* ⚠ 自动建锚**不在此处落盘** —— 复用下方统一出口（容量门禁 + 原子写 + 备份）。
   *   做法：把新建标题块与内容放进 `bulletLines`，插入点设为文件尾，然后**走同一路径**。
   *   （首版我在此直接调 writeAtomic，但该函数不存在 ⇒ 会 ReferenceError；已改正。） */
  /* ⚠ **只在「整档一个 ## 都没有」时才自动建锚**（2026-09-26 实测收窄）：
   *   首版我写成 `lastAnchored === -1`（= 该**路径**的顶层没命中），
   *   但那会把「档里已有 ## DSH 环境、而你要写"环境"」也判成"需自动建" ⇒
   *   建出一个与 `## DSH 环境` **并存的近义小节** —— 正是 check-placement-convergence
   *   用例①（「误配路径被拒」）要防的事。
   *   判据改为看**档内是否存在任何 H2 标题**（`heads.some(h => h.level === 2)`）：
   *   · 一个都没有（真·空档，如 MEMORY.md）⇒ 自动建锚（用户诉求）
   *   · 已有 H2 但目标缺失 ⇒ 维持原行为（进入下方既有逻辑，按 missingPi 逐级建或拒绝） */
  /* ⚠ 两个条件**同时**满足才自动建锚（首版只判其一，撞了两次）：
   *   · `lastAnchored === -1`  = 该**路径**的顶层没命中
   *   · `!anyTopLevel`         = 档内**根本没有**任何 H2
   *   只判前者 ⇒ 会把「已有 ## DSH 环境、写"环境"」也当"需自动建"（近义并存，用例①）；
   *   只判后者 ⇒ 有 H2 但路径未命中时 `lastAnchored` 仍为 -1 ⇒ 下方 `heads[-1].line` 抛 TypeError（实测）。
   *   ⇒ 二者合取，各堵一半。 */
  const anyTopLevel = heads.some((h) => h.level === 2);
  if (!anyTopLevel && (lastAnchored === undefined || lastAnchored === -1)) {
    pathParts.forEach((t, j) => {
      bulletLines.push('');
      bulletLines.push('#'.repeat(2 + j) + ' ' + t);   /* 顶层从 ## 起，逐级加深 */
      bulletLines.push('');
    });
    bulletLines.push(bullet);
    /* ⚠ `insertPos` 在原实现里是**另一分支内的 let** ⇒ 此处不能赋值（实测会 ReferenceError）。
     *   故本分支**只构造 bulletLines**，落盘统一走文件末尾那处 `lines.splice(insertPos, …)`：
     *   把 insertPos 提升到分支外声明。 */
    console.log(`✅ 该档原无任何 ## ⇒ 将自动建顶层小节：${pathParts.join(' / ')}`);
  } else {
  /* ⚠ **守卫**（2026-09-26 实测补）：本分支假定 `lastAnchored` 有效（`heads[lastAnchored]`）。
   *   但"档内有 H2、而**该路径的顶层没命中**"时 `lastAnchored` 仍为 -1
   *   ⇒ `lastHead.line` 抛 TypeError（实测 `Cannot read properties of undefined`），
   *     用户看到的是**崩溃**而不是**可操作的拒绝信息**。
   *   正确行为：此时应**拒绝并给出可用小节清单**（与原先"顶层需人工建锚"的提示同一形态），
   *   因为档内已有 H2 结构 ⇒ 不自动新建（防与近义小节并存）。 */
  if (lastAnchored === undefined || lastAnchored === -1) {
    console.error(`小节「${pathParts[0]}」不在本档任何顶层小节下（本档已有 ## 结构 ⇒ 不自动新建，防近义并存）。可用顶层小节：`);
    for (const h of heads) if (h.level === 2) console.error(`  - ${h.title}`);
    process.exit(2);
  }
  const lastHead = heads[lastAnchored];
  // 该节末尾 = 下一个同层或更高层标题 或 文件尾
  let secEnd = lines.length;
  for (let i = lastHead.line + 1; i < lines.length; i++) { const lv = headingAt(lines[i]); if (lv <= lastHead.level) { secEnd = i; break; } }
  // 剔除末尾空行（见上方说明：扁平小节下 secEnd 已停在正文首行，本行实际不生效）
  while (secEnd > lastHead.line + 1 && !lines[secEnd - 1].trim()) secEnd--;
  // 若缺失层存在（需分裂）：从缺失层 pi 开始逐级建子节标题（内容放最深缺失层）
  insertPos = secEnd;
  if (missingPi >= 0) {
    const padBase = lastHead.level; // 已存在最深节层级
    // 缺失层从 missingPi 开始：层标题 pad = # 数 = padBase + 1 + (pi - missingPi)
    const createAt = secEnd; // 分裂插在已存在节正文末尾后
    // 构建：最浅缺失层标题在最上？——按记忆惯例「父在浅、子在深」，分裂应自 missingPi 逐层嵌套：
    //   ### 子  \n (空行) \n #### 孙 \n (空行) \n - 内容
    const missingTitles = pathParts.slice(missingPi);
    const insBlocks = [];
    missingTitles.forEach((t, j) => {
      insBlocks.push('');
      insBlocks.push('#'.repeat(padBase + 1 + j) + ' ' + t);
      insBlocks.push('');
    });
    // 插入位置前补一个空行（与已存在正文分隔），后接内容
    bulletLines.push(...insBlocks, bullet);
    insertPos = createAt;
  } else {
    // 全命中：直接插最深节正文末尾
    bulletLines.push(bullet);
    insertPos = secEnd;
  }
  }   /* ← 闭合「顶层存在 ⇒ 原有逻辑」的 else */
  /* **汇合点**（两条分支共用）：新分支只构造 bulletLines 并把 insertPos 设为文件尾，
   *   此处统一 splice + 生成 content ⇒ 落盘走下方同一出口（容量门禁 → 备份 → 原子写）。 */
  lines.splice(insertPos, 0, ...bulletLines);
  content = lines.join('\n');
}

// 容量门禁（主文档硬限；notes 不拦）
// ⚠ **2026-09-26 口径澄清（用户拍板）**：容量门统计的是「**索引注入面**」——
//   即会话开头真正注入的那部分，**不含** `## 正文本节`（那些供按需检索，只进总量统计）。
//   判因（实测）：USER.md 总 11888 字符中，顶部索引仅 **370**，其余 **97%** 是 54 个正文本节
//   ⇒ 旧实现按**全文件**计（"全文件口径"），把不注入的内容也算进容量门，
//     用户于是看到「体积一直涨、而注入的索引一直没变」的矛盾。
//   本件是**零依赖活件**（不得 import src/）⇒ 内联同一规则；
//   与 src/budget-override.ts#indexSurfaceOf 的同源由 check-capacity-chars.mjs 差分锁守。
// 2026-09-11：默认值与容量门同源（画像 AGENT/USER 3,000 · 记忆 MEMORY 5,000）；env SHOUCANG_CAP_* 可覆盖
//（蒸馏/深睡调用 memory-append 时由宿主注入 = scheduler.json 实时容量门，见 src/distill.ts capEnv()）
const CAP_ENV = {
  'MEMORY.md': Number(process.env.SHOUCANG_CAP_MEMORY) || 5000,
  'USER.md': Number(process.env.SHOUCANG_CAP_USER) || 3000,
  'AGENT.md': Number(process.env.SHOUCANG_CAP_AGENT) || 3000,
}
const LIMITS = { 'MEMORY.md': 5000, 'USER.md': 3000, 'AGENT.md': 3000, ...CAP_ENV }
if (isMain) {
  /* 取**索引注入面**：首个行首 `## ` 之前的全部内容；无 `##` ⇒ 全文（MEMORY.md 即此形态）。
   * ⚠ 只认**行首** `## `，避免正文里提到的 `##` 被误切。 */
  const idxEnd = content.search(/^## /m);
  const idxText = idxEnd >= 0 ? content.slice(0, idxEnd) : content;
  const chars = idxText.replace(/\s+/g, '').length;
  const limit = LIMITS[norm] ?? LIMITS['MEMORY.md'];
  /* 2026-09-16 **用户判定：容量不是硬限** —— 「直接全部失败或者拒绝」不符合意图，**提醒就可以了**。
   * 旧行为：超限即 `exit 1` **不写**。新默认：**提醒后照写**（写入不因容量被阻断）。
   * ⚠ 严格模式 `SHOUCANG_CAP_STRICT=1` 保留旧行为（能力不删、可回退）。 */
  if (chars > limit) {
    if (process.env.SHOUCANG_CAP_STRICT === '1') { console.error(`exit=1 追加后超容量 ${chars}/${limit}（strict：不写，需合并/下沉）`); process.exit(1); }
    console.warn(`⚠️ 超容量（未阻断）追加后 ${chars}/${limit} 字符 —— 已写入；建议合并精简或下沉 notes/`);
  }
}

// 2026-09-11 修复（D3）：原为直接 writeFile 覆盖——进程在「文件被截断后、新内容未落完」之间被打断
// （宿主重启 / 热重载 / 强制刷新）会留下半截主文档；此时备份虽在，但没有任何自动回滚，
// 下一次读写就基于损坏的副本继续（备份目录里同时也多一份垃圾）。
// 改为同目录 tmp 写 + rename 原子替换：同一文件系统内 rename 是原子操作，
// 观察者要么看到旧全文、要么看到新全文，不存在中间态。tmp 必须与原文件同目录，否则跨卷 rename 退化成拷贝。
const tmpPath = join(dirname(filePath), `.${norm.replace(/\//g, '_')}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
try {
  await writeFile(tmpPath, content, 'utf8');
  await rename(tmpPath, filePath);
} catch (e) {
  await unlink(tmpPath).catch(() => {});                    // 失败时不留 tmp 垃圾；原文件始终未被触碰
  console.error(`写入失败 exit=5（原文件未改动）: ${e?.message ?? e}`);
  process.exit(5);
}
console.log(`append ${norm} :: ${sectionArg}${isNewIndexLine ? ' [--new]' : ''} — ${entryText.slice(0, 60)}…（备份 ${bakDir}）`);
process.exit(0);
