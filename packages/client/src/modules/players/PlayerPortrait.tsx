import { memo, useMemo } from 'react';
import { portraitDataUrl, portraitStage, portraitStageLabel } from './portraits/generator.mjs';
import './portraits/portraits.css';

export const PlayerPortrait = memo(function PlayerPortrait({
  player,
  size = 56,
  className = '',
  decorative = false,
}: {
  player: { id: string; name?: string; role?: string; age?: number };
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const src = useMemo(
    () => portraitDataUrl(player.id, { kit: player.role === 'GK' ? 3 : 0 }, { age: player.age }),
    [player.id, player.role, player.age],
  );
  return (
    <img
      className={'pm-portrait ' + className}
      src={src}
      width={size}
      height={size}
      alt={decorative ? '' : `${player.name || '球员'}的大头照 · ${portraitStageLabel(player.age)}`}
      data-career-stage={portraitStage(player.age)}
      decoding="async"
      draggable={false}
    />
  );
});
