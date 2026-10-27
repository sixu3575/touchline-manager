import { Check, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { bestLineup } from '../../../../shared/modules/tactics/index.mjs';
import { PanelHead } from '../../components/ui';
import { styleNames } from '../../constants';
import type { Club, Game, Player } from '../../model';
import { Pitch } from '../matches';
import { PlayerPortrait } from '../players';
export function Tactics({
  club,
  act,
  busy,
  onPlayer,
}: {
  club: Club;
  act: (type: string, payload?: Record<string, unknown>) => Promise<Game | undefined>;
  busy: boolean;
  onPlayer: (p: Player) => void;
}) {
  const [formation, setFormation] = useState(club.tactics.formation),
    [style, setStyle] = useState(club.tactics.style),
    [press, setPress] = useState(club.tactics.press),
    [lineup, setLineup] = useState([...club.lineup]);
  const dirty =
    formation !== club.tactics.formation ||
    style !== club.tactics.style ||
    press !== club.tactics.press ||
    [...lineup].sort().join() !== [...club.lineup].sort().join();
  return (
    <div className="tactics-layout">
      <section className="panel tactics-board">
        <PanelHead
          title="首发阵容"
          subtitle={'已选 ' + lineup.length + ' / 11 · 体力为当前可用百分比 · 位置人数须符合阵型'}
        />
        <div className="tactics-pitch">
          <Pitch
            club={{ ...club, tactics: { formation, style, press } }}
            lineup={lineup}
            onPlayer={onPlayer}
            tacticalSlots
            showFitness
          />
        </div>
        <div className="formation-select">
          <label>
            阵型
            <select
              value={formation}
              onChange={(e) => {
                setFormation(e.target.value);
                setLineup(bestLineup(club, e.target.value));
              }}
            >
              {['4-4-2', '4-3-3', '3-5-2'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => setLineup(bestLineup(club, formation))}>
            <RefreshCw size={16} /> 自动排阵
          </button>
        </div>
        <div className="lineup-choices" tabIndex={0} role="group" aria-label="首发与替补球员标签">
          {club.players.map((p) => {
            const fitness = Math.max(0, Math.min(100, Math.round(p.fitness)));
            const fitnessBand = fitness < 50 ? 'low' : fitness < 75 ? 'medium' : 'high';
            return (
              <label
                key={p.id}
                className={'lineup-member ' + (lineup.includes(p.id) ? 'chosen' : '')}
              >
                <input
                  type="checkbox"
                  checked={lineup.includes(p.id)}
                  onChange={() =>
                    setLineup(
                      lineup.includes(p.id)
                        ? lineup.filter((id) => id !== p.id)
                        : [...lineup, p.id],
                    )
                  }
                />
                <PlayerPortrait player={p} size={36} decorative />
                <span className="position-label">{p.role}</span>
                <b>{p.name}</b>
                <span title="总能力值">{p.overall ?? '—'}</span>
                <span
                  className={`lineup-fitness ${fitnessBand}`}
                  title={`当前体力 ${fitness}%`}
                  aria-label={`当前体力 ${fitness}%`}
                >
                  <span className="lineup-fitness-track" aria-hidden="true">
                    <i style={{ width: `${fitness}%` }} />
                  </span>
                  <b>{fitness}%</b>
                </span>
              </label>
            );
          })}
        </div>
      </section>
      <section className="panel tactics-settings">
        <PanelHead title="比赛部署" subtitle="保存后，下场比赛将使用这套方案" />
        <h4>进攻思路</h4>
        {[
          { id: 'balanced', desc: '平衡球权与推进，适合大多数对手。' },
          { id: 'possession', desc: '多点接应与安全推进，保持回传和转移选择。' },
          { id: 'counter', desc: '夺回球权后趁对手未落位快速向前，窗口关闭后重新组织。' },
          { id: 'wide', desc: '分边推进、择机套边与禁区包抄，寻找传中或倒三角。' },
        ].map((s) => (
          <button
            key={s.id}
            className={'tactic-option ' + (style === s.id ? 'selected' : '')}
            onClick={() => setStyle(s.id)}
          >
            <span>
              <strong>{styleNames[s.id]}</strong>
              <small>{s.desc}</small>
            </span>
            <span className="radio">{style === s.id && <i />}</span>
          </button>
        ))}
        <h4>压迫强度</h4>
        <div className="press-options">
          {[
            ['low', '低位防守'],
            ['normal', '适度压迫'],
            ['high', '高位压迫'],
          ].map(([id, label]) => (
            <button
              className={press === id ? 'selected' : ''}
              key={id}
              onClick={() => setPress(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="fine">
          高位压迫提升争夺球权的能力，但体能消耗更大，后段表现可能下降。每场比赛结束后自动恢复部分体能。
        </p>
        <button
          className="primary"
          disabled={busy || lineup.length !== 11 || !dirty}
          onClick={() => void act('tactics', { formation, style, press, lineup })}
        >
          <Check size={17} />
          {dirty ? '保存战术与阵容' : '战术已保存'}
        </button>
        <p className="fine">
          阵型板悬停球员可查看位置职责。未保存的调整只在本页显示，切换页面后将恢复已保存方案。
        </p>
      </section>
    </div>
  );
}
