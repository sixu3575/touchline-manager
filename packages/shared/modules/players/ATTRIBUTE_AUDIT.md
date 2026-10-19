# 0.12.0 属性接入审计（2026-10-19）

0.13.0消费者仍全部有效；基础能力改用整数，进入原有效能力和物理公式后保留浮点精度。训练经验仅在累计满100后增加1点基础能力；不直接参与比赛计算。详见[INTEGER_STATS.md](INTEGER_STATS.md)。

核对结论：现有30项均有真实比赛执行入口，6项新卡片概览均来自现有能力；没有为界面新增一组未接入的竞技属性。**被读取不等于每个位置/每次动作都有作用**，也不等于已证明数值平衡。以下为可核对的消费者与边界；tests/player-assessments.test.mjs检查引擎AST的实际能力读取，并覆盖耐力消耗。物理公式及动作分支本次未变，未重新模拟物理比赛。

源码路径均相对packages/shared/modules/。完整相关性和触发条件见[matches决策参考第6节](../matches/design/PLAYER_DECISION_MAP.md)。

| 真实属性 | 消费者 | 作用与限制 |
| --- | --- | --- |
| finishing 终结 | matches/skills.mjs actionQuality；decisions.mjs shotCandidate；shootout.mjs | 近射/点球精度与主罚排序，不强制进球 |
| longShots 远射 | skills.mjs；decisions.mjs | 远射考虑距离/射门精度，辅助定位球 |
| passing 传球 | skills.mjs；decisions.mjs | 传球精度/球风；辅助传中和门将出球 |
| firstTouch 停球 | skills.mjs；simulation.mjs attemptTouch | 接控球和一脚处理资格/精度 |
| dribbling 盘带 | skills.mjs；locomotion.mjs movement；carrying.mjs | 带球控制/速度档、过人候选与保球 |
| crossing 传中 | skills.mjs；decisions.mjs | 传中质量，不决定队友一定抢到 |
| tackling 抢断 | skills.mjs；simulation.mjs | 抢断质量、松球争夺与防守对抗 |
| marking 盯人 | positioning.mjs targetFor | 盯人距离/防守候选，不能远程抢球 |
| heading 头球 | simulation.mjs attemptTouch；decisions.mjs | 接触后的头球散布、传中机会评估；没有主动起跳 |
| setPieces 定位球 | skills.mjs；decisions.mjs；shootout.mjs | 定位球/点球质量与主罚选择 |
| vision 视野 | decisions.mjs chooseAction/playerProfile | 可考虑传球距离与组织倾向；没有完整视线遮挡 |
| decisions 决策 | decisions.mjs；simulation.mjs | 候选噪声、扫描/观察延迟、一脚处理资格 |
| composure 镇定 | skills.mjs | 减轻贴身压力质量损失；不是总胜率 |
| positioning 防守站位 | positioning.mjs targetFor | 普通防守站位误差，不等同进攻跑位 |
| offTheBall 无球跑动 | positioning.mjs | 前插选择、战术跑位精度和目标 |
| anticipation 预判 | positioning.mjs；decisions.mjs | 追球预判、门将预计截球、接应与拦截评估 |
| teamwork 团队配合 | positioning.mjs targetFor | 目标执行精度，无独立默契加成 |
| concentration 专注 | simulation.mjs | 普通扫描节奏、动作失误抽签 |
| acceleration 爆发力 | locomotion.mjs；decisions.mjs | 有限加速、接球可达与提前量 |
| sprintSpeed 冲刺速度 | locomotion.mjs；positioning.mjs；decisions.mjs | 速度上限、追球/前插排序、线路评估 |
| agility 灵活 | locomotion.mjs；skills.mjs；decisions.mjs | 转向响应、停/带球、推进倾向 |
| balance 平衡 | locomotion.mjs；skills.mjs；simulation.mjs | 刹车和接触处理稳定性，不免疫碰撞 |
| strength 力量 | skills.mjs；simulation.mjs createBody/attemptTouch；decisions.mjs | 刚体质量、射门/头球速度及部分质量 |
| stamina 耐力 | players/match-state.mjs energyCost | 降低掉体能速度，间接维持技术/身体能力 |
| reflexes 门将反应 | goalkeeping.mjs keeperReaction；simulation.mjs；carrying.mjs | 门将处理等待、临时接管、突破风险；不是通用外场反应 |
| handling 手型与接球 | simulation.mjs attemptTouch | 门将可卸下球速门槛 |
| oneOnOnes 单刀处理 | positioning.mjs；goalkeeping.mjs；simulation.mjs | 门将出击/手部范围与扑球响应 |
| aerialReach 制空 | simulation.mjs attemptTouch | 门将手部高度资格，仍受真实几何约束 |
| command 指挥防线 | positioning.mjs targetFor | 小幅降低普通防守目标偏差，无全队能力光环 |
| distribution 出球 | skills.mjs；decisions.mjs | 门将传球质量；固定解围轨迹没有专属精度加成 |

## 暂时搁置：没有建立独立字段，不进入卡片权重或训练

| 候选属性 | 现有部分替代 | 搁置原因/接入前要补的机制 |
| --- | --- | --- |
| 弹跳 | 身高、头球；门将制空 | 缺少主动起跳、起跳时机及身体弹道控制，不能把制空等同弹跳 |
| 弧线 | 传中/定位球精度 | 没有按球员弧线能力控制旋转/马格努斯力 |
| 凌空抽射 | 终结/头球和有限触球 | 缺少凌空专属接触姿态与动作质量 |
| 滑铲 | 抢断 | 缺少滑铲姿态、滑行动力与专属犯规风险 |
| 独立射门力量 | 力量、远射、定位球 | 目前力量影响出球速度；拆分需重校准冲量和球速 |
| 独立点球专精 | 终结、定位球、镇定 | 目前已有点球模型，新增值要明确替代权重并测试 |
| 侵略性 | 战术压迫、抢断、情绪稳定 | 没有独立侵略性人格/上抢倾向；情绪稳定目前影响抗议，不应偷换为侵略性 |
| 花式技巧/技能星级 | 盘带、灵活、平衡 | 没有花式动作库、可选动作资格或动画/接触定义 |

另：FC式进攻站位映射现有offTheBall，防守意识映射positioning/marking/anticipation，外场“反应”仍待独立设计，不能直接复用门将reflexes。性格8项中忠诚/社交当前无竞技分支；其余按决策图第6节区分训练、适应、心理冲击或特定比赛条件，不声称全部直接加能力。

维护：以后新增/拆分属性需在本表明确消费者或搁置原因，同次更新assessment.mjs汇总（仅适配时）、生成/训练/存档、决策图与SVG/源码摘要。不能把缺少实现的候选列为已启用。这里维护的是产品数据契约，既有测试分层、PR与发布流程不变。
