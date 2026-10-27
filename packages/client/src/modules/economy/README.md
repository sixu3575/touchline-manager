# Finance 界面模块

公共入口 index.ts 的 Finance。只展示存档并提交意图；规则由对应 shared/modules/ 目录维护。页面私有改动在本目录完成，新增样式使用模块专属文件/类名前缀；公共 ui 和全站样式交由 integration 维护。每次修改更新本目录 CHANGELOG.md；开发流程不变。

2026-10-27：财务桌分为三张经营票据和可滚动账本，保留全部交易、金额和时序；去除界面中的服务器实现说明。共享外观位于client/src/scenes/room-workspaces.css，新增控件需在1280/390px验证对比度、溢出、键盘和原动作条件。
