export const money = (n: number) => (n < 0 ? '−' : '') + '£' + Math.abs(n).toLocaleString('en-GB');

export const roles: Record<string, string> = { GK: '门将', DEF: '后卫', MID: '中场', FWD: '前锋' };

export const skills: Record<string, string> = {
  pace: '速度',
  shooting: '射门',
  passing: '传球',
  defending: '防守',
  stamina: '耐力',
  keeping: '门将',
};

export const styleNames: Record<string, string> = {
  balanced: '均衡推进',
  possession: '控球组织',
  counter: '快速反击',
  wide: '边路进攻',
};
