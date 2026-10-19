import type { Game } from '../../model';
import { money } from '../../constants';
export function AssessmentOffice({
  game,
  kind,
  busy,
  act,
}: {
  game: Game;
  kind: 'coach' | 'scout';
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
}) {
  const level = game.assessment[kind],
    cost = (level + 1) * 25000;
  const people = game.staff?.employees.filter((p) => p.kind === kind) ?? [];
  return (
    <section className="assessment-office">
      <div>
        <b>
          {people.map((p) => p.name).join(' / ') || (kind === 'coach' ? '教练' : '球探')} · 观察等级{' '}
          {level}/5
        </b>
        <p>
          {kind === 'coach'
            ? '随在队时间和训练逐步了解球员。'
            : '每个比赛日可观察每名候选球员一次。'}
          高等级提供更多细项和更窄区间；Lv.5 且累计 8 次观察可充分了解。
          {kind === 'coach' && '专项训练可让参训细项更早得到准确确认。'}
        </p>
        <small>
          人员属性、轮薪与招聘在训练基地管理。进修提高能力与潜力判断，不直接改变球员能力。
        </small>
      </div>
      <button
        className="secondary"
        disabled={busy || level >= 5 || game.cash < cost}
        onClick={() => void act('staff', { kind })}
      >
        {level >= 5 ? '观察能力已满' : `评估进修 · ${money(cost)}`}
      </button>
    </section>
  );
}
