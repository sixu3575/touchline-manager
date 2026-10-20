const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => (values.length ? sum(values) / values.length : null);
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * q)] : null;
};

function sideSummary(report, side, possessions, shots, passes, receptionPressure, controlSpells) {
  const hasPossessionArchive = Array.isArray(report.continuity?.possessions);
  const hasControlArchive = Array.isArray(report.continuity?.controlSpells);
  const teamControl = controlSpells.filter((row) => row.side === side);
  const looseCarryCauses = Object.fromEntries(
    ['airborne', 'outsideRadius', 'carryRecoveryExpired', 'noCarryIntent', 'relativeSpeed', 'other'].map(
      (cause) => [
        cause,
        teamControl.filter((row) => row.reason === 'looseCarry' && row.looseCarryCause === cause)
          .length,
      ],
    ),
  );
  const teamPossessions = possessions.filter((row) => row.side === side);
  const durations = teamPossessions.map((row) => row.seconds);
  const teamShots = shots.filter((row) => row.side === side);
  const shotPossessions = teamPossessions.map((possession) => ({
    ...possession,
    shots: teamShots.filter(
      (shot) => shot.second >= possession.start && shot.second <= possession.end,
    ).length,
  }));
  const chain = report.continuity?.chains?.[side] ?? [];
  const teamPasses = passes.filter((row) => row.side === side && row.direction);
  const totalPasses = teamPasses.length;
  const teamEvents = (report.events ?? []).filter((event) => event.side === side);
  const burstShots = teamShots.filter((shot, index) =>
    teamShots.some(
      (other, otherIndex) => otherIndex !== index && Math.abs(other.second - shot.second) <= 30,
    ),
  ).length;
  return {
    possessionCount: hasPossessionArchive ? teamPossessions.length : null,
    possessionMedianSeconds: quantile(durations, 0.5),
    possessionP90Seconds: quantile(durations, 0.9),
    possessionsUnderFiveSeconds: hasPossessionArchive
      ? teamPossessions.filter((row) => row.seconds < 5).length
      : null,
    possessionsOverFifteenSeconds: hasPossessionArchive
      ? teamPossessions.filter((row) => row.seconds > 15).length
      : null,
    individualControlCount: hasControlArchive ? teamControl.length : null,
    individualControlMedianSeconds: hasControlArchive
      ? quantile(teamControl.map((row) => row.seconds), 0.5)
      : null,
    individualControlMeanSeconds: hasControlArchive
      ? mean(teamControl.map((row) => row.seconds))
      : null,
    controlEndsByPass: hasControlArchive
      ? teamControl.filter((row) => ['pass', 'cross', 'clearance'].includes(row.reason)).length
      : null,
    controlEndsByShot: hasControlArchive
      ? teamControl.filter((row) => row.reason === 'shot').length
      : null,
    controlEndsByDispossession: hasControlArchive
      ? teamControl.filter((row) => row.reason === 'dispossessed').length
      : null,
    controlEndsByLooseCarry: hasControlArchive
      ? teamControl.filter((row) => row.reason === 'looseCarry').length
      : null,
    looseCarryCauses: hasControlArchive ? looseCarryCauses : null,
    medianBallSeparationAtLooseCarryMetres: quantile(
      teamControl
        .filter((row) => row.reason === 'looseCarry')
        .map((row) => row.ballSeparationAtEndMetres)
        .filter(Number.isFinite),
      0.5,
    ),
    medianBallHeightAtLooseCarryMetres: quantile(
      teamControl
        .filter((row) => row.reason === 'looseCarry')
        .map((row) => row.ballHeightAtEndMetres)
        .filter(Number.isFinite),
      0.5,
    ),
    shareLooseCarryAboveControlHeight: mean(
      teamControl
        .filter((row) => row.reason === 'looseCarry' && Number.isFinite(row.ballHeightAtEndMetres))
        .map((row) => Number(row.ballHeightAtEndMetres > 1.3)),
    ),
    medianRelativeSpeedAtLooseCarryMetresPerSecond: quantile(
      teamControl
        .filter((row) => row.reason === 'looseCarry')
        .map((row) => row.relativeSpeedAtEndMetresPerSecond)
        .filter(Number.isFinite),
      0.5,
    ),
    medianNearestDefenderAtDispossessionMetres: quantile(
      teamControl
        .filter((row) => row.reason === 'dispossessed')
        .map((row) => row.nearestDefenderAtEndMetres)
        .filter(Number.isFinite),
      0.5,
    ),
    completedPassChainMedian: Array.isArray(report.continuity?.chains?.[side])
      ? quantile(chain, 0.5)
      : null,
    completedPassChainMean: mean(chain),
    completedPassChainP90: quantile(chain, 0.9),
    forwardPasses: teamPasses.filter((row) => row.direction === 'forward').length,
    lateralPasses: teamPasses.filter((row) => row.direction === 'lateral').length,
    backwardPasses: teamPasses.filter((row) => row.direction === 'backward').length,
    passDirectionCoverage: totalPasses,
    shots: teamShots.length,
    shotsInsideTwelveMetres: teamShots.filter((row) => row.distanceToGoalMetres <= 12).length,
    shotsTwelveToTwentyMetres: teamShots.filter(
      (row) => row.distanceToGoalMetres > 12 && row.distanceToGoalMetres <= 20,
    ).length,
    shotsTwentyToTwentyEightMetres: teamShots.filter(
      (row) => row.distanceToGoalMetres > 20 && row.distanceToGoalMetres <= 28,
    ).length,
    shotsBeyondTwentyEightMetres: teamShots.filter((row) => row.distanceToGoalMetres > 28).length,
    shotsInPossession: shotPossessions.reduce((count, row) => count + row.shots, 0),
    multiShotPossessions: shotPossessions.filter((row) => row.shots > 1).length,
    burstShotsWithinThirtySeconds: burstShots,
    nearestDefenderAtShotMedianMetres: quantile(
      teamShots.map((row) => row.nearestDefenderMetres).filter(Number.isFinite),
      0.5,
    ),
    shotsWithDefenderWithinThreeMetres: teamShots.filter(
      (row) => row.nearestDefenderMetres !== null && row.nearestDefenderMetres <= 3,
    ).length,
    unpressuredAtDecision: teamShots.filter((row) => row.decisionPressure === 0).length,
    receptionsWithDefenderWithinThreeMetres: receptionPressure.filter((value) => value <= 3).length,
    passCompletions: teamEvents.filter((event) => event.type === 'passComplete').length,
  };
}

function possessionTurnoverDiagnostics(report, possessions) {
  if (!Array.isArray(report.continuity?.possessions)) return null;
  const completedPasses = (report.events ?? []).filter((event) => event.type === 'passComplete'),
    rows = possessions.map((row) => ({
      ...row,
      completedPasses: completedPasses.filter(
        (event) =>
          event.side === row.side && event.second >= row.start && event.second <= row.end,
      ).length,
    })),
    short = rows.filter((row) => row.seconds < 5),
    tally = (field, values) =>
      Object.fromEntries(
        [...new Set(values.map((row) => row[field] ?? 'unknown'))]
          .sort()
          .map((key) => [key, values.filter((row) => (row[field] ?? 'unknown') === key).length]),
      ),
    passBand = (count) =>
      count === null ? 'unknown' : count >= 3 ? '3+' : String(count);
  return {
    endReasons: tally('reason', rows),
    underFiveEndReasons: tally('reason', short),
    underFiveByCompletedPasses: tally(
      'passBand',
      short.map((row) => ({ ...row, passBand: passBand(row.completedPasses) })),
    ),
  };
}

/**
 * Read-only metrics derived from a saved report and its original 5Hz trajectory.
 * Model-defined possession spells and proximity are explicitly not official event definitions.
 */
export function analyzeReplay(report, trajectory) {
  const meta = report?.replay;
  if (!meta || !trajectory)
    return {
      status: 'missing',
      reason: '这场比赛没有可分析的完整回放轨迹。',
    };
  if (
    meta.format !== 'positions-u16-v1' ||
    meta.stride !== 49 ||
    meta.sampleHz !== 5 ||
    !(trajectory instanceof Uint16Array) ||
    trajectory.length !== meta.frameCount * meta.stride ||
    meta.players?.length !== 22
  )
    throw Error('Invalid replay geometry; refusing to infer match analysis');

  const regulation = Math.min(meta.regulationDuration ?? meta.duration, 5400);
  const frameAt = (second) =>
    Math.min(meta.frameCount - 1, Math.max(0, Math.round(second * meta.sampleHz)));
  const playerAt = (frame, index) => ({
    x: trajectory[frame * meta.stride + index * 2] / 100 - 5,
    z: trajectory[frame * meta.stride + index * 2 + 1] / 100 - 5,
  });
  const velocityAt = (frame, index, zOffset = 2) => {
    if (frame <= 0 || frame >= meta.frameCount - 1) return null;
    const offset = (sample) => sample * meta.stride + index;
    const beforeX = trajectory[offset(frame - 1)] / 100;
    const afterX = trajectory[offset(frame + 1)] / 100;
    const beforeZ = trajectory[offset(frame - 1) + zOffset] / 100;
    const afterZ = trajectory[offset(frame + 1) + zOffset] / 100;
    return {
      x: (afterX - beforeX) * (meta.sampleHz / 2),
      z: (afterZ - beforeZ) * (meta.sampleHz / 2),
    };
  };
  const possessions = (report.continuity?.possessions ?? []).filter(
    (row) =>
      (row.side === 0 || row.side === 1) &&
      Number.isFinite(row.start) &&
      Number.isFinite(row.end) &&
      row.end >= row.start &&
      row.start <= regulation,
  );
  const replayEvents = (report.events ?? []).filter(
    (event) =>
      Number.isFinite(event.second) &&
      event.second <= regulation &&
      (!Number.isFinite(event.minute) || event.minute <= 90),
  );
  const shots = replayEvents
    .filter((event) => event.type === 'shot' || (event.type === 'header' && event.xg != null))
    .map((event) => {
      const playerIndex = meta.players.findIndex((player) => player.id === event.playerId);
      let nearestDefenderMetres = null;
      if (playerIndex >= 0) {
        const frame = frameAt(event.second);
        const attacker = playerAt(frame, playerIndex);
        const distances = meta.players.flatMap((player, index) => {
          if (player.side === event.side || player.role === 'GK') return [];
          const opponent = playerAt(frame, index);
          return [Math.hypot(attacker.x - opponent.x, attacker.z - opponent.z)];
        });
        nearestDefenderMetres = distances.length ? Math.min(...distances) : null;
      }
      const attackPositive = (event.side === 0) === (event.second < regulation / 2);
      const eventX = Number.isFinite(event.x) ? (event.x / 100) * 105 : null;
      return {
        second: event.second,
        side: event.side,
        playerId: event.playerId,
        distanceToGoalMetres: eventX === null ? null : Math.abs((attackPositive ? 105 : 0) - eventX),
        decisionPressure:
          event.quality && typeof event.quality === 'object'
            ? event.quality.pressure
            : null,
        nearestDefenderMetres,
      };
    });

  const rawPasses = replayEvents.filter(
    (event) => ['pass', 'cross'].includes(event.type) && (event.side === 0 || event.side === 1),
  );
  const passes = rawPasses.map((event) => {
    let destination = event.destination;
    if (!destination && event.actionId !== undefined && event.receiverId) {
      const completion = replayEvents.find(
        (candidate) =>
          candidate.type === 'passComplete' &&
          candidate.actionId === event.actionId &&
          candidate.playerId === event.receiverId,
      );
      if (completion)
        destination = {
          x: (completion.x / 100) * 105,
          z: (completion.y / 100) * 68,
        };
    }
    if (!destination && event.receiverId) {
      const completion = replayEvents.find(
        (candidate) =>
          candidate.type === 'passComplete' &&
          candidate.playerId === event.receiverId &&
          candidate.side === event.side &&
          candidate.second >= event.second &&
          candidate.second - event.second <= 8,
      );
      if (completion)
        destination = {
          x: (completion.x / 100) * 105,
          z: (completion.y / 100) * 68,
        };
    }
    if (!destination || !Number.isFinite(destination.x) || !Number.isFinite(destination.z))
      return { side: event.side, direction: null };
    const sourceX = (event.x / 100) * 105;
    const attackDirection = event.side === 0 ? 1 : -1;
    const oriented = event.second < regulation / 2 ? attackDirection : -attackDirection;
    const progress = (destination.x - sourceX) * oriented;
    return {
      side: event.side,
      direction: progress > 3 ? 'forward' : progress < -3 ? 'backward' : 'lateral',
    };
  });

  const shapeSamples = [];
  if (possessions.length) {
    for (const possession of possessions) {
      const defendingSide = 1 - possession.side;
      const defenders = meta.players
        .map((player, index) => ({ ...player, index }))
        .filter((player) => player.side === defendingSide && player.role !== 'GK');
      const defensiveLine = defenders.filter((player) => player.role === 'DEF');
      const midfield = defenders.filter((player) => player.role === 'MID');
      if (!defensiveLine.length || !midfield.length) continue;
      const first = Math.ceil(possession.start / 5) * 5;
      for (let second = first; second < Math.min(possession.end, regulation); second += 5) {
        const frame = frameAt(second);
        if (trajectory[frame * meta.stride + 47]) continue;
        const meanX = (group) => mean(group.map((player) => playerAt(frame, player.index).x));
        shapeSamples.push(Math.abs(meanX(defensiveLine) - meanX(midfield)));
      }
    }
  }

  const snapshots = report.snapshots ?? [];
  const performance = report.performance ?? [];
  const energyPairs = performance.flatMap((row) => {
    const player = snapshots[row.side]?.players?.find((candidate) => candidate.id === row.id);
    if (!player || player.role === 'GK' || !Number.isFinite(player.fitness) || !Number.isFinite(row.energy))
      return [];
    return [{ start: player.fitness, end: row.energy }];
  });
  const sortedShotTimes = shots.map((shot) => shot.second).sort((a, b) => a - b);
  const sortedIntervals = sortedShotTimes.slice(1).map((second, index) => second - sortedShotTimes[index]);
  const chainValues = [0, 1].flatMap((side) => report.continuity?.chains?.[side] ?? []);
  const replayPressure = shots
    .map((shot) => shot.nearestDefenderMetres)
    .filter(Number.isFinite);
  const receptions = replayEvents.filter((event) => event.type === 'passComplete');
  const receptionPressureBySide = [0, 1].map((side) =>
    receptions
      .filter((event) => event.side === side)
      .flatMap((event) => {
        const receiverIndex = meta.players.findIndex((player) => player.id === event.playerId);
        if (receiverIndex < 0) return [];
        const frame = frameAt(event.second);
        const receiver = playerAt(frame, receiverIndex);
        const distances = meta.players.flatMap((player, index) => {
          if (player.side === event.side || player.role === 'GK') return [];
          const opponent = playerAt(frame, index);
          return [Math.hypot(receiver.x - opponent.x, receiver.z - opponent.z)];
        });
        return distances.length ? [Math.min(...distances)] : [];
      }),
  );
  const receptionPressure = receptionPressureBySide.flat();
  const controlSpells = (report.continuity?.controlSpells ?? [])
    .filter(
      (row) =>
        (row.side === 0 || row.side === 1) &&
        Number.isFinite(row.start) &&
        Number.isFinite(row.end) &&
        Number.isFinite(row.seconds) &&
        row.end >= row.start,
    )
    .map((row) => {
      const playerIndex = meta.players.findIndex((player) => player.id === row.playerId);
      if (playerIndex < 0) return row;
      const frame = frameAt(row.end);
      const carrier = playerAt(frame, playerIndex);
      const ball = {
        x: trajectory[frame * meta.stride + 44] / 100 - 5,
        z: trajectory[frame * meta.stride + 46] / 100 - 5,
      };
      const ballVelocity = velocityAt(frame, 44);
      const carrierVelocity = velocityAt(frame, playerIndex * 2, 1);
      const defenderDistances = meta.players.flatMap((player, index) => {
        if (player.side === row.side) return [];
        const defender = playerAt(frame, index);
        return [Math.hypot(carrier.x - defender.x, carrier.z - defender.z)];
      });
      return {
        ...row,
        ballSeparationAtEndMetres: Number.isFinite(row.ballSeparationAtEndMetres)
          ? row.ballSeparationAtEndMetres
          : Math.hypot(carrier.x - ball.x, carrier.z - ball.z),
        ballHeightAtEndMetres: Number.isFinite(row.ballHeightAtEndMetres)
          ? row.ballHeightAtEndMetres
          : trajectory[frame * meta.stride + 45] / 100,
        relativeSpeedAtEndMetresPerSecond:
          Number.isFinite(row.relativeSpeedAtEndMetresPerSecond)
            ? row.relativeSpeedAtEndMetresPerSecond
            : ballVelocity && carrierVelocity
              ? Math.hypot(ballVelocity.x - carrierVelocity.x, ballVelocity.z - carrierVelocity.z)
              : null,
        nearestDefenderAtEndMetres: defenderDistances.length ? Math.min(...defenderDistances) : null,
      };
    });

  return {
    status: 'available',
    version: 'replay-flow-2',
    definition:
      '团队球权区间可能包含短暂松球记忆；个人控制区间按真实控制者记录，结束原因为出球、射门、脱控或被夺球；球人/防守者距离按5Hz回放最近帧估算。传球方向按出球点与目标点；防线间距为防守方DEF与MID组平均纵向差。均为诊断指标，不等同官方统计定义。',
    teams: [0, 1].map((side) =>
      sideSummary(
        report,
        side,
        possessions,
        shots,
        passes,
        receptionPressureBySide[side],
        controlSpells,
      ),
    ),
    match: {
      possessionCount: Array.isArray(report.continuity?.possessions) ? possessions.length : null,
      possessionMedianSeconds: quantile(possessions.map((row) => row.seconds), 0.5),
      possessionP90Seconds: quantile(possessions.map((row) => row.seconds), 0.9),
      possessionsUnderFiveSeconds: Array.isArray(report.continuity?.possessions)
        ? possessions.filter((row) => row.seconds < 5).length
        : null,
      possessionsOverFifteenSeconds: Array.isArray(report.continuity?.possessions)
        ? possessions.filter((row) => row.seconds > 15).length
        : null,
      possessionTurnovers: possessionTurnoverDiagnostics(report, possessions),
      meanCompletedPassChain: mean(chainValues),
      medianCompletedPassChain: quantile(chainValues, 0.5),
      individualControlCount: Array.isArray(report.continuity?.controlSpells)
        ? controlSpells.length
        : null,
      individualControlMedianSeconds: Array.isArray(report.continuity?.controlSpells)
        ? quantile(controlSpells.map((row) => row.seconds), 0.5)
        : null,
      individualControlP90Seconds: Array.isArray(report.continuity?.controlSpells)
        ? quantile(controlSpells.map((row) => row.seconds), 0.9)
        : null,
      controlEndsByLooseCarry: Array.isArray(report.continuity?.controlSpells)
        ? controlSpells.filter((row) => row.reason === 'looseCarry').length
        : null,
      looseCarryCauses: Array.isArray(report.continuity?.controlSpells)
        ? Object.fromEntries(
            [
              'airborne',
              'outsideRadius',
              'carryRecoveryExpired',
              'noCarryIntent',
              'relativeSpeed',
              'other',
            ].map(
              (cause) => [
                cause,
                controlSpells.filter(
                  (row) => row.reason === 'looseCarry' && row.looseCarryCause === cause,
                ).length,
              ],
            ),
          )
        : null,
      medianBallSeparationAtLooseCarryMetres: quantile(
        controlSpells
          .filter((row) => row.reason === 'looseCarry')
          .map((row) => row.ballSeparationAtEndMetres)
          .filter(Number.isFinite),
        0.5,
      ),
      medianBallHeightAtLooseCarryMetres: quantile(
        controlSpells
          .filter((row) => row.reason === 'looseCarry')
          .map((row) => row.ballHeightAtEndMetres)
          .filter(Number.isFinite),
        0.5,
      ),
      shareLooseCarryAboveControlHeight: mean(
        controlSpells
          .filter((row) => row.reason === 'looseCarry' && Number.isFinite(row.ballHeightAtEndMetres))
          .map((row) => Number(row.ballHeightAtEndMetres > 1.3)),
      ),
      medianRelativeSpeedAtLooseCarryMetresPerSecond: quantile(
        controlSpells
          .filter((row) => row.reason === 'looseCarry')
          .map((row) => row.relativeSpeedAtEndMetresPerSecond)
          .filter(Number.isFinite),
        0.5,
      ),
      controlEndsByDispossession: Array.isArray(report.continuity?.controlSpells)
        ? controlSpells.filter((row) => row.reason === 'dispossessed').length
        : null,
      medianNearestDefenderAtDispossessionMetres: quantile(
        controlSpells
          .filter((row) => row.reason === 'dispossessed')
          .map((row) => row.nearestDefenderAtEndMetres)
          .filter(Number.isFinite),
        0.5,
      ),
      passDirectionCoverage: passes.filter((row) => row.direction).length,
      passDirectionTotal: rawPasses.length,
      shots: shots.length,
      shotsPerMinute: regulation > 0 ? shots.length / (regulation / 60) : null,
      medianInterShotSeconds: quantile(sortedIntervals, 0.5),
      shotsWithDefenderWithinThreeMetres: shots.filter(
        (row) => row.nearestDefenderMetres !== null && row.nearestDefenderMetres <= 3,
      ).length,
      medianNearestDefenderAtShotMetres: quantile(replayPressure, 0.5),
      decisionUnpressuredShots: shots.filter((row) => row.decisionPressure === 0).length,
      receptionCount: receptions.length,
      receptionsWithDefenderWithinThreeMetres: receptionPressure.filter((value) => value <= 3).length,
      medianNearestDefenderAtReceptionMetres: quantile(receptionPressure, 0.5),
      defensiveMidfieldGapMeanMetres: mean(shapeSamples),
      defensiveMidfieldGapP90Metres: quantile(shapeSamples, 0.9),
      defensiveShapeSamples: shapeSamples.length,
      averageStartingEnergy: mean(energyPairs.map((row) => row.start)),
      averageEndingEnergy: mean(energyPairs.map((row) => row.end)),
      averageEnergyDrop: mean(energyPairs.map((row) => row.start - row.end)),
      turnovers: report.continuity?.turnovers ?? null,
    },
  };
}
