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
};
