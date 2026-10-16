import React from 'react';
import { Shield, Flag, ChevronRight, Wallet } from 'lucide-react';
import { rating } from '../../../shared/modules/players/index.mjs';
import { roles } from '../constants';
import type { Player, Standing } from '../model';
export function Crest({
  name = 'TL',
  small = false,
  color,
}: {
  name?: string;
  small?: boolean;
  color?: string;
}) {
  return (
    <span
      className={'crest ' + (small ? 'small' : '')}
      style={{ '--crest': color || '#c7ef76' } as React.CSSProperties}
    >
      <Shield size={small ? 26 : 52} />
      <b>{name === 'TL' ? 'TL' : name.slice(0, 1)}</b>
    </span>
  );
}

export function Badge({ children, tone = 'green' }: { children: React.ReactNode; tone?: string }) {
  return <span className={'badge ' + tone}>{children}</span>;
}

export function Ovr({ player }: { player: Player }) {
  return <span className={'ovr ' + (rating(player) >= 70 ? 'gold' : '')}>{rating(player)}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Flag size={28} />
      <p>{children}</p>
    </div>
  );
}

export function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}

export function PanelHead({
  title,
  subtitle,
  action,
  label,
}: {
  title: string;
  subtitle?: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={action}>
          {label}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

export function Filters({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="filters">
      {Object.entries({ ALL: '全部球员', ...roles }).map(([k, v]) => (
        <button className={value === k ? 'selected' : ''} key={k} onClick={() => onChange(k)}>
          {v}
        </button>
      ))}
    </div>
  );
}

export function LeagueTable({ rows, compact = false }: { rows: Standing[]; compact?: boolean }) {
  return (
    <div className="table-scroll">
      <table className={'league-table ' + (compact ? 'compact' : '')}>
        <thead>
          <tr>
            <th>#</th>
            <th>球队</th>
            <th>赛</th>
            {!compact && (
              <>
                <th>胜</th>
                <th>平</th>
                <th>负</th>
              </>
            )}
            <th>净胜</th>
            <th>积分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr className={r.id === 'me' ? 'my-team' : ''} key={r.id}>
              <td>{String(i + 1).padStart(2, '0')}</td>
              <td>
                <Crest small name={r.name} color={r.color} />
                <b>{r.name}</b>
                {r.id === 'me' && <span className="you">你</span>}
              </td>
              <td>{r.played}</td>
              {!compact && (
                <>
                  <td>{r.won}</td>
                  <td>{r.drawn}</td>
                  <td>{r.lost}</td>
                </>
              )}
              <td>
                {r.gf - r.ga > 0 ? '+' : ''}
                {r.gf - r.ga}
              </td>
              <td>
                <strong>{r.points}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
