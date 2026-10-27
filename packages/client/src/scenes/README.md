# 场景界面与素材

SceneHeader为常驻返回/快捷导览，navigation.mjs维护院子物件和房间名称；实际动作由main及各模块保有。scenes.css只维护壳和公共工作台，不接入模拟器。设计见仓库docs/IMMERSIVE_UI.md。

场景背景以**内置image_gen**生成，完整原始提示词保存在asset-prompts.json；没有复制参考游戏的原画或角色。2026-10-27按用户反馈更新为cartoon-scenes-4-depth：院子改为入口斜视、连体建筑和前后遮挡；更衣室/编辑室保持v3。以实际touchline-ink-1头像联系表为画风基准，使用粗墨线、大色块、硬边阴影和夸张物件，移除上一版写实纹理/光照。PNG母稿复制到本次outputs/depth-courtyard-v4，运行WebP存入packages/client/public/art/scenes。转换仅尺寸/文件格式，采用Sharp WebP quality85；库为本机工具，不新增项目依赖。

- club-courtyard-depth-v4.webp：1586×992，390864字节；图像上的数据和路牌均由HTML绘制。
- locker-room-cartoon-v3.webp：1586×992，230324字节；空白墙为动态更衣柜预留。
- press-room-cartoon-v3.webp：1586×992，271764字节；报纸和屏幕中的内容不烘焙进图片。

素材按页读取，共892952字节。更衣柜/路牌/报纸边框同步改为硬墨线与平涂，避免把写实CSS纹理叠回新场景。球员身份零件和生涯版本不改。服务器保留image/webp静态MIME与原缓存；本次更换文件名及引用，避免缓存旧图。不得将存档、Cookie、备份或实际私有属性写入美术/提示词。

v4将球鞋更衣室与办公室连接为沿路会所，媒体和奖杯收进门廊，球探车在近景斜停，训练场/看台后退。navigation.mjs按新构图重标十个可见物件；路牌默认收起，悬停/焦点出现，也可一键全部显示。需检查热区中心、每个菜单及路牌间距，避免前后物件相互遮挡。

键盘、手机及数据为空/已积累赛季均按docs/IMMERSIVE_UI.md检查。UI入口只导航；进行下一轮仍使用现有明确按钮，不把点物件变为隐式开赛。

## 全站工作台

club-scenes-suite-1在已确认院子及室内v3基础上增加tactics-shed-v1.webp（259442字节）、training-ground-v1.webp（320588）、club-office-v1.webp（219760，球探/财务共用）和home-stands-v1.webp（314566）。七张合计2007308字节，按匹配页面加载，院子首屏仍只需390864字节背景。PNG/完整提示词/清单在本次outputs/immersive-release；内置image_gen生成，Sharp只做尺寸与WebP压缩。RoomHeading提供房间路牌，room-workspaces.css集中管理不同模块的外观，业务动作留原模块。

战术板/扩建夹板用深色，档案/账本用纸色；修改时核对选择态与标题对比度。战术照片标签保留23/28人全部访问，列表内部滚动且原生复选框可键盘访问。主场背景为示意插画，真实容量、票价和扩建金额始终由原数据展示。
