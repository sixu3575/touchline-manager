import type { Report } from '../../model';
export function playerEventStatistics(
  report: Report,
  playerId: string,
  second: number,
): {
  goals: number;
  assists: number;
  shots: number;
  onTarget: number | undefined;
  saves: number;
  interceptions: number;
  keyPasses: number;
  fouls: number;
  offsides: number;
  passes: number | undefined;
  completed: number | undefined;
  passCompletion: number | null;
  tackleAttempts: number | undefined;
  tackles: number | undefined;
  wonTackles: number | undefined;
  takeOnAttempts: number | undefined;
  takeOns: number | undefined;
  possessionLost: number | undefined;
  blocks: number | undefined;
  clearances: number | undefined;
};
