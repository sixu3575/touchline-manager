# 英格兰与苏格兰联赛多项比赛统计基准

本基准直接使用 [Football-Data 英格兰](https://football-data.co.uk/englandm.php)和[苏格兰 CSV](https://football-data.co.uk/scotlandm.php)，用途是离线对照比赛模拟器的数据分布，不参与游戏运行、球员动作选择或单场统计配额。覆盖最近三个完整共同赛季（2022/23–2024/25）的英格兰与苏格兰前四级联赛，共 8 个联赛、8,412 场。

## 覆盖字段与统计

24 份赛季/联赛文件直接提供七项主客队统计：进球、射门、射正、犯规、角球、黄牌、红牌。原始英文列名及定义见 [Football-Data 字段说明](https://football-data.co.uk/notes.txt)。其中苏格兰 League One 2024/25 有一场缺少射门、射正、犯规和角球；这四项按可用记录计算 539/540 场，其它所列统计完整。缺失值从该项样本排除，不当作 0。

下表为**每队每场**的均值 / 无偏样本方差（分母 `n−1`）；该方差保留每队表现的离散度，不能只看平均数。括号中的场次数是原始比赛行数；每场含主队和客队两条球队记录。

| 联赛 | 比赛数 | 进球 | 射门 | 射正 |
| --- | ---: | ---: | ---: | ---: |
| England · Premier League | 1,140 | 1.51 / 1.69 | 13.13 / 32.73 | 4.63 / 6.50 |
| England · Championship | 1,656 | 1.26 / 1.30 | 11.99 / 23.83 | 3.95 / 5.03 |
| England · League One | 1,656 | 1.29 / 1.37 | 11.83 / 23.58 | 3.99 / 5.14 |
| England · League Two | 1,656 | 1.30 / 1.39 | 11.89 / 23.49 | 3.99 / 5.20 |
| Scotland · Premiership | 684 | 1.44 / 1.67 | 12.69 / 35.62 | 4.26 / 7.12 |
| Scotland · Championship | 540 | 1.35 / 1.60 | 9.39 / 18.22 | 3.99 / 4.93 |
| Scotland · League One¹ | 540 | 1.47 / 1.71 | 9.70 / 18.86 | 4.31 / 6.31 |
| Scotland · League Two | 540 | 1.32 / 1.43 | 8.87 / 13.18 | 3.85 / 4.33 |

| 联赛 | 犯规 | 角球 | 黄牌 | 红牌 |
| --- | ---: | ---: | ---: | ---: |
| England · Premier League | 10.95 / 12.36 | 5.21 / 9.56 | 1.97 / 1.91 | 0.06 / 0.06 |
| England · Championship | 10.99 / 12.10 | 5.14 / 8.19 | 1.91 / 1.66 | 0.06 / 0.06 |
| England · League One | 11.20 / 12.21 | 5.04 / 7.89 | 1.88 / 1.84 | 0.07 / 0.07 |
| England · League Two | 11.22 / 12.32 | 4.91 / 7.25 | 1.88 / 1.73 | 0.07 / 0.08 |
| Scotland · Premiership | 11.01 / 12.86 | 5.38 / 10.49 | 1.84 / 1.70 | 0.10 / 0.10 |
| Scotland · Championship | 10.55 / 12.67 | 5.22 / 9.07 | 1.90 / 1.78 | 0.08 / 0.07 |
| Scotland · League One¹ | 10.24 / 11.83 | 5.03 / 8.56 | 1.74 / 1.58 | 0.09 / 0.09 |
| Scotland · League Two | 11.18 / 13.10 | 4.78 / 6.49 | 2.01 / 1.74 | 0.10 / 0.10 |

¹ Scotland League One 的射门、射正、犯规和角球为 539 场的有效样本；进球与牌为 540 场。详细样本数和缺失清单见 JSON。

同一份 [JSON 基准](ENGLAND_SCOTLAND_STATS_REFERENCE_20261023.json)还保留每赛季、主队、客队、整场合计的均值、方差和标准差、赛果比例、逐项有效样本量、24 个来源文件的行数和 SHA-256。比较模拟队伍数据时使用球队记录；比较整场总数时使用整场字段，不能混用两种分布。

## 范围边界

Football-Data 将英格兰 National League/Conference 文件列为赛果文件，但没有列出对应的比赛统计，因此不把只有比分的数据冒充成完整多项基准。Football-Data 列出的范围也不含威尔士与北爱尔兰联赛；本基准是英格兰和苏格兰前四级，而不是所有英国联赛。

本次共同样本不提供 xG、传球、控球率、抢断、拦截、扑救、球员级事件或跑动追踪数据。这些项明确标记为“来源缺失”，不得当作零或用球队统计反推伪造。Football-Data 的说明指出，其英格兰/苏格兰黄牌数不把第二张黄牌转红时的第一张黄牌再计一次；不同统计提供方和赛季的定义也可能变化，比较时须先对齐口径。

Football-Data 的[数据使用说明](https://football-data.co.uk/contact.php)称免费 CSV 面向个人用途或学术研究，另提供商业 API。这里仅归档汇总矩、来源 URL 和文件哈希，不把原始逐场 CSV 放入仓库；原始下载保存在 Git 忽略的 `work/football-reference/football-data/`。若用途扩展为商业数据产品或大量自动抓取，应先核实并取得合适授权。

## 解读与重建

这是 Football-Data 汇集的比赛统计观察分布，不代表游戏应每场达到平均值，也不是联赛对游戏的背书。小规模战术/种子样本只显示与基准的差异，不通过或阻断模拟校准；它不应推动对合理射门或传带决策的人为压制。当前游戏联赛尚未映射到现实级别，因此诊断时并列展示 8 个联赛。

原始下载模式为 `https://www.football-data.co.uk/mmz4281/{赛季代码}/{级别代码}.csv`，例如英格兰 `2425/E0.csv` 和苏格兰 `2425/SC0.csv`。将本基准记录的 24 份 CSV 放入 `work/football-reference/football-data/` 后，可离线复算：

```sh
node tests/tools/aggregate-england-scotland-reference.mjs work/football-reference/football-data packages/shared/modules/matches/design/ENGLAND_SCOTLAND_STATS_REFERENCE_20261023.json
```

聚合脚本会校验每份文件的预期赛程行数、逐项有效值和样本数，再写 JSON。更换赛季/文件时必须同步更新本文、哈希清单和现实性比较器；不得静默混合不同数据版本。
