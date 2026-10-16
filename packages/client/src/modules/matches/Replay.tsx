import type { Report } from '../../model';
import { LegacyReplay } from './LegacyReplay';
import { PhysicalReplay } from './PhysicalReplay';
export function Replay(props: { report: Report; onClose: () => void }) {
  return props.report.replay ? <PhysicalReplay {...props} /> : <LegacyReplay {...props} />;
}
