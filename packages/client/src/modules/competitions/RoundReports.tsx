import { useState } from 'react';
import type { Game, Report } from '../../model';
import { PanelHead } from '../../components/ui';
import { MatchReport } from '../matches';
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
          return (
            <div className="report-archive-row" key={h}>
              <strong>
                {home.name} <span>{result ? result.score.join(' : ') : '— : —'}</span> {away.name}
              </strong>
              <div className="report-archive-actions">
                <button
                  className="secondary"
                  disabled={!summary}
                  onClick={() => summary && setSelected(summary)}
                >
                  查看战报
                </button>
                {report && (h === 'me' || a === 'me') && report.canReplay !== false && (
                  <button className="ghost" onClick={() => onReplay(report)}>
                    观看回放
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selected && (
        <MatchReport key={selected.id} summary={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
