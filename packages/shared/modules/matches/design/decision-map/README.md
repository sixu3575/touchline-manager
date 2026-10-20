# 决策图导出副本

0.26.0候选更新第3图P10第一上抢者近身站位目标，并按Mermaid源重导`03-positioning.svg`。引擎`0.26.0-possession-screen`/`possession-6`。第一压迫者近身目标由0.35米改为持球者前方1.05米，保持真实触球和抢断窗口。固定八场中位数均值5.29→5.62秒、短于5秒占比47.99%→45.38%；另有指标上升，且约45%阶段仍短于5秒。详情见[POSSESSION_V0260.md](../POSSESSION_V0260.md)与[TEMPO_V0180.md](../TEMPO_V0180.md)。

0.25.0候选更新第5图A14带球触球力度与盘带能力关系，并按Mermaid源重导`05-actions.svg`。引擎`0.25.0-possession-touch`/`possession-5`。仅改带球冲量，不改动作选择、球员速度、控制宽限或触球几何。八场同输入中位数5.06→5.29秒、仍约48%短于5秒；脱控与传球链有改善，但不能称节奏已解决。短回合终止原因只供后台分析。细节见[POSSESSION_V0250.md](../POSSESSION_V0250.md)与[TEMPO_V0180.md](../TEMPO_V0180.md)。

0.20.0候选更新第1图O3团队恢复/散球边界、第4图T10/T11短趟球争抢、第5图A5盘带风险与真实抢断共用模型；已按同一Mermaid源重导对应SVG。引擎0.20.0-possession/possession-1。内部诊断不进入玩家回放，八场节奏基线见[TEMPO_V0180.md](../TEMPO_V0180.md)。

0.19.2更新第3图关键区域肾上腺素冲刺：每人每场至多一次；引擎0.19.2-stamina/stamina-3。0.18.0更新xG射门评分和有限控球恢复；其分析数据仅供内部验证，已移除玩家界面。七图源仍由主文唯一维护。

0.15.1更新第1/4图：射正折射与乌龙责任、无10秒硬截止的传递来源、头球接球与唯一射门确认。竞技引擎0.15.1-attribution/movement-1；统计opta-conventional-1，评分match-rating-2。七SVG及新增attribution/ratings来源摘要同步，流程不改。

0.15.0更新第6/7图：逐轮训练、具体职员、个体化衰退与已确认小项峰值；其他五图和竞技引擎不改。当前摘要36份来源，新增development/training/staff与战报入口；七图已核对，伤病后续加入。

0.14.0当前引擎0.14.0-movement/movement-1：接球推进、共享到达时间、盯防观察/空位选择及死球/庆祝移动已更新前五图，七图同次重新导出，32份源码摘要。维护和开发验证流程保持。

0.13.0第6图加入整数基础能力/培养经验，第7图加入整数评估和经验隐私。其他五图算法不变，七SVG与维护来源摘要同步，整数契约见players/INTEGER_STATS.md。

0.12.0新增07-knowledge可见性图：原六张竞技图不重写，新增观察/公开摘要/服务器真值边界。SOURCE_SNAPSHOT追加知识与投影源码；新属性消费者与搁置情况见球员模块ATTRIBUTE_AUDIT.md。

0.11.0第6图新增FG/FB赛前技术模板与预算保护；其他五图执行条件未改。23份源码摘要包括players/profiles.mjs；引擎/参数仍0.10.0-tactical-roles/tactics-1。

0.10.0更新R/P/A/F战术与位置职责、阶段和三类传中；主文仍为唯一可编辑来源，六SVG及22源摘要同次维护，详见[战术设计](../TACTICS_V0100.md)。新增tactical-plan及tactics/presets来源，不改变导出工具或开发流程。

0.8.2总览O9补球网吸能、全球过线和进球后15比赛秒重开；持球/属性分支仍为0.8.0。主文、六SVG及20源摘要同步，专项设计见[GOAL_NET_V082.md](../GOAL_NET_V082.md)。

唯一可编辑来源是上一级 [PLAYER_DECISION_MAP.md](../PLAYER_DECISION_MAP.md) 中按顺序出现的七个 Mermaid 代码块。对应文件为 `01-overview`、`02-roles`、`03-positioning`、`04-reception`、`05-actions`、`06-profiles`、`07-knowledge`。先改正文，再重新导出，不能只修 SVG 而留下旧图源。

`SOURCE_SNAPSHOT.json` 记录已核对的引擎版本、基线提交、相关源码文件和图源/SVG的 SHA-256，包含战术计划/配置、carrying、点球大战、长期训练/衰退和知识投影。按用户批准的分层验证，相关变更由 `tests/decision-reference.test.mjs` 自动核对摘要；后续更新要使用实际核对的版本与内容，不能只刷新摘要来掩盖图文未同步。没有算法变化时，该核对不启用真实比赛。

当前图面按用户要求直接写触发数值、抽签/估计/评分的类别、相关能力与影响方向，不列具体公式；每个编号节点的细节见上级正文同名表格。30项能力、8项性格及身份/成长/公众数据都需有实战或尚未接入说明。修改数值时同时核对图面、条件概率的触发机会和正文例值，不能将质量权重、xG或评分加分写成成功率。

本次使用临时安装在仓库外的 `@mermaid-js/mermaid-cli` 12.0.0。该工具不属于游戏依赖，不修改根 package.json、锁文件或既有 CI。可在自己的临时工具目录安装同版工具，按块取出 Mermaid 至临时 `.mmd` 文件，使用如下配置与命令生成七张 SVG：

```json
{
  "theme": "base",
  "look": "classic",
  "layout": "dagre",
  "htmlLabels": false,
  "fontFamily": "Microsoft YaHei, Segoe UI, sans-serif",
  "themeVariables": {
    "primaryColor": "#eff6ff",
    "primaryTextColor": "#172554",
    "primaryBorderColor": "#64748b",
    "lineColor": "#475569",
    "secondaryColor": "#fef3c7",
    "tertiaryColor": "#f0fdf4",
    "fontSize": "17px"
  },
  "flowchart": {
    "htmlLabels": false,
    "wrappingWidth": 220,
    "nodeSpacing": 28,
    "rankSpacing": 44,
    "curve": "linear"
  }
}
```

例如将第四块保存为临时 `04-reception.mmd`，配置保存为临时 `mermaid.json` 后，用工具目录的 mmdc 执行：

```sh
mmdc -i 04-reception.mmd -o 04-reception.svg -c mermaid.json -b white --size 1800 --no-font-embed -I decision-04-reception
```

可用 `-p` 指向本机浏览器路径的 Puppeteer JSON 配置。输出 SVG 的 id 要以字母开头，否则 CSS 选择器可能无效；归档前按 viewBox 的宽高设置数值 width/height，保留 `max-width:100%; height:auto`，移除固定 max-height，避免长图在独立打开时被压缩到窗口高度。关闭 HTML 标签，避免依赖 foreignObject 显示文字。字体没有嵌入，阅读端使用本地中文字体及后备字体。

重新计算摘要时：源码按 UTF-8 文本读取，CRLF / CR 统一成 LF 后计算 SHA-256，避免不同开发系统的换行设置造成假差异；Mermaid 按 Markdown 中开头 `mermaid` 标记行之后、结尾三个反引号之前的文本取出，包含末尾换行，同样规范为 LF 后计算。SVG 按文件原始字节计算 SHA-256。摘要文件的 encoding 字段明确记录这两个约定；不要混用原始文本和规范换行后的摘要。

交付前打开六张图检查中文、连线和标签；核对所有图源摘要、SVG摘要、源码摘要和本地链接，更新上级正文的核对日期及基线，再在比赛模块 CHANGELOG 记录变更。检查与发布仍遵守根 AGENTS.md；此说明不授权安装 Git 钩子、删减测试或改变部署。
