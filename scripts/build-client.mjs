/**
 * @dsh-shoucang-memory — client 半区构建（S3 · 2026-09-13）
 *
 * 从「复制单文件」升级为「esbuild 打包」：
 *   源 = src-client/entry.js（① vendor.js 按需引入第三方组件库 ② body.js 面板本体）
 *   产物 = 仓根 client.js（IIFE · 不压缩）→ 再复制到 lib/client.js（沿用「lib/client.js 即 client bundle」契约）
 *
 * 为什么不压缩：仓内多件门禁从产物里**原地抽取 CSS 数组**（`var CSS = [ ... ].join('')`）——
 *   `scripts/audit-css-usage.mjs` / `check-layout-px.mjs` / `test-css-usage-gate.mjs` / `gen-ui-preview.mjs`
 *   都依赖该锚点与可读性；压缩会破坏它们。本件在打包后**逐项断言锚点仍在**，锚点丢失即判失败（防静默破坏门禁）。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'src-client', 'entry.js')
const artifact = join(root, 'client.js')
const out = join(root, 'lib', 'client.js')

mkdirSync(dirname(out), { recursive: true })

/* ── 阶段 0a：生成「面板接口契约」共享产物（S4） ──
 * 客户端要 import 它 ⇒ 必须先于打包生成；其源是 lib/panel-contract.js（host 构建产物）
 * ⇒ 故本步隐含要求先 npm run build:host（npm run build 已是 host → client 顺序）。 */
execFileSync(process.execPath, [join(root, 'scripts', 'gen-panel-contract.mjs')], { stdio: 'inherit' })

/* ── 阶段 0b：展平第三方组件库的主题令牌层（S3） ──
 * 判因（真机取证）：只 import 组件、不引入其**主题令牌层**时，`--wa-color-*` 全部未定义 ⇒
 *   组件算出透明底 / 0 边框 / 0 内距（实测按钮 84×30 紫胶囊退化成 29×14 裸文字）。
 * 做法：跟随 `@import` 递归展平 themes/default.css（含调色板），生成一个 ESM 文本模块；
 *   运行时由面板用**独立 <style>** 注入 —— 与我们的 CSS 数组分离，不污染各门禁的抽取锚点。 */
function flattenCss (file, seen) {
  const abs = resolve(file)
  if (seen.has(abs)) return ''
  seen.add(abs)
  if (!existsSync(abs)) return ''
  return readFileSync(abs, 'utf8').replace(/@import\s+url\(\s*(['"]?)([^'")]+)\1\s*\)\s*;/g, (m, q, rel) => {
    if (/^https?:/i.test(rel)) return ''
    return flattenCss(join(dirname(abs), rel), seen)
  })
}
{
  const themeRoot = join(root, 'node_modules', '@awesome.me', 'webawesome', 'dist', 'styles')
  const entry = join(themeRoot, 'themes', 'default.css')
  if (existsSync(entry)) {
    let css = flattenCss(entry, new Set())
    /* 作用域收口（必须）：展平后的主题含 `:root`/`html`/`body` 全局选择器，
     *   直接注入会**重绘宿主 DSH 页面**——插件绝不该改宿主。这里把它们改写为 `#scpanl-root`：
     *   令牌在该元素上定义，再由面板内组件继承，宿主页一像素不动。 */
    css = css
      .replace(/(^|[\s,{(])(:root|html|body)\b/g, '$1#scpanl-root')
      .replace(/\bwa-page\b/g, 'wa-page' /* 组件选择器保持原样 */)
    if (/(^|[},])\s*(:root|html|body)\s*[,{]/.test(css)) {
      console.error('build:client ✗ 主题 CSS 仍含未限定的全局选择器（会污染宿主页）')
      process.exit(1)
    }
    const gen = join(root, 'src-client', '.vendor-css.generated.js')
    writeFileSync(gen, '/* 生成物（build:client 产出）—— 第三方组件库主题令牌层，勿手改 */\n' +
      'export const VENDOR_CSS = ' + JSON.stringify(css) + '\n', 'utf8')
    console.log('  · 展平组件库主题令牌层 ' + Math.round(css.length / 1024) + 'KB → src-client/.vendor-css.generated.js')
  } else {
    console.warn('  ! 未找到组件库主题令牌层，跳过（组件将无配色）')
  }
}

/* 打包到临时文件 → 校验锚点 → 原子替换（校验失败则保持旧产物，不破坏仓内门禁） */
const tmp = artifact + '.build.tmp'
try {
  buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    minify: false,
    /* 关键：本仓 package.json 的 sideEffects 只声明 ./lib/client.js（面向宿主加载器的发布提示），
     * esbuild 若尊重它会把 src-client/body.js 与 vendor.js 整体 tree-shake 掉 ⇒ 产物变空。
     * 构建期忽略该类注解（本包的源码入口全部靠副作用自注册）。 */
    ignoreAnnotations: true,
    legalComments: 'none',
    outfile: tmp,
    logLevel: 'warning'
  })
} catch (e) {
  console.error('build:client ✗ esbuild 打包失败：' + (e && e.message ? e.message : e))
  process.exit(1)
}

let text = readFileSync(tmp, 'utf8')

/* 不再做"变量名/引号归一"：源码已把 CSS 数组挂到稳定锚点 window.__SC_CSS__，
 * 各门禁按该锚点 + 引号无关正则抽取（此前按变量名归一，漏改使用点 ⇒ 产物运行时 CSS2 is not defined）。 */

const REQUIRED = [
  ['__ModuleLoader__ 自注册契约', '__ModuleLoader__'],
  ['CSS 数组稳定锚点（门禁按 window.__SC_CSS__ 抽取）', 'window.__SC_CSS__'],
  ['CSS 数组起点', 'window.__SC_CSS__ = ['],
  ['CSS 数组终点（引号由门禁正则容错）', '].join('],
  ['web components（S3 组件库已随产物送达）', 'customElements']
]
const missing = REQUIRED.filter(([, needle]) => !text.includes(needle))
if (missing.length) {
  rmSync(tmp, { force: true })
  console.error('build:client ✗ 产物缺少必要锚点：' + missing.map((m) => m[0]).join(' / '))
  process.exit(1)
}

writeFileSync(artifact, text, 'utf8')
rmSync(tmp, { force: true })
writeFileSync(out, text, 'utf8')
console.log(`build:client ✓ ${artifact} + ${out} (${text.length} bytes · 组件库已内含)`)
