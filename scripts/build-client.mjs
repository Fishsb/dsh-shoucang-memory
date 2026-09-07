/**
 * @dsh-external/shoucang-panel — client 半区构建。
 *
 * 纯 DOM 资产无需打包：把根目录 client.js（ModuleLoader.load 注册的 IIFE）
 * 复制为 lib/client.js——符合注入器「lib/client.js 即 client bundle」的
 * 产物契约（含 __ModuleLoader__ 特征），运行时经 exports './client' 加载。
 * 源 = client.js，产物 = lib/client.js；改 client.js 后重跑本脚本。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'client.js')
const out = join(root, 'lib', 'client.js')

mkdirSync(dirname(out), { recursive: true })
const text = readFileSync(src, 'utf8')
if (!text.includes('__ModuleLoader__')) {
  console.error('build:client — 源 client.js 缺少 __ModuleLoader__ 特征，中止')
  process.exit(1)
}
writeFileSync(out, text, 'utf8')
console.log(`build:client ✓ ${out} (${text.length} bytes)`)