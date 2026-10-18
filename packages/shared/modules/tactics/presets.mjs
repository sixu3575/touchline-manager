// Shared tactical policy; these are opportunity weights, never outcome probabilities.
export const positionRoleNames = Object.freeze({
  keeper: '门将',
  centreBack: '中后卫',
  fullback: '边后卫',
  holdingMid: '保护中场',
  centralMid: '中前卫',
  wideMid: '边前卫',
  wingBack: '翼卫',
  winger: '边锋',
  striker: '中锋',
});
const presets = {
  balanced: { width: 1, pass: 0, flank: 0, delivery: 0.025, carry: 1 },
  possession: { width: 1.08, pass: 0.06, flank: 0.015, delivery: 0.025, carry: 0.85 },
  counter: { width: 1.05, pass: 0.02, flank: 0.015, delivery: 0.035, carry: 1 },
  wide: { width: 1.18, pass: 0, flank: 0.09, delivery: 0.09, carry: 1 },
};
for (const preset of Object.values(presets)) Object.freeze(preset);
Object.freeze(presets);
export function tacticalPreset(style) {
  return presets[style] ?? presets.balanced;
}

const layouts = {
  '4-3-3': {
    GK: [[5, 34, 'keeper']],
    DEF: [
      [27, 10, 'fullback'],
      [27, 26, 'centreBack'],
      [27, 42, 'centreBack'],
      [27, 58, 'fullback'],
    ],
    MID: [
      [45, 34, 'holdingMid'],
      [53, 23, 'centralMid'],
      [53, 45, 'centralMid'],
    ],
    FWD: [
      [70, 12, 'winger'],
      [73, 34, 'striker'],
      [70, 56, 'winger'],
    ],
  },
  '4-4-2': {
    GK: [[5, 34, 'keeper']],
    DEF: [
      [27, 10, 'fullback'],
      [27, 26, 'centreBack'],
      [27, 42, 'centreBack'],
      [27, 58, 'fullback'],
    ],
    MID: [
      [49, 11, 'wideMid'],
      [45, 28, 'holdingMid'],
      [52, 40, 'centralMid'],
      [49, 57, 'wideMid'],
    ],
    FWD: [
      [72, 27, 'striker'],
      [72, 41, 'striker'],
    ],
  },
  '3-5-2': {
    GK: [[5, 34, 'keeper']],
    DEF: [
      [27, 18, 'centreBack'],
      [27, 34, 'centreBack'],
      [27, 50, 'centreBack'],
    ],
    MID: [
      [47, 9, 'wingBack'],
      [53, 23, 'centralMid'],
      [44, 34, 'holdingMid'],
      [53, 45, 'centralMid'],
      [47, 59, 'wingBack'],
    ],
    FWD: [
      [72, 27, 'striker'],
      [72, 41, 'striker'],
    ],
  },
};
/** Runtime slots follow the saved lineup order within each broad position. */
export function formationSlot(name, role, index, count) {
  const slot = layouts[name]?.[role]?.[index];
  return slot
    ? { x: slot[0], z: slot[1], positionRole: slot[2] }
    : {
        x: { GK: 5, DEF: 27, MID: 49, FWD: 70 }[role],
        z: 8 + ((index + 0.5) / count) * 52,
        positionRole: role,
      };
}
