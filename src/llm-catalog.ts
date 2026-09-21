// llm-catalog.ts — 宿主模型目录（**单一实现** · 2026-09-21 · ACT-295）
//
// ## 为什么单独成件
// 「有哪些 provider / 模型 / **档位**」此前**只**实现在 `scheduler.ts#llmModelsOf`（20 行，只回
//   `{provider,id,name}`）—— 于是**参数页能选模型、选不了档位**，而面板新要的评估通道模型选择器
//   （用户口径「模型设置参考 DSH 输入框的模型选项卡」）需要的正是**第三级：档位（reasoning effort）**。
//   就地给 scheduler.ts 加能力会撞两重棘轮：① 它是 `check-module-growth` 冻结件（基线 606，
//   实测已 613，容差仅剩 7 行）；② `audit-wiring` I1 装配 ≤120 行。⇒ 按领域接缝单独成件。
//
// ## 复刻契约而非挂组件（判据见记忆 `notes/tools.md §DSH 插件生态调研`）
// 官方 `@deepseek-ai/dsh-client-ui-model-selection` 的 `ModelSelect` 实测签名为
//   `({ locked, available, directory, load, select }) => JSX | null`，依赖 **React** + `ctx.modelDirectories`
//   + `SessionId`（见其 `lib/types/client/{ModelSelect,directory,service}.d.ts`），且 `available=false`
//   时**直接渲染 null**。本面板是**纯 DOM**（esbuild 单 IIFE，无 React）⇒ 实例物理不可复用，
//   故只复刻其**数据契约**：provider → model → effort 三级，档位文案取 adapter 自己的 `effort.name`。
//
// ## 档位不是假旋钮（本仓对"登记了但没人消费"有先例）
// `efforts` / `defaultEffort` 逐字来自 `resolveModelInfo()`（adapter 自己声明），本件**不发明常量表**；
//   拿不到就回空数组 + `defaultEffort: undefined`，UI 显示「沿用模型默认」——**不猜**。
import type { Context } from '@deepseek-ai/cordis'

/** 一个可选路由：provider + 模型 id + 名称 + 该路由**真实可用**的档位。 */
export interface LlmModelEntry {
  provider: string
  id: string
  name: string
  /** adapter 声明的可选档位 id（顺序即 adapter 偏好序）；空 = 该路由无档位概念 */
  efforts: string[]
  /** adapter 声明的默认档位；缺省 ⇒ 请求里不带 effort，沿用模型自身默认 */
  defaultEffort?: string
  /** provider 声明的上下文上限（token）；取不到省略 */
  contextWindow?: number
}

/** 每次枚举最多富化多少个模型的档位（`resolveModelInfo` 是逐模型 RPC；防 N×M 打爆） */
const ENRICH_CAP = 80

/** 宿主 llm 服务的最小面（**结构化**，不 import 宿主类型 ⇒ 宿主版本漂移不炸编译） */
interface HostLlm {
  listProviders?: () => unknown[]
  listModels?: (p: string) => Promise<Array<{ id?: string; name?: string }>>
  resolveModelInfo?: (
    p: string, m: string, signal?: AbortSignal,
  ) => Promise<{
    context?: { contextWindow?: number }
    reasoning?: { efforts?: ReadonlyArray<{ id?: unknown; name?: unknown }>; defaultEffort?: unknown }
  } | null>
}

const strOf = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/** provider 行的 id 取值（历史实现三写法兼容：id / provider / name —— 保留原语义不收紧） */
function providerIdOf(p: unknown): string {
  const o = p as { id?: unknown; provider?: unknown; name?: unknown } | null
  return strOf(o?.id) || strOf(o?.provider) || strOf(o?.name)
}

/**
 * 建一个**模型目录读取器**（调用方持有，按需调用；本件不缓存、不订阅）。
 *
 * 失败语义：**逐层降级、绝不抛** —— 宿主无 llm ⇒ 空数组；单 provider 枚举失败 ⇒ 跳过该 provider；
 *   单模型档位解析失败 ⇒ 该模型 `efforts:[]`（UI 显示「沿用模型默认」）。这与仓内既有
 *   `llmModelsOf` 的「枚举失败静默」同口径，但**多一层富化**。
 */
export function createLlmCatalog(ctx: unknown) {
  return async function listLlmCatalog(): Promise<LlmModelEntry[]> {
    const out: LlmModelEntry[] = []
    try {
      const llm = (ctx as { llm?: HostLlm } | undefined)?.llm
      if (!llm || typeof llm.listProviders !== 'function') return out
      const providers = llm.listProviders() || []
      for (const p of providers) {
        const pid = providerIdOf(p)
        if (!pid) continue
        if (typeof llm.listModels !== 'function') continue
        let models: Array<{ id?: string; name?: string }> = []
        try { models = (await llm.listModels(pid)) || [] } catch { continue } // 单 provider 枚举失败跳过
        for (const m of models) {
          const id = strOf(m?.id)
          if (!id) continue
          const entry: LlmModelEntry = { provider: pid, id, name: strOf(m?.name) || id, efforts: [] }
          if (out.length < ENRICH_CAP && typeof llm.resolveModelInfo === 'function') {
            try {
              const info = await llm.resolveModelInfo(pid, id)
              const effs = info?.reasoning?.efforts || []
              entry.efforts = effs.map((e) => strOf(e?.id)).filter(Boolean)
              const dflt = strOf(info?.reasoning?.defaultEffort)
              if (dflt) entry.defaultEffort = dflt
              const cw = Number(info?.context?.contextWindow)
              if (Number.isFinite(cw) && cw > 0) entry.contextWindow = cw
            } catch { /* 档位解析失败 ⇒ 保留空档位（UI 显「沿用模型默认」），不抛 */ }
          }
          out.push(entry)
        }
      }
    } catch { /* 宿主 llm 不可用 = 空目录 */ }
    return out
  }
}

export type LlmCatalogFn = ReturnType<typeof createLlmCatalog>

/** 供装配层做**编译期形状对账**：目录项是旧 `{provider,id,name}` 的**超集**（旧消费方零迁移）。 */
export type LlmCatalogEntry = LlmModelEntry

/** 保留一个 `Context` 的显式引用点，避免 `import type` 被判成未使用（本仓 tsconfig 无 noUnusedLocals 但有 lint 口径）。 */
export type LlmCatalogCtx = Context
