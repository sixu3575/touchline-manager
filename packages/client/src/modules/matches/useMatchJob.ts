import { useEffect, useRef, useState } from 'react';
import type { Report } from '../../model';

export interface MatchJob {
  id: string;
  status: 'queued' | 'running' | 'airing' | 'complete' | 'failed';
  type: string;
  error?: string;
  ownComplete?: boolean;
  frameCount?: number;
  report?: Report;
  receivedAt?: number;
  broadcast?: {
    speed: number;
    seconds: number;
    serverNow: number;
    started: boolean;
    finished: boolean;
    buffering: boolean;
  };
}
export function liveSecond(job: MatchJob) {
  const clock = job.broadcast;
  if (!clock) return 0;
  return (
    clock.seconds +
    (clock.started && !clock.finished && !clock.buffering
      ? (Math.max(0, performance.now() - (job.receivedAt ?? performance.now())) / 1000) *
        clock.speed
      : 0)
  );
}
export function useBroadcastSecond(job: MatchJob) {
  const [second, setSecond] = useState(() => liveSecond(job));
  useEffect(() => {
    setSecond(liveSecond(job));
    const timer = setInterval(() => setSecond(liveSecond(job)), 250);
    return () => clearInterval(timer);
  }, [job.broadcast, job.receivedAt]);
  return second;
}

export function useMatchJob(onSettled: () => void, watching: boolean) {
  const [job, setJob] = useState<MatchJob | null>(null),
    [data, setData] = useState<Uint16Array | null>(null);
  const [connection, setConnection] = useState(''),
    [retry, setRetry] = useState(0);
  const settled = useRef(''),
    callback = useRef(onSettled);
  callback.current = onSettled;
  const track = useRef({ id: '', values: new Uint16Array(0), length: 0 });
  const stamp = (value: MatchJob) => ({ ...value, receivedAt: performance.now() });
  useEffect(() => {
    if (!job?.id) return;
    const id = job.id,
      controller = new AbortController();
    let fetching = false,
      again = false,
      lastFetch = 0;
    if (track.current.id !== id) {
      track.current = { id, values: new Uint16Array(0), length: 0 };
      setData(null);
    }
    const current = track.current;
    const refresh = async (force = false) => {
      if (fetching) {
        again = true;
        return;
      }
      if (!force && Date.now() - lastFetch < 900) return;
      fetching = true;
      try {
        do {
          again = false;
          lastFetch = Date.now();
          const response = await fetch('/api/match-jobs/' + id, { signal: controller.signal });
          const payload = await response.json();
          if (!response.ok) throw Error(payload.error);
          const next = payload.job as MatchJob;
          if (watching && next.report) {
            const from = current.length / 49;
            const r = await fetch(`/api/match-jobs/${id}/frames?from=${from}`, {
              signal: controller.signal,
            });
            if (!r.ok) throw Error('画面加载中，正在重新连接。');
            const bytes = await r.arrayBuffer();
            if (controller.signal.aborted) return;
            const end = Number(r.headers.get('X-Frame-End'));
            if (bytes.byteLength % 98 || end !== from + bytes.byteLength / 98)
              throw Error('轨迹片段格式无效。');
            const length = end * 49;
            if (current.values.length < length) {
              const grown = new Uint16Array(Math.max(length, current.values.length * 2, 49 * 1000));
              grown.set(current.values.subarray(0, current.length));
              current.values = grown;
            }
            const view = new DataView(bytes);
            for (let i = 0; i < bytes.byteLength / 2; i++)
              current.values[current.length + i] = view.getUint16(i * 2, true);
            current.length = length;
            if (length) {
              setData(current.values.subarray(0, length));
              next.report = {
                ...next.report,
                replay: {
                  ...next.report.replay!,
                  frameCount: end,
                  duration: (end - 1) / next.report.replay!.sampleHz,
                },
              };
            }
          }
          if (controller.signal.aborted) return;
          setConnection('');
          setJob(stamp(next));
          if (next.status === 'complete') {
            stream.close();
            clearInterval(fallback);
            if (settled.current !== id) {
              settled.current = id;
              callback.current();
            }
          }
        } while (again && !controller.signal.aborted);
      } catch (e) {
        if (!controller.signal.aborted) setConnection((e as Error).message);
      } finally {
        fetching = false;
      }
    };
    const stream = new EventSource('/api/match-jobs/' + id + '/events');
    stream.onmessage = (event) => {
      try {
        const summary = JSON.parse(event.data) as MatchJob;
        if (summary.id !== id || controller.signal.aborted) return;
        setJob((previous) => (previous?.id === id ? stamp({ ...previous, ...summary }) : previous));
        if (watching || summary.status === 'complete') void refresh(summary.status === 'complete');
      } catch {
        setConnection('正在重新同步比赛进度。');
      }
    };
    stream.onopen = () => {
      setConnection('');
      void refresh(true);
    };
    stream.onerror = () => setConnection('连接恢复中；比赛按原进度继续。');
    const fallback = setInterval(() => void refresh(), watching ? 3000 : 15000);
    void refresh(true);
    return () => {
      controller.abort();
      stream.close();
      clearInterval(fallback);
    };
  }, [job?.id, retry, watching]);
  return {
    job,
    data,
    connection,
    accept: (next: MatchJob | null) => setJob(next ? stamp(next) : null),
    reconnect: () => setRetry((n) => n + 1),
  };
}
