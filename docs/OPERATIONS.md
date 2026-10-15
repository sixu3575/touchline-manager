# 部署与恢复

## 生产位置

- IP 入口：http://138.2.64.10/
- Caddy :80 → 127.0.0.1:3100；Node 不直接暴露公网。
- 代码：/srv/touchline-manager/releases/<commit>/，current 软链接指向当前版本。
- 数据：/var/lib/touchline-manager/game.sqlite。
- 用户：football，无登录 shell；服务 touchline-manager.service。
- 数据备份：/var/backups/touchline-manager/，timer 每日执行，保留 14 份一致 SQLite 快照。

## 发布

在本机执行 npm ci、npm run check、提交并推送。创建只包含 packages/server、packages/shared、scripts/backup.mjs、dist/client、package.json、deploy 的生产归档；不打包凭据、运行数据或 node_modules。上传 VM 的临时目录，运行 deploy/install.sh <archive> <commit>。

安装脚本在已存在数据时先备份；校验 Caddy 配置、重启服务并检查本机健康。公网验证 /api/health 的 build 必须匹配提交。保留上一发布目录用于回滚，回滚只切换 current 并重启，数据结构变更需另行迁移。

## 备份

DATA_DIR=/var/lib/touchline-manager BACKUP_DIR=/var/backups/touchline-manager node scripts/backup.mjs。脚本使用 SQLite VACUUM INTO + integrity_check。服务器本地定时备份不能替代异地备份；需定期通过安全通道复制到本机/专用对象存储并校验 SHA-256。对象存储持续上传尚需配置专用存储与最小权限，不得把玩家数据库提交到 GitHub。

旧 web-slg 在迁移前停服并归档，归档和校验记录保存在 VM /var/backups/legacy-games/ 及开发机备份目录。不要恢复旧服务时覆盖新游戏数据。

## 恢复演练

1. 停止 touchline-manager.service，记录提交与时间，并保留当前数据库及 WAL/SHM。
2. 在临时隔离 DATA_DIR 中放入备份，运行 integrity_check，启动本机端口验证已知 Cookie 的存档和下一轮比赛。
3. 确认正确版本后才替换生产数据，权限设 football:football、文件 600，启动服务并核查日志和公网。

## 限制

首版 HTTP IP 入口为匿名试玩；正式账号与跨设备恢复必须在配置域名/HTTPS后实施。日常检查 systemctl status、journalctl -u touchline-manager.service、/api/health、磁盘和备份 timer。秘密与个人会话 Cookie 不写入工单或聊天。
