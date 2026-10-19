# TOUCHLINE · 临场足球经理

0.12.0：球员卡公开六项概览，教练与球探逐步揭示细项，详见[评估设计](packages/shared/modules/players/ASSESSMENT.md)及[属性审计](packages/shared/modules/players/ATTRIBUTE_AUDIT.md)。全部30项真实能力继续参与原比赛；未适配的新属性明确搁置。

当前版本0.11.0：球员有位置与技术偏向的差异化属性，旧档显式一次重塑，指定观察存档加入综合95的99号林曜。详见[球员分布](packages/shared/modules/players/ATTRIBUTE_PROFILES.md)。

0.10.0：战术与真实位置共同驱动跑位和传带射。边路配合有宽度接应、条件套边、包抄和高/低/倒三角选择；控球多点接应，反击有夺回后短机会窗口。战术板/新回放可查看位置职责；保存后下一场生效，历史不重算。[决策图与属性影响](packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)、[专项数值](packages/shared/modules/matches/design/TACTICS_V0100.md)。


0.9.1：在“赛程与杯赛 → 赛后战报”直接查看已保存联赛/杯赛的终场比分、球队统计、事件和球员评分，无需打开回放；“观看回放”保留独立入口。查看战报仅加载已存事件/统计，不下载轨迹或模拟比赛。

一个从小俱乐部开始的网页足球经理游戏。组建球队、调整阵容、安排训练、签约年轻球员，在八队联赛和城市挑战杯中争取荣誉。

0.9.0新增赛后球员评分：查看两队每位出场球员的分数，展开实际数据及9类加减依据。6.5基准、3–10分，按位置评价；[公开权重与现实来源](packages/shared/modules/matches/ratings/README.md)。实时终场后公布，历史报告也可查看，旧轨迹保持不变。

0.8.2修复球网回弹，进球后保留入网画面并显示特效、射手号码/姓名与本次比分。新物理从下一场生效；已有回放保留原轨迹，可根据保存事件显示进球提示。设计见[GOAL_NET_V082.md](packages/shared/modules/matches/design/GOAL_NET_V082.md)。

0.8.1比赛默认显示进球、射门、扑救、犯规等关键事件；普通触球、传带球、拦截等在“其他事件”查看，仍可查看全部动作与解释。实时和历史回放共用分类，保留原数据。

0.8.0增加利用无人区带球推进，以及按个人能力、具体防守者与协防评估的突破；保留好传球/射门机会。设计与数学见[持球机会](packages/shared/modules/matches/design/CARRYING_V080.md)，[决策图](packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)同步维护，旧比赛不重算。

0.7.0点击“进行下一轮并实时观看”自动进入固定5×比赛，首段画面生成即可观看，完整90分钟约18分钟。退出、刷新或关闭页面后比赛继续，菜单显示当前进度，可随时重入；本队播放终场且本轮计算齐全后才统一公布结果、积分和收支。取消后台模拟入口，赛后保留自由拖动/变速回放。观看契约见[五倍速直播与延迟结算](packages/shared/modules/matches/design/LIVE_BROADCAST_V070.md)，原有比赛算法和[校准限制](packages/shared/modules/matches/design/CALIBRATION_V060.md)不变。

**试玩： http://138.2.64.10/**

0.6.1核对属性驱动的实际跑动，修复草地过强减速与空阻过弱，传球预测同步更新；详细公式、现实依据及简化边界见[运动检查](packages/shared/modules/matches/design/PHYSICAL_MOTION_V061.md)。旧轨迹不重算。

## 快速开始

需要 Node.js 22.13+（建议当前 Node 22 LTS 或 Node 24）。

```sh
npm ci
npm run check
npm start
```

浏览 http://127.0.0.1:3100。开发界面可另开终端运行 `npx vite --config packages/client/vite.config.ts`；后端保持运行。生产构建默认位于 dist/client。

## 首版玩法

- 每个浏览器自动获得独立服务器存档，初始 20 名球员和 £850,000。
- 14 轮双循环 AI 联赛；第 2、5、8 轮后可参加杯赛各阶段。
- 三种阵型、四种进攻思路和三档压迫；合法的 11 人首发才能比赛。
- 每轮两次训练、候选签约与青年球员、球场扩建、球迷和财务账本。
- Rapier3D计算22人跑动与足球重力/碰撞/反弹，保存实际轨迹供变速与拖动回放；旧比赛保留旧示意回放。
- 完成赛季后领取奖金、记录前三荣誉并开启下一赛季。

这是 PvE 原型：尚未提供注册账号、跨浏览器找回、真人 PvP、真实定时赛程或临场指令。请保留当前浏览器站点 Cookie 以继续存档。IP 入口使用 HTTP，勿输入真实密码或敏感资料。

## 开发文档

任何 AI / 人类开发者均须先读 [AGENTS.md](AGENTS.md)。系统地图见 [PROJECT.md](PROJECT.md)，运维与恢复见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

日常迭代使用 `npm test` 或 `npm run check:quick`，提交前使用 `npm run check` 自动按改动选择检查。仅比赛算法改动启用真实比赛，重大流程启用业务赛季；详细条件与记录见[分层验证](docs/VALIDATION.md)。Node22/24、PR审查及备份保留。

球员如何无球跑动、接球后如何选择传带射，以及位置/球风/战术的实际区别，见[当前算法决策图](packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)。六图直接标出触发数值、条件概率类别与影响因子，配SVG和30能力/8性格等实战索引，用相关性说明代替公式；后续相关算法及固定数据修改须同次更新。

工程组织参考 [kennysli1/slg1.0](https://github.com/kennysli1/slg1.0) 的文档入口与职责分离思想；该仓库未声明许可证，本项目未复制其代码、美术或规范文本。

## 0.2.0 球员与模块

球员具有 30 项能力、8 项性格、生日/国籍和公众档案；训练与比赛持续保存成长。模块地图见 PROJECT.md，模型与当前接入范围见 docs/PLAYERS.md，协作保护见 docs/COLLABORATION.md。旧存档启动时原子升级，不重置进度。开发流程保持现状，优化须用户批准。

## 0.3.0 物理比赛

以下为历史版本；0.6.0采用完整90分钟及持久比赛任务。

比赛按战术和细项能力控制移动、瞄准及触球，整个球越过门线才得分。详见[实际公式与限制](packages/shared/modules/matches/design/PHYSICAL_ENGINE_V1.md)。免费VM采用12分钟连续物理对应90分钟游戏时钟，20Hz物理步长不变；跑动为模拟段实际距离。单worker避免HTTP阻塞，压缩轨迹与存档同事务保存。尚未实现完整越位/犯规/换人规则。
