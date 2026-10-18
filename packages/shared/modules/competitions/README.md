# 赛事模块

验证按[分层规则](../../../../docs/VALIDATION.md)：普通杯赛资格准备使用明确开放轮次，重大推进/结算/跨季变更验证完整14轮业务赛季。受控报告只替换测试中的比赛计算，生产计划/结算不替换；同时修改比赛算法才计算完整物理赛季。

职责：双循环赛程、积分、联赛推进、杯赛和赛季切换。

公共入口：index.mjs。schedule、standings、advance、cup、newSeason。

边界：晋级与奖金只能结算一次。每轮游戏日推进七天，下赛季从下一年 7 月 1 日开始；年龄通过 players 接口更新，不再直接加一。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。

浏览器只读入口：selectors/index.mjs（schedule/standings，无物理依赖）。规则编排仍从index.mjs调用，不得从浏览器导入会加载Rapier的服务端入口。模拟所有场次，只给本队保存轨迹，避免无用内存与磁盘开销。

AI球员同样通过matches.settleClubPlayers → players公共接口结算体能、出场与进球；本队只由finishMatch结算一次。全体球队沿用联赛轮末+8恢复，杯赛不另送恢复。禁止跳过AI消耗形成隐性优势。

0.4.0注意：日期推进统一调用球员适应度；杯赛使用比赛模块knockout物理点球，不再掷币决胜，不重复统计常规进球。AI和本队使用同公式。

## 0.6.0 注意事项

新增createCompetitionPlan/settleCompetition：固定各场种子和输入，优先计算本队，其他场次顺序不影响随机；全轮报告齐备才统一结算体能、积分、收入和工资。同步advance/cup沿用同一计划与结算接口。注意本队先结束属于临时结果，不能提前写入积分/资金；拒绝缺场、重复或不匹配的报告。

开发流程保持原样；本次只更改产品和运行实现。
同步兼容入口要保留调用方持有的球员/俱乐部对象引用，不能直接用整份克隆替换后让外部引用失效；createCompetitionPlan/settleCompetition仍按隔离输入/返回DTO工作。

## 0.7.0 · 2026-10-18

领域createCompetitionPlan/settleCompetition未改。HTTP由服务端延迟调用结算：本队5×播放终场且全轮报告齐全才统一提交；不能在AI计算完成时提前公布积分/现金/球员变化。同步兼容接口仍立即返回，不能用它绕过HTTP任务的播放门槛。

观看与恢复契约：packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md；入口在根PROJECT.md。改动同步本模块记录，遵守已批准的分层验证；开发流程不变。
