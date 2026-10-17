# 项目地图

版本 0.6.1。低成本、可持续扩展的足球经理游戏；当前为独立存档的 AI 联赛。

当前球员跑位/接球/传带射和球风决策图： [PLAYER_DECISION_MAP.md](packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)。按0.6.1实际代码归档，六图节点含触发数值、概率类别和属性影响，配可放大SVG、30能力/8性格等完整实战索引；按用户要求用相关性说明，不列公式。相关算法或固定数据修改须同次同步更新，维护范围见其第8节及AGENTS.md。

当前开发验证采用用户2026-10-17最新批准的[分层规则](docs/VALIDATION.md)：日常冒烟与针对性测试，仅比赛算法变化模拟真实比赛，重大流程验证完整业务赛季；二者同时变化才计算物理赛季。先前纯文档例外保留为历史，授权见AGENTS.md。

最新速度/阻力检查与数学：packages/shared/modules/matches/design/PHYSICAL_MOTION_V061.md。统一传球预测和真实减速，旧回放不重算；当前验证规则见docs/VALIDATION.md。

当前连续攻防、完整90分钟和双观看入口契约：packages/shared/modules/matches/design/CONTINUITY_AND_WATCHING_V3.md。用户已批准，旧报告仍按原版本读取；开发流程保持原样。

## 代码职责

- packages/shared/modules/：players 球员、tactics 战术、matches 比赛、competitions 赛事、training 训练、transfers 转会、stadium 球场、economy 财务、club 俱乐部、world 初始化。各自 index.mjs、README.md 和 CHANGELOG.md。
- packages/shared/core/：确定性随机、数值和游戏日期；game.mjs：兼容接口与动作编排。
- packages/client/src/modules/players/：球员类型、名单、球探、详情和样式；modules/training/：训练页。modules/overview、tactics、matches、competitions、stadium、economy 分别维护其页面；main.tsx 只组合导航、会话与公共弹层，旧 pages/components 路径保留兼容导出。
- packages/server/src/：HTTP、会话、事务与 SQLite；storage/：版本迁移。
- modules.json：模块路径与依赖；scripts/collaboration.mjs：可选协作保护；tests/：行为与边界验证。
- deploy/：现有 systemd/Caddy 部署；docs/：领域契约和运维。

## 开工阅读

AGENTS.md → 本文件 → docs/VALIDATION.md → 对应模块 README/CHANGELOG，再按需阅读 docs/PLAYERS.md、GAMEPLAY.md、DATA.md、ARCHITECTURE.md、COLLABORATION.md、CONTRIBUTING.md、OPERATIONS.md。

执行已批准的分层验证；进一步流程优化须先得到用户批准。完整账号、HTTPS、真人 PvP、球员互动和粉丝商品仍是后续功能。

当前属性与规则入口：docs/PLAYER_MATCH_DESIGN.md → matches/design/PHYSICAL_MOTION_V061.md（最新运动参数）及CONTINUITY_AND_WATCHING_V3.md（完整比赛/观看契约）。v1 A/B/C心理与基础裁判边界保留，进球依照真实轨迹；授权范围见根AGENTS的最新记录。
