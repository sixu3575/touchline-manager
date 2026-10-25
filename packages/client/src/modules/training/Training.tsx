import { useEffect, useState } from 'react';
import { Dumbbell, Plus, UserRound } from 'lucide-react';
import { Badge } from '../../components/ui';
import { money, roles } from '../../constants';
import type { Club, Game, Player } from '../../model';
import { TRAINING_FIELDS } from '../../../../shared/modules/training/index.mjs';
import { ATTRIBUTE_GROUPS } from '../../../../shared/modules/players/index.mjs';
import { StaffPeople } from './StaffPeople';
import './training.css';
type Props = {
  game: Game;
  club: Club;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  onPlayer: (p: Player) => void;
};
const fields = TRAINING_FIELDS as Record<
  string,
  {
    name: string;
    cost: number;
    coach: string;
    fitnessEffect: number;
    keys: string[];
    x: number;
    y: number;
  }
>;
const labels = Object.assign(
  {},
  ...Object.values(ATTRIBUTE_GROUPS).map((g) => g.attributes),
) as Record<string, string>;
export function Training({ game, club, busy, act, onPlayer }: Props) {
  const [fieldId, setField] = useState('passing'),
    [ids, setIds] = useState<string[]>([]),
    [coach, setCoach] = useState(''),
    [history, setHistory] = useState('latest');
  const t = game.training,
    field = fields[fieldId],
    level = t.facilities[fieldId] ?? 0;
  useEffect(() => {
    setIds(t.assignments[fieldId]?.playerIds ?? []);
    setCoach(t.assignments[fieldId]?.coachId ?? '');
  }, [fieldId, game.revision]);
  const assignedElsewhere = new Set(
    Object.entries(t.assignments)
      .filter(([key]) => key !== fieldId)
      .flatMap(([, a]) => a.playerIds),
  );
  const usedCoaches = new Set(
    Object.entries(t.assignments)
      .filter(([key]) => key !== fieldId)
      .map(([, a]) => a.coachId),
  );
  const round =
    history === 'latest'
      ? t.history[0]
      : t.history.find((r) => `${r.season}:${r.round}` === history);
  return (
    <>
      <div className="training-base-heading">
        <div>
          <small>CLUB TRAINING CENTRE</small>
          <h2>把每一天的努力，安排在球场上。</h2>
          <p>
            选择区域建设场地，分配球员和可选教练。每轮联赛训练一次；安排持续生效，可以随时调整。
          </p>
        </div>
        <Badge tone="outline">
          <Dumbbell size={16} /> 每人每轮一个场地
        </Badge>
      </div>
      <div className="training-base-grid">
        <section className="training-pitch" aria-label="训练基地球场">
          <div className="training-half-line" />
          <div className="training-centre-circle" />
          <div className="training-goal left" />
          <div className="training-goal right" />
          {Object.entries(fields).map(([id, f]) => (
            <button
              key={id}
              aria-pressed={id === fieldId}
              className={
                'training-zone ' +
                (t.facilities[id] ? 'built' : 'unbuilt') +
                (id === fieldId ? ' selected' : '')
              }
              style={{ left: f.x + '%', top: f.y + '%' }}
              onClick={() => setField(id)}
            >
              <span>
                {t.facilities[id] ? <Dumbbell size={17} /> : <Plus size={17} />}
                <b>{f.name}</b>
              </span>
              <small>
                {t.facilities[id]
                  ? `Lv.${t.facilities[id]} · ${t.assignments[id]?.playerIds.length ?? 0}/${8 * t.facilities[id]}人`
                  : '点击建设'}
              </small>
            </button>
          ))}
          <span className="training-pitch-caption">训练基地 · 七个专项区域</span>
        </section>
        <section className="panel training-assignment" aria-label="场地训练安排">
          <div className="staff-title">
            <h2>{field.name}</h2>
            <Badge>{level ? `Lv.${level}` : '待建设'}</Badge>
          </div>
          <p>{field.keys.map((k) => labels[k]).join(' / ')}</p>
          <p className="fine">
            {field.fitnessEffect > 0
              ? `本轮专项恢复预计补充体能 ${field.fitnessEffect} 点。`
              : `本轮专项训练预计消耗体能 ${Math.abs(field.fitnessEffect)} 点。`}
          </p>
          <p className="fine">
            基础训练无需专训教练；专项指导与激励越高，成长机会越大。态度、潜力、年龄和场地等级也影响结果，每项可能
            +1 或保持。
          </p>
          {level > 0 && (
            <>
              <label>
                专训教练（可选）
                <select
                  aria-label="专训教练"
                  value={coach}
                  onChange={(e) => setCoach(e.target.value)}
                  disabled={busy}
                >
                  <option value="">基础训练 · 不安排专训</option>
                  {game.staff.employees
                    .filter((p) => p.kind === 'coach')
                    .map((p) => (
                      <option key={p.id} value={p.id} disabled={usedCoaches.has(p.id)}>
                        {p.name} · 专项 {p.attributes[field.coach]} / 激励 {p.attributes.motivation}
                        {usedCoaches.has(p.id) ? ' · 已在其他场地' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset disabled={busy}>
                <legend>
                  球员名单 · 已选 {ids.length} / {8 * level}
                </legend>
                <div className="training-player-list">
                  {[...club.players]
                    .sort((a, b) => a.number - b.number)
                    .map((p) => (
                      <label
                        key={p.id}
                        className={assignedElsewhere.has(p.id) ? 'unavailable' : ''}
                      >
                        <input
                          type="checkbox"
                          checked={ids.includes(p.id)}
                          disabled={
                            assignedElsewhere.has(p.id) ||
                            (fieldId === 'goalkeeping' && p.role !== 'GK') ||
                            (!ids.includes(p.id) && ids.length >= 8 * level)
                          }
                          onChange={(e) =>
                            setIds(
                              e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span>
                          {p.number} · {p.name}
                          <small>
                            {roles[p.role]} · {p.age}岁
                            {assignedElsewhere.has(p.id) ? ' · 已安排其他场地' : ''}
                          </small>
                        </span>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={'查看' + p.name}
                          onClick={() => onPlayer(p)}
                        >
                          <UserRound size={14} />
                        </button>
                      </label>
                    ))}
                </div>
              </fieldset>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act('trainingAssign', { fieldId, playerIds: ids, coachId: coach || null })
                }
              >
                保存训练安排
              </button>
              <p className="fine">
                每名实际参训球员每轮运营费
                £300；小组超过4人会分摊教练精力。训练会加快对应细项的观察。
              </p>
            </>
          )}
          {level < 3 && (
            <button
              className="secondary"
              disabled={busy || game.cash < field.cost * (level + 1)}
              onClick={() => void act('trainingFacility', { fieldId })}
            >
              {level ? '升级场地' : '建设场地'} · {money(field.cost * (level + 1))}
            </button>
          )}
        </section>
      </div>
      <section className="panel training-results" aria-label="每轮训练结果">
        <div className="staff-title">
          <h2>每轮训练结果</h2>
          <select
            aria-label="训练结果轮次"
            value={history}
            onChange={(e) => setHistory(e.target.value)}
          >
            <option value="latest">最近一轮</option>
            {t.history.map((r) => (
              <option key={`${r.season}:${r.round}`} value={`${r.season}:${r.round}`}>
                S{r.season} · 第{r.round}轮
              </option>
            ))}
          </select>
        </div>
        <p className="fine">
          本轮联赛播放结束后统一发布。只显示本次变化，不泄露尚未准确评估的真实细项。
        </p>
        {!round ? (
          <p>尚无训练结果。安排球员后进行下一轮联赛。</p>
        ) : (
          <>
            <p>
              S{round.season} · 第{round.round}轮 · {round.date} · 运营费 {money(round.cost)}
            </p>
            {!round.rows.length ? (
              <p>本轮未安排训练。</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>球员</th>
                      <th>场地 / 教练</th>
                      <th>本轮变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.rows.map((r) => (
                      <tr key={r.playerId}>
                        <td>
                          {r.number} · {r.name}
                        </td>
                        <td>
                          {fields[r.fieldId]?.name ?? '自然衰退'}
                          {r.fieldId && (
                            <small className="training-coach-note">
                              {r.coachName ?? '基础训练'}
                            </small>
                          )}
                        </td>
                        <td>
                          {[
                            ...(r.changes.length
                              ? r.changes.map(
                                  (c) =>
                                    `${labels[c.attribute]} ${c.delta > 0 ? '+' : ''}${c.delta}${c.reason === 'age' ? '（年龄）' : ''}`,
                                )
                              : ['保持不变']),
                            ...(typeof r.fitnessChange === 'number' && r.fitnessChange !== 0
                              ? [`体能 ${r.fitnessChange > 0 ? '+' : ''}${r.fitnessChange}`]
                              : []),
                          ].join('，')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <StaffPeople game={game} busy={busy} act={act} />
    </>
  );
}
