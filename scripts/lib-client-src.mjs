// lib-client-src.mjs — **前端源码的统一读取口径**（UI1/U1 · 2026-09-15）
//
// **判因（实测教训，两条）**：
//   ① UI1/U1 把 `body.js`（原 5476 行单体）的服务逐个抽成独立模块（`styles.js` / `dom.js` /
//      `state.js` / `ui-kit.js`）⇒ 任何"**读单个文件再抽某符号区段**"的门禁都会失配 ——
//      实测一次抽 `UI` 就同时打断 **3 件**（`check-ui-contract` / `test-ui-derive` / `test-fold-state`）。
//   ② 更不能读**产物** `client.js`：esbuild 会重排并重命名局部变量（实测 `CSS` → `CSS2`），
//      从产物抽结构本就脆（`check-ui-contract` 早期因此改用源码）。
//
// **口径**：前端源码 = `src-client/` 下**全部业务模块的拼接**。
//   · 拼接顺序**无关紧要**（各门只做"找符号 / 抽区段 / 断言存在性"，不做跨文件语义分析）；
//   · 新增模块时**无需改本件**（除需排除的生成物）—— 这是本件存在的意义。
//
// ⚠ 排除生成物（由生成器产出，非手写源码）：`*.generated.js`、以 `.` 开头的临时产物。
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** 参与"前端源码口径"的模块（手动列出，避免把生成物/临时产物拼进来） */
const MODULES = ['styles.js', 'dom.js', 'state.js', 'ui-kit.js', 'body.js']

/** 返回 `src-client/` 下业务模块的**拼接文本**；缺席的文件自动跳过。 */
export function clientSource(root) {
  const dir = join(root, 'src-client')
  const parts = []
  for (const f of MODULES) {
    const p = join(dir, f)
    if (existsSync(p)) parts.push(readFileSync(p, 'utf8'))
  }
  // 兜底：若上面清单全部缺席（例如刚重构改了名），退化为"读取全部非生成物 .js"
  if (!parts.length) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.js') && !f.includes('.generated.') && !f.startsWith('.'))) {
      parts.push(readFileSync(join(dir, f), 'utf8'))
    }
  }
  return parts.join('\n')
}

/** 已抽出的独立模块清单（供门禁在报错信息里提示"符号可能已搬家"） */
export const CLIENT_MODULES = MODULES
