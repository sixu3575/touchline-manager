# 球员模块

职责：球员身份、30 项细分能力、六项兼容摘要、评级、长期性格、短期状态、公众形象、训练成长与比赛后的球员结算。

公共入口：index.mjs。player、squad、rating、skillSummary、ageOn、migratePlayer、trainPlayer、settlePlayerMatch、recoverPlayer、joinClub、resetForSeason、updateAges 及展示目录。

边界：球员字段新增和变更优先在本目录实现；客户端对应 packages/client/src/modules/players。skills 是 attributes 的派生兼容缓存，改变细项后必须刷新；不能让其他模块直接修改球员能力、性格或状态。旧回放允许只有六项 skills，rating 必须保留兼容。国籍不参与能力计算。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。

0.3.0比赛结算的energy为可选有限数值，范围仍受20–100约束；没有此字段时保留旧扣体能规则。比赛模块只返回消耗结果，由本模块写回。细项在物理比赛中的作用详见matches/design/PHYSICAL_ENGINE_V1.md。

0.4.0注意：新增match-state纯计算入口，封顶心理、分组体能、日期适应与赛内冲击；签约适应70，旧档100。结算接收mind与assists，评分不再读取球衣号随机。不得把临时matchState写入长期球员或重复结算心理。
