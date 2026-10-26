import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { roles } from '../../constants';
import type { Club, Game, Player } from '../../model';
import { AssessmentOffice } from './AssessmentOffice';
import { PlayerPortrait } from './PlayerPortrait';
import { lockerPage, lockerRoster } from './locker-roster.mjs';
import './players.css';
import './locker-room.css';

type Props = {
  game: Game;
  club: Club;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onPlayer: (p: Player) => void;
};
export function Squad({ game, club, busy, act, onPlayer }: Props) {
  const [filter, setFilter] = useState('ALL');
  const [order, setOrder] = useState('overall:descending');
  const [requestedPage, setPage] = useState(0);
  const [capacity, setCapacity] = useState(() =>
    window.matchMedia('(max-width: 700px)').matches ? 3 : 7,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => {
      setCapacity(media.matches ? 3 : 7);
      setPage(0);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [key, direction] = order.split(':');
  const players = lockerRoster(club.players, filter, key, direction, club.lineup) as Player[];
  const page = lockerPage(players, requestedPage, capacity) as {
    page: number;
    pages: number;
    offset: number;
    players: Player[];
  };
  return (
    <section className="locker-room" aria-label="球员更衣室">
      <header className="locker-heading">
        <div>
          <h1>更衣室</h1>
          <p>{club.players.length}位球员 · 每一件球衣，都有自己的故事。</p>
        </div>
        <details className="locker-clipboard">
          <summary>教练夹板 · Lv.{game.assessment.coach}</summary>
          <AssessmentOffice game={game} kind="coach" busy={busy} act={act} />
        </details>
      </header>
      <div className="locker-controls">
        <div className="locker-filters" role="group" aria-label="按位置筛选球员">
          {Object.entries({ ALL: '全队', ...roles }).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          更衣柜排列
          <select
            aria-label="更衣柜排列"
            value={order}
            onChange={(event) => {
              setOrder(event.target.value);
              setPage(0);
            }}
          >
            <option value="overall:descending">总能力 · 从高到低</option>
            <option value="overall:ascending">总能力 · 从低到高</option>
            <option value="number:ascending">球衣号码</option>
            <option value="role:ascending">场上位置</option>
            <option value="age:ascending">年龄 · 从小到大</option>
            <option value="age:descending">年龄 · 从大到小</option>
            <option value="fitness:descending">当前体力</option>
            <option value="goals:descending">进球最多</option>
            <option value="apps:descending">出场最多</option>
            <option value="wage:descending">轮薪最高</option>
            <option value="status:descending">首发优先</option>
            <option value="name:ascending">姓名</option>
          </select>
        </label>
      </div>
      <div className="locker-cabinets" aria-label="本排更衣柜">
        {page.players.map((p) => (
          <button
            className="player-locker"
            key={p.id}
            data-player-id={p.id}
            data-role={p.role}
            data-fitness={p.fitness < 50 ? 'low' : 'normal'}
            onClick={() => onPlayer(p)}
            aria-label={`打开${p.number}号${p.name}的档案，${roles[p.role]}，${p.age}岁，总能力${p.overall ?? '未知'}，体力${p.fitness}%，${club.lineup.includes(p.id) ? '首发' : '替补'}`}
          >
            <span className="locker-hook" aria-hidden="true" />
            <svg className="locker-shirt" viewBox="0 0 160 180" aria-hidden="true">
              <path
                d="M53 18L68 8L92 8L107 18L145 41L127 76L110 64L115 165L45 165L50 64L33 76L15 41Z"
                fill="currentColor"
                stroke="#182e30"
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                className="shirt-shadow"
                d="M50 64L61 69L58 165L45 165ZM110 64L99 70L103 165L115 165Z"
              />
              <path
                className="shirt-trim"
                d="M55 17L80 34L105 17L98 11L80 23L62 11ZM17 42L34 72L42 68L25 37ZM118 68L127 73L143 43L135 38Z"
              />
              <text x="80" y="111">
                {p.number}
              </text>
            </svg>
            <span className="locker-photo">
              <PlayerPortrait player={p} size={130} decorative />
            </span>
            <span className="locker-overall" title="公开总能力值">
              {p.overall ?? '—'}
            </span>
            <span className="locker-nameplate">
              <b>{p.name}</b>
              <small>
                #{p.number} · {roles[p.role]} · {p.age}岁
              </small>
            </span>
            <span className="locker-state">
              <span className="locker-energy" aria-hidden="true">
                <i style={{ width: Math.max(0, Math.min(100, p.fitness)) + '%' }} />
              </span>
              <span>{p.fitness}%</span>
              <span>· {club.lineup.includes(p.id) ? '首发' : '替补'}</span>
            </span>
          </button>
        ))}
        {!players.length && <p className="locker-empty">这排还没有对应位置的球员。</p>}
      </div>
      <div className="locker-bench" aria-hidden="true" />
      <div className="locker-page-controls">
        <button
          aria-label="上一排更衣柜"
          disabled={page.page === 0}
          onClick={() => setPage(page.page - 1)}
        >
          <ChevronLeft size={16} /> 上一排
        </button>
        <span role="status">
          {players.length ? `${page.offset + 1}–${page.offset + page.players.length}` : '0'} /{' '}
          {players.length}人 · 第{page.page + 1}/{page.pages}排
        </span>
        <button
          aria-label="下一排更衣柜"
          disabled={page.page + 1 === page.pages}
          onClick={() => setPage(page.page + 1)}
        >
          下一排 <ChevronRight size={16} />
        </button>
      </div>
      <p className="locker-guidance">点照片、球衣或名牌，打开这位球员的档案与六维能力图。</p>
    </section>
  );
}
