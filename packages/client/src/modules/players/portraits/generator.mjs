import { PORTRAIT_VERSION, INK, SKINS, HAIR_COLORS, KITS, BACKGROUNDS, PARTS } from './parts.mjs';

export { PORTRAIT_VERSION, PARTS, SKINS, HAIR_COLORS, KITS, BACKGROUNDS };
export const RIG = Object.freeze({
  width: 256,
  height: 256,
  eyeLine: 124,
  noseTip: 158,
  mouthLine: 182,
  crown: 44,
  chin: 210,
  collar: 220,
});

// A feature-specific stream makes future additions independent of existing slots.
export function hashPortrait(text) {
  let h = 2166136261;
  for (const char of String(text)) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
const slotSizes = {
  ...Object.fromEntries(Object.entries(PARTS).map(([key, items]) => [key, items.length])),
  skin: SKINS.length,
  hairColor: HAIR_COLORS.length,
  kit: KITS.length,
  background: BACKGROUNDS.length,
};

export function createPortrait(identity, overrides = {}) {
  const id = String(typeof identity === 'object' && identity !== null ? identity.id : identity);
  if (!id || id === 'undefined' || id === 'null')
    throw new TypeError('A stable player ID is required');
  const spec = { version: PORTRAIT_VERSION, identity: id };
  for (const [key, length] of Object.entries(slotSizes)) {
    const supplied = overrides[key];
    spec[key] =
      Number.isInteger(supplied) && supplied >= 0 && supplied < length
        ? supplied
        : hashPortrait(`${PORTRAIT_VERSION}|${id}|${key}`) % length;
  }
  return Object.freeze(spec);
}

function palette(spec) {
  return { ink: INK, ...SKINS[spec.skin], ...HAIR_COLORS[spec.hairColor], ...KITS[spec.kit] };
}
function paint(fragment, colors) {
  return fragment.replace(/\{\{(\w+)\}\}/g, (_, key) => colors[key] ?? INK);
}
function path(d, fill, extra = '') {
  return d ? `<path d="${d}" fill="${fill}" ${extra}/>` : '';
}
// Lifecycle is a rendering layer; the released v1 identity recipe never changes.
export const LIFECYCLE_VERSION = 'touchline-career-1';
export function portraitStage(age) {
  if (!Number.isFinite(age) || age < 0) return 'unknown';
  return age <= 18 ? 'academy' : age < 30 ? 'young' : 'middle';
}
export function portraitStageLabel(age) {
  return { academy: '青训', young: '青年', middle: '中年', unknown: '年龄未记录' }[
    portraitStage(age)
  ];
}
// Historical views must use the match snapshot, never today's roster or game date.
export function archivedPortraitPlayer(report, player) {
  const snapshot = report.snapshots?.[player.side]?.players?.find((p) => p.id === player.id);
  return { ...player, age: snapshot?.age };
}
export function portraitLayers(spec, { age } = {}) {
  const s = createPortrait(spec.identity, spec);
  const c = palette(s);
  const h = PARTS.head[s.head],
    hair = PARTS.hair[s.hair],
    eyes = PARTS.eyes[s.eyes],
    nose = PARTS.nose[s.nose],
    beard = PARTS.beard[s.beard];
  const layers = {
    jersey: `<path d="M12 256L18 237Q25 224 59 216L99 202L155 202L198 216Q232 225 238 239L244 256Z" fill="${c.kit}"/><path d="M14 256L22 238Q44 226 63 223L55 256ZM202 221Q230 228 236 241L241 256L211 256Z" fill="${c.kitShade}" stroke="none"/><path d="M28 234L69 222M188 221L228 234" fill="none" stroke="${c.trim}" stroke-width="5"/><path d="M102 192L101 211L126 232L155 211L153 191Z" fill="${c.skin}"/><path d="M129 203L153 195L153 213L127 229L116 218Z" fill="${c.shade}" stroke="none"/><path d="M97 206L126 228L157 205L166 211L128 241L89 213Z" fill="${c.trim}" stroke-width="2.7"/><path d="M126 243L126 255" fill="none" stroke="${c.kitShade}" stroke-width="2"/>`,
    rearHair: path(hair.back, c.hair),
    ears: `<path d="M79 121Q63 111 61 129Q60 148 80 153L88 141Z" fill="${c.skin}"/><path d="M174 123Q189 109 194 127Q199 146 179 153L169 142Z" fill="${c.skin}"/><path d="M72 126Q65 124 68 137L75 142M183 125Q191 121 188 135L181 141" fill="none" stroke="${c.shade}" stroke-width="3.4"/>`,
    head:
      path(h.face, c.skin) +
      path(h.shade, c.shade, 'stroke="none"') +
      path(h.detail, 'none', `stroke="${c.shade}" stroke-width="2.5"`) +
      `<path d="M91 93Q91 78 103 73" fill="none" stroke="${c.light}" stroke-width="5"/>`,
    beardBack: paint(beard.back, c),
    detail: paint(PARTS.detail[s.detail].svg, c),
    hair:
      path(hair.front, c.hair) +
      path(hair.shine, 'none', `stroke="${c.hairLight}" stroke-width="3"`) +
      path(hair.line ?? '', 'none', 'stroke-width="2"'),
    eyes:
      path(eyes.whites, '#f2ead5', 'stroke-width="2.5"') +
      eyes.pupils
        .map(
          ([cx, cy]) =>
            `<ellipse cx="${cx}" cy="${cy}" rx="3.1" ry="4.2" fill="${INK}" stroke="none"/>`,
        )
        .join('') +
      path(eyes.lids, 'none', 'stroke-width="2.5"') +
      path(eyes.brows, c.hair, 'stroke-width="1.5"'),
    nose:
      path(nose.path, c.skin, 'stroke-width="2.7"') +
      path(nose.shade, c.shade, 'stroke="none"') +
      path(nose.line, 'none', 'stroke-width="2"'),
    mouth: paint(PARTS.mouth[s.mouth].svg, c),
    beardFront: paint(beard.front, c),
  };
  const stage = portraitStage(age);
  if (stage === 'academy') {
    // Softer, shorter face with the same core nose/eye/hair recipe; no adult beard.
    layers.head = path(h.face, c.skin) + path(h.shade, c.shade, 'stroke="none"');
    for (const key of ['head', 'ears', 'rearHair', 'hair'])
      layers[key] = `<g transform="translate(5 11) scale(.96 .94)">${layers[key]}</g>`;
    layers.nose = `<g transform="translate(13 13) scale(.9 .91)">${layers.nose}</g>`;
    layers.eyes = `<g transform="translate(-3 -3) scale(1.025)">${layers.eyes}</g>`;
    layers.beardBack = '';
    layers.beardFront = '';
    layers.detail = `<path d="M88 153L99 155M156 154L167 151" fill="none" stroke="${c.blush}" stroke-width="6"/>`;
    // A receding-hair recipe starts with a short fringe in the academy phase.
    if (hair.id === 'receding')
      layers.hair += `<path d="M91 67Q119 47 163 66L155 79L139 73L123 81L109 75L94 84Z" fill="${c.hair}"/>`;
  } else if (stage === 'middle') {
    layers.career = `<path d="M81 133L87 136M173 134L180 130M96 147L108 146M150 145L163 143M107 164L102 172M149 163L157 170M115 203L140 201" fill="none" stroke="${c.shade}" stroke-width="2.3"/>`;
  }
  return layers;
}
export function renderPortrait(spec, { transparent = false, title = '', age } = {}) {
  const s = createPortrait(spec.identity, spec);
  const safeTitle = String(title).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
  const bg = transparent
    ? ''
    : `<rect width="256" height="256" rx="16" fill="${BACKGROUNDS[s.background]}"/><path d="M-30 230L200 0H280L24 256Z" fill="#ffffff" opacity=".13"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"${safeTitle ? ' role="img"' : ''}>${safeTitle ? `<title>${safeTitle}</title>` : ''}${bg}<g stroke="${INK}" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round">${Object.values(portraitLayers(s, { age })).join('')}</g></svg>`;
}

export function portraitDataUrl(identity, overrides, options) {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(renderPortrait(createPortrait(identity, overrides), options))
  );
}

export function portraitCombinationCount() {
  // Excludes shirt and card colors: only identity-bearing visual slots count.
  return ['head', 'hair', 'eyes', 'nose', 'mouth', 'beard', 'detail', 'skin', 'hairColor'].reduce(
    (count, key) => count * slotSizes[key],
    1,
  );
}
