import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  latestGoal,
  goalDetails,
} from '../packages/client/src/modules/matches/goal-presentation.mjs';

const report = {
  id: 'saved-game',
  homeName: '主队',
  awayName: '客队',
  snapshots: [{ players: [{ id: 'a', name: '旧档前锋', number: 9 }] }, { players: [] }],
  events: [
    { type: 'goal', second: 20, minute: 0, side: 0, playerId: 'a', text: '旧档进球' },
    {
      type: 'goal',
      second: 60,
      minute: 1,
      side: 1,
      ownGoal: true,
      score: [1, 1],
      scorer: { id: 'b', number: 4, name: '后卫', side: 0 },
      text: '后卫乌龙',
    },
    {
      type: 'penaltyGoal',
      second: 100,
      minute: 91,
      side: 0,
      playerId: 'a',
      penalties: [3, 2],
      text: '罚进点球',
    },
  ],
};
test('goal announcements use only goals reached by the playback clock', () => {
  assert.equal(latestGoal(report, 19.9), null);
  assert.equal(latestGoal(report, 20), report.events[0]);
  assert.equal(latestGoal(report, 59), report.events[0]);
  assert.equal(latestGoal(report, 60), report.events[1]);
  assert.equal(latestGoal(report, 0), null, 'rewinding must hide an already seen future goal');
});
test('historical snapshots supply scorer identity and only the score at that goal', () => {
  const goal = goalDetails(report, report.events[0]);
  assert.equal(goal.name, '旧档前锋');
  assert.equal(goal.number, 9);
  assert.equal(goal.score, '1 : 0');
  assert.equal(goal.title, '进球！');
});
test('own goals retain the actual defender identity and the benefiting team', () => {
  const goal = goalDetails(report, report.events[1]);
  assert.equal(goal.name, '后卫');
  assert.equal(goal.number, 4);
  assert.equal(goal.title, '乌龙球');
  assert.equal(goal.team, '客队');
  assert.equal(goal.score, '1 : 1');
});
test('shootout goals identify penalties and missing identity never invents a shirt number', () => {
  const goal = goalDetails(report, report.events[2]);
  assert.equal(goal.title, '点球罚进');
  assert.equal(goal.score, '3 : 2');
  const unknown = goalDetails(report, { type: 'goal', minute: 2, side: 1, text: '进球' });
  assert.equal(unknown.number, null);
  assert.equal(unknown.name, '进球球员');
});
