# 模块边界与冲突防护

这是本次用户要求的冲突防护能力说明。既有“分支/worktree → 检查 → PR → 部署”顺序与审批不变，不安装 Git 钩子，不设置自动合并，不改 CI 触发条件。未来优化开发流程必须用户批准。

2026-10-17例外已由用户明确批准：仅将测试文件并行上限固定为4，并将CI触发调整为PR/main push以去重。既有分支/PR/发布顺序、全部检查、Node22/24与冲突保护不变；此授权不能外推为其他流程变更。

## 分工

modules.json 定义文件归属；领域模块只能通过公共 index.mjs 单向调用，依赖检查沿用现有 npm test，不引入新检查阶段。修改球员逻辑与界面主要落在各自 players/ 目录；同模块记录 CHANGELOG，新增注意事项同步 README 和相关 docs。跨模块契约、主入口、迁移与全站样式归 integration，先在任务中明确负责人，避免多人编辑共同入口。各功能页面已经拆为独立模块，主入口仅组合会话、导航和公共弹层；全站 ui/主题仍由 integration 单一负责人维护。

## 可选工具

所有命令从独立 feature worktree 执行。工具的锁位于 git common-dir/module-locks，因此同仓库的不同 worktree 共享；不会写入提交或包含生产数据。

```sh
node scripts/collaboration.mjs claim players task-alice
node scripts/collaboration.mjs status players
node scripts/collaboration.mjs hash players packages/shared/modules/players/index.mjs
# 将计划写入的完整新内容放在临时文件，再用上一步摘要保护替换：
node scripts/collaboration.mjs write players task-alice packages/shared/modules/players/index.mjs EXPECTED_SHA256 path/to/prepared-content.mjs
node scripts/collaboration.mjs release players task-alice
```

claim 使用原子目录创建；已有锁就拒绝第二个任务。write 验证模块、所有者、worktree、分支与文件 SHA-256；过期内容拒绝写入，要求重新读取并合并。同一锁的并发写入互斥。release 不允许他人代释放；进程异常后锁保留，不自动过期抢占。残留锁先核实 owner、分支与任务已结束，再由负责人处理。

这些保护对使用工具的参与者生效，无法阻止绕开工具的编辑器或未协作的脚本；必须继续遵守既有的每目录单写入者、独立 worktree 和 PR 规则。多人同一 worktree 直接编辑仍不安全。常规 git push 拒绝非快进；禁止 force push、reset --hard 和用旧整文件解决冲突。GitHub 分支保护取决于仓库账户权限，本次未声称已启用远端保护或强制锁。

验证见 tests/collaboration.test.mjs 与 tests/modules.test.mjs：争用锁、跨所有者/分支、跨路径、过期覆盖和依赖环均应失败；不同模块可同时认领。
