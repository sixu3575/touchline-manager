# TOUCHLINE · 临场足球经理

一个从小俱乐部开始的网页足球经理游戏。组建球队、调整阵容、安排训练、签约年轻球员，在八队联赛和城市挑战杯中争取荣誉。

0.6.0支持完整90分钟模拟：可实时观看已生成画面（默认12×，约7.5分钟），或后台计算后拖动/变速回放。任务可断线与重启恢复，两种入口共用同一场比赛；旧存档与回放保留。设计与已知平衡限制见[连续比赛契约](packages/shared/modules/matches/design/CONTINUITY_AND_WATCHING_V3.md)和[100场校准](packages/shared/modules/matches/design/CALIBRATION_V060.md)。

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

球员如何无球跑动、接球后如何选择传带射，以及位置/球风/战术的实际区别，见[当前算法决策图](packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)。包含六张流程图、SVG和数学说明，后续相关算法及固定数据修改须同次更新。

工程组织参考 [kennysli1/slg1.0](https://github.com/kennysli1/slg1.0) 的文档入口与职责分离思想；该仓库未声明许可证，本项目未复制其代码、美术或规范文本。

## 0.2.0 球员与模块

球员具有 30 项能力、8 项性格、生日/国籍和公众档案；训练与比赛持续保存成长。模块地图见 PROJECT.md，模型与当前接入范围见 docs/PLAYERS.md，协作保护见 docs/COLLABORATION.md。旧存档启动时原子升级，不重置进度。开发流程保持现状，优化须用户批准。

## 0.3.0 物理比赛

以下为历史版本；0.6.0采用完整90分钟及持久比赛任务。

比赛按战术和细项能力控制移动、瞄准及触球，整个球越过门线才得分。详见[实际公式与限制](packages/shared/modules/matches/design/PHYSICAL_ENGINE_V1.md)。免费VM采用12分钟连续物理对应90分钟游戏时钟，20Hz物理步长不变；跑动为模拟段实际距离。单worker避免HTTP阻塞，压缩轨迹与存档同事务保存。尚未实现完整越位/犯规/换人规则。
