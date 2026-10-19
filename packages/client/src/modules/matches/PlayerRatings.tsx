import { useState } from 'react';
import type { Report } from '../../model';
import { buildPlayerRatings } from '../../../../shared/modules/matches/ratings/index.mjs';

const roles: Record<string, string> = { GK: '门将', DEF: '后卫', MID: '中场', FWD: '前锋' };
export function PlayerRatings({ report }: { report: Report }) {
  const [side, setSide] = useState(report.awayId === 'me' ? 1 : 0);
  const ratings: NonNullable<Report['playerRatings']> =
    report.playerRatings ?? buildPlayerRatings(report);
  const graded = ratings.rows.flatMap((row) => (row.rating === null ? [] : [row.rating]));
  const best = graded.length ? Math.max(...graded) : null;
  return (
    <section className="player-ratings" aria-label="赛后球员评分">
      <div className="ratings-heading">
        <h3>赛后球员评分</h3>
        {best !== null && <b>全场最高 {best.toFixed(1)}</b>}
      </div>
      <p className="fine">10分制 · 基准 {ratings.baseline.toFixed(1)} · 点击球员展开依据</p>
      <div className="ratings-teams" role="group" aria-label="评分球队">
        {[report.homeName, report.awayName].map((name, index) => (
          <button
            type="button"
            aria-pressed={side === index}
            aria-label={'查看' + name + '评分'}
            key={index}
            onClick={() => setSide(index)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="ratings-list">
        {ratings.rows
          .filter((row) => row.side === side)
          .map((row) => (
            <details className="rating-player" key={row.id}>
              <summary>
                <span className="rating-identity">
                  <b>{row.number !== null ? row.number + '号' : '—'}</b>
                  <span>
                    <strong>{row.name}</strong>
                    <small>
                      {roles[row.role] ?? row.role} · {row.minutes}分钟
                    </small>
                  </span>
                </span>
                <span className="rating-result">
                  {row.rating !== null && row.rating === best && <small>全场最高</small>}
                  <b
                    className={
                      'match-rating ' +
                      (row.rating === null
                        ? 'unrated'
                        : row.rating >= 8
                          ? 'excellent'
                          : row.rating < 6
                            ? 'poor'
                            : 'normal')
                    }
                  >
                    {row.rating === null ? '—' : row.rating.toFixed(1)}
                  </b>
                </span>
              </summary>
              <div className="rating-breakdown">
                <p>
                  {row.goals}进球 · {row.assists}助攻 · {row.keyPasses}关键传球 · {row.shots}射门 ·{' '}
                  {row.completed}/{row.passes}传球 · {row.wonTackles}成功抢断 · {row.interceptions}
                  拦截 · {row.saves}扑救
                </p>
                <p>
                  推进 {row.carryDistance}米 · 黄牌 {row.yellowCards} / 红牌 {row.redCards}
                </p>
                {row.rating === null ? (
                  <p>{row.unratedReason}</p>
                ) : (
                  <dl>
                    <div>
                      <dt>基准分</dt>
                      <dd>{ratings.baseline.toFixed(2)}</dd>
                    </div>
                    {row.categories
                      .filter((category) => category.value !== 0)
                      .map((category) => (
                        <div key={category.key}>
                          <dt>{category.label}</dt>
                          <dd className={category.value > 0 ? 'positive' : 'negative'}>
                            {category.value > 0 ? '+' : ''}
                            {category.value.toFixed(2)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
                {row.coverage === 'limited' && (
                  <p className="fine">
                    历史数据有限：缺失数据不作推断，仅根据保存的事件和快照评分。
                  </p>
                )}
              </div>
            </details>
          ))}
      </div>
      {!ratings.rows.length && <p className="fine">这份历史报告缺少出场名单，无法可靠评分。</p>}
      <details className="rating-method">
        <summary>评分说明</summary>
        <p>
          按位置评价进球、助攻、机会创造、传球、推进、防守、扑救、在场失球和纪律。常规表现从6.5分起算，9分以上逐步收紧，最终限定3–10分；出场不足10分钟且无决定性事件不评分。各项取整可能有尾差。
        </p>
        <p>
          不会因触球多、球衣号码、球员能力或获胜直接加分。点球大战不计常规评分；未记录的解围、封堵、扑救难度和直接致失球责任不作推断。本场评分与能力评级、近期状态独立。
        </p>
        <p>
          参考{' '}
          <a href="https://corporate.sofascore.com/about/rating" target="_blank" rel="noreferrer">
            Sofascore公开框架
          </a>
          ；使用本游戏公开权重，并非其商业算法。版本 {ratings.version}。
        </p>
      </details>
    </section>
  );
}
