# 训练模块

职责：七个场地区域建设、每人/教练唯一分配、每轮训练及结果，调用players公共成长接口、staff公共人员接口。

公共入口：TRAINING_FIELDS、ensureTraining、trainingFacility、assignTraining、resolveTraining；train仅旧预约兼容。默认一级传控/体能，三级封顶，8人/级，实际参训每人£300/轮。安排持续；联赛冻结计划按日期衰退后训练，5×终场统一公布；杯赛不重复。

[当前规则、概率与存档契约](TRAINING_AND_CAREERS_V0150.md)。成长每项+1/不变，判断只加快观察；六大属性不记录峰值，伤病后续。跨模块只导入index.mjs，依赖/归属见modules.json。每次变更更新本目录CHANGELOG与决策图；既有流程不改。
