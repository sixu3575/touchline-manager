import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortrait,
  renderPortrait,
  portraitLayers,
  PARTS,
  portraitCombinationCount,
  portraitStage,
  archivedPortraitPlayer,
} from '../packages/client/src/modules/players/portraits/generator.mjs';

test('career boundaries change artwork without rerolling identity; old reports keep match age', () => {
  assert.deepEqual([0, 18, 19, 29, 30, 80].map(portraitStage), [
    'academy',
    'academy',
    'young',
    'young',
    'middle',
    'middle',
  ]);
  for (const age of [undefined, null, NaN, -1, '18']) assert.equal(portraitStage(age), 'unknown');
  const recipe = createPortrait('career-player', { beard: 5, hair: 7 });
  const stages = [18, 19, 30].map((age) => renderPortrait(recipe, { age }));
  assert.equal(new Set(stages).size, 3);
  assert.equal(renderPortrait(recipe, { age: 19 }), renderPortrait(recipe, { age: 29 }));
  assert.equal(renderPortrait(recipe), renderPortrait(recipe, { age: 24 }));
  assert.equal(portraitLayers(recipe, { age: 18 }).beardFront, '');
  assert.notEqual(portraitLayers(recipe, { age: 30 }).beardBack, '');
  const report = { snapshots: [{ players: [{ id: 'career-player', age: 18 }] }] };
  const current = { id: 'career-player', side: 0, age: 32 };
  const historic = archivedPortraitPlayer(report, current);
  assert.equal(historic.age, 18);
  assert.equal(current.age, 32);
  assert.equal(archivedPortraitPlayer({ snapshots: [] }, current).age, undefined);
  assert.deepEqual(createPortrait(historic), createPortrait(current));
});

test('portrait identity survives rename, aging, training and transfer without mutating the player', () => {
  // Pin the released v1 recipe: changing a modulo, order or hash must not silently reroll old faces.
  assert.deepEqual(createPortrait('c0-p8'), {
    version: 'touchline-ink-1',
    identity: 'c0-p8',
    head: 0,
    hair: 2,
    eyes: 1,
    nose: 2,
    mouth: 0,
    beard: 1,
    detail: 2,
    skin: 0,
    hairColor: 0,
    kit: 2,
    background: 5,
  });
  const player = Object.freeze({
    id: 'player-persistent-27',
    name: '旧名字',
    age: 19,
    role: 'MID',
    overall: 61,
  });
  const original = createPortrait(player);
  assert.deepEqual(
    createPortrait({ ...player, name: '新名字', age: 32, role: 'FWD', overall: 88, club: 'other' }),
    original,
  );
  assert.equal(player.age, 19);
  assert.deepEqual(createPortrait(JSON.parse(JSON.stringify(original)).identity), original);
});

test('kit changes do not perturb any face layer', () => {
  const original = createPortrait('signed-player', { kit: 0 });
  const changed = createPortrait('signed-player', { kit: 3 });
  const a = portraitLayers(original),
    b = portraitLayers(changed);
  for (const key of Object.keys(a).filter((key) => key !== 'jersey')) assert.equal(a[key], b[key]);
  assert.notEqual(a.jersey, b.jersey);
});

test('large seed batches have varied complete recipes and only legal part selections', () => {
  const unique = new Set();
  for (let i = 0; i < 10000; i++) {
    const spec = createPortrait(`portrait-batch-${i}`);
    for (const [key, entries] of Object.entries(PARTS))
      assert.ok(spec[key] >= 0 && spec[key] < entries.length);
    unique.add(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(spec).filter(
            ([key]) => !['identity', 'version', 'kit', 'background'].includes(key),
          ),
        ),
      ),
    );
  }
  assert.ok(unique.size >= 9950, `Excessive recipe collisions: ${unique.size}/10000`);
  assert.ok(portraitCombinationCount() > 1000000);
});

test('locked components survive a new seed and invalid overrides cannot enter SVG markup', () => {
  const old = createPortrait('old');
  const next = createPortrait('new', {
    hair: old.hair,
    nose: old.nose,
    eyes: '<script>',
    skin: -1,
    kit: 99999,
  });
  assert.equal(next.hair, old.hair);
  assert.equal(next.nose, old.nose);
  const markup = renderPortrait(next, { title: '名字"><script>alert(1)</script>' });
  assert.ok(!markup.includes('<script>'));
  assert.ok(!markup.includes('undefined'));
  assert.ok(!markup.includes('{{'));
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.throws(() => createPortrait({ name: 'missing ID' }), /ID/);
});

test('all parts render on a shared rig without external resources or duplicate SVG IDs', () => {
  for (const [slot, entries] of Object.entries(PARTS))
    entries.forEach((_, index) => {
      const markup = renderPortrait(createPortrait('all-parts', { [slot]: index }), {
        transparent: true,
      });
      assert.ok(markup.startsWith('<svg'));
      assert.ok(markup.includes('viewBox="0 0 256 256"'));
      assert.ok(!markup.includes('<rect width="256"'));
      assert.ok(!/https?:\/\//.test(markup.replace('http://www.w3.org/2000/svg', '')));
      assert.ok(!/\bid=/.test(markup));
      assert.ok(!/NaN|undefined|\{\{/.test(markup));
    });
});
