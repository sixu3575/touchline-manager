# 数据与迁移

0.30.2可选teamAbility在紧凑战报摘要保存两队首发球员实际总能力的整数均值、首发数与有效能力数；来源是本场冻结快照，不参与比赛输入/结算。旧detailsStored摘要读取同存档match_reports原BLOB推导并做有界缓存，完整BLOB、轨迹和个人赛后评分不重写；合法保存时可附带小汇总。JSON/SQLite仍为3，无迁移或启动批量写入。能力证据不足不以当前阵容、评估区间或中性分补造。0.30.1旧teamRatings字段仅作历史兼容，新界面不再展示。

周期时间线仅保留观看和计数需要的快照；控球阶段/传球链完整历史、跑动分区与防守诊断只在最终记录保存一次，原检查点保留完整运行状态。后台AI续算复用已压缩的广播表示，内部版本标记经publicReport边界剔除；不要绕过知识/诊断投影。

0.30.0保持JSON/SQLite schema3，新增可选playerStat事件（statId/second/playerId/side/changes/reason）及对应个人/球队汇总，统计opta-conventional-2；检查点state.actionStatistics保存纯JSON观察状态，不能让新引擎续算0.29旧检查点。新评分match-rating-3，已有playerRatings版本原样保留。旧历史新增项未知，不从当前阵容或重演推断。

0.29.0保留JSON/SQLite3、原任务/轨迹格式。physiology缓存与本场energyCeiling只存在于临时actor.matchState并随原检查点序列化，不出站、不写长期球员。旧fitness不批量改写；未来合法轮次才应用按天恢复，赛后能量可到0。旧报告/BLOB不重算，升级先排空旧引擎任务并校验离机备份，新引擎不得恢复旧检查点。

0.28.0-boundary保留JSON3、SQLite表版本3和原检查点包装，仅新比赛使用边界控球参数。未接纳四场候选的新表/增量格式，历史BLOB不改；旧引擎未完成任务先结算。容量/恢复实验均使用隔离或一致备份副本，生产备份不入Git。

2026-10-20观看修补：match_jobs.progress.report为展示副本，剔除原本就不公开的连续性/物理诊断；完整私有检查点/报告保留在work和正式归档。新旧进度均可读取，无schema变化或启动重写。观赛owned/latest/presentation查询不含work BLOB，恢复仍读内部get。进球/助攻等展示只读原有确认事件，不写回历史。

0.20.0引擎`0.20.0-possession`/参数`possession-1`仅影响新模拟结果；不增加或迁移JSON/SQLite字段，已有报告、战报和回放不重算。actor/比赛连续性检查点结构随此引擎版本变化，必须排空旧引擎未完成任务后发布，不能使用新引擎续跑旧检查点；回滚前先排空新任务并保留完整备份。

0.16.0保持JSON/SQLite3、事件3、u16回放。新报告可选performance[].locomotion（20Hz五区/活死球里程/高速段）、defenceTelemetry（私有诊断）及continuity.possessions（团队阶段，含短时松球）。旧报告保持缺失，不伪补历史。actor.activity/defenceMemory/pressUntil/shotPreparation及continuity团队记忆由既有检查点整体保存；matchState新增短时恢复字段只在单场actor内使用，出站剔除。按引擎0.16.0-realism隔离恢复，切换前排空旧任务；没有数据库迁移或长期属性调整。

0.15.1引擎0.15.1-attribution新增可选statisticsVersion、shotId/shotOutcome及正式来源ID；检查点state增加attribution与statisticalContacts。JSON/SQLite3、事件3/轨迹格式不变，不迁移旧行，不重算历史。新评分match-rating-2消费唯一射门结果；已有评分仍按原版本保存。

0.15.0仍JSON/SQLite3，training可选升级version2（facilities/assignments/history最近40轮/lastResolved），新增staff.version1（具名employees/market），player.development.version1（私有lastDate/30项真实peaks/decay余数/potentialDecay）；assessment记录专项trainingObservations及confirmedPeaks。GET在副本初始化默认值，不改旧存档；第一次合法动作/比赛计划保存可选字段，不追溯衰退。确认峰值只来自精确小项，公开训练仅delta，不发真值/from/to/development。每轮全部报告进入既有match_reports，摘要上限140，他队无轨迹且回放接口强校验本队；旧AI仅比分不重算。详见[训练契约](../packages/shared/modules/training/TRAINING_AND_CAREERS_V0150.md)。

0.14.0保持JSON/SQLite3及旧回放不变。新比赛actor携带可序列化markMemory/offBallPlan/receivePreparation，state携带deadState；现有通用检查点保存它们，引擎0.14.0-movement/movement-1作恢复边界。发布必须排空旧任务，不跨引擎恢复；不做存档重塑或历史重算。

0.13.0公开DTO新增overall:number|null，由真实能力（旧快照回退原skills）即时计算，不持久化；六项概览/细项知识继续投影。没有额外数据库迁移。

0.13.0继续JSON/SQLite3：当前attributes/skills采用整数；训练新增可选trainingProgress:{属性键:0–99整数经验}，满100转换1点能力，潜力封顶清除。该字段不发客户端。显式离线plan/apply只取整当前能力、潜力/逆足和技能缓存，有变化save的revision+1，其他状态与历史BLOB不改。详见[INTEGER_STATS.md](../packages/shared/modules/players/INTEGER_STATS.md)。

0.12.0继续JSON schema3/SQLite user_version3，新增可选assessment内部version1：coach/scout与players[id]的joinedOn/sessions/visits/lastScouted。GET只读默认，合法动作或比赛计划首次建立，观察跨季保留；不修改启动迁移或旧记录。0.17评估不改结构，仅把外部visits上限提至14；服务器attributes/skills/potential/weakFoot仍真实；HTTP不含attributes/种子/生成模板，skills等为评估中点。历史BLOB原样，响应投影。详见[ASSESSMENT.md](../packages/shared/modules/players/ASSESSMENT.md)。

## 0.11.0 显式属性重塑与观察名额

JSON/SQLite仍3，启动迁移不变。当前球员可选attributeProfile:{version:1,archetype,source}；指定用户可选playerProfileGrant:{version:1,playerId}防重复发放。显式维护只更新当前clubs.players/market属性、skills、说明标记及revision；指定目标另加一名前锋并替换对应首发槽位。旧球员其他字段、所有reports/results/ledger/资金/日期/赛历与历史BLOB保留。原细项按授权重分配，六项预算误差≤0.1，综合舍入最多约1点。每个有变化存档revision只+1，旧页面须刷新。

维护plan记录每个存档原JSON摘要与预期新摘要；apply在BEGIN IMMEDIATE中重新核对全计划、阻挡任何未complete任务，任一异常全库回滚。服务停止、已校验离机备份后才执行。再次生成计划将无变化，旧计划不能覆盖已更新存档。新名额售价/工资为0，不动现金，不加入正常初始化。

0.10.0仍JSON3/SQLite3。新报告replay.players与performance可选positionRole（运行位置），事件可选phase、delivery=lofted/low/cutback、setPiece；intent/type仍cross，不重复计传球/助攻/评分。phase不是结果开关，setPiece用于区分角球与运动战。新赛内continuity.regainedAt自动随既有检查点保存；新旧引擎版本不兼容，发布先排空旧任务。没有迁移或旧报告重写，旧回放仅用旧字段/轨迹。

0.9.0完整战报新增可选playerRatings:{version,baseline,minimum,maximum,rows}，独立match-rating-1；每行本场身份/位置/分钟、证据统计、rating（可null）、9类categories、coverage及未评分原因。新报告在原事务内保存，摘要不含此明细；旧GET响应只读补充，不改历史BLOB/轨迹或当前球员form。JSON3/SQLite3和物理引擎0.8.2不变，无迁移；播放终场前白名单隐藏评分。

0.8.2新报告引擎0.8.2-goal-net/参数goal-net-1；goal新增可选scorer:{id,name,number,side}，同时保留score与ownGoal。scorer为真实触球者，普通playerId/助攻和乌龙受益队归属不变；旧报告通过本场快照回退身份。JSON3、SQLite3、49值/5Hz格式不变，无迁移或历史重算。部署前等待旧引擎任务结算，不能新模型恢复旧检查点；设计见比赛模块GOAL_NET_V082.md。

0.8.0仅新比赛使用ENGINE_VERSION=0.8.0-carrying、parameterVersion=carrying-1。带球事件沿用type=dribble，可选intent=takeOn及相关解释/estimatedSuccess；意图只是路线估计，不能当成功过人统计。稳定球员模型、JSON3、SQLite3、49值/5Hz轨迹不变，无旧数据迁移/重算；旧引擎未完成任务先结算，再升级，禁止用新模型恢复旧检查点。

数据库 game.sqlite 位于 DATA_DIR；生产 /var/lib/touchline-manager，与 /srv 只读发布目录分开。

0.26.0-possession-screen仅调整第一上抢者的近身站位目标，引擎为`0.26.0-possession-screen`/参数`possession-6`；JSON/SQLite schema、报告结构和回放编码不变，无迁移或历史重算。旧引擎检查点须在升级前结算，不能由新引擎恢复。

- saves：id、token_hash、state（JSON）、updated_at。JSON schemaVersion=3，revision 随操作递增。
- operations：(save_id,request_id) 唯一，body_hash 校验相同标识意图。相同请求返回当前状态，过期 revision 返回 409。
- state：原字段加 gameDate；所有当前 clubs.players 与 market 具有球员模型 2 字段，见 PLAYERS.md。
- reports：保留engineVersion、seed、事件与快照；旧报告不重算。0.3.0添加可选replay元数据、second事件时间、performance球员跑动和扩展统计；保持当时JSON schemaVersion=2；0.4.0按下述方案迁移至3。
- replays：(save_id,report_id)主键、payload为gzip压缩的小端uint16轨迹。与状态和operations同一事务写入，最多保留当前35份报告对应的数据；其他存档和无会话请求无法读取。
- SQLite user_version=3：保留replays表并增建match_jobs/match_chunks；未知更高版本拒绝启动。此前表和JSON不删除或重建。JSON版本独立于表版本。

## 1 → 2

服务启动前在单个 BEGIN IMMEDIATE 事务遍历旧档。复制状态后确定性补全当前球员细项、生日、国籍、惯用脚、身高、性格与生活资料；gameDate 由赛季和轮次恢复。保留原姓名、年龄、价格、工资、六项能力、资金、阵容、成绩、荣誉、账本及回放。revision 加一，旧页面先刷新再写。第二次启动不重复执行；未知版本停止启动，所有迁移回滚，不删除或重建存档。

生产部署沿用 install.sh 的发布前一致性备份。不得直接复制正在写入的单一 SQLite 文件；scripts/backup.mjs 使用 VACUUM INTO 并检查 integrity_check。回滚 0.1.0 时应停服务，备份当前新档，恢复升级前的数据库与旧发布 SHA；不能只切回旧程序后继续写新档。恢复会回到备份时间点，保留新档以便后续恢复处理。恢复时清理匹配的旧 WAL/SHM，并保留服务账号权限。

迁移验证覆盖旧档不变、能力评级保持、幂等、未知版本全事务回滚和迁移后继续训练/比赛；原 API 测试覆盖重启和备份恢复。

0.3.0的原始轨迹不得存入reports JSON；HTTP每次状态只返回元数据。GET /api/replays/:id返回gzip传输的二进制，由浏览器解压后校验格式和长度。VACUUM INTO会将轨迹表一起备份；恢复必须同时恢复报告与轨迹，不能只复制JSON。回滚前仍需保留完整快照：0.2旧界面不能显示新轨迹，回滚会失去新功能。

## 2 → 3（0.4.0）

仅所有当前clubs.players与market补wellbeing.adaptation=100；其他字段与旧reports/轨迹BLOB不变。schema1先恢复身份/日期后同样补适应；单事务迁移、revision只加1、重复启动不重复。新签约适应70。新报告添加规则/参数/eventFormat版本、质量解释、mind及纪律、助攻；原始轨迹仍独立BLOB。可选regulationDuration区分点球大战末段；stride/5Hz不变，penaltyGoal不算常规goal。

回滚0.3.0：先停服务备份当前schema3，再恢复本次发布前完整schema2数据库与对应release；仅切代码会被旧版拒绝，不可删除adaptation后伪称无损降级。保留升级后备份以便追回新增比赛。

0.5.0维持JSON3与轨迹编码。新报告可选motion（传球初段平均m/s、全员平均m/s及冲刺采样比例）；performance可选style、dribbleTouches、carryDistance（实际米）、throughBalls、longPasses、oneTouchPasses、maxSpeed；事件新增intent/decision/estimatedSuccess。均只描述当场保存结果，不写入稳定球员字段，不重算历史。旧0.4代码忽略这些可选字段即可回滚代码，回滚前仍保留完整最新快照。

## 0.6.0 表版本 2 → 3

JSON schemaVersion仍3，不升级revision，不改写既有saves/operations/replays。新增match_jobs（存档/赛事身份/请求/冻结revision/状态/进度/压缩work）与match_chunks（job_id+seq唯一，gzip二进制）。输入计划、随机状态、Rapier快照和域状态一起保存；片段与检查点在同一事务提交，最终状态/全部正式回放/operation/job.complete再同事务提交。不同会话不能读取任务、SSE或分段。

任务唯一身份：save_id+advance/season/round，或save_id+cup/season/stage；原始requestId也唯一。不同按钮和新requestId加入未结算原任务，前端模式不进入种子。任务进行/失败时冻结其他存档写入，拒绝借更改阵容或资金覆盖结算。失败重试从原work恢复，不删除比赛。

新报告ENGINE_VERSION=0.6.0-continuity、parameterVersion=continuity-1、eventFormatVersion=3、clockScale=1，帧仍positions-u16-v1/49值/5Hz。旧回放按原元数据解码，不重算、不把12分钟旧回放伸成90分钟新轨迹。阶段timeline仅保存在最近3个完成任务供实时界面，不在所有历史报告重复携带。正式回放仍跟随35份报告保留。

VACUUM INTO备份包括新表、未完成任务与片段。原版本/同Node和Rapier依赖恢复未完成任务；发布前应先让旧引擎任务结算完成。回滚0.5必须停服务、保留最新完整快照，再恢复升级前表2备份及对应release；会回到该备份时间点，不能仅切代码或删表假称无损回滚。
0.6.0补充：match_reports按save_id/report_id保存gzip完整战报，新state.reports只保留detailsStored摘要，GET /api/reports/:id同Cookie按需读取事件/快照/球员统计；旧报告JSON不压缩迁移、不重算。详细战报与轨迹、存档、操作同事务提交，沿用35场保留期，完整备份必须包含此表。这样长期存档不会反复解析35份完整90分钟事件，保护128MiB主线程JS堆。

0.6.1仅改运动模型：ENGINE_VERSION=0.6.1-physical-motion、参数physical-motion-1；JSON3、SQLite表3、事件3、49值/5Hz编码不变，无旧数据迁移。0.6.0未完成任务先按原引擎结算，不能拿新阻力恢复旧检查点。历史报告和轨迹不重算；发布/回滚前保留最新完整离机快照。

## 0.7.0 持久播放锚点与暂存结算

表3/JSON3及历史数据保持不变，无revision迁移。match_jobs.progress可选新增broadcast={speed:5,anchorAt,anchorSecond}、chunkEnds累计帧边界、computedAt最近片完成时间；status新增airing（全轮已算完，等待播放终场）。work仍保存原输入和全部已计算报告，不能在单独更新时钟时覆盖/丢失它。

公开GET job通过白名单投影，broadcast.seconds为当前播出进度、ownComplete为播放终场；私有progress.ownComplete仍为计算完成，禁止混淆。frameCount只暴露当前时刻加最多10物理秒插值缓冲，普通事件最多最近120条另保留进球/牌，统计取不晚于播出时刻的快照。GET frames?from=N返回gzip小端uint16与X-Frame-Start/End；越界416、跨档404；新任务未complete时原chunks路径409，正式reports/replays暂不存在。旧完成任务继续原契约。

播放结束且全部计算齐全才事务写正式save、replay、match_reports、operation与complete；提前计算的AI比分不在state.results中出现。发布失败全部回滚，原work可重试提交而不模拟。完整备份包含airing与锚点；恢复同版本会按原UTC进度继续。升级和回滚前排空未完成任务，不认识airing的旧代码不可直接接管新任务；若需恢复旧备份，保留最新完整数据库并明确回到备份时间点。
