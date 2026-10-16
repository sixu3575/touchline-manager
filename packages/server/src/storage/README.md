# 存档迁移模块

migrateState 为复制后迁移，migrateDatabase 在单个 BEGIN IMMEDIATE 事务升级所有旧档。仅接收支持的版本；遇到未知版本启动失败并回滚，禁止重建存档。生产发布前沿用既有部署备份。
