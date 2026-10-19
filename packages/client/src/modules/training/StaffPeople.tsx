import type { Game, StaffPerson } from '../../model';
import { money } from '../../constants';
import { STAFF_ATTRIBUTES } from '../../../../shared/modules/staff/index.mjs';
export function StaffPeople({
  game,
  busy,
  act,
}: {
  game: Game;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
}) {
  const card = (p: StaffPerson, hired: boolean) => (
    <article className="staff-person" key={p.id}>
      <div className="staff-title">
        <div>
          <small>
            {p.kind === 'coach' ? '教练' : '球探'} · {p.age}岁 · {p.nationality}
          </small>
          <h3>{p.name}</h3>
        </div>
        <b>{money(p.wage)} / 轮</b>
      </div>
      <p className="fine">
        {p.kind === 'coach'
          ? '对应专项、激励影响专训；能力判断影响训练观察。'
          : '能力判断影响细项精度；潜力判断影响潜力评估。'}
      </p>
      <div className="staff-attributes">
        {Object.entries(STAFF_ATTRIBUTES)
          .filter(([key]) => p.kind === 'coach' || ['assessment', 'potential'].includes(key))
          .map(([key, label]) => (
            <span key={key}>
              {label}
              <b>{p.attributes[key]}</b>
            </span>
          ))}
      </div>
      <button
        className={hired ? 'ghost' : 'secondary'}
        disabled={
          busy ||
          game.cash < p.wage * (hired ? 2 : 4) ||
          (hired && game.staff.employees.filter((s) => s.kind === p.kind).length <= 1)
        }
        onClick={() =>
          void act('staffManage', { operation: hired ? 'fire' : 'hire', staffId: p.id })
        }
      >
        {hired ? `解约 · ${money(p.wage * 2)}` : `聘用 · ${money(p.wage * 4)}`}
      </button>
    </article>
  );
  return (
    <section className="panel staff-management" aria-label="教练与球探人员">
      <h2>教练与球探</h2>
      <p>
        在职轮薪合计 <b>{money(game.staff.employees.reduce((s, p) => s + p.wage, 0))}</b>
        ，每轮联赛统一发放。每名教练同轮只负责一个场地。
      </p>
      <div className="staff-list">{game.staff.employees.map((p) => card(p, true))}</div>
      <details>
        <summary>招聘名单 · 签约费为4轮工资</summary>
        <div className="staff-list">{game.staff.market.map((p) => card(p, false))}</div>
      </details>
    </section>
  );
}
