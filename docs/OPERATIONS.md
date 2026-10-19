# 部署与恢复

0.13.0在既有发布保护下显式取整：确认所有job已完成、停止服务、验证一致离机备份后，用新release的scripts/player-integers.mjs plan DB PLAN.json只读生成计划，再apply DB PLAN.json事务执行。计划陈旧/新增存档/活跃任务拒绝；只改当前能力/技能缓存及revision，不改历史/资金/阵容。无启动自动维护；回滚前保存新进度，完整数据回滚用prebackup。发布流程不改。

0.12.0发布不做离线球员重塑或启动数据迁移：原存档真值、球星、轨迹和历史BLOB保留，新增知识在后续合法动作初始化。发布前后取一致SQLite备份并校验旧行；旧release可忽略可选assessment，完整回退用发布前备份。API隐藏原始属性/种子，不要因排查问题把真值重新开放。原备份/部署/回滚流程不改。

## 0.11.0 属性分布发布与观察名额

原引擎不变。先排空所有未complete比赛，停服务并验证完整离机一致备份。新发布的scripts/player-profiles.mjs支持`plan DB TARGET_SEED PLAN.json`与`apply DB PLAN.json`；目标seed须唯一识别用户存档，计划保密留在数据/临时目录，不能入Git。先在备份的隔离副本执行并核对原历史/经济/身份及预期属性、首发变化，再对停止的生产库执行同一确定性逻辑。新脚本不接HTTP、不挂服务启动、不更改开发流程。

发布后新页面须刷新revision，检查目标99号林曜综合95、首发中锋、原球员留队及所有旧战报。维护前后所有非saves表逐字节保留，saves只允许约定字段变化；保存上线后离机备份。若需恢复原细项，必须明确使用维护前完整数据库备份，会回到该时点；代码回滚不会自动恢复能力。

0.10.0发布引擎0.10.0-tactical-roles/参数tactics-1。沿用既有分支/检查/PR/备份/部署流程，先排空所有旧引擎运行/airing任务并验证离机一致备份，再切换；新引擎不得恢复0.8.2检查点。JSON/SQLite3不变，升级前后核对原数据字节、SHA、真实战术短段、浏览器职责/回放与服务内存；比赛专项不包含赛季，生产仍单worker/512MiB。


0.8.2引擎0.8.2-goal-net/参数goal-net-1更新球网材质/顶网及进球后15秒重开，事件可选保存scorer。发布前排空0.8.0引擎任务并核验离机完整备份；新版本不可恢复旧引擎检查点。执行比赛物理/确定性/worker/HTTP专项，不涉及重大赛历流程，不跑赛季。上线核对旧数据字节、SHA、实际入网短场景与浏览器进球提示；512MiB单worker及开发流程不变，旧回放不重算。

0.8.0更新持球决策，ENGINE_VERSION=0.8.0-carrying、参数carrying-1；不改物理速度或存档结构。发布前排空0.6.1引擎的未完成任务并校验离机完整备份，不能重抽旧任务。新版真实比赛专项/确定性/worker恢复/HTTP及短段物理验证按既有分层规则执行，未改赛历或结算不跑完整赛季。上线后核对build、旧数据字节和对应实际比赛证据；既有512MiB单worker保护与开发流程不变。

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

0.3–0.5历史实现（0.6已替换）：物理比赛较慢，联赛每轮计算四场；前端显示等待状态。服务仅一个比赛worker，最多两个排队任务，任务120秒超时后失败且不结算，HTTP健康和读取仍可响应。注意内存与轨迹磁盘增长；健康正常不等于比赛成功，发布后必须通过真实浏览器新建一次比赛并读取轨迹。

0.3–0.5历史实现：VM上完整90分钟物理的联赛结算超过120秒；当前使用12分钟物理/90分钟游戏时钟，详情见GAMEPLAY。实测单进程物理内存峰值高于原256MB限制，服务MemoryMax改为512MB（非预留），主线程和worker各限制JS老生代128MB；仍只有一个Node服务/一个工作线程，无前端常驻构建。发布时检查systemd的MemoryCurrent/MemoryPeak。

0.4.0升级JSON至3。安装前一致备份须复制到本机校验；回滚需恢复升级前完整数据库。发布后验证旧回放、新比赛纪律/解释、适应度迁移和杯赛物理点球；轨迹多出点球阶段时仍按5Hz/49值校验。原开发与发布流程未修改。

0.5.0保持JSON schema3、SQLite user_version2与原轨迹格式，只给新比赛报告增加可选速度/行为字段。上线前后比较旧存档JSON、历史轨迹BLOB和已提交操作，旧比赛不重算。真实浏览器确认新回放默认1×、球速、球员行为与动作理由；隔离压测确认比赛仍在120秒任务限制和512MiB服务内存限制内。升级沿用既有检查、PR和部署步骤。

## 0.6.0 持久比赛任务

不改变现有分支/检查/PR/发布/备份流程。运行实现改为HTTP 202持久任务，单个worker顺序处理，最多3个未结算任务；60模拟秒一片、45秒片段超时，最多自动恢复2次，继续失败后保留输入/检查点供手动恢复。没有整轮120秒HTTP超时；SSE端点需允许长连接且不缓冲，gzip轨迹通过普通HTTP分段读取。当前Caddy反代支持原生流式转发。

查看/api/health、systemd MemoryCurrent/MemoryPeak和数据库任务status/progress即可；日志不记录Cookie或输入存档。不能只确认健康就声称比赛成功。发布验证应覆盖首段早于完成、多标签/断线、暂停不取消、版本冲突、完成后轨迹长度与旧报告兼容。完整90分钟每轮四场的耗时必须实测，12×观看目标不等于服务器吞吐保证；排队和缓冲要如实展示。

内存上限仍512MiB，main/worker JS堆各128MiB，无额外服务或依赖。静止死球跳过AI/碰撞求解；任务全部完成后释放worker，降低空闲压力。VM隔离测试不得和高负载生产同时占满内存：先检查可用内存，临时服务同样设512MiB/SwapMax0/Nice10/RuntimeMax，结束停止准确临时unit。日志检查限定unit/当前boot/时间和timeout，避免扫描整个大journal。

表3新增任务和片段、JSON仍3，旧存档/轨迹不动；检查点包含Rapier快照与V8序列化，需要相同Node/Rapier/引擎版本恢复。版本变化前先等待进行中任务结算，不能换模型重抽；回滚见DATA表2→3说明。部署前后离机备份、SHA-256和旧数据逐项比较仍必做。

### 2026-10-17 VM隔离验证

相同完整90分钟模型、单gzip回放与报告独立存储的预发布归档，在952MiB、无swap的生产VM隔离目录运行：本轮四场578671ms（约9分39秒），首段8871ms，测试期间健康请求最长617ms。27001帧、2646098字节解码轨迹与90个实时片段逐字节相同；原任务重启续算、重复请求只结算一次、详情会话隔离通过。实际比分2:7、双方传球470/723，仅为一次测试结果。

临时unit的MemoryPeak=508637184字节（约485MiB），低于512MiB上限，NRestarts=0；余量仍有限，不支持增加并行worker。此后仅修正事务失败处理、worker退出等待和同步接口引用兼容，最终发布仍须核对完整检查、版本SHA与公网实际比赛。测试数据库一致性备份已复制离机，原有6个存档JSON、5条历史轨迹及11条操作记录逐字节保留。压测使用隔离新存档，未替换生产数据库。完整100场模型校准及局限见比赛模块design/CALIBRATION_V060.md。

## 0.7.0 五倍速播放门槛

当前观看改为固定5×（90分钟约18分钟），取代0.6的12×与双入口。仍单worker/最多3个未结算任务；本队15秒片、AI60秒片、45秒片超时。airing表示计算完等待播出结束，正常情况下不消耗worker；HTTP/SSE继续工作，服务器时钟即使无人观看也推进。缓冲才会停在可用末帧，不能将airing误判成计算挂死。

部署前查询match_jobs所有status!='complete'数量，先等旧任务结算再切换；回滚前同样排空新airing/运行任务。0.6代码不认识airing，进行中不可直接切回；必要时用最新完整快照和对应0.7版本恢复，保留原Node/Rapier/引擎。JSON/表版本仍3，旧save、报告、轨迹和操作应逐字节保留。离机一致备份与SHA核对不变。

这次不改变物理/球员算法：本地用显式CLI受控报告验证真实HTTP/SQLite/worker和浏览器开播、退出、重入、刷新、防剧透及完整业务赛季；公网只检查实际入口/版本/SHA和只读健康，不为展示验收再运行生产物理比赛。不能把受控坐标当成真实物理性能证据；首段和整轮真实耗时沿用先前实测且可能受切片/负载影响。后续算法变化再执行相应真实比赛验证，继续遵守docs/VALIDATION.md。
