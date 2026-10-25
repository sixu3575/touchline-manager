// Public read-only entry for browser consumers; never imports the simulation runtime.
export function schedule(ids) {
  let ring = [...ids],
    rounds = [];
  for (let r = 0; r < ids.length - 1; r++) {
    let matches = [];
    for (let i = 0; i < ids.length / 2; i++) {
      const pair = [ring[i], ring[ids.length - 1 - i]];
      matches.push(r % 2 ? pair.reverse() : pair);
    }
    rounds.push(matches);
    ring = [ring[0], ring.at(-1), ...ring.slice(1, -1)];
  }
  return [...rounds, ...rounds.map((r) => r.map(([a, b]) => [b, a]))];
}

const leaderFields = {
  goals: 'goals',
  ownGoals: 'ownGoals',
  assists: 'assists',
  shots: 'shots',
  shotsOnTarget: 'onTarget',
  xg: 'xg',
  keyPasses: 'keyPasses',
  appearances: 'minutes',
  minutes: 'minutes',
  passes: 'passes',
  completedPasses: 'completed',
  wonTackles: 'wonTackles',
  interceptions: 'interceptions',
  saves: 'saves',
  cleanSheets: 'conceded',
  yellowCards: 'yellowCards',
  redCards: 'redCards',
  fouls: 'fouls',
  offsides: 'offsides',
  takeOns: 'takeOns',
  blocks: 'blocks',
  clearances: 'clearances',
  possessionLost: 'possessionLost',
  averageRating: 'rating',
};

/** Build a public, season-only player aggregate from finalized detailed league reports. */
export function leaguePlayerLeaders(inputReports, { season, expectedMatches = 0 } = {}) {
  const totalByPlayer = new Map(),
    metricCoverage = Object.fromEntries(Object.keys(leaderFields).map((key) => [key, 0]));
  let availableMatches = 0;

  for (const source of inputReports ?? []) {
    if (!source || source.competition !== '先锋联赛') continue;
    const reportSeason = source.season ?? Number(source.id?.match(/^s(\d+)/)?.[1]);
    if (Number.isFinite(season) && reportSeason !== season) continue;
    // A compact state summary cannot support individual leaderboards. The server
    // loads its same-save detail archive before calling this selector.
    if (source.detailsStored || !Array.isArray(source.events)) continue;
    const report = source,
      rows = report.playerRatings?.rows ?? [];
    if (!rows.length) continue;
    availableMatches++;

    for (const [metric, field] of Object.entries(leaderFields)) {
      const available = rows.every((row) =>
        metric === 'averageRating'
          ? row.rating === null || Number.isFinite(row.rating)
          : metric === 'passes'
            ? Number.isFinite(row.passes) && Number.isFinite(row.completed)
            : Number.isFinite(row[field]),
      );
      if (available) metricCoverage[metric]++;
    }

    const clubs = [
      { id: report.homeId, name: report.homeName },
      { id: report.awayId, name: report.awayName },
    ];
    const starters = (report.snapshots ?? []).map(
      (team) => new Set((team.players ?? []).map((player) => player.id)),
    );
    for (const row of rows) {
      const decisiveAction = row.goals + row.assists + row.redCards + row.ownGoals > 0;
      if (!(Number(row.minutes) > 0) && !starters[row.side]?.has(row.id) && !decisiveAction)
        continue;
      const team = clubs[row.side];
      if (!team) continue;
      const key = `${team.id}:${row.id}`;
      let player = totalByPlayer.get(key);
      if (!player) {
        player = {
          id: row.id,
          name: row.name,
          number: Number.isFinite(row.number) ? row.number : null,
          role: row.role,
          clubId: team.id,
          clubName: team.name,
          appearances: 0,
          minutes: 0,
          goals: 0,
          ownGoals: 0,
          assists: 0,
          shots: 0,
          shotsOnTarget: 0,
          xg: 0,
          keyPasses: 0,
          passes: 0,
          completedPasses: 0,
          wonTackles: 0,
          interceptions: 0,
          saves: 0,
          cleanSheets: 0,
          yellowCards: 0,
          redCards: 0,
          fouls: 0,
          offsides: 0,
          takeOns: 0,
          blocks: 0,
          clearances: 0,
          possessionLost: 0,
          ratingTotal: 0,
          ratedAppearances: 0,
        };
        totalByPlayer.set(key, player);
      }
      player.appearances++;
      player.minutes += row.minutes;
      for (const [metric, field] of Object.entries(leaderFields)) {
        if (
          metric === 'appearances' ||
          metric === 'minutes' ||
          metric === 'cleanSheets' ||
          metric === 'averageRating'
        )
          continue;
        const value = row[field];
        if (Number.isFinite(value)) player[metric] += value;
      }
      if ((row.role === 'GK' || row.role === 'DEF') && row.minutes >= 60 && row.conceded === 0)
        player.cleanSheets++;
      if (Number.isFinite(row.rating)) {
        player.ratingTotal += row.rating;
        player.ratedAppearances++;
      }
    }
  }

  const players = [...totalByPlayer.values()].map((player) => ({
    ...player,
    minutes: Math.round(player.minutes),
    passAccuracy: player.passes ? Math.round((player.completedPasses * 100) / player.passes) : null,
    averageRating: player.ratedAppearances
      ? Math.round((player.ratingTotal / player.ratedAppearances) * 10) / 10
      : null,
    xg: Math.round(player.xg * 10) / 10,
    ratingTotal: undefined,
  }));

  const completed = Math.max(0, Math.floor(expectedMatches));
  return {
    season: Number.isFinite(season) ? season : null,
    completedMatches: completed,
    availableMatches,
    missingMatches: Math.max(0, completed - availableMatches),
    complete: completed > 0 && availableMatches === completed,
    metricCoverage,
    players,
  };
}

export function standings(g) {
  const order = (results) => {
    const rows = g.clubs.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      points: 0,
    }));
    for (const m of results) {
      const h = rows.find((c) => c.id === m.homeId),
        a = rows.find((c) => c.id === m.awayId);
      if (!h || !a) continue;
      h.played++;
      a.played++;
      h.gf += m.score[0];
      h.ga += m.score[1];
      a.gf += m.score[1];
      a.ga += m.score[0];
      if (m.score[0] > m.score[1]) {
        h.won++;
        a.lost++;
        h.points += 3;
      } else if (m.score[0] < m.score[1]) {
        a.won++;
        h.lost++;
        a.points += 3;
      } else {
        h.drawn++;
        a.drawn++;
        h.points++;
        a.points++;
      }
    }
    return rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.gf - b.ga - (a.gf - a.ga) ||
        b.gf - a.gf ||
        a.name.localeCompare(b.name),
    );
  };
  const results = g.results ?? [];
  const rows = order(results);
  const latestRound = results.reduce((latest, match) => Math.max(latest, match.round ?? 0), 0);
  const previous = results.filter((match) => (match.round ?? 0) < latestRound);
  const previousRank = new Map(
    (previous.length ? order(previous) : []).map((row, index) => [row.id, index + 1]),
  );
  const next = g.schedule?.[g.round] ?? [];
  return rows.map((row, index) => {
    const history = results
      .filter((match) => match.homeId === row.id || match.awayId === row.id)
      .sort((a, b) => (b.round ?? 0) - (a.round ?? 0))
      .slice(0, 3)
      .map((match) => {
        const isHome = match.homeId === row.id;
        const scored = match.score[isHome ? 0 : 1];
        const conceded = match.score[isHome ? 1 : 0];
        return scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
      });
    const fixture = next.find((pair) => pair.includes(row.id));
    const opponentId = fixture?.find((clubId) => clubId !== row.id);
    const rankBefore = previousRank.get(row.id);
    return {
      ...row,
      recentResults: history,
      rankChange: rankBefore === undefined ? null : rankBefore - (index + 1),
      nextOpponent: g.clubs.find((club) => club.id === opponentId)?.name ?? null,
    };
  });
}
