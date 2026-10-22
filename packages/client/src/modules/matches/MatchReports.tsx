import { FileText, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Crest, Empty, PanelHead } from '../../components/ui';
import type { Report } from '../../model';
import { EventFilter } from './EventFilter';
import { eventMatchesFilter } from './event-filter.mjs';
import { PlayerRatings } from './PlayerRatings';
import { useArchivedReport } from './useArchivedReport';
import './physical.css';
import './reports.css';

export function MatchReports({
  reports,
  onReplay,
}: {
  reports: Report[];
  onReplay: (report: Report) => void;
}) {
  const [selected, setSelected] = useState<Report | null>(null);
  return (
    <section className="panel report-archive" aria-label="赛后战报列表">
      <PanelHead title="赛后战报" subtitle="联赛与杯赛 · 直接查看全场统计、事件与球员评分" />
      {reports.length ? (
        <div className="report-archive-list">
          {reports.map((report) => (
            <div className="report-archive-row" key={report.id}>
              <div className="report-archive-match">
                <small>
                  {report.competition} · 第 {report.round} 轮
                  <span className="report-status settled">已结束</span>
                </small>
                <div className="report-archive-scoreline">
                  <strong className={report.homeId === 'me' ? 'report-own-team' : ''}>
                    {report.homeName}
                  </strong>
                  <span className="report-archive-score">{report.score.join(' : ')}</span>
                  <strong className={report.awayId === 'me' ? 'report-own-team' : ''}>
                    {report.awayName}
                  </strong>
                </div>
                {report.penalties && (
                  <small className="report-archive-subnote">
                    点球 {report.penalties.join(' : ')}
                  </small>
                )}
              </div>
              <div className="report-archive-actions">
                <button
                  className="secondary report-view-button"
                  onClick={() => setSelected(report)}
                >
                  <FileText size={15} /> 查看战报
                </button>
                {(report.homeId === 'me' || report.awayId === 'me') &&
                  report.canReplay !== false && (
                    <button
                      className="secondary report-replay-button"
                      onClick={() => onReplay(report)}
                    >
                      <Play size={14} /> 观看回放
                    </button>
                  )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>暂无赛后战报。比赛播放结束并完成本轮结算后，会显示在这里。</Empty>
      )}
      {selected && (
        <MatchReport key={selected.id} summary={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

export function MatchReport({ summary, onClose }: { summary: Report; onClose: () => void }) {
  const { report, error, retry } = useArchivedReport(summary);
  const [filter, setFilter] = useState('key');
  const [limit, setLimit] = useState(40);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  const events = report?.events.filter((event) => eventMatchesFilter(event.type, filter)) ?? [];
  const stats: [string, (s: Report['stats'][number]) => string | number | undefined][] = [
    ['控球率', (s) => (s.possession === undefined ? undefined : s.possession + '%')],
    ['射门 / 射正', (s) => `${s.shots ?? '—'} / ${s.onTarget ?? '—'}`],
    ['预期进球', (s) => (s.xg === undefined ? undefined : s.xg.toFixed(2))],
    ['成功传球 / 传球', (s) => `${s.completedPasses ?? '—'} / ${s.passes ?? '—'}`],
    ['扑救', (s) => s.saves],
    ['拦截', (s) => s.interceptions],
    [
      '传球成功率',
      (s) => (s.passes ? Math.round((100 * (s.completedPasses ?? 0)) / s.passes) + '%' : '—'),
    ],
    [
      '成功过人 / 尝试',
      (s) => (s.takeOns === undefined ? undefined : `${s.takeOns} / ${s.takeOnAttempts}`),
    ],
    ['丢失球权', (s) => s.possessionLost],
    ['封堵 / 解围', (s) => (s.blocks === undefined ? undefined : `${s.blocks} / ${s.clearances}`)],
    ['角球', (s) => s.corners],
    ['犯规 / 越位', (s) => `${s.fouls ?? '—'} / ${s.offsides ?? '—'}`],
    ['黄牌 / 红牌', (s) => `${s.yellowCards ?? '—'} / ${s.redCards ?? '—'}`],
  ];
  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        className="modal match-report"
        role="dialog"
        aria-modal="true"
        aria-label="赛后战报"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const targets = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), select, summary, a[href]',
            ),
          ].filter((e) => e.getClientRects().length);
          const first = targets[0],
            last = targets.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className="report-heading">
          <div>
            <Badge>赛后战报</Badge>
            <span>
              {summary.competition} · 第 {summary.round} 轮
            </span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭赛后战报">
            <X />
          </button>
        </header>
        {!report ? (
          <div className="report-loading" role="status">
            <h2>{error ? '战报读取失败' : '正在读取赛后战报…'}</h2>
            <p>{error || '读取已保存的事件和统计。'}</p>
            {error && (
              <button className="primary" onClick={retry}>
                重新加载
              </button>
            )}
          </div>
        ) : (
          <>
            {report.legacySummary && (
              <p className="fine">
                升级前这场比赛仅保存了比分，没有完整统计或事件；此处展示已有记录。
              </p>
            )}
            <div className="report-scoreboard">
              <div>
                <Crest name={report.homeName} />
                <h3>{report.homeName}</h3>
                <small>主场</small>
              </div>
              <div className="report-score">
                <strong>{report.score.join(' : ')}</strong>
                <Badge tone="dark">{report.abandoned ? '比赛中止' : '全场结束'}</Badge>
                {report.penalties && <small>点球 {report.penalties.join(' : ')}</small>}
              </div>
              <div>
                <Crest name={report.awayName} color="#c7d0df" />
                <h3>{report.awayName}</h3>
                <small>客场</small>
              </div>
            </div>
            <div className="report-detail-grid">
              <section aria-label="全场球队统计">
                <h3>全场球队统计</h3>
                <table className="report-stat-table">
                  <thead>
                    <tr>
                      <th scope="col">主队</th>
                      <th scope="col">统计项目</th>
                      <th scope="col">客队</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map(([label, value]) => (
                      <tr key={label}>
                        <td>{report.stats[0] ? (value(report.stats[0]) ?? '—') : '—'}</td>
                        <th scope="row">{label}</th>
                        <td>{report.stats[1] ? (value(report.stats[1]) ?? '—') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="fine">未记录的数据以“—”表示。</p>
              </section>
              <section aria-label="全场比赛事件">
                <div className="report-events-heading">
                  <h3>全场比赛事件</h3>
                  <EventFilter
                    value={filter}
                    onChange={(next) => {
                      setFilter(next);
                      setLimit(40);
                    }}
                  />
                </div>
                <div className="report-event-list">
                  {!events.length && <p className="fine">本场没有该类事件记录。</p>}
                  {events.slice(0, limit).map((event, i) => (
                    <div
                      className={
                        'report-event ' +
                        (event.type === 'goal' || event.type === 'penaltyGoal'
                          ? 'report-event-goal'
                          : '')
                      }
                      key={i}
                    >
                      <time>{event.minute > 90 ? '点球' : event.minute + '′'}</time>
                      <div>
                        <small>
                          {event.side === 0
                            ? report.homeName
                            : event.side === 1
                              ? report.awayName
                              : '比赛'}
                        </small>
                        <p>{event.text}</p>
                      </div>
                    </div>
                  ))}
                  {events.length > limit && (
                    <button className="secondary" onClick={() => setLimit((n) => n + 40)}>
                      显示更多事件（已显示 {Math.min(limit, events.length)} / {events.length}）
                    </button>
                  )}
                </div>
              </section>
            </div>
            <PlayerRatings report={report} />
          </>
        )}
      </section>
    </div>
  );
}
