import { useState, type ReactNode } from 'react';
import { ChevronRight, Play, Trophy } from 'lucide-react';
import { standings } from '../../../../shared/modules/competitions/selectors/index.mjs';
import { Crest, Empty, LeagueTable } from '../../components/ui';
import type { Game, Report, Standing } from '../../model';
import { AdvanceButton } from './AdvanceButton';
import { RoundReports } from './RoundReports';
import './competitions.css';
import './press-room.css';

type Edition = 'league' | 'calendar' | 'cup' | 'honours';
export function Fixtures({
  game,
  busy,
  act,
  onReport,
  matchProgress,
  initialEdition = 'league',
}: {
  game: Game;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onReport: (r: Report) => void;
  matchProgress?: ReactNode;
  initialEdition?: Edition;
}) {
  const [edition, setEdition] = useState<Edition>(initialEdition);
  const rows = standings(game) as Standing[];
  const rank = rows.findIndex((x) => x.id === 'me') + 1;
  const own = rows.find((x) => x.id === 'me');
  const club = game.clubs[0];
  const next = game.schedule[game.round]?.find((x) => x.includes('me'));
  const opponent = next && game.clubs.find((x) => x.id === next.find((id) => id !== 'me'));
  const latest = game.reports[0];
  return (
    <>
      {matchProgress}
      <article className="sports-paper" aria-label="临场体育报">
        <div className="paper-dateline">
          <span>独立球会体育报 · 第{game.season}赛季</span>
          <span>
            {game.gameDate} · 第{Math.min(14, game.round + 1)}轮特刊
          </span>
        </div>
        <header className="paper-masthead">
          <span>THE TOUCHLINE POST</span>
          <h1>临场体育报</h1>
          <p>球场上的事，纸上见。</p>
        </header>
        <nav className="paper-editions" aria-label="体育报版面">
          {(
            [
              ['league', '联赛速报'],
              ['calendar', '赛历与战报'],
              ['cup', '城市挑战杯'],
              ['honours', '荣誉纪事'],
            ] as [Edition, string][]
          ).map(([id, label]) => (
            <button key={id} aria-pressed={edition === id} onClick={() => setEdition(id)}>
              {label}
            </button>
          ))}
        </nav>
        {edition === 'league' && (
          <div className="paper-frontpage">
            <section className="paper-table-story" aria-label="联赛积分榜">
              <span className="paper-kicker">LEAGUE TABLE / 先锋联赛</span>
              <h2>这一轮，谁在领跑？</h2>
              <LeagueTable rows={rows} compact />
              <details className="paper-full-table">
                <summary>查阅完整积分 · 战绩、名次变化与下轮对手</summary>
                <LeagueTable rows={rows} />
              </details>
              <p className="paper-caption">胜3分 · 平1分 · 负0分。榜单仅按已结算比赛更新。</p>
            </section>
            <aside className="paper-club-story">
              <span className="paper-kicker">CLUB FOCUS / 本队追踪</span>
              <div className="paper-club-crest">
                <Crest name={club.name} color={club.color} />
              </div>
              <h2>{game.round ? `${club.name}，暂列第${rank}` : '新赛季，故事还未开篇'}</h2>
              <p>
                {game.round
                  ? `联赛已赛${own?.played ?? 0}场，${own?.won ?? 0}胜${own?.drawn ?? 0}平${own?.lost ?? 0}负，收获${own?.points ?? 0}积分。`
                  : '联赛尚未开赛。先去更衣室认识球员，再到战术棚排定首发。'}
              </p>
              <div className="paper-record">
                <b>
                  {own?.points ?? 0}
                  <small>积分</small>
                </b>
                <b>
                  {rank}
                  <small>当前排名</small>
                </b>
                <b>
                  {(own?.gf ?? 0) - (own?.ga ?? 0)}
                  <small>净胜球</small>
                </b>
              </div>
              {latest ? (
                <button className="paper-result-cutting" onClick={() => onReport(latest)}>
                  <small>俱乐部最近战况 · {latest.competition}</small>
                  <b>
                    {latest.homeName}
                    <strong>{latest.score.join(' : ')}</strong>
                    {latest.awayName}
                  </b>
                  <span>翻看本场战报与回放 ↗</span>
                </button>
              ) : (
                <p className="paper-editor-note">
                  本报将记录每一轮已结束的比赛。赛前不预测比分，也不提前透露赛果。
                </p>
              )}
            </aside>
          </div>
        )}
        {edition === 'calendar' && (
          <section className="paper-calendar">
            <span className="paper-kicker">SEASON CALENDAR / 双循环 · 十四轮</span>
            <h2>把每一场，写进赛历。</h2>
            <div className="paper-fixture-grid">
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
                    className={'paper-fixture ' + (i === game.round ? 'is-next' : '')}
                    onClick={() => replay && onReport(replay)}
                  >
                    <span className="paper-round">{String(i + 1).padStart(2, '0')}</span>
                    <Crest small name={op.name} color={op.color} />
                    <span>
                      <b>{op.name}</b>
                      <small>{pair[0] === 'me' ? '主场' : '客场'}</small>
                    </span>
                    <strong>
                      {result ? result.score.join(' : ') : i === game.round ? '下一轮' : '—'}
                    </strong>
                    {replay ? <Play size={13} /> : <ChevronRight size={13} />}
                  </button>
                );
              })}
            </div>
            <RoundReports game={game} onReplay={onReport} />
          </section>
        )}
        {edition === 'cup' && (
          <section className="paper-cup-story">
            <span className="paper-kicker">CITY CUP / 城市挑战杯</span>
            <Trophy size={65} />
            <h2>
              {game.cup.eliminated
                ? '杯赛征途，留待来年'
                : game.cup.stage >= 3
                  ? '本届杯赛已落幕'
                  : '一座城，一座杯。'}
            </h2>
            <p>
              {game.cup.eliminated
                ? '本赛季已出局，下赛季再战。'
                : game.cup.stage >= 3
                  ? '本届比赛已经结束。'
                  : '八强 → 半决赛 → 决赛 · 已晋级' + game.cup.wins + '次'}
            </p>
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
                    ? '第' + (2 + game.cup.stage * 3) + '轮后开放'
                    : '参加' + ['八强赛', '半决赛', '决赛'][game.cup.stage] + '并实时观看'}
            </button>
          </section>
        )}
        {edition === 'honours' && (
          <section className="paper-honours">
            <span className="paper-kicker">THE CLUB CHRONICLE / 荣誉纪事</span>
            <h2>值得装裱的那些日子。</h2>
            {game.trophies.length ? (
              <div className="paper-trophy-shelf">
                {game.trophies.map((t, i) => (
                  <div key={i}>
                    <Trophy size={72} />
                    <b>{t.title}</b>
                    <small>第{t.season}赛季</small>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>第一座奖杯，正在等待它的主人。</Empty>
            )}
          </section>
        )}
        <footer className="paper-footer">
          <span>
            临场体育报 ·{' '}
            {edition === 'league'
              ? '01'
              : edition === 'calendar'
                ? '02'
                : edition === 'cup'
                  ? '03'
                  : '04'}
            版
          </span>
          <span>属于你的球会故事</span>
        </footer>
      </article>
      <div className="press-match-ticket">
        <div>
          <span>下轮焦点 / NEXT MATCH</span>
          <b>{opponent ? `${club.name}  vs  ${opponent.name}` : `本季最终排名 ${rank} / 8`}</b>
          <small>
            {game.round < 14
              ? '前往战术棚排定首发，准备好再开球。'
              : '赛季奖金已结算，开启下一个赛季。'}
          </small>
        </div>
        <AdvanceButton game={game} busy={busy} act={act} />
      </div>
    </>
  );
}
