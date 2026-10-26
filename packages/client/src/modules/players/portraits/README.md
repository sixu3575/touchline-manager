# TOUCHLINE 原创球员头像 v1

2026-10-26。按用户要求参考 [Tape to Tape 官方人物/名单画面](https://tapetotapegame.com/press/) 的运动漫画语言：粗墨线、有限色块、夸张鼻子/下巴、小瞳孔与不对称表情。人物和零件全部重新绘制，不包含参考游戏的原始图片、角色或队徽。

## 已实现与文件

- `parts.mjs`：6 头型、12 发型、6 眼神/眉毛、6 鼻子、7 嘴型、6 胡须、5 细节；另有 8 肤色、8 发色、5 队服、6 背景色。
- `generator.mjs`：从固定 ID 生成配方并分层绘制 SVG/data URL。没有网络、时间、比赛引擎或新增 npm 依赖。
- 上级 `PlayerPortrait.tsx`：统一头像组件。名单、球探、档案、总览/战术板、赛后评分和物理回放选人信息已接入；运动中的 Canvas 标记仍沿原实现。
- `lab.html`：可交互实验室模板；24 人批次、固定种子、手动换件、锁定零件、透明 SVG/512px PNG 和 JSON 配方导出。
- `export-assets.mjs`：打包离线实验室、49 张独立 SVG 零件、24 张透明 SVG 头像、联系表与 manifest。不自动调用 AI。

## 固定身份与版本

`portraitVersion + player.id + slot` 经过固定 FNV-1a/32 位混合得到各项索引。每项零件有独立散列键，只读取公开且稳定的 ID。姓名、国籍、年龄、能力、潜力、士气、身高、号码和所属俱乐部不进入脸部种子；改名、生日、训练或签约不会换脸。换队服只改变服装层。

`touchline-ink-1` 的零件顺序、数量、形状和散列算法是冻结契约。扩充或重新绘制必须保留 v1、另建 v2；直接修改数组会使旧 ID 换脸。未来若要持久保存人工配方或跨版本选脸，再增加公开的 `portraitVersion/portraitSpec` 字段并评估迁移。本次不改存档结构，已有球员立即拥有头像。

身份空间共有 **34,836,480 种理论配方**，不计队服和背景。它表示参数组合，不等于三千多万张独立绘制的人像；缩小时可能相似，也没有全局去重保证。1 万种子测试检查完整配方的过度碰撞。

## 骨架与美术素材

所有零件使用 `256×256` viewBox：眼线约 y=124、鼻尖 y=158、嘴线 y=182、下巴 y=210、领口 y=220，发顶安全区到 y=18。导出零件保留完整骨架位置，不单独裁到紧边界。

层级为背景 → 球衣/脖子 → 后发 → 耳朵 → 脸/阴影 → 后胡须 → 细节 → 前发 → 眼眉 → 鼻子 → 嘴 → 前胡须。发型/胡须的前后层分别处理；独立导出的合并 SVG 用于美术编辑，运行时须使用源零件的子层顺序。

固定 palette token 统一肤色、阴影、发色、球衣和墨线，不从名字或国籍推测肤色。各头型使用兼容的太阳穴宽度；本版无帽子、头盔、眼镜槽位。伤疤与黑眼圈只是装饰，不表示游戏有伤病或相应状态。

`portrait-master.png` 是内置 imagegen 生成的 12 人透明位图母版，用于说明更细致的墨线、形体与表情方向；它不是程序零件图集，没有作为运行依赖。`generated-contact-sheet.png` 和 `samples/` 才是实际分层生成器的输出。v1 采用更简洁的正面矢量画法，后续可逐件精修并通过新版本保留旧人脸。

## 使用与导出

```js
import { createPortrait, renderPortrait, portraitDataUrl } from './generator.mjs';
const spec = createPortrait('stable-player-id');
const svg = renderPortrait(spec, { transparent: true });
const src = portraitDataUrl('stable-player-id', { kit: 0 });
```

配方 JSON 通过 `createPortrait(saved.identity, saved)` 恢复；调用端应校验版本。非法/越界索引回退到该 ID 默认值，不把任意外部字符串填入 SVG 属性。

从仓库根目录运行 `node packages/client/src/modules/players/portraits/export-assets.mjs /absolute/output/folder`。输出 HTML 已内嵌全部程序，可离线打开；核心两份 mjs 也单独提供。浏览器可导出 PNG；本次交付附带的 24 张 512px PNG 和总览 PNG 由同一 SVG 源栅格化。

## 验证

定向测试覆盖身份稳定、换衣不换脸、1 万种子分布、锁定零件、非法输入、标题转义、全零件渲染与透明背景。浏览器核对换件、锁定、随机、PNG 下载、头像加载和窄屏布局；游戏核对名单/球探/档案/战术入口。完整检查结果以本次验证记录为准。纯展示改动不运行真实比赛或赛季。

## 2026-10-26 · 三阶段形象

基础身份 v1 保持固定，career-1 按公开年龄选择青训（≤18）、青年（19–29）、中年（≥30）；历史视图只读比赛快照年龄，缺失使用中性成人形象。年龄不进入身份种子，不改存档。三阶段不是三个独立人物容量。完整配方、性能与原创边界见仓库 docs/ART.md。
