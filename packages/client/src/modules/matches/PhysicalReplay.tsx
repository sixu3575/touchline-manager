import { useEffect, useState } from 'react';
import { Activity, Pause, Play, SkipForward, X } from 'lucide-react';
import type { Report } from '../../model';
import { Badge, Crest } from '../../components/ui';
import { styleNames } from '../../constants';
import { PhysicalPitch, positionAt } from './PhysicalPitch';
import './physical.css';

const clock = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;
export function PhysicalReplay({ report, onClose }: { report: Report; onClose: () => void }) {
  const meta = report.replay!;
  const clockScale = meta.clockScale ?? 1;
  const [data, setData] = useState<Uint16Array | null>(null);
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(5);
  const [selected, setSelected] = useState(-1);
  useEffect(() => {
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
  }, [report.id, meta, retry]);
  const ended = time >= meta.duration;
  useEffect(() => {
    if (!playing || !data || ended) return;
    let animation = 0,
      last = performance.now();
    const advance = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setTime((t) => Math.min(meta.duration, t + dt * speed));
      animation = requestAnimationFrame(advance);
    };
    animation = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animation);
  }, [playing, speed, data, meta.duration, ended]);
  const events = report.events.filter(
    (e) => (e.second ?? e.minute * 60) <= time && e.type !== 'pass',
  );
  const score = [0, 1].map(
    (side) => events.filter((e) => e.type === 'goal' && e.minute <= 90 && e.side === side).length,
  );
  const player = meta.players[selected];
  const performanceRow = player && report.performance?.find((p) => p.id === player.id);
  const ballHeight = data ? positionAt(data, report, time).positions[45] : 0;
  return (
    <div className="modal-backdrop physical-backdrop">
      <section
        className="modal replay physical-replay"
        role="dialog"
        aria-modal="true"
        aria-label="物理比赛回放"
      >
        <div className="replay-top">
          <div>
            <Badge>物理比赛回放</Badge>
            <span className="muted">
              {' '}
              {report.competition} · 第 {report.round} 轮
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭回放">
            <X />
          </button>
        </div>
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
            <Badge tone="dark">{ended ? '全场结束' : clock(time * clockScale)}</Badge>
            {report.penalties && ended && (
              <small>点球 {report.penalties.join(' : ')} · 简化结算</small>
            )}
          </div>
          <div>
            <Crest name={report.awayName} color="#e9e0cf" />
            <h3>{report.awayName}</h3>
            <small>客场 · {report.snapshots[1].tactics.formation}</small>
          </div>
        </div>
        <div className="physical-layout">
          <div>
            <div className="simulation-ribbon">
              <span>
                <i /> RAPIER 3D · 实际轨迹
              </span>
              <span>球高 {Math.max(0, ballHeight - 0.11).toFixed(1)} m</span>
            </div>
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
              <b>{clock(time * clockScale)}</b>
              <select
                aria-label="回放速度"
                value={speed}
                onChange={(e) => setSpeed(+e.target.value)}
              >
                {[1, 5, 15, 30, 60, 120].map((v) => (
                  <option key={v} value={v}>
                    {v}×
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
                  模拟段 {(performanceRow.distance / 1000).toFixed(2)} km · 触球{' '}
                  {performanceRow.touches} · 成功传球 {performanceRow.completed}/
                  {performanceRow.passes} · 赛末体能 {performanceRow.energy}
                </span>
              ) : (
                <span>球员按阵型、攻防阶段和属性寻找位置。</span>
              )}
            </div>
            <div className="match-stats physical-stats">
              {[
                ['控球率', report.stats[0].possession + '%', report.stats[1].possession + '%'],
                [
                  '射门 / 射正',
                  report.stats[0].shots + ' / ' + report.stats[0].onTarget,
                  report.stats[1].shots + ' / ' + report.stats[1].onTarget,
                ],
                [
                  '成功传球',
                  report.stats[0].completedPasses + ' / ' + report.stats[0].passes,
                  report.stats[1].completedPasses + ' / ' + report.stats[1].passes,
                ],
                ['预期进球', report.stats[0].xg, report.stats[1].xg],
              ].map(([label, a, b]) => (
                <div key={label}>
                  <b>{a}</b>
                  <span>
                    {label}
                    <small>全场统计</small>
                  </span>
                  <b>{b}</b>
                </div>
              ))}
            </div>
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
            <div className="physical-events">
              {events
                .slice(-7)
                .reverse()
                .map((e, i) => (
                  <div
                    className={'event ' + (e.type === 'goal' ? 'goal-event' : '')}
                    key={e.second + '-' + i}
                  >
                    <b>{clock(e.second !== undefined ? e.second * clockScale : e.minute * 60)}</b>
                    <p>{e.text}</p>
                  </div>
                ))}
            </div>
            <p className="fine">
              {clockScale > 1 &&
                '免费VM模式：90分钟比赛时钟对应12分钟连续物理过程，跑动数据为实际模拟距离。'}
              20 Hz物理、5 Hz轨迹采样。暂停、拖动和变速不会改变已结算赛果。
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
