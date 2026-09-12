// distill-infra.ts — 蒸馏「基础设施（日志 / 审计 / 台账 / 回合集 / 存根）」领域
//
// 由来：registerDistill 原为 1440 行巨型工厂闭包（87 个顶层定义互相可见 ⇒ 无法单独测试/替换）。
//   本阶段按领域切开：实现函数全部在**模块级**，依赖显式窄传（8 项）。
//   对外只暴露 createInfraApi(d) —— 返回绑定后的句柄，调用方零感知。
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CRITERIA_VERSION } from './criteria.generated.js'
import type { DistillState } from './distill-state.js'

export interface InfraDeps {
  logFile: string
  auditFile: string
  ledgerFile: string
  episodeFile: string
  stubDir: string
  kRoot: string
  EPISODE_CAP: number
  LEDGER_FILE: string
}

/** 去掉首个参数（依赖 d）后的参数元组 —— 用于生成**保类型**的绑定句柄。 */
type Tail<T> = T extends [unknown, ...infer R] ? R : never

export function createInfraApi(d: InfraDeps) {
  return {
    ledger: (...a: Tail<Parameters<typeof ledger>>) => ledger(d, ...a),
    recordEpisode: (...a: Tail<Parameters<typeof recordEpisode>>) => recordEpisode(d, ...a),
    log: (...a: Tail<Parameters<typeof log>>) => log(d, ...a),
    sidShort: (...a: Tail<Parameters<typeof sidShort>>) => sidShort(d, ...a),
    audit: (...a: Tail<Parameters<typeof audit>>) => audit(d, ...a),
    recordStub: (...a: Tail<Parameters<typeof recordStub>>) => recordStub(d, ...a),
  }
}
export type InfraApi = ReturnType<typeof createInfraApi>


const ledger = (d: InfraDeps, o: Record<string, unknown>): void => {
  try {
    mkdirSync(dirname(d.ledgerFile), { recursive: true })
    const dom = String((o as { domain?: string }).domain || '')
    const type = String((o as { type?: string }).type || (dom === 'consolidate' ? 'decision.consolidate' : dom === 'ingest' ? 'decision.ingest' : 'event'))
    appendFileSync(d.ledgerFile, JSON.stringify({ at: new Date().toISOString(), criteriaVersion: CRITERIA_VERSION, type, ...o }) + '\n', 'utf8')
  } catch { /* 台账失败静默（不影响主流程） */ }
}


const recordEpisode = (d: InfraDeps, o: Record<string, unknown>): void => {
  try {
    mkdirSync(dirname(d.episodeFile), { recursive: true })
    appendFileSync(d.episodeFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8')
    try {
      const ls = readFileSync(d.episodeFile, 'utf8').split('\n').filter((l) => l.trim())
      if (ls.length > d.EPISODE_CAP + 8) writeFileSync(d.episodeFile, ls.slice(ls.length - d.EPISODE_CAP).join('\n') + '\n', 'utf8')
    } catch { /* 修剪失败无害 */ }
  } catch { /* 记录失败静默 */ }
}


const log = (d: InfraDeps, msg: string): void => { try { mkdirSync(dirname(d.logFile), { recursive: true }); appendFileSync(d.logFile, '[' + new Date().toISOString() + '] ' + msg + '\n') } catch { /* 静默 */ } }


// sid 可读短号：slice(0,8) 恒等于 'session-' 前缀（此前日志全打成 'session-' 无辨识度）——取 uuid 中段
const sidShort = (d: InfraDeps, sid: string): string => (sid && sid.startsWith('session-') && sid.length > 16 ? sid.slice(8, 16) : String(sid || '').slice(0, 12))


const audit = (d: InfraDeps, o: Record<string, unknown>): void => { try { mkdirSync(dirname(d.auditFile), { recursive: true }); appendFileSync(d.auditFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n') } catch { /* 静默 */ } }


const recordStub = (d: InfraDeps, o: Record<string, unknown>): void => {
  try {
    mkdirSync(d.stubDir, { recursive: true })
    appendFileSync(join(d.stubDir, 'stub.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n', 'utf8')
  } catch { /* 存根失败静默 */ }
}
