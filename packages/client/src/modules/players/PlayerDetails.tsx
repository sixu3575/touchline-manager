import { CalendarDays, Fingerprint, Globe2, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  ATTRIBUTE_GROUPS,
  INTERESTS,
  MEDIA_STYLES,
  PERSONALITY,
  TRAITS,
  personalityTraits,
} from '../../../../shared/modules/players/index.mjs';
import { Badge, Ovr } from '../../components/ui';
import { money, roles } from '../../constants';
import type { Player } from './model';
import './players.css';
import { footName, nationalityName } from './presentation';

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="pm-meter">
      <span>{label}</span>
      <div>
        <i style={{ width: value + '%' }} />
      </div>
      <b>{value.toFixed(1).replace('.0', '')}</b>
    </div>
  );
}
export function PlayerDetails({ player: p, onClose }: { player: Player; onClose: () => void }) {
  const [tab, setTab] = useState('ability');
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const buttons =
          dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const traits = personalityTraits(p) as string[];
  return (
    <div className="modal-backdrop pm-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="modal pm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-name"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pm-hero">
          <button className="pm-close" onClick={onClose} aria-label="关闭球员档案">
            <X size={21} />
          </button>
          <span className="pm-caption">
            PLAYER DOSSIER <span> / {String(p.number).padStart(2, '0')}</span>
          </span>
          <div className="pm-heading">
            <div className="pm-avatar" aria-hidden="true">
              <span>{p.number}</span>
              <UserRound size={62} strokeWidth={1.3} />
            </div>
            <div>
              <Badge tone="lime">
                {roles[p.role]} · {p.age <= 18 ? '青年球员' : '一线队球员'}
              </Badge>
              <h2 id="pm-name">{p.name}</h2>
              <p>
                <Globe2 size={13} /> {nationalityName(p.nationality)} <span>·</span> {p.age} 岁{' '}
                <span>·</span> {p.heightCm} cm
              </p>
            </div>
            <div className="pm-overall">
              <Ovr player={p} />
              <small>综合能力</small>
            </div>
          </div>
          <div className="pm-identity">
            <span>
              <CalendarDays size={13} /> {p.birthDate} 出生
            </span>
            <span>
              {footName(p.preferredFoot)} · 逆足 {p.weakFoot}
            </span>
            <span>潜力 {p.potential} / 100</span>
          </div>
        </div>
        <div className="pm-facts">
          <div>
            <small>当前体能</small>
            <strong>
              {p.fitness}
              <em>%</em>
            </strong>
          </div>
          <div>
            <small>比赛状态</small>
            <strong>
              {p.form.toFixed(1)}
              <em>/10</em>
            </strong>
          </div>
          <div>
            <small>出场 / 进球</small>
            <strong>
              {p.apps}
              <em>/ {p.goals}</em>
            </strong>
          </div>
          <div>
            <small>轮薪</small>
            <strong>{money(p.wage)}</strong>
          </div>
        </div>
        <div className="pm-tabs" role="tablist" aria-label="球员档案分类">
          <button
            id="pm-ability-tab"
            role="tab"
            aria-selected={tab === 'ability'}
            aria-controls="pm-ability"
            onClick={() => setTab('ability')}
          >
            能力细项 <span>30</span>
          </button>
          <button
            id="pm-character-tab"
            role="tab"
            aria-selected={tab === 'character'}
            aria-controls="pm-character"
            onClick={() => setTab('character')}
          >
            <Fingerprint size={16} /> 性格与生活
          </button>
        </div>
        {tab === 'ability' ? (
          <div id="pm-ability" role="tabpanel" aria-labelledby="pm-ability-tab" className="pm-body">
            <div className="pm-section-title">
              <div>
                <h3>每一种能力，都有用武之地。</h3>
                <p>能力 1–100 · 技术、意识与身体共同决定场上表现</p>
              </div>
              <Badge tone="outline">{roles[p.role]} 档案</Badge>
            </div>
            <div className="pm-attributes">
              {Object.entries(ATTRIBUTE_GROUPS).map(([key, group]) => (
                <section
                  key={key}
                  className={key === 'goalkeeping' && p.role !== 'GK' ? 'pm-secondary-group' : ''}
                >
                  <h4>
                    <span>{group.label}</span>
                    <small>{key.toUpperCase()}</small>
                  </h4>
                  {Object.entries(group.attributes).map(([attr, label]) => (
                    <Meter key={attr} label={String(label)} value={p.attributes[attr]} />
                  ))}
                </section>
              ))}
            </div>
            <p className="pm-note">
              训练根据位置培养细项；年龄和职业态度影响成长速度。综合能力由位置权重计算，潜力限制后续训练成长。
            </p>
          </div>
        ) : (
          <div
            id="pm-character"
            role="tabpanel"
            aria-labelledby="pm-character-tab"
            className="pm-body"
          >
            <div className="pm-section-title">
              <div>
                <h3>球衣之外，也是一个人。</h3>
                <p>稳定的性格，和随经历变化的状态。</p>
              </div>
              <Fingerprint size={25} />
            </div>
            <div className="pm-traits">
              {traits.length ? (
                traits.map((t) => <Badge key={t}>{TRAITS[t as keyof typeof TRAITS]}</Badge>)
              ) : (
                <Badge tone="grey">性格均衡</Badge>
              )}
            </div>
            <div className="pm-character-grid">
              <section>
                <h4>
                  长期性格 <small>0–100 · 越高表示倾向越强</small>
                </h4>
                {Object.entries(PERSONALITY).map(([key, [label, help]]) => (
                  <div key={key} title={help}>
                    <Meter label={label} value={p.personality[key]} />
                  </div>
                ))}
              </section>
              <section className="pm-life">
                <h4>近期状态</h4>
                <Meter label="士气" value={p.wellbeing.morale} />
                <Meter label="信心" value={p.wellbeing.confidence} />
                <Meter label="归属感" value={p.wellbeing.clubAttachment} />
                <h4>公众形象</h4>
                <p>
                  表达风格{' '}
                  <b>{MEDIA_STYLES[p.publicProfile.mediaStyle as keyof typeof MEDIA_STYLES]}</b>
                </p>
                <p>
                  关注度 <b>{p.publicProfile.popularity} / 100</b>
                </p>
                <h4>生活兴趣</h4>
                <div className="pm-traits">
                  {p.publicProfile.interests.map((i) => (
                    <Badge key={i} tone="grey">
                      {INTERESTS[i as keyof typeof INTERESTS]}
                    </Badge>
                  ))}
                </div>
              </section>
            </div>
            <p className="pm-note">
              职业态度已影响训练；士气、信心、归属与关注度会随比赛变化。媒体、兴趣与其余性格用于后续互动和事件，当前不额外带来收入。
            </p>
          </div>
        )}
        <div className="pm-footer">
          <span>
            评估身价 <strong>{money(p.price)}</strong>
          </span>
          <span>每一位球员，都有自己的故事。</span>
        </div>
      </section>
    </div>
  );
}
