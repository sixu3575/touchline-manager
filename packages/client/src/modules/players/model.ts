export interface Player {
  id: string;
  name: string;
  role: string;
  age: number;
  birthDate: string;
  nationality: string;
  preferredFoot: 'left' | 'right' | 'both';
  weakFoot: number;
  heightCm: number;
  // Authoritative public overall, separate from assessed compatibility skills.
  overall: number | null;
  // Server DTO: no real attributes, even when an assessment is exact.
  assessment: {
    version: number;
    source: string;
    level: number;
    stage: number;
    observations: number;
    asOf: string;
    lastScouted: string | null;
    bands: Record<string, { min: number; max: number } | null>;
    overview: { key: string; label: string; value: number | null }[];
    peaks?: Record<string, number>;
  };
  // Compatibility estimates for auto lineup, never true skills.
  skills: Record<string, number>;
  personality: Record<string, number>;
  wellbeing: { morale: number; confidence: number; clubAttachment: number; adaptation: number };
  publicProfile: { mediaStyle: string; interests: string[]; popularity: number };
  fitness: number;
  potential: number;
  number: number;
  wage: number;
  price: number;
  goals: number;
  assists: number;
  apps: number;
  form: number;
}
