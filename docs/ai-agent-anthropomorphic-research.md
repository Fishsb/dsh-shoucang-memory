# 人类「遇事—检索—判断—行动—完成」流程的学术依据

> 面向工程目标：把 AI agent 拟人化。本文只收录**实际检索到并可核验**的出处；未能核实者明确标「未检索到」。
> 检索通道：`exa` / `tavily` / `anysearch`（`ddg`/`searxng` 不可用；CoALA 原文经 arXiv HTML 直读）。

---

## 1. 信息检索与觅食

**核心结论**

1. 人类检索信息的行为可建模为**生物学觅食的理性适配**：信息以「信息斑块（patch）」形式分布（网页、文档、人际），觅食者依据**信息气味（information scent）**判断某个链接/线索通向目标的期望收益，据此在斑块内继续采掘或**离开当前斑块**；「食性（diet）」则决定在给定成本下值得追求哪类信息（Pirolli & Card 1999）。
2. 斑块内何时离开由**边际价值定理**刻画：当当前斑块的边际收益率降到低于环境中其他斑块的平均收益率时，最优策略是切换（该形式化源自 Stephens & Krebs 的觅食理论，被 Pirolli & Card 移植到信息检索）。
3. **意义建构（sensemaking）**不是一次性理解，而是一个**循环的数据—框架（data-frame）转换过程**：分析师在「寻找/表征」与「提炼/呈现」两组活动间往复，通过生成框架、用数据填充框架、再据框架反向检索新数据来降低不确定性（Pirolli & Card 2005）。Weick 的意义建构为该传统提供了组织行为学源头。

**出处**

- Pirolli, P., & Card, S. (1999). *Information foraging.* Psychological Review, 106(4), 643–675. <https://psycnet.apa.org/record/1999-11924-001>
- Pirolli, P., & Card, S. (2005). *The sensemaking process and leverage points for analyst technology as identified through cognitive task analysis.* <https://andymatuschak.org/files/papers/Pirolli,%20Card%20-%202005%20-%20The%20sensemaking%20process%20and%20leverage%20points%20for%20analyst%20technology%20as.pdf>
- Pirolli, P., & Card, S. (2005). *Rational analyses of information foraging on the web.* Cognitive Science. <https://doi.org/10.1207/s15516709cog0000_20>（DOI 经检索通道确认；原文未直读）
- 综述：*Thirty-two years of research on information foraging theory* (2024). <https://doi.org/10.22452/mjlis.vol29no3.6>

---

## 2. 自然决策（NDM）

**核心结论**

1. **RPD（识别启动决策）**：专家不比较多个选项，而是**识别情境类型 → 激活一个可行方案 → 心理模拟检验其是否可行**；只有在模拟失败时才修改或更换方案。决策是「识别 + 评估」，不是「选项择优」（Klein 1993）。
2. **NDM 运动的立场**：在时间压力、信息不全、目标模糊、含高风险的真实场景中，经典规范化决策模型（同时评估多选项、概率加权）不描述专家行为；专家依赖经验形成的**模式识别**。
3. **专家直觉与分析式推理的边界条件**：Kahneman & Klein (2009) 通过「对抗性协作」达成共识——直觉技能**成立需两个条件**：①环境有足够的规律性可供学习；②个体有机会通过反馈学习这些规律。任一条件缺失，直觉即不可信。这为「agent 何时可以快判、何时必须慢算」提供了直接判据。
4. **双过程理论**：System 1（快、自动、联想）/ System 2（慢、受控、规则）的划分由 Kahneman (2003) 系统阐述并普及。**注意**：该术语作为正式标签的学界通行归因通常指向 Stanovich & West (2000)，Kahneman 2003 是使其广为传播的版本——本报告未检索到 Stanovich & West 原文的直读核验，故仅作标注。

**出处**

- Klein, G. (1993). *A recognition-primed decision (RPD) model of rapid decision making.* <https://psycnet.apa.org/record/1993-97634-006>
- Klein, G. (1999). *Sources of Power: How People Make Decisions.* MIT Press. <https://mitpress.mit.edu/9780262611466/sources-of-power/>
- Kahneman, D., & Klein, G. (2009). *Conditions for intuitive expertise: A failure to disagree.* American Psychologist. <https://www.shadowboxtraining.com/news/2025/06/17/a-primer-on-recognition-primed-decision-making-rpd>（标题/作者/年份经多个来源交叉确认；**未获取 DOI 与原文**）
- Kahneman, D. (2003). *A perspective on judgment and choice: Mapping bounded rationality.* American Psychologist. <https://pubmed.ncbi.nlm.nih.gov/14584987> · 全文 PDF <http://ruccs.rutgers.edu/images/personal-zenon-pylyshyn/docs/TreismanReadings/06-Kahneman-2003.pdf>

---

## 3. 问题求解与任务流程的经典模型

**核心结论**

1. **问题空间 + 手段-目的分析**：问题求解被刻画为在**问题空间**（状态 + 算子）中搜索；手段-目的分析通过计算「当前状态与目标的差异」并选择能缩小该差异的算子来降低差异。这是 GPS 与后续所有规划器的理论祖先（Newell & Simon 1972；Newell, Shaw & Simon 1958 的"元素"论文已给出雏形）。
2. **Pólya 四阶段**：理解问题 → 拟定计划 → 执行计划 → 回顾检验。其价值在于**把「回顾」列为求解的法定阶段**，而非可选收尾；同时给出启发式清单（类比、特例化、逆推）。
3. **Dewey 反省思维五步**：察觉困难 → 定位与界定问题 → 提出假设性解决方案 → 推演其后果 → 检验并据以行动。与 Pólya 同构，但更强调「困难感」是流程的触发条件。
4. **BDI（信念-愿望-意图）**：Bratman 的实践推理哲学主张**意图不可还原为信念+愿望**——意图具有承诺性、会持续约束后续推理，并驱动手段-目的规划；Rao & Georgeff 将其形式化为可计算 agent 架构。OODA（观察-调整-决策-行动）由 Boyd 提出，强调循环速度与不断重新定位；其正式图示见 *A Discourse on Winning and Losing* 附录。
5. **自我调节学习循环**：Zimmerman 把学习者的自我调节刻画为三个**循环**阶段——预见（forethought，任务分析与自我激励）、表现（performance，自我控制与自我观察）、自我反思（self-reflection，自我判断与归因），反思结果反馈回下一轮预见。

**出处**

- Newell, A., & Simon, H. A. (1972). *Human Problem Solving.* Prentice-Hall.（全文要点 PDF <https://worrydream.com/refs/Simon_1970_-_Human_Problem_Solving,_The_State_of_the_Theory_in_1970.pdf>）
- Newell, A., Shaw, J. C., & Simon, H. A. (1958). *Elements of a theory of human problem solving.* Psychological Review. <https://cse.buffalo.edu/~rapaport/Papers/Papers.by.Others/newell-etal58-EltsThHProbSlvg-PsyRev.pdf>
- Pólya, G. (1945). *How to Solve It.* Princeton University Press. 全文 <https://math.hawaii.edu/home/pdf/putnam/PolyaHowToSolveIt.pdf>
- Dewey, J. (1910). *How We Think.* — 五步表述经二手来源确认（<https://www.linkedin.com/pulse/five-stages-reflective-thinking-what-we-can-still-learn-clive-martlew>）；**原始页码未核验**
- Bratman, M. E. (1987). *Intention, Plans, and Practical Reason.* Harvard University Press. 相关论文 <https://www.emse.fr/~boissier/enseignement/defiia/up5/pdf/Bratman-PlansPracticalResoning.pdf>
- Rao, A. S., & Georgeff, M. P. (1991). *Modeling rational agents within a BDI-architecture.* <https://jmvidal.cse.sc.edu/library/rao91a.pdf>
- Boyd, J. R. (1976/1987). *Destruction and Creation* / *A Discourse on Winning and Losing*（含 OODA 附录）. <https://www.airuniversity.af.edu/Portals/10/AUPress/Books/B_0151_Boyd_Discourse_Winning_Losing.PDF>
- Zimmerman, B. J. (2002). *Becoming a self-regulated learner: An overview.* <https://www.leiderschapsdomeinen.nl/wp-content/uploads/2016/12/Zimmerman-B.-2002-Becoming-Self-Regulated-Learner.pdf>
- 综述：Panadero, E. (2017). *A review of self-regulated learning: Six models and four directions.* <https://pmc.ncbi.nlm.nih.gov/articles/PMC5408091/>

---

## 4. 认知架构

**核心结论**

1. **模块划分的共性**：ACT-R、Soar、CLARION 都把认知拆成「感知/运动模块—记忆模块—产生式/程序性系统—缓冲与选择机制—学习机制」。ACT-R 以**缓冲（buffer）**为界：模块把 chunk 放入缓冲，产生式规则匹配缓冲内容并触发行动，基底神经节实现程序性选择（Anderson et al. 2004）。Soar 以**工作记忆 ↔ 产生式匹配**为核心，产出提议-评估-选择-应用的决策环；无匹配或平局时产生 **impasse**，自动建立子目标做层级分解（Laird 2022）。
2. **Soar 的记忆分类**：工作记忆（当前情境：感知输入、目标、中间推理结果）；长期记忆分三类——程序性（产生式规则本身）、语义（世界事实）、情节（自身过去行为序列）。**这套四分法被 CoALA 直接继承。**
3. **CLARION** 的独特之处是**双表征（dual-representation）**：显性/隐性两套子系统并行，隐性技能可通过自下而上过程转为显性知识（Sun et al. 2001, 2016）。
4. **CoALA（关键对接点，已直读原文核验）**：CoALA 用**三个维度**描述语言 agent——①**记忆**：分工作记忆与长期记忆；②**行动空间**：分内部行动与外部行动；③**决策过程**：一个「规划（planning）与执行（execution）交替」的交互式循环。原文引言逐字自述其三维度为 *"their information storage (divided into working and long-term memories); their action space (divided into internal and external actions); and their decision-making procedure (which is structured as an interactive loop with planning and execution)"*；摘要则表述为 *"modular memory components, a structured action space to interact with internal memory and external environments, and a generalized decision-making process"*。
   - **记忆四分法的核验口径**：原文在 §2.3（Soar 小节）明确写出工作记忆 + 长期记忆三分（**程序性 procedural / 语义 semantic / 情节 episodic**）的完整分类，并说明 CoALA 沿用该心理学分类描述语言 agent。我**直读到的原文**确立了「working ↔ long-term」二分与「procedural/semantic/episodic」三分；§4.1 正文因 HTML 抓取截断**未能逐字直读**，故此处不引用其原句。
   - 原文另一处关键论断：LLM 可类比为**概率式产生式系统**——产生式规定字符串如何被改写，LLM 定义文本增改的概率分布；因此认知架构中用于产生式系统的控制流可移植到 LLM agent。
   - 依此，CoALA 的**检索/推理/学习**三类内部行动正对应本文第 1、4、5 条线索（觅食式检索、分析式推理、结果固化）。

**出处**

- Anderson, J. R., Bothell, D., Byrne, M. D., Douglass, S., Lebiere, C., & Qin, Y. (2004). *An integrated theory of the mind.* Psychological Review. <https://pubmed.ncbi.nlm.nih.gov/15482072/> · 全文 <http://zoo.cs.yale.edu/classes/cs671/12f/12f-papers/anderson-act-r.pdf>
- Laird, J. E. (2022). *Introduction to the Soar cognitive architecture.* arXiv:2205.03854. <https://arxiv.org/pdf/2205.03854>
- Rosenbloom, Demski & Ustun (2016) / 对比研究：*An analysis and comparison of ACT-R and Soar* (ACS-2021). <https://advancesincognitivesystems.github.io/acs2021/data/ACS-21_paper_6.pdf>
- Sun, R., Merrill, E., & Slusarz, P. (2001). *From implicit skills to explicit knowledge: A bottom-up model of skill learning.* Cognitive Science. <https://doi.org/10.1207/s15516709cog2502_2>
- Sun, R. (2016). *Anatomy of the Mind: Exploring Psychological Mechanisms and Processes with the CLARION Cognitive Architecture.* Oxford University Press. <https://doi.org/10.1093/acprof:oso/9780199794553.001.0001>
- **Sumers, T. R., Yao, S., Narasimhan, K., & Griffiths, T. L. (2023/2024). *Cognitive Architectures for Language Agents (CoALA).* arXiv:2309.02427v3.** <https://arxiv.org/abs/2309.02427>（原文 HTML 已直读；含 OpenReview 评审版本 <https://openreview.net/forum?id=1i6ZCvflQJ>）
- **Sigma 架构：未检索到**（本轮未获取可靠出处）。

---

## 5. 元认知与执行控制

**核心结论**

1. **元认知 = 监测 + 控制**：Nelson & Narens (1990) 把元认知刻画为**两个相互作用的层级**——元层（meta-level）持有对客体层（object-level）的模型并**监测**其状态，同时向客体层发出**控制**指令。这是「agent 自我监控 + 自我调整」最直接的理论原型。
2. **执行功能三因子**：Miyake et al. (2000) 用潜变量分析证明执行功能并非单一整体，而是可分离的三个成分——**抑制（inhibition）、工作记忆更新（updating）、任务切换（shifting）**，三者共享一个「共同执行功能」因子（unity/diversity 框架）。
3. **认知负荷**：Sweller (1988) 指出工作记忆容量限制是问题求解与学习的关键瓶颈；手段-目的分析等一般性解题策略会占用大量工作记忆，反而**妨碍图式（schema）获取**——即「分析式解题」与「学习固化」存在资源竞争。
4. **习惯 vs 目标导向控制**：Daw et al. (2011) 在人类被试中同时检测到**模型基（model-based，目标导向）**与**无模型（model-free，习惯性）**两套控制系统的行为签名，且二者对纹状体预测误差有不同贡献。这为「System 1/System 2」在**行为控制层**提供了可测量对应物。

**出处**

- Nelson, T. O., & Narens, L. (1990). *Metamemory: A theoretical framework and new findings.* Psychology of Learning and Motivation, 26, 125–173. <https://sites.socsci.uci.edu/~lnarens/1990/Nelson&Narens_Book_Chapter_1990.pdf>
- Miyake, A., et al. (2000). *The unity and diversity of executive functions… A latent variable analysis.* Cognitive Psychology, 41(1), 49–100. <https://pubmed.ncbi.nlm.nih.gov/10945922/> · 全文 <https://columbia.edu/cu/psychology/tor/Papers/Unity_Diversity_Exec_Functions.pdf>
- Friedman, N. P., & Miyake, A. (2017). *Unity and diversity of executive functions: Individual differences…* Cortex. <https://pmc.ncbi.nlm.nih.gov/articles/PMC5104682/>
- Sweller, J. (1988). *Cognitive load during problem solving: Effects on learning.* Cognitive Science, 12(2), 257–285. <https://doi.org/10.1207/s15516709cog1202_4>
- Daw, N. D., Gershman, S. J., Seymour, B., Dayan, P., & Dolan, R. J. (2011). *Model-based influences on humans' choices and striatal prediction errors.* Neuron, 69(6), 1204–1215. <https://doi.org/10.1016/j.neuron.2011.02.027>

---

## 6. 人类如何判断「能否做到」与「何时停止检索」

**核心结论**

1. **自我效能**：Bandura (1977) 主张行为改变的统一机制是**自我效能期望**——个体对「自己能否成功执行产生特定结果所需行为」的判断。效能信念有四个来源：**亲历成败经验（最强）、替代经验、言语说服、生理情绪状态**。自我效能直接决定**是否发起行动、投入多少努力、遭遇障碍时坚持多久**。
2. **能力判断 → 努力分配**：由上，人类在任务开始前就做了一次「我能不能做到」的快速估计，并据此分配努力与坚持度；这与 RPD 的「方案可行性心理模拟」是同一判据的两种时间尺度（任务级 vs 方案级）。
3. **何时停止检索**：最优化停止理论（Wald 的序贯分析、secretary problem）给出理性基准——经典 secretary problem 的最优策略是先考察约前 **1/e（≈37%）** 的候选作为样本以建立阈值，之后遇到超过阈值的即接受。
4. **人类实证偏离基准**：带基数（cardinal，可感知候选质量）的 secretary 搜索实验中，**被试显著偏离风险中性最优解而倾向于过早停止（stopping early）**；并且人们在**重复**的 secretary 问题中会**从经验中学习**调整停止阈值，准确率随经验提升。这对 agent 的启示是：停止准则应当**从反馈中在线校准**，而非固定写死。

**出处**

- Bandura, A. (1977). *Self-efficacy: Toward a unifying theory of behavioral change.* Psychological Review, 84(2), 191–215. <https://pubmed.ncbi.nlm.nih.gov/847061>
- Goldstein, D. G., McAfee, R. P., Suri, S., & Wright, J. R. (2019). *Learning when to stop searching.* Management Science. <https://doi.org/10.1287/mnsc.2018.3245> · 全文 <https://www.dangoldstein.com/papers/Goldstein_McAfee_Suri_Wright_Learning_To_Stop_Searching.pdf>
- *When to stop — A cardinal secretary search experiment.* (2020). Journal of Mathematical Psychology. <https://www.sciencedirect.com/science/article/abs/pii/S0022249620300742>
- *The effect of incentive structure on search in the secretary problem.* (2020). Judgment and Decision Making. <https://doi.org/10.1017/s1930297500006926>
- *A linear threshold model for optimal stopping behavior.* (2019). <https://doi.org/10.31234/osf.io/cbn6t>

---

## 7. 可工程化的流程骨架

把上述研究归纳为一条**六阶段人类完成任务流程**。每阶段给出研究出处与该阶段的**可观测行为特征**（供提示词/架构落地时作为判定信号）。

| # | 阶段 | 对应研究出处 | 可观测行为特征（agent 侧可判定信号） |
|---|---|---|---|
| 1 | **情境感知与目标解析** | Dewey 五步（察觉困难→界定问题）；Newell & Simon 问题空间；CoALA 的 working memory | 把原始输入转写为「当前状态 / 目标状态 / 差异」的三元组；明确产出「问题是什么」而非直接动手；工作记忆中出现目标表征 |
| 2 | **记忆/知识检索（觅食 + 停止准则）** | Pirolli & Card 1999（scent/patch/diet）；Goldstein et al. 2019 + cardinal secretary 实验（停止阈值）；CoALA 的 retrieval action | 发出检索查询（信息气味线索）；在同一来源内继续深挖 vs 切换到新来源（斑块离开决策）；**记录已尝试查询与收益、并据此校准停止阈值**——不固定迭代次数 |
| 3 | **模式识别与快速判断** | Klein RPD 1993；Kahneman & Klein 2009（两条件）；Kahneman 2003 System 1；Daw et al. 2011 无模型控制 | 直接给出单一方案而非列举选项；显式检查**两个适用条件**——环境是否有规律、是否已有该环境的反馈经验；命中则快判，未命中则强制转阶段 4 |
| 4 | **必要时分析式规划** | Kahneman 2003 System 2；Newell & Simon 手段-目的分析；Pólya 四阶段；Bratman/Rao & Georgeff BDI；Soar impasse 子目标分解 | 生成多个候选并比较；做手段-目的差异缩小；显式形成**意图承诺**（选定计划后不再轻易重评）；遇到无匹配/平局时**自动建立子目标**再分解 |
| 5 | **行动与执行监控（元认知）** | Nelson & Narens 1990（监测+控制双层）；Miyake et al. 2000（抑制/更新/切换）；Sweller 1988（负荷上限）；Zimmerman 预见-表现-反思 | 边执行边报告进度与不确定性（监测）；发现偏离时切换策略或抑制无效冲动（控制）；**识别工作记忆过载并主动卸载/分步**；执行前有预见性目标设定 |
| 6 | **结果评估与学习固化** | Pólya「回顾」；Zimmerman 自我反思；Bandura 1977（效能信念四来源）；Daw et al. 2011（模型基→习惯迁移）；Sun et al. CLARION（隐性→显性） | 对照目标验收结果；归因（成功/失败原因）；把成功路径**写入程序性/情节记忆**以备下次快判；更新自我效能估计（影响下次的努力分配与是否发起） |

**两条横切设计原则**

- **快慢仲裁不是风格问题，而是条件判断**：Kahneman & Klein (2009) 的两个条件（环境规律性 + 学习反馈机会）可以直接实现为 agent 的路由判据——这比「让模型自己决定要不要深思」更可核验。
- **停止准则是可学习的参数，不是常量**：Goldstein et al. (2019) 与 cardinal secretary 实验都表明人类的停止行为偏离最优但**随经验收敛**。工程上应把「检索预算/何时停止」做成带反馈的在线校准量。

---

### 检索局限说明

- **未检索到**：Sigma 认知架构的可靠出处；Dewey 五步的原始页码；Kahneman & Klein (2009) 的 DOI 与原文全文（标题/作者/年份/期刊已多源交叉确认）。
- **仅凭检索元数据、未直读全文**：Klein 1993、Bratman 1987、Rao & Georgeff 1991、Boyd、Dewey、Pólya 书目信息。
- **直读原文核验**：CoALA（arXiv HTML v3——三维度表述、Soar 记忆四分法、LLM 即概率式产生式系统三处逐字确认）。
- `platform_search` 的 wikipedia 通道报 fetch failed，本轮未使用。
