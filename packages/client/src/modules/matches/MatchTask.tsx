import { Play } from 'lucide-react';
import { useBroadcastSecond, type MatchJob } from './useMatchJob';
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
  const second = useBroadcastSecond(job),
    complete = job.status === 'complete',
    failed = job.status === 'failed';
  const minute = Math.min(90, Math.floor(second / 60));
  const clock = `${Math.floor(second / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(second % 60)
    .toString()
    .padStart(2, '0')}`;
  return (
    <section className="match-task" aria-label="实时比赛进度">
      <div className="match-task-copy">
        <span className="eyebrow">MATCH CENTRE</span>
        <h3>
          {complete
            ? '本轮已结束 · 结果已记录'
            : failed
              ? '比赛等待恢复'
              : job.broadcast?.finished
                ? '本场已结束 · 正在确认本轮结果'
                : `比赛进行中 · ${clock} · 5倍速`}
        </h3>
        <p>
          {connection ||
            job.error ||
            (complete
              ? '完整回放已保存，可以自由拖动和调速。'
              : job.broadcast?.buffering
                ? '正在衔接比赛画面，进度会在画面就绪后继续。'
                : '离开观赛或关闭页面，比赛仍按5倍速继续。随时回来加入当前进度。')}
        </p>
        {!complete && (
          <>
            <progress value={Math.min(100, second / 54)} max={100} />
            <small>
              {minute} / 90 分钟{second > 5400 ? ' · 点球大战' : ''} · 全轮结果在比赛结束后统一记录
            </small>
          </>
        )}
      </div>
      <div className="match-task-actions">
        <button className="primary" onClick={complete ? onReplay : failed ? onRetry : onWatch}>
          <Play size={16} />
          {complete ? '查看赛后回放' : failed ? '恢复比赛并观看' : '继续观看比赛'}
        </button>
      </div>
    </section>
  );
}
