# 训练界面模块

0.13.0训练说明补充整数经验累计，每100点提升1点能力，未满留待后续；界面不读取私有trainingProgress，不虚报每次训练都加1。

0.12.0推荐仅使用DTO评估潜力中点；界面显示区间或待观察。不得重新拉取/使用隐藏真实潜力。

公共入口 index.ts 的 Training。仅展示训练方向、费用与培养名单并提交意图；规则归 shared/modules/training 与 shared/modules/players。
