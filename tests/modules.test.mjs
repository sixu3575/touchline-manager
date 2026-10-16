import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'modules.json'), 'utf8'));
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)],
  );
}
test('domain modules have owners, documented boundaries, public imports and no dependency cycles', () => {
  const domain = resolve(root, 'packages/shared/modules');
  const edges = {};
  for (const entry of readdirSync(domain)) {
    assert.ok(Object.hasOwn(manifest.modules, entry), `Undeclared module ${entry}`);
    const module = manifest.modules[entry];
    for (const doc of ['README.md', 'CHANGELOG.md'])
      assert.ok(
        readFileSync(resolve(domain, entry, doc), 'utf8').trim().length > 30,
        `${entry}/${doc}`,
      );
    edges[entry] = new Set();
    for (const f of files(resolve(domain, entry)).filter((f) => f.endsWith('.mjs'))) {
      const source = readFileSync(f, 'utf8');
      for (const [, spec] of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
        if (spec === '@dimforge/rapier3d-compat' && entry === 'matches') continue;
        assert.ok(spec.startsWith('.'), `Domain must be pure, without Node/network imports: ${f}`);
        const target = relative(domain, resolve(dirname(f), spec)).replaceAll('\\', '/');
        assert.ok(
          !target.startsWith('../') || target === '../core/index.mjs',
          `Use core or domain public APIs: ${target}`,
        );
        if (target.startsWith('../')) continue;
        const [other, ...path] = target.split('/');
        if (entry === other) continue;
        assert.equal(path.join('/'), 'index.mjs', 'Do not reach into another module internals');
        assert.ok(module.dependencies.includes(other), `Undeclared ${entry} -> ${other}`);
        edges[entry].add(other);
      }
    }
  }
  const visit = (name, stack = []) => {
    assert.ok(!stack.includes(name), 'Dependency cycle: ' + [...stack, name].join(' -> '));
    for (const other of edges[name] || []) visit(other, [...stack, name]);
  };
  for (const name of Object.keys(edges)) visit(name);
  const owners = Object.entries(manifest.modules).flatMap(([name, m]) =>
    m.paths.map((path) => ({ name, path })),
  );
  for (const f of files(domain).filter((f) => f.endsWith('.mjs'))) {
    const rel = relative(root, f).replaceAll('\\', '/');
    assert.equal(
      owners.filter((o) => (o.path.endsWith('/') ? rel.startsWith(o.path) : rel === o.path)).length,
      1,
      rel + ' has ambiguous ownership',
    );
  }
});

test('each client feature has one module owner and local handover records', () => {
  const client = resolve(root, 'packages/client/src/modules');
  const owners = Object.entries(manifest.modules).flatMap(([name, m]) =>
    m.paths.map((path) => ({ name, path })),
  );
  for (const entry of readdirSync(client)) {
    assert.ok(Object.hasOwn(manifest.modules, entry), `Undeclared client module ${entry}`);
    for (const doc of ['index.ts', 'README.md', 'CHANGELOG.md'])
      assert.ok(readFileSync(resolve(client, entry, doc), 'utf8').trim().length > 10);
    for (const f of files(resolve(client, entry)).filter((f) => /\.(tsx?|css)$/.test(f))) {
      const rel = relative(root, f).replaceAll('\\', '/');
      const own = owners.filter((o) =>
        o.path.endsWith('/') ? rel.startsWith(o.path) : rel === o.path,
      );
      assert.deepEqual(
        own.map((o) => o.name),
        [entry],
        `Ambiguous ownership of ${rel}`,
      );
    }
  }
});
