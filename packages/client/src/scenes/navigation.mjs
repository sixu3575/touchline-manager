// Authored courtyard object bounds, as percentages of the 1600 × 1000 canvas.
export const CLUB_OBJECTS = [
  { id: 'training', label: '训练场', x: 8, y: 4, w: 39, h: 21 },
  { id: 'stadium', label: '主场看台', x: 54, y: 2, w: 43, h: 31 },
  { id: 'squad', label: '更衣室', x: 5, y: 29, w: 29, h: 31 },
  { id: 'tactics', label: '战术棚', x: 35, y: 30, w: 33, h: 32 },
  { id: 'finance', label: '财务室', x: 70, y: 34, w: 28, h: 31 },
  { id: 'scouting', label: '球探车', x: 1, y: 63, w: 34, h: 32 },
  { id: 'fixtures', label: '翻开体育报', x: 39, y: 79, w: 19, h: 14 },
  { id: 'league-stats', label: '打开数据电视', x: 42, y: 63, w: 17, h: 16 },
  { id: 'my-matches', label: '比赛档案箱', x: 60, y: 78, w: 13, h: 17 },
  { id: 'club-honours', label: '荣誉柜', x: 79, y: 65, w: 20, h: 31 },
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
