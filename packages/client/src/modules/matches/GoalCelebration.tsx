import { useEffect, useState, type CSSProperties } from 'react';
import type { Report } from '../../model';
import { latestGoal, goalDetails } from './goal-presentation.mjs';

export function GoalCelebration({
  report,
  time,
  windowSeconds = 15,
}: {
  report: Report;
  time: number;
  windowSeconds?: number;
}) {
  const event = latestGoal(report, time);
  const goal = event ? goalDetails(report, event) : null;
  const key = goal?.key ?? null;
  const [visible, setVisible] = useState<string | null>(null);
  useEffect(() => {
    if (!goal || time - goal.second > windowSeconds) {
      setVisible(null);
      return;
    }
    setVisible(goal.key);
    const timer = setTimeout(() => setVisible(null), 3200);
    return () => clearTimeout(timer);
  }, [key, report.id]);
  if (!goal || visible !== goal.key) return null;
  return (
    <div
      className="goal-celebration"
      role="status"
      aria-live="polite"
      aria-label="进球提示"
      key={goal.key}
    >
      <div className="goal-confetti" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ '--piece': i } as CSSProperties} />
        ))}
      </div>
      <span className="goal-title">{goal.title}</span>
      <span className="goal-scorer">
        {goal.number !== null && <b className="goal-number">{goal.number}号</b>}
        <strong>{goal.name}</strong>
      </span>
      <span className="goal-team">
        {goal.team}
        {goal.score && ` · ${goal.score}`}
      </span>
      <small>{goal.text}</small>
    </div>
  );
}
