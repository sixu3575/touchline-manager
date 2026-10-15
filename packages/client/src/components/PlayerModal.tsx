import { X, Users } from 'lucide-react';
import type { Player } from '../model';
import { roles, skills, money } from '../constants';
import { Badge, Ovr } from './ui';
export function PlayerModal({ player, onClose }: { player: Player; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal player-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="关闭球员资料">
          <X />
        </button>
        <div className="player-portrait">
          <span>{player.number}</span>
          <Users size={70} />
        </div>
        <Badge>
          {roles[player.role]} · {player.age} 岁
        </Badge>
        <h2>{player.name}</h2>
        <div className="player-summary">
          <Ovr player={player} />
          <div>
            <strong>综合能力</strong>
            <p>
              潜力评估 {player.potential} · 状态 {player.form.toFixed(1)}
            </p>
          </div>
        </div>
        {Object.entries(skills).map(([key, label]) => (
          <div className="skill-row" key={key}>
            <span>{label}</span>
            <div className="bar">
              <i style={{ width: player.skills[key] + '%' }} />
            </div>
            <b>{Math.round(player.skills[key])}</b>
          </div>
        ))}
        <div className="player-foot">
          <span>
            身价 <b>{money(player.price)}</b>
          </span>
          <span>
            轮薪 <b>{money(player.wage)}</b>
          </span>
          <span>
            体能 <b>{player.fitness}%</b>
          </span>
        </div>
      </section>
    </div>
  );
}
