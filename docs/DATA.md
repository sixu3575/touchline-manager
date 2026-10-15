# 数据与迁移

数据库 `game.sqlite` 位于 DATA_DIR。生产路径 /var/lib/touchline-manager，与 /srv 中的只读发布目录分开。

- saves：id、token_hash、state（JSON）、updated_at（UTC ISO）。每行一个独立世界，schemaVersion=1、revision 随成功操作递增。
- operations：(save_id,request_id) 唯一，body_hash 检测相同标识的不同意图。相同请求返回当前状态，不重复执行；过期 revision 返回 409。
- state：clubs、schedule、results、reports、cash、fans、stadium、training、market、ledger、trophies、cup。
- reports：engineVersion、seed、实际事件、赛前快照与完整统计。新赛季保留近期 35 场回放、近期 150 条账本。旧赛季积分榜清空，荣誉保留。
- SQLite user_version=1。将来更改 schema 必须明确迁移版本、恢复演练与旧事件兼容。

备份不能直接复制正在写入的单一 SQLite 文件；scripts/backup.mjs 使用 VACUUM INTO 生成一致快照并检查 integrity_check。恢复时先停服务，备份当前文件，替换数据库并清理匹配的旧 WAL/SHM，再启动并检查存档。保留服务账号与文件权限。
