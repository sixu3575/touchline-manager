# 比赛模块

当前规则和数学参数见 [design/APPROVED_V1_PHYSICAL.md](design/APPROVED_V1_PHYSICAL.md)。用户已批准v1 A/B/C，保留真实物理进球；原概率赛果公式不启用。

职责：带版本的确定性比赛引擎、能力与战术影响、赛后收入和战报存储的编排。

公共入口：index.mjs。ENGINE_VERSION、simulate、finishMatch、settleClubPlayers（双方统一的球员结算，不写俱乐部收入）。

内部职责：physics.mjs 管 Rapier 世界、碰撞与触球冲量；agents.mjs 管战术目标/动作选择；simulation.mjs 管比赛状态、统计与轨迹编码。改战术无需改物理求解器，改回放无需重算赛果。

新增唯一外部领域依赖 @dimforge/rapier3d-compat，固定0.21.0。模块初始化一次加载WASM；simulate仍为同步、固定输入/种子的计算，不访问Node服务。浏览器不得导入本模块或game.mjs，回放只读服务端存储的轨迹。测试用短时选项不暴露给HTTP动作。

边界：不得依赖系统时间、随机全局源或网络。改变赛果算法需更新 ENGINE_VERSION；历史事件和快照不能重算。球员结算调用 players 公共接口，资金调用 economy。

依赖与文件归属见根目录 modules.json。跨模块只导入公共入口；每次开发在本目录 CHANGELOG.md 记录内容、验证和新增注意事项。既有分支、检查、PR、部署流程不变，流程优化需用户批准。

0.4.0注意：实施已批准A/B/C并保留真实Rapier球轨迹。新增rules及shootout，分层动作质量、越位、近身犯规、纪律、自由球/点球、物理点球大战和助攻解释；退场不得再运动/碰撞。旧事件和轨迹不可重算。数学和简化边界见design/APPROVED_V1_PHYSICAL.md。
