# 项目地图

版本 0.6.0。低成本、可持续扩展的足球经理游戏；当前为独立存档的 AI 联赛。

当前连续攻防、完整90分钟和双观看入口契约：packages/shared/modules/matches/design/CONTINUITY_AND_WATCHING_V3.md。用户已批准，旧报告仍按原版本读取；开发流程保持原样。

## 代码职责

- packages/shared/modules/：players 球员、tactics 战术、matches 比赛、competitions 赛事、training 训练、transfers 转会、stadium 球场、economy 财务、club 俱乐部、world 初始化。各自 index.mjs、README.md 和 CHANGELOG.md。
- packages/shared/core/：确定性随机、数值和游戏日期；game.mjs：兼容接口与动作编排。
- packages/client/src/modules/players/：球员类型、名单、球探、详情和样式；modules/training/：训练页。modules/overview、tactics、matches、competitions、stadium、economy 分别维护其页面；main.tsx 只组合导航、会话与公共弹层，旧 pages/components 路径保留兼容导出。
- packages/server/src/：HTTP、会话、事务与 SQLite；storage/：版本迁移。
- modules.json：模块路径与依赖；scripts/collaboration.mjs：可选协作保护；tests/：行为与边界验证。
- deploy/：现有 systemd/Caddy 部署；docs/：领域契约和运维。

## 开工阅读

AGENTS.md → 本文件 → 对应模块 README/CHANGELOG，再按需阅读 docs/PLAYERS.md、GAMEPLAY.md、DATA.md、ARCHITECTURE.md、COLLABORATION.md、CONTRIBUTING.md、OPERATIONS.md。

开发流程保持不变；任何流程优化须先得到用户批准。完整账号、HTTPS、真人 PvP、球员互动和粉丝商品仍是后续功能。

当前属性与规则入口：docs/PLAYER_MATCH_DESIGN.md → matches/design/TEMPO_AND_DECISIONS_V2.md。用户已批准v1的A/B/C，保留后续要求的真实物理进球，新增封顶心理与基础裁判；开发流程不变。
