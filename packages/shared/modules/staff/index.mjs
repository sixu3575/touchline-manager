import { random, seedFrom, clamp } from '../../core/index.mjs';
import { enough, money } from '../economy/index.mjs';

export const STAFF_ATTRIBUTES = {
  technical: '技术指导',
  physical: '体能训练',
  tactical: '战术指导',
  goalkeeping: '门将指导',
  motivation: '激励',
  assessment: '能力判断',
  potential: '潜力判断',
};
function person(g, kind, index, level = null) {
  const rng = random(seedFrom(`${g.seed}:staff-v1:${kind}:${index}`));
  const names = ['周启明', '陆文轩', '陈致远', '韩嘉宁', '徐景川', '沈博文', '林修远', '马睿哲'];
  const base = level === null ? 30 + rng() * 60 : (level - 1) * 20 + 10;
  const attributes = Object.fromEntries(
    Object.keys(STAFF_ATTRIBUTES).map((k) => [
      k,
      Math.round(clamp(base + (rng() - 0.5) * 34, 10, 98)),
    ]),
  );
  if (level !== null) attributes.assessment = Math.min(95, base);
  const skill =
    kind === 'coach'
      ? (attributes.technical +
          attributes.physical +
          attributes.tactical +
          attributes.goalkeeping) /
        4
      : (attributes.assessment + attributes.potential) / 2;
  return {
    id: `${kind}-${index}`,
    kind,
    name: names[Math.floor(rng() * names.length)],
    age: 32 + Math.floor(rng() * 25),
    nationality: 'CN',
    attributes,
    wage: Math.round((100 + skill * 7) / 50) * 50,
  };
}
export function ensureStaff(g) {
  if (!g.staff) {
    const coach = person(g, 'coach', 'founding', g.assessment?.coach ?? 2),
      scout = person(g, 'scout', 'founding', g.assessment?.scout ?? 1);
    g.staff = {
      version: 1,
      employees: [coach, scout],
      market: [0, 1, 2, 3]
        .map((i) => person(g, 'coach', i))
        .concat([0, 1, 2].map((i) => person(g, 'scout', i))),
    };
  }
  return g.staff;
}
export function staffAction(g, { operation, staffId }) {
  const office = ensureStaff(g);
  if (operation === 'hire') {
    if (office.employees.length >= 8) throw Error('教练和球探合计最多8人。');
    const person = office.market.find((p) => p.id === staffId);
    if (!person) throw Error('该职员已不在招聘名单。');
    const cost = person.wage * 4;
    enough(g, cost);
    money(g, '职员签约费', -cost, `staff-hire-${g.revision}-${person.id}`);
    office.employees.push(person);
    office.market = office.market.filter((p) => p !== person);
  } else if (operation === 'fire') {
    const person = office.employees.find((p) => p.id === staffId);
    if (!person) throw Error('职员不存在。');
    if (office.employees.filter((p) => p.kind === person.kind).length <= 1)
      throw Error('至少保留一名教练和一名球探。');
    enough(g, person.wage * 2);
    money(g, '职员解约费', -person.wage * 2, `staff-fire-${g.revision}-${person.id}`);
    office.employees = office.employees.filter((p) => p !== person);
    for (const a of Object.values(g.training?.assignments ?? {}))
      if (a.coachId === staffId) a.coachId = null;
  } else throw Error('职员操作无效。');
}
export function payStaff(g) {
  const wage = ensureStaff(g).employees.reduce((s, p) => s + p.wage, 0);
  money(g, '教练与球探工资', -wage, `staff-wages-${g.season}-${g.round}`);
}
