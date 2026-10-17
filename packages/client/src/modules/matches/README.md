# matches 界面模块

公共入口 index.ts；实现从原 components/pages 提取，旧路径保留兼容导出。领域规则由 shared/modules/matches 公共接口维护，不复制球员或比赛公式。修改此目录后同步 CHANGELOG.md，开发流程不变。

0.3.0：Replay按report.replay选择PhysicalReplay或LegacyReplay。PhysicalPitch只绘制保存位置，5Hz采样间线性插值，cut帧不跨重开插值；球高和落地阴影分开。轨迹通过同会话/api/replays/:id按需加载、校验长度和格式；失败可重试。旧报告无轨迹时保持旧示意回放，删除了假跑动摆动。

回放坐标和编码契约见shared比赛模块design/PHYSICAL_ENGINE_V1.md。不要在前端加入Rapier或重新模拟历史比赛；不要将倍率播放称为直播。新增样式留在physical.css。

0.4.0注意：回放新增关键/裁判/全部动作筛选、动作质量解释、纪律与心理统计、红牌时间点隐藏、物理点球阶段时钟；比分独立于筛选器计算，旧回放格式兼容。

0.5.0注意：回放默认1×实速，新增轨迹球速（cut重开不计算）、球风、带球/直塞/长传/一脚出球及决策理由；兼容旧报告缺少新增字段。

## 0.6.0 注意事项

新增useMatchJob/MatchTask，SSE重连与序号补片，实时画面12×默认、生成/观看双进度、缓冲/暂停/跟随最新/已生成历史进度和后台切换。PhysicalReplay兼容传入进行中轨迹；比分/事件按播放时间，统计只使用不晚于播放时刻的阶段快照并标记时间，避免全场剧透。后台结束可完整拖动/调速/射门跳转。注意客户端仅插值，不能补算物理或把已完成画面描述成仍在计算；旧报告继续原解码。

开发流程保持原样；本次只更改产品和运行实现。
新历史报告detailsStored为摘要，必须先由Replay读取/api/reports/:id，再交给PhysicalReplay；不能直接把空events/snapshots摘要当完整回放。实时任务已经携带完整阶段数据，不走历史详情加载。
