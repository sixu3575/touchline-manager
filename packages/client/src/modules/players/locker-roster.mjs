const roles = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const collator = new Intl.Collator('zh-CN', { numeric: true });
export function lockerRoster(
  players,
  filter = 'ALL',
  key = 'overall',
  direction = 'descending',
  lineup = [],
  query = '',
) {
  const search = query.trim().toLocaleLowerCase('zh-CN').replace(/^#/, '');
  const value = (p) =>
    key === 'status'
      ? Number(lineup.includes(p.id))
      : key === 'role'
        ? (roles[p.role] ?? 4)
        : p[key];
  return players
    .filter(
      (p) =>
        (filter === 'ALL' || p.role === filter) &&
        (!search ||
          p.name.toLocaleLowerCase('zh-CN').includes(search) ||
          String(p.number) === search),
    )
    .sort((a, b) => {
      const av = value(a),
        bv = value(b);
      if (av == null || bv == null)
        return av == null && bv == null ? a.id.localeCompare(b.id) : av == null ? 1 : -1;
      const comparison =
        typeof av === 'string' && typeof bv === 'string'
          ? collator.compare(av, bv)
          : Number(av) - Number(bv);
      return comparison * (direction === 'ascending' ? 1 : -1) || a.id.localeCompare(b.id);
    });
}
