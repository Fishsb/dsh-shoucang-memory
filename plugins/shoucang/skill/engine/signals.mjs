// signals.mjs — 蒸馏预筛信号词表（engine 共享模块，ADR-0005 阶段 1）
// 口径与 scripts/candidate_grep.mjs 强/中信号同源（2026-09-06 抽离自记忆插件 PRESCAN_* 常量）。
// 消费方：记忆插件 distillPrescan（import 替换内嵌常量）；后续项目插件薄包装复用同一份。
// 用法：import { hasDistillSignals } from '<技能仓>/engine/signals.mjs'

export const PRESCAN_STRONG = ['记住', '以后', '注意', '踩坑', '原来是这样', '应该改成', '别再用', '纠正', '别忘了', '务必']
export const PRESCAN_MID = [
  /失败.{0,24}(换|改)用/,
  /(报错|失败).{0,16}(换|改)用/,
  /改用.{0,12}(工具|方式|方案|命令)/,
  /原因.{0,12}(是|为|在于)/,
  /(记|存).{0,6}(到|进)/,
  /根因/,
  /对策/,
  /(要|该)记住/,
  /下次(要|得|注意)/,
]

// 增量正文是否含价值信号（命中任一强/中信号即 true；空文本 false）
export function hasDistillSignals(text) {
  if (!text) return false
  if (PRESCAN_STRONG.some((s) => text.includes(s))) return true
  return PRESCAN_MID.some((re) => re.test(text))
}
