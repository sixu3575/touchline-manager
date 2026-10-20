# 训练界面模块

训练区按钮按下态必须保留`translate(-50%, -50%)`定位；球场线条、球门和说明文字设置`pointer-events: none`，避免遮挡场地点击。

0.15.0训练基地七区、checkbox球员分配、可选教练、服务器建设/升级，安排持续到下一轮统一判定。Training/StaffPeople只发受限意图，真实成长/薪资/能力由服务端计算；结果只展示delta。职员在本页招聘/解约，历史40轮，禁止客户端自行加点。

0.13.0训练说明补充整数经验累计，每100点提升1点能力，未满留待后续；界面不读取私有trainingProgress，不虚报每次训练都加1。

0.12.0推荐仅使用DTO评估潜力中点；界面显示区间或待观察。不得重新拉取/使用隐藏真实潜力。

公共入口 index.ts 的 Training。仅展示训练方向、费用与培养名单并提交意图；规则归 shared/modules/training 与 shared/modules/players。
