export function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = () => a >>> 0;
  next.restore = (state) => {
    a = state >>> 0;
  };
  return next;
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const decimal = (n) => Math.round(n * 10) / 10;
export function seedFrom(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function addDays(iso, days) {
  const date = new Date(iso + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const seasonStart = (season) => `${2025 + season}-07-01`;
