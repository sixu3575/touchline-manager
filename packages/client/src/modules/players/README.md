# 球员界面模块

0.12.0当前规则见[共享设计](../../../../shared/modules/players/ASSESSMENT.md)：六项概览与区间评估取代旧版全部细项直接显示；技术模板保留服务器，客户端不再收到attributes。GET不写数据，原能力和引擎不改。兼容skills/potential/weakFoot为评估中点，未知不是零；界面只提交意图。后续属性变化同时更新属性审计与决策参考第9节。

0.11.0详情页展示可选attributeProfile的技术偏向，名称来自players公共入口SPECIALISMS；历史球员缺字段不显示该标签，所有能力条仍读取attributes。

公共入口 index.ts：Squad、Scouting、PlayerDetails 和 Player 类型。模块内包含球员表格、球探卡、档案、展示函数与 pm- 前缀样式。界面只展示权威存档并提交签约意图，属性定义来自 shared/modules/players 公共目录。不得在此复制成长或比赛公式。

每次开发更新本目录 CHANGELOG.md。业务与迁移注意事项见 shared/modules/players/README.md、docs/PLAYERS.md 与 docs/DATA.md。

0.4.0注意：球员详情展示适应度，说明士气/信心/适应只小幅影响镇定与决策；旧快照缺值展示100。
