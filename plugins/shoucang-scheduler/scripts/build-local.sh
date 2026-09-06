#!/bin/bash
# build-local.sh — 不依赖 DSH 源码 checkout 的本地构建（2026-09-06 遗留项落地）
#
# 背景：scripts/build.sh 需要 DSH_CHECKOUT（源码 checkout，本机不存在）。实测本地可复现构建
# 的三个前提（全部踩实）：
# 1) 编译依赖落 package.json devDependencies（@deepseek-ai/dsh-tools 传递依赖自带
#    @deepseek-ai/cordis——npm 版 dsh-tools 是内部命名空间版，augment 指向 @deepseek-ai/cordis）。
#    注意：peerDependencies 里的包用 npm 按名安装会被静默跳过（"up to date"），必须落 devDeps。
# 2) --legacy-peer-deps：防 npm 10 arborist 在 dsh-llm 预发布 peer 区间上崩
#    （"Cannot read properties of null (reading 'children')"）。
# 3) tsconfig.local.json：moduleResolution=bundler + cordis paths 映射到 @deepseek-ai/cordis。
#    npm 版 cordis（type:module + 无扩展名 d.ts）在 NodeNext 下星号导出静默失效（TS2834→
#    TS2305）；bundler 解析允许无扩展名 d.ts。ESNext 产物与 NodeNext 等价（同为 ESM 无改写）。
# 发布构建仍以 DSH checkout 的 scripts/build.sh 为权威；本脚本用于本机迭代与无 checkout 环境。
# 用法: bash scripts/build-local.sh （或 npm run build:local）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 安装编译依赖（devDependencies，--legacy-peer-deps）==="
npm install --no-audit --no-fund --legacy-peer-deps

echo "=== 编译 src → lib ==="
./node_modules/.bin/tsc -p tsconfig.local.json
echo "=== build-local 完成 ==="
