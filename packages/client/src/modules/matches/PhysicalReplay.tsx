import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Pause, Play, SkipForward, X } from 'lucide-react';
import type { Report } from '../../model';
import { Badge, Crest } from '../../components/ui';
import { styleNames } from '../../constants';
import { PhysicalPitch, positionAt, speedAt } from './PhysicalPitch';
import './physical.css';
import './task.css';
import { liveSecond, type MatchJob } from './useMatchJob';
import { visibleMatchEvents } from './event-filter.mjs';
import { EventFilter, EmptyEvents } from './EventFilter';
import { GoalCelebration } from './GoalCelebration';
import { PlayerRatings } from './PlayerRatings';
import { positionRoleNames } from '../../../../shared/modules/tactics/index.mjs';
import { analyzeReplay } from '../../../../shared/modules/matches/replay-analysis.mjs';

const clock = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;
export function PhysicalReplay({
  report,
  onClose,
  live,
}: {
  report: Report;
  onClose: () => void;
  live?: { job: MatchJob; data: Uint16Array | null; connection: string; onBackground: () => void };
}) {
  const meta = report.replay!;
  const clockScale = meta.clockScale ?? 1;
  const [loadedData, setData] = useState<Uint16Array | null>(null);
  const data = live ? live.data : loadedData;
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(live ? 5 : 1);
  const [selected, setSelected] = useState(-1);
  const [eventFilter, setEventFilter] = useState('key');
  const ratingsRef = useRef<HTMLDivElement>(null);
  const liveFrame = useRef({ job: live?.job, duration: meta.duration });
  liveFrame.current = { job: live?.job, duration: meta.duration };
  const regulation = meta.regulationDuration ?? meta.duration;
  const shootout = time > regulation;
  const matchClock = (t: number) => (t > regulation ? '点球大战' : clock(t * clockScale));
  useEffect(() => {
    if (live) return;
    const controller = new AbortController();
    setError('');
    setData(null);
    fetch('/api/replays/' + encodeURIComponent(report.id), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw Error('轨迹加载失败，请重试。');
        const bytes = await res.arrayBuffer();
        if (
          meta.format !== 'positions-u16-v1' ||
          meta.stride !== 49 ||
          bytes.byteLength !== meta.frameCount * meta.stride * 2
        )
          throw Error('轨迹格式不匹配，请刷新页面。');
        const values = new Uint16Array(bytes.byteLength / 2),
          view = new DataView(bytes);
        for (let i = 0; i < values.length; i++) values[i] = view.getUint16(i * 2, true);
        if (!controller.signal.aborted) setData(values);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [report.id, meta, retry, Boolean(live)]);
  const ownComplete = !live || Boolean(live.job.ownComplete);
  const ended = ownComplete && time >= meta.duration;
  const buffering = Boolean(live && !ownComplete && time >= Math.max(0, meta.duration - 0.4));
  const prefix = live ? report.timeline?.filter((row) => row.second <= time).at(-1) : null;
  const visibleStats = live && !ended ? (prefix?.stats ?? report.stats) : report.stats;
  const visiblePerformance =
    live && !ended ? (prefix?.performance ?? report.performance) : report.performance;
  const flowAnalysis = useMemo(
    () => (data && (!live || ended) ? analyzeReplay(report, data) : null),
    [report, data, Boolean(live && ended)],
  );
  useEffect(() => {
    if (!live) return;
    let animation = 0;
    const advance = () => {
      const { job, duration } = liveFrame.current;
      if (job) setTime((t) => Math.max(t, Math.min(duration, liveSecond(job))));
      animation = requestAnimationFrame(advance);
    };
    advance();
    return () => cancelAnimationFrame(animation);
  }, [Boolean(live), report.id]);
  useEffect(() => {
    if (live || !playing || !data || ended || buffering) return;
    let animation = 0,
      last = performance.now();
    const advance = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setTime((t) =>
        Math.min(ownComplete ? meta.duration : Math.max(0, meta.duration - 0.4), t + dt * speed),
      );
      animation = requestAnimationFrame(advance);
    };
    animation = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animation);
  }, [playing, speed, data, meta.duration, ended, buffering, ownComplete]);
  const events = visibleMatchEvents(report.events, time, eventFilter);
  const score = live
    ? report.score
    : [0, 1].map(
        (side) =>
          report.events.filter(
            (e) =>
              (e.second ?? 0) <= time && e.type === 'goal' && e.minute <= 90 && e.side === side,
          ).length,
      );
  const player = meta.players[selected];
  const performanceRow = player && visiblePerformance?.find((p) => p.id === player.id);
  const ballHeight = data ? positionAt(data, report, time).positions[45] : 0;
  const ballSpeed = data ? speedAt(data, report, time) * 3.6 : 0;
  return (
    <div className="modal-backdrop physical-backdrop">
      <section
        className="modal replay physical-replay"
        role="dialog"
        aria-modal="true"
        aria-label={live ? '实时比赛观看' : '物理比赛回放'}
      >
        <div className="replay-top">
          <div>
            <Badge>{live ? `实时观看 · ${speed}× 快进` : '物理比赛回放'}</Badge>
            <span className="muted">
              {' '}
              {report.competition} · 第 {report.round} 轮
            </span>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={live ? '退出观赛，比赛继续' : '关闭回放'}
          >
            <X />
          </button>
        </div>
        {live && (
          <div className="physical-live-progress">
            <span>
              {live.connection ||
                (live.job.status === 'failed'
                  ? '比赛暂时中断，请返回俱乐部恢复原场比赛'
                  : buffering
                    ? '正在衔接下一段画面…'
                    : ownComplete
                      ? '终场哨响'
                      : '比赛按5倍速进行，离开后进度继续')}
              {' · 当前 '}
              {clock(time)}
              {live.job.ownComplete && live.job.status !== 'complete' && ' · 正在确认本轮结果'}
            </span>
            <div>
              <button onClick={live.onBackground}>返回俱乐部 · 比赛继续</button>
            </div>
          </div>
        )}
        <div className="scoreboard physical-scoreboard">
          <div>
            <Crest name={report.homeName} />
            <h3>{report.homeName}</h3>
            <small>主场 · {report.snapshots[0].tactics.formation}</small>
          </div>
          <div className="score">
            <strong>
              {score[0]}
              <span>:</span>
              {score[1]}
            </strong>
            <Badge tone="dark">
              {ended ? (report.abandoned ? '比赛中止' : '全场结束') : matchClock(time)}
            </Badge>
            {report.penalties && ended && (
              <small>
                点球 {report.penalties.join(' : ')} ·{' '}
                {(report.eventFormatVersion ?? 0) >= 2 ? '物理点球大战' : '简化结算'}
              </small>
            )}
          </div>
          <div>
            <Crest name={report.awayName} color="#e9e0cf" />
            <h3>{report.awayName}</h3>
            <small>客场 · {report.snapshots[1].tactics.formation}</small>
          </div>
        </div>
        {(!live || ended) && (
          <button
            type="button"
            className="ratings-jump"
            onClick={() =>
              ratingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            查看赛后球员评分 ↓
          </button>
        )}
        <div className="physical-layout">
          <div>
            <div className="simulation-ribbon">
              <span>
                <i /> {live ? '现场画面' : '比赛回放'}
              </span>
              <span>
                球速 {ballSpeed.toFixed(0)} km/h · 球高 {Math.max(0, ballHeight - 0.11).toFixed(1)}{' '}
                m
              </span>
            </div>
            <div className="match-pitch-stage">
              {data ? (
                <PhysicalPitch
                  data={data}
                  report={report}
                  time={time}
                  selected={selected}
                  onSelect={setSelected}
                />
              ) : (
                <div className="physical-loading" role="status">
                  {error || '正在读取保存的球员与足球轨迹…'}
                  {error && <button onClick={() => setRetry((r) => r + 1)}>重新加载</button>}
                </div>
              )}
              <GoalCelebration report={report} time={time} />
            </div>
            <div className="physical-legend">
              <span>
                <i className="home-dot" />
                {report.homeName}
              </span>
              <span>
                <i className="away-dot" />
                {report.awayName}
              </span>
              <span>点击球员查看跑动</span>
            </div>
            {live ? (
              <div className="replay-controls live-clock-controls">
                <b>{matchClock(time)}</b>
                <progress aria-label="直播比赛进度" value={time} max={Math.max(regulation, time)} />
                <span>固定 5× · 自动同步当前进度</span>
              </div>
            ) : (
              <div className="replay-controls">
                <button
                  className="icon-button"
                  aria-label={playing && !ended ? '暂停回放' : '播放回放'}
                  onClick={() => {
                    if (ended) setTime(0);
                    setPlaying(ended || !playing);
                  }}
                >
                  {playing && !ended ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <input
                  aria-label="比赛进度"
                  type="range"
                  min="0"
                  max={meta.duration}
                  step="0.1"
                  value={time}
                  onChange={(e) => {
                    setTime(+e.target.value);
                    setPlaying(false);
                  }}
                />
                <b>{matchClock(time)}</b>
                <select
                  aria-label="回放速度"
                  value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                >
                  {[1, 5, 12, 15, 30, 60, 120].map((v) => (
                    <option key={v} value={v}>
                      {v}×{v === 1 ? ' 实速' : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  title="下一次射门"
                  aria-label="下一次射门"
                  onClick={() => {
                    const next = report.events.find(
                      (e) => ['shot', 'goal'].includes(e.type) && (e.second ?? 0) > time + 5,
                    );
                    setTime(next ? Math.max(0, next.second! - 4) : meta.duration);
                    setPlaying(false);
                  }}
                >
                  <SkipForward size={18} />
                </button>
              </div>
            )}
            <div className="physical-player-detail">
              <select
                aria-label="查看球员跑动"
                value={selected}
                onChange={(e) => setSelected(+e.target.value)}
              >
                <option value={-1}>选择球员 · 查看跑动数据</option>
                {meta.players.map((p, i) => (
                  <option key={p.id} value={i}>
                    {p.side ? '客' : '主'} {p.number} · {p.name}
                  </option>
                ))}
              </select>
              {performanceRow ? (
                <span>
                  {performanceRow.positionRole && (
                    <b>
                      {positionRoleNames[
                        performanceRow.positionRole as keyof typeof positionRoleNames
                      ] ?? performanceRow.positionRole}{' '}
                      ·{' '}
                    </b>
                  )}
                  {performanceRow.style && <b>{performanceRow.style} · </b>}实际跑动{' '}
                  {(performanceRow.distance / 1000).toFixed(2)} km · 触球 {performanceRow.touches} ·
                  成功传球 {performanceRow.completed}/{performanceRow.passes} ·{' '}
                  {live && !ended ? '当前体能' : '赛末体能'} {performanceRow.energy}
                  {performanceRow.yellowCards !== undefined &&
                    ` · 黄牌 ${performanceRow.yellowCards} / 红牌 ${performanceRow.redCards}`}
                  {performanceRow.dribbleTouches !== undefined &&
                    ` · 带球触球 ${performanceRow.dribbleTouches} / 推进 ${performanceRow.carryDistance} m · 直塞 ${performanceRow.throughBalls} / 长传 ${performanceRow.longPasses} / 一脚出球 ${performanceRow.oneTouchPasses}`}
                  {performanceRow.mind &&
                    ` · 士气 ${Math.round(performanceRow.mind.morale)} / 信心 ${Math.round(performanceRow.mind.confidence)}`}
                </span>
              ) : (
                <span>球员按阵型、攻防阶段和属性寻找位置。</span>
              )}
            </div>
            <div className="match-stats physical-stats">
              {[
                ['控球率', visibleStats[0].possession + '%', visibleStats[1].possession + '%'],
                [
                  '射门 / 射正',
                  visibleStats[0].shots + ' / ' + visibleStats[0].onTarget,
                  visibleStats[1].shots + ' / ' + visibleStats[1].onTarget,
                ],
                [
                  '成功传球',
                  visibleStats[0].completedPasses + ' / ' + visibleStats[0].passes,
                  visibleStats[1].completedPasses + ' / ' + visibleStats[1].passes,
                ],
                ['预期进球', visibleStats[0].xg, visibleStats[1].xg],
                ...(visibleStats[0].fouls !== undefined
                  ? [
                      [
                        '犯规 / 越位',
                        `${visibleStats[0].fouls} / ${visibleStats[0].offsides}`,
                        `${visibleStats[1].fouls} / ${visibleStats[1].offsides}`,
                      ],
                      [
                        '黄牌 / 红牌',
                        `${visibleStats[0].yellowCards} / ${visibleStats[0].redCards}`,
                        `${visibleStats[1].yellowCards} / ${visibleStats[1].redCards}`,
                      ],
                    ]
                  : []),
              ].map(([label, a, b]) => (
                <div key={label}>
                  <b>{a}</b>
                  <span>
                    {label}
                    <small>
                      {live && !ended ? '截至 ' + clock(prefix?.second ?? 0) : '全场统计'}
                    </small>
                  </span>
                  <b>{b}</b>
                </div>
              ))}
            </div>
            {(!live || ended) && flowAnalysis && (
              <details className="replay-flow-analysis">
                <summary>回放节奏与射门分析</summary>
                {flowAnalysis.status !== 'available' ? (
                  <p className="fine">{flowAnalysis.reason}</p>
                ) : (
                  <>
                    <p className="fine">{flowAnalysis.definition}</p>
                    <div className="replay-flow-table-wrap">
                      <table className="report-stat-table replay-flow-table">
                        <thead>
                          <tr>
                            <th scope="col">主队</th>
                            <th scope="col">分析指标</th>
                            <th scope="col">客队</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{flowAnalysis.teams[0].possessionCount ?? '—'}</td>
                            <th scope="row">模型球权阶段</th>
                            <td>{flowAnalysis.teams[1].possessionCount ?? '—'}</td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].possessionMedianSeconds?.toFixed(1) ?? '—'} s /{' '}
                              {flowAnalysis.teams[0].possessionP90Seconds?.toFixed(1) ?? '—'} s
                            </td>
                            <th scope="row">阶段时长中位数 / P90</th>
                            <td>
                              {flowAnalysis.teams[1].possessionMedianSeconds?.toFixed(1) ?? '—'} s /{' '}
                              {flowAnalysis.teams[1].possessionP90Seconds?.toFixed(1) ?? '—'} s
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].individualControlCount ?? '—'} /{' '}
                              {flowAnalysis.teams[0].individualControlMedianSeconds?.toFixed(1) ?? '—'} s
                            </td>
                            <th scope="row">个人控球段数 / 中位时长</th>
                            <td>
                              {flowAnalysis.teams[1].individualControlCount ?? '—'} /{' '}
                              {flowAnalysis.teams[1].individualControlMedianSeconds?.toFixed(1) ?? '—'} s
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].controlEndsByPass ?? '—'} /{' '}
                              {flowAnalysis.teams[0].controlEndsByShot ?? '—'} /{' '}
                              {flowAnalysis.teams[0].controlEndsByDispossession ?? '—'} /{' '}
                              {flowAnalysis.teams[0].controlEndsByLooseCarry ?? '—'}
                            </td>
                            <th scope="row">个人控球结束：传球 / 射门 / 被断 / 脱控</th>
                            <td>
                              {flowAnalysis.teams[1].controlEndsByPass ?? '—'} /{' '}
                              {flowAnalysis.teams[1].controlEndsByShot ?? '—'} /{' '}
                              {flowAnalysis.teams[1].controlEndsByDispossession ?? '—'} /{' '}
                              {flowAnalysis.teams[1].controlEndsByLooseCarry ?? '—'}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].looseCarryCauses
                                ? `${flowAnalysis.teams[0].looseCarryCauses.airborne} / ${flowAnalysis.teams[0].looseCarryCauses.outsideRadius} / ${flowAnalysis.teams[0].looseCarryCauses.carryRecoveryExpired} / ${flowAnalysis.teams[0].looseCarryCauses.noCarryIntent} / ${flowAnalysis.teams[0].looseCarryCauses.relativeSpeed}`
                                : '—'}
                            </td>
                            <th scope="row">脱控原因：球过高 / 超出半径 / 带球恢复期过 / 无带球意图 / 球人相对速度高</th>
                            <td>
                              {flowAnalysis.teams[1].looseCarryCauses
                                ? `${flowAnalysis.teams[1].looseCarryCauses.airborne} / ${flowAnalysis.teams[1].looseCarryCauses.outsideRadius} / ${flowAnalysis.teams[1].looseCarryCauses.carryRecoveryExpired} / ${flowAnalysis.teams[1].looseCarryCauses.noCarryIntent} / ${flowAnalysis.teams[1].looseCarryCauses.relativeSpeed}`
                                : '—'}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].medianBallSeparationAtLooseCarryMetres?.toFixed(1) ?? '—'} m /{' '}
                              {flowAnalysis.teams[0].medianBallHeightAtLooseCarryMetres?.toFixed(1) ?? '—'} m /{' '}
                              {flowAnalysis.teams[0].medianRelativeSpeedAtLooseCarryMetresPerSecond?.toFixed(1) ?? '—'} m/s
                            </td>
                            <th scope="row">脱控时球人间距 / 球高 / 球人相对速度（中位）</th>
                            <td>
                              {flowAnalysis.teams[1].medianBallSeparationAtLooseCarryMetres?.toFixed(1) ?? '—'} m /{' '}
                              {flowAnalysis.teams[1].medianBallHeightAtLooseCarryMetres?.toFixed(1) ?? '—'} m /{' '}
                              {flowAnalysis.teams[1].medianRelativeSpeedAtLooseCarryMetresPerSecond?.toFixed(1) ?? '—'} m/s
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].medianNearestDefenderAtDispossessionMetres?.toFixed(1) ?? '—'} m
                            </td>
                            <th scope="row">被断时最近防守者距离（中位）</th>
                            <td>
                              {flowAnalysis.teams[1].medianNearestDefenderAtDispossessionMetres?.toFixed(1) ?? '—'} m
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].completedPassChainMedian ?? '—'} /{' '}
                              {flowAnalysis.teams[0].completedPassChainMean?.toFixed(2) ?? '—'}
                            </td>
                            <th scope="row">连续成功传球链中位数 / 均值</th>
                            <td>
                              {flowAnalysis.teams[1].completedPassChainMedian ?? '—'} /{' '}
                              {flowAnalysis.teams[1].completedPassChainMean?.toFixed(2) ?? '—'}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].forwardPasses} /{' '}
                              {flowAnalysis.teams[0].lateralPasses} /{' '}
                              {flowAnalysis.teams[0].backwardPasses}
                            </td>
                            <th scope="row">
                              向前 / 横向 / 回传（已分析 {flowAnalysis.teams[0].passDirectionCoverage}/
                              {flowAnalysis.match.passDirectionTotal} 脚）
                            </th>
                            <td>
                              {flowAnalysis.teams[1].forwardPasses} /{' '}
                              {flowAnalysis.teams[1].lateralPasses} /{' '}
                              {flowAnalysis.teams[1].backwardPasses}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].shots}（近3m防守者{' '}
                              {flowAnalysis.teams[0].shotsWithDefenderWithinThreeMetres}）
                            </td>
                            <th scope="row">射门（出脚时近3米有防守者）</th>
                            <td>
                              {flowAnalysis.teams[1].shots}（近3m防守者{' '}
                              {flowAnalysis.teams[1].shotsWithDefenderWithinThreeMetres}）
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].shotsInsideTwelveMetres} /{' '}
                              {flowAnalysis.teams[0].shotsTwelveToTwentyMetres} /{' '}
                              {flowAnalysis.teams[0].shotsTwentyToTwentyEightMetres} /{' '}
                              {flowAnalysis.teams[0].shotsBeyondTwentyEightMetres}
                            </td>
                            <th scope="row">射门距离（≤12 / 12–20 / 20–28 / ＞28米）</th>
                            <td>
                              {flowAnalysis.teams[1].shotsInsideTwelveMetres} /{' '}
                              {flowAnalysis.teams[1].shotsTwelveToTwentyMetres} /{' '}
                              {flowAnalysis.teams[1].shotsTwentyToTwentyEightMetres} /{' '}
                              {flowAnalysis.teams[1].shotsBeyondTwentyEightMetres}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].multiShotPossessions} 段 / 30秒内重复射门{' '}
                              {flowAnalysis.teams[0].burstShotsWithinThirtySeconds} 次
                            </td>
                            <th scope="row">连续射门集中度</th>
                            <td>
                              {flowAnalysis.teams[1].multiShotPossessions} 段 / 30秒内重复射门{' '}
                              {flowAnalysis.teams[1].burstShotsWithinThirtySeconds} 次
                            </td>
                          </tr>
                          <tr>
                            <td>
                              {flowAnalysis.teams[0].receptionsWithDefenderWithinThreeMetres}/
                              {flowAnalysis.teams[0].passCompletions}
                            </td>
                            <th scope="row">接球时近3米有防守者 / 成功接球</th>
                            <td>
                              {flowAnalysis.teams[1].receptionsWithDefenderWithinThreeMetres}/
                              {flowAnalysis.teams[1].passCompletions}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="fine">
                      防守方 DEF 与 MID 平均纵向间距：
                      {flowAnalysis.match.defensiveMidfieldGapMeanMetres?.toFixed(1) ?? '—'} m（P90{' '}
                      {flowAnalysis.match.defensiveMidfieldGapP90Metres?.toFixed(1) ?? '—'} m，样本{' '}
                      {flowAnalysis.match.defensiveShapeSamples}）；外场平均体能{' '}
                      {flowAnalysis.match.averageStartingEnergy?.toFixed(0) ?? '—'} →{' '}
                      {flowAnalysis.match.averageEndingEnergy?.toFixed(0) ?? '—'}（平均消耗{' '}
                      {flowAnalysis.match.averageEnergyDrop?.toFixed(1) ?? '—'}）。
                    </p>
                    <p className="fine">
                      模型球权转换：拦截 {flowAnalysis.match.turnovers?.interception ?? '—'}、被断{' '}
                      {flowAnalysis.match.turnovers?.dispossessed ?? '—'}、带球脱控{' '}
                      {flowAnalysis.match.turnovers?.looseCarry ?? '—'}；指标用于定位节奏来源，不作为球员表现评分。
                    </p>
                  </>
                )}
              </details>
            )}
            {(!live || ended) && (
              <div ref={ratingsRef} className="ratings-anchor">
                <PlayerRatings report={report} />
              </div>
            )}
          </div>
          <aside className="commentary physical-commentary">
            <h3>
              <Activity size={16} /> 场上动态
            </h3>
            <div className="physical-tactics">
              {report.snapshots.map((s, i) => (
                <span className="physical-tactic-row" key={s.id}>
                  <span>{i ? '客队' : '主队'}</span>
                  <b>
                    {styleNames[s.tactics.style] ?? s.tactics.style} /{' '}
                    {
                      (
                        { high: '高压', normal: '均衡压迫', low: '低位防守' } as Record<
                          string,
                          string
                        >
                      )[s.tactics.press]
                    }
                  </b>
                </span>
              ))}
            </div>
            <EventFilter value={eventFilter} onChange={setEventFilter} />
            <div className="physical-events">
              {!events.length && <EmptyEvents filter={eventFilter} />}
              {events
                .slice(-7)
                .reverse()
                .map((e, i) => (
                  <div
                    className={'event ' + (e.type === 'goal' ? 'goal-event' : '')}
                    key={e.second + '-' + i}
                  >
                    <b>{e.second !== undefined ? matchClock(e.second) : clock(e.minute * 60)}</b>
                    <div>
                      <p>{e.text}</p>
                      {e.quality !== undefined && (
                        <details className="event-explanation">
                          <summary>动作解释</summary>
                          {typeof e.quality === 'number' ? (
                            <span>
                              动作质量 {e.quality.toFixed(1)}
                              {e.opponentQuality !== undefined &&
                                ` / 对手 ${e.opponentQuality.toFixed(1)}`}
                              {e.probability !== undefined &&
                                ` · 本次局部对抗概率 ${(e.probability * 100).toFixed(0)}%`}
                            </span>
                          ) : (
                            <span>
                              {e.decision && (
                                <>
                                  {e.decision}。<br />
                                </>
                              )}
                              {e.reason}。有效质量 {e.quality.value.toFixed(1)} · 压力扣分{' '}
                              {e.quality.pressureLoss.toFixed(1)} · 脚法系数{' '}
                              {e.quality.foot.toFixed(3)} · 心理修正{' '}
                              {(e.quality.mental ?? 0).toFixed(1)}
                            </span>
                          )}
                        </details>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            <p className="fine">
              {clockScale > 1 &&
                '免费VM模式：90分钟比赛时钟对应12分钟连续物理过程，跑动数据为实际模拟距离。'}
              {report.rulesVersion && '已启用基础越位、犯规、红黄牌与定位球。'}20 Hz物理、5
              Hz轨迹采样。
              {live
                ? '固定5倍速，90分钟约18分钟；离开、关闭页面和重新进入都沿用同一比赛进度。缓冲和点球可能延长时间，结果在终场后统一记录。'
                : '暂停、拖动和变速不会改变已结算赛果。'}
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
