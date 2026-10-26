import { ArrowUpRight, Landmark, Users } from 'lucide-react';
import { Badge, StadiumIllustration } from '../../components/ui';
import { money } from '../../constants';
import type { Game } from '../../model';

export function Stadium({
  game,
  busy,
  act,
}: {
  game: Game;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
}) {
  const club = game.clubs[0];
  return (
    <div className="stadium-layout">
      <section className="panel stadium-card">
        <div className="stadium-art">
          <StadiumIllustration />
          <Badge tone="dark">THE HOME OF {club.name}</Badge>
        </div>
        <div className="stadium-info">
          <Badge>LEVEL {game.stadium.level}</Badge>
          <h2>临场球场</h2>
          <p>球迷的声音，是这片草坪上最强大的第十二人。</p>
          <div className="stat-grid">
            <div>
              <small>座位容量</small>
              <h2>{game.stadium.capacity.toLocaleString()}</h2>
            </div>
            <div>
              <small>支持者</small>
              <h2>{game.fans.toLocaleString()}</h2>
            </div>
            <div>
              <small>票价</small>
              <h2>£{game.stadium.ticket}</h2>
            </div>
          </div>
        </div>
      </section>
      <div>
        <section className="panel upgrade-card">
          <Landmark size={30} />
          <h2>为下一个时代扩建</h2>
          <p>升级增加 1,500 个座位。上座人数由球迷规模与比赛需求共同决定，空座不会带来收入。</p>
          <div className="upgrade-detail">
            <span>
              当前等级 <b>Lv.{game.stadium.level}</b>
            </span>
            <span>
              扩建费用 <b>{money(game.stadium.level * 180000)}</b>
            </span>
            <span>
              扩建后容量 <b>{(game.stadium.capacity + 1500).toLocaleString()}</b>
            </span>
          </div>
          <button
            className="primary"
            disabled={busy || game.stadium.level >= 5 || game.cash < game.stadium.level * 180000}
            onClick={() => void act('upgrade')}
          >
            {game.stadium.level >= 5 ? '已达到最高等级' : '开始扩建'}
            <ArrowUpRight size={18} />
          </button>
        </section>
        <section className="panel fan-card">
          <Users size={24} />
          <h3>用成绩赢得支持</h3>
          <p>胜利增加球迷，失利会影响热度。稳定表现与合理扩建，能让主场成为可靠的收入来源。</p>
        </section>
      </div>
    </div>
  );
}
