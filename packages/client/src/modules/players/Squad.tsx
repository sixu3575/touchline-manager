import { useState } from 'react';
import { money, roles } from '../../constants';
import type { Club, Game, Player } from '../../model';
import { AssessmentOffice } from './AssessmentOffice';
import { AbilityRadar } from './AbilityRadar';
import { PlayerPortrait } from './PlayerPortrait';
import { footName, nationalityName } from './presentation';
import { lockerRoster } from './locker-roster.mjs';
import './players.css';
import './locker-room.css';

const orders = [
  ['overall', '总能力'],
  ['number', '球衣号码'],
  ['role', '场上位置'],
  ['age', '年龄'],
  ['fitness', '体能'],
  ['goals', '进球'],
  ['assists', '助攻'],
  ['apps', '出场'],
  ['wage', '轮薪'],
  ['form', '比赛状态'],
  ['status', '首发优先'],
  ['name', '姓名'],
];
type Props = {
  game: Game;
  club: Club;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onPlayer: (p: Player) => void;
};
const percent = (value: number) => Math.max(0, Math.min(100, value)) + '%';

export function Squad({ game, club, busy, act, onPlayer }: Props) {
  const [filter, setFilter] = useState('ALL');
  const [key, setKey] = useState('overall');
  const [direction, setDirection] = useState('descending');
  const [query, setQuery] = useState('');
  const players = lockerRoster(
    club.players,
    filter,
    key,
    direction,
    club.lineup,
    query,
  ) as Player[];
  const count = club.players.length;
  const averageAge = count
    ? (club.players.reduce((sum, p) => sum + p.age, 0) / count).toFixed(1)
    : '—';
  const averageMorale = count
    ? Math.round(club.players.reduce((sum, p) => sum + p.wellbeing.morale, 0) / count)
    : '—';
  const totalWage = club.players.reduce((sum, p) => sum + p.wage, 0);
  return (
    <section className="locker-room" aria-label="球员更衣室">
      <header className="locker-heading">
        <div>
          <h1>更衣室</h1>
          <p>整队在此集合。照片认人，资料选人。</p>
        </div>
        <details className="locker-clipboard">
          <summary>教练夹板 · Lv.{game.assessment.coach}</summary>
          <AssessmentOffice game={game} kind="coach" busy={busy} act={act} />
        </details>
      </header>
      <div className="locker-team-note" aria-label="全队概况">
        <strong>
          一线队 <b>{count}</b> / 28人
        </strong>
        <span>
          平均年龄 <b>{averageAge}</b> 岁
        </span>
        <span>
          来自 <b>{new Set(club.players.map((p) => p.nationality)).size}</b> 个国家
        </span>
        <span>
          平均士气 <b>{averageMorale}</b>
        </span>
        <span>
          全队轮薪 <b>{money(totalWage)}</b>
        </span>
      </div>
      <div className="locker-controls">
        <div className="locker-filters" role="group" aria-label="按位置筛选球员">
          {Object.entries({ ALL: '全队', ...roles }).map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="locker-tools">
          <label className="locker-search">
            <span className="locker-sr-only">查找姓名或号码</span>
            <input
              type="search"
              placeholder="姓名 / #号码"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="locker-sr-only">更衣柜排列</span>
            <select
              aria-label="更衣柜排列"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setDirection(
                  ['number', 'role', 'name'].includes(e.target.value) ? 'ascending' : 'descending',
                );
              }}
            >
              {orders.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="locker-direction"
            aria-label={
              direction === 'descending' ? '当前降序，切换为升序' : '当前升序，切换为降序'
            }
            onClick={() => setDirection(direction === 'descending' ? 'ascending' : 'descending')}
          >
            {direction === 'descending' ? '↓ 降序' : '↑ 升序'}
          </button>
        </div>
        <span className="locker-result" role="status" aria-live="polite">
          展示 {players.length} / {count} 人 · 同页完整名册
        </span>
      </div>
      <div className="locker-cabinets" aria-label="全队更衣柜">
        {players.map((p) => (
          <article
            className="player-locker"
            key={p.id}
            data-player-id={p.id}
            data-role={p.role}
            data-fitness={p.fitness < 50 ? 'low' : 'normal'}
          >
            <button
              className="locker-player-open"
              onClick={() => onPlayer(p)}
              aria-label={`打开${p.number}号${p.name}的档案，${roles[p.role]}，${p.age}岁，总能力${p.overall ?? '未知'}，${club.lineup.includes(p.id) ? '首发' : '替补'}`}
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
                <PlayerPortrait player={p} size={100} decorative />
              </span>
              <span className="locker-overall" title="公开总能力值">
                <small>总能力</small>
                {p.overall ?? '—'}
              </span>
              <span className="locker-lineup" data-starting={club.lineup.includes(p.id)}>
                {club.lineup.includes(p.id) ? '首发' : '替补'}
              </span>
              <span className="locker-nameplate">
                <b>{p.name}</b>
                <small>
                  #{p.number} · {roles[p.role]} · {p.age}岁
                </small>
              </span>
            </button>
            <div className="locker-dossier">
              <p className="locker-origin">
                {nationalityName(p.nationality)} · {footName(p.preferredFoot)}
              </p>
              <div className="locker-ability-facts">
                <AbilityRadar player={p} compact />
                <dl className="locker-facts">
                  <div className="locker-wage">
                    <dt>轮薪</dt>
                    <dd>{money(p.wage)}</dd>
                  </div>
                  <div>
                    <dt>出场</dt>
                    <dd>{p.apps}</dd>
                  </div>
                  <div>
                    <dt>进球</dt>
                    <dd>{p.goals}</dd>
                  </div>
                  <div>
                    <dt>助攻</dt>
                    <dd>{p.assists}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>
                      {p.form.toFixed(1)}
                      <small>/10</small>
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="locker-condition">
                <span>
                  <span>
                    体能 <b>{p.fitness}%</b>
                  </span>
                  <i className="locker-energy" aria-hidden="true">
                    <i style={{ width: percent(p.fitness) }} />
                  </i>
                </span>
                <span>
                  <span>
                    士气 <b>{Math.round(p.wellbeing.morale)}</b>
                  </span>
                  <i className="locker-morale" aria-hidden="true">
                    <i style={{ width: percent(p.wellbeing.morale) }} />
                  </i>
                </span>
              </div>
            </div>
          </article>
        ))}
        {!players.length && (
          <div className="locker-empty">
            <p>没有找到符合条件的球员。</p>
            <button
              onClick={() => {
                setFilter('ALL');
                setQuery('');
              }}
            >
              显示全队
            </button>
          </div>
        )}
      </div>
      <div className="locker-bench" aria-hidden="true" />
      <p className="locker-guidance">
        全队同页展示，无需翻排。点击照片或名牌，查看30项能力、性格与生活档案。
      </p>
    </section>
  );
}
