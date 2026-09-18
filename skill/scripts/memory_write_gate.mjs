// memory_write_gate.mjs — 记忆写入前置门（重建版，v3：主文档硬限 / 辅助文档不拦截）
// 原脚本随 2026-08-22 备份丢失未逐字还原；本版按 SKILL.md §6 接口重建。
// 用法: node scripts/memory_write_gate.mjs <目标文件> <临时文件>
//   目标文件: MEMORY.md | USER.md | AGENT.md | notes/<file>.md（可绝对路径或相对技能目录）
// 容量红线只对主文档（MEMORY/USER/AGENT=会话注入面）生效；notes 等辅助文档按需读取，不设硬限（超 NOTES_WARN 仅提示）
// exit 0=允许（附核对：容量数字/占比、指针清单） 1=主文档超容量（strict 档；缺省容量只提醒不阻断） 2=指针悬空/未注册（先建子文档或 INDEX 注册） 3=用法错误 4=索引行格式违规 5=内容级凭据（改写后再写入）
// ⚠ **判据序（S1R 2026-09-19 正交化）**：凭据 5 > 指针 2 > 格式 4 > strict 容量 1 > 容量告警 0
//   —— 正确性判据先判且必报；容量分支**不得**成为吞掉正确性结论的早退分支（`SHOUCANG_GATE_LEGACY=1` 可回旧序）。
//
// ══ B 内容级凭据过滤（2026-09-17 **圆桌会议「守藏整体方案会审」册一产出**）═════════
// 判因（**已发生事实**，非推测）：会议主持人实测 `~/.dsh/suite/knowledge/pending/
//   flow-candidates/2026-09-16-dmjyix.md:3` **含明文 API 密钥**（`sk-`+64 位 hex，用户原话
//   "这是我的秘钥"），而该目录是**待蒸馏吸收通道** ⇒ 会话原文 → 蒸馏 → 库 的链路上
//   **无任何内容级过滤**；同串另落 `audit/ledger.jsonl:8528`（append-only，不可改史）。
// 定层依据（arch 裁决）：明文凭据的危险是「**内容本不该存在**」⇒ 在**写入侧**处置；
//   与 `inject-guard`（`{{` 的危险是「消费面属性」⇒ 在出口处置）**是同一成因的两个投影，不可互替**。
// 正则的边界（security 实测，**如实标注，勿当万无一失**）：
//   · 漏网：分行/加空格的 key、无前缀纯 hex（与哈希不可区分 ⇒ 报则必误杀）；
//   · 误杀：无边界锚的 `\d{17,}` 会命中浮点串 `0.018518518518518517`（本库真实数据）。
//   ⇒ 故本实现**不收录**长度阈值型规则（如猜身份证），只收**有明确前缀/结构**的形态；
//     边界由 `scripts/test-secret-redact.mjs` 四组语料（真命中/误报对照/保真/漏网）显式断言。
// ⚠ **单一实现声明**：宿主侧 `src/secret-redact.ts` 是同一规则表的 TS 版（供 panel 等 host 侧复用）；
//   本件因**子进程调用、零依赖**（不得 import src/）而内联同源规则表。
//   **改任一处必须同批改另一处**，并由 `scripts/test-secret-redact.mjs` + 本件自证守一致。
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 高置信凭据形态（与 `src/secret-redact.ts` 的 RULES **同源**，改一处须同步另一处）。 */
const SECRET_RULES = [
  { category: 'api-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { category: 'api-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { category: 'api-key', re: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { category: 'api-key', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { category: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g },
  { category: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { category: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { category: 'assign', re: /\b(?:api[_-]?key|apikey|access[_-]?token|secret|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{12,}/gi },
  { category: 'cn-id', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
];
/** 扫描文本 → 命中列表（遮蔽输出，不回显原值）。 */
function findSecretHits (text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const seen = new Set(); const out = [];
  for (const { category, re } of SECRET_RULES) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text)) !== null) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      const raw = m[0];
      out.push(`${category} ${raw.length <= 10 ? '·'.repeat(raw.length) : raw.slice(0, 6) + '········' + raw.slice(-4)}（len=${raw.length}）`);
    }
  }
  return out;
}

const skillDir = process.env.MEMORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..'); // 数据根（开发经 MEMORY_ROOT 指向私人区；缺省=脚本上一级兼容生产副本）

const [target, tmp] = process.argv.slice(2);
if (!target || !tmp) {
  console.error('用法: node memory_write_gate.mjs <MEMORY.md|USER.md|AGENT.md|notes/<file>.md> <临时文件>');
  process.exit(3);
}
if (!fs.existsSync(tmp)) {
  console.error('临时文件不存在:', tmp);
  process.exit(3);
}

const targetPath = target.replace(/[\\/]+$/, '');
const base = targetPath.split(/[\\/]/).pop();
const isNotes = /^notes[\\/]/.test(targetPath) || base.startsWith('notes');

// v9：主文档（注入面）硬限扩容；辅助文档不拦截（仅超 NOTES_WARN 提示）
// v16：PRINCIPLES.md 独立层退役——习得原则以 [原则] 行并入 AGENT.md，AGENT 容量 2,000→3,000
// v17：AGENT.md 索引行新增 [路径] 通用任务路径（对标 AWM）——概况段上限按标签区分：普通行 ≤30 字、[路径] 概要 ≤40 字；
//      [路径] 步内禁用 →（与 → notes/ 指针歧义，步骤请用 ①②③ 串联）
// 2026-09-10：容量门可被 env 覆盖（SHOUCANG_CAP_MEMORY/USER/AGENT）——守藏面板「容量门」可调；未设用默认红线
// 2026-09-11（v21）：下列常量是「§8.1 分层预算公式（指针嵌套树）」的**派生值，不是独立手感数**——只加注释，不改数。
//   推导：行预算 100 字符 = 固定段 56（[tag]8+主题12+·3+概况30+→3）+ 指针 44；故
//     MEMORY.md 5000 = 50 行 × 100；USER.md / AGENT.md 3000 = 30 行 × 100；
//     NOTES_WARN 8000 = 8 × 读取单元 R(1000)（一个 notes 文件 ≤8 节、每节 ≤R）。
//   ⚠️ 断链风险：改任一常量前先读 skill/memory-whitelist-spec.md §8.1，并同步数值表 +
//     memory-whitelist-spec §2/§4/§5 + memory-core-model §2.7 + 投影四处
//     （本文件 / memory-append.mjs / memory_health_check.mjs / engine/target-registry.json）
//     + 宿主侧（scheduler.ts 容量门 / panel.ts CAP_GATES / client.js 输入框 / distill.ts liveCaps）。
const CAP_ENV = {
  'MEMORY.md': Number(process.env.SHOUCANG_CAP_MEMORY) || 5000,
  'USER.md': Number(process.env.SHOUCANG_CAP_USER) || 3000,
  'AGENT.md': Number(process.env.SHOUCANG_CAP_AGENT) || 3000,
};
const LIMITS = { 'MEMORY.md': 5000, 'USER.md': 3000, 'AGENT.md': 3000, ...CAP_ENV };
let NOTES_WARN = 8000;

// v2（ADR-122）：硬门参数可从判据投影读取（唯一事实源 = engine/criteria.json → engine/criteria-gate.json）。
// 优先级：env（面板容量门 SHOUCANG_CAP_*）> criteria-gate.json 投影 > 本文件内建缺省。
try {
  const proj = JSON.parse(fs.readFileSync(join(skillDir, 'engine', 'criteria-gate.json'), 'utf8'));
  for (const [k, v] of Object.entries(proj.caps || {})) {
    const envName = proj.envOverride?.[k];
    if (envName && process.env[envName]) continue; // env 优先
    if (typeof v === 'number') LIMITS[k] = v;
  }
  if (typeof proj.notesWarn === 'number' && proj.notesWarn > 0) NOTES_WARN = proj.notesWarn;
} catch { /* 投影未部署 = 用内建缺省（不报错） */ }

const tmpText = fs.readFileSync(tmp, 'utf8');
const chars = tmpText.replace(/\s+/g, '').length;

const issues = [];
// S1R（2026-09-19）：§ 小节存在性判据**收敛到单一语义件** `section-ref.mjs`（三态：exists/ambiguous/missing）。
//   本件原先自己实现「标题集去重 + 双向包含」，与读侧（取首个）、材料侧（多命中⇒null）口径分叉
//   ⇒ 同一指针三种结论（实测 notes/env.md §插件注入：读侧能读、写门通过、材料侧判不存在）。
//   ⚠ 单一实现声明：跨面同源由 `scripts/check-section-ref-parity.mjs`（差分锁）守。
import { resolveSectionSpec, pointersOfRow } from './section-ref.mjs';
const notesDir = join(skillDir, 'notes');

// 指针核对：MEMORY.md / USER.md / AGENT.md 的拟写入内容会引用 notes/ 子文档（v16：PRINCIPLES.md 退役，习得原则并入 AGENT.md）
// v17 补缺（2026-09-09 实态：深睡产物指向 notes/flows.md §深睡蒸馏 空壳小节仍 gate=pass——只校验了文件存在）：
// 索引行指针必须指向**真实存在的 §小节**（含「A/B 斜杠双小节」与「小节名含括号日期」两种形态），空壳小节=悬空指针 exit 2。
if (base === 'MEMORY.md' || base === 'USER.md' || base === 'AGENT.md') {
  const indexText = fs.existsSync(join(notesDir, 'INDEX.md')) ? fs.readFileSync(join(notesDir, 'INDEX.md'), 'utf8') : '';
  for (const m of tmpText.matchAll(/notes\/([A-Za-z0-9_-]+)\.md/g)) {
    if (!fs.existsSync(join(notesDir, m[1] + '.md'))) issues.push('指针悬空: notes/' + m[1] + '.md 不存在');
    else if (!indexText.includes(m[1] + '.md')) issues.push('未注册 INDEX: notes/' + m[1] + '.md');
  }
}

// v16：PRINCIPLES.md 专用行格式校验移除（习得原则并入 AGENT.md，走下方 [tag] 索引行格式校验）

const formatIssues = [];
const formatHints = [];

// v2.2 修复（实测根因）：格式上限从**判据投影**读（单一真源）——此前硬编码 30/40，注册表改了门不动；
//   且 prompt 未携带该约束 ⇒ 模型产出普遍超标被逐条拦掉（2026-09-11 深睡 attempted=3 → all-rejected）。
// ⚠ 自足解析（不复用上方 `proj`：它定义在更窄的块内 → 实测直接 ReferenceError 被 exit=1 伪装成"容量超限"）。
const FMT_LIMITS = (() => {
  const dflt = { summaryMax: 30, pathSummaryMax: 40 };
  // ⚠ 2026-09-14（P7 · D11）：原为单一 `../engine/criteria-gate.json` —— 从**仓内** `scripts/` 跑时它解析到
  //   **仓根 `engine/`**，而仓根那份**不会被 gen-criteria 重生成**（生成器只写 `skill/engine/*`）
  //   ⇒ 它已静默漂移（实测 `criteria.json` 侧 familiarThreshold 0.58/缺 value 环/缺 wiring 块；
  //   `criteria-gate.json` 侧实质字段尚全等，但 format 一旦分歧，**写门就会静默用旧上限**——
  //   正是 2026-09-11 刚修掉的「门硬编码 30/40 不读投影」的变种）。
  //   现改为**候选链**：仓内布局优先单一真源 `skill/engine`，库内布局回落 `../engine`（= `<bank>/engine`）。
  const base = dirname(fileURLToPath(import.meta.url));
  const cands = [
    join(base, '..', 'skill', 'engine', 'criteria-gate.json'), // 仓内：单一真源（gen-criteria 的落点）
    join(base, '..', 'engine', 'criteria-gate.json'),          // 库内：<bank>/engine
  ];
  for (const p of cands) {
    try {
      const f = JSON.parse(fs.readFileSync(p, 'utf8')).format || {};
      if (f.summaryMax || f.pathSummaryMax) return { summaryMax: Number(f.summaryMax) || 30, pathSummaryMax: Number(f.pathSummaryMax) || 40 };
    } catch { /* 尝试下一个候选 */ }
  }
  return dflt;
})();
const fmtLimits = FMT_LIMITS; // 下方引用

/* ── B（2026-09-17 圆桌会议册一）：**内容级凭据准入** ──
 * 对所有目标文档生效（主文档与 notes 一视同仁 —— 凭据落进 notes 同样是落盘）。
 * 与格式/容量校验**并列独立**：违反即拒（exit 5），不与其他 exit 码混淆。
 * ⚠ 设计取舍：**宁可少报**（漏网只是没帮上忙；误杀会污染真实内容 —— 本库实测教训）。 */
const secretHits = findSecretHits(tmpText);
if (secretHits.length) {
  console.error('exit=5 检出疑似凭据（**内容级准入拒绝**，改写后再写入）| '
    + secretHits.join(' | ')
    + ' ⇒ 处置：改为占位符（如 sk-[已遮蔽:凭据]）或移除；**不要把真值写进库**（会被蒸馏消费并出站到模型提供商）');
  process.exit(5);
}

// v13：索引行格式校验（spec §8 概况规则 1-4 硬化；主题约束软提示）
if (base === 'MEMORY.md' || base === 'USER.md' || base === 'AGENT.md') {
  for (const raw of tmpText.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('[') || !line.includes(']')) continue;
    const short = line.length > 30 ? line.slice(0, 28) + '…' : line;
    if (!line.includes('·')) { formatIssues.push('缺概况段(·): ' + short); }
    if (!/→\s*notes\//.test(line)) { formatIssues.push('缺 notes 指针(→): ' + short); }
    const isPath = line.startsWith('[路径]');
    const arrowCount = (line.match(/→/g) || []).length;
    const summary = line.split('·').slice(1).join('·').split('→')[0].replace(/\s+/g, '');
    if (isPath && arrowCount > 1) { formatIssues.push('路径步骤勿用 →（与 → notes/ 指针歧义），请用 ①②③ 串联: ' + short); }
    if (summary.length > (isPath ? fmtLimits.pathSummaryMax : fmtLimits.summaryMax)) { formatIssues.push((isPath ? `路径概要超${fmtLimits.pathSummaryMax}字` : `概况超${fmtLimits.summaryMax}字`) + '(' + summary.length + '): ' + summary.slice(0, 30) + '…'); }
    if (/（?20\d{2}-\d{1,2}-\d{1,2}）?/.test(line)) { formatIssues.push('禁带日期戳（维护元信息归 notes/INDEX.md）: ' + short); }
    const topic = line.slice(line.indexOf(']') + 1).split('·')[0].trim();
    if (topic.replace(/\s/g, '').length > 12) formatHints.push('主题超12字（建议精简，不拦截）: ' + short);
    else if (/[:：]/.test(topic)) formatHints.push('主题含冒号复合（补充说明移概况或详情，不拦截）: ' + short);
    // § 小节存在性（2026-09-10 修「遮蔽缺口」：原先仅在 lineOk（行格式通过）时才检查，导致
    // 同一行既有格式违规又有悬空指针时，悬空指针被静默跳过、长期隐形——实测 MEMORY.md L45 即此例。
    // 现改为**所有索引行都检查**，两类问题并报；exit 优先级：凭据 5 > 指针 2 > 格式 4 > 容量(告警/0)。
    // S1R（2026-09-19）：判据实现委托 `section-ref.mjs`（三态：exists/ambiguous/missing），
    //   且**行内指针的提取也交给单一实现**（`pointersOfRow` 状态机）——原先本件用
    //   `/notes\/([\w-]+)\.md\s*§(.+)$/` 只取**行内最后一个**文件指针且把 `§A/notes/b.md §B`
    //   拆成伪小节名（实测伪影：`tools.md §角色预设设计`/`§notes` 类误报）。
    //   语义：`missing` ⇒ issues（exit 2）；`ambiguous`（同名多候选）⇒ **放行 + 提示消歧**，不再折成"不存在"。
    for (const ptr of pointersOfRow(line)) {
      const { agg, parts } = resolveSectionSpec(skillDir, ptr.file, ptr.spec);
      if (agg === 'missing') {
        const names = parts.filter((x) => x.res.state === 'missing').map((x) => x.name);
        issues.push('指针悬空小节: notes/' + ptr.file + ' §' + names.join('/§') + ' 不存在（先建小节或修正指针）');
      } else if (agg === 'partial') {
        const names = parts.filter((x) => x.res.state === 'missing').map((x) => x.name);
        formatHints.push('小节路径部分悬空（不拦截：读取回落父节）: notes/' + ptr.file + ' §' + ptr.spec + ' ⇒ 缺 ' + names.join('/'));
      }
      if (agg === 'ambiguous') {
        for (const p of parts.filter((x) => x.res.state === 'ambiguous')) {
          formatHints.push('同名小节歧义（不拦截，建议写「父/子」全路径消歧）: notes/' + ptr.file + ' §' + p.name
            + ' ⇒ ' + p.res.cands.map((c) => c.title).join(' | '));
        }
      }
    }
  }
}

// v13：notes 教程式软提示（详情小节=目标/编号步骤/注意三段；纯事实类可省步骤）
let notesHint = '';
if (isNotes) {
  const bodyLines = tmpText.split('\n').map((l) => l.trim()).filter(Boolean);
  const stepish = bodyLines.filter((l) => /^(目标：|\d+[.、)]|注意：)/.test(l)).length;
  if (bodyLines.length >= 3 && stepish === 0) notesHint = ' | ⚠️ 建议教程式三段（目标：/1. 2. …/注意：，spec §8 v13）';
}

if (isNotes) {
  // 辅助文档：不拦截容量；超警戒线仅提示
  const warn = chars > NOTES_WARN ? ` ⚠️ 超 ${NOTES_WARN} 警戒线（按需拆分，不拦截）` : '';
  console.log(`exit=0 允许写入（notes 辅助文档） | 容量: ${chars} 字符${warn}${notesHint}${issues.length ? ' | ' + issues.join(' | ') : ''}`);
  process.exit(0);
}

const limit = LIMITS[base] ?? 3000;
const pct = Math.round((chars / limit) * 100);
const hint = formatHints.length ? ' | ' + formatHints.join(' | ') : '';
const detail = ['容量: ' + chars + '/' + limit + ' 字符 (' + pct + '%)', ...issues];
const overCap = chars > limit;
const capNote = overCap ? ` | ⚠️ 超容量 ${chars}/${limit} 字符 (${pct}%)（容量不阻断；此处只作并列信息）` : '';

/* ══ S1R（2026-09-19）**正确性与容量正交**（D4）══════════════════════════════
 * 判因（只读复查实测）：原实现的容量分支**先于**正确性判定且两支都 `process.exit(0)`
 *   ⇒ 实测 MEMORY.md 520% / AGENT.md 250% 时，§指针判据**恒不执行**（同一文件双跑：
 *   cap=5000 → exit 0 且不提指针；cap=999999 → exit 2 列出 56 条）。`:246` 的注释
 *   「悬空指针 exit 2 不动」与实况相反。
 * 现序：**凭据 5 > 指针 2 > 格式 4 > strict 容量 1 > 容量告警 0**——
 *   正确性判据**必须先判且必须报**；容量仍按用户 2026-09-16 判定「提醒即可、不阻断」。
 * 回退开关：`SHOUCANG_GATE_LEGACY=1` ⇒ 恢复旧序（容量分支先 return，吞掉正确性问题）。 */
const LEGACY = process.env.SHOUCANG_GATE_LEGACY === '1';
if (LEGACY && overCap) {
  const fmt = formatIssues.length ? ' | 另有格式违规: ' + formatIssues.join(' | ') : '';
  if (process.env.SHOUCANG_CAP_STRICT === '1') {
    console.error('exit=1 超容量（strict）| ' + detail.join(' | ') + hint + fmt);
    process.exit(1);
  }
  if (pct > 150) {
    console.log('exit=0 允许写入（**超 150%：强告警，但不阻断**）| '
      + `⚠️⚠️ 严重超容量 ${chars}/${limit} 字符 (${pct}%) —— **顶层索引 / 小节内容 两口径分开看**（见下）；`
      + '建议：把新行写进**顶层索引区**（本文件的语义区），内容下沉 `notes/`' + hint + fmt);
    process.exit(0);
  }
  console.log('exit=0 允许写入（**超容量仅提醒，不阻断**）| '
    + `⚠️ 超容量 ${chars}/${limit} 字符 (${pct}%) —— 建议合并精简或下沉 notes/` + hint + fmt);
  process.exit(0);
}
if (issues.length) {
  const fmt = formatIssues.length ? ' | 另有格式违规: ' + formatIssues.join(' | ') : '';
  console.error('exit=2 ' + detail.join(' | ') + capNote + fmt + hint);
  process.exit(2);
}
if (formatIssues.length) {
  console.error('exit=4 索引行格式违规（spec §8 v13） | ' + formatIssues.join(' | ') + hint + capNote);
  process.exit(4);
}
if (overCap) {
  /* 2026-09-16 用户判定：容量不是硬限（「直接拒绝不符合意图，提醒就可以」）。
   *   · `≤100%` 允许；· `100%–150%` 允许 + 提醒；· `>150%` **强告警但仍不阻断**
   *     （三次修正：一度改回 exit 1 硬拒，实测会挡掉深睡全部写入 ⇒ 收回；`SHOUCANG_CAP_STRICT=1` 保留严格档）。 */
  if (process.env.SHOUCANG_CAP_STRICT === '1') {
    console.error('exit=1 超容量（strict）| ' + detail.join(' | ') + hint);
    process.exit(1);
  }
  const strong = pct > 150
    ? `⚠️⚠️ 严重超容量 ${chars}/${limit} 字符 (${pct}%) —— **顶层索引 / 小节内容 两口径分开看**（见下）；建议：把新行写进**顶层索引区**（本文件的语义区），内容下沉 \`notes/\``
    : `⚠️ 超容量 ${chars}/${limit} 字符 (${pct}%) —— 建议合并精简或下沉 notes/`;
  console.log(`exit=0 允许写入（**${pct > 150 ? '超 150%：强告警，但不阻断' : '超容量仅提醒，不阻断'}**）| ` + strong + hint);
  process.exit(0);
}
console.log('exit=0 允许写入 | ' + detail.join(' | ') + hint);
process.exit(0);