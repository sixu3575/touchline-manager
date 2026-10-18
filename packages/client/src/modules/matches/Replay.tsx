import type { Report } from '../../model';
import { useArchivedReport } from './useArchivedReport';
import { LegacyReplay } from './LegacyReplay';
import { PhysicalReplay } from './PhysicalReplay';
export function Replay(props: { report: Report; onClose: () => void }) {
  const { report, error, retry } = useArchivedReport(props.report);
  if (!report)
    return (
      <div className="modal-backdrop">
        <section className="modal live-empty" role="dialog" aria-label="读取比赛战报">
          <h2>{error ? '战报读取失败' : '正在读取保存的比赛战报'}</h2>
          <p>{error || '详细事件、球员统计与轨迹保存在服务器。'}</p>
          {error && (
            <button className="primary" onClick={retry}>
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
