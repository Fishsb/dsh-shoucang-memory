// test-dsh-tools-hook.mjs — 供 test-scheduler-wiring.mjs 使用的 ESM 解析钩子
//
// 为什么需要：`@deepseek-ai/dsh-tools`（scheduler.ts 用它 defineTool）依赖
//   `@deepseek-ai/dsh-scope`，后者**只在 DSH 宿主运行时提供、开发机没有** ⇒
//   直接 `import '../lib/scheduler.js'` 会以 ERR_MODULE_NOT_FOUND 失败，
//   导致 scheduler 这个**装配面**完全无法被黑盒测试。
//
// 做法：只把 `@deepseek-ai/dsh-tools` 这一个 specifier 重定向到一个 `data:` URL 的极简 stub。
//   · 不往 node_modules 塞东西（那会让"为什么这台机器能跑"变成隐形知识）；
//   · 不新增 stub 文件（data URL 内联）；
//   · 只影响本进程、只影响这一个 specifier。
//
// ⚠ stub 的语义假设：`defineTool(t)` 只是**原样返回工具描述对象**（加类型标注）。
//   本仓库只用到这一层，且被测的是「构造了什么、注册了什么」，不是 dsh-tools 自身行为。
//   若 dsh-tools 哪天开始做真实加工（补默认值/校验），本 stub 会让测试失真 —— 那时应当
//   改为把 dsh-scope 也一起 stub，或在钩子里返回更完整的实现。
const STUB = 'data:text/javascript,' + encodeURIComponent('export const defineTool = (t) => t\n')

export async function resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-tools') {
    return { url: STUB, format: 'module', shortCircuit: true }
  }
  return next(specifier, context)
}
