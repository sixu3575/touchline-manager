import { random, seedFrom, clamp, decimal } from '../../core/index.mjs';
import { ATTRIBUTE_GROUPS, COUNTRIES, PERSONALITY, INTERESTS } from './catalog.mjs';
import { profileAttributes, ATTRIBUTE_PROFILE_VERSION } from './profiles.mjs';
export * from './catalog.mjs';
export * from './match-state.mjs';
export { ATTRIBUTE_PROFILE_VERSION, SPECIALISMS } from './profiles.mjs';

export function ageOn(birthDate, date) {
  return (
    Number(date.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    Number(date.slice(5) < birthDate.slice(5))
  );
}
function birthday(age, date, rng) {
  const monthDay = `${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`;
  return `${Number(date.slice(0, 4)) - age - Number(monthDay > date.slice(5))}-${monthDay}`;
}
export function skillSummary(attributes) {
  const a = attributes;
  return Object.fromEntries(
    Object.entries({
      pace: (a.acceleration + a.sprintSpeed) / 2,
      shooting: a.finishing * 0.6 + a.longShots * 0.2 + a.composure * 0.2,
      passing: a.passing * 0.6 + a.vision * 0.2 + a.decisions * 0.2,
      defending: a.tackling * 0.4 + a.marking * 0.3 + a.positioning * 0.3,
      stamina: a.stamina,
      keeping:
        a.reflexes * 0.3 +
        a.handling * 0.25 +
        a.oneOnOnes * 0.2 +
        a.aerialReach * 0.15 +
        a.command * 0.1,
    }).map(([key, value]) => [key, decimal(value)]),
  );
}
export function rating(p) {
  const s = p.attributes ? skillSummary(p.attributes) : p.skills;
  return Math.round(
    p.role === 'GK'
      ? s.keeping * 0.7 + s.passing * 0.1 + s.stamina * 0.2
      : p.role === 'DEF'
        ? s.defending * 0.5 + s.pace * 0.2 + s.passing * 0.15 + s.stamina * 0.15
        : p.role === 'MID'
          ? s.passing * 0.5 + s.pace * 0.15 + s.shooting * 0.15 + s.stamina * 0.2
          : s.shooting * 0.55 + s.pace * 0.25 + s.passing * 0.1 + s.stamina * 0.1,
  );
}
function makeIdentity(age, role, date, rng, nationality) {
  const countries = Object.keys(COUNTRIES);
  nationality ||= countries[Math.floor(rng() * countries.length)];
  const birthDate = birthday(age, date, rng);
  const footRoll = rng();
  return {
    nationality,
    birthDate,
    age,
    preferredFoot: footRoll < 0.2 ? 'left' : footRoll < 0.9 ? 'right' : 'both',
    weakFoot: footRoll >= 0.9 ? 80 + Math.round(rng() * 15) : 20 + Math.round(rng() * 65),
    heightCm: (role === 'GK' ? 183 : role === 'DEF' ? 176 : 168) + Math.floor(rng() * 16),
  };
}
function makeCharacter(rng) {
  const personality = Object.fromEntries(
    Object.keys(PERSONALITY).map((key) => [key, 20 + Math.round(rng() * 70)]),
  );
  const keys = Object.keys(INTERESTS);
  const first = Math.floor(rng() * keys.length);
  const second = (first + 1 + Math.floor(rng() * (keys.length - 1))) % keys.length;
  return {
    personality,
    wellbeing: { morale: 70, confidence: 65, clubAttachment: 40, adaptation: 100 },
    publicProfile: {
      mediaStyle:
        personality.sociability >= 70
          ? 'charismatic'
          : personality.sociability < 40
            ? 'reserved'
            : 'candid',
      interests: [keys[first], keys[second]],
      popularity: 10 + Math.round(rng() * 35),
    },
  };
}
export function personalityTraits(p) {
  const x = p.personality;
  if (!x) return [];
  return [
    x.professionalism >= 70 && 'professional',
    x.ambition >= 75 && 'ambitious',
    x.loyalty >= 70 && 'loyal',
    x.leadership >= 75 && 'leader',
    x.sociability >= 70 && 'social',
    x.temperament >= 75 && 'composed',
    x.sociability <= 35 && 'private',
    x.temperament <= 35 && 'expressive',
  ].filter(Boolean);
}
export function player(id, role, level, rng, youth = false, date = '2026-07-01') {
  const age = youth ? 16 + Math.floor(rng() * 3) : 19 + Math.floor(rng() * 16);
  const identity = makeIdentity(age, role, date, rng);
  const country = COUNTRIES[identity.nationality];
  const first = country.first[Math.floor(rng() * country.first.length)];
  const last = country.last[Math.floor(rng() * country.last.length)];
  const budgets = {
    pace: level + (rng() - 0.5) * 8,
    shooting: level + { GK: -18, DEF: -15, MID: -3, FWD: 4 }[role] + (rng() - 0.5) * 8,
    passing: level + { GK: -8, DEF: -3, MID: 4, FWD: -4 }[role] + (rng() - 0.5) * 8,
    defending: level + { GK: -20, DEF: 4, MID: -5, FWD: -22 }[role] + (rng() - 0.5) * 8,
    stamina: level + (rng() - 0.5) * 10,
    keeping: role === 'GK' ? level + 4 + (rng() - 0.5) * 8 : 12,
  };
  for (const key of Object.keys(budgets)) budgets[key] = decimal(clamp(budgets[key], 1, 95));
  const { attributes, archetype } = profileAttributes(role, budgets, rng, identity.heightCm);
  const p = {
    id,
    name: ['CN', 'JP', 'KR'].includes(identity.nationality) ? last + first : first + '·' + last,
    role,
    ...identity,
    attributes,
    attributeProfile: { version: ATTRIBUTE_PROFILE_VERSION, archetype, source: 'generated' },
    skills: skillSummary(attributes),
    ...makeCharacter(rng),
    fitness: 100,
    potential: Math.round(clamp(level + 8 + rng() * 20, 55, 95)),
    number: 1 + Math.floor(rng() * 98),
    goals: 0,
    assists: 0,
    apps: 0,
    form: 6.5,
  };
  p.wage = Math.round((rating(p) * 18 + 100) / 50) * 50;
  p.price = Math.round((rating(p) ** 2 * 42 * (youth ? 1.35 : 1)) / 1000) * 1000;
  return p;
}
export function reprofilePlayer(p, seed) {
  if (p.attributeProfile?.version >= ATTRIBUTE_PROFILE_VERSION) return false;
  if (!p.attributes) throw Error('Current player attributes required');
  const budgets = skillSummary(p.attributes);
  if (Object.values(budgets).some((v) => !Number.isFinite(v) || v < 1 || v > 100))
    throw Error('Invalid ability budget');
  const rng = random(seedFrom(`${seed}:${p.id}:attribute-profile-v1`));
  const { attributes, archetype } = profileAttributes(p.role, budgets, rng, p.heightCm);
  p.attributes = attributes;
  p.skills = skillSummary(attributes);
  p.attributeProfile = { version: ATTRIBUTE_PROFILE_VERSION, archetype, source: 'redistributed' };
  return true;
}
export function observationPlayer(seed, date) {
  const p = player(
    'observation-star-v1',
    'FWD',
    95,
    random(seedFrom(`${seed}:observation-star-v1`)),
    false,
    date,
  );
  Object.assign(p, {
    name: '林曜',
    number: 99,
    nationality: 'CN',
    birthDate: '2002-03-21',
    preferredFoot: 'both',
    weakFoot: 95,
    heightCm: 188,
    potential: 99,
    wage: 0,
    price: 0,
  });
  p.age = ageOn(p.birthDate, date);
  Object.assign(p.attributes, {
    finishing: 98,
    longShots: 94,
    composure: 97,
    passing: 91,
    vision: 93,
    decisions: 96,
    firstTouch: 97,
    dribbling: 96,
    crossing: 85,
    tackling: 38,
    marking: 35,
    heading: 95,
    setPieces: 90,
    positioning: 60,
    offTheBall: 98,
    anticipation: 95,
    teamwork: 88,
    concentration: 96,
    acceleration: 94,
    sprintSpeed: 92,
    agility: 94,
    balance: 93,
    strength: 92,
    stamina: 96,
    reflexes: 10,
    handling: 8,
    oneOnOnes: 9,
    aerialReach: 12,
    command: 15,
    distribution: 48,
  });
  p.skills = skillSummary(p.attributes);
  p.attributeProfile = {
    version: ATTRIBUTE_PROFILE_VERSION,
    archetype: 'observation',
    source: 'observation',
  };
  p.wellbeing = { morale: 80, confidence: 80, clubAttachment: 70, adaptation: 100 };
  return p;
}
export function squad(prefix, level, rng, date) {
  const roles = [
    'GK',
    'GK',
    ...Array(7).fill('DEF'),
    ...Array(7).fill('MID'),
    ...Array(4).fill('FWD'),
  ];
  return roles.map((r, i) => ({
    ...player(prefix + '-p' + i, r, level + rng() * 10 - 5, rng, false, date),
    number: i + 1,
  }));
}
// A deterministic additive upgrade. Existing ability, prices, identity and history are preserved.
export function migratePlayer(p, seed, date) {
  const rng = random(seedFrom(`${seed}:${p.id}:profile-v2`));
  const legacyCountries = {
    '马可·席尔瓦': 'BR',
    '卢卡·科瓦奇': 'HR',
    '莱昂·贝克': 'DE',
    '迭戈·莫雷诺': 'AR',
    '伊万·佩特罗夫': 'HR',
    '诺亚·威尔逊': 'GB',
    '阿米尔·哈桑': 'NG',
    '凯文·米勒': 'DE',
  };
  Object.assign(
    p,
    makeIdentity(p.age, p.role, date, rng, legacyCountries[p.name] || 'CN'),
    makeCharacter(rng),
  );
  const s = p.skills;
  p.attributes = Object.fromEntries([
    ...['finishing', 'longShots', 'composure'].map((k) => [k, s.shooting]),
    ...['passing', 'vision', 'decisions', 'firstTouch', 'crossing', 'distribution'].map((k) => [
      k,
      s.passing,
    ]),
    ...['tackling', 'marking', 'positioning', 'heading', 'anticipation', 'concentration'].map(
      (k) => [k, s.defending],
    ),
    ...['acceleration', 'sprintSpeed', 'agility', 'balance', 'dribbling', 'offTheBall'].map((k) => [
      k,
      s.pace,
    ]),
    ...['stamina', 'strength', 'teamwork'].map((k) => [k, s.stamina]),
    ['setPieces', s.shooting],
    ...['reflexes', 'handling', 'oneOnOnes', 'aerialReach', 'command'].map((k) => [k, s.keeping]),
  ]);
  return p;
}
export function updateAges(g) {
  for (const p of [...g.clubs.flatMap((c) => c.players), ...g.market])
    p.age = ageOn(p.birthDate, g.gameDate);
}
export function trainPlayer(p, focus, rng) {
  const groups = {
    attack: [
      'finishing',
      'longShots',
      'passing',
      'firstTouch',
      'dribbling',
      'crossing',
      'setPieces',
      'vision',
      'decisions',
      'composure',
      'offTheBall',
    ],
    defence: [
      'tackling',
      'marking',
      'heading',
      'positioning',
      'anticipation',
      'teamwork',
      'concentration',
      'stamina',
    ],
    fitness: ['acceleration', 'sprintSpeed', 'stamina', 'strength', 'agility', 'balance'],
  };
  const keeper = {
    attack: ['distribution', 'passing', 'decisions'],
    defence: ['reflexes', 'handling', 'oneOnOnes', 'aerialReach', 'command', 'concentration'],
    fitness: groups.fitness,
  };
  const ageFactor = p.age <= 21 ? 1.2 : p.age >= 30 ? 0.65 : 1;
  const attitude = 0.75 + p.personality.professionalism / 200;
  for (const k of (p.role === 'GK' ? keeper : groups)[focus])
    p.attributes[k] = Math.max(
      p.attributes[k],
      decimal(Math.min(p.potential, p.attributes[k] + (0.6 + rng() * 0.7) * ageFactor * attitude)),
    );
  p.skills = skillSummary(p.attributes);
  p.fitness = clamp(p.fitness + (focus === 'fitness' ? 8 : -4), 30, 100);
}
export function settlePlayerMatch(
  p,
  { played, won, drawn, goals, assists = 0, press, seed, energy, mind },
) {
  // Stable personality is never changed by a match; only short-term state changes.
  p.wellbeing.morale = clamp(
    p.wellbeing.morale + (won ? 3 : drawn ? 0 : -2) + (played ? 1 : -1),
    0,
    100,
  );
  if (played) {
    p.apps++;
    p.fitness = clamp(
      Number.isFinite(energy)
        ? energy
        : p.fitness - (press === 'high' ? 12 : press === 'low' ? 5 : 8),
      20,
      100,
    );
    p.goals += goals;
    p.assists = (p.assists ?? 0) + assists;
    p.form = decimal(clamp(6 + (won ? 0.3 : 0) + goals * 0.8 + assists * 0.5, 1, 10));
    p.wellbeing.confidence = clamp(
      p.wellbeing.confidence + (won ? 2 : drawn ? 0 : -2) + goals * 2,
      0,
      100,
    );
    p.wellbeing.clubAttachment = clamp(p.wellbeing.clubAttachment + 1, 0, 100);
    p.publicProfile.popularity = clamp(p.publicProfile.popularity + goals + Number(won), 0, 100);
  }
  // New reports carry bounded in-match state; do not apply the legacy result shock twice.
  if (played && mind) {
    p.wellbeing.morale = clamp(mind.morale, 0, 100);
    p.wellbeing.confidence = clamp(mind.confidence, 0, 100);
  }
}
export function recoverPlayer(p, amount = 8) {
  p.fitness = Math.min(100, p.fitness + amount);
}
export function joinClub(p) {
  p.wellbeing.clubAttachment = 20;
  p.wellbeing.adaptation = 70;
}
export function resetForSeason(p, date) {
  p.age = ageOn(p.birthDate, date);
  p.goals = 0;
  p.apps = 0;
  p.assists = 0;
  p.fitness = 100;
}
