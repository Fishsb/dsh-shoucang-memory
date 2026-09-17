#!/usr/bin/env node
/**
 * check-hardcode.mjs — 守藏开源合规检查：扫描代码与配置模板中的本机绝对路径
 *
 * 用法: node scripts/check-hardcode.mjs [项目根=当前目录] [--strict-docs] [--baseline-record N|--baseline-record=N]
 * 退出码: 0 干净 / 1 硬面违规 · 分母为 0 · 读失败 · 记录面超基线（或 --strict-docs 下有命中）
 *
 * ── 两面模型（2026-09-17 重构；依据圆桌会审裁决，替换原 SKIP_DIRS 整目录豁免）──
 *   硬面   = 代码与配置模板（AGENTS 规则 1 的原文范围：ts/tsx/js/mjs/cjs/py/yaml/yml/json/toml
 *            与 html/htm/css/scss/sh/ps1/cmd/bat/vue/svelte/xml）+ 按名入面的 `.gitignore`
 *            ⇒ **命中即 FAIL，面内不存在白名单**
 *   记录面 = docs/ deliverable/ 目录 + 散文类扩展名（md/txt/log/rst/adoc）+ CHANGELOG.md
 *            ⇒ **不豁免、不静默**：恒打印「记录面含本机路径 N 件」（N=0 也打印），
 *              可观测下降（--baseline-record 只许降、超基线即 FAIL），--strict-docs 一键转红
 *   排除区 = .git node_modules 缓存/运行时区 ⇒ 不扫，但计入 excluded 分类计数（不静默消失）
 *
 * ── 判因（为什么改）──
 *   旧版 `SKIP_DIRS` 的语义是「整目录从扫描面消失」：连 readdirSync 都不进入 ⇒ 被跳过的对象
 *   **既不进分母、也不出现在任何输出里**，门照样打印 ✅。这与 check-public-tree 的
 *   `catch { continue }` 是**同一个病**（静默豁免）。实测代价：旧版 exit 0 的同时，
 *   公开树 @HEAD 有 11 件本机路径字面量（工作区 13 件）——门绿而树脏。
 *
 * ── 匹配器（2026-09-17 定稿）──
 *   ① 前导**词边界** `(?<![A-Za-z0-9+.-])`：治「断词碎片」误报（协议名被截断后形似单字母盘符，
 *      例如 URL scheme 末字母 + 冒号 + 双斜杠那种形态）。实测：泛化正则命中 338 行/60 文件，
 *      加词边界后降到 16 行/9 件。
 *   ② **URL 断言**：词边界治不了「斜杠后中段」（`/` 不在排除类内，URL 里路径段的盘符仍会中），
 *      故对每个命中点回溯其是否落在 URL token 内，落在内则不报。实测两态成对：
 *      **URL 内嵌**盘符路径 ⇒ 不报；**非 URL** 的「斜杠后盘符路径」⇒ 必报。
 *      （本段刻意不写真实样例 —— 门自己含字面量即"检测器自伤"，实测踩过：连注释里的样例
 *        都会被裸 grep 判据抓到，故一律用文字描述。）
 *   ③ 读失败/stat 失败/目录命名成被扫文件 ⇒ 计入 skip 并 **exit 1**（不得静默跳过）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const positional = argv.filter((a) => !a.startsWith("--"));
const root = resolve(positional[0] || ".");
const strictDocs = flags.some((f) => f === "--strict-docs");
let baseline;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--baseline-record" && argv[i + 1] !== undefined) baseline = Number(argv[i + 1]);
  else if (argv[i].startsWith("--baseline-record=")) baseline = Number(argv[i].slice("--baseline-record=".length));
}

/** 硬面：代码与配置模板 */
const HARD_EXT = /\.(py|js|mjs|cjs|ts|tsx|yaml|yml|json|toml|html|htm|css|scss|sh|ps1|cmd|bat|vue|svelte|xml)$/i;
const HARD_NAME = /^\.gitignore$/;
/** 记录面：历史实测记录与散文 */
const RECORD_DIRS = new Set(["docs", "deliverables"]);
const RECORD_EXT = /\.(md|txt|log|rst|adoc)$/i;
const RECORD_FILES = /^CHANGELOG\.md$/i;
/** 排除区：不扫，但**逐个列名**计入输出（不得静默消失）。
 *  判据：.gitignore 已忽略的私有/运行时区 —— 永不入库，故不构成开源红线；
 *  但它们**必须出现在汇总里**，否则又是一次"静默豁免"。 */
const EXCLUDE_DIRS = new Set([".git", "node_modules", ".index_cache", ".kb", "__pycache__", "_archive_data", ".internal", ".workbuddy-ai", ".workbuddy", ".roundtable", ".agent-teams", "_memory", ".dsh-vision-toolkit"]);
/** 二进制/非文本：不扫，但计数（名单显式，防"沉默的第三类"） */
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|zip|gz|tgz|zst|7z|rar|woff2?|ttf|otf|eot|pdf|mp4|webm|mp3|exe|dll|so|dylib|bin|sqlite|db)$/i;
const SKIP_FILES = /^LICENSE$/i;

const PATH_RE = /(?<![A-Za-z0-9+.-])[A-Za-z]:[\\/]{1,2}[A-Za-z0-9_.\-]/g;
const URL_SPAN = /[A-Za-z][A-Za-z0-9+.\-]*:\/\/\S*/g;

function insideUrl(line, idx) {
  for (const m of line.matchAll(URL_SPAN)) {
    if (idx >= m.index && idx < m.index + m[0].length) return true;
  }
  return false;
}
function hitsOf(line) {
  const out = [];
  for (const m of line.matchAll(PATH_RE)) {
    if (insideUrl(line, m.index)) continue;
    out.push(m[0]);
  }
  return out;
}

let scan = 0, record = 0, other = 0, excluded = 0, skip = 0;
const violations = [];
const recordHits = [];
const recordFiles = new Set();
const excludedPaths = [];
const skipped = [];

function scanFile(p, face) {
  let text;
  try { text = readFileSync(p, "utf8"); }
  catch (e) { skip++; skipped.push(`${p}: 读失败 ${e.code || e.message}`); return; }
  if (face === "hard") scan++; else record++;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const hits = hitsOf(lines[i]);
    if (!hits.length) continue;
    const where = `${p}:${i + 1}: ${lines[i].trim().slice(0, 110)}`;
    if (face === "hard") violations.push(where);
    else { recordHits.push(where); recordFiles.add(p); }
  }
}

function walk(dir, face) {
  let names;
  try { names = readdirSync(dir); }
  catch (e) { skip++; skipped.push(`${dir}: 目录读失败 ${e.code || e.message}`); return; }
  for (const name of names) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); }
    catch (e) { skip++; skipped.push(`${p}: stat 失败 ${e.code || e.message}`); continue; }
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) { excluded++; excludedPaths.push(p); continue; }
      if (HARD_EXT.test(name) || HARD_NAME.test(name)) {
        skip++; skipped.push(`${p}: 目录却命名成被扫文件（异常，不得静默跳过）`); continue;
      }
      walk(p, RECORD_DIRS.has(name) ? "record" : face);
      continue;
    }
    if (SKIP_FILES.test(name)) continue;
    if (BINARY_EXT.test(name)) { other++; continue; }
    /* 目录归属优先于扩展名：记录目录内的一切都归记录面（.html 也不例外） */
    if (face === "record") { scanFile(p, "record"); continue; }
    if (RECORD_FILES.test(name) || RECORD_EXT.test(name)) { scanFile(p, "record"); continue; }
    if (HARD_EXT.test(name) || HARD_NAME.test(name)) { scanFile(p, "hard"); continue; }
    other++;
  }
}

walk(root, "hard");

const summary = `scan=${scan} record=${record} other=${other} excluded=${excluded} hits=${violations.length} recordFiles=${recordFiles.size} recordHits=${recordHits.length} skip=${skip}`;
console.log(summary);
console.log(`记录面含本机路径 ${recordFiles.size} 件（${recordHits.length} 处；--strict-docs 可转红；N=0 亦打印）`);
console.log(`排除区 ${excludedPaths.length} 个目录（不计入扫描面，逐个列名以防静默）: ${excludedPaths.map((x) => x.slice(root.length + 1) || x).join(" ")}`);

if (recordHits.length) {
  console.log(`\nℹ 记录面命中 ${recordHits.length} 处（历史记录，缺省不判红）:`);
  for (const v of recordHits) console.log("  · " + v);
}
if (skipped.length) {
  console.error(`\n⛔ 读失败/异常 ${skipped.length} 处（不得静默跳过）:`);
  for (const s of skipped) console.error("  · " + s);
}
if (violations.length) {
  console.error(`\n⛔ 硬面硬编码路径 ${violations.length} 处:`);
  for (const v of violations) console.error("  " + v);
}

let code = 0;
const reasons = [];
if (violations.length) { code = 1; reasons.push(`硬面命中 ${violations.length} 处`); }
if (skip > 0) { code = 1; reasons.push(`读失败/异常 ${skip} 处`); }
if (scan === 0) { code = 1; reasons.push("硬面分母为 0（作用域为空，判 FAIL）"); }
if (baseline !== undefined && !Number.isNaN(baseline) && recordFiles.size > baseline) {
  code = 1; reasons.push(`记录面 ${recordFiles.size} 件 > 基线 ${baseline} 件（只许降不许升）`);
}
if (strictDocs && recordFiles.size) { code = 1; reasons.push(`--strict-docs：记录面仍有 ${recordFiles.size} 件`); }

if (code === 0) console.log(`\n✅ 硬编码路径检查通过（硬面 ${scan} 件零命中；记录面 ${recordFiles.size} 件已计数）`);
else { console.error(`\n⛔ 硬编码路径检查失败 — ${reasons.join("；")}`); process.exit(code); }
