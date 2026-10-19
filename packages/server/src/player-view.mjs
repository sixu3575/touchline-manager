import {
  assessmentFor,
  assessmentOffice,
  skillSummary,
  rating,
} from '../../shared/modules/players/index.mjs';

// One boundary for state, action retries, full archives and live job responses.
// Real attributes and engine diagnostics stay in SQLite, never in public DTOs.
export function publicPlayer(g, p, own = false) {
  const assessment = assessmentFor(g, p, own);
  const midpoint = (k) => {
    const band = assessment.bands[k];
    return band ? Math.round((band.min + band.max) / 2) : 50;
  };
  const {
    attributes,
    skills,
    attributeProfile,
    potential,
    weakFoot,
    matchState,
    trainingProgress,
    ...identity
  } = p;
  const estimates = Object.fromEntries(Object.keys(assessment.bands).map((k) => [k, midpoint(k)]));
  return {
    ...identity,
    fitness: Math.round(p.fitness),
    overall: Number.isFinite(rating(p)) ? rating(p) : null,
    assessment,
    skills: skillSummary(estimates),
    potential: midpoint('potential'),
    weakFoot: midpoint('weakFoot'),
  };
}
const diagnostics = new Set([
  'seed',
  'quality',
  'opponentQuality',
  'estimatedSuccess',
  'probability',
  'decision',
  'mind',
  'motion',
  'attributes',
  'attributeProfile',
  'matchState',
  'trainingProgress',
]);
function stripDiagnostics(value) {
  if (Array.isArray(value)) return value.map(stripDiagnostics);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !diagnostics.has(k))
      .map(([k, v]) => [k, stripDiagnostics(v)]),
  );
}
export function publicReport(g, report) {
  if (!report) return report;
  const safe = stripDiagnostics(report);
  safe.snapshots = (report.snapshots ?? []).map((s) => ({
    ...stripDiagnostics(s),
    players: (s.players ?? []).map((p) => publicPlayer(g, p, s.id === g.clubs[0].id)),
  }));
  return safe;
}
export function publicJob(g, job) {
  return job ? { ...job, ...(job.report ? { report: publicReport(g, job.report) } : {}) } : job;
}
export function publicState(g) {
  const { assessment, seed, ...rest } = g;
  const office = assessmentOffice(g);
  return {
    ...rest,
    assessment: { version: 1, coach: office.coach, scout: office.scout },
    clubs: g.clubs.map((c, i) => ({
      ...c,
      players: c.players.map((p) => publicPlayer(g, p, i === 0)),
    })),
    market: g.market.map((p) => publicPlayer(g, p)),
    reports: g.reports.map((r) => publicReport(g, r)),
  };
}
