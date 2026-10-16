import { COUNTRIES } from '../../../../shared/modules/players/index.mjs';
export const nationalityName = (code: string) =>
  COUNTRIES[code as keyof typeof COUNTRIES]?.name || code;
export const footName = (foot: string) =>
  ({ left: '左脚', right: '右脚', both: '双脚' })[foot] || foot;
