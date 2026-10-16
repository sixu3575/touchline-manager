import type { Player } from './modules/players';
export type { Player } from './modules/players';
export interface Standing {
  id: string;
  name: string;
  color: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}
export interface Club {
  id: string;
  name: string;
  color: string;
  players: Player[];
  tactics: { formation: string; style: string; press: string };
  lineup: string[];
}
export interface MatchEvent {
  second?: number;
  minute: number;
  type: string;
  text: string;
  side: number;
  x: number;
  y: number;
  playerId?: string;
}
export interface Report {
  replay?: {
    format: string;
    sampleHz: number;
    stride: number;
    frameCount: number;
    duration: number;
    clockScale?: number;
    physics: string;
    stepHz: number;
    players: { id: string; side: number; number: number; name: string; role: string }[];
  };
  performance?: {
    id: string;
    side: number;
    distance: number;
    energy: number;
    touches: number;
    passes: number;
    completed: number;
  }[];
  id: string;
  engineVersion: string;
  seed: number;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  score: number[];
  stats: {
    shots: number;
    onTarget: number;
    xg: number;
    possession: number;
    passes?: number;
    completedPasses?: number;
    saves?: number;
    interceptions?: number;
    corners?: number;
  }[];
  events: MatchEvent[];
  // Historical v1 snapshots intentionally lack the newer identity/personality fields.
  snapshots: { id: string; name: string; tactics: Club['tactics']; players: ArchivedPlayer[] }[];
  competition: string;
  round: number;
  penalties?: number[];
}
export type ArchivedPlayer = Pick<
  Player,
  | 'id'
  | 'name'
  | 'role'
  | 'age'
  | 'skills'
  | 'fitness'
  | 'potential'
  | 'number'
  | 'goals'
  | 'apps'
  | 'form'
> &
  Partial<Player>;
export interface Game {
  schemaVersion: number;
  seed: number;
  revision: number;
  createdAt: string;
  gameDate: string;
  season: number;
  round: number;
  clubs: Club[];
  schedule: string[][][];
  results: { id: string; homeId: string; awayId: string; score: number[]; round: number }[];
  reports: Report[];
  cash: number;
  fans: number;
  stadium: { level: number; capacity: number; ticket: number };
  training: { used: number };
  market: Player[];
  ledger: { id: string; season: number; round: number; label: string; amount: number }[];
  trophies: { season: number; title: string }[];
  cup: { stage: number; eliminated: boolean; wins: number };
  lastMessage: string;
}
