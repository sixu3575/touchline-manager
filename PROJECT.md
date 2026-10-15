# 项目地图

版本 0.1.0。用户目标：低成本、可持续扩展的模拟经营足球游戏。当前发布验证完整单人经营循环，所有对手为 AI。

## 目录与职责

- packages/shared/game.mjs：球员生成、阵型合法性、比赛引擎、赛季、杯赛、训练、转会与财务规则。
- packages/server/src/index.mjs：HTTP、会话、请求校验、SQLite、原子存档与操作去重。
- packages/client/src/：React + TypeScript 界面。components/ 放置球场、回放、球员档案和基础 UI；pages/ 放置战术页面；model.ts 与 constants.ts 定义界面数据与展示约定。
- scripts/：备份、生产发布与验证；tests/：引擎与 API 行为测试。
- deploy/：systemd 与 Caddy 模板；docs/：以下约定与运维手册。

## 按任务阅读

- 玩法与数值：docs/GAMEPLAY.md
- 状态归属与边界：docs/ARCHITECTURE.md
- 存档与事务：docs/DATA.md
- 协作与检查：docs/CONTRIBUTING.md
- 上线、回滚、备份：docs/OPERATIONS.md

## 下一阶段

优先收集首版玩法反馈，完善比赛解释和球员成长，再加入正式账号与 HTTPS；真人 PvP 需要公共赛程、强隔离与反作弊，不能在当前独立世界上直接换个标签。
