import { useEffect, useState } from 'react';
import type { Report } from '../../model';

/** Load saved details only; callers decide whether to display a report or play a replay. */
export function useArchivedReport(summary: Report) {
  const [loaded, setLoaded] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!summary.detailsStored) return;
    const controller = new AbortController();
    setError('');
    setLoaded(null);
    fetch('/api/reports/' + encodeURIComponent(summary.id), { signal: controller.signal })
      .then(async (response) => {
        const report = await response.json();
        if (!response.ok) throw Error(report.error);
        if (
          report.id !== summary.id ||
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
  }, [summary.id, summary.detailsStored, attempt]);
  return {
    report: summary.detailsStored ? (loaded?.id === summary.id ? loaded : null) : summary,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}
