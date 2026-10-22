import type { Report } from '../../model';
import { TeamAbility } from './TeamAbility';

export function MatchScoreline({
  report,
  homeName,
  awayName,
  homeId,
  awayId,
  score,
}: {
  report?: Report;
  homeName: string;
  awayName: string;
  homeId: string;
  awayId: string;
  score?: number[];
}) {
  return (
    <div className="report-archive-scoreline">
      <div className="report-score-team">
        <strong className={'report-team-name ' + (homeId === 'me' ? 'report-own-team' : '')}>
          {homeName}
        </strong>
        {report && <TeamAbility report={report} side={0} />}
      </div>
      <span className="report-archive-score" aria-label={score ? score.join(' 比 ') : '未公布'}>
        <b className={homeId === 'me' ? 'report-own-score' : ''}>{score?.[0] ?? '—'}</b>
        <span> : </span>
        <b className={awayId === 'me' ? 'report-own-score' : ''}>{score?.[1] ?? '—'}</b>
      </span>
      <div className="report-score-team report-score-away">
        <strong className={'report-team-name ' + (awayId === 'me' ? 'report-own-team' : '')}>
          {awayName}
        </strong>
        {report && <TeamAbility report={report} side={1} />}
      </div>
    </div>
  );
}
