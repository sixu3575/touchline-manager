export function rename(g, payload, rng) {
  const me = g.clubs[0];

  const name = String(payload.name || '').trim();
  if (name.length < 2 || name.length > 18 || /[<>\u0000-\u001f]/.test(name))
    throw Error('队名需要 2–18 个字符。');
  me.name = name;
}
