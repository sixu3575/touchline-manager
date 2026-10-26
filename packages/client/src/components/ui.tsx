import React from 'react';
import { Shield, Flag, ChevronRight, Wallet } from 'lucide-react';
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
      style={{ '--crest': color || '#e8b854' } as React.CSSProperties}
    >
      <Shield size={small ? 26 : 52} />
      <b>{name === 'TL' ? 'TL' : name.slice(0, 1)}</b>
    </span>
  );
}

// Original vector illustration. No external image request, filters or animation.
export function StadiumIllustration() {
  return (
    <svg className="ink-stadium" viewBox="0 0 600 340" aria-hidden="true">
      <g stroke="#1c3037" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M0 0H600V340H0Z" fill="#8daea6" stroke="none" />
        <circle cx="460" cy="72" r="43" fill="#e8bd61" stroke="none" />
        <path d="M22 142L11 36L72 29L88 137M509 139L531 22L585 34L568 153" fill="#496b6b" />
        <path d="M7 35L75 25L80 57L12 68ZM527 17L591 30L583 62L521 49Z" fill="#eee1b9" />
        <path
          d="M25 36L29 61M44 33L48 58M63 30L67 55M542 24L537 52M562 28L556 55M579 33L573 59"
          fill="none"
        />
        <path
          d="M-22 181L96 107L202 132L302 95L431 127L524 108L623 180L589 252L25 256Z"
          fill="#254b50"
        />
        <path
          d="M24 187L101 138L207 163L305 128L430 160L519 141L578 182L556 214L48 216Z"
          fill="#d4bf89"
        />
        <path
          d="M39 195L104 158L207 182L305 150L430 180L516 161L557 191"
          fill="none"
          stroke="#8b4846"
          strokeWidth="12"
        />
        {Array.from({ length: 24 }, (_, i) => (
          <path
            key={i}
            d={`M${40 + i * 22} 208l4 -9`}
            stroke={i % 3 ? '#1c3037' : '#eee1b9'}
            strokeWidth="7"
          />
        ))}
        <path d="M16 247L300 174L585 242L498 334L104 334Z" fill="#518475" />
        <path
          d="M70 251L300 194L528 249L463 313L140 313ZM300 194V313"
          fill="none"
          stroke="#eee1b9"
          strokeWidth="2.5"
        />
        <ellipse cx="300" cy="251" rx="43" ry="20" fill="none" stroke="#eee1b9" strokeWidth="2.5" />
        <path
          d="M94 245L141 235L163 271L116 284M497 241L451 231L431 271L478 284"
          fill="none"
          stroke="#eee1b9"
          strokeWidth="2.5"
        />
        <path d="M303 95V45L349 55L303 68" fill="#a44e49" />
        <path d="M98 106V69L132 78L98 88M522 109V74L560 86L522 94" fill="#e8bd61" />
        <path
          d="M407 39L414 20M422 47L439 38M396 32L391 19"
          fill="none"
          stroke="#eee1b9"
          strokeWidth="3"
        />
      </g>
    </svg>
  );
}

export function Badge({ children, tone = 'green' }: { children: React.ReactNode; tone?: string }) {
  return <span className={'badge ' + tone}>{children}</span>;
}

export function Ovr({ player }: { player: Player }) {
  return (
    <span
      title="总能力值 · 按位置计算的实际综合能力"
      className={'ovr ' + ((player.overall ?? 0) >= 70 ? 'gold' : '')}
    >
      {player.overall ?? '—'}
    </span>
  );
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
                <th>近三场</th>
                <th>较上一轮</th>
                <th>下一轮对手</th>
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
                  <td>
                    <div className="league-form-badges" aria-label="最近三场比赛结果">
                      {r.recentResults.length ? (
                        r.recentResults.map((result, index) => (
                          <span className={'form-' + result.toLowerCase()} key={index}>
                            {{ W: '胜', D: '平', L: '负' }[result]}
                          </span>
                        ))
                      ) : (
                        <span className="form-empty">—</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        r.rankChange == null || r.rankChange === 0
                          ? 'rank-change unchanged'
                          : r.rankChange > 0
                            ? 'rank-change up'
                            : 'rank-change down'
                      }
                    >
                      {r.rankChange == null || r.rankChange === 0
                        ? '—'
                        : `${r.rankChange > 0 ? '↑' : '↓'} ${Math.abs(r.rankChange)}`}
                    </span>
                  </td>
                  <td>{r.nextOpponent ?? '—'}</td>
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
