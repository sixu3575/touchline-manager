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
  return (
    <section className="assessment-office">
      <div>
        <b>
          {kind === 'coach' ? '教练评估组' : '球探评估组'} · Lv.{level}/5
        </b>
        <p>
          {kind === 'coach'
            ? '随在队时间和训练逐步了解球员。'
            : '每个比赛日可观察每名候选球员一次。'}
          高等级提供更多细项和更窄区间；Lv.5 且累计 8 次观察可充分了解。
        </p>
        <small>升级仅提高信息精度，不改变能力、训练效果或比赛结果。</small>
      </div>
      <button
        className="secondary"
        disabled={busy || level >= 5 || game.cash < cost}
        onClick={() => void act('staff', { kind })}
      >
        {level >= 5 ? '最高等级' : `升级 · ${money(cost)}`}
      </button>
    </section>
  );
}
