# 比赛属性设计入口

最新运动参数与检查见[PHYSICAL_MOTION_V061.md](../packages/shared/modules/matches/design/PHYSICAL_MOTION_V061.md)：属性驱动的实际跑速、有限加减速、异常碰撞保护、二次空气阻力与显式草阻、同步传球/接球预测。完整90分钟及双观看入口契约见[CONTINUITY_AND_WATCHING_V3.md](../packages/shared/modules/matches/design/CONTINUITY_AND_WATCHING_V3.md)。以下各版本用于追溯，不能用旧速度参数覆盖新引擎。

2026-10-17用户仅批准测试文件并行4、CI触发去重两项流程调整，批准范围见根AGENTS.md；其他流程优化仍须另行批准。

用户于2026-10-16明确回复“批准 v1 的 A/B/C 并上线”。原审批稿见 [PLAYER_MATCH_MODEL_V1.md](../packages/shared/modules/matches/design/PLAYER_MATCH_MODEL_V1.md)。

当前0.4.0实现与数学边界见 [APPROVED_V1_PHYSICAL.md](../packages/shared/modules/matches/design/APPROVED_V1_PHYSICAL.md)。A采用分层行动、局部对抗和30项能力；保留用户后来明确要求的Rapier真实球轨迹，不启用原稿两次概率抽签生成进球。B实施封顶心理、人格分工及适应度。C实施传控带射、头球、门将、体能、基本越位/犯规/红黄牌/任意球/点球与物理点球大战；互动及粉丝消费仍另案。

[PHYSICAL_ENGINE_V1.md](../packages/shared/modules/matches/design/PHYSICAL_ENGINE_V1.md)保留0.3.0物理架构和旧参数说明。历史回放读取原轨迹，不以新版本重算。开发流程不变。

0.5.0依据用户反馈调整速度、接触体积和独立决策。当前参数见[TEMPO_AND_DECISIONS_V2.md](../packages/shared/modules/matches/design/TEMPO_AND_DECISIONS_V2.md)；v1心理与规则边界保留，旧回放不重算。
