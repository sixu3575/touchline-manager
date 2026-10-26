import {
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDot,
  Dumbbell,
  FileText,
  Landmark,
  LayoutDashboard,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayerModal } from './components/PlayerModal';
import { Replay } from './components/Replay';
import { Crest } from './components/ui';
import type { Game, Player, Report } from './model';
import { useMatchJob, MatchTask, PhysicalReplay, Pitch } from './modules/matches';
import { Fixtures, MyMatches, PlayerLeaders, PressRoom } from './modules/competitions';
import { Finance } from './modules/economy';
import { Overview } from './modules/overview';
import { Scouting, Squad } from './modules/players';
import { Stadium } from './modules/stadium';
import { Training } from './modules/training';
import { Tactics } from './pages/Tactics';
import './style.css';
import './ink-theme.css';
import { SceneHeader } from './scenes/SceneHeader';
import { ROOM_NAMES } from './scenes/navigation.mjs';
import './scenes/scenes.css';
const nav = [
  { id: 'overview', label: '俱乐部总览', icon: LayoutDashboard },
  { id: 'squad', label: '一线队', icon: Users },
  { id: 'tactics', label: '战术室', icon: SlidersHorizontal },
  { id: 'fixtures', label: '赛程与杯赛', icon: CalendarDays },
  { id: 'league-stats', label: '联赛球员榜', icon: BarChart3 },
  { id: 'my-matches', label: '我的比赛', icon: FileText },
  { id: 'club-honours', label: '荣誉陈列室', icon: Trophy },
  { id: 'scouting', label: '球探中心', icon: Search },
  { id: 'training', label: '训练基地', icon: Dumbbell },
  { id: 'stadium', label: '主场与球迷', icon: Landmark },
  { id: 'finance', label: '俱乐部财务', icon: Wallet },
];
function App() {
  const sceneMain = useRef<HTMLElement>(null);
  const [game, setGame] = useState<Game | null>(null),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [watching, setWatching] = useState(false),
    [view, setView] = useState('overview'),
    [player, setPlayer] = useState<Player | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [rename, setRename] = useState(false),
    [name, setName] = useState('');
  const match = useMatchJob(() => void load(), watching);
  useEffect(() => {
    sceneMain.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [view, Boolean(game)]);
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
  const managerCommand = async (
    command: import('./modules/matches/LiveManagerBoard').LiveCommand,
  ) => {
    const id = match.job?.id;
    if (!id) throw Error('没有可控制的进行中比赛。');
    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    const response = await fetch(`/api/match-jobs/${id}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, command }),
    });
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error || '临场指令提交失败。');
    match.accept(payload.job);
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
  };
  const matchProgress = match.job && (
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
  );
  return (
    <div className={'app immersive-app immersive-' + view}>
      <SceneHeader
        game={game}
        view={view}
        nav={nav}
        navigate={navigate}
        busy={busy}
        onSettings={() => {
          setName(club.name);
          setRename(true);
        }}
      />
      <main ref={sceneMain} tabIndex={-1} className={'scene-main scene-main-' + view}>
        <div className="content">
          {![
            'overview',
            'squad',
            'fixtures',
            'league-stats',
            'my-matches',
            'club-honours',
          ].includes(view) && <h1 className="room-heading">{ROOM_NAMES[view] ?? '俱乐部'}</h1>}
          {!['fixtures', 'club-honours'].includes(view) && matchProgress}
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
          {(view === 'fixtures' || view === 'club-honours') && (
            <PressRoom active="paper" navigate={navigate}>
              <Fixtures
                key={view}
                game={game}
                busy={busy || locked}
                act={act}
                onReport={setReport}
                matchProgress={matchProgress}
                initialEdition={view === 'club-honours' ? 'honours' : 'league'}
              />
            </PressRoom>
          )}
          {view === 'league-stats' && (
            <PressRoom active="screen" navigate={navigate}>
              <PlayerLeaders season={game.season} revision={game.revision} />
            </PressRoom>
          )}
          {view === 'my-matches' && (
            <PressRoom active="archive" navigate={navigate}>
              <MyMatches game={game} onReport={setReport} />
            </PressRoom>
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
              onManagerCommand: managerCommand,
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
