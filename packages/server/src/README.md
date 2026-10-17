# HTTP与比赛计算

index.mjs拥有会话、动作验证、SQLite事务与静态文件。simulation-pool.mjs仅管理一个worker和最多两个排队任务；worker执行服务端权威规则，不直接访问数据库。计算先于事务，提交时必须重新校验revision和requestId，不能把旧计算结果覆盖新状态。

storage/replays.mjs压缩和保存轨迹，必须与状态/操作记录使用同一事务。读取轨迹只用现有Cookie对应save_id，禁止仅凭report_id跨存档访问。不得把原始trajectory放进状态JSON或日志。

修改本目录同步CHANGELOG与docs/ARCHITECTURE、DATA、OPERATIONS。已有开发流程不变。生产单worker适配小VM；扩容、认证和共享多人世界需要独立设计。

0.4.0注意：服务版本0.4.0，沿用现有worker、revision/请求去重事务与隔离轨迹入口；启动迁移由storage负责。

0.5.0注意：服务健康版本更新至0.5.0；继续既有worker、事务与请求保护，不新增服务或改变发布流程。
