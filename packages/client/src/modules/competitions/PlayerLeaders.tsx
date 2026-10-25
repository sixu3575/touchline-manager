import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Empty, PanelHead } from '../../components/ui';
import './player-leaders.css';

interface LeaderPlayer {
  id: string;
  name: string;
  number: number | null;
  role: string;
  clubName: string;
  appearances: number;
  minutes: number;
  goals: number;
  ownGoals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  keyPasses: number;
  passes: number;
  completedPasses: number;
  passAccuracy: number | null;
  wonTackles: number;
  interceptions: number;
  saves: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  fouls: number;
  offsides: number;
  takeOns: number;
  blocks: number;
  clearances: number;
  possessionLost: number;
  averageRating: number | null;
  ratedAppearances: number;
}

interface LeaderData {
  season: number | null;
  completedMatches: number;
  availableMatches: number;
  missingMatches: number;
  complete: boolean;
  metricCoverage: Record<string, number>;
  players: LeaderPlayer[];
}

const categories: {
  id: keyof LeaderData['metricCoverage'];
  label: string;
  stat: keyof LeaderPlayer;
  unit?: string;
  decimal?: boolean;
  hint?: string;
  eligible?: (player: LeaderPlayer) => boolean;
}[] = [
  { id: 'goals', label: '射手榜', stat: 'goals', unit: '球' },
  { id: 'ownGoals', label: '乌龙球', stat: 'ownGoals', unit: '球' },
  { id: 'assists', label: '助攻榜', stat: 'assists', unit: '次' },
  { id: 'appearances', label: '出场榜', stat: 'appearances', unit: '场' },
  { id: 'minutes', label: '出场时间', stat: 'minutes', unit: '分钟' },
  { id: 'shots', label: '射门榜', stat: 'shots', unit: '次' },
  {
    id: 'shotsOnTarget',
    label: '射正榜',
    stat: 'shotsOnTarget',
    unit: '次',
    hint: '统计射正与进球，不把被封堵的射门算作射正。',
  },
  { id: 'xg', label: '预期进球 xG', stat: 'xg', unit: 'xG', decimal: true },
  { id: 'keyPasses', label: '关键传球', stat: 'keyPasses', unit: '次' },
  { id: 'passes', label: '传球次数', stat: 'passes', unit: '次' },
  { id: 'completedPasses', label: '成功传球', stat: 'completedPasses', unit: '次' },
  {
    id: 'passes',
    label: '传球成功率',
    stat: 'passAccuracy',
    unit: '%',
    hint: '至少完成20次传球后进入榜单。',
    eligible: (player) => player.passes >= 20,
  },
  { id: 'wonTackles', label: '成功抢断', stat: 'wonTackles', unit: '次' },
  { id: 'interceptions', label: '拦截榜', stat: 'interceptions', unit: '次' },
  { id: 'takeOns', label: '成功过人', stat: 'takeOns', unit: '次' },
  { id: 'possessionLost', label: '丢失球权', stat: 'possessionLost', unit: '次' },
  { id: 'blocks', label: '封堵榜', stat: 'blocks', unit: '次' },
  { id: 'clearances', label: '解围榜', stat: 'clearances', unit: '次' },
  { id: 'saves', label: '扑救榜', stat: 'saves', unit: '次', eligible: (p) => p.role === 'GK' },
  {
    id: 'cleanSheets',
    label: '零封榜',
    stat: 'cleanSheets',
    unit: '场',
    hint: '门将和后卫出场至少60分钟且在场期间球队未失球，计一次零封。',
    eligible: (p) => p.role === 'GK' || p.role === 'DEF',
  },
  { id: 'yellowCards', label: '黄牌榜', stat: 'yellowCards', unit: '张' },
  { id: 'redCards', label: '红牌榜', stat: 'redCards', unit: '张' },
  { id: 'fouls', label: '犯规榜', stat: 'fouls', unit: '次' },
  { id: 'offsides', label: '越位榜', stat: 'offsides', unit: '次' },
  {
    id: 'averageRating',
    label: '平均评分',
    stat: 'averageRating',
    decimal: true,
    hint: '只对本赛季已记录的赛后评分取平均，未评分的短时出场不计入。',
  },
];

const roleName: Record<string, string> = { GK: '门将', DEF: '后卫', MID: '中场', FWD: '前锋' };

export function PlayerLeaders({ season, revision }: { season: number; revision: number }) {
  const [data, setData] = useState<LeaderData | null>(null),
    [selectedId, setSelectedId] = useState('goals:goals'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');

  const load = (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    void fetch('/api/league-player-leaders', { signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error || '联赛球员榜单暂时无法读取。');
        setData(body as LeaderData);
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message || '连接失败，请重试。');
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [season, revision]);

  const category =
    categories.find((item) => item.id + ':' + item.stat === selectedId) ?? categories[0];
  const rows = useMemo(() => {
    if (!data) return [];
    const prepared = data.players
      .filter((player) => player.appearances > 0 && (category.eligible?.(player) ?? true))
      .map((player) => ({ player, value: player[category.stat] }))
      .filter(
        (item): item is { player: LeaderPlayer; value: number } =>
          typeof item.value === 'number' &&
          Number.isFinite(item.value) &&
          (item.value > 0 || category.stat === 'passAccuracy'),
      )
      .sort(
        (a, b) =>
          b.value - a.value ||
          b.player.appearances - a.player.appearances ||
          a.player.name.localeCompare(b.player.name, 'zh-CN'),
      );
    let previous: number | undefined,
      rank = 0;
    return prepared.map((item, index) => {
      if (previous === undefined || item.value !== previous) rank = index + 1;
      previous = item.value;
      return { ...item, rank };
    });
  }, [category, data]);

  const metricCoverage = data?.metricCoverage[category.id] ?? 0;
  const metricComplete = data && metricCoverage >= data.completedMatches;
  const displayValue = (value: number) => {
    const formatted = category.decimal
      ? value.toFixed(1)
      : Math.round(value).toLocaleString('zh-CN');
    if (category.stat === 'passAccuracy') return formatted + '%';
    if (category.unit === '分钟') return formatted + '′';
    return category.unit ? formatted + ' ' + category.unit : formatted;
  };

  return (
    <section className="panel player-leaders" aria-label="联赛球员统计榜单">
      <PanelHead
        title="先锋联赛 · 球员榜单"
        subtitle={'第 ' + season + ' 赛季 · 仅统计已结算联赛，不包含城市挑战杯'}
      />
      <div className="leader-toolbar">
        <div className="leader-coverage" role="status">
          <b>
            {data?.availableMatches ?? 0} / {data?.completedMatches ?? 0}
          </b>
          <span>场比赛有可用的球员明细</span>
        </div>
        <label>
          <span>选择榜单</span>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            aria-label="选择球员数据榜单"
          >
            {categories.map((item) => (
              <option key={item.id + ':' + item.stat} value={item.id + ':' + item.stat}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary leader-refresh" onClick={() => load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'leader-spinning' : ''} />
          刷新
        </button>
      </div>
      <p className="leader-rule">
        {category.hint ?? '按本赛季联赛比赛的累计统计排序；同数据按出场次数排序。'}
      </p>
      {error ? (
        <div className="leader-empty">
          <p>{error}</p>
          <button className="secondary" onClick={() => load()} disabled={loading}>
            重新加载
          </button>
        </div>
      ) : loading && !data ? (
        <div className="leader-empty" role="status">
          正在整理本赛季联赛数据…
        </div>
      ) : data?.completedMatches === 0 ? (
        <Empty>联赛还没有完成比赛，赛后榜单会自动更新。</Empty>
      ) : rows.length ? (
        <>
          {(!data?.complete || !metricComplete) && (
            <p className="leader-note" role="note">
              当前榜单的详细统计覆盖 {metricCoverage} / {data?.completedMatches ?? 0}{' '}
              场。旧战报缺少的项目不按零补算，排名可能随完整战报增加而变化。
            </p>
          )}
          <div className="leader-table-wrap">
            <table className="leader-table">
              <thead>
                <tr>
                  <th scope="col">排名</th>
                  <th scope="col">球员</th>
                  <th scope="col">俱乐部</th>
                  <th scope="col">出场</th>
                  <th scope="col" className="leader-value-heading">
                    {category.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ player, value, rank }) => (
                  <tr key={player.id}>
                    <td>
                      <span className={'leader-rank ' + (rank <= 3 ? 'top' : '')}>{rank}</span>
                    </td>
                    <td>
                      <div className="leader-player-name">
                        <b>{player.name}</b>
                        <small>
                          {player.number === null ? '' : '#' + player.number + ' · '}
                          {roleName[player.role] ?? player.role}
                        </small>
                      </div>
                    </td>
                    <td className="leader-club">{player.clubName}</td>
                    <td>{player.appearances}</td>
                    <td className="leader-value">{displayValue(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {data && !data.complete && (
            <p className="leader-note" role="note">
              当前赛季有 {data.completedMatches} 场比赛已结算，但仅 {data.availableMatches}{' '}
              场保留了球员明细。缺失场次不按零补算。
            </p>
          )}
          <Empty>当前榜单还没有可展示的数据。</Empty>
        </>
      )}
    </section>
  );
}
