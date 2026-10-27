# 部署与恢复

## 2026-10-27 发布：多人带球路线与协同风险

PR #78已合并并部署，生产build `b3363ee7e52d9cb7643aca55ee3662e3744627e3`，引擎`0.46.0-carry-routes` / `carry-routes-1`。每名防守者沿路线选择一次代表性接触窗口，估计整段条件保球风险，区分同时合围与先后拦抢；取消固定按人数扣分及最低12%保球估值。射门分数、真实技术对抗与物理不改，无新属性/依赖/存档迁移/公开诊断，历史不重算。数学、图文、完整样本和局限见[多人路线设计](../packages/shared/modules/matches/design/CARRY_ROUTES_V0460.md)。

本机`npm run check`通过73项冒烟/业务、155项比赛单元、16项真实比赛/API/检查点集成、类型及生产构建，共302.8秒。基线/候选各10场90分钟，候选3 pass/7 review/0 block、无分布警报；review仍为低速跑动距离占比和控球队917次传球。进球方差上升且含两场0:5，保留结果，不能宣称整体已完全拟真。PR的Node22/24 CI均一次通过，分别9分38秒/8分56秒；原测试门槛、并发和工作流不变。match=true、season=false、physicalSeason=false，没有赛季模拟。

现机以正式Node22及原内存参数独立测试90分钟分片Worker并跨半场恢复：323.6秒，首片1702ms/P95 1607ms/最慢2094ms，小于5×播放的3000ms分片预算，OS RSS高水位280.6MiB。探针不读写生产存档，设置384MiB上限并在玩家开赛时停止；临时服务/源码目录已精确清理。正式512MiB、单Worker、`--liftoff-only`与四项malloc变量保持。

发布前没有未结束任务。一致离机备份为`C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-carry-routes-20261027.sqlite`，VM原件`/var/backups/touchline-manager/touchline-pre-carry-routes-20261027.sqlite`，160096256字节，SHA-256 `ff30d7dd898077b86bfa7daf6ac988f5fb19f6d562c0539fdfaf277639757f9e`，两端完整性和六表全列/BLOB指纹通过。安装脚本另生成`/var/backups/touchline-manager/touchline-2026-10-27T09-59-00-087Z.sqlite`。

合并树与已测试PR树一致，按合并提交本机构建并使用原install.sh；发布包5385248字节，SHA-256 `651d9d677db92e1e40e7ba925c97e459db851553c9e1ae47991602ab27d1761a`。部署后及浏览器验收清理后，六表全列/BLOB指纹与发布前一致：2个存档、53条操作、25条回放、71份战报、3个完成任务、1080个轨迹片段，integrity_check为ok。独立匿名浏览器核对20人名单翻页和开赛入口，无玩法写请求/JS错误；确认该临时存档没有任何玩法记录后仅清理该条记录。

本机/公网health均返回上述build，正式carry-route/carrying源码SHA-256与Git对象一致；服务/Caddy/备份timer均active，NRestarts=0，验收后空闲MemoryCurrent约47.4MiB（不是比赛峰值）。旧release `23a91467fa0c5665a5391c58511ed23a65cd9084`保留；回滚前须排空新任务，恢复旧current、unit及BUILD_SHA再重启，不用旧引擎恢复新检查点，不覆盖玩家进度。

## 2026-10-27 发布：远射窗口与射门专长

PR #76已合并并部署，生产build `23a91467fa0c5665a5391c58511ed23a65cd9084`，引擎`0.45.0-shot-windows` / `shot-windows-1`。按个人射门散布、身体准备与防线收拢比较即时射门和继续传带；未改实际出球随机顺序、球速或进球物理，无存档迁移/历史重算/公开诊断。算法、逐场结果和方差见[远射窗口设计](../packages/shared/modules/matches/design/SHOT_WINDOWS_V0450.md)，决策图第5/6图、属性索引、SVG与来源摘要同步。

本机完整检查通过73项冒烟/业务、149项比赛单元、16项真实比赛/API/检查点集成、类型和构建。基线/候选四战术×两种子及两场压力样本各10场，候选10 review/0 block/无分布警报；已有低速跑动占比及部分控球队传球偏高未解决，不记作完全拟真。PR Node24 CI一次通过；Node22首次联赛结算等待600秒超时，原条件重跑通过（总633.4秒），未修改测试门槛/并发/断言。保留[CI两次记录](https://github.com/sixu3575/touchline-manager/actions/runs/40475209931)。match=true、season=false、physicalSeason=false；没有赛季模拟或开发流程变更。

发布前用正式Node22内存参数在独立Worker跑完整90分钟并跨半场恢复：361.8秒，最慢15秒片2516ms，小于5×播放预算3000ms；OS RSS高水位330.1MiB。正式512MiB、单Worker、`--liftoff-only`及四个malloc变量保持；该探针未读写生产存档，临时服务和源目录已清理。

发布前没有未结束任务。一致离机备份为`C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-shot-windows-20261027.sqlite`，VM原件`/var/backups/touchline-manager/touchline-pre-shot-windows-20261027.sqlite`，160096256字节；SHA-256 `ffa4c13f867061c30508b48e0988fb19a224ff673f576a3fbe8d7cfec2e26a02`，两端integrity_check及六表全列/BLOB指纹一致。安装脚本另生成`/var/backups/touchline-manager/touchline-2026-10-27T09-06-06-787Z.sqlite`。

在本机构建合并提交，确认源码树与已通过CI的PR头一致；发布包5370563字节，SHA-256 `67c5c5c6eca6687a17c6ddd52fc25dd5b2285b0564e83c30a6f5912d067e7afa`，经原install.sh安装。部署后与公网浏览器验收清理后，六表指纹均与发布前完全相同：2个存档、53条操作、25条回放、71份战报、3个完成任务、1080个轨迹片段，integrity_check为ok。浏览器只在独立匿名验收会话查看院子、翻页核对20名球员及开赛入口，无玩法写请求/JS错误；核验该临时存档没有任何玩法记录后仅删除该条记录。

本机和公网health均返回上述build，正式源码包含0.45版本。服务/Caddy/备份timer均active，NRestarts=0，验收后空闲MemoryCurrent约54.5MiB（不是比赛峰值）。旧release `1f0a032abdc10a4c087338814e5479acf00f49b7`保留；回滚须先排空新任务，恢复旧current、unit及BUILD_SHA后重启，不用旧引擎恢复新检查点，也不覆盖玩家进度。

## 2026-10-27 发布：全站卡通球会场景

用户确认纵深院子风格后，PR #72合并并部署，生产build为`1f0a032abdc10a4c087338814e5479acf00f49b7`。院子、逐排更衣柜、体育报/电视/录像档案及战术、训练、球探、财务和主场工作台全部接入同一套原创美术。七张WebP共2007308字节，按房间加载，院子首屏390864字节；无新运行依赖、存档迁移、数据改写或比赛重算。保留PR #73的`--liftoff-only`、四项malloc环境变量、单Worker、512 MiB服务限制及原0.44.0引擎。

本机108项冒烟/定向、类型与生产构建通过；PR和合并main的Node22/24 CI均通过，match/season/physicalSeason=false。浏览器在1280/390px验证所有房间、23人战术照片标签与11人排阵、七个训练区域、球员档案及88条财务记录可达；没有提交签约/训练/扩建或推进比赛。历史战报与保存轨迹回放在本次场景开发时已验收，不重新模拟。

发布前无未结算任务。一致离机备份为`C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-scenes-20261027-1f0a032.sqlite`，VM原件为`/var/backups/touchline-manager/touchline-pre-scenes-20261027-1f0a032.sqlite`，118398976字节；两端SHA-256均为`9a3dee625f04f6cadde62f34922c949bf4aa6e80df7b643f54b1a2d165f3c1fd`，integrity_check和六表指纹通过。安装脚本另生成`/var/backups/touchline-manager/touchline-2026-10-27T00-59-06-178Z.sqlite`。

发布包SHA-256为`c6bb9bcaef77c438b1f0a40c5e890c3883816e75d7b1ed99e7de1f281dadbb08`，本机构建后通过原install.sh安装；合并树与已审查PR树一致。停服前、停服后、启动后及公网验收清理后，六表全列/BLOB逻辑指纹均与发布前一致：2个原有存档、52条操作、24条回放、67份战报、3个完成任务、1080个轨迹片段。公网验收仅创建独立空存档，核对其20人公开名单与实际浏览器一致、无任何玩法记录后，事务清理该单条记录；未删除或改写原有存档。

公网与本机health均返回上述build；首页、JS/CSS和七张WebP均为HTTP200且MIME正确。公网真实浏览器逐页进入院子/更衣室/战术/训练/球探/财务/主场/报纸/榜单/档案，390px重点房间无整页横向溢出，控制台无错误。验收后服务、Caddy与备份timer为active，NRestarts=0，空闲MemoryCurrent约52.3 MiB（不是容量测试）。临时备份传输副本与测试名单已精确删除，旧release及一致离机备份保留。

## 2026-10-27 发布：实时观战运行内存

PR #73 已部署，生产build `94ff240768d3b5d9be6070bc60b70be275d2f858`，引擎保持 `0.44.0-live-manager`。systemd增加 `--liftoff-only` 与 `MALLOC_ARENA_MAX=2`、三个128 KiB malloc阈值，针对Rapier WASM编译峰值和glibc空闲页保留。服务512 MiB、单Worker、JS128 MiB及5×/5 Hz保持；无存档迁移。Node升级需重新验证V8测试性质开关的兼容性和吞吐；回滚必须恢复旧release的unit及对应BUILD_SHA并daemon-reload/restart，不能只切换current链接。测量、失败样本和固定报告/轨迹哈希见[模块记录](../packages/server/src/design/LIVE_MEMORY_RUNTIME_20261027.md)。

正式服务无未结算任务。已生成并校验一致离机备份 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-live-memory-20261027.sqlite`，VM原件 `/var/backups/touchline-manager/touchline-pre-live-memory-20261027.sqlite`；160,096,256字节，SHA-256 `cff6d4cb67a8892fde86b2847b95a3f5b40e4c7bf85e98a431c5eaf7f7d9575f`，两端integrity_check均ok。为隔离测试留出安全余量，备份校验后仅重启原生产build `c07863d`，释放旧进程的空闲分配区；未安装候选或推进存档。

完整90分钟、跨Worker恢复、半场、事件/统计/27,001帧哈希在Node22 VM与Node24本机均一致。VM完整探针346秒、最慢15秒片2392毫秒、OS RSS高水位310.4 MiB；正式资源条件的两组真实5×短观赛各约168秒，候选峰值149.9 MiB，对照440.6 MiB；RAF中位16.7毫秒/P99 33.4毫秒相同，稳定阶段服务端缓冲均0，候选稳定阶段画面衔接提示0。保留首轮更严256 MiB/75% CPU失败记录，不把它记为通过；详见模块记录。26项冒烟/类型/构建、两项真实Worker、19项直播专项及PR/main Node22/24 CI通过；没有模拟赛季或改开发流程。

发布归档SHA-256 `b0fd3dd755ea8836feb1a033a46411b1f6d673f52bd147800f98743b60a3dc8b`，通过原install.sh安装；安装另生成 `/var/backups/touchline-manager/touchline-2026-10-26T23-21-05-605Z.sqlite`。发布前无未结算任务。部署后及公网只读浏览器验收清理后，六表全列/BLOB指纹均与发布前相同：2个存档、52条操作、24条回放、67份战报、3个已完成任务、1080个片段，integrity_check为ok。浏览器仅访问总览/20人名单/赛程，无POST、JS错误或比赛推进；仅删除由该隔离会话创建、已核验无玩法记录的验收存档。

公网与本机health返回生产build，实际ExecStart和四个malloc变量均生效；服务、Caddy、备份timer为active，NRestarts=0。验收后的空闲MemoryCurrent约44.8 MiB，不将冷启动空闲数值当作比赛峰值。所有临时模拟/浏览器服务与隧道已关闭，测试SQLite及临时备份传输副本已清理；原生产release及一致离机备份保留。

## 2026-10-26 发布：实时比赛指挥与天赋训练

部署 PR #70，合并提交及生产 build 为 `c07863d8b0e23f85d24555cbdb54c8c1359086ae`；比赛引擎 `0.44.0-live-manager`。实时观战加入六项球员大数据、战术板和替补；修正防守事件统计归属；训练基地显示当前体力和对应已观察细项，并加入由个人潜力、稳定训练天赋、教练/态度及平缓年龄因子共同影响的整数成长。没有数据库迁移、发布时存档改写或历史报告重算。

PR Node 22/24 全量 CI 均通过，包含比赛/API/检查点集成、受控业务赛季、56场完整物理赛季、类型检查和生产构建；Node 22 用时1小时31分24秒，Node 24 用时44分02秒。现实统计报告仍为 `review`：两名样本球员的低速跑动距离占比分别69.95%和68.34%，高于65%的工程复核线；无阻断项，不将其记为现实性通过。

停服前比赛任务均已完成。SQLite一致快照位于VM `/var/backups/touchline-manager/touchline-2026-10-26T11-42-41-594Z.sqlite`，已复制至离机私有目录 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-pr70-20261026.sqlite`。离机副本112,828,416字节，VM与本机 SHA-256 均为 `0e362692e9ba91257caf52f487257b0eedcf21ef3c7157b75697304462ac7446`；`integrity_check` 为 `ok`。发布安装脚本另生成 `/var/backups/touchline-manager/touchline-2026-10-26T11-44-07-401Z.sqlite`。

发布归档 SHA-256 为 `812454c00f6a342de90e032a92e78b429faf8b90aab7555a07e7234427422be7`，经 `/bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> c07863d8b0e23f85d24555cbdb54c8c1359086ae` 安装。部署前后均为2个存档、51条操作、23条回放、63份战报、3个已完成比赛任务和1080个轨迹片段；生产库 `integrity_check` 为 `ok`。服务、Caddy与备份timer均为active，服务重启计数0。本机与公网 `/api/health` 返回该build；公网首页、JS和CSS均为HTTP 200，客户端资源含训练基地体力、战术板和替补功能标识。旧release保留用于代码回滚。

## 2026-10-26 发布：Ink 美术与三阶段头像

PR #68 已合并并部署，生产 build 为 `b912e9539a8bfdf878d8174020cb26c629ad3126`。原创运动漫画主题、球场插画与稳定 ID 头像已上线；≤18青训、19–29青年、≥30中年。只改客户端，无服务端、规则、数据或运行依赖变更。引擎继续为已部署的0.43.0；单 worker、512MiB限额保持。

发布前无未完成任务。新的离机备份为 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-ink-20261026-1.sqlite`，VM原件为 `/var/backups/touchline-manager/touchline-pre-ink-20261026-1.sqlite`，101,920,768字节；两端SHA-256均为 `b9911d6c261148d2ef5fe57db4969a3fe2155dcb2f454c343084581e75ab10b1`。离机 integrity_check 和六表指纹均通过。归档SHA-256为 `9be625ef5f71b96faa2844b4d31345e64c439638c4e2df2d4ca055ac004fe630`，安装脚本另保存 `touchline-2026-10-26T05-55-07-407Z.sqlite`。

停服前、停服后、启动后及浏览器验收清理后，原用户存档和六表全列/BLOB指纹完全一致：1个存档、43条操作、21条回放、55份战报、3个已完成任务、1080个轨迹片段。用户保留的临场竞技仍为第2赛季已完成8轮、revision48、2027-08-26、23名球员；没有推进比赛。浏览器产生的独立匿名验收存档无任何玩法操作，仅删除准确识别的该条临时记录；最终仍为1个存档。

本机118项冒烟/针对性测试、类型检查与生产构建通过，PR和main的Node22/24 CI均通过，match/season/physicalSeason=false。桌面/390px本地布局、三阶段实验室切换及公网实际总览/20张名单头像/球员档案/8张球探头像/主场插画通过，无浏览器控制台错误；首发11张头像与11条体力条完整保留。公网和本机health均返回上述build，正式JS/CSS为 `index-u6hGh1wy.js` / `index-CS78BGRh.css`。服务、Caddy与备份timer均active、NRestarts=0，启动后空闲MemoryCurrent约40MiB；该数值不是并发容量测试。旧release保留用于回滚。

## 2026-10-26 发布：排兵布阵体力显示

部署 PR #66，合并提交及生产 build 均为 `6b3bbc3210622ced7b923b96a9890293539c7dc0`，应用版本 `0.17.0`。排兵布阵名单与首发球场显示球员当前体力百分比及状态条；仅为客户端只读展示，不改排阵、比赛规则、存档结构或历史报告。

部署前7个比赛任务均已完成。停服前一致 SQLite 快照为 `/var/backups/touchline-manager/touchline-2026-10-26T05-30-40-710Z.sqlite`，离机副本为 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-tactics-fitness-0.43.sqlite`，大小142,069,760字节。VM和离机副本 SHA-256 均为 `50c8525bfee1811cacbdfff421c27a4a4d90ecc86157be30e3939386438f027e`；离机副本 `integrity_check` 为 `ok`。部署前后均为34个存档、62份战报、7个已完成比赛任务；安装脚本另生成 `/var/backups/touchline-manager/touchline-2026-10-26T05-31-36-291Z.sqlite`。

发布归档 SHA-256 为 `3fb491eddee9d9ed807b54ac828ea484da0723ebc26300c7618e7a2a9e041fe3`，通过 `/bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> 6b3bbc3210622ced7b923b96a9890293539c7dc0` 安装。生产库 `integrity_check` 为 `ok`；`touchline-manager.service`、Caddy和`touchline-backup.timer`均为active，服务重启计数0。本机与公网 `/api/health` 返回该 build；公网首页、JS和CSS均为HTTP 200，下载的资源包含体力文案与样式。

PR合并前 Node 22/24 CI通过；本机77项冒烟/针对性检查、类型检查和生产构建通过。此为界面展示改动，`match=false`、`season=false`，没有运行比赛或赛季模拟。

## 2026-10-26 发布：0.43.0-counter-runs

部署 PR #64，合并提交及生产 build 均为 `b376ad42652a17c5f73ca33b08a74c55fb8d3163`，引擎版本 `0.43.0-counter-runs` / `counter-runs-1`。本次将0.41战术差异、0.42防守协同与0.43反击身后球增强一并上线；没有数据库迁移、存档改写或历史比赛重算。

部署前7个比赛任务均已完成。停服前一致 SQLite 快照为 `/var/backups/touchline-manager/touchline-2026-10-26T05-06-45-282Z.sqlite`，离机副本为 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-pre-counter-runs-043.sqlite`，大小141,860,864字节。VM与离机副本 SHA-256 均为 `4272f163ecb1e225b76d27f4550d8c08829c112431797c0d16c4ac8cde9f650d`；离机副本 `integrity_check` 为 `ok`。部署前后均为33个存档、62份战报、7个已完成比赛任务；安装脚本另生成 `/var/backups/touchline-manager/touchline-2026-10-26T05-08-13-806Z.sqlite`。

发布归档 SHA-256 为 `1c93d7b96c3f5c4640ee7c4c1d5e336c96bb5915d22a5811ed88da9c6ef3beab`，通过 `/bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> b376ad42652a17c5f73ca33b08a74c55fb8d3163` 安装。部署后 `touchline-manager.service`、Caddy与`touchline-backup.timer`均已启用；备份timer已有下一次计划运行时间。生产库 `integrity_check` 为 `ok`。本机与公网 `/api/health` 均返回 build `b376ad42652a17c5f73ca33b08a74c55fb8d3163`。旧发布仍保留用于代码回滚。

PR合并前 Node 22/24 CI均通过；本机142项检查、16项真实引擎/API/检查点集成、类型检查和生产构建通过。十场校准为4 pass、6 review、0 block，无分布告警；高压反击样本仅有2次身后球尝试且均未接成，不能据此宣称整场比赛已完成现实性校准。此次为比赛算法改动，已执行比赛专项，没有模拟赛季。指标口径、剩余偏差和样本限制见[反击跑位复核](../packages/shared/modules/matches/design/COUNTER_RUNS_V0430.md)与[验证记录](VALIDATION.md)。

## 2026-10-26 发布：0.40.0-workload-fatigue

部署 PR #62，合并提交及生产 build 均为 `65f8d51f3d7b4c18d63aceb34cbd2ae8b9e4ec84`，引擎版本 `0.40.0-workload-fatigue` / 参数 `workload-fatigue-1`。赛内耗能按个人真实位移、冲刺启动和身体接触累计；力量/耐力影响体能消耗效率与七日恢复。无数据库迁移、存档改写或历史比赛重算。部署前全部7个比赛任务已完成；停服后生产库仍为31个存档、7个完成任务，部署后数量不变，`integrity_check` 为 `ok`。

部署前一致 SQLite 快照为 `/var/backups/touchline-manager/touchline-2026-10-25T14-47-33-986Z.sqlite`，离机副本为 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-2026-10-25-pre-workload-fatigue-0.40.sqlite`，大小136,060,928字节；VM与本机 SHA-256 均为 `f3ac82040937038c960095fc765681592f94834bf564e9ca36f3a2bb3c6d4aa2`，离机副本 `integrity_check` 为 `ok`。安装脚本另生成部署快照 `/var/backups/touchline-manager/touchline-2026-10-25T14-48-55-720Z.sqlite`。

发布归档 SHA-256 为 `dea0c9d041dbb0c2091788a7b286844bda1e93521a04fcc5d76392fe9e67cb28`，通过 `/bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> 65f8d51f3d7b4c18d63aceb34cbd2ae8b9e4ec84` 安装。部署后生产库 `integrity_check` 为 `ok`；`touchline-manager.service`、Caddy和备份timer均为active，服务重启计数0。公网与本机 `/api/health` 返回该build，公网首页和客户端JS均为HTTP 200。旧发布仍保留用于代码回滚。

PR合并前 Node 22/24 完整检查通过（分别10分40秒、9分16秒）；本机 `npm run check:quick`通过132项、类型检查与生产构建。比赛现实校准为四战术×两种子8场，2 pass、6 review、0 block；review均为已有低速跑动占比告警，不跑完整赛季。分位置统计、恢复公式与样本限制见[0.40体能校准](../packages/shared/modules/matches/design/MATCH_WORKLOAD_V0400.md)。

联赛球员榜发布只增加一个会话内只读API和有界进程缓存，没有schema迁移、数据批处理或新增服务。部署后应检查带同一存档Cookie访问`/api/league-player-leaders`返回当前赛季覆盖数，换存档时数据隔离，并确认未结算比赛不会进入榜单；不需要推进赛季或重算比赛。

## 2026-10-25 热修：排行榜聚合内存

排行榜读取器原先先解压并保留本赛季全部详细战报，再统一汇总。生产最大存档含43份详细归档，解压数据合计173,359,106字节，单份最大6,112,889字节；在Node老生代128 MiB限制下造成堆内存耗尽，服务先后自动重启3次，期间Caddy返回502。PR #60 改为逐场读取并立即汇总，不改统计口径、存档格式、缓存键或游戏流程。

部署提交与生产build均为 `33c997a1f44675bd998075060e54513f25822c9b`。发布归档 SHA-256 为 `e1a7759d9ea60da092d6932f0f38763f109dad19ddedbeb1ee15c79f88ef33b5`，通过 `/bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> 33c997a1f44675bd998075060e54513f25822c9b` 安装。部署前一致SQLite快照为 `/var/backups/touchline-manager/touchline-2026-10-25T12-35-27-303Z.sqlite`，离机副本为 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-2026-10-25-pre-leaderboard-memory-0.39.1.sqlite`，124,375,040字节；两份 SHA-256 均为 `fa0caf19c11382994d4f4ef07ae58409700c2226c7b4222138642181ade354db`，离机副本 `integrity_check` 为 `ok`。部署前后存档/详细报告归档/比赛任务为31/50/7；安装脚本另生成部署快照 `/var/backups/touchline-manager/touchline-2026-10-25T12-37-42-928Z.sqlite`。

部署后用同一只读聚合读取器、实际生产中报告数据量最大的存档和相同128 MiB Node堆上限核验，返回20/20场和96条球员统计；服务未再次重启。生产库 `integrity_check` 为 `ok`，`touchline-manager.service`、Caddy均为active，重启计数0。本机与公网健康接口、公网首页和JS资源均为HTTP 200，并返回该build。按用户要求未操作其桌面浏览器。

PR合并前 Node 22/24 CI通过；`npm run check`通过（62项冒烟/业务检查、类型检查和生产构建）。新增低内存回归在64 MiB堆上处理43份各4 MiB的报告并通过。此次只修服务端读取内存峰值，不涉及比赛算法或重大游戏流程，因此没有模拟比赛或赛季。

## 2026-10-25 发布：0.39.0-shot-plane-aim

部署 PR #58，合并提交和生产 build 均为 `3c825100114e24b08d0bb457fab6e88392647308`，比赛引擎版本 `0.39.0-shot-plane-aim`、参数 `shot-plane-aim-1`。发布包含联赛球员榜和近角射门目标平面修正；射门目标与整球越过门线的判定对齐，不改射门选择、球员能力或射门配额。没有数据库迁移、存档改写或历史比赛重算。部署前所有7个比赛任务已完成。

部署前一致 SQLite 快照为 `/var/backups/touchline-manager/touchline-2026-10-25T11-44-29-413Z.sqlite`，离机副本为 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-2026-10-25-pre-shot-0.39.sqlite`，124,375,040字节。VM与离机副本 SHA-256 均为 `fa0caf19c11382994d4f4ef07ae58409700c2226c7b4222138642181ade354db`；离机 `integrity_check` 为 `ok`；部署前后存档/战报/比赛任务数为31/50/7。安装脚本另生成部署备份。

发布归档 SHA-256 为 `a91e47dca3c79f7ee8f9c3fc1c31e3f26fedbf1ffe57caaa800af945e101c8b7`，调用 `/bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> 3c825100114e24b08d0bb457fab6e88392647308` 完成安装。部署后生产库 `integrity_check` 为 `ok`，`current` 指向上述 build；`touchline-manager.service`、Caddy及备份timer均为active，服务重启计数0。本机和公网 `/api/health` 返回该 build，公网健康接口、首页和客户端 JS 均为HTTP 200，客户端资源包含联赛球员榜。按用户要求未操作其桌面浏览器，因此本次以HTTP及资源响应核验部署，没有记录浏览器交互检查。

PR合并前 Node 22/24 CI均通过。`npm run check:quick`与完整`npm run check`通过；后者含131项单元/业务测试、16项真实引擎/API集成、类型检查和生产构建，真实比赛集成约516秒。四战术×种子999/1001的八场同输入比较为2 pass、6 review、0 block，无分布告警；review仍有低速跑动及个别传球/射门提示，样本不支持宣称整体现实性已通过。射正均值4.875→5.375/场，进球3.125→2.625/场；小样本比分方差4.696→0.839。未模拟赛季；完整口径与限制见[射门几何复核](../packages/shared/modules/matches/design/SHOT_AIM_V0390.md)。

## 2026-10-24 发布：0.37.0-boundary-touch-statistics

部署 PR #54，提交及生产 build 均为 `7334e59118679186e27753a4680e2191a913747c`，引擎参数 `boundary-touch-1`。部署修正持续带球脚触后的边线制动，并将重复步态触点从玩家常规触球统计中分离；没有数据库迁移、存档改写、历史比赛重算或游戏流程变更。部署前所有7个比赛任务均已完成。

发布前 SQLite 快照为 `/var/backups/touchline-manager/touchline-2026-10-24T11-01-25-703Z.sqlite`，离机副本为 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-2026-10-24-pre-boundary-touch-0.37.sqlite`，118,444,032字节。VM与离机副本 SHA-256 均为 `5344482edbf57f3adbb4b9c541d4dedb5e1ff5e720a44d02609364120e8fe724`；离机 `integrity_check` 为 `ok`，部署前后存档/战报/比赛任务数为31/46/7。安装脚本另生成 `/var/backups/touchline-manager/touchline-2026-10-24T11-03-09-811Z.sqlite`。

发布归档 SHA-256 为 `33abba365bb1f49835e34f931a76e6af4395a7131d3ab201a0fa54116885bb87`；通过显式调用 `/bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> 7334e59118679186e27753a4680e2191a913747c` 安装，未更改发布脚本或权限。部署后生产库 `integrity_check` 为 `ok`，current 指向上述版本；`touchline-manager.service`、Caddy、备份timer均为active。本机与公网 `/api/health` 返回该build，公网健康接口和首页均为HTTP 200；新客户端资源包含“有效触球”“物理触点”和“带球推进”文案。临时发布归档和备份中转副本已清理。

PR 合并前 Node 22/24 的完整 `npm run check` 均通过。最终四战术×两种子比赛样本4 pass、4 review、0 block且无分布告警；review项仍是低速跑动占比诊断，详见[0.37.0比赛核验](../packages/shared/modules/matches/design/BOUNDARY_TOUCH_V0370.md)。未模拟赛季，开发和发布流程不变。

## 2026-10-24 发布：0.36.0-situational-sprint

部署 PR #52，合并提交及生产 build 均为 `84392fdb8fa923c2a401e24f5e2a7ce6cfbeed1e`，检查点参数 `sprint-intent-1`。无数据库迁移、存档改写或游戏流程变化；部署前后生产 SQLite 完整性均为 `ok`，存档/战报/完成任务保持31/42/7。公网页面返回HTTP 200，公网与本机健康接口返回相同 build；`touchline-manager.service`、Caddy及备份timer均为active，服务重启计数0。真实浏览器的新标签已加载俱乐部总览，未推进赛季。

发布前离机一致SQLite备份保存在本机私有目录 `C:\Users\siyan\Documents\Codex\private-backups\touchline-manager\touchline-2026-10-24-pre-situational-sprint.sqlite`，111,288,320字节，SHA-256 `b64cac0ddba0ee636cedc3e41a4b4a9834047014a402b22dc8aacba680989cf4`，本机副本 `integrity_check` 为 `ok`，且核对31/42/7数据未变。VM保留快照 `/var/backups/touchline-manager/touchline-2026-10-24T09-55-19-695Z.sqlite`；安装脚本另生成 `/var/backups/touchline-manager/touchline-2026-10-24T09-56-28-316Z.sqlite`。临时发布归档与中转备份已从VM临时目录精确清理。

本次打包的归档SHA-256为 `316B8772CD4492E905165F8E2E571CF8D5EF415BF1D84A1A09B2F682C1997829`。远端安装脚本没有可执行位，直接执行返回权限错误；通过显式调用 `/bin/bash` 完成同一安装流程：`sudo -n /bin/bash /srv/touchline-manager/current/deploy/install.sh <archive> 84392fdb8fa923c2a401e24f5e2a7ce6cfbeed1e`。这只记录本次命令，不更改发布流程或仓库脚本权限。CI Node 22/24及完整检查均在合并前通过；比赛样本4 pass、4 review、无block，数据偏差与验证限制见[比赛校准记录](../packages/shared/modules/matches/design/SITUATIONAL_SPRINT_V0360.md)。

## 2026-10-24 发布：0.35.0-fatigue-calibration

部署 PR #49，提交 `f32522e70b4025db611d20d3ae4ce268b46d98c0`，比赛体能参数版本 `physiology-2`。不含数据库迁移、存档改写或游戏流程变化。部署前所有7个比赛任务均已完成；离机SQLite备份 `touchline-2026-10-24-pre-fatigue-0.35.sqlite` 大小111,288,320字节，SHA-256 `b64cac0ddba0ee636cedc3e41a4b4a9834047014a402b22dc8aacba680989cf4`，本机副本与服务器一致且 `integrity_check` 为 `ok`。安装脚本另生成部署前快照 `touchline-2026-10-24T06-18-47-101Z.sqlite`。

部署前后生产库均为31个存档、42份战报、7个已完成任务；部署后生产库 `integrity_check` 为 `ok`。生产 `current` 指向上述提交；`touchline-manager.service`、Caddy和备份timer均为active，服务重启计数0。本机和公网 `/api/health` 均返回该提交，公网首页HTTP 200，真实浏览器已加载俱乐部总览。部署前完整检查与 Node 22/24 CI 在PR合并前通过；比赛专项为固定4种战术×2个种子，8场均完成。

本版疲劳成本加倍后，8场样本的末段平均体能从85.05降至63.79，冲刺距离从201米/球员/90分钟降至133米；总跑动距离从9,048降至9,008米，传球数从531增至544，完成率保持约85.5%。所以体能消耗改善明显，但比赛阶段仍约14.35秒，按5倍播放约2.87秒经过一个阶段；传球/控球节奏并未因此放慢。前锋和边前卫的高速跑动仍高于欧洲基准，节奏问题仍需继续从持球推进、无球压迫和阶段转换诊断，不能把本版当作已解决比赛节奏。样本、方差和角色差异见[体能校准报告](../packages/shared/modules/matches/design/MATCH_FATIGUE_CALIBRATION_V0350.md)。

## 2026-10-23 发布：0.34.0-contact-referee

部署 PR #47，生产 build `c98c72ee368efc0eaa85a460cb9c658982777388`。针对持球者与追防者的真实身体接触增加裁判判定，并以欧洲多联赛及杯赛资料复核比赛数据；没有数据库迁移、存档重写或游戏流程变更。比赛专项32场对照及固定八场检查均完成，结果总体为review（无block）：犯规更接近参照但仍偏低，射门仍偏多，角球与黄牌仍偏少。详细样本、方差与未解决偏差见[欧洲比赛数据基准与0.34算法复核](../packages/shared/modules/matches/design/EUROPEAN_MATCH_REALISM_20261023.md)。

部署前排空并核对7个比赛任务均已完成，制作SQLite一致快照并复制到开发机私有备份目录。远端与本机副本SHA-256相同，`integrity_check`为`ok`，关键表指纹与停服快照一致；部署前后生产数据指纹也一致（任务/战报/存档为7/38/30）。生产`current`切换至上述build；touchline-manager、Caddy和备份timer均为active，服务重启计数0。本机与公网`/api/health`均返回该build，公网首页HTTP 200。完整检查与Node 22/24 CI在PR合并前通过。旧发布保留用于代码回滚。

## 2026-10-22 发布：0.31.1-role-aware-pass-balance

部署提交 `df0138b236e7078106e6a11bd19e5d0ba74fa4e6`，PR #45。仅调整安全中场接应选项权重上限，比赛引擎版本升级；无数据结构迁移、无存档重写，不改单worker、512MiB限制或备份计时器，四场并发仍关闭。算法验证在本机使用四种战术×两个固定种子；完整检查和CI Node 22/24通过，详细分布与限制见matches模块V0311设计记录。

上线前排空并核对7个比赛任务均已完成，停服制作一致SQLite备份；备份在VM与开发机分别通过`integrity_check`，SHA-256一致。切换后健康接口、公网入口和真实浏览器页面均确认build为该提交；touchline-manager、Caddy与备份timer为active，服务重启计数0。生产库完整性通过，比赛任务/战报/存档数保持7/38/30。离机数据库备份保存在开发机的私有备份目录，不在仓库中。

0.30.0-statistics/physiology-1发布先排空0.29及更早全部未完成任务（含airing），停服一致备份并离机核验后再切换。无数据库迁移/存档批量更新，旧报告与评分不重写；校验原表逻辑摘要、SHA、健康、原战报/轨迹与浏览器新统计展示。单worker、原512MiB限额、5×与备份计时器保持，禁止启用暂缓的四场候选。

0.29生产Node增加4MiB半空间、单任务WASM编译和按需WASM编译，原128MiB老生代/512MiB服务限额保持。旧0.28实例曾反复触及内存上限，当前任务已排空；上线检查新运行参数、重启次数和memory.events。tests/match/worker.test.mjs直接读取发布参数，在独立Node/真实worker中跨半场检查点恢复并与默认模拟逐事件/逐帧比较；不据短段测试声称完整并发容量，也不启用四场。此为运行资源设置，不改开发/验证流程。

0.29.0-physiology / physiology-1更新体能与周间恢复，发布前先排空旧引擎任务（含airing）、停服做新的离机一致备份并核验，再切换。无数据库迁移或自动存档修复，旧球员/历史BLOB保持；按天恢复仅作用于下一次合法轮次。原逐场调度、512MiB限额、备份计时器和5×不变；核对健康/SHA、原存档/战报/回放及浏览器后保留旧发布回滚。

0.28.0-boundary只改边界控球：无JSON/SQLite迁移、无incremental-v1或四场执行层。先排空0.27旧任务（含airing），停服做新的离机一致备份并核验，再切换；旧回放不重算。现机MemoryMax=512MiB保持，所有临时容量服务/恢复计时器应退出且不自启，四场暂不开启。失联与旧任务恢复的证据见server/design/CAPACITY_V0280_20261020.md；恢复时不要用新引擎强接旧检查点。原发布流程保持。

2026-10-20观看修补保持引擎0.27及全部检查点内容，只减轻展示进度/读取和浏览器绘制。发布仍先备份离机核验，核对SHA、旧存档/战报/轨迹；不需要重抽或重算比赛。排查卡顿时分别测量生成相对播放的领先量、progress字节数、cgroup memory.events/max和浏览器面板更新，不能只用短场生成速度判断观看是否流畅。只读解析缓存不得在数据库写入失败时推进持久时钟。

0.27.0-control-model / control-model-1新增持球动作、脚朝向和压迫观察等检查点字段，沿通用actor序列化，无数据库迁移/新服务。发布前须排空所有旧引擎任务（含airing），一致备份离机核验后再切换；旧检查点不能交给新引擎。原报告/轨迹保持字节不变，团队阶段新定义只用于新报告。核对build、公网页面、原存档/回放及新引擎短段，保留上一release回滚；既有发布流程不变。

0.26.0-possession-screen将第一上抢者的近身站位目标从0.35米改为持球者前方1.05米，JSON/SQLite与回放结构不变。发布前排空全部旧引擎未完成任务并验证离机一致备份；旧检查点不能由新引擎恢复。上线后核对health build、公网浏览器、现有比赛回放/战报及任务队列；保留前一发布目录用于代码回滚。八场比赛证据和仍未解决的短控球分布见比赛模块`design/POSSESSION_V0260.md`。发布流程不变。

0.20.0候选采用引擎`0.20.0-possession`/参数`possession-1`，没有数据库迁移或新的服务依赖。发布前排空0.19.2及更早版本的所有比赛任务（包括airing）并验证离机一致备份；新引擎不能恢复旧检查点。安装后核对本机/公网health build、旧战报/轨迹不变、完成比赛的持球片段与真实抢断统计、回放关键事件和真实浏览器比赛流程；保留原发布目录供代码回滚。

0.17执行状态包含连续朝向和传射准备，沿用actor通用检查点序列化；新任务仅由0.17.0-execution/execution-1恢复。发布仍须先排空旧运行/airing任务、离机验证备份，再切换；保留0.16.1回滚目录，旧战报/轨迹不重写。仅补充本版兼容注意事项，原部署与验证流程不变。

0.16.0发布先排空所有旧任务（含airing），一致备份离机校验后再切换；新检查点只由0.16.0-realism/realism-1恢复。新增遥测/负荷无数据库迁移，旧存档/战报/回放逐行保留；1GB VM不并行运行校准/多个Rapier测试进程。正式服务限额不变，本机完成完整比赛/恢复验证，VM仅做内存受限的短场探针及公网真实浏览器检查；保留0.15.1回滚目录。

0.15.1发布仍先排空所有旧任务并验证离机一致备份；新归属检查点仅用0.15.1-attribution恢复。独立球路投影不改变Rapier参数，无新依赖/服务。旧存档/战报不重写；保留上一release，检查健康/SHA/战报关键传球及正常终场发布。

0.15.0增加可选训练/职员/生涯字段而无启动迁移，发布不重写存档或历史BLOB；等待比赛任务完成后备份并验证离机副本，再替换发布目录。仍单服务/单worker，不增加依赖。旧版本不能理解已保存的training.version2，发生回滚须保留新库并按既有备份恢复规程处理，不能静默丢弃新训练数据。HTTP公开读取不建立持久字段，初次使用由合法写操作建立。

0.14.0新增连续领球与近控/快带、共享到达预测、有限候选空位选择及有条件的盯防观察失误，死球自然移动、进球庆祝后跑回开球位。引擎0.14.0-movement/movement-1；既有球阻力、限速、真实触球、5×、结算及评分保持。详见[运动设计](../packages/shared/modules/matches/design/MOVEMENT_V0140.md)。

发布前排空所有旧引擎运行/airing任务、停止服务、验证离机一致备份后切换；新引擎不能恢复旧检查点。actor通用序列化保存盯人/接应记忆，state保存deadState；JSON/SQLite3与历史行不迁移。回退前同样排空新任务，保留旧release和完整备份。

0.13.0在既有发布保护下显式取整：确认所有job已完成、停止服务、验证一致离机备份后，用新release的scripts/player-integers.mjs plan DB PLAN.json只读生成计划，再apply DB PLAN.json事务执行。计划陈旧/新增存档/活跃任务拒绝；只改当前能力/技能缓存及revision，不改历史/资金/阵容。无启动自动维护；回滚前保存新进度，完整数据回滚用prebackup。发布流程不改。

0.12.0发布不做离线球员重塑或启动数据迁移：原存档真值、球星、轨迹和历史BLOB保留，新增知识在后续合法动作初始化。发布前后取一致SQLite备份并校验旧行；旧release可忽略可选assessment，完整回退用发布前备份。API隐藏原始属性/种子，不要因排查问题把真值重新开放。原备份/部署/回滚流程不改。

## 0.11.0 属性分布发布与观察名额

原引擎不变。先排空所有未complete比赛，停服务并验证完整离机一致备份。新发布的scripts/player-profiles.mjs支持`plan DB TARGET_SEED PLAN.json`与`apply DB PLAN.json`；目标seed须唯一识别用户存档，计划保密留在数据/临时目录，不能入Git。该维护现也会将已有99号球员的0/缺失工资修为通用工资（综合95为£1,800/轮），计划会明确显示wageRepairs，且仅更新工资和revision；不会自动执行。先在备份的隔离副本执行并核对原历史/经济/身份及预期属性、首发变化，再对停止的生产库执行同一确定性逻辑。新脚本不接HTTP、不挂服务启动、不更改开发流程。

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

在本机执行 npm ci、npm run check、提交并推送。生产归档包含packages/server、packages/shared、scripts/backup.mjs、scripts/player-integers.mjs、scripts/player-profiles.mjs、dist/client、package.json、package-lock.json、deploy；不打包凭据、运行数据或node_modules。上传VM临时目录，运行deploy/install.sh <archive> <commit>。安装脚本执行npm ci --omit=dev --ignore-scripts --no-audit --no-fund，仅安装锁定的运行依赖，Rapier的WASM随包提供，无需编译工具。

安装脚本在已存在数据时先备份；校验 Caddy 配置、重启服务并检查本机健康。公网验证 /api/health 的 build 必须匹配提交。保留上一发布目录用于回滚；恢复current及对应BUILD_SHA，涉及运行配置的发布须同时恢复旧release的systemd unit并daemon-reload后重启，数据结构变更需另行迁移。

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

## Ink 美术与三阶段头像发布注意

本版仅客户端素材/主题，无服务端、存档或历史迁移。按既有流程先排空任务、记录当前 build，对当前保留的用户存档及六张表做一致备份和指纹；离机核验后部署本地构建。校验公网 build、头像与真实浏览器布局，并确认用户原存档及战报/轨迹逐字节保留。浏览器验收如产生独立的临时匿名存档，只清理准确识别的本次验收存档，最终仍仅保留用户指定存档。不得为了验收推进用户比赛。运行限额和单 worker 不变。
