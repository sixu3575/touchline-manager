import {
  ensurePlayerDevelopment,
  trainAssignedPlayer,
  ensureAssessment,
} from '../players/index.mjs';
import { enough, money } from '../economy/index.mjs';
import { ensureStaff } from '../staff/index.mjs';
import { random, seedFrom } from '../../core/index.mjs';

export const TRAINING_FIELDS = {
  shooting: {
    name: '射门区',
    cost: 22000,
    coach: 'technical',
    keys: ['finishing', 'longShots', 'heading', 'setPieces', 'offTheBall', 'composure'],
    x: 74,
    y: 22,
  },
  passing: {
    name: '传控区',
    cost: 18000,
    coach: 'tactical',
    keys: ['passing', 'crossing', 'vision', 'decisions', 'teamwork'],
    x: 48,
    y: 44,
  },
  dribbling: {
    name: '盘带区',
    cost: 20000,
    coach: 'technical',
    keys: ['dribbling', 'firstTouch', 'agility', 'balance'],
    x: 70,
    y: 70,
  },
  defending: {
    name: '防守区',
    cost: 22000,
    coach: 'tactical',
    keys: ['tackling', 'marking', 'positioning', 'anticipation', 'concentration'],
    x: 27,
    y: 24,
  },
  pace: {
    name: '速度跑道',
    cost: 25000,
    coach: 'physical',
    keys: ['acceleration', 'sprintSpeed'],
    x: 47,
    y: 10,
  },
  physical: {
    name: '体能恢复区',
    cost: 18000,
    coach: 'physical',
    keys: ['stamina', 'strength', 'balance'],
    x: 26,
    y: 73,
  },
  goalkeeping: {
    name: '门将区',
    cost: 28000,
    coach: 'goalkeeping',
    keys: ['reflexes', 'handling', 'oneOnOnes', 'aerialReach', 'command', 'distribution'],
    x: 15,
    y: 46,
  },
};
export function ensureTraining(g) {
  ensureStaff(g);
  ensurePlayerDevelopment(g);
  if (g.training?.version !== 2)
    g.training = {
      version: 2,
      used: g.training?.used ?? 0,
      facilities: { passing: 1, physical: 1 },
      assignments: {},
      history: [],
      lastResolved: null,
    };
  for (const a of Object.values(g.training.assignments))
    a.playerIds = a.playerIds.filter((id) => g.clubs[0].players.some((p) => p.id === id));
  ensureAssessment(g);
  return g.training;
}
export function trainingFacility(g, { fieldId }) {
  const t = ensureTraining(g);
  if (typeof fieldId !== 'string' || !Object.hasOwn(TRAINING_FIELDS, fieldId))
    throw Error('训练场地无效。');
  const field = TRAINING_FIELDS[fieldId];
  const level = t.facilities[fieldId] ?? 0;
  if (level >= 3) throw Error('场地已经达到3级。');
  const cost = field.cost * (level + 1);
  enough(g, cost);
  money(g, '训练场建设：' + field.name, -cost, `field-${fieldId}-${g.revision}`);
  t.facilities[fieldId] = level + 1;
}
export function assignTraining(g, { fieldId, playerIds, coachId = null }) {
  const t = ensureTraining(g);
  if (
    typeof fieldId !== 'string' ||
    !Object.hasOwn(TRAINING_FIELDS, fieldId) ||
    !t.facilities[fieldId]
  )
    throw Error('请先建设该场地。');
  if (
    !Array.isArray(playerIds) ||
    new Set(playerIds).size !== playerIds.length ||
    playerIds.length > 8 * t.facilities[fieldId]
  )
    throw Error('球员名单重复或超过场地容量。');
  for (const id of playerIds) {
    const p = g.clubs[0].players.find((p) => p.id === id);
    if (!p) throw Error('只能安排本队球员。');
    if (fieldId === 'goalkeeping' && p.role !== 'GK') throw Error('门将区只接收门将。');
  }
  if (coachId && !g.staff.employees.some((p) => p.id === coachId && p.kind === 'coach'))
    throw Error('教练不存在。');
  for (const [id, a] of Object.entries(t.assignments))
    if (id !== fieldId) {
      if (playerIds.some((p) => a.playerIds.includes(p)))
        throw Error('每名球员每轮只可参加一个场地。');
      if (coachId && a.coachId === coachId) throw Error('每名教练每轮只可负责一个场地。');
    }
  t.assignments[fieldId] = {
    playerIds: [...playerIds],
    coachId: playerIds.length ? coachId : null,
  };
}
export function train(g, payload) {
  const t = ensureTraining(g);
  if (t.used >= 2) throw Error('旧版预约本轮最多两次；请使用训练场分配。');
  const fieldId = { attack: 'passing', defence: 'defending', fitness: 'physical' }[payload.focus];
  if (!fieldId) throw Error('训练方向无效。');
  enough(g, 6000);
  const busy = new Set(Object.values(t.assignments).flatMap((a) => a.playerIds));
  const ids = g.clubs[0].players
    .filter((p) => !busy.has(p.id))
    .slice(0, 8 * (t.facilities[fieldId] ?? 1))
    .map((p) => p.id);
  assignTraining(g, { fieldId, playerIds: ids });
  money(g, '训练预约', -6000, `legacy-training-${g.season}-${g.round}-${t.used}`);
  t.used++;
}
export function resolveTraining(g, ageChanges = {}) {
  const t = ensureTraining(g),
    stamp = `${g.season}:${g.round}`;
  if (t.lastResolved === stamp) return;
  const report = { season: g.season, round: g.round, date: g.gameDate, rows: [], cost: 0 };
  for (const [fieldId, a] of Object.entries(t.assignments)) {
    const field = TRAINING_FIELDS[fieldId],
      coach = g.staff.employees.find((p) => p.id === a.coachId && p.kind === 'coach');
    if (!field || !t.facilities[fieldId]) continue;
    for (const id of a.playerIds) {
      const p = g.clubs[0].players.find((p) => p.id === id);
      if (!p) continue;
      const quality = coach
        ? (coach.attributes[field.coach] * 0.75 + coach.attributes.motivation * 0.25) /
          Math.max(1, Math.sqrt(a.playerIds.length / 4))
        : 20;
      const changes = trainAssignedPlayer(
        p,
        field.keys,
        quality,
        t.facilities[fieldId],
        random(seedFrom(`${g.seed}:training:${stamp}:${p.id}`)),
        g.gameDate,
      );
      {
        const r = g.assessment.players[p.id];
        r.sessions++;
        r.trainingObservations ??= {};
        for (const key of field.keys)
          r.trainingObservations[key] =
            (r.trainingObservations[key] ?? 0) +
            1 +
            Math.floor((coach?.attributes.assessment ?? 0) / 40);
        p.fitness = Math.min(100, Math.max(30, p.fitness + (fieldId === 'physical' ? 5 : -2)));
        report.cost += 300;
      }
      report.rows.push({
        playerId: p.id,
        name: p.name,
        number: p.number,
        fieldId,
        coachName: coach?.name ?? null,
        changes: [...(ageChanges[p.id] ?? []), ...changes],
        status: changes.length ? 'improved' : 'unchanged',
      });
    }
  }
  for (const p of g.clubs[0].players)
    if (ageChanges[p.id]?.length && !report.rows.some((r) => r.playerId === p.id))
      report.rows.push({
        playerId: p.id,
        name: p.name,
        number: p.number,
        fieldId: '',
        coachName: null,
        changes: ageChanges[p.id],
        status: 'aging',
      });
  if (report.cost) money(g, '每轮训练运营费', -report.cost, `training-${stamp}`);
  t.history.unshift(report);
  t.history = t.history.slice(0, 40);
  t.lastResolved = stamp;
  t.used = 0;
  ensureAssessment(g);
}
