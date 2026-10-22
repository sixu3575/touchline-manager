import type { Report } from '../../model';
import { buildTeamRatings } from '../../../../shared/modules/matches/ratings/index.mjs';

export function TeamRating({ report, side }: { report: Report; side: number }) {
  const row = (report.teamRatings ?? buildTeamRatings(report))[side];
  const rating = row?.rating;
  return (
    <span className="team-match-rating" title="本场11名首发球员评分的算术平均，非进球数">
      <span>球队评分</span>
      <b
        className={
          'match-rating ' +
          (rating == null ? 'unrated' : rating >= 8 ? 'excellent' : rating < 6 ? 'poor' : 'normal')
        }
      >
        {rating == null ? '未记录' : rating.toFixed(1)}
      </b>
    </span>
  );
}
