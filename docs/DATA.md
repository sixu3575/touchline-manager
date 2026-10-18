# 数据与迁移

数据库 game.sqlite 位于 DATA_DIR；生产 /var/lib/touchline-manager，与 /srv 只读发布目录分开。

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
