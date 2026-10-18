import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Dumbbell,
  Landmark,
  LayoutDashboard,
  Menu,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version as APP_VERSION } from '../../../package.json';
import { PlayerModal } from './components/PlayerModal';
import { Replay } from './components/Replay';
import { Badge, Crest } from './components/ui';
import type { Game, Player, Report } from './model';
import { useMatchJob, MatchTask, PhysicalReplay, Pitch } from './modules/matches';
import { Fixtures } from './modules/competitions';
import { Finance } from './modules/economy';
import { Overview } from './modules/overview';
import { Scouting, Squad } from './modules/players';
import { Stadium } from './modules/stadium';
import { Training } from './modules/training';
import { Tactics } from './pages/Tactics';
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
    [watching, setWatching] = useState(false),
    [view, setView] = useState('overview'),
    [mobile, setMobile] = useState(false),
    [player, setPlayer] = useState<Player | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [rename, setRename] = useState(false),
    [name, setName] = useState('');
  const match = useMatchJob(() => void load(), watching);
  const locked = Boolean(match.job && match.job.status !== 'complete');
  const load = async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      setGame(data.state);
      if (data.job) match.accept(data.job);
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
    const liveMode = type === 'advance' || type === 'cup';
    if (liveMode) {
      if (!locked) match.accept(null);
      setReport(null);
      setWatching(true);
    }
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
      if (res.status === 202) {
        match.accept(data.job);
        setWatching(true);
        return;
      }
      setGame(data.state);
      setToast(data.state.lastMessage);
      if (type === 'advance' || type === 'cup') setReport(data.state.reports[0]);
      return data.state as Game;
    } catch (e) {
      if (liveMode) setWatching(false);
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
  const club = game.clubs[0];
  const navigate = (id: string) => {
    setView(id);
    setMobile(false);
  };
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
            <span /> PvE 试玩版 · v{APP_VERSION}
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
              {game.gameDate} · 赛季 {game.season} · 第 {Math.min(14, game.round + 1)} / 14 轮
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
          {match.job && (
            <MatchTask
              job={match.job}
              connection={match.connection}
              onWatch={() => setWatching(true)}
              onReplay={() => {
                const stored = game.reports.find((r) => r.id === match.job?.report?.id);
                if (stored || match.job?.report) setReport(stored ?? match.job!.report!);
              }}
              onRetry={() => void act(match.job!.type)}
            />
          )}
          {view === 'overview' && (
            <Overview
              game={game}
              busy={busy || locked}
              act={act}
              navigate={navigate}
              onPlayer={setPlayer}
              onReport={setReport}
            />
          )}
          {view === 'squad' && (
            <Squad game={game} club={club} busy={busy || locked} act={act} onPlayer={setPlayer} />
          )}
          {view === 'tactics' && (
            <Tactics club={club} act={act} busy={busy || locked} onPlayer={setPlayer} />
          )}
          {view === 'fixtures' && (
            <Fixtures game={game} busy={busy || locked} act={act} onReport={setReport} />
          )}
          {view === 'scouting' && (
            <Scouting
              game={game}
              club={club}
              busy={busy || locked}
              act={act}
              onPlayer={setPlayer}
            />
          )}
          {view === 'training' && (
            <Training
              game={game}
              club={club}
              busy={busy || locked}
              act={act}
              onPlayer={setPlayer}
            />
          )}
          {view === 'stadium' && <Stadium game={game} busy={busy || locked} act={act} />}
          {view === 'finance' && <Finance game={game} />}
          <footer>
            <span>
              <CircleDot size={14} /> TOUCHLINE · 每一家伟大俱乐部，都有一个开始。
            </span>
            <span>试玩版 · 进度保存在当前浏览器的服务器存档中</span>
          </footer>
        </div>
      </main>
      {watching &&
        (match.job?.report ? (
          <PhysicalReplay
            key={match.job.id}
            report={match.job.report}
            onClose={() => setWatching(false)}
            live={{
              job: match.job,
              data: match.data,
              connection: match.connection,
              onBackground: () => setWatching(false),
            }}
          />
        ) : (
          <div className="modal-backdrop">
            <section className="modal live-empty" role="dialog" aria-label="等待实时比赛">
              <h2>比赛直播 · 5倍速</h2>
              <p>
                {match.connection ||
                  match.job?.error ||
                  '正在开球，首段画面就绪后自动播放。90分钟约18分钟，离开后比赛仍会继续。'}
              </p>
              <div className="live-kickoff" aria-label="赛前站位，等待开球">
                <Pitch club={club} />
              </div>
              <button className="secondary" onClick={() => setWatching(false)}>
                返回俱乐部 · 比赛继续
              </button>
            </section>
          </div>
        ))}
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
                  if (e.key === 'Enter' && !locked && name.trim().length >= 2)
                    void act('rename', { name }).then((r) => r && setRename(false));
                }}
              />
            </label>
            <button
              className="primary"
              disabled={busy || locked || name.trim().length < 2}
              onClick={() => void act('rename', { name }).then((r) => r && setRename(false))}
            >
              保存名称 <Check size={17} />
            </button>
            {locked && <small className="fine">本轮结算完成后可修改名称。</small>}
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
