# 战术模块

0.47.1候选的[FC/FM复核](../matches/design/FC_FM_CALIBRATION_V0471.md)将深处后腰/中前卫改为前方分层接应，25–55米球纵深间平滑转为前场球后保护，作用于所有风格，不给弱队保平概率。原四种战术与5-4-1枚举保持；强弱矩阵仍有block，未上线。

0.47候选新增5-4-1（1门将、5后卫、4中场、1前锋），赛前与临场管理板共同读取FORMATIONS。槽位为三中卫/两边卫、四中场和单锋；阵型本身不强制低压或反击。低压阵块、交接、反击出口及强弱测试状态见[五后卫设计](../matches/design/TACTICAL_BLOCKS_V0470.md)。当前仍有现实性阻断，未部署。

0.10.0公开tacticalPreset、formationSlot、positionRoleNames。presets.mjs只含纯配置，无物理/网络依赖；matches和战术板共同消费。槽位由同大位置首发顺序决定，不更改球员固有role或增加熟练度/编辑器；配置数值/导出连接变化都要求比赛专项。职责/数值与[决策参考](../matches/design/PLAYER_DECISION_MAP.md)及专项表同次维护，不改变既有开发流程。

职责：阵型目录、首发合法性、推荐首发与战术意图校验。

公共入口：index.mjs。FORMATIONS、bestLineup、validateLineup、saveTactics。

边界：推荐首发可读球员公开评级与体能，不改写球员数据。首发人数、位置与所有权验证必须由服务端执行。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。
