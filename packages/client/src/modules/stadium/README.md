# Stadium 界面模块

球场美术复用 components/ui.tsx 的 StadiumIllustration，属于装饰，不根据图片推导容量或收入；扩建仍由服务器校验。

公共入口 index.ts 的 Stadium。只展示存档并提交意图；规则由对应 shared/modules/ 目录维护。页面私有改动在本目录完成，新增样式使用模块专属文件/类名前缀；公共 ui 和全站样式交由 integration 维护。每次修改更新本目录 CHANGELOG.md；开发流程不变。
