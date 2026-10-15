import React from 'react';
import type { Club, Player } from '../model';
import { roles } from '../constants';
export function Pitch({
  club,
  lineup,
  onPlayer,
  minute = 0,
  away = false,
  ball,
}: {
  club: Club;
  lineup?: string[];
  onPlayer?: (p: Player) => void;
  minute?: number;
  away?: boolean;
  ball?: { x: number; y: number };
}) {
  const ids = lineup || club.lineup;
  const ps = club.players.filter((p) => ids.includes(p.id));
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
          let x = coords[role] + (minute ? Math.sin(minute * 0.6 + i) * 2 : 0),
            y = ((i + 1) / (group.length + 1)) * 80 + 10;
          return (
            <button
              className={'pitch-player ' + (away ? 'away' : '')}
              key={p.id}
              style={{ left: (away ? 100 - x : x) + '%', top: y + '%' }}
              onClick={() => onPlayer?.(p)}
              title={p.name + ' · ' + roles[p.role]}
            >
              <span>{p.number}</span>
              {!away && <small>{p.name.split('·').at(-1)}</small>}
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
