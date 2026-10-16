# 数据与迁移

数据库 game.sqlite 位于 DATA_DIR；生产 /var/lib/touchline-manager，与 /srv 只读发布目录分开。

- saves：id、token_hash、state（JSON）、updated_at。JSON schemaVersion=2，revision 随操作递增。
- operations：(save_id,request_id) 唯一，body_hash 校验相同标识意图。相同请求返回当前状态，过期 revision 返回 409。
- state：原字段加 gameDate；所有当前 clubs.players 与 market 具有球员模型 2 字段，见 PLAYERS.md。
- reports：保留engineVersion、seed、事件与快照；旧报告不重算。0.3.0添加可选replay元数据、second事件时间、performance球员跑动和扩展统计；不破坏JSON schemaVersion=2。
- replays：(save_id,report_id)主键、payload为gzip压缩的小端uint16轨迹。与状态和operations同一事务写入，最多保留当前35份报告对应的数据；其他存档和无会话请求无法读取。
- SQLite user_version=2：启动时增建replays表；未知更高版本拒绝启动。此前表和JSON不删除或重建。JSON版本独立于表版本。

## 1 → 2

服务启动前在单个 BEGIN IMMEDIATE 事务遍历旧档。复制状态后确定性补全当前球员细项、生日、国籍、惯用脚、身高、性格与生活资料；gameDate 由赛季和轮次恢复。保留原姓名、年龄、价格、工资、六项能力、资金、阵容、成绩、荣誉、账本及回放。revision 加一，旧页面先刷新再写。第二次启动不重复执行；未知版本停止启动，所有迁移回滚，不删除或重建存档。

生产部署沿用 install.sh 的发布前一致性备份。不得直接复制正在写入的单一 SQLite 文件；scripts/backup.mjs 使用 VACUUM INTO 并检查 integrity_check。回滚 0.1.0 时应停服务，备份当前新档，恢复升级前的数据库与旧发布 SHA；不能只切回旧程序后继续写新档。恢复会回到备份时间点，保留新档以便后续恢复处理。恢复时清理匹配的旧 WAL/SHM，并保留服务账号权限。

迁移验证覆盖旧档不变、能力评级保持、幂等、未知版本全事务回滚和迁移后继续训练/比赛；原 API 测试覆盖重启和备份恢复。

0.3.0的原始轨迹不得存入reports JSON；HTTP每次状态只返回元数据。GET /api/replays/:id返回gzip传输的二进制，由浏览器解压后校验格式和长度。VACUUM INTO会将轨迹表一起备份；恢复必须同时恢复报告与轨迹，不能只复制JSON。回滚前仍需保留完整快照：0.2旧界面不能显示新轨迹，回滚会失去新功能。
