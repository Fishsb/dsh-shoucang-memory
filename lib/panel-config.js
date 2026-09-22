/**
 * @dsh-external/shoucang-panel / config — 配置领域（根目录 + 配置读写）。
 * 端点：GET /roots · GET /get_root · POST /root/bootstrap · POST /set_root ·
 *      GET /config · POST /save · POST /toggle · POST /set
 * 依赖窄传：6 个（route / state / root / hot / suite / logger）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { contractFor } from './panel-contract.js';
import { SURFACE, SCORE } from './criteria.generated.js';
/* S3（2026-09-21）：额度范围**单一事实源**（与运行时夹取同源，防两处各写一份数字）+ 读数解析同源 */
import { BUDGET_RANGES, resolveBudgetNumber, resolveLevelCaps } from './budget-override.js';
import { memoryLibRoot } from './targets.js';
import { CONFIG_FILE, backupThenWrite, bootstrapDefaults, flipBool, parseView, readBody, sendJson, statMtime } from './panel-shared.js';
function rootsRoute(d, _req, res) {
    const s = d.state.load();
    sendJson(res, 200, { roots: s.roots, active: s.active });
}
function getRootRoute(d, _req, res) {
    const s = d.state.load();
    sendJson(res, 200, { active: s.roots.find((r) => r.id === s.active) ?? null });
}
async function rootBootstrapRoute(d, req, res) {
    const body = (await readBody(req).catch(() => ({})));
    const target = typeof body.root === 'string' && body.root.trim() ? resolve(body.root.trim()) : d.root.activeRootOf()?.path ?? '';
    if (!target)
        return sendJson(res, 400, { error: 'no root' });
    const boot = bootstrapDefaults(target);
    sendJson(res, 200, { root: target, ...boot, skeleton: boot.template });
}
async function setRootRoute(d, req, res) {
    const body = await readBody(req);
    const p = typeof body.path === 'string' ? body.path.trim() : '';
    if (!p)
        return sendJson(res, 400, { error: 'path required' });
    const abs = isAbsolute(p) ? resolve(p) : resolve(p);
    const file = join(abs, CONFIG_FILE);
    if (!existsSync(file))
        return sendJson(res, 400, { error: `未找到 ${CONFIG_FILE}：${abs}` });
    const s = d.state.load();
    let entry = s.roots.find((r) => r.path === abs);
    if (!entry) {
        entry = {
            id: `root-${Date.now()}`,
            name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : abs.split(/[\\/]/).pop() || abs,
            path: abs,
        };
        s.roots.push(entry);
    }
    s.active = entry.id;
    d.state.save(s);
    d.logger.info?.(`[shoucang] panel root activated: ${abs}`);
    // 切换根目录默认构建：按默认项目资料补缺目录/索引（幂等，不覆盖既有 _index.md）
    try {
        const boot = bootstrapDefaults(abs);
        if (boot.createdDirs.length || boot.createdIndexes.length) {
            d.logger.info?.(`[shoucang] bootstrap ${abs}: +${boot.createdDirs.length} dirs +${boot.createdIndexes.length} indexes`);
        }
    }
    catch (e) {
        d.logger.warn?.(`[shoucang] bootstrap failed: ${String(e)}`);
    }
    sendJson(res, 200, { ok: true, active: entry });
}
function configRoute(d, _req, res) {
    const file = d.root.configFileOf();
    const sched = d.suite.read();
    // 2026-09-10（修正）：上限 vs 实际量——上限是稳定配置（用户设的边界）；未配时默认=容量门硬边界
    // （画像 AGENT/USER 3000、记忆 MEMORY 5000（2026-09-11 用户拍板默认）：写门强制内容不可超，故默认=容量门=允许全量且 UI 数字稳定）；
    // actual = 当前实际量（动态参考，随内容成长变化，仅展示不参与配置）
    const CAP_GATES = { 'AGENT.md': 3000, 'USER.md': 3000, 'MEMORY.md': 5000 };
    const fileChars = (name) => {
        try {
            const base = memoryLibRoot();
            const t = readFileSync(join(base, name), 'utf8');
            return t.replace(/\s+/g, '').length;
        }
        catch {
            return 0;
        }
    };
    const globalCfg = {
        persona: String(sched.injectPersona ?? 'both'),
        level: String(sched.injectLevel ?? 'smart'),
        hot_memory: sched.hotMemory !== false,
        // 容量门（记忆库扩增/写门用；新键 capAgent 优先，回落旧 injectAgentMaxChars）
        cap_agent: typeof sched.capAgent === 'number' ? sched.capAgent : (typeof sched.injectAgentMaxChars === 'number' ? sched.injectAgentMaxChars : CAP_GATES['AGENT.md']),
        cap_user: typeof sched.capUser === 'number' ? sched.capUser : (typeof sched.injectUserMaxChars === 'number' ? sched.injectUserMaxChars : CAP_GATES['USER.md']),
        cap_memory: typeof sched.capMemory === 'number' ? sched.capMemory : (typeof sched.injectMemoryMaxChars === 'number' ? sched.injectMemoryMaxChars : CAP_GATES['MEMORY.md']),
        actual: { agent: fileChars('AGENT.md'), user: fileChars('USER.md'), memory: fileChars('MEMORY.md') },
        /* ⚠ **2026-09-21 修（回落字面量落后于注册表 → 面板与运行态显示不一致）** ────────────────────
         *  判因（真机实测）：本块原先用**硬编码字面量**回落（`:105` 的 `: 0.65`、`:111` 的 `: 3`、
         *    `:92-96` 的 `14/44/90/23/35`），而**运行时的真实缺省来自注册表**（`criteria.json#surface.*`，
         *    `scheduler.ts` 的 zod 就是 `default(SURFACE.…)`）⇒ 两套口径各自演化后**必然打架**：
         *    实测 `mclFamiliarThreshold` 回落 **0.65** 而注册表 **0.58**；
         *    `injectProfileRows` 回落 **3** 而注册表 `carriers.profile` = **6**。
         *    后果：当 `scheduler.json` **无该键**时（`sched.x === undefined`），
         *    **面板报 3 / 运行时用 6** —— 用户看到的值与真实行为不一致（本仓最忌的"假可控"）。
         *  ⇒ 修法 = 回落**一律读 `SURFACE.*`**（与 `scheduler.ts` 同源），字面量只保留注册表未覆盖者。
         *    **不新增机制、不改运行行为**（只改"无键时给 UI 显示什么"），可逐键比对机检。 */
        /* v7 活性/遗忘/加深校准阈值：注册表 `surface` **未声明**这四个键 ⇒ **只能保留字面量**
         *  （与 `scheduler.ts` 的 `.default(14)/(44)/(90)/(23)` 同值）。⚠ **如实标注**：这四项
         *  属**已知的第二处口径**（两处都是字面量），待其进注册表后一并收敛为 `SURFACE.*`。
         *  ⇒ 本轮**不**改成 `SURFACE.activity?.x` —— 那会引用一个**不存在的字段**，
         *    是"为了让代码看起来统一"而制造的**假引用**（比留着字面量更坏）。 */
        activityWarmDays: typeof sched.activityWarmDays === 'number' ? sched.activityWarmDays : 14,
        activityColdDays: typeof sched.activityColdDays === 'number' ? sched.activityColdDays : 44,
        activityArchiveDays: typeof sched.activityArchiveDays === 'number' ? sched.activityArchiveDays : 90,
        activityHotHits: typeof sched.activityHotHits === 'number' ? sched.activityHotHits : 23,
        recallColdFactorPercent: typeof sched.recallColdFactorPercent === 'number' ? sched.recallColdFactorPercent : SURFACE.recall.coldFactorPercent,
        // U3（ADR-122 UI · B5 能力对齐）：此前 panel 已读取但 scheduler 未声明的键 + v2 新增键 —— 现全部进 /config 供 UI 渲染
        injectRelevance: sched.injectRelevance !== false,
        // S4-2（2026-09-14）：三层判据常驻开关（缺省开；false ⇒ 注入文本逐字节回到改动前）
        injectPlaybook: sched.injectPlaybook !== false,
        injectFreshSlots: typeof sched.injectFreshSlots === 'number' ? sched.injectFreshSlots : SURFACE.injection.freshSlots,
        recallFusion: String(sched.recallFusion ?? SURFACE.fusion.kind),
        bankGit: sched.bankGit !== false,
        mclEnabled: sched.mclEnabled !== false,
        mclFamiliarThreshold: typeof sched.mclFamiliarThreshold === 'number' ? sched.mclFamiliarThreshold : SURFACE.mcl.familiarThreshold,
        mclMaxNudges: typeof sched.mclMaxNudges === 'number' ? sched.mclMaxNudges : SURFACE.mcl.maxNudges,
        mclBudgetChars: typeof sched.mclBudgetChars === 'number' ? sched.mclBudgetChars : SURFACE.mcl.budgetChars,
        mclTopK: typeof sched.mclTopK === 'number' ? sched.mclTopK : SURFACE.mcl.topK,
        mclAudit: sched.mclAudit !== false,
        // v2.2（ADR-130）：层模型开关
        injectProfileRows: typeof sched.injectProfileRows === 'number' ? sched.injectProfileRows : SURFACE.injection.carriers.profile,
        /* S3（2026-09-21）：槽位额度**热覆盖三键**的读数 —— 三者都回**解析后的生效值** + **来源**，
         *   使"未覆盖（走注册表）"与"已覆盖（走 scheduler.json）"在面板上**可分辨**
         *   （同 `[原则] 输入量须可见化`：不得把"没设"渲染成"设成了默认"）。
         *   ⚠ 回的是 `resolveBudgetNumber/resolveLevelCaps` 的产物（**与运行时同一个函数**），
         *   而非 scheduler.json 的原始值 —— 否则面板会显示"用户写了什么"而运行态是"夹取后的值"（又一处假读数）。 */
        injectBudgetChars: (() => {
            const r = resolveBudgetNumber('injectBudgetChars', sched.injectBudgetChars, SURFACE.injection.budgetChars);
            return { value: r.value, source: r.source, clamped: r.clamped };
        })(),
        injectSituationBudgetChars: (() => {
            const r = resolveBudgetNumber('injectSituationBudgetChars', sched.injectSituationBudgetChars, SURFACE.injection.situation?.budgetChars);
            return { value: r.value, source: r.source, clamped: r.clamped };
        })(),
        injectLevelCaps: (() => {
            const r = resolveLevelCaps(sched.injectLevelCaps, SURFACE.injection.levelCaps);
            return { value: r.caps, source: ('injectLevelCaps' in sched) ? 'override' : 'registry', clamped: r.clamped.length > 0, clampedKeys: r.clamped };
        })(),
        scoreWeights: String(sched.scoreWeights ?? SCORE.mode),
        shadowScore: sched.shadowScore !== false,
        maturationEnforce: sched.maturationEnforce === true,
        // v2.2：睡眠期自检
        selfCheck: sched.selfCheck !== false,
        selfCheckRepo: String(sched.selfCheckRepo ?? ''),
        selfCheckAutoRollback: sched.selfCheckAutoRollback === true,
        selfCheckIntervalHours: typeof sched.selfCheckIntervalHours === 'number' ? sched.selfCheckIntervalHours : 6,
    };
    // P2：无 root 也能调注入（全局 scheduler.json）——root 仅承载「配置原文」编辑；返回 global 供 UI 渲染
    if (!file)
        return sendJson(res, 200, { text: null, parsed: null, error: 'no-active-root', global: globalCfg });
    try {
        const text = readFileSync(file, 'utf8');
        // P1-2：注入配置全局值（scheduler.json）随 /config 返回——UI 渲染用全局（root YAML 的 injection 段已退役）
        sendJson(res, 200, {
            text, parsed: parseView(text), file, mtime: statMtime(file),
            global: globalCfg,
        });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
async function saveRoute(d, req, res) {
    const body = await readBody(req);
    if (typeof body.text !== 'string')
        return sendJson(res, 400, { error: 'text required' });
    const file = d.root.configFileOf();
    if (!file)
        return sendJson(res, 400, { error: 'no-active-root' });
    try {
        backupThenWrite(file, body.text);
        d.logger.info?.(`[shoucang] panel saved ${file}`);
        sendJson(res, 200, { ok: true, parsed: parseView(body.text) });
    }
    catch (e) {
        sendJson(res, 500, { error: String(e) });
    }
}
async function toggleRoute(d, req, res) {
    const body = await readBody(req);
    const key = typeof body.key === 'string' ? body.key : '';
    const allowed = ['injection.hot_memory', 'injectRelevance', 'injectPlaybook', 'bankGit', 'mclEnabled', 'mclAudit', 'shadowScore', 'maturationEnforce', 'selfCheck', 'selfCheckAutoRollback']; // U3+v2.2：布尔类键（均走 SUITE_BOOL 全局通道）；injectPlaybook = S4-2
    if (!allowed.includes(key))
        return sendJson(res, 400, { error: `key 不允许：${key}` });
    // U3 修正（实测缺陷）：scheduler.json 类布尔键必须走 **suite 持久通道**——
    // 此前只有 hot_memory 走全局，其余键落到 root YAML 的 flipBool ⇒ 找不到 `shoucang.<key>` 行 → 500。
    const SUITE_BOOL = {
        'injection.hot_memory': 'hotMemory', // P1-2：注入总闸（全局 scheduler.json）
        injectRelevance: 'injectRelevance',
        injectPlaybook: 'injectPlaybook', // S4-2：三层判据常驻（false ⇒ 逐字节回滚）
        bankGit: 'bankGit',
        mclEnabled: 'mclEnabled',
        mclAudit: 'mclAudit',
        shadowScore: 'shadowScore',
        maturationEnforce: 'maturationEnforce',
        selfCheck: 'selfCheck',
        selfCheckAutoRollback: 'selfCheckAutoRollback',
    };
    if (SUITE_BOOL[key]) {
        const prop = SUITE_BOOL[key];
        const cur = d.suite.read()[prop] !== false; // 缺省 true
        d.suite.write({ ...d.suite.read(), [prop]: !cur });
        d.hot.invalidate();
        d.logger.info?.(`[shoucang] panel toggled ${key}（全局 scheduler.json → ${prop}=${!cur}）`);
        return sendJson(res, 200, { ok: true, key, global: prop, value: !cur });
    }
    // 兜底写通道：root config YAML 布尔直写（flipBool）。当前 /toggle 白名单内所有键均已走 SUITE_BOOL，
    // 此分支为未来新增的 root-only 布尔键预留（与 check-carriers 的「三写通道」模型一致）。
    const file = d.root.configFileOf();
    if (!file)
        return sendJson(res, 400, { error: 'no-active-root' });
    const fileKey = 'shoucang.' + key;
    let next;
    try {
        next = flipBool(readFileSync(file, 'utf8'), fileKey);
    }
    catch (e) {
        return sendJson(res, 500, { error: String(e) });
    }
    if (next === null)
        return sendJson(res, 500, { error: `未定位到布尔行：${key}` });
    backupThenWrite(file, next);
    d.hot.invalidate(); // 注入缓存作废：toggle 立即反映到下一轮注入/预览
    d.logger.info?.(`[shoucang] panel toggled ${key}`);
    sendJson(res, 200, { ok: true, parsed: parseView(next) });
}
async function setRoute(d, req, res) {
    const body = await readBody(req);
    const key = typeof body.key === 'string' ? body.key : '';
    let value = typeof body.value === 'string' ? body.value.trim() : '';
    const allowed = {
        /* 存储模式（2026-09-14 补）：P4「存储解耦」的开关，属**新增架构**的可调节面。
         * 只放 `md` / `dual` 两个合法值 —— `record`（记录为唯一事实源）**尚未实现**（M4 未收口、M5 未切），
         * 放进来会形成"看起来能切、切了就坏"的**假可控** ⇒ 由枚举校验显式拒绝。 */
        storeMode: ['md', 'dual'],
        'injection.level': ['off', 'low', 'medium', 'high', 'smart'],
        'injection.persona': ['off', 'me', 'you', 'both'],
        // v16：注入板块容量上限（字符，0=不裁）；max_tokens 总预算已退役（2026-09-10）
        'injection.agent_max_chars': [],
        'injection.user_max_chars': [],
        'injection.memory_max_chars': [],
        // 2026-09-10：记忆库容量门（写门用，控制蒸馏/扩增规模）
        'injection.cap_agent': [],
        'injection.cap_user': [],
        'injection.cap_memory': [],
        // 2026-09-10 收敛：archive/lifecycle/merge 组键消费端为旧 Python 链路（_meta/*.py 已不随包分发），
        // 无真消费——保留只会误导用户。已从白名单移除（真蒸馏/归档走 scheduler.json 通道）。
        'embedding.dimension': [],
        // 2026-09-10：v7 活性/遗忘/加深校准阈值（数值类；scheduler zod 属性名同键，值=天/命中次数/百分比）
        'activityWarmDays': [],
        'activityColdDays': [],
        'activityArchiveDays': [],
        'activityHotHits': [],
        'recallColdFactorPercent': [],
        // U3（B5 能力对齐）：补齐后端已有/新声明的键 —— 此前 UI 无法调（injectRelevance/injectFreshSlots 未声明；
        // MCL 6 键 + v2 的 recallFusion/bankGit 无控件）。数值类走 /set，布尔类走 /toggle。
        'injectFreshSlots': [],
        'mclFamiliarThreshold': [],
        'mclMaxNudges': [],
        'mclBudgetChars': [],
        'mclTopK': [],
        'recallFusion': ['rrf', 'weighted'],
        'injectProfileRows': [],
        /* S3（2026-09-21）：注入槽位额度热覆盖（数值类走 /set）。
         *  · `injectBudgetChars` / `injectSituationBudgetChars`：数值，范围与 `BUDGET_RANGES` **同源**（下方 RANGE）。
         *  · `injectLevelCaps`：对象（`{low,medium,high,smart}`）⇒ 值解析走下面的 JSON 分支（**不做字符串枚举**）。 */
        'injectBudgetChars': [],
        'injectSituationBudgetChars': [],
        'injectLevelCaps': [],
        'scoreWeights': ['legacy', 'v2'],
        'selfCheckRepo': [], // 仓根路径（字符串）
        'selfCheckIntervalHours': [],
        // G-19（2026-09-12）：深睡失败策略 —— retry=全重捞永不放弃（B）/ graded=连败 N 轮放行并告警（C，缺省）
        'deepSleep.failPolicy': ['retry', 'graded'],
        'deepSleep.failPolicyMaxRounds': [],
    };
    // 数值范围校验（2026-09-10 收敛：仅注入组 + embedding.dimension；archive/lifecycle/merge 死键已随白名单移除）
    const RANGE = {
        // v16：板块容量上限范围（0=不裁，上限留足写门容量的 6 倍余量）
        'injection.agent_max_chars': [0, 20000],
        'injection.user_max_chars': [0, 20000],
        'injection.memory_max_chars': [0, 20000],
        'injection.cap_agent': [100, 30000],
        'injection.cap_user': [100, 30000],
        'injection.cap_memory': [100, 30000],
        'embedding.dimension': [16, 8192], // 常见嵌入维度范围
        // v7 活性/遗忘/加深校准阈值范围（同 scheduler zod min/max）
        'activityWarmDays': [1, 120], // active→warm 无命中天数
        'activityColdDays': [2, 365], // warm→cold 无命中天数
        'activityArchiveDays': [30, 730], // cold 且最近命中超此天数 → 遗忘候选
        'activityHotHits': [1, 50], // 近 30 天命中 ≥ 此值 → 加深候选 B
        'recallColdFactorPercent': [5, 95], // 召回降权系数（%）
        // U3（B5）：新增数值键范围（与 scheduler zod min/max 一致）
        'injectFreshSlots': [0, 6],
        'mclFamiliarThreshold': [0, 1],
        'mclMaxNudges': [0, 3],
        'mclBudgetChars': [120, 4000],
        'mclTopK': [1, 5],
        'injectProfileRows': [0, 6],
        /* S3（2026-09-21）：范围与 `budget-override#BUDGET_RANGES` **同源**（消费侧夹取用同一组数；
         * 此处用于**写入侧即时 400**，夹取用于**运行侧防御** —— 两者都要有，缺一即单边防线）。
         * 判据 `check-budget-override` 断言两处同值。 */
        'injectBudgetChars': [BUDGET_RANGES.injectBudgetChars[0], BUDGET_RANGES.injectBudgetChars[1]],
        'injectSituationBudgetChars': [BUDGET_RANGES.injectSituationBudgetChars[0], BUDGET_RANGES.injectSituationBudgetChars[1]],
        'selfCheckIntervalHours': [0, 168],
        'deepSleep.failPolicyMaxRounds': [1, 100], // G-19：连败放行阈值（轮）；0/负数会被 liveFailPolicy 忽略并回落默认值 3
    };
    if (!(key in allowed))
        return sendJson(res, 400, { error: `key 不允许：${key}` });
    if (!value)
        return sendJson(res, 400, { error: 'value required' });
    if (allowed[key].length && !allowed[key].includes(value))
        return sendJson(res, 400, { error: `枚举值非法：${key} ∈ ${allowed[key].join('|')}` });
    if (RANGE[key] && !(Number(value) >= RANGE[key][0] && Number(value) <= RANGE[key][1])) {
        return sendJson(res, 400, { error: `数值越界：${key} ∈ [${RANGE[key][0]}, ${RANGE[key][1]}]` });
    }
    // P1-2：注入配置落盘全局 scheduler.json（键映射 injection.* → inject*）；不再写 root config YAML
    const SCHED_KEY = {
        'injection.level': 'injectLevel',
        'injection.persona': 'injectPersona',
        'injection.agent_max_chars': 'injectAgentMaxChars',
        'injection.user_max_chars': 'injectUserMaxChars',
        'injection.memory_max_chars': 'injectMemoryMaxChars',
        // 2026-09-10：记忆库容量门（写门 SHOUCANG_CAP_* 源）
        'injection.cap_agent': 'capAgent',
        'injection.cap_user': 'capUser',
        'injection.cap_memory': 'capMemory',
        // v7 活性/遗忘/加深校准阈值：键名与 scheduler zod 属性名一致（数值 Number 化写入 scheduler.json 顶层）
        'activityWarmDays': 'activityWarmDays',
        'activityColdDays': 'activityColdDays',
        'activityArchiveDays': 'activityArchiveDays',
        'activityHotHits': 'activityHotHits',
        'recallColdFactorPercent': 'recallColdFactorPercent',
        // U3（B5）：新增键 → scheduler.json 顶层（键名与 zod 属性名一致）
        'injectFreshSlots': 'injectFreshSlots',
        'mclFamiliarThreshold': 'mclFamiliarThreshold',
        'mclMaxNudges': 'mclMaxNudges',
        'mclBudgetChars': 'mclBudgetChars',
        'mclTopK': 'mclTopK',
        'recallFusion': 'recallFusion',
        'scoreWeights': 'scoreWeights', // v2.2：打分公式开关（legacy|v2）
        'injectProfileRows': 'injectProfileRows', // v2.2：P 层画像行每档上限（0=回滚）
        /* S3（2026-09-21）：注入槽位额度**热覆盖三键** → scheduler.json 顶层（键名与 zod 属性名一致）。
         * ⚠ 加白名单**必须同时**有映射 —— 本仓已有先例判定过"只加白名单不加映射"是
         *   **假可控的另一种形态**（能校验却写不进去，见本条上方 `storeMode` 的注解）。 */
        'injectBudgetChars': 'injectBudgetChars',
        'injectSituationBudgetChars': 'injectSituationBudgetChars',
        'injectLevelCaps': 'injectLevelCaps',
        'embedding.dimension': 'embedDim', // 历史遗留键：此前只登记白名单却无映射（实测 400）→ 补映射
        'selfCheckRepo': 'selfCheckRepo',
        'selfCheckIntervalHours': 'selfCheckIntervalHours',
        // G-19：深睡失败策略 → scheduler.json（distill.ts 的 liveFailPolicy 实时读这两个键）
        'deepSleep.failPolicy': 'deepSleepFailPolicy',
        'deepSleep.failPolicyMaxRounds': 'deepSleepFailMaxRounds',
        // 2026-09-14：存储模式 → scheduler.json 的 storeMode（P4 存储解耦开关；record-shadow 读它决定是否镜像）
        //   ⚠ 上一版只加了枚举白名单、**没加映射** ⇒ 实测报 "key 无全局映射"（假可控的另一种形态：能校验却写不进去）
        storeMode: 'storeMode',
    };
    const schedKey = SCHED_KEY[key];
    if (!schedKey)
        return sendJson(res, 400, { error: `key 无全局映射：${key}` });
    // U3 修正（实测缺陷：recallFusion='rrf' 曾被 Number() 写成 0）：**枚举键原样写字符串**，仅数值键 Number 化。
    // U3/v2.2 修正（实测：字符串键 selfCheckRepo 被 Number() 吞成 0）：**枚举/字符串键原样写**，仅数值键 Number 化。
    const STRING_KEYS = new Set(['selfCheckRepo']);
    /* ⚠ S3（2026-09-21）：**对象键必须原样写，不能被 Number() 吞掉**。
     *   本条 `injectLevelCaps` 的值是 `{low,medium,high,smart}` ⇒ 若落到下面的 `Number(value) || 0`
     *   会变成 **0**（`Number('{"low":1}')` = NaN ⇒ `|| 0`）⇒ 写进去的是**垃圾**，
     *   而 API 仍回 200 ⇒ **"看着成功、值却是坏的"**（与本条上方两行注解记载的 `recallFusion`/`selfCheckRepo`
     *   是同一类，只是这次是对象）。⇒ 显式 JSON 解析 + 逐档数值校验，非法即 **400**。
     *   ⚠ 这也是"三条防线缺一不可"的第三道：白名单（能调）/ 映射（写得进）/ 类型（写对）。 */
    let writeValue;
    if (key === 'injectLevelCaps') {
        let obj;
        try {
            obj = JSON.parse(value);
        }
        catch {
            return sendJson(res, 400, { error: `injectLevelCaps 须为 JSON 对象：{"low":2,...}` });
        }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj))
            return sendJson(res, 400, { error: 'injectLevelCaps 须为 JSON 对象（非数组/非标量）' });
        const [lo, hi] = [BUDGET_RANGES.injectLevelCaps[0], BUDGET_RANGES.injectLevelCaps[1]];
        const bad = [];
        for (const [k, v] of Object.entries(obj)) {
            const n = Number(v);
            if (!Number.isFinite(n) || n < lo || n > hi)
                bad.push(`${k}=${String(v)}`);
        }
        if (bad.length)
            return sendJson(res, 400, { error: `injectLevelCaps 越界或非数值（单档须 ∈ [${lo}, ${hi}]）：${bad.join(', ')}` });
        writeValue = obj;
    }
    else {
        const isEnum = allowed[key].length > 0;
        writeValue = (isEnum || STRING_KEYS.has(key)) ? value : (Number(value) || 0);
    }
    const merged = { ...d.suite.read(), [schedKey]: writeValue };
    d.suite.write(merged);
    d.hot.invalidate(); // 注入缓存作废：改动立即反映到下一轮注入
    d.logger.info?.(`[shoucang] panel set ${key}=${value}（全局 scheduler.json ${schedKey}）`);
    sendJson(res, 200, { ok: true, key, value, global: schedKey });
}
export function registerConfigRoutes(d) {
    d.route('/roots', (req, res) => rootsRoute(d, req, res));
    d.route('/get_root', (req, res) => getRootRoute(d, req, res));
    d.route('/root/bootstrap', async (req, res) => rootBootstrapRoute(d, req, res), contractFor('/root/bootstrap'));
    d.route('/set_root', async (req, res) => setRootRoute(d, req, res), contractFor('/set_root'));
    d.route('/config', (req, res) => configRoute(d, req, res));
    d.route('/save', async (req, res) => saveRoute(d, req, res), contractFor('/save'));
    d.route('/toggle', async (req, res) => toggleRoute(d, req, res), contractFor('/toggle'));
    d.route('/set', async (req, res) => setRoute(d, req, res), contractFor('/set'));
}
//# sourceMappingURL=panel-config.js.map