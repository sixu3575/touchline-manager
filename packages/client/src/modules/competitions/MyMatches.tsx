import type { Game, Report } from '../../model';
import { MatchReports } from '../matches';

export function MyMatches({ game, onReport }: { game: Game; onReport: (r: Report) => void }) {
  return (
    <MatchReports
      reports={game.reports.filter((r) => r.homeId === 'me' || r.awayId === 'me')}
      onReplay={onReport}
    />
  );
}
