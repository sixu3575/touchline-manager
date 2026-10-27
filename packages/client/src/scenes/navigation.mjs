// Authored courtyard object bounds, as percentages of the 1600 × 1000 canvas.
export const CLUB_OBJECTS = [
  { id: 'training', label: '训练场', x: 25, y: 13, w: 39, h: 19 },
  { id: 'stadium', label: '主场看台', x: 72, y: 1, w: 26, h: 23 },
  { id: 'squad', label: '更衣室', x: 10, y: 43, w: 14, h: 21 },
  { id: 'tactics', label: '战术棚', x: 65, y: 23, w: 11, h: 11 },
  { id: 'finance', label: '财务室', x: 64, y: 45, w: 8, h: 11 },
  { id: 'scouting', label: '球探车', x: 65, y: 58, w: 34, h: 32 },
  { id: 'fixtures', label: '翻开体育报', x: 25, y: 54, w: 8, h: 10 },
  { id: 'league-stats', label: '打开数据电视', x: 33, y: 51, w: 8, h: 10 },
  { id: 'my-matches', label: '比赛档案箱', x: 41, y: 58, w: 6, h: 8 },
  { id: 'club-honours', label: '荣誉柜', x: 46, y: 45, w: 10, h: 12 },
];
/** @type {Record<string, string>} */
export const ROOM_NAMES = {
  overview: '俱乐部院子',
  squad: '更衣室',
  tactics: '战术室',
  fixtures: '联赛编辑室',
  'league-stats': '数据放映室',
  'my-matches': '比赛档案室',
  'club-honours': '荣誉陈列室',
  scouting: '球探工作台',
  training: '训练基地',
  stadium: '主场看台',
  finance: '财务室',
};
