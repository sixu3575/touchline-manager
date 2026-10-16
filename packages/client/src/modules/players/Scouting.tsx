import { ArrowRight, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge, Empty, Filters, Ovr } from '../../components/ui';
import { money, roles } from '../../constants';
import type { Club, Game, Player } from '../../model';
import './players.css';
import { nationalityName } from './presentation';
type Props = {
  game: Game;
  club: Club;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onPlayer: (p: Player) => void;
};

export function Scouting({ game, club, busy, act, onPlayer }: Props) {
  const [filter, setFilter] = useState('ALL');
  return (
    <>
      <div className="info-strip">
        <Search size={19} />
        <span>每赛季更新候选名单。签约立即生效，转会费一次扣除，工资按联赛轮次结算。</span>
        <b>资金 {money(game.cash)}</b>
      </div>
      <Filters value={filter} onChange={setFilter} />
      <div className="scout-grid">
        {game.market
          .filter((p) => filter === 'ALL' || p.role === filter)
          .map((p) => (
            <section className="panel scout-card" key={p.id}>
              <div className="scout-top">
                <Badge tone={p.age <= 18 ? 'gold' : 'grey'}>
                  {p.age <= 18 ? '青训新星' : roles[p.role]}
                </Badge>
                <Ovr player={p} />
              </div>
              <button
                className="scout-person pm-open-profile"
                aria-label={'查看 ' + p.name + ' 的档案'}
                onClick={() => onPlayer(p)}
              >
                <span className="scout-number">{p.number}</span>
                <Users size={70} />
              </button>
              <h3>{p.name}</h3>
              <p>
                {nationalityName(p.nationality)} · {p.age} 岁 · {roles[p.role]} · 潜力 {p.potential}
              </p>
              <div className="scout-skills">
                <span>
                  速度 <b>{Math.round(p.skills.pace)}</b>
                </span>
                <span>
                  {p.role === 'GK' ? '门将' : '传球'}{' '}
                  <b>{Math.round(p.skills[p.role === 'GK' ? 'keeping' : 'passing'])}</b>
                </span>
                <span>
                  轮薪 <b>{money(p.wage)}</b>
                </span>
              </div>
              <div className="sign-row">
                <div>
                  <small>签约费用</small>
                  <strong>{money(p.price)}</strong>
                </div>
                <button
                  className="primary"
                  disabled={busy || game.cash < p.price || club.players.length >= 28}
                  onClick={() => void act('sign', { playerId: p.id })}
                >
                  签约 <ArrowRight size={16} />
                </button>
              </div>
            </section>
          ))}
      </div>
      {!game.market.length && <Empty>候选球员已全部签约，下赛季会有新的发现。</Empty>}
    </>
  );
}
