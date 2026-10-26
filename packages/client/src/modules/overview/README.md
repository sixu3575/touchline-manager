# Overview 界面模块

场景Overview使用courtyard.css和CLUB_OBJECTS百分比定位原生按钮。实际资金/积分不烘焙进底图；手机仅院子容器横向探索，比赛按钮和导航热区分离。见docs/IMMERSIVE_UI.md。

比赛日主视觉复用公共 StadiumIllustration 与 players 的 PlayerPortrait，三名首发人物均从现有存档读取，装饰图不计算比赛或改变球员。

公共入口 index.ts 的 Overview。只展示存档并提交意图；规则由对应 shared/modules/ 目录维护。页面私有改动在本目录完成，新增样式使用模块专属文件/类名前缀；公共 ui 和全站样式交由 integration 维护。每次修改更新本目录 CHANGELOG.md；开发流程不变。

0.3.0只从shared/modules/competitions/selectors/index.mjs读取积分，不把Rapier和比赛编排带进浏览器。

## 0.7.0 · 2026-10-18

总览复用competitions/AdvanceButton的单一开赛并5×观看入口；本轮播放结束前维持赛前资金/积分，页面上方全局比赛卡持续显示当前进度。总览本身不持有时钟或计算比赛。

观看与恢复契约：packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md；入口在根PROJECT.md。改动同步本模块记录，遵守已批准的分层验证；开发流程不变。

2026-10-27：院子使用club-courtyard-cartoon-v2.webp；新增物件需沿现有粗墨线/平涂样式，核对navigation.mjs热区。
