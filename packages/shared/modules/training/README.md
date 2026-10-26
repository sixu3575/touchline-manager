# 训练模块

职责：七个场地区域建设、每人/教练唯一分配、每轮训练及结果，调用players公共成长接口、staff公共人员接口。

公共入口：TRAINING_FIELDS、ensureTraining、trainingFacility、assignTraining、resolveTraining；train仅旧预约兼容。默认一级传控/体能，三级封顶，8人/级，实际参训每人£300/轮。安排持续；联赛冻结计划按日期衰退后训练，5×终场统一公布；杯赛不重复。

[基础训练、年龄衰退和职员规则](TRAINING_AND_CAREERS_V0150.md)；[0.16训练区展示、潜力分布和个体天赋成长](TRAINING_GROWTH_V0160.md)。训练名单用公开评估展示场地区域细项与当前体力；训练成长由潜力、稳定的私有个体培养天赋、态度、年龄、训练空间、教练和设施共同决定。六大属性不记录峰值，伤病后续。跨模块只导入index.mjs，依赖/归属见modules.json。每次变更更新本目录CHANGELOG；比赛决策图不受此训练改动影响。
