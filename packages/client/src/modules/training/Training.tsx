import { Activity, ArrowRight, Dumbbell, Goal, Shield } from 'lucide-react';
import { Badge, Ovr, PanelHead } from '../../components/ui';
import { roles } from '../../constants';
import type { Club, Game, Player } from '../../model';

type Props = {
  game: Game;
  club: Club;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onPlayer: (p: Player) => void;
};

export function Training({ game, club, busy, act, onPlayer }: Props) {
  return (
    <>
      <div className="training-banner">
        <Dumbbell size={32} />
        <div>
          <h2>训练场上的努力，会在比赛中回响。</h2>
          <p>每轮两次，每次 £6,000。年龄和职业态度影响成长，门将使用专项训练。</p>
        </div>
        <Badge tone="outline">已完成 {game.training.used} / 2</Badge>
      </div>
      <div className="training-grid">
        {[
          {
            id: 'attack',
            title: '进攻专项',
            icon: Goal,
            desc: '培养终结、组织与决策；门将练出球。消耗 4 点体能。',
            tags: '终结 / 组织 / 决策',
          },
          {
            id: 'defence',
            title: '防守专项',
            icon: Shield,
            desc: '培养抢断、站位和预判；门将练扑救。消耗 4 点体能。',
            tags: '抢断 / 站位 / 扑救',
          },
          {
            id: 'fitness',
            title: '体能与恢复',
            icon: Activity,
            desc: '培养速度、耐力、力量和平衡，恢复 8 点体能。',
            tags: '身体素质 / 体能 +8',
          },
        ].map((t) => (
          <section className="panel training-card" key={t.id}>
            <span className="training-icon">
              <t.icon size={30} />
            </span>
            <h2>{t.title}</h2>
            <p>{t.desc}</p>
            <Badge>{t.tags}</Badge>
            <button
              className="secondary"
              disabled={busy || game.training.used >= 2 || game.cash < 6000}
              onClick={() => void act('train', { focus: t.id })}
            >
              {game.training.used >= 2 ? '本轮训练已完成' : '安排训练 · £6,000'}
              <ArrowRight size={16} />
            </button>
          </section>
        ))}
      </div>
      <section className="panel">
        <PanelHead
          title="重点培养名单"
          subtitle="按教练评估的潜力区间中点推荐；待观察使用中性估计"
        />
        <div className="prospects">
          {[...club.players]
            .sort((a, b) => b.potential - b.age - (a.potential - a.age))
            .slice(0, 5)
            .map((p) => (
              <button key={p.id} onClick={() => onPlayer(p)}>
                <Ovr player={p} />
                <div>
                  <b>{p.name}</b>
                  <small>
                    {roles[p.role]} · {p.age} 岁
                  </small>
                </div>
                <span>
                  潜力{' '}
                  <b>
                    {p.assessment.bands.potential
                      ? `${p.assessment.bands.potential.min}–${p.assessment.bands.potential.max}`
                      : '待观察'}
                  </b>
                </span>
              </button>
            ))}
        </div>
      </section>
    </>
  );
}
