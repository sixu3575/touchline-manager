# 存档迁移模块

migrateState 为复制后迁移，migrateDatabase 在单个 BEGIN IMMEDIATE 事务升级所有旧档。仅接收支持的版本；遇到未知版本启动失败并回滚，禁止重建存档。生产发布前沿用既有部署备份。

0.3.0增加replays.mjs管理独立压缩轨迹表；user_version=2与JSON schemaVersion=2独立。persist必须在状态提交的现有事务内执行；失败一起回滚。未知更高表版本拒绝启动，备份使用VACUUM INTO包含所有表。

0.4.0注意：新增JSON 1/2→3原子迁移，仅当前球员补适应度100、revision+1；旧报告与replays BLOB保持。表版本仍2，未知JSON版本拒绝启动。回滚需使用发布前完整数据库。
