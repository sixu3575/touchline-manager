import { ChevronRight, Play, Trophy } from 'lucide-react';
import { standings } from '../../../../shared/modules/competitions/selectors/index.mjs';
import { Badge, Crest, Empty, LeagueTable, PanelHead } from '../../components/ui';
import type { Game, Report, Standing } from '../../model';
import { AdvanceButton } from './AdvanceButton';

export function Fixtures({
  game,
  busy,
  act,
  onReport,
}: {
  game: Game;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onReport: (r: Report) => void;
}) {
  const rows = standings(game) as Standing[],
    rank = rows.findIndex((x) => x.id === 'me') + 1;
  const next = game.round < 14 ? game.schedule[game.round].find((x) => x.includes('me')) : null;
  const opponent = next ? game.clubs.find((x) => x.id === next.find((id) => id !== 'me')) : null;
  const nextButton = <AdvanceButton game={game} busy={busy} act={act} />;

  return (
    <>
      <div className="fixture-header">
        <section className="panel next-fixture">
          <div>
            <Badge>先锋联赛</Badge>
            <h2>
              {game.round === 14
                ? '赛季圆满结束'
                : '第 ' + (game.round + 1) + ' 轮 · ' + opponent?.name}
            </h2>
            <p>
              {game.round === 14
                ? '最终排名 ' + rank + ' / 8，开启下一个赛季继续挑战。'
                : '赛前修改战术与首发，比赛后自动结算收支和体能。'}
            </p>
          </div>
          {nextButton}
        </section>
        <section className="panel cup-card">
          <Trophy size={26} />
          <div>
            <h3>城市挑战杯</h3>
            <p>
              {game.cup.eliminated
                ? '本赛季遗憾出局，下赛季再战。'
                : game.cup.stage >= 3
                  ? '本届杯赛已结束。'
                  : '八强 → 半决赛 → 决赛 · 已晋级 ' + game.cup.wins + ' 次'}
            </p>
          </div>
          <button
            className="secondary"
            disabled={
              busy ||
              game.cup.eliminated ||
              game.cup.stage >= 3 ||
              game.round < 2 + game.cup.stage * 3
            }
            onClick={() => void act('cup')}
          >
            {game.cup.stage >= 3
              ? '杯赛已结束'
              : game.cup.eliminated
                ? '已出局'
                : game.round < 2 + game.cup.stage * 3
                  ? '第 ' + (2 + game.cup.stage * 3) + ' 轮后开放'
                  : '参加' + ['八强赛', '半决赛', '决赛'][game.cup.stage]}
          </button>
        </section>
      </div>
      <div className="dashboard-grid fixtures-grid">
        <section className="panel">
          <PanelHead title="我的赛程" subtitle="双循环赛制 · 每赛季 14 轮" />
          <div className="fixtures-list">
            {game.schedule.map((round, i) => {
              const pair = round.find((m) => m.includes('me'))!;
              const op = game.clubs.find((c) => c.id === pair.find((id) => id !== 'me'))!;
              const result = game.results.find(
                (m) => m.round === i + 1 && (m.homeId === 'me' || m.awayId === 'me'),
              );
              const replay = game.reports.find((m) => m.id === result?.id);
              return (
                <button
                  key={i}
                  disabled={!replay}
                  className={'fixture ' + (i === game.round ? 'next' : '')}
                  onClick={() => replay && onReport(replay)}
                >
                  <span className="round-no">{String(i + 1).padStart(2, '0')}</span>
                  <Crest small name={op.name} color={op.color} />
                  <b>{op.name}</b>
                  <small>{pair[0] === 'me' ? '主场' : '客场'}</small>
                  <strong>
                    {result ? result.score.join(' : ') : i === game.round ? '下一轮' : '—'}
                  </strong>
                  {replay ? <Play size={14} /> : <ChevronRight size={14} />}
                </button>
              );
            })}
          </div>
        </section>
        <div>
          <section className="panel">
            <PanelHead title="联赛积分榜" subtitle="胜 3 分 · 平 1 分 · 负 0 分" />
            <LeagueTable rows={rows} />
          </section>
          <section className="panel honors">
            <PanelHead title="荣誉陈列室" />
            {game.trophies.length ? (
              game.trophies.map((t, i) => (
                <p key={i}>
                  <Trophy size={18} /> S{t.season} · {t.title}
                </p>
              ))
            ) : (
              <Empty>第一座奖杯，正在等待它的主人。</Empty>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
