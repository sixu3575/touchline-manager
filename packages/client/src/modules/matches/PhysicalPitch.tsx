import { useEffect, useRef } from 'react';
import type { Report } from '../../model';

export function positionAt(data: Uint16Array, report: Report, time: number) {
  const meta = report.replay!;
  const frame = Math.min(meta.frameCount - 1, time * meta.sampleHz);
  const a = Math.floor(frame),
    b = Math.min(a + 1, meta.frameCount - 1);
  const cut = data[b * meta.stride + 47] === 1;
  const blend = cut ? 0 : frame - a;
  const result = new Float64Array(47);
  for (let i = 0; i < 47; i++) {
    const cm = data[a * meta.stride + i] * (1 - blend) + data[b * meta.stride + i] * blend;
    result[i] = cm / 100 - (i === 45 ? 0 : 5);
  }
  return { positions: result, owner: data[a * meta.stride + 48] - 1 };
}

export function speedAt(data: Uint16Array, report: Report, time: number, index = -1) {
  const meta = report.replay!,
    a = Math.min(meta.frameCount - 2, Math.max(0, Math.floor(time * meta.sampleHz))),
    b = a + 1;
  if (data[b * meta.stride + 47] || data[a * meta.stride + 47]) return 0;
  const x = index < 0 ? 44 : index * 2,
    z = index < 0 ? 46 : index * 2 + 1;
  const dx = (data[b * meta.stride + x] - data[a * meta.stride + x]) / 100,
    dz = (data[b * meta.stride + z] - data[a * meta.stride + z]) / 100;
  const dy = index < 0 ? (data[b * meta.stride + 45] - data[a * meta.stride + 45]) / 100 : 0;
  return Math.hypot(dx, dy, dz) * meta.sampleHz;
}

export function PhysicalPitch({
  data,
  report,
  time,
  selected,
  onSelect,
}: {
  data: Uint16Array;
  report: Report;
  time: number;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef({ time, selected });
  frameRef.current = { time, selected };
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let animation = 0;
    const draw = () => {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sx = width / 115,
        sy = height / 78;
      const x = (n: number) => (n + 5) * sx,
        z = (n: number) => (n + 5) * sy;
      ctx.fillStyle = '#102c23';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#246147' : '#20583f';
        ctx.fillRect(x(i * 10.5), z(0), 10.5 * sx, 68 * sy);
      }
      ctx.strokeStyle = '#c7dfc28c';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x(0), z(0), 105 * sx, 68 * sy);
      ctx.beginPath();
      ctx.moveTo(x(52.5), z(0));
      ctx.lineTo(x(52.5), z(68));
      ctx.stroke();
      const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      };
      ellipse(x(52.5), z(34), 9.15 * sx, 9.15 * sy);
      for (const end of [0, 1]) {
        ctx.strokeRect(x(end === 0 ? 0 : 88.5), z(13.84), 16.5 * sx, 40.32 * sy);
        ctx.strokeRect(x(end === 0 ? 0 : 99.5), z(24.84), 5.5 * sx, 18.32 * sy);
        ctx.fillStyle = '#dce5e118';
        ctx.fillRect(x(end === 0 ? -2 : 105), z(30.34), 2 * sx, 7.32 * sy);
        ctx.strokeStyle = '#dce5e1';
        ctx.strokeRect(x(end === 0 ? -2 : 105), z(30.34), 2 * sx, 7.32 * sy);
        ctx.strokeStyle = '#c7dfc28c';
        ellipse(x(end === 0 ? 11 : 94), z(34), 0.17 * sx, 0.17 * sy);
      }
      const { positions: pos, owner } = positionAt(data, report, frameRef.current.time);
      const radius = Math.max(6, sx * 0.85);
      report.replay!.players.forEach((p, i) => {
        const dismissed = report.performance?.find((row) => row.id === p.id)?.dismissedAt;
        if (dismissed !== null && dismissed !== undefined && frameRef.current.time >= dismissed)
          return;
        const px = x(pos[i * 2]),
          py = z(pos[i * 2 + 1]);
        ctx.fillStyle = '#0005';
        ctx.beginPath();
        ctx.ellipse(px + 1, py + radius * 0.7, radius, radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        if (owner === i || frameRef.current.selected === i) {
          ctx.strokeStyle = frameRef.current.selected === i ? '#fff' : '#e9f995aa';
          ctx.lineWidth = 1.4;
          ellipse(px, py, radius + 3, radius + 3);
        }
        ctx.fillStyle =
          p.role === 'GK' ? (p.side ? '#f3a552' : '#7ba8ff') : p.side ? '#f4ece0' : '#c8ef77';
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#102c23';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#12251b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.max(8, radius * 1.25)}px system-ui`;
        ctx.fillText(String(p.number), px, py + 0.5);
      });
      // Saved ball height displaces only the ball sprite; its shadow stays on the turf.
      const bx = x(pos[44]),
        by = z(pos[46]),
        elevation = Math.max(0, pos[45] - 0.11);
      ctx.fillStyle = '#0008';
      ctx.beginPath();
      ctx.ellipse(bx + 1, by + 2, 4 + elevation, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#24342c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bx, by - Math.min(30, elevation * sy * 0.6), 3.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (elevation > 0.7) {
        ctx.font = '10px system-ui';
        ctx.fillStyle = '#fff';
        ctx.fillText(elevation.toFixed(1) + 'm', bx + 17, by - 13);
      }
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animation);
  }, [data, report]);
  return (
    <canvas
      ref={ref}
      className="physical-pitch"
      aria-label="保存的物理比赛轨迹，22名球员与足球的实际位置"
      role="img"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const point = {
          x: ((e.clientX - rect.left) / rect.width) * 115 - 5,
          z: ((e.clientY - rect.top) / rect.height) * 78 - 5,
        };
        const { positions } = positionAt(data, report, time);
        let closest = -1,
          gap = 4;
        report.replay!.players.forEach((_, i) => {
          const d = Math.hypot(point.x - positions[i * 2], point.z - positions[i * 2 + 1]);
          if (d < gap) {
            gap = d;
            closest = i;
          }
        });
        onSelect(closest);
      }}
    />
  );
}
