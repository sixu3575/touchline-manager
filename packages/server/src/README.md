# HTTP与比赛计算

0.19.1以后新增的回放/现实性诊断默认只留在原始报告的`diagnostics`、`analysis`、`analytics`、`telemetry`或`debug`字段；统一player-view会递归剔除这些字段以及既有运动遥测。除明确要求展示的统计（本次的体能与爆发储备属于显式授权）外，不得将内部分析加入公开DTO。归档报告、比赛任务与状态接口均走该投影。

0.15.0publicState只在克隆上初始化训练/职员默认值；合法动作才持久化。development不出站，训练历史只给delta；staff属性是公开人事资料。回放接口额外校验报告包含本队，AI不存轨迹，旧历史BLOB不改写。

公开DTO新增overall实际总能力值（缺失历史数据为null），其余细项仍由知识投影过滤；不得将overall回写能力或用评估skills替代真实评级。

0.13.0新增显式离线maintenance/player-integers.mjs与CLI，plan/apply/摘要/事务/活跃任务防护，不能接成启动或HTTP重写。player-view隐藏trainingProgress，兼容估值和体能展示取整；历史BLOB只读投影。

0.12.0 player-view.mjs是统一出站投影：state、成功/去重动作、job、archive均必须调用。原始attributes、种子和质量/局部概率/心理调试信息不得发给浏览器；报告先读取原BLOB再投影，不能破坏存储/评分/播放门槛。SSE只有进度索引，轨迹只有坐标。staff/scout仍受原并发/存档锁约束。

0.9.0：仅broadcast.finished时通过matches/ratings/index.mjs生成赛后评分；此前liveReport白名单不带playerRatings。新报告持久化附评分，旧报告GET只生成响应、不写原记录。评分不改MatchJobs接纳/结算或引擎输入；storage/replays的事务与会话边界保持，规则见比赛模块ratings/README.md。

开发验证按[分层规则](../../../docs/VALIDATION.md)。常规测试由显式CLI预加载受控报告，仍使用真实HTTP/SQLite/任务/重启与备份；生产没有fixture开关。真实引擎HTTP链路仅算法变化执行，跨轮业务赛季仅重大流程执行；禁止通过放宽生产限流加速测试。

index.mjs拥有会话、动作验证、SQLite事务与静态文件。simulation-pool.mjs仅管理一个worker和最多两个排队任务；worker执行服务端权威规则，不直接访问数据库。计算先于事务，提交时必须重新校验revision和requestId，不能把旧计算结果覆盖新状态。

storage/replays.mjs压缩和保存轨迹，必须与状态/操作记录使用同一事务。读取轨迹只用现有Cookie对应save_id，禁止仅凭report_id跨存档访问。不得把原始trajectory放进状态JSON或日志。

修改本目录同步CHANGELOG与docs/ARCHITECTURE、DATA、OPERATIONS。已有开发流程不变。生产单worker适配小VM；扩容、认证和共享多人世界需要独立设计。

0.4.0注意：服务版本0.4.0，沿用现有worker、revision/请求去重事务与隔离轨迹入口；启动迁移由storage负责。

0.5.0注意：服务健康版本更新至0.5.0；继续既有worker、事务与请求保护，不新增服务或改变发布流程。

## 0.6.0 注意事项

以MatchJobs替换整轮阻塞任务池：一个worker、最多3个未结算任务、60模拟秒片段/45秒片段看门狗，检查点和进度持久化。相同存档/赛事轮次唯一，重复按钮加入原任务；关闭页面不取消，重启从原种子和检查点继续。暂停观看不暂停计算。计算期间服务端锁住存档写操作，读取/健康仍可用；赛果/轨迹/存档/revision/requestId与任务完成同事务提交。SSE仅发送索引，gzip二进制独立加载，Cookie授权，单存档最多4路观赛连接。任务闲置释放worker。注意引擎版本不一致必须停下恢复原release，禁止重抽；失败任务保留原输入并可重试。

开发流程保持原样；本次只更改产品和运行实现。

## 0.7.0 · 2026-10-18

新增broadcast.mjs，服务端持久5×展示时钟与直播报告白名单。MatchJobs将计算完毕暂存为airing，播放终场后才原子结算；500ms脉冲、重启/离开继续，失败保留原work并可重试发布。本队15秒片优先/轮转，AI60秒后台片；frames接口限制当前帧加10秒插值缓冲，活跃任务原始chunks禁止提前读取。健康版本读取根package版本。

观看与恢复契约：packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md；入口在根PROJECT.md。改动同步本模块记录，遵守已批准的分层验证；开发流程不变。
