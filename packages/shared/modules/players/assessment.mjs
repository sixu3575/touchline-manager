import { clamp, seedFrom } from '../../core/index.mjs';
import { ATTRIBUTE_GROUPS } from './catalog.mjs';

// Knowledge is presentation data. Never import this module into the match engine.
export const CARD_GROUPS = {
  pace: ['速度', { acceleration: 0.5, sprintSpeed: 0.5 }],
  shooting: [
    '射门',
    { finishing: 0.45, longShots: 0.2, composure: 0.15, heading: 0.1, setPieces: 0.1 },
  ],
  passing: ['传球', { passing: 0.45, vision: 0.2, crossing: 0.2, decisions: 0.1, setPieces: 0.05 }],
  dribbling: ['盘带', { dribbling: 0.4, firstTouch: 0.25, agility: 0.2, balance: 0.15 }],
  defending: ['防守', { tackling: 0.35, marking: 0.25, positioning: 0.25, anticipation: 0.15 }],
  physical: ['身体', { strength: 0.4, stamina: 0.45, balance: 0.15 }],
};
export const KEEPER_CARD_GROUPS = {
  diving: ['扑救', { reflexes: 0.7, agility: 0.3 }],
  handling: ['接球', { handling: 0.8, firstTouch: 0.2 }],
  kicking: ['出球', { distribution: 0.7, passing: 0.3 }],
  reactions: ['反应', { reflexes: 0.7, anticipation: 0.3 }],
  pace: CARD_GROUPS.pace,
  positioning: ['选位', { oneOnOnes: 0.6, anticipation: 0.4 }],
};
// Reading groups are not aggregation weights. Every detail appears once, although
// a real ability can influence several public summaries and many match decisions.
const OUTFIELD_DETAILS = {
  pace: ['acceleration', 'sprintSpeed'],
  shooting: ['finishing', 'longShots', 'heading', 'setPieces', 'offTheBall', 'composure'],
  passing: ['passing', 'crossing', 'vision', 'decisions', 'teamwork'],
  dribbling: ['dribbling', 'firstTouch', 'agility', 'balance'],
  defending: ['tackling', 'marking', 'positioning', 'anticipation', 'concentration'],
  physical: ['strength', 'stamina'],
};
const KEEPER_DETAILS = {
  diving: ['reflexes', 'agility'],
  handling: ['handling', 'firstTouch', 'balance'],
  kicking: ['distribution', 'passing', 'crossing', 'vision', 'decisions', 'teamwork', 'setPieces'],
  reactions: ['anticipation', 'concentration', 'composure'],
  pace: ['acceleration', 'sprintSpeed', 'stamina', 'strength'],
  positioning: ['oneOnOnes', 'aerialReach', 'command', 'positioning', 'marking', 'tackling'],
};
export function cardDetailGroups(role) {
  const keeper = role === 'GK',
    groups = keeper ? KEEPER_CARD_GROUPS : CARD_GROUPS,
    details = keeper ? KEEPER_DETAILS : OUTFIELD_DETAILS;
  return Object.entries(groups).map(([key, [label]]) => ({
    key,
    label,
    attributes: details[key],
    supplement:
      key === (keeper ? 'kicking' : 'defending')
        ? {
            label: keeper ? '其他进攻技术（不计入出球概览）' : '门将专项（不计入防守概览）',
            attributes: keeper
              ? ['finishing', 'longShots', 'heading', 'offTheBall', 'dribbling']
              : Object.keys(ATTRIBUTE_GROUPS.goalkeeping.attributes),
          }
        : null,
  }));
}
export const ASSESSMENT_STAGES = ['尚未观察', '初步观察', '持续观察', '深入评估', '充分了解'];
const keys = Object.values(ATTRIBUTE_GROUPS).flatMap((g) => Object.keys(g.attributes));
const daysBetween = (a, b) => Math.max(0, Math.floor((Date.parse(b) - Date.parse(a)) / 86400000));
export function assessmentOffice(g) {
  return g.assessment ?? { version: 1, coach: 2, scout: 1, players: {} };
}
export function ensureAssessment(g) {
  if (!g.assessment) {
    g.assessment = { version: 1, coach: 2, scout: 1, players: {} };
    for (const p of g.clubs[0].players)
      g.assessment.players[p.id] = { joinedOn: g.gameDate, sessions: 0, visits: 0 };
  }
  // Newly signed players start coach observation on joining, preserving scout visits.
  for (const p of g.clubs[0].players) {
    const r = (g.assessment.players[p.id] ??= { visits: 0, sessions: 0 });
    r.joinedOn ??= g.gameDate;
  }
  return g.assessment;
}
export function scoutPlayer(g, { playerId }) {
  const p = [...g.market, ...g.clubs.slice(1).flatMap((c) => c.players)].find(
    (p) => p.id === playerId,
  );
  if (!p) throw Error('只能观察当前候选名单或其他球队中的球员。');
  const office = ensureAssessment(g);
  const r = (office.players[p.id] ??= { visits: 0, sessions: 0 });
  if (r.lastScouted === g.gameDate) throw Error('本比赛日已观察过该球员，下个比赛日可继续。');
  r.visits = Math.min(12, r.visits + 1);
  r.lastScouted = g.gameDate;
}
export function staffUpgradeCost(g, kind) {
  if (!['coach', 'scout'].includes(kind)) throw Error('评估团队类型无效。');
  const level = assessmentOffice(g)[kind];
  if (level >= 5) throw Error('评估团队已达最高等级。');
  return (level + 1) * 25000;
}
export function improveAssessmentStaff(g, kind) {
  staffUpgradeCost(g, kind);
  ensureAssessment(g)[kind]++;
}
export function noteAssessmentTraining(g) {
  const office = ensureAssessment(g);
  for (const p of g.clubs[0].players) office.players[p.id].sessions++;
}
export function cardOverview(p) {
  const groups = p.role === 'GK' ? KEEPER_CARD_GROUPS : CARD_GROUPS;
  return Object.entries(groups).map(([key, [label, weights]]) => ({
    key,
    label,
    value: p.attributes
      ? Math.round(Object.entries(weights).reduce((sum, [k, w]) => sum + p.attributes[k] * w, 0))
      : null,
  }));
}
export function assessmentFor(g, p, own = false) {
  const office = assessmentOffice(g),
    r = office.players[p.id] ?? {};
  const level = office[own ? 'coach' : 'scout'];
  const observations =
    (r.visits ?? 0) +
    (own
      ? 1 + Math.floor(daysBetween(r.joinedOn ?? g.gameDate, g.gameDate) / 7) + (r.sessions ?? 0)
      : 0);
  const stage =
    observations === 0
      ? 0
      : level === 5 && observations >= 8
        ? 4
        : Math.min(3, 1 + Math.floor((level - 1) / 2) + Math.floor(observations / 4));
  const bands = Object.fromEntries(
    [...keys, 'potential', 'weakFoot'].map((key) => {
      const hash = seedFrom(`${g.seed}:${p.id}:${key}:assessment-v1`);
      const seen = stage > 0 && (stage >= 3 || hash % 100 < (stage === 1 ? 45 : 75));
      const original = p.attributes?.[key] ?? p[key];
      if (!seen || !Number.isFinite(original)) return [key, null];
      // Archived truth is immutable; its presentation follows the current integer scale.
      const raw = Math.round(original);
      if (stage === 4) return [key, { min: raw, max: raw }];
      const width = { 1: 32, 2: 16, 3: 8 }[stage],
        offset = hash % width;
      const min = Math.floor((raw - offset) / width) * width + offset;
      return [key, { min: clamp(min, 1, 100), max: clamp(min + width, 1, 100) }];
    }),
  );
  return {
    version: 1,
    source: own ? 'coach' : 'scout',
    level,
    stage,
    observations,
    asOf: g.gameDate,
    lastScouted: r.lastScouted ?? null,
    bands,
    overview: cardOverview(p),
  };
}
