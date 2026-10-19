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
  assistId?: string;
  shotId?: number;
  actionId?: number;
  receiverId?: string;
  destination?: { x: number; z: number };
  keyPassId?: string;
  outcome?: string;
  scorer?: { id: string; number?: number; name: string; side: number };
  score?: number[];
  penalties?: number[];
  ownGoal?: boolean;
  reason?: string;
  intent?: string;
  delivery?: 'lofted' | 'low' | 'cutback';
  phase?: string;
  setPiece?: string;
  decision?: string;
  estimatedSuccess?: number;
  result?: string;
  probability?: number;
  quality?:
    | number
    | {
        value: number;
        base: number;
        foot: number;
        pressure: number;
        pressureLoss: number;
        lapse: boolean;
        mental?: number;
      };
  opponentQuality?: number;
}
export interface Report {
  season?: number;
  canReplay?: boolean;
  legacySummary?: boolean;
  playerRatings?: {
    version: string;
    baseline: number;
    minimum: number;
    maximum: number;
    rows: {
      id: string;
      name: string;
      number: number | null;
      role: string;
      side: number;
      minutes: number;
      rating: number | null;
      coverage: string;
      goals: number;
      assists: number;
      shots: number;
      xg: number;
      keyPasses: number;
      chancesCreated?: number;
      progressivePasses: number;
      passes: number;
      completed: number;
      carryDistance: number;
      tackles: number;
      wonTackles: number;
      interceptions: number;
      saves: number;
      penaltySaves: number;
      conceded: number;
      ownGoals: number;
      penaltyMisses: number;
      yellowCards: number;
      redCards: number;
      fouls: number;
      miscontrols: number;
      categories: { key: string; label: string; value: number }[];
      unratedReason: string | null;
    }[];
  };
  detailsStored?: boolean;
  abandoned?: boolean;
  timeline?: {
    second: number;
    stats: Report['stats'];
    performance: NonNullable<Report['performance']>;
  }[];
  continuity?: {
    controlledSeconds: number[];
    looseSeconds: number;
    contestedSeconds: number;
    deadSeconds: number;
    chains: number[][];
    restarts: number;
    boxEntries: number[];
    turnovers: Record<string, number>;
    possessions?: { side: number; start: number; end: number; seconds: number; reason: string }[];
    controlSpells?: {
      side: number;
      playerId: string;
      role: string;
      start: number;
      end: number;
      seconds: number;
      reason: string;
      looseCarryCause?: string;
      ballSeparationAtEndMetres?: number;
      ballHeightAtEndMetres?: number;
      relativeSpeedAtEndMetresPerSecond?: number;
      controlAgeAtEndSeconds?: number;
      intentKindAtEnd?: string | null;
      intentModeAtEnd?: string | null;
      intentRemainingAtEndSeconds?: number | null;
      carryRecoveryRemainingAtEndSeconds?: number | null;
      controlRadiusAtEndMetres?: number;
      relativeSpeedLimitAtEndMetresPerSecond?: number;
    }[];
  };
  replay?: {
    format: string;
    sampleHz: number;
    stride: number;
    frameCount: number;
    duration: number;
    clockScale?: number;
    regulationDuration?: number;
    physics: string;
    stepHz: number;
    players: {
      id: string;
      side: number;
      number: number;
      name: string;
      role: string;
      positionRole?: string;
    }[];
  };
  performance?: {
    id: string;
    side: number;
    distance: number;
    energy: number;
    touches: number;
    passes: number;
    completed: number;
    style?: string;
    positionRole?: string;
    dribbleTouches?: number;
    carryDistance?: number;
    throughBalls?: number;
    longPasses?: number;
    oneTouchPasses?: number;
    maxSpeed?: number;
    tackles?: number;
    wonTackles?: number;
    yellowCards?: number;
    redCards?: number;
    dismissedAt?: number | null;
    mind?: { morale: number; confidence: number };
  }[];
  id: string;
  engineVersion: string;
  rulesVersion?: string;
  eventFormatVersion?: number;
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
    fouls?: number;
    offsides?: number;
    yellowCards?: number;
    redCards?: number;
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
  assessment: { version: number; coach: number; scout: number };
  schemaVersion: number;
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
  staff: { version: number; employees: StaffPerson[]; market: StaffPerson[] };
  training: {
    used: number;
    version: number;
    facilities: Record<string, number>;
    assignments: Record<string, { playerIds: string[]; coachId: string | null }>;
    history: TrainingRound[];
    lastResolved: string | null;
  };
  market: Player[];
  ledger: { id: string; season: number; round: number; label: string; amount: number }[];
  trophies: { season: number; title: string }[];
  cup: { stage: number; eliminated: boolean; wins: number };
  lastMessage: string;
}
export interface StaffPerson {
  id: string;
  kind: 'coach' | 'scout';
  name: string;
  age: number;
  nationality: string;
  attributes: Record<string, number>;
  wage: number;
}
export interface TrainingRound {
  season: number;
  round: number;
  date: string;
  cost: number;
  rows: {
    playerId: string;
    name: string;
    number: number;
    fieldId: string;
    coachName: string | null;
    status: string;
    changes: { attribute: string; delta: number; reason: string }[];
  }[];
}
