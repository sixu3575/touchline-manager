# 部署与恢复

## 生产位置

- IP 入口：http://138.2.64.10/
- Caddy :80 → 127.0.0.1:3100；Node 不直接暴露公网。
- 代码：/srv/touchline-manager/releases/<commit>/，current 软链接指向当前版本。
- 数据：/var/lib/touchline-manager/game.sqlite。
- 用户：football，无登录 shell；服务 touchline-manager.service。
- 数据备份：/var/backups/touchline-manager/，timer 每日执行，保留 14 份一致 SQLite 快照。

## 发布

在本机执行 npm ci、npm run check、提交并推送。生产归档包含packages/server、packages/shared、scripts/backup.mjs、dist/client、package.json、package-lock.json、deploy；不打包凭据、运行数据或node_modules。上传VM临时目录，运行deploy/install.sh <archive> <commit>。安装脚本执行npm ci --omit=dev --ignore-scripts --no-audit --no-fund，仅安装锁定的运行依赖，Rapier的WASM随包提供，无需编译工具。

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

物理比赛较慢，联赛每轮计算四场；前端显示等待状态。服务仅一个比赛worker，最多两个排队任务，任务120秒超时后失败且不结算，HTTP健康和读取仍可响应。注意内存与轨迹磁盘增长；健康正常不等于比赛成功，发布后必须通过真实浏览器新建一次比赛并读取轨迹。

VM上完整90分钟物理的联赛结算超过120秒；当前使用12分钟物理/90分钟游戏时钟，详情见GAMEPLAY。实测单进程物理内存峰值高于原256MB限制，服务MemoryMax改为512MB（非预留），主线程和worker各限制JS老生代128MB；仍只有一个Node服务/一个工作线程，无前端常驻构建。发布时检查systemd的MemoryCurrent/MemoryPeak。

0.4.0升级JSON至3。安装前一致备份须复制到本机校验；回滚需恢复升级前完整数据库。发布后验证旧回放、新比赛纪律/解释、适应度迁移和杯赛物理点球；轨迹多出点球阶段时仍按5Hz/49值校验。原开发与发布流程未修改。

0.5.0保持JSON schema3、SQLite user_version2与原轨迹格式，只给新比赛报告增加可选速度/行为字段。上线前后比较旧存档JSON、历史轨迹BLOB和已提交操作，旧比赛不重算。真实浏览器确认新回放默认1×、球速、球员行为与动作理由；隔离压测确认比赛仍在120秒任务限制和512MiB服务内存限制内。升级沿用既有检查、PR和部署步骤。
