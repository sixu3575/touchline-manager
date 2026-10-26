import { CalendarDays, Fingerprint, Globe2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  ATTRIBUTE_GROUPS,
  INTERESTS,
  MEDIA_STYLES,
  PERSONALITY,
  TRAITS,
  personalityTraits,
  ASSESSMENT_STAGES,
  cardDetailGroups,
} from '../../../../shared/modules/players/index.mjs';
import { Badge, Ovr } from '../../components/ui';
import { money, roles } from '../../constants';
import type { Player } from './model';
import './players.css';
import { footName, nationalityName } from './presentation';
import { AbilityRadar } from './AbilityRadar';
import { PlayerPortrait } from './PlayerPortrait';
import { portraitStageLabel } from './portraits/generator.mjs';

const attributeLabels = Object.assign(
  {},
  ...Object.values(ATTRIBUTE_GROUPS).map((g) => g.attributes),
) as Record<string, string>;

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="pm-meter">
      <span>{label}</span>
      <div>
        <i style={{ width: value + '%' }} />
      </div>
      <b>{Math.round(value)}</b>
    </div>
  );
}
const bandText = (band: { min: number; max: number } | null | undefined) =>
  !band ? '待观察' : band.min === band.max ? String(band.min) : `${band.min}–${band.max}`;
function AbilityBand({ player, attr }: { player: Player; attr: string }) {
  const band = player.assessment.bands[attr];
  return (
    <div className="assessment-band" data-attribute={attr}>
      <span>{attributeLabels[attr]}</span>
      <div>
        {band && (
          <i style={{ left: `${band.min}%`, width: `${Math.max(1, band.max - band.min)}%` }} />
        )}
      </div>
      <b>{bandText(band)}</b>
      {player.assessment.peaks?.[attr] !== undefined && (
        <small className="ability-peak">
          已确认峰值 {player.assessment.peaks[attr]}
          {band?.min === band?.max && band && band.min < player.assessment.peaks[attr]
            ? ` · 较峰值 −${player.assessment.peaks[attr] - band.min}`
            : ''}
        </small>
      )}
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
            <PlayerPortrait player={p} size={128} decorative />
            <div>
              <Badge tone="lime">
                {roles[p.role]} · {portraitStageLabel(p.age)}阶段
              </Badge>
              <h2 id="pm-name">{p.name}</h2>
              <p>
                <Globe2 size={13} /> {nationalityName(p.nationality)} <span>·</span> {p.age} 岁{' '}
                <span>·</span> {p.heightCm} cm
              </p>
            </div>
            <div className="pm-overall">
              <Ovr player={p} />
              <small>总能力值</small>
            </div>
          </div>
          <div className="pm-identity">
            <span>
              <CalendarDays size={13} /> {p.birthDate} 出生
            </span>
            <span>
              {footName(p.preferredFoot)} · 逆足 {bandText(p.assessment.bands.weakFoot)}
            </span>
            <span>潜力 {bandText(p.assessment.bands.potential)}</span>
          </div>
        </div>
        <div className="pm-radar-summary">
          <AbilityRadar player={p} />
          <div>
            <h3>六项主属性</h3>
            <p>以 100 为满值，形状展示能力特点。</p>
            <p>下方按主属性分组，查看对应细项。</p>
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
                <h3>
                  {ASSESSMENT_STAGES[p.assessment.stage]} ·{' '}
                  {p.assessment.source === 'coach' ? '教练' : '球探'} Lv.{p.assessment.level}
                </h3>
                <p>
                  截至 {p.assessment.asOf} · 累计 {p.assessment.observations} 次观察 ·
                  区间表示了解程度，待观察不等于能力为零
                </p>
              </div>
              <Badge tone="outline">{roles[p.role]} 档案</Badge>
            </div>
            <div className="pm-attributes">
              {cardDetailGroups(p.role).map((group) => (
                <section key={group.key} data-ability-group={group.key}>
                  <h4>
                    <span>{group.label}</span>
                    <b>{p.assessment.overview.find((s) => s.key === group.key)?.value ?? '—'}</b>
                  </h4>
                  {group.attributes.map((attr: string) => (
                    <AbilityBand key={attr} attr={attr} player={p} />
                  ))}
                  {group.supplement && (
                    <details className="pm-supplement">
                      <summary>{group.supplement.label}</summary>
                      {group.supplement.attributes.map((attr) => (
                        <AbilityBand key={attr} attr={attr} player={p} />
                      ))}
                    </details>
                  )}
                </section>
              ))}
            </div>
            <p className="pm-note">
              总能力值按位置使用真实能力计算；六项概览是公开加权摘要，并非组内细项的简单平均。细项按主要用途归类，跨项影响不重复列出。教练与球探仍决定细项可见范围；自动排阵继续参考已知区间，比赛使用全部真实细项。门将展示专属六项。
            </p>
            <details className="pm-note">
              <summary>待适配属性（当前未启用）</summary>
              <p>
                独立弹跳、弧线、凌空抽射、滑铲、射门力量、点球专精、侵略性和花式技巧暂未建立独立属性或完整机制，不参与六项汇总或比赛。现有头球、力量、终结/定位球和盘带承担部分相关行为；后续接入时须同步算法和决策图。
              </p>
            </details>
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
                <Meter label="适应度" value={p.wellbeing.adaptation ?? 100} />
                <p className="fine">
                  士气、信心与适应度仅小幅影响镇定和决策（−4 至 +3）。国籍不影响适应。
                </p>
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
              职业态度影响训练；领导力与抗挫缓冲负面冲击，进取心改变末段落后时的风险选择，情绪稳定影响抗议判罚。忠诚、社交、媒体与兴趣留给后续互动，当前不额外带来竞技加成或收入。
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
