import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPortrait,
  renderPortrait,
  portraitLayers,
  PARTS,
  SKINS,
  HAIR_COLORS,
  KITS,
  PORTRAIT_VERSION,
  RIG,
  portraitCombinationCount,
} from './generator.mjs';
import { INK } from './parts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(process.argv[2] || 'dist/portrait-assets');
mkdirSync(resolve(dest, 'samples'), { recursive: true });
mkdirSync(resolve(dest, 'parts'), { recursive: true });
const write = (name, text) => writeFileSync(resolve(dest, name), text, 'utf8');
const partsSource = readFileSync(resolve(here, 'parts.mjs'), 'utf8');
const generatorSource = readFileSync(resolve(here, 'generator.mjs'), 'utf8');
const embedded =
  partsSource.replace(/^export /gm, '') +
  '\n' +
  generatorSource
    .replace(/^import .*?;\s*/s, '')
    .replace(/^export \{[^}]+\};\s*/m, '')
    .replace(/^export /gm, '');
write(
  'portrait-lab.html',
  readFileSync(resolve(here, 'lab.html'), 'utf8').replace('/* GENERATOR */', embedded),
);
write('parts.mjs', partsSource);
write('generator.mjs', generatorSource);
const baseline = createPortrait('parts-template', {
  head: 1,
  hair: 0,
  skin: 1,
  hairColor: 1,
  kit: 0,
  eyes: 0,
  nose: 0,
  mouth: 0,
  beard: 0,
  detail: 0,
});
const layerKeys = {
  head: ['ears', 'head'],
  hair: ['rearHair', 'hair'],
  eyes: ['eyes'],
  nose: ['nose'],
  mouth: ['mouth'],
  beard: ['beardBack', 'beardFront'],
  detail: ['detail'],
};
let count = 0;
for (const [key, entries] of Object.entries(PARTS)) {
  mkdirSync(resolve(dest, 'parts', key), { recursive: true });
  entries.forEach((entry, index) => {
    const layers = portraitLayers(createPortrait(baseline.identity, { ...baseline, [key]: index }));
    const content = layerKeys[key].map((layer) => layers[layer]).join('');
    write(
      `parts/${key}/${entry.id}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>${entry.name}</title><g fill="none" stroke="${INK}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">${content}</g></svg>`,
    );
    count++;
  });
}
write(
  'parts/jersey.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g stroke="${INK}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">${portraitLayers(baseline).jersey}</g></svg>`,
);
const samples = Array.from({ length: 24 }, (_, i) =>
  createPortrait(`TOUCHLINE-3575/player-${String(i + 1).padStart(2, '0')}`),
);
samples.forEach((spec, i) =>
  write(
    `samples/player-${String(i + 1).padStart(2, '0')}.svg`,
    renderPortrait(spec, { transparent: true, title: `原创球员 ${i + 1}` }),
  ),
);
const contact = samples
  .map(
    (spec, i) =>
      `<g transform="translate(${(i % 6) * 208 + 16} ${Math.floor(i / 6) * 228 + 64})">${renderPortrait(spec).replace('width="256" height="256"', 'width="192" height="192"')}<text x="96" y="213" text-anchor="middle" fill="#20363c" font-size="12" font-family="sans-serif">PLAYER ${String(i + 1).padStart(2, '0')}</text></g>`,
  )
  .join('');
write(
  'generated-contact-sheet.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="1264" height="992" viewBox="0 0 1264 992"><rect width="1264" height="992" fill="#e6e7de"/><text x="20" y="34" font-size="24" font-family="sans-serif" font-weight="bold" fill="#20363c">TOUCHLINE / ORIGINAL PROCEDURAL PORTRAITS</text>${contact}</svg>`,
);
write(
  'manifest.json',
  JSON.stringify(
    {
      version: PORTRAIT_VERSION,
      rig: RIG,
      layers: Object.keys(portraitLayers(baseline)),
      parts: Object.fromEntries(
        Object.entries(PARTS).map(([key, entries]) => [
          key,
          entries.map((entry, index) => ({
            id: entry.id,
            name: entry.name,
            index,
            file: `parts/${key}/${entry.id}.svg`,
          })),
        ]),
      ),
      palettes: { skins: SKINS, hair: HAIR_COLORS, kits: KITS },
      partCount: count + 1,
      combinations: portraitCombinationCount(),
      samples,
      note: 'Individual SVGs retain full rig placement. Use generator.mjs for correct layered order. Beards and hair have back/front sublayers. Palette tokens are authored in parts.mjs.',
    },
    null,
    2,
  ),
);
console.log(`Exported ${count + 1} part assets, 24 sample portraits and standalone lab to ${dest}`);
