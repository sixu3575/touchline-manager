# 客户端集成入口

main.tsx组合会话、导航、模块页面与公共弹层；功能实现留在各自modules目录。所属integration，遵守根AGENTS与modules.json。不要在集成入口复制比赛/球员领域规则。

界面版本从根package.json的version读取，避免补丁发布后仍显示旧版本；Vite按需打包该字段，TypeScript已有resolveJsonModule。版本显示不作为后端已部署的唯一证据，发布仍核对/api/health的版本及build SHA。

改动此目录集成代码时同步CHANGELOG。开发流程仅有根AGENTS载明的用户批准范围，其余约束不变。
