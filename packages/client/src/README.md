# 客户端集成入口

全站美术由 integration 的 ink-theme.css 统一覆盖基础样式；模块布局仍归对应模块，不复制赛历或球员规则。StadiumIllustration 为公共原创矢量素材；无需远程图片或服务器渲染。见仓库 docs/ART.md。

main.tsx组合会话、导航、模块页面与公共弹层；功能实现留在各自modules目录。所属integration，遵守根AGENTS与modules.json。不要在集成入口复制比赛/球员领域规则。

界面版本从根package.json的version读取，避免补丁发布后仍显示旧版本；Vite按需打包该字段，TypeScript已有resolveJsonModule。版本显示不作为后端已部署的唯一证据，发布仍核对/api/health的版本及build SHA。

改动此目录集成代码时同步CHANGELOG。开发流程仅有根AGENTS载明的用户批准范围，其余约束不变。

## 0.7.0 · 2026-10-18

集成入口开赛立即打开5×观赛壳，未取得首段时标明赛前站位；所有页面保留比赛进度卡和重入，关闭不取消。终场后重新加载正式存档，赛后详情仍走原历史回放入口。

观看与恢复契约：packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md；入口在根PROJECT.md。改动同步本模块记录，遵守已批准的分层验证；开发流程不变。
