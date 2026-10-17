# 比赛模块

当前实现的跑位与接球决策参考入口：[design/PLAYER_DECISION_MAP.md](design/PLAYER_DECISION_MAP.md)。六张Mermaid及SVG展示动态职责、跑位优先级、接球前置处理、传带射评分和球风；阈值/公式以实际0.6.1代码为基准。按用户2026-10-17要求，相关算法或固定数据改动必须同次更新图文、SVG与源码摘要，第8节列明文件对应；展示标签不代表独立专属决策树。当前检查按最新批准的[分层验证](../../../../docs/VALIDATION.md)执行，相关改动会核对参考摘要。

真实引擎检查在 `tests/match/`，只在比赛算法改动时执行；完整物理赛季还要求同时涉及重大流程。业务/冒烟显式预加载受控赛果，禁止真实simulation/physics入口；不能将其标记轨迹当作物理证据。当前重组只改测试与文档，生产引擎/参数仍为0.6.1-physical-motion / physical-motion-1。

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
