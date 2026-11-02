// Offline, isolated benchmark inputs. Raw licensed/community rating files stay
// outside Git and never migrate a player's production squad.
import { createGame } from '../../packages/shared/game.mjs';
import { FORMATIONS, formationSlot } from '../../packages/shared/modules/tactics/index.mjs';
import { skillSummary, rating } from '../../packages/shared/modules/players/index.mjs';

export const FC_DIRECT_ATTRIBUTES = {
  acceleration: 'movement_acceleration',
  sprintSpeed: 'movement_sprint_speed',
  finishing: 'attacking_finishing',
  longShots: 'power_long_shots',
  composure: 'mentality_composure',
  passing: 'attacking_short_passing',
  vision: 'mentality_vision',
  tackling: 'defending_standing_tackle',
  marking: 'defending_marking_awareness',
  stamina: 'power_stamina',
  reflexes: 'goalkeeping_reflexes',
  handling: 'goalkeeping_handling',
  firstTouch: 'skill_ball_control',
  dribbling: 'skill_dribbling',
  crossing: 'attacking_crossing',
  heading: 'attacking_heading_accuracy',
  setPieces: 'skill_fk_accuracy',
  offTheBall: 'mentality_positioning',
  agility: 'movement_agility',
  balance: 'movement_balance',
  strength: 'power_strength',
  distribution: 'goalkeeping_kicking',
};
export const FC_PROXY_ATTRIBUTES = [
  'decisions',
  'positioning',
  'oneOnOnes',
  'aerialReach',
  'command',
  'anticipation',
  'teamwork',
  'concentration',
];

const mean = (values) => values.reduce((s, n) => s + n, 0) / values.length;
const integer = (n) => Math.max(1, Math.min(100, Math.round(n)));

export function fcPositionLineup(rows, formation) {
  const slots = Object.entries(FORMATIONS[formation]).flatMap(([role, count]) =>
    Array.from({ length: count }, (_, index) => ({
      role,
      ...formationSlot(formation, role, index, count),
    })),
  );
  const eligibility = (row, slot) => {
    const positions = row.player_positions.split(',').map((p) => p.trim());
    const left = slot.z < 34;
    const exact =
      slot.positionRole === 'keeper'
        ? ['GK']
        : slot.positionRole === 'centreBack'
          ? ['CB']
          : slot.positionRole === 'fullback'
            ? left
              ? ['LB', 'LWB']
              : ['RB', 'RWB']
            : slot.positionRole === 'wingBack'
              ? left
                ? ['LWB', 'LB', 'LM']
                : ['RWB', 'RB', 'RM']
              : slot.positionRole === 'wideMid'
                ? left
                  ? ['LM', 'LW']
                  : ['RM', 'RW']
                : slot.positionRole === 'holdingMid'
                  ? ['CDM']
                  : slot.positionRole === 'centralMid'
                    ? ['CM', 'CAM']
                    : slot.positionRole === 'winger'
                      ? left
                        ? ['LW', 'LM']
                        : ['RW', 'RM']
                      : ['ST', 'CF'];
    if (positions.some((p) => exact.includes(p))) return 10000 + Number(row.overall);
    if (
      (slot.positionRole === 'holdingMid' && positions.includes('CM')) ||
      (slot.positionRole === 'centralMid' && positions.includes('CDM'))
    )
      return 5000 + Number(row.overall);
    const broad =
      slot.role === 'GK'
        ? ['GK']
        : slot.role === 'DEF'
          ? ['CB', 'LB', 'RB', 'LWB', 'RWB']
          : slot.role === 'MID'
            ? ['CM', 'CAM', 'CDM', 'LM', 'RM', 'LW', 'RW']
            : ['ST', 'CF', 'LW', 'RW'];
    return positions.some((p) => broad.includes(p)) ? Number(row.overall) : -Infinity;
  };
  // Exact maximum-weight unique assignment, using only declared positions and
  // published OVR. Prefer a natural centre-back/striker over a higher OVR
  // fullback/winger. Broad-position fallbacks are exposed in the evidence.
  const size = 1 << slots.length,
    score = new Float64Array(size).fill(-Infinity),
    paths = Array(size);
  score[0] = 0;
  rows.forEach((row, playerIndex) => {
    for (let mask = size - 1; mask >= 0; mask--) {
      if (!Number.isFinite(score[mask])) continue;
      slots.forEach((slot, slotIndex) => {
        if (mask & (1 << slotIndex)) return;
        const fit = eligibility(row, slot),
          next = mask | (1 << slotIndex),
          value = score[mask] + fit;
        if (value > score[next]) {
          score[next] = value;
          paths[next] = { playerIndex, slotIndex, fit, prev: paths[mask] };
        }
      });
    }
  });
  if (!Number.isFinite(score[size - 1]))
    throw Error('No legal FC position assignment for ' + formation);
  const selected = [];
  for (let p = paths[size - 1]; p; p = p.prev)
    selected[p.slotIndex] = {
      playerIndex: p.playerIndex,
      ...slots[p.slotIndex],
      fallback: p.fit < 10000,
    };
  return selected;
}
export function fcAttributes(row, role) {
  const value = (key) => {
    if (row[key] == null || row[key] === '' || !Number.isFinite(Number(row[key])))
      throw Error('Missing FC attribute ' + key);
    return Number(row[key]);
  };
  const a = Object.fromEntries(
    Object.entries(FC_DIRECT_ATTRIBUTES).map(([key, field]) => [key, integer(value(field))]),
  );
  const reading = value('movement_reactions'),
    composed = value('mentality_composure');
  const positioning =
    role === 'GK'
      ? value('goalkeeping_positioning')
      : role === 'DEF'
        ? value('defending_marking_awareness')
        : role === 'FWD'
          ? value('mentality_positioning')
          : value('mentality_vision');
  // FC has no direct equivalents for these eight fields. These transparent
  // proxies are sensitivity assumptions, not measured FM values or CA/2.
  Object.assign(a, {
    decisions: integer(mean([role === 'GK' ? positioning : a.vision, reading, composed])),
    positioning: integer(
      role === 'GK' ? positioning : mean([a.marking, value('mentality_interceptions')]),
    ),
    oneOnOnes: integer(mean([value('goalkeeping_positioning'), value('goalkeeping_diving')])),
    aerialReach: integer(
      role === 'GK'
        ? mean([value('goalkeeping_diving'), value('power_jumping')])
        : value('power_jumping'),
    ),
    command: integer(mean([value('goalkeeping_positioning'), reading])),
    anticipation: integer(mean([reading, positioning])),
    teamwork: integer(mean([a.passing, a.vision, reading])),
    concentration: integer(mean([reading, composed])),
  });
  return a;
}

export function fcClub(rows, clubId, tactics, seed = 42) {
  const source = rows.filter((r) => String(r.club_team_id) === String(clubId));
  if (source.length < 11) throw Error('Insufficient rated players for FC club ' + clubId);
  const game = createGame('FC隔离基准', seed),
    club = structuredClone(game.clubs[0]);
  const roleFor = (row) => {
    const first = row.player_positions.split(',')[0].trim();
    return first === 'GK'
      ? 'GK'
      : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(first)
        ? 'DEF'
        : ['ST', 'CF', 'LW', 'RW'].includes(first)
          ? 'FWD'
          : 'MID';
  };
  club.id = 'fc-' + clubId;
  club.name = source[0].club_name;
  club.tactics = { ...tactics };
  club.players = source.map((row, index) => {
    const role = roleFor(row),
      template = game.clubs[0].players.find((p) => p.role === role);
    const p = structuredClone(template);
    Object.assign(p, {
      id: `fc-${clubId}-${row.player_id}`,
      name: row.short_name,
      role,
      number: Number(row.club_jersey_number) || index + 1,
      age: Number(row.age),
      birthDate: row.dob,
      heightCm: Number(row.height_cm),
      preferredFoot: row.preferred_foot === 'Left' ? 'left' : 'right',
      weakFoot: integer(Number(row.weak_foot) * 20),
      fitness: 100,
      attributes: fcAttributes(row, role),
      referenceOverall: Number(row.overall),
    });
    p.wellbeing = { morale: 50, confidence: 50, adaptation: 100 };
    p.personality = Object.fromEntries(Object.keys(p.personality).map((k) => [k, 50]));
    p.personality.aggression = Number(row.mentality_aggression);
    p.skills = skillSummary(p.attributes);
    return p;
  });
  const selection = fcPositionLineup(source, tactics.formation);
  club.lineup = selection.map((slot) => {
    const player = club.players[slot.playerIndex];
    player.role = slot.role;
    return player.id;
  });
  club.referenceSelection = selection.map((slot) => ({
    id: club.players[slot.playerIndex].id,
    positionRole: slot.positionRole,
    declaredPositions: source[slot.playerIndex].player_positions,
    fallback: slot.fallback,
  }));
  if (club.lineup.length !== 11) throw Error('No legal FC lineup for ' + club.name);
  return club;
}
export function fcLineupStrength(club) {
  const players = club.lineup.map((id) => club.players.find((p) => p.id === id));
  return {
    selection: club.referenceSelection,
    fcMean: mean(players.map((p) => p.referenceOverall)),
    gameMean: mean(players.map(rating)),
    fcSd: Math.sqrt(
      mean(players.map((p) => p.referenceOverall ** 2)) -
        mean(players.map((p) => p.referenceOverall)) ** 2,
    ),
    means: Object.fromEntries(
      Object.keys(players[0].attributes).map((key) => [
        key,
        mean(players.map((p) => p.attributes[key])),
      ]),
    ),
  };
}
