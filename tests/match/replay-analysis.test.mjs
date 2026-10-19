import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReplay } from '../../packages/shared/modules/matches/replay-analysis.mjs';

function fixture() {
  const players = Array.from({ length: 22 }, (_, index) => ({
    id: 'p' + index,
    side: index < 11 ? 0 : 1,
    role:
      index % 11 === 0
        ? 'GK'
        : index % 11 <= 4
          ? 'DEF'
          : index % 11 <= 8
            ? 'MID'
            : 'FWD',
  }));
  const trajectory = new Uint16Array(49 * 51);
  for (let frame = 0; frame < 51; frame++) {
    for (let index = 0; index < 22; index++) {
      const withinSide = index % 11;
      const x = index < 11
        ? withinSide >= 9
          ? 80
          : withinSide <= 4
            ? 30
            : 20
        : withinSide >= 9
          ? 20
          : withinSide <= 4
            ? 82
            : 60;
      const z = withinSide >= 9 ? 34 : 34 + (withinSide % 3) * 2;
      trajectory[frame * 49 + index * 2] = Math.round((x + 5) * 100);
      trajectory[frame * 49 + index * 2 + 1] = Math.round((z + 5) * 100);
    }
  }
  const snapshots = [0, 1].map((side) => ({
    players: players
      .filter((player) => player.side === side)
      .map((player) => ({ id: player.id, role: player.role, fitness: 100 })),
  }));
  return {
    trajectory,
    report: {
      replay: {
        format: 'positions-u16-v1',
        stride: 49,
        sampleHz: 5,
        frameCount: 51,
        duration: 10,
        regulationDuration: 10,
        players,
      },
      snapshots,
      performance: players.map((player) => ({
        id: player.id,
        side: player.side,
        energy: 76,
      })),
      continuity: {
        possessions: [
          { side: 0, start: 0, end: 3, seconds: 3, reason: 'turnover' },
          { side: 1, start: 5, end: 10, seconds: 5, reason: 'fulltime' },
        ],
        controlSpells: [
          { side: 0, playerId: 'p9', role: 'FWD', start: 2, end: 2.5, seconds: 0.5, reason: 'shot' },
          { side: 1, playerId: 'p20', role: 'FWD', start: 6, end: 7, seconds: 1, reason: 'looseCarry' },
        ],
        chains: [[1, 2], [3]],
        turnovers: { interception: 2, dispossessed: 4, looseCarry: 3 },
      },
      events: [
        {
          type: 'pass',
          side: 0,
          second: 1,
          minute: 0,
          x: (21 / 105) * 100,
          y: 50,
          receiverId: 'p9',
          actionId: 1,
          destination: { x: 30, z: 34 },
        },
        {
          type: 'passComplete',
          side: 0,
          second: 2,
          minute: 0,
          x: (30 / 105) * 100,
          y: 50,
          playerId: 'p9',
          actionId: 1,
        },
        {
          type: 'shot',
          side: 0,
          second: 2.5,
          minute: 0,
          x: (80 / 105) * 100,
          playerId: 'p9',
          quality: { pressure: 0 },
        },
        {
          type: 'pass',
          side: 1,
          second: 6,
          minute: 0,
          x: (60 / 105) * 100,
          y: 50,
          destination: { x: 70, z: 34 },
        },
      ],
    },
  };
}

test('replay analysis measures possession, pass direction, nearby pressure and fatigue without mutation', () => {
  const { report, trajectory } = fixture();
  const before = structuredClone(report);
  const analysis = analyzeReplay(report, trajectory);
  assert.deepEqual(report, before);
  assert.equal(analysis.status, 'available');
  assert.equal(analysis.teams[0].possessionMedianSeconds, 3);
  assert.equal(analysis.teams[0].forwardPasses, 1);
  assert.equal(analysis.teams[1].forwardPasses, 1, 'side attack direction is reversed after the break');
  assert.equal(analysis.teams[0].shotsWithDefenderWithinThreeMetres, 1);
  assert.equal(analysis.teams[0].shotsTwentyToTwentyEightMetres, 1);
  assert.equal(analysis.teams[0].passCompletions, 1);
  assert.equal(analysis.teams[0].receptionsWithDefenderWithinThreeMetres, 1);
  assert.equal(analysis.teams[0].individualControlCount, 1);
  assert.equal(analysis.teams[0].controlEndsByShot, 1);
  assert.equal(analysis.teams[1].controlEndsByLooseCarry, 1);
  assert.ok(analysis.teams[1].medianBallSeparationAtLooseCarryMetres > 0);
  assert.equal(analysis.match.defensiveMidfieldGapMeanMetres, 16);
  assert.equal(analysis.match.averageEndingEnergy, 76);
  assert.equal(analysis.match.averageEnergyDrop, 24);
  assert.equal(analysis.match.turnovers.dispossessed, 4);
});

test('old summaries without a replay trajectory are clearly unavailable', () => {
  assert.deepEqual(analyzeReplay({}, null), {
    status: 'missing',
    reason: '这场比赛没有可分析的完整回放轨迹。',
  });
});

test('invalid trajectory geometry is rejected instead of silently producing misleading measurements', () => {
  const { report } = fixture();
  assert.throws(() => analyzeReplay(report, new Uint16Array(8)), /geometry/);
});

test('older reports without possession and pass-chain archives show unavailable values, not zero', () => {
  const { report, trajectory } = fixture();
  delete report.continuity.possessions;
  delete report.continuity.controlSpells;
  delete report.continuity.chains;
  const analysis = analyzeReplay(report, trajectory);
  assert.equal(analysis.teams[0].possessionCount, null);
  assert.equal(analysis.teams[0].possessionMedianSeconds, null);
  assert.equal(analysis.teams[0].completedPassChainMedian, null);
  assert.equal(analysis.teams[0].individualControlCount, null);
  assert.equal(analysis.match.possessionCount, null);
});
