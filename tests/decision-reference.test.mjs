import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const dir = new URL('packages/shared/modules/matches/design/decision-map/', root);
const snapshot = JSON.parse(readFileSync(new URL('SOURCE_SNAPSHOT.json', dir), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const textSha = (value) => sha(value.replace(/\r\n?/g, '\n'));
test('decision reference follows current sources and its editable diagrams and SVG exports', () => {
  for (const [file, expected] of Object.entries(snapshot.sourceFiles))
    assert.equal(
      textSha(readFileSync(new URL(file, root), 'utf8')),
      expected,
      `Update PLAYER_DECISION_MAP and SOURCE_SNAPSHOT for ${file}`,
    );
  const markdown = readFileSync(new URL('../PLAYER_DECISION_MAP.md', dir), 'utf8');
  const blocks = [...markdown.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)];
  assert.equal(blocks.length, 7);
  let i = 0;
  for (const [name, expected] of Object.entries(snapshot.diagrams)) {
    assert.equal(
      textSha(blocks[i++][1]),
      expected.mermaidSha256,
      `Update diagram source digest: ${name}`,
    );
    assert.equal(
      textSha(readFileSync(new URL(name + '.svg', dir), 'utf8')),
      expected.svgSha256,
      `Regenerate SVG: ${name}`,
    );
  }
});
