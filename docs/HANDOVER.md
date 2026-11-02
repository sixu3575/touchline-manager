# TOUCHLINE 足球经理：AI 接手文档

更新日期：2026-11-02（Australia/Sydney）。这是当前交接入口；先读本文件，再读根目录 `AGENTS.md`、`PROJECT.md` 和 `docs/VALIDATION.md`。

## 当前状态与这次发布

- GitHub：<https://github.com/sixu3575/touchline-manager>，公开仓库。
- 本地开发目录：`C:/Users/siyan/Documents/Codex/2026-10-15/wo/work/tactical-block-v047`。上一级 `wo` **不是 Git 仓库**。
- 当前分支：`feat/tactical-blocks`。本轮开始时有大量未提交的0.47改动，不能只交接 GitHub main 而遗失这些文件。
- 已先合入远端 `a8e6e975f964768bef22acf8a61d916e935b6d02`，保留 PR #80/#81 的整队更衣室资料墙，不能用旧前端覆盖它。合入时 CHANGELOG 的冲突保留了两侧内容；自动备份 stash `60adada` 保留，未擅自删除。
- 发布前实测服务器 build：`9d7560725431c5f0500539549c99bfccf8422305`，比赛引擎仍为0.46；不是旧记录里的 `b3363ee` 前端。
- 本次要发布的比赛引擎：`0.47.2-matchup-cover`，参数 `role-containment-1`，包含尚未上线的0.47/0.47.1改动。
- **当前发布阶段：执行检查与备份中，尚未声称部署成功。** 本任务仍持有 matches/tactics/integration 模块锁，owner=`handover-release-20261102`；接手AI不要同时写此worktree，应等待交接完成或另开独立worktree。 最终 SHA、备份与验收结果以本文件末尾及 `docs/OPERATIONS.md` 的本次记录为准。

### 用户授权与必须保留的问题

上一轮已明确向用户报告：强弱20场有9场阻断；同水平进球均值/方差下降，未达到保持原有结果的目标，因此没有部署。用户本次随后明确要求：

> 出示handover文档以及最近在优化的内容让我给另一个ai继续工作 然后部署之前未部署的改动

本次将该明确上线请求作为**当前已披露缺陷版本的一次性发布指令**处理。它不代表比赛拟真通过，不授权以后发布任意失败版本，也不取消工程检查、PR、数据备份或回滚保护。不要改写先前失败证据，也不要把此次授权扩成永久流程变更。

## 最近究竟在优化什么

目标：同水平对战保留现有节奏、比分与波动；强弱对抗及战术更接近真实足球。不能用比分/射门配额、弱队保平加成或事后改统计来凑结果。

| 阶段              | 已保留的代码/数据                                                                                                                                       | 主要入口                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0.47 战术         | 5-4-1；低压阵块/远侧责任与门前协防；真实夺回后的反击窗口；前插跟速、接应到球期限与合法越位线                                                            | `modules/tactics/`、`matches/defending.mjs`、`positioning.mjs`、`locomotion.mjs`、`tactical-plan.mjs` |
| 0.47.1 基准及几何 | FC/FIFA分档现实数据；后场中场分层接应；按实际脚端计算抢断；射门两侧/高低轨迹封堵；传球潜在失球位置；准备期风险；取消属性解锁射程                        | `decisions.mjs`、`opportunity.mjs`、`shot-window.mjs`、`goalkeeping.mjs`                              |
| 0.47.2 防守执行   | 只在本方35米危险区保护追不上球的最后防线；各压迫档补齐边前卫/翼卫盯防；门将合法未来落点出击，实际执行冲刺；近身慢球有限下探；弱抢断前锋对强近控者先遏制 | `defending.mjs`、`goalkeeping.mjs`、`positioning.mjs`、`locomotion.mjs`、`simulation.mjs`             |
| 后台观测          | 实际抢断、尝试上抢与成功抢断拆开；旧报告标记歧义；保留原过密上抢警戒                                                                                    | `tests/tools/match-realism.mjs`、`tests/match-realism.test.mjs`                                       |

表中模块路径均相对 `packages/shared/`，测试路径除外。没有增加球员长期能力字段、数据库迁移、运行依赖或四场并发；历史报告和回放不重新计算。

### 决策图与数学文档

- 当前七张决策图：[`PLAYER_DECISION_MAP.md`](../packages/shared/modules/matches/design/PLAYER_DECISION_MAP.md)。Mermaid、SVG和 `decision-map/SOURCE_SNAPSHOT.json` 必须与代码一起更新。
- 0.47：[`TACTICAL_BLOCKS_V0470.md`](../packages/shared/modules/matches/design/TACTICAL_BLOCKS_V0470.md)。
- 0.47.1：[`FC_FM_CALIBRATION_V0471.md`](../packages/shared/modules/matches/design/FC_FM_CALIBRATION_V0471.md)。
- 0.47.2：[`MATCHUP_COVER_V0472.md`](../packages/shared/modules/matches/design/MATCHUP_COVER_V0472.md)。
- 完整现实比较契约：[`REALISM_VALIDATION.md`](../packages/shared/modules/matches/design/REALISM_VALIDATION.md)。

## 明确未解决的结果

以下是上轮固定输入及独立种子证据，**不能因本次要求部署就改成“通过”**。

- FC原始位置纠正后的20场：**11 review / 9 blocked**。开放打法仍出现强队单场43～46次射门和个人射门集中；个别球员尝试上抢过密。
- 普通四风格×999/1001，再加高压反击两场：**3 pass / 7 review / 0 block**。这不能覆盖强弱矩阵的失败。
- 同水平16组成对样本，线上0.46对当前候选：

| 指标                           |    0.46 | 0.47.2候选 |
| ------------------------------ | ------: | ---------: |
| 整场进球均值                   |  2.3125 |     1.3125 |
| 进球样本方差                   |  3.0292 |     1.0292 |
| 整场射门均值                   | 23.3125 |    18.0000 |
| 单场球权阶段中位数的均值（秒） | 20.8281 |    18.7813 |
| 完成传球链均长                 |  8.5568 |     7.5349 |

这里16组包含原8场及每版本另加8场独立种子；两场高压压力样本不混入正常对局。结果表明进球、波动及部分节奏仍有退化。详细输入、缺项、样本量、方差与逐场结果在 [`MATCHUP_COVER_V0472_RESULTS.json`](../packages/shared/modules/matches/design/MATCHUP_COVER_V0472_RESULTS.json)。

同样的纽波特—曼联小样本里，5-4-1低压反击强方平均17.5次射门/4球，4-4-2低压反击27次/5.5球，说明战术能影响过程；每组仅两场，**不能宣称已校准保平概率**。

### 不要重新上线的已撤回试验

- 单纯增大弱防守者后退距离、额外紧急补位、压平技术对抗曲线、调整中卫横向交接：没有稳定改善。
- 把迟到的飞行球追赶在全场一律取消：拉长普通球权阶段约25%，已改为只保护危险区最后防线。
- 两名前锋互相算中场支援的修改：未稳定改善，撤回。
- 远侧边锋普遍进入禁区：普通进球回升，但悬殊控球对局出现0:12/0:15、强方62/68次射门，**已撤回**，见 [`MATCHUP_COVER_REJECTED_SECONDARY_RESULTS.json`](../packages/shared/modules/matches/design/MATCHUP_COVER_REJECTED_SECONDARY_RESULTS.json)。不要因只看普通样本就恢复它。
- 将固定决策误差改为相对效用误差：破坏高手适当一对一及远射专长既有测试，**已撤回**，原断言未删除。
- 接触顺序假设：只读审计复现0:8，6,909次本方触球中12次双方同时候选，未发现更早防守脚被排序遮掉的证据；没有据此改物理接触顺序。

这些试验完整原始输出位于本地忽略目录及源码/证据备份，不都在GitHub；不能把失败文件清掉后再重复同一试验。

## 现实基准：已经有什么、缺什么

- `FC_FM_STRENGTH_REFERENCE_20261028.json`：4,165场，含3,898场联赛、FA Cup 89、League Cup 74、欧冠104；完整双方实际首发118场。每项有自己的n/缺失口径，不能把缺失填0。
- FC/FIFA按对应赛季历史版本、发布日期匹配；球队OVR与实际XI均值分开。FC24快照2023-09-22、FIFA19 2018-08-21、FIFA23 2022-09-26。
- FM24只有少量**社区球队Rating**作排序核对，**没有原始球员CA**，没有合法推导FC→FM CA的标尺。禁止声称“已用FM CA拟合”。
- 实验球员使用22项FC直接字段与8项明确代理；按真实声明位置唯一匹配选XI，fallback明确记录。不能重现早先把安东尼放中锋的粗分类错误。
- FC球队总评、选定XI总评和游戏按位置综合不是同一个公式。游戏60/85的全属性平移样本也不等于真实FC60/85。
- 原始缓存不入Git：`C:/Users/siyan/Documents/Codex/2026-10-15/wo/outputs/fc-strength-reference-20261028/`，含 `fc24-players.json`、原CSV、发布元数据及比赛缓存。跨电脑接手需按收集器/派生数据中的版本与SHA重新获取；生产运行不需要原始数据库。
- 收集器：`tests/tools/collect-fc-strength.py`、`collect-international-reference.py`；俱乐部别名和FM社区核对也在 `tests/tools/`。
- 另保留英苏联赛、欧洲联赛/杯赛、Wyscout事件和国际杯赛参考；它们的统计定义、覆盖和年代不一样，不能合成一个虚假的全欧洲目标。
- 没有完整同源xG、追踪跑动和稳定球权链现实样本，不从进球/传球数反推不存在的追踪数据。

## 接手后的建议顺序

1. 先确认部署SHA、当前分支和未提交内容；不要把“已部署”误读为“拟真优化完成”。
2. **固定0.46作参照再逐项消融。** 0.46引擎可从 `b3363ee7e52d9cb7643aca55ee3662e3744627e3` 或含新更衣室UI的 `9d7560725431c5f0500539549c99bfccf8422305` 取得；不要部署后再用可变的HEAD冒充旧算法。0.46原本不支持5-4-1，跨版本比较须说明新阵型边界。
3. 优先隔离全局抢断资格/脚端优势、接应争夺与传球失球价值、射门准备风险各自影响。先解释普通对战进球/方差下降，再接受只改善强弱组的补丁。不要继续把整包更改叠在一起后只跑少数好看的种子。
4. 区分技术差、身体差和门将差；检查FC属性直接进入SI跑速时的实际速度是否合理。这是待证伪方向，尚不是已验证根因。
5. 同时保留接近实力、约10分差和极端分差；不同战术、交替主客及独立种子。合理的大比分可以保留，但必须检查形成过程、个体集中和重复率。
6. 现实诊断默认只在后台/开发文档，不擅自增加玩家统计面板。改变算法/属性映射后同步决策图、SVG、摘要与模块CHANGELOG。

### 常用验证命令

```sh
npm run check:plan
npm run check:quick
npm run check
node --test tests/decision-reference.test.mjs tests/reference-data.test.mjs
node tests/tools/calibrate-realism.mjs work/validation/your-standard-run
node tests/tools/calibrate-strength.mjs work/validation/your-strength-run your-cases.json
node tests/tools/compare-matchup.mjs BASELINE_DIR CANDIDATE_DIR OUTPUT.json
```

独立实验仅在开发机运行，最多4场完整比赛Worker。`calibrate-strength`不传cases会跑36场合成对抗；不要无意反复启动。`source: 'fc'`使用外部FC JSON及双方clubId；`source: 'generated'`复现普通四风格控制；`engineModulePath`只供本地对照旧引擎，**不是生产假赛果开关**。

已有测试证据（旧报告不冒充本次最终检查）：快速检查122项冒烟/业务、181项比赛单元及类型/构建通过；真实专项初次15/16，固定种子0:0令“必有进球”的展示夹具失效。已改为真实检查点后的物理头球机会，不注入进球事件，保留入网/庆祝/延迟开球/身份全部断言，该文件2/2重跑通过；完整90分钟确定性测试保留。正式提交仍执行既有 `npm run check`。

服务端5-4-1合法命令枚举触发现有生命周期分类，所以完整检查计划包含物理赛季。上轮申请免重跑的例外**未得到回答**；不要将其当批准，不改分类器省时间。本次按现有分类执行，最终结果另记。

## 部署、数据和权限

- `/api/health`的`version: 0.17.0`是package版本，不是比赛引擎版本；核对build SHA及发布源码的ENGINE_VERSION。
- 用户访问：<http://138.2.64.10/>；Ubuntu24.04，约1GB RAM。当前仍单比赛Worker、服务512MiB、父Node堆128MiB，四场并发未启用，不能再次在现机做四场压力实验。
- SSH：开发机 PuTTY 的 `Default Settings` 已保存连接方式，可用 `C:/Program Files/PuTTY/plink.exe -load "Default Settings" -batch -m ABS_SCRIPT`。**不要在-load后追加主机地址**。不要将私钥、token、会话cookie写进文档/Git/聊天。
- 服务：`touchline-manager.service`；入口 `/srv/touchline-manager/current` → `/srv/touchline-manager/releases/<SHA>`；数据库 `/var/lib/touchline-manager/game.sqlite`；备份 `/var/backups/touchline-manager/`；配置 `/etc/touchline-manager.env`。
- 原内存配置：`--liftoff-only`、原WASM参数及4项malloc变量；不随意删除，不加Redis/Docker/微服务。正式前端在本机build，VM只装锁定生产依赖。
- 切换前必须排空旧引擎任务，核对冻结状态。不能用新版本恢复旧检查点，也不能为方便部署删除未完比赛。
- 使用SQLite一致快照，校验SHA、`integrity_check`并复制离机；源码备份不等于玩家数据备份。部署前后核对六表全列/BLOB指纹，不推进真实玩家比赛、不重置或重算历史。
- 复用 `deploy/install.sh`；保留旧release及unit/env回滚信息。回滚前同样先排空新版本任务；不要直接用旧数据库覆盖新玩家进度。
- 用户曾明确说“别控制我电脑”，只用CLI和独立无界面验收，不操作其活动Chrome/桌面。浏览器检查不得把新匿名存档误当原玩家存档；不明来源的额外记录保留。
- 手机与电脑可能是不同匿名存档。分析“上一场”前确认存档与对手比分，不凭全库最新一条报告猜测。

## 本地证据与备份位置

- 本轮工作原始结果：项目内 `work/validation/mismatch-*`，忽略于Git。
- 0.46冻结源码：`work/validation/production-v046-source/`（含Git源文件SHA清单）。
- 旧源码/全部试验校验备份：`C:/Users/siyan/Documents/Codex/2026-10-15/wo/outputs/mismatch-review-2026-10-28T13-37-00-558Z/`，762文件，校验成功；**不是生产SQLite备份**。
- FC最终上一阶段备份：`.../outputs/fc-strength-final-2026-10-28T09-31-56-324Z/`。
- 生产数据离机目录：`C:/Users/siyan/Documents/Codex/private-backups/touchline-manager/`，不入Git。
- 渲染辅助：`.../outputs/render-tactical-map-20261028.mjs`，仅本地助手；跨电脑需使用已入库Mermaid、SVG、摘要说明重建，不能假定该绝对路径存在。

## 给接手AI的启动提示（可复制）

```text
请接手 sixu3575/touchline-manager。先读 docs/HANDOVER.md、AGENTS.md、PROJECT.md、docs/VALIDATION.md 和 docs/OPERATIONS.md，核对真实生产SHA及Git状态。最近工作是0.47～0.47.2的5-4-1、强弱对抗、FC/FIFA现实基准及防守/门将执行优化。拟真仍未达标：FC20场9 blocked，同水平16对进球均值/方差由0.46的2.31/3.03降至候选1.31/1.03。2026-11-02用户要求在已知问题后部署此版本，但没有永久放宽发布/测试流程。保留并解释这些失败，先以固定0.46源码逐项消融，不要用当前HEAD当旧算法，不恢复已撤回的普遍远侧包抄或相对决策误差方案。球员数据1～100整数；比赛不设比分/射门配额，不压制合理远射；分析只放后台。每次相关改动更新模块CHANGELOG、决策Mermaid/SVG/SOURCE_SNAPSHOT。保护存档、旧回放和单Worker的1GB VM，不操作用户活动浏览器。开发采用独立分支/worktree及模块锁，不修改开发流程。先检查本次部署最终记录，再继续开发。
```

## 本次最终发布记录

待完成工程检查、PR、数据备份、安装与公网验收后填写。未填写之前，不将本文件理解为“已上线”。
