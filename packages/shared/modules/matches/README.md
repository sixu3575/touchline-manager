# 比赛模块

2026-10-19[现实性审查及待实施方案](design/REALISM_AUDIT_20261019.md)：0.14玩家14:7与0.15.1普通球队8场均值均异常，当前算法尚未修复。用户要求的[统计现实比较](design/REALISM_VALIDATION.md)已加入既有完整比赛验证，球队/球员两层输出，block阻断后续算法；普通修补不加模拟，不能引用0.6旧校准作为新版通过证据。

0.15.1当前引擎0.15.1-attribution/movement-1，统计opta-conventional-1：attribution.mjs维护进球/乌龙、连续传递与唯一射门结果；physics/projectedGoal用独立Rapier世界判断介入前球路，不能修改真实轨迹。新来源/接触集合必须随检查点保存，旧引擎任务先排空；旧报告不重算。定义、近似与边界见[STATISTICS_V0151.md](design/STATISTICS_V0151.md)。

0.14.0新增连续领球与近控/快带、共享到达预测、有限候选空位选择及有条件的盯防观察失误，死球自然移动、进球庆祝后跑回开球位。引擎0.14.0-movement/movement-1；既有球阻力、限速、真实触球、5×、结算及评分保持。详见[运动设计](design/MOVEMENT_V0140.md)。

0.11.0仅能力分配更新，赛内引擎/规则/评分公式仍0.10.0；来源与模板边界见决策第6图。观察球员按普通输入参与模拟，不能给他特殊射门、得分或评分倍率。

0.10.0历史算法：引擎0.10.0-tactical-roles/参数tactics-1，战术阶段与位置协同见[TACTICS_V0100.md](design/TACTICS_V0100.md)，六图见[PLAYER_DECISION_MAP.md](design/PLAYER_DECISION_MAP.md)。tactical-plan.mjs管理目标和机会估值，不绕过接球/追球/盯人或真实触球；角色不是隐藏能力。明确职责不能被通用前插/最近支援覆盖。反击时钟随continuity原样检查点保存、死球清除；禁止将队内传球刷新为新反击。三种传中仍计一次传球，setPiece区分运动战与角球。速度/球网/规则/播放/结算/评分权重保持；下方旧版本记录为历史。


0.9.0增加独立[赛后评分](ratings/README.md)，轻量公开入口ratings/index.mjs不导入比赛引擎，server保存与client展示共用；6.5基准、3–10分，按本场位置/事件/统计给出9类依据。评分不会回读影响决策/球员状态，物理引擎仍0.8.2-goal-net/goal-net-1。新报告保存版本，旧报告只读生成评分，不重演或改轨迹；既有分层验证仅冒烟/针对性，模拟与决策参考未变。

0.8.2球门与进球展示以[GOAL_NET_V082.md](design/GOAL_NET_V082.md)为准：后/侧/顶网仅与球碰撞，恢复0/Min、摩擦1/Max，门口开放、门柱弹性不变；进球后15比赛秒保留入网轨迹再重开。引擎0.8.2-goal-net/参数goal-net-1取代下方版本，带球参数/候选沿用0.8.0。新goal.scorer记录实际触球者号码姓名/side，乌龙归属不能计错；不重算旧回放，升级先排空旧引擎任务。

当前持球选择与数学以[design/CARRYING_V080.md](design/CARRYING_V080.md)为准：carrying.mjs独立管理空地推进/单防/协防与路线；decisions.mjs比较传带射并生成实际触球。ENGINE_VERSION=0.8.0-carrying，参数carrying-1。物理仍沿用0.6.1速度/阻力，旧回放不重算，升级前排空旧引擎任务。

当前实现的跑位与接球决策参考入口：[design/PLAYER_DECISION_MAP.md](design/PLAYER_DECISION_MAP.md)。六张Mermaid及SVG直接标明动态职责、跑位/接球/对抗/传带射的触发数值、条件概率类别与影响因子，正文逐项覆盖30能力、8性格及身份等数据的实战效果，不列公式；固定权重、评分、估计值和真实抽签明确区分。按用户2026-10-17要求，相关算法或固定数据改动必须同次更新图文、SVG与源码摘要，第8节列明文件对应；展示标签不代表独立专属决策树。当前检查按最新批准的[分层验证](../../../../docs/VALIDATION.md)执行，相关改动会核对参考摘要。

真实引擎检查在 `tests/match/`，只在比赛算法改动时执行；完整物理赛季还要求同时涉及重大流程。业务/冒烟显式预加载受控赛果，禁止真实simulation/physics入口；不能将其标记轨迹当作物理证据。本次持球算法改动执行真实比赛专项，赛历/结算不变，无完整赛季触发。

当前规则和数学参数见 [design/APPROVED_V1_PHYSICAL.md](design/APPROVED_V1_PHYSICAL.md)。用户已批准v1 A/B/C，保留真实物理进球；原概率赛果公式不启用。

职责：带版本的确定性比赛引擎、能力与战术影响、赛后收入和战报存储的编排。

公共入口：index.mjs。ENGINE_VERSION、simulate、finishMatch、settleClubPlayers（双方统一的球员结算，不写俱乐部收入）。

内部职责：physics.mjs 管 Rapier 世界、碰撞与触球冲量；agents.mjs 管战术目标/动作选择；simulation.mjs 管比赛状态、统计与轨迹编码。改战术无需改物理求解器，改回放无需重算赛果。

新增唯一外部领域依赖 @dimforge/rapier3d-compat，固定0.21.0。模块初始化一次加载WASM；simulate仍为同步、固定输入/种子的计算，不访问Node服务。浏览器不得导入本模块或game.mjs，回放只读服务端存储的轨迹。测试用短时选项不暴露给HTTP动作。

边界：不得依赖系统时间、随机全局源或网络。改变赛果算法需更新 ENGINE_VERSION；历史事件和快照不能重算。球员结算调用 players 公共接口，资金调用 economy。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。

0.4.0注意：实施已批准A/B/C并保留真实Rapier球轨迹。新增rules及shootout，分层动作质量、越位、近身犯规、纪律、自由球/点球、物理点球大战和助攻解释；退场不得再运动/碰撞。旧事件和轨迹不可重算。数学和简化边界见design/APPROVED_V1_PHYSICAL.md。

0.5.0注意：修复球撞自身/传感器滞后一帧；分离躯干/腿、有限抬脚与滚动角冲量。新增spatial/skills/locomotion/positioning/decisions，agents保留内部兼容导出。实现步行/慢跑/补位/冲刺/带球、角色职责、持续带球意图、球风与空间/拦截时间决策；防止过期意图和门将慢球死锁。新增motion/行为统计，不重算旧回放。

当前细节与参数以[design/TEMPO_AND_DECISIONS_V2.md](design/TEMPO_AND_DECISIONS_V2.md)为准；形状即时接触必须使用刚体当前位置+局部传感器偏移，不能退回上一帧intersectionPair。改变球速时必须验证自身体积、接球可达时间与人速的比例。teamRoles须传入当前物理时间，接球职责3.5秒后失效；跑动职责已判断进攻方，前插不依赖当前有人持球。

## 0.6.0 注意事项

分离稳定控制/飞行/争抢/死球与最后触球；新增receiving、continuity、checkpoint。重做距离相关传球力度、有限接触子步、接应/护球/一对一盯人、抢断恢复和失误原因。默认完整5400秒，静止死球只推进时钟/体能/采样；生成器供同步接口与持久任务共用。ENGINE_VERSION=0.6.0-continuity，参数continuity-1，事件3；旧回放不重算。注意快照只用相同引擎/参数/固定Rapier版本恢复，不能用新模型重抽旧任务。数学与确认范围见design/CONTINUITY_AND_WATCHING_V3.md。

开发流程保持原样；本次只更改产品和运行实现。

门将反应/扑救响应由goalkeeping.mjs统一，单刀站位在positioning.mjs；手部卸球必须同步更新独立控制状态。射门偏位比较球门角度连线，不以球门中心距离直接判断。参数见V3设计，属于游戏工程模型。

0.6.1运动参数以[PHYSICAL_MOTION_V061.md](design/PHYSICAL_MOTION_V061.md)为准：ball-motion统一二次空阻/草阻和传球预测，physics以冲量实现阻力，避免自转上限造成持续打滑；locomotion的driveMovement执行有限加减速。身体异常碰撞有个人冲刺+0.6m/s保护，主动球初速≤38m/s。不要恢复地面切向摩擦后再叠加草阻，不能将原生自转当作准确旋转球模型。先结算旧任务再升级；旧回放不重算，流程不变。

## 0.7.0 · 2026-10-18

仅新增design/LIVE_BROADCAST_V070.md观看与发布契约；0.6.1物理、决策、种子、引擎/参数版本和决策图均未变化。5×属于server/client展示时钟，不得改变simulate中的物理步长、能力或事件时间。

观看与恢复契约：packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md；入口在根PROJECT.md。改动同步本模块记录，遵守已批准的分层验证；开发流程不变。
