/**
 * check-capacity-wiring.mjs — ADR-333 容量门**接线与可观测**判据（2026-09-22）
 *
 * ── 判因（本轮的实战教训，不是预防性抽象）──────────────────────────────────────
 * 1. **「关了一半的门」**：`SHOUCANG_CAP_STRICT` 在三处子进程调用点语义分叉——
 *    两个自动路径（`distill-write.capEnv` / `deepsleep-apply`）**从不注入**该变量，
 *    而 `panel-inject` 当时用 `{...process.env}` **继承环境** ⇒ 部署侧一旦设了 `=1`，
 *    "人在面板上手工改文件"会被自动容量闸拒，且**无任何信号**。
 * 2. **「采了不显示」**：`panel-memory` 采集 `gateRejects` 而 `src-client/*` **零命中**；
 *    `memory-reconcile` 的 `rejectRate` 分母用**全体** writeEvents ⇒ 画像 167 次真拒被摊薄成 7.4%。
 * 3. **「跨通道聚合掩盖」**：`deepSleepLanded` 的 `other:{tried,done}` 只能答"有没有落地"，
 *    答不了"**哪个**通道零落地" ⇒ 画像通道有提案零落地的轮次被判 landed（实测 29 轮）。
 *
 * ── 本件守什么（四组，均含 `--selftest` 反例自证）────────────────────────────────
 *   ① **子进程开关四点全覆盖**：三处调用点必须**显式**决定容量阻断语义（不许靠 `...process.env` 撞运气）。
 *   ② **回读内容**（不只字节）：`section-rewrite` 的两个写入原语都须逐字比对。
 *   ③ **CAS 原语存在且被两个无锁写者使用**（`AGENT.md` 上的并发语义）。
 *   ④ **可观测面有消费方**：`byChannel` / `gateRejectsDetail` / `zeroLanded` 三者都须在**前端或审计**被读。
 *
 * 用法: node scripts/check-capacity-wiring.mjs [--selftest]
 * 退出码：0=PASS  1=FAIL
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }
/** 剥注释：注释里提到符号**不算接线**（本轮已两次踩：「注释声称」≠「代码实现」）。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const rd = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

/* ── `--selftest`：反例自证（证明判据会红，不是恒真） ─────────────────────────── */
if (process.argv.includes('--selftest')) {
  const cases = [
    ['正例·capEnv 显式设 STRICT', `SHOUCANG_CAP_STRICT: liveCapacityEnforce(dep) ? '1' : '0',`, true],
    ['**反例**·靠 process.env 继承（"关了一半的门"）', `env: { ...process.env, MEMORY_ROOT: memoryLibRoot() }`, false],
    ['正例·回读内容比对', `if (readFileSync(p, 'utf8') !== text) return { ok: false, error: '回读内容不符' }`, true],
    ['**反例**·只比字节数（内容被覆盖检测不出）', `if (statSync(p).size !== want) return { ok: false, error: '回读字节不符' }`, false],
    ['正例·CAS 使用', `atomicWriteFileCas(file, lines.join('\\n'), disk)`, true],
    ['**反例**·无 CAS 直写', `atomicWriteFile(file, lines.join('\\n'))`, false],
  ]
  let bad = 0
  for (const [label, line, want] of cases) {
    const isBad = /\.\.\.process\.env/.test(line)
      || (/statSync/.test(line) && !/readFileSync/.test(line))
      || (/^atomicWriteFile\(/.test(line.trim()) && !/Cas/.test(line))
    const got = !isBad
    if (got !== want) bad++
    console.log(`${got === want ? '✅' : '❌'} ${label} → 判${got ? '合规' : '违规'}（期望${want ? '合规' : '违规'}）`)
  }
  const negs = cases.filter(([l]) => l.includes('反例'))
  if (negs.length < 2) { bad++; console.log('❌ 反例不足（须含「继承 env」与「只比字节」）') }
  console.log(bad ? `\nFAIL（--selftest ${bad} 例）` : `\nPASS（判据自证可用：${cases.length} 例，含 ${negs.length} 条反例）`)
  process.exit(bad ? 1 : 0)
}

/* ── 实跑 ───────────────────────────────────────────────────────────────────── */
const dw = strip(rd('src/distill-write.ts'))
const pi = strip(rd('src/panel-inject.ts'))
const to = strip(rd('src/treeops.ts'))
const sr = strip(rd('src/section-rewrite.ts'))
const pm = strip(rd('src/panel-memory.ts'))
const dc = strip(rd('src/deepsleep-core.ts'))
const dr = strip(rd('src/deepsleep-run.ts'))
const po = strip(rd('src-client/panes-observe.js'))
const mr = strip(rd('scripts/memory-reconcile.mjs'))

console.log('容量门接线与可观测 · ADR-333\n')

/* ① 子进程开关四点全覆盖 */
ok(/SHOUCANG_CAP_STRICT:\s*liveCapacityEnforce\(dep\)/.test(dw),
  '①-1 `capEnv` 把宿主开关映射到子进程 `SHOUCANG_CAP_STRICT`（复用既有 env，不加第二个）')
ok(/SHOUCANG_CAP_STRICT:\s*'0'/.test(pi),
  '①-2 `panel-inject`（**人工路径**）显式置 0 —— 不再靠 `...process.env` 撞运气')
ok(/SHOUCANG_CAP_STRICT:\s*'0'/.test(to),
  '①-3 `treeops`（**结构维护路径**）显式置 0 —— 同上')
ok(/\{[^}]*SHOUCANG_CAP_STRICT:\s*'0'[^}]*\}/.test(pi),
  '①-4 `SHOUCANG_CAP_STRICT:\'0\'` 位于 env **字面量内**（而非被 `...process.env` 反向覆盖）')
/* ⚠ 判据自省：本条首版写成"不得出现 `...process.env`" ⇒ **假红**——`gateWrite` 需要它保留
 *   `PATH`/`NODE_*` 等运行必需变量，且 `SHOUCANG_CAP_STRICT` **写在 spread 之后**故覆盖生效。
 *   ⇒ 判据必须断言**最终语义**（该键是否被显式定为 '0'），而不是"有没有用过 spread"。
 *     这是本仓既有教训的又一例：「判据要断言语义，不断言写法」。 */
ok(/SHOUCANG_CAP_STRICT:\s*'0'(?![\s\S]{0,200}\.\.\.process\.env)/.test(pi),
  '①-4b 显式值不被随后的 `...process.env` 覆盖（顺序保证：spread 在前、显式键在后）')

/* ② 回读内容（不只字节） */
/* ⚠ 判据自省：本条首版数的是同一措辞出现次数（期望 ≥2）⇒ **假红**——两个原语的错误文案不同
 *   （`atomicWriteFile` 无 `gate:` 字段），故措辞不同、精确计数不可靠。
 *   ⇒ 改为按**函数体分别断言**：先切出两个原语的函数体，各自断言"含逐字回读比对"。 */
const bodyOf = (src, name) => {
  const i = src.indexOf(`export function ${name}`) >= 0 ? src.indexOf(`export function ${name}`) : src.indexOf(`export async function ${name}`)
  return i < 0 ? '' : src.slice(i, i + 3000)
}
const awf = bodyOf(sr, 'atomicWriteFile')
const gwf = bodyOf(sr, 'gatedWriteFile')
ok(/readFileSync\(p, 'utf8'\)\s*!==\s*text/.test(awf),
  '②-1 `atomicWriteFile` 逐字回读比对（原只比 `statSync().size`）')
ok(/readFileSync\(p, 'utf8'\)\s*!==\s*text/.test(gwf),
  '②-2 `gatedWriteFile` **同批**补内容校验（两原语不许分叉成两套"可验"语义）')

/* ③ CAS 原语 + 两个无锁写者 */
ok(/export function atomicWriteFileCas/.test(sr), '③-1 CAS 原语已导出（`atomicWriteFileCas`）')
ok(/atomicWriteFileCas\(file/.test(dw), '③-2 画像通道（`writeProfileLine`）用 CAS 提交')
ok(/CAS 冲突/.test(strip(rd('src/deepsleep-apply.ts'))), '③-3 原则通道（`commitAccepted`）用 CAS 预检')
ok(/originOnDisk/.test(strip(rd('src/deepsleep-apply.ts'))),
  '③-4 CAS 基线**随读-改-写链传递**（落盘点重读 = 假保护）')

/* ④ 可观测面有消费方 */
ok(/byChannel/.test(mr), '④-1 `memory-reconcile` 产出 `byChannel`（拒绝率按通道）')
ok(/byChannel/.test(po), '④-2 前端**渲染** `byChannel`（采了必须显示）')
ok(/gateRejectsDetail/.test(pm), '④-3 `panel-memory` 产出 `gateRejectsDetail`（按 target 分组）')
ok(/gateRejectsDetail/.test(po), '④-4 前端**渲染**门拒明细（原 `gateRejects` 零命中）')
ok(/zeroLandedChannels/.test(dc) && /zeroLanded:/.test(dr),
  '④-5 深睡审计行带 `zeroLanded`（**指名**零落地通道，原只有两个汇总数字）')
ok(/byChannel\?:/.test(strip(rd('src/channel-plan.ts'))),
  '④-6 `otherChannels.byChannel` 为可选 ⇒ 既有构造面零迁移（向后兼容）')

/* ⑤ 假绿防线：新形状必须**被真的读过**，不是只写出来 */
ok(!/zeroLanded:\s*\[\]/.test(dr), '⑤ `zeroLanded` 不得硬编码空数组（那会让"没堵"与"没接"不可分辨）')

console.log(fail ? `\nFAIL（${fail} 项）` : '\nPASS（容量门四点接线 + 三处可观测面均有消费方）')
process.exit(fail ? 1 : 0)
