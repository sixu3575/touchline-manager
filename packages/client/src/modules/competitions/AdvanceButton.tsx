import { ArrowRight, Play, RefreshCw } from 'lucide-react';
import type { Game } from '../../model';
export function AdvanceButton({
  game,
  busy,
  act,
}: {
  game: Game;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
}) {
  if (game.round < 14)
    return (
      <div className="match-start-options">
        <button
          className="primary match-button"
          disabled={busy}
          onClick={() => void act('advance', { watchMode: 'live' })}
        >
          <Play size={18} />
          实时观看（快进）
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void act('advance', { watchMode: 'background' })}
        >
          后台模拟后看回放 <ArrowRight size={17} />
        </button>
      </div>
    );
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
