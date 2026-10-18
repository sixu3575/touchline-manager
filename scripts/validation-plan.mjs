import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';

export const smokeTests = [
  'tests/smoke.test.mjs',
  'tests/modules.test.mjs',
  'tests/collaboration.test.mjs',
  'tests/validation-plan.test.mjs',
];
export const matchUnits = ['physics', 'physical-motion', 'player-intelligence', 'continuity'].map(
  (n) => `tests/match/${n}.test.mjs`,
);
export const matchScenarios = [
  'engine',
  'shootout',
  'worker',
  'api-real-match',
  'physics-match',
  'intelligence-match',
  'checkpoint-match',
].map((n) => `tests/match/${n}.test.mjs`);
export const seasonTests = [
  'tests/season/game-season.test.mjs',
  'tests/season/api-season.test.mjs',
];
const printer = ts.createPrinter({ removeComments: true });
const displayProperties = new Set(['text', 'reason', 'decision', 'lastMessage']);

// Compare code rather than file timestamps. Comments/formatting and explanatory
// strings are not simulation changes; branch values and numeric parameters are.
export function semanticParts(source, path = 'source.mjs') {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (ast.parseDiagnostics.length) throw Error('Cannot classify invalid JavaScript: ' + path);
  const transformed = ts.transform(ast, [
    (context) => {
      const visit = (node) => {
        if (
          ts.isPropertyAssignment(node) &&
          displayProperties.has(node.name.getText(ast).replace(/^['"]|['"]$/g, ''))
        )
          return ts.factory.updatePropertyAssignment(
            node,
            node.name,
            ts.factory.createStringLiteral('<display>'),
          );
        if (
          path.endsWith('/matches/decisions.mjs') &&
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === 'label'
        )
          return ts.factory.updateVariableDeclaration(
            node,
            node.name,
            node.exclamationToken,
            node.type,
            ts.factory.createStringLiteral('<display>'),
          );
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'event'
        )
          return ts.factory.updateCallExpression(
            node,
            node.expression,
            node.typeArguments,
            node.arguments.map((a, i) =>
              i === 2 ? ts.factory.createStringLiteral('<text>') : ts.visitNode(a, visit),
            ),
          );
        if (
          ts.isNewExpression(node) &&
          /^(Error|TypeError|SyntaxError|RangeError)$/.test(node.expression.getText(ast))
        )
          return ts.factory.updateNewExpression(
            node,
            node.expression,
            node.typeArguments,
            node.arguments?.map((a, i) =>
              i === 0 ? ts.factory.createStringLiteral('<message>') : ts.visitNode(a, visit),
            ),
          );
        if (
          ts.isCallExpression(node) &&
          /^(Error|TypeError|SyntaxError|RangeError)$/.test(node.expression.getText(ast))
        )
          return ts.factory.updateCallExpression(
            node,
            node.expression,
            node.typeArguments,
            node.arguments.map((a, i) =>
              i === 0 ? ts.factory.createStringLiteral('<message>') : ts.visitNode(a, visit),
            ),
          );
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
          return ts.factory.createStringLiteral(node.text);
        return ts.visitEachChild(node, visit, context);
      };
      return (file) => ts.visitNode(file, visit);
    },
  ]);
  const file = transformed.transformed[0];
  const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, file);
  const result = new Map();
  const links = [];
  let other = 0;
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      links.push(print(statement));
    else if (ts.isFunctionDeclaration(statement))
      result.set(statement.name?.text ?? '@default', print(statement));
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        result.set(declaration.name.getText(ast), print(declaration));
    } else if (ts.isClassDeclaration(statement)) {
      for (const member of statement.members)
        result.set(
          `${statement.name.text}.${member.name?.getText(ast) ?? 'constructor'}`,
          print(member),
        );
    } else result.set('@statement' + other++, print(statement));
  }
  result.set('@links', links.join('\n'));
  if (path === 'packages/shared/modules/world/index.mjs') {
    const contracts = [];
    const visit = (node) => {
      if (
        ts.isReturnStatement(node) &&
        node.expression &&
        ts.isObjectLiteralExpression(node.expression)
      ) {
        contracts.push(
          node.expression.properties
            .map((p) => p.name?.getText(ast) ?? print(p))
            .sort()
            .join('|'),
        );
        for (const p of node.expression.properties)
          if (
            ['schemaVersion', 'gameDate', 'season', 'round', 'schedule', 'cup'].includes(
              p.name?.getText(ast),
            )
          )
            contracts.push(print(p));
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    result.set('@world-contract', contracts.join('\n'));
  }
  // Only the action route is a lifecycle contract; a health label fix is ordinary.
  if (path === 'packages/server/src/index.mjs') {
    const routes = [];
    const visit = (node) => {
      let actionPath = false;
      if (ts.isIfStatement(node)) {
        const scan = (part) => {
          if (ts.isStringLiteral(part) && part.text === '/api/action') actionPath = true;
          ts.forEachChild(part, scan);
        };
        scan(node.expression);
      }
      if (actionPath) routes.push(print(node));
      ts.forEachChild(node, visit);
    };
    visit(file);
    result.set('@action-route', routes.join('\n'));
  }
  transformed.dispose();
  return result;
}

const changedKeys = (oldParts, nextParts) =>
  [...new Set([...oldParts.keys(), ...nextParts.keys()])].filter(
    (k) => oldParts.get(k) !== nextParts.get(k),
  );
const intersects = (keys, selected) => keys.some((k) => selected.includes(k));
const moduleTests = {
  players: ['tests/players.test.mjs', 'tests/approved-v1.test.mjs'],
  tactics: ['tests/game.test.mjs'],
  training: ['tests/players.test.mjs', 'tests/game.test.mjs'],
  transfers: ['tests/game.test.mjs', 'tests/api.test.mjs'],
  stadium: ['tests/game.test.mjs'],
  economy: ['tests/game.test.mjs', 'tests/competition-plan.test.mjs'],
  competitions: [
    'tests/game.test.mjs',
    'tests/competition-plan.test.mjs',
    'tests/match-jobs.test.mjs',
  ],
  world: ['tests/game.test.mjs', 'tests/players.test.mjs'],
  club: ['tests/api.test.mjs'],
  matches: ['tests/approved-v1.test.mjs', 'tests/match-jobs.test.mjs'],
};

export function classifyChanges(
  changes,
  { allBusiness = [], majorFlow = false, reason = '', annotations = [] } = {},
) {
  const business = new Set(smokeTests);
  const reasons = [];
  let match = false,
    season = majorFlow;
  if (majorFlow && !reason.trim()) throw Error('--major-flow requires a concrete --reason');
  if (majorFlow) reasons.push('Explicit major-flow assessment: ' + reason);
  for (const change of changes) {
    const { path, before = '', after = '' } = change;
    if (
      path.startsWith('packages/shared/modules/matches/') ||
      /^packages\/shared\/modules\/(players|tactics|world)\//.test(path)
    )
      business.add('tests/decision-reference.test.mjs');
    if (/\.(md|svg|png|jpg)$/.test(path) || path.endsWith('SOURCE_SNAPSHOT.json')) continue;
    if (path.startsWith('tests/match/')) continue; // syntax checked separately; edits to tests do not enable real simulation
    if (path.startsWith('tests/season/')) {
      season = true;
      reasons.push('Changed season contract test: ' + path);
      continue;
    }
    if (
      path.startsWith('tests/helpers/') ||
      path.startsWith('scripts/') ||
      path.startsWith('.github/') ||
      ['package.json', 'package-lock.json'].includes(path)
    ) {
      for (const test of allBusiness) business.add(test);
    }
    if (/^tests\/[^/]+\.test\.mjs$/.test(path)) {
      if (after) business.add(path);
      continue;
    }
    const module =
      path.match(/^packages\/shared\/modules\/([^/]+)\//)?.[1] ??
      path.match(/^packages\/client\/src\/modules\/([^/]+)\//)?.[1];
    for (const test of moduleTests[module] ?? []) business.add(test);
    if (path.startsWith('packages/server/'))
      for (const t of [
        'tests/api.test.mjs',
        'tests/match-jobs.test.mjs',
        'tests/players.test.mjs',
        'tests/live-round.test.mjs',
        'tests/live-http.test.mjs',
      ])
        business.add(t);
    if (path === 'packages/shared/game.mjs' || path.startsWith('packages/shared/core/'))
      for (const t of allBusiness) business.add(t);
    if (['package.json', 'package-lock.json'].includes(path)) {
      const dependency = (text) => {
        const p = text ? JSON.parse(text) : {};
        return [
          p.dependencies?.['@dimforge/rapier3d-compat'],
          p.packages?.['node_modules/@dimforge/rapier3d-compat']?.version,
          p.packages?.['node_modules/@dimforge/rapier3d-compat']?.integrity,
        ].join('|');
      };
      if (dependency(before) !== dependency(after)) {
        match = true;
        reasons.push('Rapier runtime dependency changed');
      }
    }
    if (
      path.startsWith('packages/shared/modules/matches/') &&
      !path.includes('/design/') &&
      path.endsWith('.json') &&
      JSON.stringify(before ? JSON.parse(before) : null) !==
        JSON.stringify(after ? JSON.parse(after) : null)
    ) {
      match = true;
      reasons.push('Match parameter data changed: ' + path);
    }
    if (!path.endsWith('.mjs') || !path.startsWith('packages/')) continue;
    const oldParts = semanticParts(before, path),
      nextParts = semanticParts(after, path);
    const keys = changedKeys(oldParts, nextParts);
    if (!keys.length) continue;
    let algorithm =
      path.startsWith('packages/shared/modules/matches/') &&
      !['index.mjs', 'checkpoint.mjs'].some((p) => path.endsWith('/' + p));
    if (path === 'packages/shared/modules/matches/index.mjs') algorithm = keys.includes('@links');
    if (path === 'packages/shared/modules/players/match-state.mjs')
      algorithm = intersects(keys, [
        'physical',
        'technical',
        'createMatchState',
        'mentalModifier',
        'effectiveAbility',
        'matchShock',
        'energyCost',
        '@links',
      ]);
    if (path === 'packages/shared/core/index.mjs')
      algorithm = intersects(keys, ['random', 'seedFrom', 'clamp', '@links']);
    if (path === 'packages/shared/modules/tactics/index.mjs')
      algorithm = keys.includes('FORMATIONS');
    if (algorithm) {
      match = true;
      reasons.push('Match algorithm: ' + path + ' [' + keys.join(', ') + ']');
    }
    let lifecycle =
      path.startsWith('packages/server/src/storage/') && !path.endsWith('/replays.mjs');
    if (path === 'packages/shared/modules/competitions/index.mjs') lifecycle = true;
    if (path === 'packages/shared/modules/matches/index.mjs')
      lifecycle = intersects(keys, ['settleClubPlayers', 'finishMatch']);
    if (path === 'packages/shared/game.mjs')
      lifecycle = intersects(keys, ['applyAction', 'actions', '@links']);
    if (path === 'packages/server/src/match-jobs.mjs')
      lifecycle = intersects(keys, [
        'MatchJobs.start',
        'MatchJobs.received',
        'MatchJobs.settle',
        'MatchJobs.finishAiring',
        'MatchJobs.resumeStatus',
      ]);
    if (path === 'packages/server/src/broadcast.mjs')
      lifecycle = intersects(keys, ['LIVE_SPEED', 'newBroadcast', 'broadcastAt']);
    if (path === 'packages/server/src/index.mjs') lifecycle = keys.includes('@action-route');
    if (path === 'packages/shared/core/index.mjs')
      lifecycle = intersects(keys, ['addDays', 'seasonStart']);
    if (path === 'packages/shared/modules/matches/checkpoint.mjs') lifecycle = true;
    if (path === 'packages/shared/modules/world/index.mjs')
      lifecycle = keys.includes('@world-contract');
    if (path === 'packages/shared/modules/players/index.mjs')
      lifecycle = keys.includes('settlePlayerMatch');
    if (lifecycle) {
      season = true;
      reasons.push('Lifecycle/settlement/persistence contract: ' + path);
    }
  }
  for (const annotation of annotations) {
    if (
      !annotation.reason?.trim() ||
      !Array.isArray(annotation.files) ||
      !annotation.files.some((p) =>
        changes.some(
          (c) =>
            c.path === p &&
            p.startsWith('packages/') &&
            /\.(mjs|js|ts|tsx|json)$/.test(p) &&
            !p.includes('/design/'),
        ),
      )
    )
      throw Error('Major-flow annotation must explain and name a changed runtime file');
    season = true;
    reasons.push('Major-flow declaration: ' + annotation.reason);
  }
  return {
    match,
    season,
    physicalSeason: match && season,
    businessTests: [...business].sort(),
    matchUnitTests: match ? matchUnits : [],
    matchScenarioTests: match ? matchScenarios : [],
    businessSeasonTests: season
      ? seasonTests.filter((p) => !match || p !== 'tests/season/game-season.test.mjs')
      : [],
    physicalSeasonTests: match && season ? ['tests/season/game-season.test.mjs'] : [],
    reasons,
    changedFiles: changes.map((c) => c.path),
  };
}

export function planFromGit(root, { base, majorFlow, reason } = {}) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const chosen = base || git('merge-base', 'HEAD', 'origin/main').trim();
  if (!/^[a-zA-Z0-9_./~^:-]+$/.test(chosen)) throw Error('Invalid base reference');
  git('rev-parse', '--verify', chosen + '^{commit}');
  const paths = new Set(
    [
      ...git('diff', '--name-only', '--no-renames', '-z', chosen).split('\0'),
      ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
    ].filter(Boolean),
  );
  const baselinePaths = new Set(git('ls-tree', '-r', '--name-only', '-z', chosen).split('\0'));
  const changes = [...paths].sort().map((path) => {
    const before = baselinePaths.has(path) ? git('show', chosen + ':' + path) : '';
    const absolute = resolve(root, path);
    if (relative(root, absolute).startsWith('..')) throw Error('Changed path escaped repository');
    return { path, before, after: existsSync(absolute) ? readFileSync(absolute, 'utf8') : '' };
  });
  const allBusiness = readdirSync(resolve(root, 'tests'))
    .filter((p) => p.endsWith('.test.mjs'))
    .map((p) => 'tests/' + p);
  const annotations = changes
    .filter(
      (c) => c.path.startsWith('validation/major-flow/') && c.path.endsWith('.json') && c.after,
    )
    .map((c) => JSON.parse(c.after));
  return {
    base: chosen,
    ...classifyChanges(changes, { allBusiness, majorFlow, reason, annotations }),
  };
}

export function selectTiers(plan, { quick = false, only } = {}) {
  if (only && !['smoke', 'business', 'match', 'season'].includes(only))
    throw Error('Unknown --only tier');
  if (only === 'match' && !plan.match)
    throw Error('No match algorithm change detected; real simulation is not enabled.');
  if (only === 'season' && !plan.season)
    throw Error(
      'No major flow change detected; use an explicit --major-flow assessment with --reason.',
    );
  const stages = [];
  if (!only || ['business', 'smoke'].includes(only))
    stages.push({
      name: 'smoke + targeted business (real engine forbidden)',
      files: plan.businessTests,
      fixtures: true,
    });
  if ((!only || only === 'match') && plan.match) {
    stages.push({ name: 'targeted match units', files: plan.matchUnitTests, fixtures: false });
    if (!quick)
      stages.push({
        name: 'real match integration',
        files: plan.matchScenarioTests,
        fixtures: false,
      });
  }
  if ((!only || only === 'season') && plan.season && !quick) {
    stages.push({
      name: 'complete business season (controlled reports)',
      files: plan.businessSeasonTests,
      fixtures: true,
    });
    if (plan.physicalSeason)
      stages.push({
        name: 'complete physical season (algorithm + major flow)',
        files: plan.physicalSeasonTests,
        fixtures: false,
      });
  }
  return stages;
}
