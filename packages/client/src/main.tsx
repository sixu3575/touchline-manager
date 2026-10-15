import { money, roles, styleNames } from './constants';
import { Crest, Badge, Ovr, Empty, Stat, PanelHead, Filters, LeagueTable } from './components/ui';
import { Pitch } from './components/Pitch';
import { PlayerModal } from './components/PlayerModal';
import { Replay } from './components/Replay';
import { Tactics } from './pages/Tactics';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Dumbbell,
  Flag,
  Goal,
  Landmark,
  LayoutDashboard,
  Menu,
  Pause,
  Play,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { bestLineup, rating, standings } from '../../shared/game.mjs';
import type { Club, Game, Player, Report, Standing } from './model';
import './style.css';
const nav = [
  { id: 'overview', label: '俱乐部总览', icon: LayoutDashboard },
  { id: 'squad', label: '一线队', icon: Users },
  { id: 'tactics', label: '战术室', icon: SlidersHorizontal },
  { id: 'fixtures', label: '赛程与杯赛', icon: CalendarDays },
  { id: 'scouting', label: '球探中心', icon: Search },
  { id: 'training', label: '训练基地', icon: Dumbbell },
  { id: 'stadium', label: '主场与球迷', icon: Landmark },
  { id: 'finance', label: '俱乐部财务', icon: Wallet },
];
function App() {
  const [game, setGame] = useState<Game | null>(null),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [view, setView] = useState('overview'),
    [mobile, setMobile] = useState(false),
    [player, setPlayer] = useState<Player | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [rename, setRename] = useState(false),
    [name, setName] = useState(''),
    [filter, setFilter] = useState('ALL');
  const load = async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      setGame(data.state);
      setError('');
    } catch (e) {
      setError((e as Error).message || '连接失败，请刷新重试。');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  const act = async (type: string, payload: Record<string, unknown> = {}) => {
    if (!game || busy) return;
    setBusy(true);
    try {
      const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
        x.toString(16).padStart(2, '0'),
      ).join('');
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload, requestId, revision: game.revision }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) await load();
        throw Error(data.error);
      }
      setGame(data.state);
      setToast(data.state.lastMessage);
      if (type === 'advance' || type === 'cup') setReport(data.state.reports[0]);
      return data.state as Game;
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!game)
    return (
      <div className="loading">
        <div className="brand">
          <CircleDot /> TOUCHLINE
        </div>
        <p>{error || '正在打开你的俱乐部…'}</p>
        {error && (
          <button className="primary" onClick={load}>
            重新连接
          </button>
        )}
      </div>
    );
  const club = game.clubs[0],
    rows = standings(game) as Standing[],
    rank = rows.findIndex((x) => x.id === 'me') + 1;
  const next = game.round < 14 ? game.schedule[game.round].find((x) => x.includes('me')) : null;
  const opponent = next ? game.clubs.find((x) => x.id === next.find((id) => id !== 'me')) : null;
  const fitness = Math.round(
    club.players.filter((p) => club.lineup.includes(p.id)).reduce((s, p) => s + p.fitness, 0) / 11,
  );
  const latest = game.reports[0];
  const navigate = (id: string) => {
    setView(id);
    setMobile(false);
    setFilter('ALL');
  };
  const nextButton = (
    <button
      className="primary match-button"
      disabled={busy}
      onClick={() => void act(game.round === 14 ? 'season' : 'advance')}
    >
      {busy ? <RefreshCw className="spin" size={18} /> : <Play size={18} fill="currentColor" />}
      {game.round === 14 ? '开启新赛季' : '开始第 ' + (game.round + 1) + ' 轮'}
      <ArrowRight size={18} />
    </button>
  );
  return (
    <div className="app">
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('overview');
          }}
        >
          <CircleDot size={28} />
          <div>
            TOUCHLINE<small>临场 · 足球经理</small>
          </div>
        </a>
        <div className="club-switch">
          <Crest small />
          <div>
            <b>{club.name}</b>
            <small>先锋联赛 · S{String(game.season).padStart(2, '0')}</small>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              setName(club.name);
              setRename(true);
            }}
            aria-label="修改俱乐部名称"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="nav-caption">俱乐部管理</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? 'active' : ''}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === 'scouting' && <span className="nav-count">{game.market.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="season-mini">
            <Trophy size={20} />
            <div>
              <b>属于你的第 {game.season} 个赛季</b>
              <small>让每一次选择，都有回响。</small>
            </div>
          </div>
          <span className="demo-label">
            <span /> PvE 试玩版 · v0.1.0
          </span>
        </div>
      </aside>
      {mobile && <div className="nav-scrim" onClick={() => setMobile(false)} />}
      <main>
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle icon-button"
              onClick={() => setMobile(!mobile)}
              aria-label="展开导航"
            >
              <Menu />
            </button>
            <span>
              俱乐部 <ChevronRight size={13} /> <b>{nav.find((n) => n.id === view)?.label}</b>
            </span>
          </div>
          <div className="topbar-right">
            <span className="save-state">
              <CheckCircle2 size={14} />
              {busy ? '正在保存' : '已自动存档'}
            </span>
            <span className="top-season">
              赛季 {game.season} · 第 {Math.min(14, game.round + 1)} / 14 轮
            </span>
            <button
              className="manager-avatar"
              onClick={() => {
                setName(club.name);
                setRename(true);
              }}
              aria-label="俱乐部设置"
            >
              M
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR CLUB. YOUR STORY.</span>
              <h1>
                {view === 'overview' ? '早上好，经理。' : nav.find((n) => n.id === view)?.label}
              </h1>
              <p>
                {
                  (
                    {
                      overview: '新的机会，就在下一次开球之后。',
                      squad: '了解每一位球员，让合适的人站在合适的位置。',
                      tactics: '阵型决定站位，选择决定比赛的方向。',
                      fixtures: '从第一声哨响，到属于你的奖杯。',
                      scouting: '找到下一颗新星，写下俱乐部的未来。',
                      training: '每一份进步，都来自球场之外的积累。',
                      stadium: '让这片主场，成为城市的骄傲。',
                      finance: '平衡眼前的投入，与长远的野心。',
                    } as Record<string, string>
                  )[view]
                }
              </p>
            </div>
            <Badge tone="outline">
              <span className="status-dot" /> 独立存档 · AI 联赛
            </Badge>
          </div>
          {view === 'overview' && (
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
                  detail={
                    rows.find((x) => x.id === 'me')?.points + ' 积分 · ' + game.round + ' 场已赛'
                  }
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
                    <Pitch club={club} onPlayer={setPlayer} />
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
                    <button className="latest-match" onClick={() => setReport(latest)}>
                      <span className="match-result-icon">
                        <Play size={20} />
                      </span>
                      <div>
                        <b>
                          {latest.homeName} <strong>{latest.score.join(' : ')}</strong>{' '}
                          {latest.awayName}
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
          )}
          {view === 'squad' && (
            <section className="panel">
              <PanelHead
                title="一线队名单"
                subtitle={club.players.length + ' / 28 名球员 · 点击查看球员档案'}
              />
              <Filters value={filter} onChange={setFilter} />
              <div className="table-scroll">
                <table className="squad-table">
                  <thead>
                    <tr>
                      <th>球员</th>
                      <th>位置</th>
                      <th>年龄</th>
                      <th>能力</th>
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
                          onClick={() => setPlayer(p)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && setPlayer(p)}
                        >
                          <td>
                            <span className="shirt-number">{p.number}</span>
                            <b>{p.name}</b>
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
          )}
          {view === 'tactics' && <Tactics club={club} act={act} busy={busy} onPlayer={setPlayer} />}
          {view === 'fixtures' && (
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
                          onClick={() => replay && setReport(replay)}
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
          )}
          {view === 'scouting' && (
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
                      <div className="scout-person" onClick={() => setPlayer(p)}>
                        <span className="scout-number">{p.number}</span>
                        <Users size={70} />
                      </div>
                      <h3>{p.name}</h3>
                      <p>
                        {roles[p.role]} · {p.age} 岁 · 潜力 {p.potential}
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
          )}
          {view === 'training' && (
            <>
              <div className="training-banner">
                <Dumbbell size={32} />
                <div>
                  <h2>训练场上的努力，会在比赛中回响。</h2>
                  <p>每轮可安排两次全队专项训练，每次 £6,000。比赛后恢复训练次数。</p>
                </div>
                <Badge tone="outline">已完成 {game.training.used} / 2</Badge>
              </div>
              <div className="training-grid">
                {[
                  {
                    id: 'attack',
                    title: '进攻专项',
                    icon: Goal,
                    desc: '提升射门与传球，训练后消耗 4 点体能。',
                    tags: '射门 + / 传球 +',
                  },
                  {
                    id: 'defence',
                    title: '防守专项',
                    icon: Shield,
                    desc: '提升防守与耐力，训练后消耗 4 点体能。',
                    tags: '防守 + / 耐力 +',
                  },
                  {
                    id: 'fitness',
                    title: '体能与恢复',
                    icon: Activity,
                    desc: '提升速度与耐力，并恢复 8 点体能。',
                    tags: '速度 + / 耐力 + / 体能 +8',
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
                <PanelHead title="重点培养名单" subtitle="潜力较高的年轻球员，值得更多关注" />
                <div className="prospects">
                  {[...club.players]
                    .sort((a, b) => b.potential - b.age - (a.potential - a.age))
                    .slice(0, 5)
                    .map((p) => (
                      <button key={p.id} onClick={() => setPlayer(p)}>
                        <Ovr player={p} />
                        <div>
                          <b>{p.name}</b>
                          <small>
                            {roles[p.role]} · {p.age} 岁
                          </small>
                        </div>
                        <span>
                          潜力 <b>{p.potential}</b>
                        </span>
                      </button>
                    ))}
                </div>
              </section>
            </>
          )}
          {view === 'stadium' && (
            <div className="stadium-layout">
              <section className="panel stadium-card">
                <div className="stadium-art">
                  <div className="stadium-ring">
                    <div className="stadium-grass">
                      <div className="centre-circle" />
                      <div className="half-line" />
                    </div>
                  </div>
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
                  <p>
                    升级增加 1,500 个座位。上座人数由球迷规模与比赛需求共同决定，空座不会带来收入。
                  </p>
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
                    disabled={
                      busy || game.stadium.level >= 5 || game.cash < game.stadium.level * 180000
                    }
                    onClick={() => void act('upgrade')}
                  >
                    {game.stadium.level >= 5 ? '已达到最高等级' : '开始扩建'}
                    <ArrowUpRight size={18} />
                  </button>
                </section>
                <section className="panel fan-card">
                  <Users size={24} />
                  <h3>用成绩赢得支持</h3>
                  <p>
                    胜利增加球迷，失利会影响热度。稳定表现与合理扩建，能让主场成为可靠的收入来源。
                  </p>
                </section>
              </div>
            </div>
          )}
          {view === 'finance' && (
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
                        <small>
                          {l.id === 'opening' ? '俱乐部成立' : '第 ' + l.round + ' 轮结算'}
                        </small>
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
          )}
          <footer>
            <span>
              <CircleDot size={14} /> TOUCHLINE · 每一家伟大俱乐部，都有一个开始。
            </span>
            <span>试玩版 · 进度保存在当前浏览器的服务器存档中</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button onClick={() => setToast('')} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
      {player && <PlayerModal player={player} onClose={() => setPlayer(null)} />}
      {report && <Replay key={report.id} report={report} onClose={() => setReport(null)} />}
      {rename && (
        <div className="modal-backdrop">
          <section className="modal rename-modal">
            <button className="close" onClick={() => setRename(false)} aria-label="关闭设置">
              <X />
            </button>
            <Crest />
            <h2>为你的俱乐部命名</h2>
            <p>队名将展示在赛程、积分榜与比赛回放中。</p>
            <label>
              俱乐部名称
              <input
                autoFocus
                maxLength={18}
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim().length >= 2)
                    void act('rename', { name }).then((r) => r && setRename(false));
                }}
              />
            </label>
            <button
              className="primary"
              disabled={busy || name.trim().length < 2}
              onClick={() => void act('rename', { name }).then((r) => r && setRename(false))}
            >
              保存名称 <Check size={17} />
            </button>
            <small className="fine">
              每个浏览器拥有独立存档。清除站点 Cookie 会失去此存档的访问凭据；本版暂不提供账号找回。
            </small>
          </section>
        </div>
      )}
    </div>
  );
}
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="loading">
        <h2>页面遇到了一点问题</h2>
        <p>你的进度已保存在服务器，可以安全刷新。</p>
        <button className="primary" onClick={() => location.reload()}>
          刷新页面
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <Boundary>
    <App />
  </Boundary>,
);
