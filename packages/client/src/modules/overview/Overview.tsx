import { useState } from 'react';
import { ArrowUpRight, MousePointer2, Radio, Sparkles } from 'lucide-react';
import { standings } from '../../../../shared/modules/competitions/selectors/index.mjs';
import type { Game, Player, Report, Standing } from '../../model';
import { money } from '../../constants';
import { CLUB_OBJECTS } from '../../scenes/navigation.mjs';
import { AdvanceButton } from '../competitions';
import './courtyard.css';

export function Overview({
  game,
  busy,
  act,
  navigate,
  onReport,
}: {
  game: Game;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  navigate: (id: string) => void;
  onPlayer: (p: Player) => void;
  onReport: (r: Report) => void;
}) {
  const [labels, setLabels] = useState(false);
  const club = game.clubs[0];
  const rows = standings(game) as Standing[];
  const rank = rows.findIndex((row) => row.id === 'me') + 1;
  const own = rows.find((row) => row.id === 'me');
  const next = game.schedule[game.round]?.find((pair) => pair.includes('me'));
  const opponent = next && game.clubs.find((other) => other.id === next.find((id) => id !== 'me'));
  const hints: Record<string, string> = {
    squad: `${club.players.length}位球员在这里`,
    tactics: `${club.tactics.formation} · 赛前排兵`,
    fixtures: `第${game.season}赛季 · ${own?.points ?? 0}积分`,
    'league-stats': '进球、助攻与各项数据',
    'my-matches': `${game.reports.filter((r) => r.homeId === 'me' || r.awayId === 'me').length}份本队战报`,
    training: '球员分配、教练与成长',
    scouting: `${game.market.length}位球员待考察`,
    stadium: `${game.stadium.capacity.toLocaleString()}个座位`,
    finance: money(game.cash),
    'club-honours': `${game.trophies.length}项已获荣誉`,
  };
  return (
    <section
      className={'club-yard ' + (labels ? 'show-object-labels' : '')}
      aria-label="可点击的俱乐部场景"
    >
      <div className="yard-heading">
        <div>
          <span>WELCOME HOME</span>
          <h1>{club.name}</h1>
          <p>
            先锋联赛第{rank}名 · {own?.points ?? 0}积分 · 今天，先去哪里？
          </p>
        </div>
        <button
          className="scene-label-toggle"
          aria-pressed={labels}
          onClick={() => setLabels(!labels)}
        >
          <MousePointer2 size={16} />
          {labels ? '收起路牌' : '显示路牌'}
        </button>
      </div>
      <div className="yard-pan" tabIndex={0} aria-label="俱乐部全景，手机可左右滑动探索">
        <div className="yard-stage">
          <img
            className="yard-art"
            src="/art/scenes/club-courtyard-depth-v4.webp"
            width="1600"
            height="1000"
            alt="从球会大门望向纵深院子：近处斜停球探车，连体更衣室与办公室沿路分布，报纸电视和奖杯窗设在门廊，训练场与看台退到远处"
            fetchPriority="high"
          />
          {CLUB_OBJECTS.map((object) => (
            <button
              key={object.id}
              className={'yard-object yard-object-' + object.id}
              style={{
                left: object.x + '%',
                top: object.y + '%',
                width: object.w + '%',
                height: object.h + '%',
              }}
              aria-label={'进入' + object.label}
              onClick={() => navigate(object.id)}
            >
              <span className="object-glow" aria-hidden="true" />
              <span className="object-sign">
                <b>
                  {object.label}
                  <ArrowUpRight size={13} />
                </b>
                <small>{hints[object.id]}</small>
              </span>
            </button>
          ))}
          <span className="yard-brand-mark" aria-hidden="true">
            TOUCHLINE
            <br />
            <small>YOUR CLUB. YOUR STORY.</small>
          </span>
        </div>
      </div>
      <div className="yard-daybook">
        <div className="daybook-fixture">
          <Radio size={20} />
          <div>
            <span>{game.round < 14 ? `下一场 · 第${game.round + 1}轮` : '赛季落幕'}</span>
            <b>
              {opponent ? `${club.name}  vs  ${opponent.name}` : `最终排名第${rank} · 下一段旅程`}
            </b>
          </div>
          <AdvanceButton game={game} busy={busy} act={act} />
        </div>
        <div className="yard-hint">
          <Sparkles size={15} />
          <span>
            点建筑或物件进入，可显示路牌查看入口。<em>手机可左右滑动院子。</em>
          </span>
          {game.reports[0] && (
            <button onClick={() => onReport(game.reports[0])}>
              最新战报 {game.reports[0].score.join(' : ')} ↗
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
