# 实时观战的原生内存诊断与运行参数

2026-10-27；Node 22.23.2 / 24.19.0，Rapier 0.21.0。比赛引擎仍为 `0.44.0-live-manager`，参数仍为 `live-manager-1`。不改模拟、决策、统计、5 Hz轨迹、画面插值、5×展示时钟或存档结构。

## 根因与改动

原生产进程在无Worker时RSS约325 MiB，主线程JS堆仅31 MiB。按glibc 2.39 x86_64结构只读校验arena/空闲链表，约278 MiB分配区已空闲，其中至少244 MiB仍驻留。线程退出释放对象，但共享原生分配器不一定归还操作系统。

独立空Rapier世界首次执行 `world.step()` 已能复现约105 MiB原生临时分配。WASM编译追踪定位内部函数#2664（函数体348,616字节）：Liftoff基础编译约83.5 MiB临时空间，TurboFan优化编译峰值约134.8 MiB；最终机器码各约0.8 MiB。不是每帧都产生该分配，也不是几百MiB坐标数据。正式90分钟轨迹约2.5 MiB，降低采样率对主因收益很小。

systemd采用：

- `--liftoff-only`：只使用WASM基础编译，JS仍正常优化。避免该WASM巨型函数的第二层优化编译峰值；没有改物理库、随机种子或计算输入。
- `MALLOC_ARENA_MAX=2`；`MALLOC_MMAP_THRESHOLD_`、`MALLOC_TRIM_THRESHOLD_`、`MALLOC_TOP_PAD_`均为131072字节：限制分配区数量并固定大分配/回收阈值，减少空闲页滞留。
- 原服务512 MiB、JS老生代128 MiB、单Worker和逐场调度保持。不注入原生插件、不调用生产强制GC/trim、不定时重启服务。

`--liftoff-only`是V8测试性质的运行开关，执行速度可能变慢，Node升级时须重新实测；不能只以启动健康或120秒短样本判断可用。glibc变量只对启动后新分配生效，不会改造旧进程已有arena。回滚采用原release及其unit，不能只切代码符号链接而留下候选unit。

## 验证证据

固定输入：`createGame('Live runtime validation', 20261027)`、前两队、比赛seed20261027、ID `runtime-full`、5400秒、每15秒真实Worker片段。原参数与候选分进程顺序执行，完整90分钟各360片、27,001帧、11,710事件。

| 本机Node24 | 原发布参数 | 候选 |
|---|---:|---:|
| 总耗时 | 51.29秒 | 60.41秒 |
| 15秒片P95 | 182.5毫秒 | 207.9毫秒 |
| 最慢片 | 316.7毫秒 | 313.6毫秒 |
| OS记录RSS高水位 | 299.3 MiB | 258.9 MiB |

总耗时增加约18%，单片仍远低于5×所需的3秒。100ms采样峰值292.3→198.5 MiB，但会漏掉很短的冷编译峰值，不能把它冒充OS高水位。Windows不使用glibc参数，VM另作Linux实测。

两次最终完整报告（含统计、事件与球员数据）的JSON SHA-256相同：`eef8e8814cc732d0329c2fb47aaf7f99a6260c6b77e8b85de00dcc8a7735aee2`；全部传输轨迹片的SHA-256相同：`df8ff749373dfbb1073a4c2fd557832f8d28d45723cc05874c5fb7fc81b14d2e`。这是固定样本一致性证据，不承诺未来不同V8/Rapier版本必然逐位一致。

现有 `tests/match/worker.test.mjs`同时读取发布unit的Node参数和malloc环境，验证跨Worker、检查点、半场、事件、统计及逐帧结果；两个真实Worker测试通过。既有live-clock/frames/http/round共19项通过，覆盖断线/离开继续、未来结果隐藏、增量轨迹及发布幂等。`npm run check`通过26项冒烟、类型和生产构建。本次不是比赛算法或重大流程改动，不运行战术矩阵/赛季，不改验证映射或CI。

首轮VM隔离探针额外限制256 MiB与75% CPU，在4800秒之后的终场阶段被隔离cgroup终止；不能记为完整通过或声称可用256 MiB。首轮真实浏览器同样被额外限CPU，165秒观测有30个一秒画面缓冲样本（无JS/API错误），也不记为观赛通过。正式服务可用两个vCPU、没有CPUQuota。为作有效比较，将在正式资源条件下使用同seed/队伍分别复测原参数与候选；独立完整探针改用384 MiB限额。没有修改正式服务512 MiB或提高并发。

VM完整比赛、正式资源条件的真实5×浏览器及最终部署证据在验证完成后补入本节和 [OPERATIONS](../../../../docs/OPERATIONS.md)。

## 依据与后续边界

[Node22 memoryUsage](https://nodejs.org/docs/latest-v22.x/api/process.html#processmemoryusage)解释RSS、线程堆及glibc碎片化；分配区估计按glibc 2.39的 `malloc.c::int_mallinfo` 与 `arena.c::heap_info`校验，仅为锁外瞬时估计。没有对生产调用mallinfo2或强制GC。

进度原JSON与解析缓存、完整战报序列化仍有数十MiB开销，本次没有改变这些传输/持久化契约。降低当前编译与空闲保留不等于已支持四场并发；用户选择的逐场模式继续有效。
