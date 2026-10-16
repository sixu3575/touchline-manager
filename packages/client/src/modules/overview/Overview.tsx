import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  Dumbbell,
  Play,
  Search,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { standings } from '../../../../shared/modules/competitions/selectors/index.mjs';
import { Badge, LeagueTable, PanelHead, Stat } from '../../components/ui';
import { money, styleNames } from '../../constants';
import type { Game, Player, Report, Standing } from '../../model';
import { AdvanceButton } from '../competitions';
import { Pitch } from '../matches';

export function Overview({
  game,
  busy,
  act,
  navigate,
  onPlayer,
  onReport,
}: {
  game: Game;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  navigate: (id: string) => void;
  onPlayer: (p: Player) => void;
  onReport: (r: Report) => void;
}) {
  const club = game.clubs[0],
    rows = standings(game) as Standing[],
    rank = rows.findIndex((x) => x.id === 'me') + 1;
  const next = game.round < 14 ? game.schedule[game.round].find((x) => x.includes('me')) : null;
  const opponent = next ? game.clubs.find((x) => x.id === next.find((id) => id !== 'me')) : null;
  const fitness = Math.round(
    club.players.filter((p) => club.lineup.includes(p.id)).reduce((s, p) => s + p.fitness, 0) / 11,
  );
  const latest = game.reports[0];
  const nextButton = <AdvanceButton game={game} busy={busy} act={act} />;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <Badge tone="lime">
            {game.round === 14
              ? 'SEASON COMPLETE'
              : 'MATCHDAY ' + String(game.round + 1).padStart(2, '0')}
          </Badge>
          <h2>{game.round === 14 ? '这个赛季，值得铭记。' : '下一场，轮到你定义。'}</h2>
          <p>
            {game.round === 14
              ? '最终排名第 ' + rank + '，赛季奖金已到账。'
              : club.name +
                ' vs ' +
                opponent?.name +
                ' · ' +
                (next?.[0] === 'me' ? '主场' : '客场') +
                ' · 先锋联赛'}
          </p>
          {nextButton}
          <span className="hero-note">
            <Check size={13} /> 阵容已就位 · {club.tactics.formation} ·{' '}
            {styleNames[club.tactics.style]}
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="floodlight one" />
          <div className="floodlight two" />
          <div className="stadium-stands" />
          <div className="hero-field">
            <div />
            <span>TOUCHLINE</span>
          </div>
          <div className="art-label">
            <CircleDot size={15} /> THE BEAUTIFUL GAME
          </div>
        </div>
      </section>
      <div className="stat-grid">
        <Stat
          icon={Wallet}
          label="俱乐部资金"
          value={money(game.cash)}
          detail="每轮结算工资、赞助与奖金"
        />
        <Stat
          icon={Trophy}
          label="联赛排名"
          value={rank + ' / 8'}
          detail={rows.find((x) => x.id === 'me')?.points + ' 积分 · ' + game.round + ' 场已赛'}
        />
        <Stat
          icon={Users}
          label="球迷规模"
          value={game.fans.toLocaleString()}
          detail={'主场容量 ' + game.stadium.capacity.toLocaleString()}
        />
        <Stat
          icon={Activity}
          label="首发平均体能"
          value={fitness + '%'}
          detail={'本轮训练 ' + game.training.used + ' / 2'}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <PanelHead
            title="一线队快照"
            subtitle={club.players.length + ' 名球员 · ' + club.tactics.formation}
            action={() => navigate('squad')}
            label="查看球队"
          />
          <div className="mini-pitch-wrap">
            <Pitch club={club} onPlayer={onPlayer} />
          </div>
          <div className="panel-foot">
            <span>
              <span className="status-dot" /> 战术已保存
            </span>
            <button className="text-button" onClick={() => navigate('tactics')}>
              进入战术室 <ArrowRight size={15} />
            </button>
          </div>
        </section>
        <section className="panel">
          <PanelHead
            title="先锋联赛"
            subtitle={'赛季 ' + game.season + ' · 积分榜'}
            action={() => navigate('fixtures')}
            label="全部"
          />
          <LeagueTable rows={rows} compact />
        </section>
        <section className="panel">
          <PanelHead title="俱乐部动态" subtitle="每一次成长，都值得记录" />
          {latest ? (
            <button className="latest-match" onClick={() => onReport(latest)}>
              <span className="match-result-icon">
                <Play size={20} />
              </span>
              <div>
                <b>
                  {latest.homeName} <strong>{latest.score.join(' : ')}</strong> {latest.awayName}
                </b>
                <small>
                  {latest.competition} · 第 {latest.round} 轮 · 点击回放
                </small>
              </div>
              <ChevronRight size={18} />
            </button>
          ) : (
            <div className="welcome-note">
              <Sparkles />
              <div>
                <b>你的执教生涯，从这里开始。</b>
                <p>先看看球队和战术，再开始第一轮比赛。</p>
              </div>
            </div>
          )}
          <div className="news-grid">
            <button onClick={() => navigate('scouting')}>
              <Search />
              <div>
                <b>{game.market.length} 位球员等待考察</b>
                <small>补强阵容，把握下一次机会。</small>
              </div>
              <ArrowUpRight size={17} />
            </button>
            <button onClick={() => navigate('training')}>
              <Dumbbell />
              <div>
                <b>训练计划 {game.training.used}/2</b>
                <small>每轮两次，能力提升持续保留。</small>
              </div>
              <ArrowUpRight size={17} />
            </button>
          </div>
        </section>
        <section className="panel ambition">
          <div className="ambition-icon">
            <Trophy size={28} />
          </div>
          <span className="eyebrow">THE NEXT CHAPTER</span>
          <h3>荣誉，始于坚持。</h3>
          <p>
            {game.trophies.length
              ? '已收获 ' + game.trophies.length + ' 项荣誉，向下一座奖杯进发。'
              : '完成赛季，冲击联赛前三；第 2 轮后开启城市挑战杯。'}
          </p>
          <button className="text-button" onClick={() => navigate('fixtures')}>
            查看赛季目标 <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
