import { useState } from 'react';
import { FileText, Play } from 'lucide-react';
import type { Game, Report } from '../../model';
import { PanelHead } from '../../components/ui';
import { MatchReport, TeamRating } from '../matches';
import './competitions.css';
export function RoundReports({ game, onReplay }: { game: Game; onReplay: (r: Report) => void }) {
  const [round, setRound] = useState(Math.max(1, game.round)),
    [selected, setSelected] = useState<Report | null>(null);
  const rows = game.schedule[round - 1] ?? [];
  return (
    <section className="panel round-reports" aria-label="每轮全部战报">
      <PanelHead
        title="每轮全部比赛"
        subtitle="本队可看战报和回放；其他球队仅提供战报。未结算结果不会提前公布。"
      />
      <label>
        选择轮次{' '}
        <select
          aria-label="战报轮次"
          value={round}
          onChange={(e) => setRound(Number(e.target.value))}
        >
          {game.schedule.map((_, i) => (
            <option key={i} value={i + 1}>
              第{i + 1}轮{i + 1 > game.round ? ' · 未结算' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="report-archive-list">
        {rows.map(([h, a]) => {
          const result = game.results.find(
              (r) => r.round === round && r.homeId === h && r.awayId === a,
            ),
            report = game.reports.find((r) => r.id === result?.id);
          const home = game.clubs.find((c) => c.id === h)!,
            away = game.clubs.find((c) => c.id === a)!;
          const summary: Report | undefined =
            report ??
            (result
              ? {
                  id: result.id,
                  homeId: h,
                  awayId: a,
                  homeName: home.name,
                  awayName: away.name,
                  score: result.score,
                  stats: [],
                  events: [],
                  snapshots: [],
                  competition: '先锋联赛',
                  round,
                  season: game.season,
                  engineVersion: 'legacy-score',
                  canReplay: false,
                  legacySummary: true,
                }
              : undefined);
          const ownMatch = h === 'me' || a === 'me';
          return (
            <article className="report-archive-row" key={h}>
              <div className="report-archive-match">
                <small>
                  <span>先锋联赛 · 第{round}轮</span>
                  <span className={result ? 'report-status settled' : 'report-status'}>
                    {result ? '已结束' : '未公布'}
                  </span>
                </small>
                <div className="report-archive-scoreline">
                  <strong className={h === 'me' ? 'report-own-team' : ''}>
                    {home.name}
                    {summary && <TeamRating report={summary} side={0} />}
                  </strong>
                  <span className="report-archive-score">
                    {result ? result.score.join(' : ') : '— : —'}
                  </span>
                  <strong className={a === 'me' ? 'report-own-team' : ''}>
                    {away.name}
                    {summary && <TeamRating report={summary} side={1} />}
                  </strong>
                </div>
              </div>
              <div className="report-archive-actions">
                <button
                  className="secondary report-view-button"
                  disabled={!summary}
                  onClick={() => summary && setSelected(summary)}
                >
                  <FileText size={16} aria-hidden="true" /> 查看战报
                </button>
                {report && ownMatch && report.canReplay !== false && (
                  <button
                    className="secondary report-replay-button"
                    onClick={() => onReplay(report)}
                  >
                    <Play size={16} aria-hidden="true" /> 观看回放
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {selected && (
        <MatchReport key={selected.id} summary={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
