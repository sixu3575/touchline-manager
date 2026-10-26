// Authored courtyard object bounds, as percentages of the 1600 × 1000 canvas.
export const CLUB_OBJECTS = [
  { id: 'training', label: '训练场', x: 29, y: 7, w: 25, h: 18 },
  { id: 'stadium', label: '主场看台', x: 61, y: 2, w: 37, h: 24 },
  { id: 'squad', label: '更衣室', x: 13, y: 28, w: 18, h: 23 },
  { id: 'tactics', label: '战术棚', x: 39, y: 31, w: 13, h: 20 },
  { id: 'finance', label: '财务室', x: 79, y: 34, w: 20, h: 22 },
  { id: 'scouting', label: '球探车', x: 1, y: 56, w: 30, h: 33 },
  { id: 'fixtures', label: '翻开体育报', x: 40, y: 67, w: 11, h: 14 },
  { id: 'league-stats', label: '打开数据电视', x: 51, y: 63, w: 9, h: 14 },
  { id: 'my-matches', label: '比赛档案箱', x: 61, y: 76, w: 7, h: 13 },
  { id: 'club-honours', label: '荣誉柜', x: 79, y: 62, w: 20, h: 30 },
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
