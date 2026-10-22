# 项目地图

0.30.0动作统计与评分入口见[matches设计](packages/shared/modules/matches/design/STATISTICS_V0300.md)。statistics.mjs独立观察已执行动作，ratings/statistics.mjs是客户端/评分共用的只读时钟裁切；新比赛使用opta-conventional-2/match-rating-3。物理/战术/体能仍沿0.29，历史评分不覆盖，四场并发保持关闭。

0.29.0候选见[体能完整公式](packages/shared/modules/matches/design/PHYSIOLOGY_V0290.md)：players/physiology维护力量/耐力参数，match-state管理持续能量，matches/activity管理短时负荷/肾上腺素/半场，locomotion执行疲劳跑动，competitions在下一场冻结输入中恢复经过的7日。保持30项能力、0–100体能条与逐场调度；历史不重算。本次按原规则执行比赛和完整赛季，流程不改。

0.28本次只发布[底线控球修复](packages/shared/modules/matches/design/BOUNDARY_V0280.md)，引擎0.28.0-boundary / boundary-1，其他算法与任务结构沿用0.27。用户在[现机四场容量未过](packages/server/src/design/CAPACITY_V0280_20261020.md)后选择保留现机、先修底线，四场暂不开启。并发候选另行保留；不要把方案或候选状态当作生产已启用。

0.27.0系统重构见[控球与节奏模型](packages/shared/modules/matches/design/CONTROL_MODEL_V0270.md)：持球感知与重复脚触分离，统一保球/传/带/射的后续机会价值；身体跟随滚动球准备，脚部连续摆动，实际触球后确认控球；防线阵块/交接与压迫速度跟随；团队阶段不再按散球超时切断。数学、原始根因、现实样本口径和未解决偏差归档，七张决策图同步。新onball/opportunity仅为matches内部模块，无新运行依赖、schema迁移或开发流程变更；历史回放不重算。以下为历史版本记录。

当前待发布候选0.25.0基于0.20控球/转换状态分离，修改带球脚触冲量：按沿路线跑速推球，盘带越高额外前送越小；球员跑速、传带射选择、传射参数、接触形状与控球宽限不变。固定八场中带球脱控均值191.38→118次，成功传球链1.76→2.12，每队传球664.75→806.5；控球阶段中位数仅5.06→5.29秒，约48%仍短于5秒，因此问题未解决。八场均review、无block。细节见[POSSESSION_V0250.md](packages/shared/modules/matches/design/POSSESSION_V0250.md)与[matches节奏诊断](packages/shared/modules/matches/design/TEMPO_V0180.md)。

0.17.0按用户纠正将节奏修正放在连续转身/支撑摆腿/收腿执行，撤回0.16新增的射门抑制。合理远射和提前准备的一脚传射保留，不用整场统计反馈决策。用户在获知专项现实性block后明确授权上线本版本；block仍记录为未通过，后续版本继续遵循原门槛。入口[EXECUTION_V0170.md](packages/shared/modules/matches/design/EXECUTION_V0170.md)，[当前验证/阻断](packages/shared/modules/matches/design/CALIBRATION_V0170.md)；旧回放、5×和既有分层/PR/发布流程保持。

0.16实施获批的比赛现实性整改：独立里程/五区测量、团队过渡与近身争抢、防线保护与跟速、短时冲刺恢复、护球/射门准备和散布、门将扑救平面。[实现与校准](packages/shared/modules/matches/design/REALISM_V0160.md)，引擎0.16.0-realism/realism-1；旧回放不重算。历史[审查](packages/shared/modules/matches/design/REALISM_AUDIT_20261019.md)和[现实对照规范](packages/shared/modules/matches/design/REALISM_VALIDATION.md)保留；新增规则只对新比赛生效。

0.15.1统计归属由matches/attribution.mjs维护，physics/projectedGoal以独立无球员Rapier世界检查触球前球路；助攻沿连续控球来源，shotId/shotOutcome驱动常规关键传球与评分，不按最后触球者直接判乌龙。当前引擎0.15.1-attribution/movement-1，统计opta-conventional-1、评分match-rating-2。设计与现实来源见[统计归属](packages/shared/modules/matches/design/STATISTICS_V0151.md)，第1/4决策图已同步。历史不重算，开发流程不改。

0.15.0新增独立staff模块，training负责七区场地/分配/每轮训练，players/development负责日期衰退与整数成长，competitions在冻结轮次应用并统一发布；所有比赛战报归档、他队无回放。设计与未实现项见[训练与生涯](packages/shared/modules/training/TRAINING_AND_CAREERS_V0150.md)。既有模块锁、验证分层、PR与部署流程不改。

0.14.0新增连续领球与近控/快带、共享到达预测、有限候选空位选择及有条件的盯防观察失误，死球自然移动、进球庆祝后跑回开球位。引擎0.14.0-movement/movement-1；既有球阻力、限速、真实触球、5×、结算及评分保持。详见[运动设计](packages/shared/modules/matches/design/MOVEMENT_V0140.md)。

0.13.0后续展示调整：取消评估综合，公开服务端按原位置评级计算的实际总能力值overall；一线队同一列展示总能力与六维雷达图，默认按总能力降序，各表头可切换升降序（出场/进球分列）。细项按六项主属性归类，外场门将专项/门将其他进攻技术折叠补充，并明确不计入对应概览；30项各出现一次。分组不改变汇总权重或比赛算法，细项区间及教练/球探机制保留，自动排阵继续使用已知区间。

0.13.0当前球员能力改为1–100整数，训练经验整数累计满100点再提升1点能力；评估和状态面板同步取整，物理/概率/评分保持原精度。现有球员只显式四舍五入，不随机重塑或改历史。规则见[INTEGER_STATS.md](packages/shared/modules/players/INTEGER_STATS.md)。

0.12.0新增六项公开卡片、教练/球探观察与区间评估；30项真实能力仍只在服务器参与比赛。文档见[ASSESSMENT.md](packages/shared/modules/players/ASSESSMENT.md)、[属性审计与搁置清单](packages/shared/modules/players/ATTRIBUTE_AUDIT.md)及决策参考第9节。旧数据/历史不重抽；新可选知识契约执行业务赛季验证，未改变比赛算法，不模拟物理比赛。

0.11.0球员技术特点采用位置预算、技术偏向与相关随机差异；球员详情展示分配模板。旧球员通过显式离线维护只重分配一次，原六项预算/生涯/历史保留。指定用户获得99号林曜综合95的观察名额；没有强制比分或评分。设计见[ATTRIBUTE_PROFILES.md](packages/shared/modules/players/ATTRIBUTE_PROFILES.md)，原引擎/评分/开发流程不变。

版本 0.14.0（比赛引擎0.14.0-movement）。低成本、可持续扩展的足球经理游戏；当前为独立存档的 AI 联赛。“赛程与杯赛”新增独立赛后战报入口，不打开回放即可查阅球队统计、全场事件和[赛后评分](packages/shared/modules/matches/ratings/README.md)。保留[入网与进球展示](packages/shared/modules/matches/design/GOAL_NET_V082.md)、关键/其他事件、持球选择、播放修复、五倍速与终场发布门槛。

当前球员跑位/接球/传带射和球风决策图： [PLAYER_DECISION_MAP.md](packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)。已随0.10.0战术阶段、位置协同和传中机会算法同步，六图节点含触发数值、概率类别和属性影响，配可放大SVG、30能力/8性格等完整实战索引；按用户要求用相关性说明，不列公式。相关算法或固定数据修改须同次同步更新，维护范围见其第8节及AGENTS.md。

当前开发验证采用用户2026-10-17最新批准的[分层规则](docs/VALIDATION.md)：日常冒烟与针对性测试，仅比赛算法变化模拟真实比赛，重大流程验证完整业务赛季；二者同时变化才计算物理赛季。先前纯文档例外保留为历史，授权见AGENTS.md。

最新速度/阻力检查与数学：packages/shared/modules/matches/design/PHYSICAL_MOTION_V061.md。统一传球预测和真实减速，旧回放不重算；当前验证规则见docs/VALIDATION.md。

当前观看与结算契约：[LIVE_BROADCAST_V070.md](packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md)。单一开赛入口、服务端5×时钟、退出后继续、首段流式观看、终场后统一发布；取代V3的双观看入口与12×默认。V3的连续攻防与完整90分钟算法保留，旧报告仍按原版本读取；开发流程保持原样。

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
