import { useEffect, useState } from 'react';
import { styleNames } from '../../constants';
import type { MatchJob } from './useMatchJob';

export type LiveCommand =
  | { type: 'tactics'; formation: string; style: string; press: string }
  | { type: 'substitution'; playerOutId: string; playerInId: string };

export function LiveManagerBoard({
  job,
  onCommand,
}: {
  job: MatchJob;
  onCommand: (command: LiveCommand) => Promise<void>;
}) {
  const manager = job.manager;
  const [formation, setFormation] = useState(manager?.tactics.formation ?? '4-4-2');
  const [style, setStyle] = useState(manager?.tactics.style ?? 'balanced');
  const [press, setPress] = useState(manager?.tactics.press ?? 'normal');
  const [playerOutId, setPlayerOutId] = useState('');
  const [playerInId, setPlayerInId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!manager) return;
    setFormation(manager.tactics.formation);
    setStyle(manager.tactics.style);
    setPress(manager.tactics.press);
  }, [manager?.tactics.formation, manager?.tactics.style, manager?.tactics.press]);
  if (!manager || job.ownComplete) return null;
  const activePlayerIds = manager.roles?.map((player) => player.id) ?? manager.lineup;
  const activePlayers = activePlayerIds
      .map((id) => manager.players.find((player) => player.id === id))
      .filter((player): player is NonNullable<typeof player> => Boolean(player)),
    outgoing = manager.players.find((player) => player.id === playerOutId),
    substitutes = manager.players.filter(
      (player) =>
        player.role === outgoing?.role &&
        !activePlayerIds.includes(player.id) && !manager.lineup.includes(player.id),
    ),
    disabled =
      busy ||
      Boolean(manager.pending) ||
      job.status === 'failed' ||
      Boolean(manager.simulationComplete);
  const send = async (command: LiveCommand) => {
    setBusy(true);
    setError('');
    try {
      await onCommand(command);
    } catch (cause) {
      setError((cause as Error).message || '临场指令没有送达，请重试。');
    } finally {
      setBusy(false);
    }
  };
  const tacticalRoleById = new Map((manager.roles ?? []).map((player) => [player.id, player.role]));
  const formationRows = ['FWD', 'MID', 'DEF', 'GK'].map((role) =>
    activePlayers.filter((player) => (tacticalRoleById.get(player.id) ?? player.role) === role),
  );
  return (
    <section className="live-manager" aria-label="临场战术板与换人">
      <div className="live-manager-heading">
        <div>
          <b>临场指挥</b>
          <small>
            {manager.usedSubstitutions}/5 次换人 · 指令在下一模拟片段生效
            {manager.simulationComplete && ' · 模拟已到终场，剩余画面正在播放'}
          </small>
        </div>
        {manager.pending && <span className="live-manager-pending">指令生效中</span>}
      </div>
      <div className="live-tactic-board" aria-label={`${formation}阵型球员站位示意`}>
        {formationRows.map((players, row) => (
          <div className="live-tactic-line" key={row}>
            {players.map((player) => (
              <span key={player.id} title={`${player.number}号 ${player.name}`}>
                <i className={row === formationRows.length - 1 ? 'keeper' : ''}>
                  {player.number}
                </i>
                <small>{player.name.slice(-4)}</small>
              </span>
            ))}
          </div>
        ))}
        <span>{formation}</span>
      </div>
      <div className="live-manager-fields">
        <label>
          阵型
          <select value={formation} onChange={(event) => setFormation(event.target.value)}>
            {['4-4-2', '4-3-3', '3-5-2'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          战术风格
          <select value={style} onChange={(event) => setStyle(event.target.value)}>
            {Object.entries(styleNames).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          压迫
          <select value={press} onChange={(event) => setPress(event.target.value)}>
            <option value="low">低位防守</option>
            <option value="normal">均衡压迫</option>
            <option value="high">高压逼抢</option>
          </select>
        </label>
      </div>
      <button
        className="live-manager-action"
        disabled={disabled}
        onClick={() => void send({ type: 'tactics', formation, style, press })}
      >
        应用阵型与战术
      </button>
      <div className="live-substitution">
        <b>换人</b>
        <div className="live-manager-fields">
          <label>
            换下
            <select
              value={playerOutId}
              onChange={(event) => {
                setPlayerOutId(event.target.value);
                setPlayerInId('');
              }}
            >
              <option value="">选择场上球员</option>
              {activePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.number}号 · {player.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            换上
            <select
              value={playerInId}
              onChange={(event) => setPlayerInId(event.target.value)}
              disabled={!outgoing}
            >
              <option value="">选择同位置替补</option>
              {substitutes.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.number}号 · {player.name} · 体能 {player.fitness}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="live-manager-action secondary"
          disabled={disabled || !playerOutId || !playerInId || manager.usedSubstitutions >= 5}
          onClick={() => void send({ type: 'substitution', playerOutId, playerInId })}
        >
          确认换人
        </button>
      </div>
      {error && <p className="live-manager-error" role="alert">{error}</p>}
      {manager.commands.length > 0 && (
        <div className="live-manager-history" aria-label="临场指令记录">
          {manager.commands.slice(-3).reverse().map((command) => (
            <small key={command.requestId}>
              {command.summary} · {command.status}
            </small>
          ))}
        </div>
      )}
    </section>
  );
}
