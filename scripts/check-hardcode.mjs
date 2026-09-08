#!/usr/bin/env node
/**
 * check-hardcode.mjs — 守藏开源合规检查:扫描代码与配置模板中的本机绝对路径
 *
 * 用法: node scripts/check-hardcode.mjs [项目根=当前目录]
 * 扫描范围: 代码与配置模板 (*.py *.js *.mjs *.yaml *.yml *.json *.toml)
 * 豁免: docs/(设计文档,路径属实测记录)、node_modules、.git、.internal(本机瞬态)、LICENSE、CHANGELOG
 * 退出码: 0 干净 / 1 发现硬编码
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const CODE_EXT = /\.(py|js|mjs|cjs|yaml|yml|json|toml)$/;
const SKIP_DIRS = new Set([".git", "node_modules", "docs", ".index_cache", ".kb", "__pycache__", "_archive_data", ".internal"]);
const SKIP_FILES = /^(LICENSE|CHANGELOG\.md)$/i;

// 本机绝对路径特征(Windows 盘符路径 + 用户目录)
// 说明: 模式按"引号/空白/赋值符后跟盘符"识别,注释中不得出现真实路径字面量
// 2026-09-08 增强: 盘符泛化为任意字母(此前只查两个特定盘符,其余盘符可逃逸)
const PATTERNS = [
  /["'\s(=:]+[A-Za-z]:\\+[A-Za-z]/, // 任意盘符 + 反斜杠（C:\ D:\ E:\ …）
  /["'\s(=:]+[A-Za-z]:\/+[A-Za-z]/, // 任意盘符 + 正斜杠（C:/ D:/ E:/ …）
];

let violations = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p);
      continue;
    }
    if (SKIP_FILES.test(name) || !CODE_EXT.test(name)) continue;
    const text = readFileSync(p, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (PATTERNS.some((re) => re.test(line))) {
        violations.push(`${p}:${i + 1}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

walk(root);
if (violations.length) {
  console.error(`⛔ 硬编码路径检查失败 — ${violations.length} 处:`);
  for (const v of violations) console.error("  " + v);
  process.exit(1);
} else {
  console.log("✅ 硬编码路径检查通过");
}
