# matches 界面模块

公共入口 index.ts；实现从原 components/pages 提取，旧路径保留兼容导出。领域规则由 shared/modules/matches 公共接口维护，不复制球员或比赛公式。修改此目录后同步 CHANGELOG.md，开发流程不变。

0.3.0：Replay按report.replay选择PhysicalReplay或LegacyReplay。PhysicalPitch只绘制保存位置，5Hz采样间线性插值，cut帧不跨重开插值；球高和落地阴影分开。轨迹通过同会话/api/replays/:id按需加载、校验长度和格式；失败可重试。旧报告无轨迹时保持旧示意回放，删除了假跑动摆动。

回放坐标和编码契约见shared比赛模块design/PHYSICAL_ENGINE_V1.md。不要在前端加入Rapier或重新模拟历史比赛；不要将倍率播放称为直播。新增样式留在physical.css。

0.4.0注意：回放新增关键/裁判/全部动作筛选、动作质量解释、纪律与心理统计、红牌时间点隐藏、物理点球阶段时钟；比分独立于筛选器计算，旧回放格式兼容。
