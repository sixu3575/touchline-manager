# 存档迁移模块

2026-10-20：jobs.presentation/owned/latest仅供展示，不返回work；恢复或调度须使用get/pending。progress.report仅为可压缩的展示副本，完整模拟状态和报告以work/checkpoint及归档为准。无表结构或启动迁移；旧进度仍可读取，逐片生成时自然使用更轻副本。

0.9.0：replays.persist在原有事务内将withPlayerRatings生成的完整战报压缩，summary剥离playerRatings。GET旧战报可补评分响应，但不更新历史payload；新报告已带版本时原样返回。无schema升级，无轨迹重算；评分不是资金/比赛结算输入。专项tests/player-ratings.test.mjs检查原BLOB、隔离、事务回滚和摘要体积边界。

migrateState 为复制后迁移，migrateDatabase 在单个 BEGIN IMMEDIATE 事务升级所有旧档。仅接收支持的版本；遇到未知版本启动失败并回滚，禁止重建存档。生产发布前沿用既有部署备份。

0.3.0增加replays.mjs管理独立压缩轨迹表；user_version=2与JSON schemaVersion=2独立。persist必须在状态提交的现有事务内执行；失败一起回滚。未知更高表版本拒绝启动，备份使用VACUUM INTO包含所有表。

0.4.0注意：新增JSON 1/2→3原子迁移，仅当前球员补适应度100、revision+1；旧报告与replays BLOB保持。表版本仍2，未知JSON版本拒绝启动。回滚需使用发布前完整数据库。

## 0.6.0 注意事项

SQLite表版本升至3，新增match_jobs和match_chunks，JSON仍为3；旧saves/operations/replays不改写。gzip+V8存储输入和检查点，按序保存uint16轨迹片段；最终按序解压片段后重新压为单个gzip成员，兼容浏览器完整解码，保持原49值帧编码。仅保留最近3个完成任务的观赛数据，正式历史回放保留原35份规则。VACUUM INTO自动包含任务和片段。注意回滚0.5需发布前完整数据库；不能只切回不认识表3的代码；未完成任务要用原Node/Rapier/引擎版本恢复。

开发流程保持原样；本次只更改产品和运行实现。
match_reports属于表版本3：仅新eventFormatVersion>=3战报压缩离开state.reports，摘要含detailsStored，读取完整战报与轨迹分别鉴权；旧报告不改写，35场清理规则相同。所有写入仍在结算事务内。

## 0.7.0 · 2026-10-18

jobs.progress新增broadcast锚点、chunkEnds和computedAt，status增加airing；不改SQLite表3或JSON3。单独更新时钟必须保留work原字节；全轮报告暂存后，播放终场才原子提交正式save/report/replay/operation。失败发布从原work重试，不重算。waiting仅取queued/running，本队优先并按最近片段时间轮转，airing不占worker但仍锁定存档。

观看与恢复契约：packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md；入口在根PROJECT.md。改动同步本模块记录，遵守已批准的分层验证；开发流程不变。
