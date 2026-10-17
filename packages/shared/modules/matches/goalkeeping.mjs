import { ability } from './skills.mjs';
// Engineering parameters for a reaction gate, distinct from outfield tactical scanning.
export const keeperReaction = (player) => 0.12 + (100 - ability(player, 'reflexes')) / 600;
export const diveResponse = (player) => 2.3 + 0.018 * ability(player, 'oneOnOnes');
