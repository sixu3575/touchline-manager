# 比赛属性设计入口

0.8.2入网/进球提示以[GOAL_NET_V082.md](../packages/shared/modules/matches/design/GOAL_NET_V082.md)为准，决策总览O9/SVG和来源摘要同步；属性与传带射候选沿用0.8.0，球网耗能、顶网和进球后15秒重开是本次物理变化。

当前实现的可视化入口：[球员无球跑动与接球决策图](../packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)。已随0.8.0持球选择核对，六图直接写候选门槛、概率类别、影响属性及方向，正文覆盖30能力、8性格及其他数据的实战效果；按用户要求不列公式，区分位置职责、动态职责、球风展示与真实评分影响。最新带球/突破数学见[CARRYING_V080.md](../packages/shared/modules/matches/design/CARRYING_V080.md)。后续相关算法/固定数据改动须同次更新该图、SVG和源码摘要，维护映射见该文第8节；既定分层验证和发布流程不改。

最新运动参数与检查见[PHYSICAL_MOTION_V061.md](../packages/shared/modules/matches/design/PHYSICAL_MOTION_V061.md)：属性驱动的实际跑速、有限加减速、异常碰撞保护、二次空气阻力与显式草阻、同步传球/接球预测。完整90分钟及双观看入口契约见[CONTINUITY_AND_WATCHING_V3.md](../packages/shared/modules/matches/design/CONTINUITY_AND_WATCHING_V3.md)。以下各版本用于追溯，不能用旧速度参数覆盖新引擎。

2026-10-17最新授权已批准[分层验证](VALIDATION.md)：算法变化执行真实比赛，重大流程变化执行业务赛季，二者同时变化再计算完整物理赛季。日常修补使用冒烟与针对性测试；进一步流程调整仍须批准，完整授权见根AGENTS.md。

用户于2026-10-16明确回复“批准 v1 的 A/B/C 并上线”。原审批稿见 [PLAYER_MATCH_MODEL_V1.md](../packages/shared/modules/matches/design/PLAYER_MATCH_MODEL_V1.md)。

当前0.4.0实现与数学边界见 [APPROVED_V1_PHYSICAL.md](../packages/shared/modules/matches/design/APPROVED_V1_PHYSICAL.md)。A采用分层行动、局部对抗和30项能力；保留用户后来明确要求的Rapier真实球轨迹，不启用原稿两次概率抽签生成进球。B实施封顶心理、人格分工及适应度。C实施传控带射、头球、门将、体能、基本越位/犯规/红黄牌/任意球/点球与物理点球大战；互动及粉丝消费仍另案。

[PHYSICAL_ENGINE_V1.md](../packages/shared/modules/matches/design/PHYSICAL_ENGINE_V1.md)保留0.3.0物理架构和旧参数说明。历史回放读取原轨迹，不以新版本重算。开发流程不变。

0.5.0依据用户反馈调整速度、接触体积和独立决策。当前参数见[TEMPO_AND_DECISIONS_V2.md](../packages/shared/modules/matches/design/TEMPO_AND_DECISIONS_V2.md)；v1心理与规则边界保留，旧回放不重算。
