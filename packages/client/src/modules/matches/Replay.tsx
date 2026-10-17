import type { Report } from '../../model';
import { useEffect, useState } from 'react';
import { LegacyReplay } from './LegacyReplay';
import { PhysicalReplay } from './PhysicalReplay';
export function Replay(props: { report: Report; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!props.report.detailsStored) return;
    const controller = new AbortController();
    setError('');
    setLoaded(null);
    fetch('/api/reports/' + encodeURIComponent(props.report.id), { signal: controller.signal })
      .then(async (response) => {
        const report = await response.json();
        if (!response.ok) throw Error(report.error);
        if (
          report.id !== props.report.id ||
          !Array.isArray(report.events) ||
          report.snapshots?.length !== 2
        )
          throw Error('战报格式不匹配。');
        if (!controller.signal.aborted) setLoaded(report);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [props.report.id, props.report.detailsStored, retry]);
  const report = props.report.detailsStored ? loaded : props.report;
  if (!report)
    return (
      <div className="modal-backdrop">
        <section className="modal live-empty" role="dialog" aria-label="读取比赛战报">
          <h2>{error ? '战报读取失败' : '正在读取保存的比赛战报'}</h2>
          <p>{error || '详细事件、球员统计与轨迹保存在服务器。'}</p>
          {error && (
            <button className="primary" onClick={() => setRetry((n) => n + 1)}>
              重新加载
            </button>
          )}
          <button className="secondary" onClick={props.onClose}>
            关闭战报
          </button>
        </section>
      </div>
    );
  return report.replay ? (
    <PhysicalReplay report={report} onClose={props.onClose} />
  ) : (
    <LegacyReplay report={report} onClose={props.onClose} />
  );
}
