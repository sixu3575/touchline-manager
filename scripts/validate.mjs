import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { planFromGit, smokeTests, selectTiers } from './validation-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const quick = args.includes('--quick');
const only = option('--only');
const testsOnly = args.includes('--tests-only');
const startedAt = performance.now();
const report = {
  startedAt: new Date().toISOString(),
  quick,
  mode: only ?? 'check',
  stages: [],
  status: 'planning',
};
const output = resolve(root, option('--report') || 'work/validation/result.json');
mkdirSync(dirname(output), { recursive: true });
const save = () => {
  report.durationMs = Math.round(performance.now() - startedAt);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
};
save();
let plan, selected;
try {
  const valueOptions = ['--base', '--only', '--reason', '--report'];
  const flags = ['--quick', '--tests-only', '--all-business', '--major-flow', '--plan'];
  for (let i = 0; i < args.length; i++) {
    if (valueOptions.includes(args[i])) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error('Missing value for ' + args[i]);
      i++;
    } else if (!flags.includes(args[i])) throw Error('Unknown option: ' + args[i]);
  }
  plan = planFromGit(root, {
    base: option('--base') || process.env.VALIDATION_BASE,
    majorFlow: args.includes('--major-flow') || process.env.VALIDATION_MAJOR_FLOW === 'true',
    reason: option('--reason') || process.env.VALIDATION_REASON,
  });
  const allBusiness = readdirSync(resolve(root, 'tests'))
    .filter((p) => p.endsWith('.test.mjs'))
    .map((p) => 'tests/' + p);
  if (args.includes('--all-business') || only === 'business') plan.businessTests = allBusiness;
  if (only === 'smoke') plan.businessTests = smokeTests;
  selected = selectTiers(plan, { quick, only });
  Object.assign(report, plan, {
    selectedTiers: selected,
    status: 'planned',
    finalEligible: !only && !testsOnly && (!quick || !(plan.match || plan.season)),
  });
  save();
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  save();
  throw error;
}
console.log(
  JSON.stringify(
    {
      base: plan.base,
      match: plan.match,
      season: plan.season,
      physicalSeason: plan.physicalSeason,
      quick,
      reasons: plan.reasons,
    },
    null,
    2,
  ),
);
if (args.includes('--plan')) {
  save();
  process.exit(0);
}
function run(name, argv) {
  const started = performance.now();
  report.status = 'running';
  report.currentStage = name;
  save();
  console.log('\nVALIDATE ' + name);
  const result = spawnSync(process.execPath, argv, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  report.stages.push({
    name,
    durationMs: Math.round(performance.now() - started),
    exitCode: result.status,
    error: result.error?.message,
  });
  if (result.status !== 0) {
    report.status = 'failed';
    save();
    process.exit(result.status || 1);
  }
  save();
}
const fixtureFlags = [
  '--experimental-test-module-mocks',
  '--import',
  new URL('../tests/helpers/business-fixtures.mjs', import.meta.url).href,
];
const tests = (name, files, fixtures) => {
  for (const file of files)
    if (!existsSync(resolve(root, file))) throw Error('Selected test is missing: ' + file);
  if (files.length)
    run(name, [...(fixtures ? fixtureFlags : []), '--test', '--test-concurrency=4', ...files]);
};
try {
  if (!only && !testsOnly)
    run('typecheck', ['node_modules/typescript/bin/tsc', '-p', 'packages/client/tsconfig.json']);
  // Parse changed test files even when their real simulation tier is not enabled.
  for (const file of plan.changedFiles.filter(
    (p) => p.startsWith('tests/') && p.endsWith('.mjs') && existsSync(resolve(root, p)),
  ))
    run('syntax ' + file, ['--check', file]);
  for (const stage of selected) tests(stage.name, stage.files, stage.fixtures);
  if (!only && !testsOnly)
    run('production build', [
      'node_modules/vite/bin/vite.js',
      'build',
      '--config',
      'packages/client/vite.config.ts',
    ]);
  report.status = 'passed';
  delete report.currentStage;
  save();
  console.log('\nValidation passed. Report: ' + output);
  if (quick && (plan.match || plan.season))
    console.log(
      'Iteration checks only; final npm run check must run the eligible integration tiers.',
    );
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  save();
  throw error;
}
