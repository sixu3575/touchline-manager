export interface Player {
  id: string;
  name: string;
  role: string;
  age: number;
  skills: Record<string, number>;
  fitness: number;
  potential: number;
  number: number;
  wage: number;
  price: number;
  goals: number;
  apps: number;
  form: number;
}
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
  minute: number;
  type: string;
  text: string;
  side: number;
  x: number;
  y: number;
  playerId?: string;
}
export interface Report {
  id: string;
  engineVersion: string;
  seed: number;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  score: number[];
  stats: { shots: number; onTarget: number; xg: number; possession: number }[];
  events: MatchEvent[];
  snapshots: { id: string; name: string; tactics: Club['tactics']; players: Player[] }[];
  competition: string;
  round: number;
  penalties?: number[];
}
export interface Game {
  schemaVersion: number;
  seed: number;
  revision: number;
  createdAt: string;
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
