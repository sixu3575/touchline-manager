# 架构

`GET /api/league-player-leaders`是当前会话的只读派生查询：服务端逐场读取本赛季已结算联赛详情并立即交给competitions selector聚合，避免整季解压战报同时占用堆内存；客户端不为每场战报发起详情请求。API不读取直播中的任务报告、不开放AI比赛回放，也不把原始球员能力或比赛诊断发给客户端。聚合以存档revision作有界进程内缓存键。

0.12.0新增players/assessment.mjs纯知识规则（经公共index.mjs导出）与server/player-view.mjs统一DTO边界；引擎不导入知识规则。原状态/任务/档案只在出站投影，SQLite仍保存原真值与调试信息。客户端不能上传真值或评估对象，staff/scout动作仍按原事务执行。

开发验证与生产分离：业务测试仅通过显式Node测试预加载提供受控比赛报告，生产HTTP、SQLite、计划与结算不替换；生产没有fixture环境变量/HTTP/存档开关。真实引擎及完整物理赛季按[分层规则](VALIDATION.md)有条件运行，测试重组不改变下述运行架构。

## 单体部署

浏览器 → Caddy :80 → Node 127.0.0.1:3100 → SQLite WAL。

界面在开发机编译。Node内置HTTP/SQLite服务加单个比赛worker；生产安装锁定的运行依赖Rapier WASM，不安装开发依赖。约1GB内存VM不承担TypeScript/Vite构建。Node22的sqlite仍可能输出实验性提示，发布前继续在Node22/24验证。

## 状态与事务

每位经理拥有一个独立世界，包括 8 支球队、赛季、资金与市场；不是共享多人世界。唯一状态 owner 为服务端。

客户端请求 `{type,payload,requestId,revision}`。普通动作在事务中执行。advance/cup返回202与持久任务ID；按存档/赛事/赛季/轮次去重，冻结输入和种子，一个worker分段计算、最多三项未结算任务。计算期间不持有SQLite写锁，同一存档的其他写操作返回409，浏览仍可用。全轮完成后在BEGIN IMMEDIATE中复查revision，原子提交状态、轨迹、操作去重和任务完成。失败或重启保留原检查点，不重抽赛果。

比赛simulate(home,away,seed,id,options)不访问数据库、系统时间或网络；20Hz Rapier3D物理、0.1–0.6秒分层目标更新、5Hz轨迹。0.6.0默认完整5400秒，由worker计算避免HTTP阻塞；每60模拟秒保存检查点/轨迹片段，片段45秒看门狗。SSE只发索引，同会话GET取gzip二进制；客户端可从首段开始插值观看。静止重开不重复求解AI，实际比赛阶段物理质量一致。轨迹从同会话端点单独加载，浏览器只插值显示，老报告使用LegacyReplay。客户端共享只读赛事选择器从competitions/selectors/index.mjs导入；不要通过game.mjs把WASM和比赛编排打进前端。

## 访问保护

匿名随机 256 位 Cookie 是存档访问凭据；数据库仅保存 SHA-256 摘要。Cookie 为 HttpOnly + SameSite=Lax，HTTP IP 试玩未设 Secure。会话不通过 URL 或 API JSON 泄露。跨来源写请求拒绝；每 IP 每分钟限流、请求体 8KB 上限、静态路径边界与 CSP。

后续账号须另立认证设计；不要把试玩会话称为完整账号安全方案。

## 模块边界（0.2.0）

领域逻辑在 packages/shared/modules/，仅从公共 index.mjs 导入；core 不反向引用领域，依赖图受 modules.json 与现有测试约束。game.mjs 保留外部兼容入口与动作路由，减少调用方迁移。球员档案、训练、比赛结算中的球员更新由 players 公共函数统一维护；其他模块不复制属性公式。球员界面与样式位于 client/src/modules/players，训练界面位于 modules/training。

服务端启动迁移由 storage/migrations.mjs 独立维护，先事务升级再接收请求。前端各功能页在对应 modules/ 目录；共享主题和 ui 仍由 integration 负责，页面新增样式使用各自文件与前缀。目录级 README/CHANGELOG 是交接入口；协作冲突机制见 COLLABORATION.md。本次不改变既有开发流程。

## 0.7.0 计算与播出分离

MatchJobs的单worker继续独立计算；server/broadcast.mjs只提供5×持久展示时钟与公开报告脱敏。首段可看，本队15模拟秒切片，AI60秒切片；调度优先未完成的本队，多存档按最近计算时间轮转，正在运行的有界片段先完成。500ms脉冲/SSE维持菜单进度，观赛时按需读取时钟允许的帧，退出不改变播出。

全轮算完进入airing并释放worker，保留输入和报告。到达本队终场才执行原settleCompetition和原子持久化；若AI尚未齐全则继续后台算，画面不阻塞。私有最终数据不能直接展开给HTTP；完整报告和旧chunks路径在提交前不可读取。浏览器仅对已保存坐标插值，短10秒物理缓冲不含未来事件/统计。详情见[0.7契约](../packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md)。没有新增依赖/服务，比赛引擎和现有开发流程不变。
