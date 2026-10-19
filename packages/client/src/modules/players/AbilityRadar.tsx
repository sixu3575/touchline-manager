import type { Player } from './model';

// The server's six public summaries are the only plot input; no hidden estimates.
export function AbilityRadar({ player, compact = false }: { player: Player; compact?: boolean }) {
  const stats = player.assessment.overview;
  const point = (i: number, radius: number) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    return [100 + Math.cos(angle) * radius, 78 + Math.sin(angle) * radius];
  };
  const polygon = (radius: number) => stats.map((_, i) => point(i, radius).join(',')).join(' ');
  const known = stats.length === 6 && stats.every((s) => s.value !== null);
  const description = stats.map((s) => `${s.label} ${s.value ?? '未知'}`).join('，');
  return (
    <svg
      className={'ability-radar' + (compact ? ' compact' : '')}
      viewBox="0 0 200 156"
      role="img"
      aria-label={'六维能力图：' + description}
    >
      <title>{description}</title>
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={polygon(49 * r)} className="radar-grid" />
      ))}
      {stats.map((s, i) => {
        const [x, y] = point(i, 49);
        return <line key={s.key} x1="100" y1="78" x2={x} y2={y} className="radar-grid" />;
      })}
      {known && (
        <polygon
          className="radar-shape"
          points={stats.map((s, i) => point(i, (49 * s.value!) / 100).join(',')).join(' ')}
        />
      )}
      {stats.map((s, i) => {
        const [x, y] = point(i, 69);
        return (
          <text key={s.key} x={x} y={y} textAnchor="middle" className="radar-label">
            <tspan x={x} dy="-2">
              {s.label}
            </tspan>
            <tspan x={x} dy="12" className="radar-value">
              {s.value ?? '—'}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
