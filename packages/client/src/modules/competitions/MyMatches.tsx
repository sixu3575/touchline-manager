import { useState } from 'react';
import { FileText, Play } from 'lucide-react';
import type { Game, Report } from '../../model';
import { Empty } from '../../components/ui';
import { MatchReport, TeamAbility } from '../matches';
import './press-room.css';

export function MyMatches({ game, onReport }: { game: Game; onReport: (r: Report) => void }) {
  const [selected, setSelected] = useState<Report | null>(null);
  const reports = game.reports.filter((r) => r.homeId === 'me' || r.awayId === 'me');
  const label = (report: Report) =>
    `${report.season ? `第${report.season}赛季` : '历史'}${report.competition}第${report.round}轮${report.homeName}对${report.awayName}`;
  return (
    <section className="film-library" aria-label="本队比赛录像带">
      <p className="film-library-note">
        {reports.length}盘已归档录像 · 点标签看战报，按播放键重温比赛。
      </p>
      {reports.length ? (
        <div className="film-shelf">
          {reports.map((report) => (
            <article className="film-case" key={report.id}>
              <button
                className="film-label"
                onClick={() => setSelected(report)}
                aria-label={`查看${label(report)}的战报`}
              >
                <small>
                  {report.competition} · 第{report.round}轮
                  {report.season ? ` · S${report.season}` : ''}
                </small>
                <span className="film-reels" aria-hidden="true">
                  <i />
                  <span>TOUCHLINE</span>
                  <i />
                </span>
                <span className="film-score">
                  <b>{report.homeName}</b>
                  <strong>{report.score.join(' : ')}</strong>
                  <b>{report.awayName}</b>
                </span>
                <span className="film-ability">
                  <TeamAbility report={report} side={0} />
                  <TeamAbility report={report} side={1} />
                </span>
                {report.penalties && (
                  <span className="film-penalties">点球 {report.penalties.join(' : ')}</span>
                )}
                <span className="film-view">
                  <FileText size={13} />
                  查看战报
                </span>
              </button>
              {report.canReplay !== false && (
                <button
                  className="film-play"
                  onClick={() => onReport(report)}
                  aria-label={`观看${label(report)}的回放`}
                >
                  <Play size={14} />
                  播放录像
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>比赛结束并完成结算后，录像会放到这里。</Empty>
      )}
      {selected && (
        <MatchReport key={selected.id} summary={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
