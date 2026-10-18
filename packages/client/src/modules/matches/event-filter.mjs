// Presentation only: keep the saved event stream and the match engine unchanged.
const rules = new Set([
  'offside',
  'foul',
  'yellowCard',
  'redCard',
  'penalty',
  'freeKick',
  'indirect',
  'backpass',
  'doubleTouch',
]);
const key = new Set([
  ...rules,
  'kickoff',
  'half',
  'fulltime',
  'end', // Older saved reports use this full-time marker.
  'goal',
  'shot',
  'save',
  'corner',
  'shootout',
  'penaltyShot',
  'penaltyGoal',
  'penaltyMiss',
  // Recognize these in imported/future reports; the current engine does not create them.
  'substitution',
  'injury',
]);

export const eventFilterLabels = {
  key: '关键事件',
  other: '其他事件',
  rules: '裁判与纪律',
  all: '全部动作与解释',
};

/** @param {string} type @param {string} filter */
export function eventMatchesFilter(type, filter = 'key') {
  if (filter === 'all') return true;
  if (filter === 'other') return !key.has(type);
  if (filter === 'rules') return rules.has(type);
  return key.has(type);
}

/**
 * Preserve source order; every category uses the same playback-time gate.
 * @template {{type: string, second?: number, minute: number}} T
 * @param {T[]} events @param {number} second @param {string} filter
 * @returns {T[]}
 */
export function visibleMatchEvents(events, second, filter = 'key') {
  return events.filter(
    (event) =>
      (event.second ?? event.minute * 60) <= second && eventMatchesFilter(event.type, filter),
  );
}
