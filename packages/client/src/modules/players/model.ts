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
  attributes: Record<string, number>;
  skills: Record<string, number>;
  personality: Record<string, number>;
  wellbeing: { morale: number; confidence: number; clubAttachment: number };
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
