import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleMatchEvents } from '../packages/client/src/modules/matches/event-filter.mjs';

const event = (type, second = 10) => ({ type, second, minute: second / 60, text: type });
const types = (events) => events.map((event) => event.type);

test('the default timeline keeps match highlights and discipline, not routine touches', () => {
  const events = [
    'control',
    'goal',
    'interception',
    'save',
    'header',
    'foul',
    'cross',
    'yellowCard',
    'substitution',
    'shot',
    'passComplete',
    'redCard',
  ].map((type) => event(type));
  assert.deepEqual(types(visibleMatchEvents(events, 30)), [
    'goal',
    'save',
    'foul',
    'yellowCard',
    'substitution',
    'shot',
    'redCard',
  ]);
});

test('other events preserve routine actions and unknown future types without duplicating key events', () => {
  const events = [
    'kickoff',
    'pass',
    'control',
    'dribble',
    'tackleWon',
    'miscontrol',
    'throwIn',
    'goalKick',
    'out',
    'futureTouch',
    'goal',
    'fulltime',
  ].map((type) => event(type));
  const key = visibleMatchEvents(events, 30),
    other = visibleMatchEvents(events, 30, 'other');
  assert.deepEqual(types(other), [
    'pass',
    'control',
    'dribble',
    'tackleWon',
    'miscontrol',
    'throwIn',
    'goalKick',
    'out',
    'futureTouch',
  ]);
  assert.equal(new Set([...key, ...other]).size, events.length);
  assert.ok(other.every((event) => !key.includes(event)));
  assert.deepEqual(visibleMatchEvents(events, 30, 'all'), events);
});

test('all filters hide future events and rewind correctly, including minute-only legacy reports', () => {
  const events = [
    event('kickoff', 0),
    event('pass', 5),
    { type: 'goal', minute: 1 },
    event('control', 61),
  ];
  for (const filter of ['key', 'other', 'rules', 'all']) {
    assert.ok(
      visibleMatchEvents(events, 59, filter).every(
        (event) => event.type !== 'goal' && event.type !== 'control',
      ),
    );
  }
  assert.deepEqual(types(visibleMatchEvents(events, 60)), ['kickoff', 'goal']);
  assert.deepEqual(types(visibleMatchEvents(events, 0)), ['kickoff']);
  assert.deepEqual(visibleMatchEvents(events, 60, 'other'), [events[1]]);
  assert.equal(events.length, 4, 'filtering must not delete historical events');
});

test('referee view remains available and shootout outcomes remain highlights', () => {
  const events = [
    'offside',
    'goal',
    'penalty',
    'penaltyShot',
    'penaltyGoal',
    'penaltyMiss',
    'injury',
    'backpass',
    'end',
  ].map((type) => event(type));
  assert.deepEqual(types(visibleMatchEvents(events, 30, 'rules')), [
    'offside',
    'penalty',
    'backpass',
  ]);
  assert.deepEqual(visibleMatchEvents(events, 30), events);
});
