# 球员比赛影响与物理引擎

依据用户后续要求重做为物理比赛，当前实现与逐项数学说明位于 [比赛模块 design/PHYSICAL_ENGINE_V1.md](../packages/shared/modules/matches/design/PHYSICAL_ENGINE_V1.md)。

30项能力分别影响移动、目标选择、瞄准误差和真实接触。比分由轨迹越线决定；不采用旧稿的伯努利进球概率。数值仍为游戏参数，尚非真实足球数据拟合。

原 [PLAYER_MATCH_MODEL_V1.md](../packages/shared/modules/matches/design/PLAYER_MATCH_MODEL_V1.md)保留为未批准历史方案，其心理、随机事件和犯规规则没有整体启用。既有开发流程未改。
