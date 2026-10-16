# 赛事模块

职责：双循环赛程、积分、联赛推进、杯赛和赛季切换。

公共入口：index.mjs。schedule、standings、advance、cup、newSeason。

边界：晋级与奖金只能结算一次。每轮游戏日推进七天，下赛季从下一年 7 月 1 日开始；年龄通过 players 接口更新，不再直接加一。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。

浏览器只读入口：selectors/index.mjs（schedule/standings，无物理依赖）。规则编排仍从index.mjs调用，不得从浏览器导入会加载Rapier的服务端入口。模拟所有场次，只给本队保存轨迹，避免无用内存与磁盘开销。

AI球员同样通过matches.settleClubPlayers → players公共接口结算体能、出场与进球；本队只由finishMatch结算一次。全体球队沿用联赛轮末+8恢复，杯赛不另送恢复。禁止跳过AI消耗形成隐性优势。
