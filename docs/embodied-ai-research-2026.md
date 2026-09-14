# 具身智能 / 机器人学：agent 感知—记忆—规划—行动—纠错研究现状（2026-09 检索）

> 检索通道：`advanced_search`（exa / tavily 为主，回退 anysearch）+ `platform_search(github)`；`ddg`/`ddg-lite`/`searxng` 本次不可用，arXiv API 未直接调用（避开 429）。
> **纪律**：下列标题/编号/链接全部为本次检索的真实返回值；作者团队只写检索结果中实际出现的，其余标注「未检索到」。凡未取得的编号一律不补全、不推测。

## 1. 任务规划范式：LLM 做规划器 → 与形式化 / 运动规划混合

1. **主流范式是「LLM 提议 + 外部可行性校验」双层结构**。SayCan（Google，2022，[arXiv:2204.01691](https://arxiv.org/abs/2204.01691)）让 LLM 输出技能的语言相关性分数，再乘以可学习的 affordance 价值函数——把「说得通」压到「做得到」。Inner Monologue（Google，2022，[arXiv:2207.05608](https://arxiv.org/abs/2207.05608)）把成功检测、场景描述、人类反馈文本化回灌给规划器，使开环规划变闭环。
2. **代码化规划**：ProgPrompt（2022/2023，[arXiv:2209.11302](https://arxiv.org/abs/2209.11302)，期刊版 DOI 10.1007/s10514-023-10135-3）把计划生成为带断言与 API 的 Python 程序；Code as Policies（Google，2022，[arXiv:2209.07753](https://arxiv.org/abs/2209.07753)）让 LLM 生成调用感知 API 的策略代码，支持层次化代码分解。
3. **与 PDDL / TAMP 混合**：LLM+P（2023，[arXiv:2304.11477](https://arxiv.org/abs/2304.11477)）把自然语言问题翻译成 PDDL，交经典规划器求最优解；Text2Motion（Stanford，2023，[arXiv:2303.12153](https://arxiv.org/abs/2303.12153)）用技能库 Q 函数做可行性启发式，串联任务级与运动级规划。2025 年新进展：LLM + PDDLStream 的系统性研究（[arXiv:2510.00182](https://arxiv.org/html/2510.00182)）、VLM 引导长时程 TAMP（[arXiv:2410.02193](https://arxiv.org/html/2410.02193v1)）；综述见 [arXiv:2404.02817](https://arxiv.org/abs/2404.02817)。
4. **层级化与重规划**：SayPlan（2023，[arXiv:2307.06135](https://arxiv.org/abs/2307.06135)）用层级 3D 场景图做 grounding，支持迭代重规划与图收缩，把长指令分解为可执行子任务——这是「层级 + 重规划」目前最常被引用的一手工作。

## 2. 可执行的基础模型：VLA / 通用策略

1. **路线确立**：RT-1（Google，2022，[arXiv:2212.06817](https://arxiv.org/html/2212.06817)）证明 transformer + 大规模演示可做多任务真机控制；RT-2（Google DeepMind，2023，[arXiv:2307.15818](https://arxiv.org/abs/2307.15818)）把动作当文本 token，让网络知识直接迁移到控制；Open X-Embodiment / RT-X（2023，[arXiv:2310.08864](https://arxiv.org/abs/2310.08864)）汇集 22 种机器人本体的数据，实证跨本体正迁移。
2. **开源与范式分化**：OpenVLA（2024，[arXiv:2406.09246](https://arxiv.org/abs/2406.09246)）7B 开源、可 LoRA 微调；Octo（2024，[arXiv:2405.12213](https://arxiv.org/abs/2405.12213)）支持灵活观测/动作空间；Diffusion Policy（2023，[arXiv:2303.04137](https://arxiv.org/html/2303.04137v5)）用动作扩散表达多模态动作分布；ALOHA/ACT（Stanford，2023，[arXiv:2304.13705](https://arxiv.org/abs/2304.13705)）以低成本双臂遥操作 + action chunking 做精细双手任务。
3. **产业级通用策略**：π0（Physical Intelligence，2024，[arXiv:2410.24164](https://arxiv.org/abs/2410.24164)）用 flow matching 动作专家做跨本体高频控制；π0.5（2025，[arXiv:2504.16054](https://arxiv.org/abs/2504.16054)）以异构数据共训换开放世界泛化；π*0.6（2025，[arXiv:2511.14759](https://arxiv.org/abs/2511.14759)，RECAP 从自身经验 + 干预中继续提升）。
4. **综述**：Large VLM-based Vision-Language-Action Models for Robotic Manipulation: A Survey（Shao、Li 等，[arXiv:2508.13073](https://arxiv.org/abs/2508.13073)）；另有 [arXiv:2508.15201](https://arxiv.org/abs/2508.15201)（具身操作 VLA 综述）与 [arXiv:2507.01925](https://arxiv.org/html/2507.01925v1)（动作 tokenization 视角）。**任务中提到的 arXiv:2507.10672 本次未检索到任何命中，无法核实，不采信。**

## 3. 闭环与反馈

1. **语言推理闭环四件套**：ReAct（2022，[arXiv:2210.03629](https://arxiv.org/abs/2210.03629)）交错「思考—行动—观察」；Reflexion（Shinn 等，NeurIPS 2023，[arXiv:2303.11366](https://doi.org/10.48550/arxiv.2303.11366)）把失败写成语义反思存入记忆做无梯度强化；Self-Refine（2023，[arXiv:2303.17651](https://arxiv.org/abs/2303.17651)）自反馈迭代精炼；Tree of Thoughts（2023，[arXiv:2305.10601](https://arxiv.org/html/2305.10601v2/)）把推理变成带自评的搜索。LATS（2023，[arXiv:2310.04406](https://arxiv.org/abs/2310.04406)）用蒙特卡洛树搜索统一推理、行动与规划。
2. **机器人侧人在回路纠错已成体系**：Interactive Language（Google，2022，[arXiv:2210.06407](https://arxiv.org/html/2210.06407v1)）实现实时自然语言可指导并顺带采集数据；"No, to the Right" 在线语言纠正（[arXiv:2301.02555](http://arxiv.org/pdf/2301.02555v1)）；Yell At Your Robot（2024，[arXiv:2403.12910](https://arxiv.org/html/2403.12910v1)）从口头纠正在线改进；Interactive Robot Learning from Verbal Correction（2023，[arXiv:2310.17555](https://doi.org/10.48550/arxiv.2310.17555)）；语言纠正的知识蒸馏与检索（[arXiv:2311.10678](https://arxiv.org/html/2311.10678)）。
3. **共同结论与缺口**：语言反馈的语义信息量高于标量奖励，但现有工作基本限定在单任务/短时程；跨任务、长时程的错误归因与恢复仍未见成熟方案。

## 4. 记忆与经验复用

1. **技能库范式**：Voyager（NVIDIA 等，2023，[arXiv:2305.16291](https://arxiv.org/abs/2305.16291)）以「可执行代码技能库 + 迭代提示 + 自我验证」实现开放式能力增长，是「技能固化」被引用最多的模板。
2. **通用 agent 侧**：Gato（DeepMind，2022，[arXiv:2205.06175](https://arxiv.org/abs/2205.06175)）单 transformer 处理多任务多模态；RoboCat（DeepMind，2023，[arXiv:2306.11706](https://arxiv.org/abs/2306.11706)）自生成数据自我改进。Generative Agents（Stanford，2023，[arXiv:2304.03442](https://arxiv.org/abs/2304.03442)）给出完整的记忆架构：append-only 记忆流 + 近因/重要性/相关性三因子检索 + 反思写回。
3. **具身检索增强**：ReMEmbR（NVIDIA，2024，[arXiv:2409.13682](https://arxiv.org/html/2409.13682v1)）把长时程时空记忆做成可检索结构用于导航；HIMM（2026，[arXiv:2602.15513](https://arxiv.org/html/2602.15513v2)）提出类人长期记忆用于具身探索与问答；家庭机器人记忆增强任务规划（[arXiv:2504.21716](https://arxiv.org/html/2504.21716v1)）。
4. **综述**：Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers（[arXiv:2603.07670](https://arxiv.org/pdf/2603.07670)）与 LLM Agent 记忆机制演化综述（[arXiv:2605.06716](https://arxiv.org/html/2605.06716v1)）——两者均明确覆盖 2025–2026 新工作。

## 5. 世界模型与想象

1. **起点**：World Models（David Ha、Jürgen Schmidhuber，2018，[arXiv:1803.10122](https://arxiv.org/abs/1803.10122)）确立「压缩表征 V + 预测 M + 控制器 C」的分离式架构。
2. **规划型世界模型**：MuZero（DeepMind，2019，[arXiv:1911.08265](https://arxiv.org/abs/1911.08265)）无规则学习动力学并在隐空间做搜索；DreamerV3（[arXiv:2301.04104](https://arxiv.org/abs/2301.04104)，Nature 2025 版见 [PMC12003158](https://pmc.ncbi.nlm.nih.gov/articles/PMC12003158/)）跨域通用；Genie（DeepMind，2024，[arXiv:2402.15391](https://arxiv.org/abs/2402.15391)）从无标注视频生成可交互环境。
3. **与 VLA 合流（2025 新）**：WorldVLA（2025，[arXiv:2506.21539](https://arxiv.org/abs/2506.21539)）自回归统一动作与世界模型，联合学习环境动力学与动作规划；综述 Embodied AI: From LLMs to World Models（清华大学 Tongtong Feng、Xin Wang、Yu-Gang Jiang、Wenwu Zhu，2025，[arXiv:2509.20021](https://arxiv.org/abs/2509.20021)）与 A Comprehensive Survey on World Models for Embodied AI（2025，[arXiv:2510.16732](https://arxiv.org/abs/2510.16732)）。

## 6. 基准与评测

1. **仿真基准（长时程/日常任务）**：ALFRED（CVPR 2020，[arXiv:1912.01734](https://www.alphaxiv.org/abs/1912.01734)，建立在 AI2-THOR 仿真器之上）；BEHAVIOR-1K（Stanford，Li 等，[arXiv:2403.09227](https://arxiv.org/abs/2403.09227)，1000 项日常活动，官网显示 2026 挑战赛在办）；CALVIN（Freiburg，[arXiv:2112.03227](https://arxiv.org/abs/2112.03227)，长时程语言条件操作）；LIBERO（2023，[arXiv:2306.03310](https://arxiv.org/abs/2306.03310)，终身学习与知识迁移）。
2. **本次未取得一手编号**：Habitat（仅见二手引用，未定位到本次可核验的一手链接）、RLBench（仅见第三方对比页提及，未取得 arXiv 编号）—— 标注「未检索到」，不作补全。
3. **真机对齐的真机/仿真双轨**：SimplerEnv（2024，[arXiv:2405.05941](https://arxiv.org/abs/2405.05941)）用仿真复现真机策略的排序；RoboArena（2025，[arXiv:2506.18123](https://arxiv.org/html/2506.18123v2)）提出分布式真机评测。
4. **失败模式归因（新，与「拟人化」最相关）**：Why Reasoning Fails to Plan: A Planning-Centric Analysis of Long-Horizon Decision Making in LLM Agents（2026，[arXiv:2601.22311](https://arxiv.org/abs/2601.22311)）提出 Trap@1、首次错误步、首错后恢复率等指标，指出 LLM agent 短程推理强、长程规划弱，且首个错误常常不可恢复；What Are We Actually Benchmarking in Robot Manipulation?（[arXiv:2606.04233](https://arxiv.org/html/2606.04233v1)）对基准本身做审计。

## 7. 最前沿（逐条标注是否 2025 后新出）

1. **VLA 的 RL 后训练在 2025 年密集爆发（全为新）**：RIPT-VLA（[arXiv:2505.17016](https://arxiv.org/pdf/2505.17016)）、CO-RFT 分块离线 RL 微调（[arXiv:2508.02219](https://arxiv.org/html/2508.02219)）、VLA-RFT（[arXiv:2510.00406](https://arxiv.org/pdf/2510.00406)）、flow-matching 策略的强化微调（[arXiv:2510.09976](https://arxiv.org/abs/2510.09976v1)）、π_RL 在线 RL 微调（[arXiv:2510.25889](https://arxiv.org/html/2510.25889)）、RobustVLA 鲁棒性感知后训练（[arXiv:2511.01331](https://arxiv.org/pdf/2511.01331)）。
2. **通用机器人基座（新）**：Gemini Robotics 1.5（Google DeepMind，2025，[arXiv:2510.03342](https://arxiv.org/html/2510.03342v3)）强调具身推理、显式思考与动作迁移；GR00T N1.5（NVIDIA，2025，[官方页](https://research.nvidia.com/labs/gear/gr00t-n1_5)）为开放人形基座。
3. **Scaling 规律（新）**：Data Scaling Laws in Imitation Learning for Robotic Manipulation（ICLR 2025，[arXiv:2410.18647](https://www.alphaxiv.org/abs/2410.18647)）——数据多样性的主导因素是**环境数与物体数**，而非单纯演示条数，修正了「堆演示」路线。
4. **不确定环境中完成复杂任务的代表工作（新）**：Embodied large language models enable robots to complete complex tasks in unpredictable environments（Nature Machine Intelligence，2025-03，DOI [10.1038/s42256-025-01005-x](https://www.nature.com/articles/s42256-025-01005-x)，University of Edinburgh）——把 LLM 作为具身推理核心应对不可预测场景。

## a) 与人类任务流程的对照表

| 模块 | 人类机制 | 具身智能对应工作 | 机器人做得好 | 机器人做得差 |
|---|---|---|---|---|
| 感知 | 多模态感官融合 + 常识补全 | RT-2 / OpenVLA 端到端视觉-语言-动作 | 静态场景物体识别与指令 grounding | 触觉/力觉缺失、遮挡与动态场景、跨本体迁移 |
| 记忆检索 | 情景记忆 + 语义记忆分层，有遗忘与巩固 | Generative Agents 记忆流、ReMEmbR、HIMM | 最近若干条记忆的检索与回放 | 长时程巩固、主动遗忘、跨任务抽象（技能库与策略权重未打通） |
| 规划判断 | 层级分解 + 直觉式可行性判断 | SayCan、Text2Motion、LLM+P（PDDL） | 短时程、步骤清晰的任务分解 | 长时程首个错误常不可恢复（arXiv:2601.22311）；物理可行性判断弱 |
| 行动 | 精细运动控制 + 在线补偿 | Diffusion Policy、ACT/ALOHA、π0 flow matching | 单一任务精细操作、动作分块 | 双臂/灵巧手长序列、失败后重试与在线恢复 |
| 反思纠错 | 内省 + 从错误中快速学习 | Reflexion、Self-Refine、Yell At Your Robot | 单任务失败复盘、口头纠正后即时改进 | 跨任务/长时程的错误归因与恢复 |
| 学习固化 | 睡眠巩固，技能自动化 | Voyager 技能库、RoboCat 自改进、睡眠式蒸馏（本仓） | 技能以可执行代码形式复用 | 无统一巩固机制；经验→权重的闭环尚未形成 |

## b) 可直接复用的开源资源清单（均为本次核验链接）

| 名称 | 链接 | 一句话用途 |
|---|---|---|
| OpenVLA | https://github.com/openvla/openvla | 开源 7B VLA，可 LoRA 微调做机器人操作 |
| Open X-Embodiment | https://github.com/google-deepmind/open_x_embodiment | 22 种本体的统一格式机器人数据集 |
| SimplerEnv | https://github.com/simpler-env/SimplerEnv | 仿真中复现真机策略排序，降低成本 |
| LIBERO | https://github.com/Lifelong-Robot-Learning/LIBERO | 终身学习/知识迁移操作基准 |
| CALVIN | https://github.com/mees/calvin | 长时程语言条件操作基准 |
| BEHAVIOR-1K | https://behavior.stanford.edu/ | 1000 项日常活动具身基准 |
| Voyager | https://github.com/MineDojo/Voyager | 技能库 + 迭代提示的开放式 agent 范式 |
| Reflexion | https://github.com/noahshinn/reflexion | 语言化自我反思的参考实现 |
| generative_agents | https://github.com/joonspk-research/generative_agents | 记忆流 + 三因子检索 + 反思架构 |
| dreamerv3 | https://github.com/danijar/dreamerv3 | 世界模型（DreamerV3）参考实现 |
| Octo（项目页） | https://octo-models.github.io/ | 开源通用机器人策略（GitHub 仓库本次未核验） |
| VLA 综述论文清单 | https://github.com/JiuTian-VL/Large-VLM-based-VLA-for-Robotic-Manipulation | 2508.13073 配套论文清单 |
| Awesome-Memory-for-Robotics | https://github.com/Everloom-129/Awesome-Memory-for-Robotics | 机器人记忆方向阅读列表 |
| Agent-Memory-Paper-List | https://github.com/Shichun-Liu/Agent-Memory-Paper-List | LLM agent 记忆论文清单 |
| Data-Scaling-Laws | https://github.com/Fanqi-Lin/Data-Scaling-Laws | 机器人模仿学习数据 scaling law 实现 |

## 未检索到 / 待补

- arXiv:2507.10672（任务书点名）——零命中，未核实。
- Habitat、RLBench 的一手 arXiv 编号——未取得。
- AI2-THOR 独立编号——未单独核验（仅经 ALFRED 论文确认其为底层仿真器）。
