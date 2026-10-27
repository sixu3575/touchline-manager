import { ROOM_NAMES } from './navigation.mjs';

const DESCRIPTIONS: Record<string, [string, string]> = {
  tactics: ["COACH'S SHED", '把首发贴上战术板，把主意带到球场。'],
  training: ['TRAINING GROUND', '场地、教练和每天的进步，都在这里。'],
  scouting: ["SCOUT'S DESK", '翻开候选档案，找到下一位队友。'],
  finance: ['CLUB LEDGER', '收好每一张票据，经营这间小球会。'],
  stadium: ['THE HOME END', '走上看台，筹划下一次满场。'],
};

export function RoomHeading({ view }: { view: string }) {
  const [caption, text] = DESCRIPTIONS[view] ?? ['TOUCHLINE', '走进俱乐部。'];
  return (
    <header className="room-placard">
      <small>{caption}</small>
      <h1 className="room-heading">{ROOM_NAMES[view] ?? '俱乐部'}</h1>
      <p>{text}</p>
    </header>
  );
}
