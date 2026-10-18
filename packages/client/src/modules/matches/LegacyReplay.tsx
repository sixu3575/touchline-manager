import { Activity, Goal, Pause, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Crest } from '../../components/ui';
import type { Club, Report } from '../../model';
import { Pitch } from './Pitch';
import { visibleMatchEvents } from './event-filter.mjs';
import { EventFilter, EmptyEvents } from './EventFilter';
import './physical.css';
export function LegacyReplay({ report, onClose }: { report: Report; onClose: () => void }) {
  const [minute, setMinute] = useState(0),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(3);
  const [eventFilter, setEventFilter] = useState('key');
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setMinute((m) => {
          if (m >= 90) {
            setPlaying(false);
            return 90;
          }
          return Math.min(90, m + 1);
        }),
      1000 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed]);
  const visibleEvents = visibleMatchEvents(report.events, minute * 60, 'all');
  const events = visibleMatchEvents(report.events, minute * 60, eventFilter);
  const latest = visibleEvents.at(-1);
  const score = [0, 1].map(
    (side) =>
      visibleEvents.filter((e) => e.type === 'goal' && e.minute <= 90 && e.side === side).length,
  );
  const home = {
    ...report.snapshots[0],
    color: '#c7ef76',
    lineup: report.snapshots[0].players.map((p) => p.id),
  } as Club;
  const away = {
    ...report.snapshots[1],
    color: '#e9e5da',
    lineup: report.snapshots[1].players.map((p) => p.id),
  } as Club;
  return (
    <div className="modal-backdrop">
      <section className="modal replay">
        <div className="replay-top">
          <div>
            <Badge>比赛回放</Badge>
            <span className="muted">
              {' '}
              {report.competition} · 第 {report.round} 轮
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭回放">
            <X />
          </button>
        </div>
        <div className="scoreboard">
          <div>
            <Crest name={report.homeName} />
            <h3>{report.homeName}</h3>
            <small>主场</small>
          </div>
          <div className="score">
            <strong>
              {score[0]}
              <span>:</span>
              {score[1]}
            </strong>
            <Badge tone="dark">{minute >= 90 ? '全场结束' : minute + '′'}</Badge>
            {report.penalties && minute === 90 && (
              <small>点球 {report.penalties.join(' : ')}</small>
            )}
          </div>
          <div>
            <Crest name={report.awayName} color="#c7d0df" />
            <h3>{report.awayName}</h3>
            <small>客场</small>
          </div>
        </div>
        <div className="replay-body">
          <div>
            <div className="replay-pitch">
              <Pitch
                club={home}
                minute={minute}
                ball={latest ? { x: latest.x, y: latest.y } : { x: 50, y: 50 }}
              />
              <div className="away-overlay">
                <Pitch club={away} minute={minute} away />
              </div>
            </div>
            <div className="replay-controls">
              <button
                className="icon-button"
                onClick={() => {
                  if (minute === 90) setMinute(0);
                  setPlaying(!playing);
                }}
                aria-label={playing ? '暂停回放' : '播放回放'}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <input
                aria-label="比赛进度"
                type="range"
                min="0"
                max="90"
                value={minute}
                onChange={(e) => {
                  setMinute(+e.target.value);
                  setPlaying(false);
                }}
              />
              <b>{minute}′</b>
              <select
                aria-label="回放速度"
                value={speed}
                onChange={(e) => setSpeed(+e.target.value)}
              >
                <option value="1">1×</option>
                <option value="3">3×</option>
                <option value="9">9×</option>
              </select>
            </div>
            <div className="match-stats">
              {[
                ['控球率', report.stats[0].possession + '%', report.stats[1].possession + '%'],
                ['射门', report.stats[0].shots, report.stats[1].shots],
                ['射正', report.stats[0].onTarget, report.stats[1].onTarget],
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
          <aside className="commentary">
            <h3>
              <Activity size={17} /> 比赛实况
            </h3>
            <EventFilter value={eventFilter} onChange={setEventFilter} />
            {!events.length && <EmptyEvents filter={eventFilter} />}
            {events
              .slice(-8)
              .reverse()
              .map((e, i) => (
                <div
                  className={'event ' + (e.type === 'goal' ? 'goal-event' : '')}
                  key={e.minute + '-' + i}
                >
                  <b>{e.minute}′</b>
                  <p>
                    {e.type === 'goal' && <Goal size={16} />} {e.text}
                  </p>
                </div>
              ))}
            <p className="fine">根据已保存的真实事件播放；球员位置为示意。赛果已由服务器结算。</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
