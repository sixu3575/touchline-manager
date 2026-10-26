import { roles } from '../../constants';
import type { Club, Player } from '../../model';
import { PlayerPortrait } from '../players';
import { formationSlot, positionRoleNames } from '../../../../shared/modules/tactics/index.mjs';
export function Pitch({
  club,
  lineup,
  onPlayer,
  away = false,
  ball,
  tacticalSlots = false,
  showFitness = false,
}: {
  club: Club;
  lineup?: string[];
  onPlayer?: (p: Player) => void;
  minute?: number;
  away?: boolean;
  ball?: { x: number; y: number };
  tacticalSlots?: boolean;
  showFitness?: boolean;
}) {
  const ids = lineup || club.lineup;
  const ps = ids.flatMap((id) => club.players.find((p) => p.id === id) ?? []);
  const coords: Record<string, number> = { GK: 8, DEF: 27, MID: 51, FWD: 77 };
  return (
    <div className="pitch">
      <div className="pitch-lines">
        <div className="half-line" />
        <div className="centre-circle" />
        <div className="penalty left" />
        <div className="penalty right" />
        <div className="goal left" />
        <div className="goal right" />
      </div>
      <span className="pitch-caption">{away ? '客队阵型' : club.tactics.formation}</span>
      {['GK', 'DEF', 'MID', 'FWD'].flatMap((role) => {
        const group = ps.filter((p) => p.role === role);
        return group.map((p, i) => {
          let x = coords[role],
            y = ((i + 1) / (group.length + 1)) * 80 + 10;
          const slot = tacticalSlots
            ? formationSlot(club.tactics.formation, role, i, group.length)
            : null;
          if (slot) {
            x = (slot.x / 105) * 100;
            y = (slot.z / 68) * 100;
          }
          const fitness = Math.max(0, Math.min(100, Math.round(p.fitness)));
          const fitnessBand = fitness < 50 ? 'low' : fitness < 75 ? 'medium' : 'high';
          return (
            <button
              className={'pitch-player ' + (away ? 'away' : 'has-portrait')}
              key={p.id}
              style={{ left: (away ? 100 - x : x) + '%', top: y + '%' }}
              onClick={() => onPlayer?.(p)}
              title={
                p.name +
                ' · ' +
                (slot
                  ? (positionRoleNames[slot.positionRole as keyof typeof positionRoleNames] ??
                    roles[p.role])
                  : roles[p.role])
              }
            >
              {!away && <PlayerPortrait player={p} size={40} decorative />}
              <span>{p.number}</span>
              {!away && <small>{p.name.split('·').at(-1)}</small>}
              {showFitness && !away && (
                <div
                  className={`pitch-fitness ${fitnessBand}`}
                  title={`当前体力 ${fitness}%`}
                  aria-label={`当前体力 ${fitness}%`}
                >
                  <span className="pitch-fitness-track" aria-hidden="true">
                    <i style={{ width: `${fitness}%` }} />
                  </span>
                  <b>{fitness}%</b>
                </div>
              )}
            </button>
          );
        });
      })}
      {ball && (
        <span className="ball" style={{ left: ball.x + '%', top: ball.y + '%' }}>
          ●
        </span>
      )}
    </div>
  );
}
