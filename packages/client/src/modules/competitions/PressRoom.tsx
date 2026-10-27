import type { ReactNode } from 'react';
import { Newspaper, Monitor, Film } from 'lucide-react';
import './press-room.css';

export function PressRoom({
  active,
  navigate,
  children,
}: {
  active: 'paper' | 'screen' | 'archive';
  navigate: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className={'press-room press-room-' + active} aria-label="俱乐部联赛编辑室">
      <nav className="press-media" aria-label="选择编辑室物件">
        <button
          aria-current={active === 'paper' ? 'page' : undefined}
          onClick={() => navigate('fixtures')}
        >
          <Newspaper size={20} />
          <span>
            翻开体育报<small>积分 · 赛历 · 杯赛</small>
          </span>
        </button>
        <button
          aria-current={active === 'screen' ? 'page' : undefined}
          onClick={() => navigate('league-stats')}
        >
          <Monitor size={20} />
          <span>
            联赛数据大屏<small>射手 · 助攻 · 数据榜</small>
          </span>
        </button>
        <button
          aria-current={active === 'archive' ? 'page' : undefined}
          onClick={() => navigate('my-matches')}
        >
          <Film size={20} />
          <span>
            比赛录像档案<small>本队战报与回放</small>
          </span>
        </button>
      </nav>
      <div
        className={
          'press-medium ' +
          (active === 'screen'
            ? 'broadcast-console'
            : active === 'archive'
              ? 'archive-folder'
              : 'newspaper-desk')
        }
      >
        {active === 'screen' && <h1 className="scene-sr-only">联赛数据大屏</h1>}
        {active === 'screen' && (
          <div className="broadcast-brand">
            <span>● SEASON DATA</span>
            <b>TOUCHLINE SPORTS</b>
            <small>已结算联赛统计</small>
          </div>
        )}
        {active === 'archive' && (
          <h1 className="archive-title">
            比赛档案 <small>TOUCHLINE FILM ARCHIVE</small>
          </h1>
        )}
        {children}
        {active === 'screen' && (
          <div className="broadcast-base" aria-hidden="true">
            <i />
            <i />
            <span>SPORTS / DATA CHANNEL</span>
          </div>
        )}
      </div>
    </section>
  );
}
