import { eventFilterLabels } from './event-filter.mjs';

export function EventFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label="事件筛选"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="event-filter"
    >
      {Object.entries(eventFilterLabels).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function EmptyEvents({ filter }: { filter: string }) {
  const label = eventFilterLabels[filter as keyof typeof eventFilterLabels] ?? '关键事件';
  return <p className="fine">当前时刻暂无{filter === 'all' ? '事件' : label}。</p>;
}
