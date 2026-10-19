import type { Report } from '../../model';

export function staminaAtTime(
  report: Report,
  playerId: string,
  second: number,
  currentOnly?: boolean,
): { energy: number; burstReserve?: number } | undefined;
