# 场景界面与素材

SceneHeader为常驻返回/快捷导览，navigation.mjs维护院子物件和房间名称；实际动作由main及各模块保有。scenes.css只维护壳和公共工作台，不接入模拟器。设计见仓库docs/IMMERSIVE_UI.md。

场景背景以**内置image_gen**生成，完整原始提示词保存在asset-prompts.json；没有复制参考游戏的原画或角色。PNG母稿复制到本次outputs/immersive-scenes，运行WebP存入packages/client/public/art/scenes。转换仅尺寸/文件格式，采用Sharp WebP quality82；库为本机工具，不新增项目依赖。

- club-courtyard.webp：1586×992，523072字节；图像上的数据和路牌均由HTML绘制。
- locker-room.webp：1586×992，213654字节；空白墙为动态更衣柜预留。
- press-room.webp：1586×992，250006字节；报纸和屏幕中的内容不烘焙进图片。

素材按页读取，共986732字节。服务器仅增加image/webp静态MIME，保留原缓存；修改素材时更换文件名及引用，避免缓存旧图。不得将存档、Cookie、备份或实际私有属性写入美术/提示词。

键盘、手机及数据为空/已积累赛季均按docs/IMMERSIVE_UI.md检查。UI入口只导航；进行下一轮仍使用现有明确按钮，不把点物件变为隐式开赛。
