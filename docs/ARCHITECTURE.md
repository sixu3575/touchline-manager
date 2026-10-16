# 架构

## 单体部署

浏览器 → Caddy :80 → Node 127.0.0.1:3100 → SQLite WAL。

界面在开发机编译。生产运行无需 node_modules，只使用 Node 内置 HTTP、crypto、fs 与 sqlite。约 1GB 内存的 VM 不承担 TypeScript/Vite 构建。Node 22 的 sqlite 仍可能输出实验性提示，发布前必须同时在 Node 22/24 上验证。

## 状态与事务

每位经理拥有一个独立世界，包括 8 支球队、赛季、资金与市场；不是共享多人世界。唯一状态 owner 为服务端。

客户端请求 `{type,payload,requestId,revision}`。服务端验证来源和结构，开启 BEGIN IMMEDIATE，检查操作唯一键、请求内容摘要与版本，执行规则，再同一事务写入状态与操作记录。没有网络等待出现在事务中。

比赛 simulate(home,away,seed,id) 不访问数据库、系统时间或网络。UI 回放读取持久化事件，不运行引擎。球场动画是位置示意，不是物理运动模拟。首版比赛短计算同步执行，后续只有测量到阻塞才引入受限 worker。

## 访问保护

匿名随机 256 位 Cookie 是存档访问凭据；数据库仅保存 SHA-256 摘要。Cookie 为 HttpOnly + SameSite=Lax，HTTP IP 试玩未设 Secure。会话不通过 URL 或 API JSON 泄露。跨来源写请求拒绝；每 IP 每分钟限流、请求体 8KB 上限、静态路径边界与 CSP。

后续账号须另立认证设计；不要把试玩会话称为完整账号安全方案。

## 模块边界（0.2.0）

领域逻辑在 packages/shared/modules/，仅从公共 index.mjs 导入；core 不反向引用领域，依赖图受 modules.json 与现有测试约束。game.mjs 保留外部兼容入口与动作路由，减少调用方迁移。球员档案、训练、比赛结算中的球员更新由 players 公共函数统一维护；其他模块不复制属性公式。球员界面与样式位于 client/src/modules/players，训练界面位于 modules/training。

服务端启动迁移由 storage/migrations.mjs 独立维护，先事务升级再接收请求。前端各功能页在对应 modules/ 目录；共享主题和 ui 仍由 integration 负责，页面新增样式使用各自文件与前缀。目录级 README/CHANGELOG 是交接入口；协作冲突机制见 COLLABORATION.md。本次不改变既有开发流程。
