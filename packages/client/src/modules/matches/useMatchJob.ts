import { useEffect, useRef, useState } from 'react';
import type { Report } from '../../model';

export interface MatchJob {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  type: string;
  error?: string;
  seq?: number;
  frameCount?: number;
  generatedSeconds?: number;
  ownComplete?: boolean;
  fixturesDone?: number;
  fixturesTotal?: number;
  fixtureSeconds?: number;
  report?: Report;
}
export function useMatchJob(onSettled: () => void) {
  const [job, setJob] = useState<MatchJob | null>(null),
    [data, setData] = useState<Uint16Array | null>(null);
  const [connection, setConnection] = useState(''),
    [retry, setRetry] = useState(0);
  const settled = useRef(''),
    callback = useRef(onSettled);
  callback.current = onSettled;
  const chunks = useRef<{ id: string; parts: Uint16Array[] }>({ id: '', parts: [] });
  useEffect(() => {
    if (!job?.id) return;
    const id = job.id,
      controller = new AbortController();
    let fetching = false,
      again = false;
    if (chunks.current.id !== id) {
      chunks.current = { id, parts: [] };
      setData(null);
    }
    const chunkStore = chunks.current;
    const refresh = async () => {
      if (fetching) {
        again = true;
        return;
      }
      fetching = true;
      try {
        do {
          again = false;
          const response = await fetch('/api/match-jobs/' + id, { signal: controller.signal });
          const payload = await response.json();
          if (!response.ok) throw Error(payload.error);
          const next = payload.job as MatchJob;
          for (let seq = chunkStore.parts.length; seq < (next.seq ?? 0); seq++) {
            const r = await fetch(`/api/match-jobs/${id}/chunks/${seq}`, {
              signal: controller.signal,
            });
            if (!r.ok) throw Error('轨迹片段加载失败，正在重新连接。');
            const bytes = await r.arrayBuffer();
            if (controller.signal.aborted) return;
            if (bytes.byteLength % 98) throw Error('轨迹片段格式无效。');
            const view = new DataView(bytes),
              part = new Uint16Array(bytes.byteLength / 2);
            for (let i = 0; i < part.length; i++) part[i] = view.getUint16(i * 2, true);
            chunkStore.parts.push(part);
          }
          if (controller.signal.aborted) return;
          if (next.report && chunkStore.parts.length) {
            const length = chunkStore.parts.reduce((sum, p) => sum + p.length, 0);
            if (length !== next.report.replay!.frameCount * 49) throw Error('轨迹片段长度不匹配。');
            const track = new Uint16Array(length);
            let cursor = 0;
            for (const p of chunkStore.parts) {
              track.set(p, cursor);
              cursor += p.length;
            }
            setData(track);
          }
          setConnection('');
          setJob(next);
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
    stream.onmessage = () => void refresh();
    stream.onopen = () => {
      setConnection('');
      void refresh();
    };
    stream.onerror = () => setConnection('连接中断，正在自动恢复；服务器继续计算。');
    const fallback = setInterval(() => void refresh(), 15000);
    void refresh();
    return () => {
      controller.abort();
      stream.close();
      clearInterval(fallback);
    };
  }, [job?.id, retry]);
  return { job, data, connection, accept: setJob, reconnect: () => setRetry((n) => n + 1) };
}
