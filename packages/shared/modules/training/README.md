# 训练模块

职责：全队训练次数、费用与训练意图校验。

公共入口：index.mjs。train。

边界：每轮最多两次，每次 6000；能力成长逻辑调用 players.trainPlayer，不复制其公式。前端对应 packages/client/src/modules/training。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。
