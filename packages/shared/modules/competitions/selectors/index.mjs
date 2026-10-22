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
