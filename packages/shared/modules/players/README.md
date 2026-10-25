# 球员模块

当前比赛体能按实际位移、冲刺启动和身体接触对抗累计（引擎`0.40.0-workload-fatigue` / 参数`workload-fatigue-1`）；耐力/力量影响体能容量、能耗经济性与赛后按天恢复。疲劳影响有效身体/技术能力与持续跑动。`physiology.mjs`从裸力量/耐力计算体能参数，临时matchState缓存不得出站。`recoverPlayer(p, days=7)`接收游戏天数，0天不恢复，同一时间段只应用一次。已结算回放、旧fitness与历史比赛保留。赛内/轮间公式和实测限制见[个人工作量与恢复设计](../matches/design/MATCH_WORKLOAD_V0400.md)、[早期体能模型](../matches/design/PHYSIOLOGY_V0290.md)和[持续疲劳校准历史](../matches/design/MATCH_FATIGUE_CALIBRATION_V0350.md)。

99号观察球员免费签入但按综合能力支付轮薪；修复已有零工资存档只能通过`packages/server/src/maintenance/player-profiles.mjs`显式离线维护计划执行，服务启动与HTTP读取不会自动改数据。精确观察门槛和一季14轮保证见[ASSESSMENT.md](ASSESSMENT.md)。

0.15.0新增development.mjs：私有真实峰值/日期衰退/整数成长；对外ensurePlayerDevelopment/trainAssignedPlayer/updateAges，细项变化刷新skills。assessment专项证据与已确认峰值独立保存，不得读取私有峰值当公开认识。当前训练/年龄契约见[训练生涯](../training/TRAINING_AND_CAREERS_V0150.md)。

0.14.0新增无球/决策的空位选择、无球/灵活与盯防观察博弈，盯人/预判/专注维护观察记忆，决策/预判支持接球预观察。30项长期能力与卡片/整数/知识机制不变，消费者见ATTRIBUTE_AUDIT.md；没有给球风标签隐藏倍率。

0.13.0后续展示调整：取消评估综合，公开服务端按原位置评级计算的实际总能力值overall；一线队同一列展示总能力与六维雷达图，默认按总能力降序，各表头可切换升降序（出场/进球分列）。细项按六项主属性归类，外场门将专项/门将其他进攻技术折叠补充，并明确不计入对应概览；30项各出现一次。分组不改变汇总权重或比赛算法，细项区间及教练/球探机制保留，自动排阵继续使用已知区间。

0.13.0当前精度见[INTEGER_STATS.md](INTEGER_STATS.md)：attributes/skills为整数，训练未满1点的成长用私有整数经验累计；公开区间/兼容评估取整，赛内有效能力仍连续计算。现有球员仅显式四舍五入，不重塑技术特点/历史。以后属性/训练精度变化同次维护该契约与决策图。

0.12.0当前规则见[ASSESSMENT.md](ASSESSMENT.md)：六项概览与区间评估取代旧版全部细项直接显示；技术模板保留服务器，客户端不再收到attributes。GET不写数据，原能力和引擎不改。兼容skills/potential/weakFoot为评估中点，未知不是零；界面只提交意图。后续属性变化同时更新属性审计与决策参考第9节。

0.11.0分布设计见[ATTRIBUTE_PROFILES.md](ATTRIBUTE_PROFILES.md)。profiles.mjs是纯能力分配，SPECIALISMS仅解释来源；reprofilePlayer显式一次重塑、observationPlayer仅返回指定观察球员，不会自动给所有存档发放。历史六项迁移migratePlayer仍兼容，服务启动不重抽。

验证按[分层规则](../../../../docs/VALIDATION.md)：生日直接构造换季边界，性格/训练/迁移使用明确标记的测试报告；真实有效能力与跑动由比赛专项覆盖。普通球员业务修补不为准备状态计算完整比赛；相关源码/默认数据变更须核对并更新决策参考图。

职责：球员身份、30 项细分能力、六项兼容摘要、评级、长期性格、短期状态、公众形象、训练成长与比赛后的球员结算。

公共入口：index.mjs。player、squad、rating、skillSummary、ageOn、migratePlayer、trainPlayer、settlePlayerMatch、recoverPlayer、joinClub、resetForSeason、updateAges 及展示目录。

边界：球员字段新增和变更优先在本目录实现；客户端对应 packages/client/src/modules/players。skills 是 attributes 的派生兼容缓存，改变细项后必须刷新；不能让其他模块直接修改球员能力、性格或状态。旧回放允许只有六项 skills，rating 必须保留兼容。国籍不参与能力计算。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。

比赛结算的energy为可选有限数值，0.29起范围为0–100（0.3旧版为20–100）；没有此字段时保留旧扣体能规则。比赛模块只返回消耗结果，由本模块写回。当前体能公式见matches/design/PHYSIOLOGY_V0290.md；最初物理细项设计保留在PHYSICAL_ENGINE_V1.md。

0.4.0注意：新增match-state纯计算入口，封顶心理、分组体能、日期适应与赛内冲击；签约适应70，旧档100。结算接收mind与assists，评分不再读取球衣号随机。不得把临时matchState写入长期球员或重复结算心理。

0.4公共计算：createMatchState(p)、effectiveAbility(p,key)、mentalModifier(state)、matchShock(p,morale,confidence,leadership)、energyCost(p,speed,press,live,dt)、advanceAdaptation(game,days)。matchState仅存在于比赛复制的球员上；报告只回传mind与energy，由settlePlayerMatch写回长期状态。
