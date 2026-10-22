import type { Report } from '../../model';

export function TeamAbility({ report, side }: { report: Report; side: number }) {
  const row = report.teamAbility?.[side];
  return (
    <span
      className="team-starting-ability"
      title="本场首发11名球员的实际总能力值平均，四舍五入取整数"
    >
      <span>平均能力</span>
      <b className={row?.value == null ? 'unrecorded' : ''}>
        {row?.value == null ? '未记录' : row.value}
      </b>
    </span>
  );
}
