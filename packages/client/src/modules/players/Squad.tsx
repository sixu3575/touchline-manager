import { useState } from 'react';
import { rating } from '../../../../shared/modules/players/index.mjs';
import { Badge, Filters, Ovr, PanelHead } from '../../components/ui';
import { money, roles } from '../../constants';
import type { Club, Game, Player } from '../../model';
import './players.css';
import { nationalityName } from './presentation';
import { AssessmentOffice } from './AssessmentOffice';
type Props = {
  game: Game;
  club: Club;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onPlayer: (p: Player) => void;
};

export function Squad({ game, club, busy, act, onPlayer }: Props) {
  const [filter, setFilter] = useState('ALL');
  return (
    <section className="panel">
      <PanelHead
        title="一线队名单"
        subtitle={club.players.length + ' / 28 名球员 · 点击查看球员档案'}
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
              <th>球员</th>
              <th>位置</th>
              <th>年龄</th>
              <th>评估能力</th>
              <th>体能</th>
              <th>出场 / 进球</th>
              <th>轮薪</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {club.players
              .filter((p) => filter === 'ALL' || p.role === filter)
              .sort((a, b) => rating(b) - rating(a))
              .map((p) => (
                <tr
                  key={p.id}
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
                  <td>
                    <Ovr player={p} />
                  </td>
                  <td>
                    <div className="fitness">
                      <i style={{ width: p.fitness + '%' }} />
                    </div>
                    <small>{p.fitness}%</small>
                  </td>
                  <td>
                    {p.apps} / {p.goals}
                  </td>
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
