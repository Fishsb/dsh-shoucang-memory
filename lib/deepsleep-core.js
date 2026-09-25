// deepsleep-core.ts — 深度睡眠「判据层」（纯函数 / 决策表 / 契约常量 / 状态机类型）
//
// 为什么存在（2026-09-12 架构根治 P1，依据 deliverables/architecture-review-2026-09-12.md）：
//   原全部挤在 distill.ts 内 —— 该文件 3512 行（全仓 38.2%）、变更 81 次（第二名 1.65 倍），
//   且深睡标识符 172 处**贯穿** 163–3510 行，与蒸馏逻辑**交织而非分段**。
//   后果：任何深睡改动都必须在全项目影响半径最大的文件里穿针引线。
//
// 本模块准入条件（**只放这三类**）：
//   ① 纯函数 / 决策表 —— 无闭包状态、可直接单测驱动；
//   ② 深睡契约常量与提示词模板；
//   ③ 深睡状态机类型（SessState / DeepSleepStatus / SessRec）。
//
// **不放在这里**：任何需要访问 registerDistill 闭包状态的代码。
//   那属于 Phase 2 的 deepsleep.ts（带显式 ctx 参数）—— 见报告 §P1 分期表。
//
// 依赖方向（切分的全部意义所在）：
//   本模块**只向下**依赖 criteria.generated.ts / criteria.ts（判据层读口）与 targets.ts（dshHome），
//   **绝不依赖 distill.ts**。判据层从此不再被 3500 行的闭包裹挟，可独立阅读、独立测试、独立演进。
import { readFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONSOLIDATE_JUDGE, JUDGEMENT_HINT, JUDGEMENT_VALUES, TRIGGER } from './criteria.generated.js';
import { splitLawOf } from './criteria.js';
import { dshHome } from './targets.js';
/** 分裂律参数（`ingest.granularity.split-law`）——唯一读口在 `criteria.ts#splitLawOf`。
 *  判因（2026-09-20 round 9）：本提示词曾把 `R=1000` **写死在模板串里**
 *  ⇒ 改注册表 + `gen:criteria` + 门禁全绿，而喂给模型的提示词**零变化**（假旋钮）。 */
const SPLIT_LAW = splitLawOf();
/**
 * 触发阈值回退的**单一来源**（2026-09-15 P0.1 实证修复 · 同日扩面订正）。
 *
 * 缺陷（实测）：全仓曾有 **8 处**硬编码 `|| 10800000`（3h）兜底，而真正生效的缺省来自
 *   `scheduler.ts` 的 zod `.default(TRIGGER.idleMs)` = **2700000（45min）** —— 同一个默认**两个来源**。
 *   且 zod 有 default ⇒ 配置**永不为 falsy** ⇒ 那 8 处兜底是**死代码**，连注释（多处"缺省 3h"）一并过期。
 * ⚠ **计数订正**：首轮只报了 4 处（`deepsleep-machine.ts`）—— 根因是检索用了**大小写敏感**的 `idleMs`，
 *   而 `deepSleepIdleMs` 的大写 `I` 不匹配 ⇒ **漏检 4 处**（`deepsleep.ts` ×2 · `distill-hooks.ts` ×2）。
 *   仓内原则「**模式派生集合先核对**」正是防这个：命中集必须显式列举，不能靠一次通配就下结论。
 * 修法（根部解决，**不改行为**）：回退一律引用注册表 ⇒ 默认值只有一处定义。
 *   放在本件（deepsleep-core）因它位于依赖链底部：machine / deepsleep / distill-hooks 三处都能 import。
 *   ⚠ 时间维的具体值将在 P1 双维水位里按预注册判据重新校准，本步**只统一来源、不动数值**。
 */
export const idleMsOf = (c) => Number(c.deepSleepIdleMs) || TRIGGER.idleMs;
/**
 * **睡眠纪元标识**（S-P1a · 2026-09-15）：`epoch-<起时刻 ms>`。
 *
 * 语义（`docs/sleep-granularity-plan-2026-09-15.md` §5）：**纪元 = 上次睡眠成功 → 本次睡眠成功**的区间，
 *   **既是触发单位，也是度量单位**（R1 以它为样本）。
 *
 * ⚠ **对方案册的一处偏离（已记录）**：册中原写 `epoch-<单调序号>-<起时刻>`。实施时改为**仅用起时刻**——
 *   理由：单调序号在**重启后必须回放重建**（否则序号会回退），而回放本身要再引入一份状态与审计依赖；
 *   毫秒级起时刻**已唯一且天然有序**（同一毫秒不可能触发两次 —— 触发路径有 `m.deepSleepRunning` 并发闸 + 10min 巡检间隔）。
 *   ⇒ 用一个自带序的 id 换掉一份需要回放维护的计数器，属"**拒绝冗余**"取向。
 *
 * **命名避开 `epoch`**：该词已被 `supply-ledger.ts` 占用（per-session 去重窗口轮次）——
 *   仓内有 `audit-impl-drift` 专抓同名不同义（先例：`rewriteRowPointers` 被强制改名）。
 */
export const epochIdOf = (startedAt) => `epoch-${Math.floor(Number(startedAt) || 0)}`;
/**
 * 纪元 id 的形状判据（**单一实现**：生成与校验共用，防两处正则漂移）。
 * ⚠ 收窄记录（2026-09-15 自纠）：初版写 `/^epoch-\d{10,}$/`（要求 ≥10 位）—— 但 `epochIdOf(1)`
 *   会产出 `epoch-1` ⇒ **生成器能产出自己校验不过的 id**，"单一实现"当场破功。
 *   放宽为 `\d+`：**凡生成器产出者必过校验**（真实调用传 `Date.now()`，自然 13 位）。
 */
export const EPOCH_ID_RE = /^epoch-\d+$/;
export const planTriggerDim = (sinceHottestMs, idleMs, contentBytes, contentMin) => {
    if (Number(sinceHottestMs) >= Number(idleMs))
        return 'time';
    if (Number(contentMin) > 0 && Number(contentBytes) >= Number(contentMin))
        return 'content';
    return 'none';
};
/** 睡眠窗口归约与自检节拍判据已按**领域接缝**抽到 `trigger-plan.ts`（S-P2a/P4 2026-09-20）——
 *  理由同 `probe-plan.ts`：本件导出数受 `audit-architecture` **棘轮**约束（阈值 35 · 只许收紧，
 *  HEAD 实测 34），就地新增会破棘轮，而放松棘轮属须用户拍板之事（R3）。
 *  ⚠ 依赖单向：`trigger-plan` → 本件（只取 `SessRec` 类型），本件**不**反向依赖。
 *  导入方：`deepsleep-machine.ts`（巡检 + 面板共用同一归约）/ `distill-hooks.ts`（自检节拍）。 */
/** 探测证据/结论/决策表已按**领域接缝**抽到 `probe-plan.ts`（S-P2b 2026-09-20）——
 *  理由：本件导出数受 `audit-architecture` **棘轮**约束（阈值 35 · 只许收紧），
 *  就地新增探针判据会破棘轮，而放松棘轮属须用户拍板之事（R3）；本仓既有出路即"单独成件"
 *  （先例：`injection-playbook` / `recall-diagnosis` / `dynamic-select` / `probe-config`）。
 *  ⚠ 依赖单向：`probe-plan` → 本件（只取类型），本件**不**反向依赖；导入方直接引 `probe-plan.ts`。 */
/**
 * **材料分片**（S-P1c · 2026-09-15）：把已按"面"分好的材料段贪心装进 ≤ `capChars` 的片里。
 *
 * 三条已决口径（**偏离方案册处在此声明**）：
 *  ① **段边界即语义边界**：材料本就按面装配（当天痕迹 / 现行清单 / 树节清单 / 遗忘候选 …），
 *     故"按**语义**切分"由**结构**天然满足，**不需要**再算相邻相似度低谷去求分界——
 *     方案册 AC-V.2 写的是"边界落在相似度低谷"，那是**没有现成分段**时的做法；此处有，故不额外引入 embedding。
 *  ② **永不切开单段**：一段是一件事，切开会让两片都判不准。单段超上限时**独占一片**（无法再语义细分）。
 *  ③ `capChars <= 0` ⇒ **单片段**，与改造前**逐字等价**（回归保护）。
 *
 * 返回 `string[][]`（片 → 该片的段数组），**保持段序**（顺序即材料优先级，不得打乱）。
 */
export function splitByCap(segments, capChars) {
    const segs = segments || [];
    const cap = Number(capChars) || 0;
    if (cap <= 0 || segs.length === 0)
        return [segs.slice()];
    const out = [];
    let cur = [];
    let curLen = 0;
    for (const s of segs) {
        const len = String(s || '').length;
        if (cur.length > 0 && curLen + len > cap) {
            out.push(cur);
            cur = [];
            curLen = 0;
        }
        cur.push(s);
        curLen += len;
    }
    if (cur.length)
        out.push(cur);
    return out.length ? out : [[]];
}
/**
 * **窗口内待消化材料量（字节）** —— S-P1b 内容水位（第二触发维）的度量。
 *
 * 口径（**显式声明，避免"看起来像"**）：`pending/` + `candidates/` 下 `.md` 文件中
 *   **mtime > since** 者的大小之和。它是"该被消化多少"的**代理**，不等于最终喂给模型的材料字符数
 *   （后者由 `gatherDeepSleepTraces` 分段装配、受各段预算裁剪）——故**阈值须按本口径校准**，
 *   不得与"材料字符数"混用（两口径不可比是仓内已登记的坑：`count-memory-lines` 首版口径之误）。
 *
 * 为什么在触发层用**文件统计**而不是真跑一遍采集：触发判据每 10min 被巡检调用一次，
 *   必须在**零 LLM、低 IO** 下可算（真采集要读文件内容并分段）。
 *
 * 失败一律收敛为 0（目录缺席/权限异常）⇒ 内容维视为"未达阈"，**退回纯时间维**，绝不影响既有行为。
 */
export function windowMaterialBytes(dirs, since) {
    let total = 0;
    for (const dir of [dirs.pendDir, dirs.candidateDir]) {
        if (!dir)
            continue;
        let names = [];
        try {
            names = readdirSync(dir);
        }
        catch {
            continue;
        }
        for (const n of names) {
            if (!n.endsWith('.md'))
                continue;
            try {
                const st = statSync(join(dir, n));
                if (st.isFile() && st.mtimeMs > since)
                    total += st.size;
            }
            catch { /* 单个文件失败不推翻整体统计 */ }
        }
    }
    return total;
}
// ── 深度睡眠归纳契约（v17：习得原则与通用任务路径 [路径] 并入 agent 画像 AGENT.md；成败信号入材料；睡眠=agent 的反思进化迭代——认识自己也认识用户）──
// v17.2（2026-09-10 用户拍板 v6）：新增 pointerOps 通道——索引指针自动维护（扩容概况/重构指针 §/去重留优），只允许 update 不增删（新增=蒸馏 newIndex 唯一性硬门）。
// v17.3（2026-09-10 用户拍板 treeOps v1）：深睡可提 rename/merge 结构操作（宿主执行守不变量），v5.4「深睡不新建/不合并小节」禁令解除；分裂新 ### 仍归蒸馏写侧。
export const DEEP_SLEEP_PROMPT = `你是深度睡眠归纳子代理（守藏记忆·agent 画像成长引擎，audit-protocol §5）。任务：像人睡前回想当天经历一样，回顾给定「当天记忆痕迹」——**反思三通道：认识自己（提炼习得原则写入 AGENT.md）+ 认识用户（更新用户画像 USER.md）+ 沉淀通用任务路径（[路径] 行写入 AGENT.md，对标 AWM）**，仅认识自己或认识用户其一即反思不完整。原则=多条经验反复提纯凝成的跨任务泛化指引（巩固记忆；主动遗忘=提纯下放，不是删除）；路径=可复用任务类型的步骤序列（具体值必须变量化）。
判定规则：
${CONSOLIDATE_JUDGE}
- 路径行格式：\`[路径] <任务类型 ≤10 字> · <步骤概要 ≤40 字，用 ①②③ 串联> → notes/flows.md §小节\`；**具体值必须变量化**（如 <项目名>/<端口>/<文件名>——不抽象=过拟合单例）。
- 材料若含「窗口内任务运行统计」：先做成败对比（ExpeL 式）——异常集中出现的环节才是真因所在；对比结论仍受跨工作区红线约束，不得把单项目细节写成原则/路径。
- 源指针只能指向给定痕迹中真实出现过的 notes/<file>.md §小节（1-2 个小节）；行格式严格为（AGENT.md 索引行格式，概况段即原则一句或路径概要）：\`[原则] <主题 · 一句泛化> → notes/<file>.md §小节A/§小节B\`（主题 ≤12 字、概况 ≤30 字、禁日期戳）或 \`[路径]\`（格式见上，概要 ≤40 字）
- pending 内容尚未入册 notes 的，不得作为源指针（仅作背景理解）；找不到 notes 锚点就不提炼（宁缺毋滥）。
- 与既有原则/路径冲突时用 replace（match=既有行原文，须逐字来自给定「现行原则/路径」清单）；否则 add。
- **v17.3/v18 树由模型自动维护（2026-09-10/09-11 拍板）**：**你可以**在确有语义收益时提出 \`treeOps\` 结构操作——\`rename\`（改标题并改写指针）/ \`merge\`（并入叶子小节）/ **\`split\`（把一个叶子 \`##\` 按边界锚拆成 ≤6 个 \`###\`）**；宿主执行并守不变量（归档可回滚/锚存在/指针集内重写/无孤儿）。**split 判据（spec §8.1 分裂律）**：该 \`##\` 正文 > R=${SPLIT_LAW.R} 字且能划出 ≥2 个**语义正交**子面 → 才拆（否则并入即可，宁并勿滥裂）；\`parts[].start\` 必须**逐字**取自材料「待拆候选节正文」的对应行、且在节内唯一；子节名 ≤12 字。**增量生长（并入/新建 \`###\`）由蒸馏写侧负责，存量整形归你**；宁缺毋滥，拿不准不出 treeOps。源指针仍指向真实存在的 §小节（含子节路径如 §父节/子节 若材料中已存在）。
- **split 的 JSON 形状**：\`{"action":"split","file":"lessons.md","title":"<目标叶子 ## 名>","parts":[{"title":"<子节名 ≤12 字>","start":"<该子节首行原文，逐字取自「待拆候选节正文」>"},…（2–6 个）]}\`；rename=\`{"action":"rename","file","oldTitle","newTitle"}\`、merge=\`{"action":"merge","file","keepTitle","dropTitle"}\`。
- **v19 forgetOps（认知对照 P0「主动遗忘」）**：材料「遗忘候选」列出 90 天零命中的冷节——**你可以**对其中若干条给出 \`forgetOps\`：\`{"action":"archive","file":"lessons.md","section":"<小节名>"}\`（该节**正文**移入归档区、原位留 stub，指针仍有效、可一键恢复）或 \`{"action":"keep","file":"lessons.md","section":"<小节名>","reason":"≤60 字"}\`（保留并给理由）。**只允许 archive/keep，任何删除类动作一律被宿主丢弃**。判据：**确不再需要**（一次性进度 / 已被取代 / 纯历史）→ archive；**仍可能用到**（安全红线 / 契约事实 / 偶发但关键）→ keep 并给理由。**宁 keep 勿 archive，拿不准不动**。
- **v19 crossTopic（认知对照 P2「REM 相」，仅在开启时生效）**：原则通道之外，可另提 \`crossTopic\`——**跨主题**联想出的上位原则：\`{"action":"add","text":"[原则] … → notes/x.md §A/§B"}\`。**硬门：text 的源指针必须覆盖 ≥2 个不同 § 小节**（同一主题内的归纳已由 principles 覆盖），不足即被宿主丢弃。没有真联想就留空，别硬凑。
- **P5（2026-09-14）outcomes（后果回收 · 决策环的核心）**：材料若给出「待回收的裁决」（含 decisionId 与当时预测），且你从痕迹/运行统计看得出**实际结果**，就填 {"decisionId":"<逐字取自材料>","observed":"实际发生了什么","hit":true|false,"evidence":"≤30字"}。**没有后果回收，经历永远只是日志**；看不出就留空数组，**别猜**（重复回收宿主会丢弃）。
- **S-P2c（2026-09-16）工具维（材料「本纪元工具使用」）**：该段只给**工具名 × 次数**（跨会话汇总、次数降序），**不含参数/路径/命令**。用法三条：① **与既有「现行原则/路径」对照**——某工具反复出现却与既有「[路径]」的步骤/前提**冲突** ⇒ 这是**提纯/改写**的候选（走 principles/pointerOps，并在概况里点明冲突）；② **高频**工具（次数显著靠前）⇒ 判断「该沉淀成 [路径]」还是「只是本次任务的偶然」（只在本项目/本日出现的，不提炼，受跨工作区红线约束）；③ **严禁据工具名臆造细节**——工具名**不含参数**，凡「它传了什么参数/读写哪个文件」一律**不得推断**，只能引用材料里真实出现过的事实。
- **S-P4c′（2026-09-16）convergeOps（跨粒度收敛 · R2-A）**：材料里有一段「**跨粒度收敛候选**」——那是**宿主已用向量预筛**出来的（粗粒度带标签行 × 细粒度无标签行，附相似度）。**你不需要自己去找**：请对候选**逐条判定**「它俩是不是**同一知识**」（细的那条是否只是粗的那条的啰嗦版本、没有提供任何额外信息）。判定为**是** ⇒ 提：{"file":"<候选里给的 file>","coarse":"<逐字抄候选里的粗行>","fine":"<逐字抄候选里的细行>"}。**硬门（宿主逐条校验，不合格直接丢弃）**：① 两条必须**逐字**抄自候选（不得改写/概括/补标点）；② fine 不含 [标签]；③ coarse 含标签；④ 不同行；⑤ **每轮最多 3 条**。**判「是」的标准（方向性，不要吹毛求疵）**：只要**粗粒度行已经涵盖了细粒度行的「教训面」**——即细的那条**没有教给你粗的那条之外的新道理、新做法**——就算同一知识。**元信息不算额外信息**：源指针（← 源: …）、日期、编号、会话短 id、以及"当时具体发生了什么"的经过，**都不算**「粗的那条之外的信息」。只有当细的那条**含有粗的那条所没有的操作步骤、判据或反例**时，才判「否」。拿不准时用这条判准：**若细的那条读起来就是粗的那条的一次具体经历** ⇒ 判「是」。
- **P5 narratives（经历叙事 · author 层）**：把窗口内「决定过什么 → 后来怎样」串成 **1–3 段带时间的因果短叙事**（不是流水账、不是原则）：{"title":"≤40字","text":"≤400字，写清前因—决断—后果","cues":["scope=workspace:<路径>"],"evidence":"≤30字"}。正文落 notes/agent.md §经历/<title>，宿主另生 episode 记录。**宁少勿编**：没有真正连成故事的经历就留空数组。
- 独立完成：不 spawn 子代理、不使用任何工具，只依据给定材料。
输出：只输出一行 JSON（不要 reasoning、不要其他文本）：
{"principles":[{"action":"add","text":"[原则] 排障先看根因 · 先验证成本低再修改成本高 → notes/lessons.md §A/§B"},{"action":"add","text":"[路径] DSH 插件升级 · ①提交推送 ②cp 覆盖 lib ③sc restart ④四端点 200 → notes/flows.md §升级"},{"action":"replace","match":"[原则] 既有原则原文行","text":"[原则] ... → notes/tools.md §C"}],"profileOps":[{"target":"USER.md","action":"add","section":"沟通偏好","text":"- ... ← 源: notes/lessons.md §A"}],"pointerOps":[{"target":"MEMORY.md","action":"update","match":"[lesson] 网络坑 · 旧概况短语 → notes/lessons.md §网络坑","line":"[lesson] 网络坑 · 新概况短语 → notes/lessons.md §网络坑"}],"treeOps":[{"action":"rename","file":"lessons.md","oldTitle":"旧名","newTitle":"新名"}],"forgetOps":[{"action":"keep","file":"lessons.md","section":"旧节","reason":"安全红线"}],"crossTopic":[],"outcomes":[{"decisionId":"decision:xxxx","observed":"实际结果","hit":true,"evidence":"s1"}],"narratives":[{"title":"接线门从打印到判定","text":"前因—决断—后果（≤400字）","cues":["scope=workspace:<路径>"],"evidence":"s2"}],"supersedes":[{"target":"<既有条目原文，逐字抄自给定「现行画像」/「现行树节清单」>","note":"≤30字，因何失效"}],"skipped":[{"title":"...","reason":"≤30字"}]}
无足够素材 → {"principles":[],"profileOps":[],"pointerOps":[],"treeOps":[],"outcomes":[],"narratives":[],"supersedes":[],"skipped":[]}。
- **supersedes（门4 · 时态失效）**：当某条**既有断言已不成立**（被后来的事实/决定取代，而非仅仅重复或可并存）⇒ 填 supersedes，target **必须逐字抄自给定材料里出现过的原文**（宿主按逐字唯一命中定位；抄不准 ⇒ 整条被拒，且**不许自己拼一条像既有行的文本**——那会误标真事实失效）。注意：这与 principles 的 replace **分工不同**——replace 是"用新原则条文换掉旧原则条文"（画像层演进），supersedes 是"旧断言标失效、读者不再见到它"（事实层时态）。拿不准就留空数组——**错标失效比不标更坏**。

双画像巩固（反思的另一通道=认识用户；与原则同判据、同红线）：
- 回顾给定「现行画像」（USER=用户画像 / AGENT=你的自我画像）与当天痕迹，若发现：**用户跨任务稳定的偏好/背景/禁忌**（非一次性需求）→ profileOps target=USER.md；**你自身反复出现的稳定做法/能力边界/常犯错误教训/表达风格（行首标 \`[性格]\`）/思维模式（行首标 \`[认知]\`）**（可跨任务复用的自我认知）→ target=AGENT.md。
- **P0 补充（2026-09-13）**：「性格」/「认知」是 P 层 profile 标签，长期零实存（引导词此前只列"做法/边界/教训"、把人格两面结构性排除）。**把握够就写**：风格示例优于形容词（如「先结论后依据 · 忌"我觉得/可能"」）；思维模式写方法偏好（如「架构优先 · 先定节点再动手」）。宁缺毋滥，不作无据推断。
- 每条必须带 notes 源指针（行内 \`← 源: notes/<file>.md §小节\`），无锚不提炼；与既有画像行冲突用 replace（match=既有行原文，须逐字来自给定现行画像）；宁缺毋滥。
索引指针自动维护（v6：只允许 pointerOps update 原地替换整行，**禁止新增/删除索引行**——新增归蒸馏 newIndex 且已有唯一性硬门；删除归审计裁决）：
- 扩容：小节正文显著增补 / 概况过时 / 主题出现新要点 → update 只刷新概况短语（保 标签/主题/指针 指向；概况 ≤30 字名词短语）。
- 重构：小节改名/合并导致指针 § 失效或漂移 → update 指针 §（概况如需一并刷新）。
- 去重：现行清单中同 标签+主题 出现两行 → 保留信息更全/命中更高者，update 被留行合并概况（绝不双写）。
- match 一律逐字取自「现行画像 / 现行知识索引」清单；无锚不 update，拿不准不动。
${JUDGEMENT_HINT}
${JUDGEMENT_VALUES}`;
/**
 * 深睡本轮是否算「已消化」（决定水位推进 or 回滚）——**单一实现**，供 runDeepSleep 与单测共用。
 *
 * 2026-09-11 实修（静默丢料根因）：原判据只按 `stop === 'completed' && out`，从不检查候选是否**真正落地**。
 * 当代理跑完但门禁把候选行**全数拒收**（attempted>0 && added===0，如 gate=all-rejected /
 * maturation-rejected / 尾部总门失败）时仍判 done → 调用方推进水位 → 被拒痕迹永久划出窗口 → 静默丢失。
 * 审计实证 2 轮（08:32:23.997Z attempted=3/added=0、08:48:10.129Z attempted=1/added=0）共丢 4 条候选行。
 *
 * 判定口径：
 *  - `stop !== 'completed' || !out` → 未完成 / 无产出 ⇒ failed（回滚重试，含 stop=error/aborted、JSON 解析失败）。
 *  - `app.gate === 'write_gate 未就位'` → 门禁脚本缺席（applyPrinciples 早返回，attempted 恰为 0）属
 *    **基础设施失败**，不得因 attempted===0 误判 done ⇒ failed。
 *  - `app.added > 0` → 有落地 ⇒ done。
 *  - `app.attempted === 0` → 代理本就无新原则/路径提案（真·空轮）⇒ done。
 *  - `attempted>0 && added===0` → 100% 拒收 = 材料损失 ⇒ failed（水位回滚、同批下轮重试）。
 *
 * ⚠ G-19 修正（2026-09-12）：上述判据**只消费 principles 一个通道**（`app`）。深睡同轮另有
 *   profileOps / pointerOps / treeOps / forgetOps 四个写入通道，其结果**从不进入判据** ⇒
 *   「纯 profileOps/指针/树/遗忘 轮且全数失败」时 `app.attempted === 0` ⇒ 误判 landed:true
 *   ⇒ 水位推进 ⇒ 那批材料永久关在窗外（静默丢料）。Rex 实测约占 9.5%~14.3% 轮次。
 *   架构修法：**判据必须消费完整轮次结果，而非其子集**（与 G-16 同源——判据只认真实完整产出）。
 *   取向：宁可重试（failed，幂等、可观测），不可静默丢料（landed，无声无息）。
 */
// 落盘失败 gate 字面量（2026-09-12 G-16）：applyPrinciples **产出**、deepSleepLanded **消费**——
//   单一定义，改一处两边同步。原先两边各写死一个字符串字面量，将来改任一侧都会**静默脱钩**
//   （判据还在、门禁已失效，且不报错不测试红——Arch 2026-09-12 指出的漂移隐患）。
export const COMMIT_FAILED_GATE = '落盘异常';
/* ⚠ ADR-333 册三（2026-09-22）：通道明细的**类型与纯函数已按领域接缝抽到 `channel-plan.ts`**
 *   ——本件导出数受 `audit-architecture` 棘轮约束（阈 35），就地新增使其达 37 当场红；
 *   放松棘轮属 R3（须用户拍板），故走本仓既有出路（同 `probe-plan.ts` / `trigger-plan.ts` 先例）。
 *   **再导出**保既有消费方零迁移（与 `ring-supply` 再导出 `due-window` 同一手法）。 */
import { zeroLandedChannels, anyZeroLanded } from './channel-plan.js';
export { zeroLandedChannels, anyZeroLanded };
export const deepSleepLanded = (stop, out, app, 
// G-19：缺省 {} ⇒ 与旧行为一致（纯 principles 轮），保证向后兼容、不引入回归。
other = { tried: 0, done: 0 }) => {
    if (stop !== 'completed' || !out)
        return false;
    // G-16 纵深防御（2026-09-12）：失败 gate 一律判 failed——即使上游把 added 误报成 >0（谎报），
    //   判据侧也不认。只靠 producer 归零不够：applyPrinciples 在闭包内不可单测，谎报无人拦。
    if (['write_gate 未就位', COMMIT_FAILED_GATE].includes(app.gate))
        return false;
    // G-19：全通道汇总——任何通道有落地即 done；五通道皆无提案（真·空轮）即 done；
    //   只要有提案而**一件都没落地**（含四通道），即 failed（水位回滚、下轮重试，幂等）。
    const done = (app.added > 0 ? 1 : 0) + (other.done > 0 ? 1 : 0);
    const tried = app.attempted > 0 || other.tried > 0;
    return done > 0 || !tried;
};
export const DEFAULT_FAIL_POLICY = 'graded';
export const DEFAULT_FAIL_MAX_ROUNDS = 3;
// 纯决策表（模块级导出 ⇒ 单测可直接驱动，防判定与调用点漂移）：先匹配先返回。
export const planDeepSleepVerdict = (landed, policy, failStreak, maxRounds) => {
    if (landed)
        return { verdict: 'done', release: false, reason: 'landed' };
    if (policy === 'retry')
        return { verdict: 'failed', release: false, reason: 'policy=retry' };
    if (failStreak + 1 >= maxRounds)
        return { verdict: 'done', release: true, reason: 'graded-release' };
    return { verdict: 'failed', release: false, reason: 'graded-retry' };
};
// 实时读取（与 liveCaps 同法：每轮读 ~/.dsh/suite/scheduler.json，面板改后即时生效，不必重载插件）。
// 非法值一律回落默认：策略必须命中 'retry'|'graded' 字面量，maxRounds 必须为正整数。
export const liveFailPolicy = () => {
    const d = { policy: DEFAULT_FAIL_POLICY, maxRounds: DEFAULT_FAIL_MAX_ROUNDS };
    try {
        const s = JSON.parse(readFileSync(join(dshHome(), 'suite', 'scheduler.json'), 'utf8'));
        if (s.deepSleepFailPolicy === 'retry' || s.deepSleepFailPolicy === 'graded')
            d.policy = s.deepSleepFailPolicy;
        if (typeof s.deepSleepFailMaxRounds === 'number' && Number.isInteger(s.deepSleepFailMaxRounds) && s.deepSleepFailMaxRounds > 0)
            d.maxRounds = s.deepSleepFailMaxRounds;
    }
    catch { /* 配置不可读=用默认值 */ }
    return d;
};
// ── 深睡水位「可否回放」判据（2026-09-11 抽出为单一实现：重启回放与语义同源，防两份判据漂移）──
// 背景：重启时 lastDeepSleepAt 从 audit/distill-audit.jsonl 回放重建，旧判据只排
//   error / stop=error / result ∈ {no-parent, no-traces}（"无事可做"），**漏排"做了但被拒"**
//   （attempted>0 && added=0，如 gate=all-rejected）——这类轮次被当有效水位回放，
//   那批痕迹就永久关在窗外（重启一次即丢料，实测 09-11 08:32/08:48 两轮共 4 条）。
// 口径：审计行**自本次起**带 `landed`（由 deepSleepLanded 写入）；旧行无该字段时回落旧判据
//   （保守兼容——历史 785 行绝大多数无 landed，**不回捞**：回捞会把水位往回推，在幂等键落地前
//    只会把"丢料"换成"重复写"）。
export const deepSleepReplayable = (o) => {
    if (o.kind !== 'deep-sleep')
        return false;
    if (o.error || o.stop === 'error')
        return false;
    if (['no-parent', 'no-traces'].includes(String(o.result)))
        return false;
    if (o.landed !== undefined)
        return Boolean(o.landed);
    return true;
};
// ── 原则落盘提交点（2026-09-12 G-16：抽成单一实现并**导出**，供单测直接驱动）──
// 背景：applyPrinciples 是闭包内 const（:1576 附近），无 export，单测到不了；
//   不抽则 G-16「rename 失败仍按 added>0 返回」只能靠人肉 review 兜，改天被人改回去也不会有任何断言变红。
// 契约：成功 ⇒ ok=true 且 tmp 已消失；失败 ⇒ ok=false + err 字符串，且**不留孤儿 tmp**（尽量清理）。
export const commitPrinciples = (tmpPath, targetPath) => {
    try {
        renameSync(tmpPath, targetPath);
        return { ok: true };
    }
    catch (e) {
        try {
            unlinkSync(tmpPath);
        }
        catch { /* tmp 本就不存在 */ }
        return { ok: false, err: String(e?.message ?? e) };
    }
};
// ── G-20：水位作废时「快照不可用」分支的处置（2026-09-12）——抽成单一实现并**导出**，供单测直接驱动 ──
// 背景（实测 09-11 00:54:56，sid session-5f024550）：旧 `discardWatermark` 在
//   `agent.session.snapshotEvents()` 抛异常时把 maxSeq 退化为 0，随后**照样** `writeWatermark(sid, 0, agent)`。
//   而下方 :664 的注释白纸黑字写着「为何不是 0：写 0 的行没有可用锚点（seq 0 无事件）→ 下次读仍判
//   「不可验证」→ **每轮全量重蒸，形成死循环**」——即代码实现了注释明确禁止的那件事，属自相矛盾。
// 判据：读侧 `resolveWatermark` 是 `if (lastSeq <= 0) return null`，故**写 0 与不写在读侧完全等价**；
//   写 0 唯一的作用是污染水位文件 + 让审计把「无水位」误读成「从 0 续」。故此处一律不写。
// ⚠ 今天没进入死循环是**运气**（下一轮快照就恢复了），**不是设计保证**——只要 snapshotEvents 连续不可用，
//   :664 注释预言的死循环就会真实发生。故另加熔断闸（连续 N 轮不可用 ⇒ 本轮跳过，不再整窗重蒸烧 LLM）。
export const DISCARD_SNAPSHOT_CB_N = 3;
/**
 * 写方决策表（单测直接驱动）：① maxSeq<=0 ⇒ 不写（禁写 0）；② maxSeq < prevSeq ⇒ 不写（禁写回退值）；③ 否则写。
 * `snapshotUnavailable` 是**熔断计数的唯一推进条件**（G-20 二修，cody 2026-09-12 指出）：
 *   只有「快照真的拿不到」才算一轮；「快照正常但序号空间重排」**不计**（它不烧 LLM，也不是故障，
 *   且读方已按语义 B 判为「保持全量」——若让它推进计数，连续 3 轮零写入就会撞上熔断被跳过，
 *   与语义 B「要重蒸」直接冲突 ⇒ 会话变「永久不蒸」）。
 */
export const planDiscardWrite = (maxSeq, prevSeq, consecutiveUnavailable) => {
    const streak = Number(consecutiveUnavailable) > 0 ? Math.floor(Number(consecutiveUnavailable)) : 0;
    if (!(maxSeq > 0)) {
        const n = streak + 1;
        const broken = n >= DISCARD_SNAPSHOT_CB_N;
        return {
            write: false, circuitBroken: broken, snapshotUnavailable: true,
            reason: broken ? 'snapshot-unavailable-circuit-break' : 'snapshot-unavailable-noop',
        };
    }
    const p = Number(prevSeq) > 0 ? Number(prevSeq) : 0;
    if (p > 0 && maxSeq < p)
        return { write: false, circuitBroken: false, snapshotUnavailable: false, reason: 'seq-space-regressed-noop' };
    return { write: true, circuitBroken: false, snapshotUnavailable: false, reason: '' };
};
/**
 * 读方决策表（G-20 补正的**主修点**）：双证失效后是「降级到当前 live 边界」还是「全量重蒸」。
 * 为何读方才是主修：**回退 100% 由读方决定**——旧码四个作废分支全部 `return null`，而调用方是
 *   `const lastSeq = baseline ? baseline.lastSeq : 0`，null ⇒ lastSeq=0 ⇒ **整窗重蒸**。写方写什么都与回退无关。
 *   实证（Cody 实测）：restartFrom = 114654 / 811483 / 339724 三条健康边界值写进去了，下一轮仍从 7~8 开始。
 * 判据：`maxSeq >= prevSeq` ⇒ 同一（或已增长的）seq 空间 ⇒ 跳到当前边界（下方注释 :662-668 声明的**语义 A**，
 *   是代码自己选过的语义）；`maxSeq < prevSeq` ⇒ 序号空间已重排/缩小，旧边界不可寻址 ⇒ **保持全量**（语义 B，
 *   此情形新空间通常只有几百条，便宜）。B 才是违背声明的实现，故按 A 修不需要用户拍板。
 */
export const planDegradedBaseline = (maxSeq, prevSeq) => {
    if (!(maxSeq > 0))
        return { degrade: false, reason: 'no-live-boundary' };
    const p = Number(prevSeq) > 0 ? Number(prevSeq) : 0;
    if (!(p > 0))
        return { degrade: false, reason: 'no-prev-seq' };
    return maxSeq >= p ? { degrade: true, reason: 'same-seq-space' } : { degrade: false, reason: 'seq-space-regressed' };
};
/**
 * G-4a（2026-09-12）：**跳过分支（below-min / prescan-no-signal）的水位推进判据**——抽成纯函数并导出。
 * 背景（实测，审计 800 行）：段 dispatch 失败后水位保留，但下一轮若命中跳过分支，旧码直接
 *   `writeWatermark(sid, maxSeq)` ⇒ 一步跨过未消化段 ⇒ 该段**永不重扫**（50 段中 35 段如此，真重扫仅 4 段）
 *   ⇒ `dispatch-failed-forced` 恒为 0 的真因是「重试从未累积到第 2 次」，而非计数没持久化。
 * 语义：
 *   · 无未消化段 ⇒ 照旧推 maxSeq（`skip-normal`，保持跳过分支原有行为，不引入死循环）；
 *   · 有未消化段 ⇒ **不推**（保留基线，把窗口留给下一轮再看一次），连续扣满 SKIP_HOLD_MAX 轮仍无进展
 *     ⇒ 放弃并推 maxSeq（`skip-abandoned-after-hold`，显式记账）——**没有这条就会死循环**：
 *     某会话内容长期低于门槛时，每轮都会重扫同一窗口。
 */
export const SKIP_HOLD_MAX = 3;
export const planSkipWatermark = (hasUndigested, holdRounds, maxSeq) => {
    if (!hasUndigested)
        return { write: true, seq: maxSeq, reason: 'skip-normal', holdRounds: 0 };
    if (holdRounds + 1 >= SKIP_HOLD_MAX)
        return { write: true, seq: maxSeq, reason: 'skip-abandoned-after-hold', holdRounds: 0 };
    return { write: false, seq: 0, reason: 'skip-held-for-undigested', holdRounds: holdRounds + 1 };
};
export const planSegmentWatermark = (outcome, attempt, maxRetry) => {
    const u = Math.max(0, Math.floor(Number(outcome?.undigested) || 0));
    const n = Math.max(0, Math.floor(Number(outcome?.needsAnchor) || 0));
    const r = Math.max(0, Math.floor(Number(outcome?.rejected) || 0));
    const tries = Math.max(0, Math.floor(Number(attempt) || 0)) + 1;
    if (u === 0) {
        return { advance: true, forced: false, attempt: 0, reason: n > 0 ? 'digested-with-anchors' : (r > 0 ? 'digested-with-rejects' : 'digested') };
    }
    const cap = Math.max(1, Math.floor(Number(maxRetry) || 1));
    if (tries >= cap)
        return { advance: true, forced: true, attempt: tries, reason: 'forced-after-retries' };
    return { advance: false, forced: false, attempt: tries, reason: 'retry-undigested' };
};
/**
 * 水位作废收尾的可单测驱动（`discardWatermark` 是闭包内 const，无 export，单测到不了；与 commitPrinciples 同手法）。
 * 返回 `wrote=false` 表示**未写水位**（快照不可用），读侧语义等价于「无水位」——绝不再写 lastSeq=0 的行。
 */
export const runDiscardWatermark = (sid, reason, agent, wm, consecutiveUnavailable, deps) => {
    let maxSeq = 0;
    try {
        if (typeof agent?.session?.snapshotEvents === 'function') {
            for (const e of agent.session.snapshotEvents()) {
                const s = e.seq ?? 0;
                if (s > maxSeq)
                    maxSeq = s;
            }
        }
    }
    catch { /* 快照不可用 → maxSeq 保持 0（旧码在此退化为 0 后仍写 0，与 :664 注释自相矛盾） */ }
    const plan = planDiscardWrite(maxSeq, wm?.lastSeq ?? 0, consecutiveUnavailable);
    const prev = Number(consecutiveUnavailable) > 0 ? Math.floor(Number(consecutiveUnavailable)) : 0;
    if (!plan.write) {
        // G-20 二修：只有「快照真的不可用」才推进熔断计数；seq 空间重排不推进（并顺带复位），
        // 否则连续 3 轮「快照正常但空间重排」会被熔断跳过，与读方语义 B「保持全量」直接冲突。
        const streak = plan.snapshotUnavailable ? prev + 1 : 0;
        try {
            deps.audit({
                sid,
                kind: plan.circuitBroken ? 'snapshot-unavailable-circuit-break' : 'watermark-invalidated',
                reason: plan.reason,
                invalidatedBy: reason,
                streak,
                threshold: DISCARD_SNAPSHOT_CB_N,
                prevSeq: wm?.lastSeq ?? null,
                prevVersion: wm?.formatVersion ?? null,
                restartFrom: null, // 未写水位 ⇒ 无续写边界（写 0 会让审计误读成「从 0 续」）
            });
        }
        catch { /* 审计失败静默 */ }
        try {
            deps.log(`watermark: 双证失效（${reason}）但快照不可用（连续 ${streak}/${DISCARD_SNAPSHOT_CB_N} 轮）→ 不写水位（${plan.reason}）`);
        }
        catch { /* */ }
        return { wrote: false, circuitBroken: plan.circuitBroken, reason: plan.reason, streak, maxSeq };
    }
    deps.writeWatermark(sid, maxSeq, agent);
    try {
        deps.audit({
            sid, kind: 'watermark-invalidated', reason,
            prevSeq: wm?.lastSeq ?? null,
            prevVersion: wm?.formatVersion ?? null,
            version: deps.versionOf ? deps.versionOf(agent) ?? null : null,
            restartFrom: maxSeq,
        });
    }
    catch { /* 审计失败静默 */ }
    return { wrote: true, circuitBroken: false, reason: '', streak: 0, maxSeq };
};
/**
 * 读方可单测驱动（G-20 补正主修点；`resolveWatermark` 是闭包内 const，无 export，与 commitPrinciples 同手法）。
 * 返回 null 仍表示「无基线 / 需全量」——但**只在真正需要全量时**（水位缺失、seq 空间回退、快照不可用）。
 * 关键不变量：双证失效且 live 边界未回退时，**不得返回 null**（旧码返回 null ⇒ 调用方把 lastSeq 打成 0 ⇒ 整窗重蒸）。
 */
export const resolveWatermarkBaseline = (sid, wm, agent, deps) => {
    if (!wm)
        return null;
    const lastSeq = Number(wm.lastSeq || 0);
    if (!(lastSeq > 0))
        return null;
    const liveVer = deps.versionOf(agent);
    const recVer = typeof wm.formatVersion === 'number' ? wm.formatVersion : undefined;
    const toBaseline = (reason) => {
        const r = deps.discard(sid, reason, agent, wm);
        const plan = planDegradedBaseline(r.maxSeq, lastSeq);
        if (!plan.degrade)
            return null; // 语义 B：seq 空间已回退/无边界 ⇒ 保持全量
        return { lastSeq: r.maxSeq, degraded: true, reason: `${reason}/${plan.reason}` };
    };
    if (recVer === undefined || liveVer === undefined)
        return toBaseline('unverifiable-legacy');
    if (liveVer !== recVer)
        return toBaseline(`format-migrated ${recVer}→${liveVer}`);
    const fp = deps.fingerprintAt(agent, lastSeq);
    if (fp === null || wm.fp === undefined || wm.fp === null)
        return toBaseline('fingerprint-unavailable');
    if (fp !== wm.fp)
        return toBaseline(`seq-space-shifted (${String(wm.fp).slice(0, 40)} ≠ ${fp.slice(0, 40)})`);
    return { lastSeq, degraded: false, reason: '', formatVersion: recVer, fp };
};
//# sourceMappingURL=deepsleep-core.js.map