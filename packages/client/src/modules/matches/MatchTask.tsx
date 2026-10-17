import { Play, RefreshCw, RotateCcw } from 'lucide-react';
import type { MatchJob } from './useMatchJob';
import './task.css';
export function MatchTask({
  job,
  connection,
  onWatch,
  onReplay,
  onRetry,
}: {
  job: MatchJob;
  connection: string;
  onWatch: () => void;
  onReplay: () => void;
  onRetry: () => void;
}) {
  const complete = job.status === 'complete',
    failed = job.status === 'failed';
  const done = job.fixturesDone ?? 0,
    total = job.fixturesTotal ?? (job.type === 'cup' ? 1 : 4);
  const progress = Math.min(100, (100 * (done + (job.fixtureSeconds ?? 0) / 5400)) / total);
  return (
    <section className="match-task" aria-label="比赛计算任务">
      <div className="match-task-copy">
        <span className="eyebrow">MATCH CENTRE</span>
        <h3>
          {failed
            ? '比赛等待恢复'
            : complete
              ? '本轮已结算 · 回放就绪'
              : job.ownComplete
                ? '本队比赛已完成 · 本轮结算中'
                : job.status === 'queued'
                  ? '比赛已排队 · 等待计算'
                  : '比赛正在进行'}
        </h3>
        <p>
          {connection ||
            job.error ||
            (complete
              ? '完整轨迹已经保存，可拖动进度和调整播放速度。'
              : '可以继续浏览俱乐部或离开页面，回来后会恢复同一场比赛。')}
        </p>
        {!complete && (
          <>
            <progress value={progress} max={100} />
            <small>
              本队轨迹 {Math.min(90, Math.floor((job.generatedSeconds ?? 0) / 60))} / 90 分钟
              {job.report?.penalties ? '＋点球' : ''} · 本轮完成 {done} / {total} 场
            </small>
          </>
        )}
      </div>
      <div className="match-task-actions">
        <button className="primary" onClick={onWatch}>
          <Play size={16} />
          {complete ? '观看保存画面' : '进入实时观看'}
        </button>
        {complete && (
          <button className="secondary" onClick={onReplay}>
            完整回放
          </button>
        )}
        {failed && (
          <button className="secondary" onClick={onRetry}>
            <RotateCcw size={16} />
            恢复原场比赛
          </button>
        )}
        {!complete && !failed && (
          <span>
            <RefreshCw className="spin" size={14} /> 后台计算中
          </span>
        )}
      </div>
    </section>
  );
}
