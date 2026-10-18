# HTTP与比赛计算

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
