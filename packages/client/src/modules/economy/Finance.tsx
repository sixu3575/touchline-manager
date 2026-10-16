import { ArrowDownRight, ArrowUpRight, TrendingUp, Users, Wallet } from 'lucide-react';
import { PanelHead, Stat } from '../../components/ui';
import { money } from '../../constants';
import type { Game } from '../../model';

export function Finance({ game }: { game: Game }) {
  const club = game.clubs[0];
  return (
    <>
      <div className="stat-grid finance-stats">
        <Stat
          icon={Wallet}
          label="可用资金"
          value={money(game.cash)}
          detail="所有交易由服务器记账"
        />
        <Stat
          icon={TrendingUp}
          label="本赛季经营收入"
          value={money(
            game.ledger
              .filter((l) => l.amount > 0 && l.id !== 'opening' && l.season === game.season)
              .reduce((s, l) => s + l.amount, 0),
          )}
          detail="赞助、门票、奖金"
        />
        <Stat
          icon={Users}
          label="每轮球员工资"
          value={money(club.players.reduce((s, p) => s + p.wage, 0))}
          detail={club.players.length + ' 名球员，按联赛轮次扣除'}
        />
      </div>
      <section className="panel">
        <PanelHead title="俱乐部账本" subtitle="近期 150 笔交易 · 英镑为游戏内虚拟货币" />
        <div className="ledger">
          {game.ledger.map((l, i) => (
            <div key={l.id + '-' + i}>
              <span className={'ledger-icon ' + (l.amount > 0 ? 'in' : 'out')}>
                {l.amount > 0 ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
              </span>
              <div>
                <b>{l.label}</b>
                <small>{l.id === 'opening' ? '俱乐部成立' : '第 ' + l.round + ' 轮结算'}</small>
              </div>
              <strong className={l.amount > 0 ? 'positive' : 'negative'}>
                {l.amount > 0 ? '+' : '−'}
                {money(Math.abs(l.amount))}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
