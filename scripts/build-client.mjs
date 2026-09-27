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
/* 接缝③：词表索引**由目录生成**（新增词表文件无须改手写清单）——见 gen-i18n-dict-index.mjs 头注 */
execFileSync(process.execPath, [join(root, 'scripts', 'gen-i18n-dict-index.mjs')], { stdio: 'inherit' })

/* U2（2026-09-26）：**阶段 0b 已移除** —— 原本在此展平 Web Awesome 的主题令牌层
 *   （生成 65KB 的 .vendor-css.generated.js，运行时注入为独立 <style>）。
 *   U2 把 7 个 WA 组件全部改为「宿主 primitives 优先 + 自绘降级」后，产物已不带该库
 *   ⇒ 展平失去唯一消费者。宿主 primitives 自带样式（各组件有独立 *.module.css），
 *     面板自身样式仍走 window.__SC_CSS__ —— 单一来源，未变。
 *   ⚠ 若将来重新引入第三方组件库，**必须一并恢复本段**：历史判因（2026-09-13 真机取证）
 *     是「只 import 组件、不给令牌层 ⇒ 组件算出透明底/0 边框/0 内距，84×30 紫胶囊退化成
 *     29×14 裸文字」。 */
/* ── （原阶段 0b 代码已删除，保留本注释作为恢复指引） ──

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
    /* U3（2026-09-26）：`charset: 'utf8'` —— 中文**按原文存**，不再逐字转成 \uXXXX。
     *   判因（实测）：默认 ascii 下中文被转义成 \uXXXX（**6 字节/字**），而 UTF-8 原文只需
     *     **3 字节/字**。产物实测转义总数 22,018（其中 CJK 18,863）≈ **111KB 纯转义开销**。
     *   实测对照（同入口同选项）：charset=ascii **545KB** → charset=utf8 **479KB（省 66KB）**。
     *   ⚠ 为什么安全：产物本就是 UTF-8 文本，宿主按 UTF-8 加载；本仓从产物里抽文本的门禁
     *     （check-layout-px / audit-css-usage / gen-ui-preview / check-ui-contract）**都不依赖
     *     转义形态**（实测零命中），且它们抽的是 CSS 数组与符号名，与中文转义无关。
     *     语法由 `check-ui-contract` 的 `node --check` 独立守。 */
    charset: 'utf8',
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
  /* U2（2026-09-26）锚点更新：原断言 'customElements'（S3 组件库随产物送达）**已不成立** ——
   *   U2 把 7 个 WA 组件全部改为「宿主 primitives 优先 + 自绘降级」，产物**不再自带组件库**
   *   （实测省下 574KB：WA 代码 272KB + 主题 CSS 302KB）。
   *   契约改为描述现状：① 宿主接入层在位（host-ui 的 require 接缝）；
   *   ② 自绘降级基座在位；③ 真实请求的宿主模块名在产物里。
   *   ⚠ 三条**同时**存在才算完整：只有宿主接入而无降级 ⇒ 无宿主环境白屏；
   *     只有降级而无宿主接入 ⇒ 等于没接宿主、白白多背一份自绘。 */
  ['宿主 UI 接入层（U2：require 宿主 primitives 的接缝）', 'setRequire'],
  ['自绘降级基座（U2：无宿主时的组件实现）', 'checkbox-container'],
  ['宿主 primitives 模块名（U2：真实请求的模块）', 'dsh-client-ui-primitives']
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
