import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Compass, Home, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Game } from '../model';
import { money } from '../constants';
import { version as APP_VERSION } from '../../../../package.json';
import { ROOM_NAMES } from './navigation.mjs';

export function SceneHeader({
  game,
  view,
  nav,
  navigate,
  onSettings,
  busy,
}: {
  game: Game;
  view: string;
  nav: { id: string; label: string; icon: LucideIcon }[];
  navigate: (id: string) => void;
  onSettings: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);
  const go = (id: string) => {
    setOpen(false);
    navigate(id);
  };
  return (
    <>
      <header className="club-chrome">
        <button
          className="club-home"
          onClick={() => go('overview')}
          aria-label={view === 'overview' ? '俱乐部院子' : '返回俱乐部院子'}
        >
          {view === 'overview' ? <Home size={20} /> : <ArrowLeft size={20} />}
          <span>
            <b>TOUCHLINE</b>
            <small>
              {['127.0.0.1', 'localhost'].includes(window.location.hostname) ? '本地预览 · ' : ''}
              {game.clubs[0].name}
            </small>
          </span>
        </button>
        <div className="room-location">
          <span aria-hidden="true">/</span>
          <b>{ROOM_NAMES[view] ?? '俱乐部'}</b>
        </div>
        <div className="club-clock">
          <span>{game.gameDate}</span>
          <b>
            第{game.season}赛季 · 已赛{game.round}轮
          </b>
        </div>
        <button className="club-cash" onClick={() => go('finance')} aria-label="进入财务室">
          {money(game.cash)}
        </button>
        <span className="club-save">
          <CheckCircle2 size={14} />
          {busy ? '保存中' : '已存档'}
        </span>
        <button
          ref={trigger}
          className={'wayfinder-trigger ' + (open ? 'is-open' : '')}
          aria-expanded={open}
          aria-controls="club-wayfinder"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={18} /> : <Compass size={18} />}
          <span>去哪里</span>
        </button>
        <button className="club-settings" onClick={onSettings} aria-label="俱乐部设置">
          M
        </button>
      </header>
      {open && (
        <>
          <button
            className="wayfinder-scrim"
            aria-label="关闭俱乐部导览"
            onClick={() => setOpen(false)}
          />
          <nav id="club-wayfinder" className="club-wayfinder" aria-label="俱乐部快捷导览">
            <span className="wayfinder-title">
              俱乐部导览 <small>随时回院子，再走进一个房间。</small>
            </span>
            {nav.map((item) => (
              <button
                key={item.id}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <item.icon size={18} />
                {ROOM_NAMES[item.id] ?? item.label}
              </button>
            ))}
            <small className="wayfinder-version">独立存档 · AI 联赛 · v{APP_VERSION}</small>
          </nav>
        </>
      )}
    </>
  );
}
