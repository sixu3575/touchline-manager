import { ArrowRight, Play, RefreshCw } from 'lucide-react';
import type { Game } from '../../model';
export function AdvanceButton({
  game,
  busy,
  act,
}: {
  game: Game;
  busy: boolean;
  act: (type: string) => Promise<Game | undefined>;
}) {
  return (
    <button
      className="primary match-button"
      disabled={busy}
      onClick={() => void act(game.round === 14 ? 'season' : 'advance')}
    >
      {busy ? <RefreshCw className="spin" size={18} /> : <Play size={18} fill="currentColor" />}
      {game.round === 14 ? '开启新赛季' : '开始第 ' + (game.round + 1) + ' 轮'}
      <ArrowRight size={18} />
    </button>
  );
}
