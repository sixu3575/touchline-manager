import { useState } from 'react';
import { Badge, Filters, Ovr, PanelHead } from '../../components/ui';
import { money, roles } from '../../constants';
import type { Club, Game, Player } from '../../model';
import './players.css';
import { nationalityName } from './presentation';
import { AssessmentOffice } from './AssessmentOffice';
import { AbilityRadar } from './AbilityRadar';

const columns = [
  ['number', '号码 / 球员'],
  ['role', '位置'],
  ['age', '年龄'],
  ['overall', '总能力 / 六维图'],
  ['fitness', '体能'],
  ['apps', '出场'],
  ['goals', '进球'],
  ['wage', '轮薪'],
  ['status', '状态'],
] as const;
type SortKey = (typeof columns)[number][0];
const collator = new Intl.Collator('zh-CN', { numeric: true });
const roleOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
type Props = {
  game: Game;
  club: Club;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onPlayer: (p: Player) => void;
};

export function Squad({ game, club, busy, act, onPlayer }: Props) {
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({
    key: 'overall',
    direction: 'descending',
  });
  const sortBy = (key: SortKey) =>
    setSort((previous) => ({
      key,
      direction:
        previous.key === key
          ? previous.direction === 'ascending'
            ? 'descending'
            : 'ascending'
          : key === 'number' || key === 'role'
            ? 'ascending'
            : 'descending',
    }));
  const value = (p: Player): number | string | null =>
    sort.key === 'status'
      ? Number(club.lineup.includes(p.id))
      : sort.key === 'role'
        ? (roleOrder[p.role] ?? 4)
        : p[sort.key];
  const players = club.players
    .filter((p) => filter === 'ALL' || p.role === filter)
    .sort((a, b) => {
      const av = value(a),
        bv = value(b);
      // Missing archived values stay last in either direction; ties stay stable.
      if (av === null || bv === null)
        return av === bv ? a.id.localeCompare(b.id) : av === null ? 1 : -1;
      const comparison =
        typeof av === 'string' && typeof bv === 'string'
          ? collator.compare(av, bv)
          : Number(av) - Number(bv);
      return comparison * (sort.direction === 'ascending' ? 1 : -1) || a.id.localeCompare(b.id);
    });
  return (
    <section className="panel">
      <PanelHead
        title="一线队名单"
        subtitle={club.players.length + ' / 28 名球员 · 点击表头排序，点击球员查看档案'}
      />
      <AssessmentOffice game={game} kind="coach" busy={busy} act={act} />
      <div className="pm-roster-summary">
        <span>
          平均年龄{' '}
          <b>{(club.players.reduce((s, p) => s + p.age, 0) / club.players.length).toFixed(1)}</b> 岁
        </span>
        <span>
          来自 <b>{new Set(club.players.map((p) => p.nationality)).size}</b> 个国家
        </span>
        <span>
          平均士气{' '}
          <b>
            {Math.round(
              club.players.reduce((s, p) => s + p.wellbeing.morale, 0) / club.players.length,
            )}
          </b>
        </span>
      </div>
      <Filters value={filter} onChange={setFilter} />
      <div className="table-scroll">
        <table className="squad-table">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction : 'none'}>
                  <button className="roster-sort" data-sort={key} onClick={() => sortBy(key)}>
                    {label}{' '}
                    <span aria-hidden="true">
                      {sort.key === key ? (sort.direction === 'ascending' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr
                key={p.id}
                data-player-id={p.id}
                onClick={() => onPlayer(p)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onPlayer(p)}
              >
                <td>
                  <span className="shirt-number">{p.number}</span>
                  <b>
                    {p.name}
                    <small className="pm-country">
                      {nationalityName(p.nationality)} ·{' '}
                      {p.preferredFoot === 'left'
                        ? '左脚'
                        : p.preferredFoot === 'both'
                          ? '双脚'
                          : '右脚'}
                    </small>
                  </b>
                </td>
                <td>
                  <Badge tone={p.role === 'GK' ? 'gold' : 'grey'}>{roles[p.role]}</Badge>
                </td>
                <td>{p.age}</td>
                <td className="roster-ability-cell">
                  <div className="roster-ability">
                    <Ovr player={p} />
                    <AbilityRadar player={p} compact />
                  </div>
                </td>
                <td>
                  <div className="fitness">
                    <i style={{ width: p.fitness + '%' }} />
                  </div>
                  <small>{p.fitness}%</small>
                </td>
                <td>{p.apps}</td>
                <td>{p.goals}</td>
                <td>{money(p.wage)}</td>
                <td>
                  {club.lineup.includes(p.id) ? (
                    <Badge>首发</Badge>
                  ) : (
                    <span className="muted">替补</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
