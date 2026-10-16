import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimModule, releaseModule, guardedWrite, fileHash } from '../scripts/collaboration.mjs';
test('module claims exclude other developers/worktrees and stale writes cannot overwrite newer code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-collab-'));
  const root = join(dir, 'tree'),
    other = join(dir, 'other'),
    base = join(dir, 'common-locks');
  mkdirSync(root);
  mkdirSync(other);
  mkdirSync(join(root, 'players'));
  const file = join(root, 'players', 'player.mjs');
  writeFileSync(file, 'original');
  try {
    claimModule(base, 'players', 'alice', root, 'feat/players');
    assert.throws(() => claimModule(base, 'players', 'bob', other, 'feat/other'), /locked/);
    claimModule(base, 'matches', 'bob', other, 'feat/matches');
    const input = {
      root,
      base,
      manifest: { modules: { players: { paths: ['players/'] } } },
      module: 'players',
      owner: 'alice',
      branch: 'feat/players',
      file: 'players/player.mjs',
      expectedHash: fileHash(file),
      content: 'new content',
    };
    assert.throws(() => guardedWrite({ ...input, owner: 'bob' }), /another task/);
    assert.throws(() => guardedWrite({ ...input, branch: 'feat/matches' }), /another task/);
    const before = input.expectedHash;
    const after = guardedWrite(input);
    assert.notEqual(before, after);
    assert.equal(readFileSync(file, 'utf8'), 'new content');
    assert.throws(() => guardedWrite({ ...input, content: 'stale content' }), /Stale file/);
    assert.equal(readFileSync(file, 'utf8'), 'new content');
    assert.throws(() => guardedWrite({ ...input, file: '../outside' }), /outside/);
    assert.throws(
      () => releaseModule(base, 'players', 'bob', root, 'feat/players'),
      /another task/,
    );
    releaseModule(base, 'players', 'alice', root, 'feat/players');
    claimModule(base, 'players', 'bob', other, 'feat/other');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
