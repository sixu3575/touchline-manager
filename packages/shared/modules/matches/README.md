# 比赛模块

职责：带版本的确定性比赛引擎、能力与战术影响、赛后收入和战报存储的编排。

公共入口：index.mjs。ENGINE_VERSION、simulate、finishMatch。

边界：不得依赖系统时间、随机全局源或网络。改变赛果算法需更新 ENGINE_VERSION；历史事件和快照不能重算。球员结算调用 players 公共接口，资金调用 economy。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。
