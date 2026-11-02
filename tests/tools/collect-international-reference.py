"""Explicit offline reference builder; cache raw provider files outside Git.

Usage: python collect-international-reference.py ABS_CACHE ABS_OUTPUT [SOURCE_COMMIT]
StatsBomb/Hudl open data, credited below. No odds or simulated data are used.
"""
import concurrent.futures
import hashlib
import json
import pathlib
import statistics
import sys
import urllib.request
from datetime import datetime, timezone

CACHE = pathlib.Path(sys.argv[1]).resolve()
OUTPUT = pathlib.Path(sys.argv[2]).resolve()
CACHE.mkdir(parents=True, exist_ok=True)


def get(url, name):
    path = CACHE / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Touchline-reference-audit'})
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read()
        json.loads(data)
        path.write_bytes(data)
    return json.loads(path.read_bytes())


commit = sys.argv[3] if len(sys.argv) > 3 else '4b73468fc5b0f1950f9f66fada70ad3a4f9327cb'
if len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
    raise ValueError('SOURCE_COMMIT must be a full lowercase Git commit')
manifest = CACHE / 'reference-source.json'
if manifest.exists() and json.loads(manifest.read_text())['commit'] != commit:
    raise ValueError('Use a separate cache directory for a different source commit')
manifest.write_text(json.dumps({'commit': commit}))
BASE = f'https://raw.githubusercontent.com/statsbomb/open-data/{commit}/data'
pots = {
    '2018': [
        ['Germany', 'Brazil', 'Portugal', 'Argentina', 'Belgium', 'Poland', 'France'],
        ['Spain', 'Peru', 'Switzerland', 'England', 'Colombia', 'Mexico', 'Uruguay', 'Croatia'],
        ['Denmark', 'Iceland', 'Costa Rica', 'Sweden', 'Tunisia', 'Egypt', 'Senegal', 'Iran'],
        ['Serbia', 'Nigeria', 'Australia', 'Japan', 'Morocco', 'Panama', 'South Korea', 'Saudi Arabia'],
    ],
    '2022': [
        ['Brazil', 'Belgium', 'France', 'Argentina', 'England', 'Spain', 'Portugal'],
        ['Mexico', 'Netherlands', 'Denmark', 'Germany', 'Uruguay', 'Switzerland', 'United States', 'Croatia'],
        ['Senegal', 'Iran', 'Japan', 'Morocco', 'Serbia', 'Poland', 'South Korea', 'Tunisia'],
        ['Cameroon', 'Canada', 'Ecuador', 'Saudi Arabia', 'Ghana'],
    ],
}
# Hosts and unresolved play-off slots are deliberately absent: their pots did
# not express their FIFA-ranking strength. UEFA/Copa pots use other rules, so
# those events provide tournament context only, not pooled strength labels.
pot_maps = {year: {team: i + 1 for i, teams in enumerate(groups) for team in teams} for year, groups in pots.items()}
competitions = [(43, 3, 'World Cup 2018'), (43, 106, 'World Cup 2022'), (55, 282, 'Euro 2024'), (223, 282, 'Copa America 2024')]
matches = []
for comp, season, label in competitions:
    for match in get(f'{BASE}/matches/{comp}/{season}.json', f'matches-{comp}-{season}.json'):
        matches.append((label, match))


def aggregate(item):
    label, match = item
    match_id = match['match_id']
    events = get(f'{BASE}/events/{match_id}.json', f'events/{match_id}.json')
    sides = [match['home_team']['home_team_name'], match['away_team']['away_team_name']]
    rows = {name: dict(goals=0, shots=0, onTarget=0, xg=0, passes=0, completedPasses=0, interceptions=0,
                       tackles=0, dribbles=0, completedDribbles=0, redCards=0, counterPossessions=0,
                       counterShots=0, outsideBoxShots=0, penaltyShots=0, fouls=0, cornerPasses=0,
                       yellowCards=0, formation=None) for name in sides}
    possessions = {name: {} for name in sides}
    for event in events:
        if event['period'] > 2:
            continue
        name = event['team']['name']
        if name not in rows:
            raise ValueError('Unknown team')
        row = rows[name]
        kind = event['type']['name']
        if kind == 'Starting XI':
            row['formation'] = event['tactics'].get('formation')
        if kind == 'Pass':
            row['passes'] += 1
            row['cornerPasses'] += int(event['pass'].get('type', {}).get('name') == 'Corner')
            row['completedPasses'] += int('outcome' not in event['pass'])
            key = event['possession']
            possessions[name][key] = possessions[name].get(key, 0) + 1
        if kind == 'Shot':
            shot = event['shot']
            row['shots'] += 1
            row['penaltyShots'] += int(shot['type']['name'] == 'Penalty')
            row['xg'] += shot['statsbomb_xg']
            row['goals'] += int(shot['outcome']['name'] == 'Goal')
            row['onTarget'] += int(shot['outcome']['name'] in ['Goal', 'Saved', 'Saved to Post'])
            x, y = event['location'][:2]
            row['outsideBoxShots'] += int(x < 102 or y < 18 or y > 62)
            row['counterShots'] += int(event.get('play_pattern', {}).get('name') == 'From Counter')
        if kind == 'Own Goal Against':
            rows[sides[1] if name == sides[0] else sides[0]]['goals'] += 1
        if kind == 'Foul Committed':
            row['fouls'] += 1
        if kind == 'Interception':
            row['interceptions'] += int(event.get('interception', {}).get('outcome', {}).get('name') in ['Won', 'Success', 'Success In Play', 'Success Out'])
        if kind == 'Duel' and event.get('duel', {}).get('type', {}).get('name') == 'Tackle':
            row['tackles'] += 1
        if kind == 'Dribble':
            row['dribbles'] += 1
            row['completedDribbles'] += int(event['dribble']['outcome']['name'] == 'Complete')
        card = (event.get('foul_committed', {}).get('card') or event.get('bad_behaviour', {}).get('card') or {}).get('name')
        row['redCards'] += int(card in ['Red Card', 'Second Yellow'])
        row['yellowCards'] += int(card in ['Yellow Card', 'Second Yellow'])
        if event.get('play_pattern', {}).get('name') == 'From Counter':
            possessions[name].setdefault(('counter', event['possession']), 0)
    for name, row in rows.items():
        row['xg'] = round(row['xg'], 5)
        row['counterPossessions'] = sum(isinstance(k, tuple) for k in possessions[name])
        chains = [n for k, n in possessions[name].items() if not isinstance(k, tuple)]
        row['meanPassesPerPassingPossession'] = statistics.mean(chains) if chains else 0
        row['passSharePct'] = row['passes'] / max(1, sum(t['passes'] for t in rows.values())) * 100
        row['passCompletionPct'] = row['completedPasses'] / row['passes'] * 100 if row['passes'] else None
        row['dribbleCompletionPct'] = row['completedDribbles'] / row['dribbles'] * 100 if row['dribbles'] else None
    year = label[-4:]
    ranks = pot_maps.get(year, {}) if label.startswith('World Cup') else {}
    pot_values = [ranks.get(name) for name in sides]
    gap = abs(pot_values[0] - pot_values[1]) if all(pot_values) else None
    strong_side = (0 if pot_values[0] < pot_values[1] else 1) if gap else None
    result = dict(id=match_id, competition=label, teams=sides, date=match['match_date'],
                  regulation=[rows[name] for name in sides], seedPots=pot_values, seedPotGap=gap,
                  strongSide=strong_side, hadRedCard=any(row['redCards'] for row in rows.values()),
                  hadExtraTime=any(e['period'] in [3, 4] for e in events),
                  sourceSha256=hashlib.sha256((CACHE / f'events/{match_id}.json').read_bytes()).hexdigest())
    return result


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    rows = []
    for row in executor.map(aggregate, matches):
        rows.append(row)
        if len(rows) % 20 == 0:
            print(f'aggregated {len(rows)}/{len(matches)}', flush=True)


def describe(values):
    values = sorted(value for value in values if value is not None)
    return dict(n=len(values), mean=statistics.mean(values) if values else None,
                sampleVariance=statistics.variance(values) if len(values) > 1 else None,
                p10=values[int((len(values) - 1) * .1)] if values else None,
                median=statistics.median(values) if values else None,
                p90=values[int((len(values) - 1) * .9)] if values else None,
                min=values[0] if values else None, max=values[-1] if values else None)


def summarize(selected):
    metrics = ['goals', 'shots', 'onTarget', 'xg', 'passes', 'completedPasses', 'passCompletionPct',
               'interceptions', 'tackles', 'dribbles', 'completedDribbles', 'dribbleCompletionPct',
               'meanPassesPerPassingPossession', 'passSharePct', 'outsideBoxShots', 'counterShots',
               'counterPossessions', 'penaltyShots', 'fouls', 'cornerPasses', 'yellowCards']
    result = dict(matches=len(selected), teams={key: describe([r['regulation'][s][key] for r in selected for s in [0, 1]]) for key in metrics})
    ordered = [r for r in selected if r['strongSide'] is not None]
    result['strong'] = {key: describe([r['regulation'][r['strongSide']][key] for r in ordered]) for key in metrics}
    result['weak'] = {key: describe([r['regulation'][1-r['strongSide']][key] for r in ordered]) for key in metrics}
    diffs = [r['regulation'][r['strongSide']]['goals'] - r['regulation'][1-r['strongSide']]['goals'] for r in ordered]
    result['strongWinDrawWeakWin'] = [sum(d > 0 for d in diffs), sum(d == 0 for d in diffs), sum(d < 0 for d in diffs)]
    result['goalMargin'] = describe(diffs)
    return result


groups = {'allRegulation': summarize(rows), 'noRedCards': summarize([r for r in rows if not r['hadRedCard']])}
for label in [c[2] for c in competitions]:
    groups[label] = summarize([r for r in rows if r['competition'] == label])
for gap in [0, 1, 2, 3]:
    groups[f'worldCupPotGap{gap}NoRed'] = summarize([r for r in rows if not r['hadRedCard'] and r['seedPotGap'] == gap])
groups['worldCupPotGap2PlusNoRed'] = summarize([r for r in rows if not r['hadRedCard'] and r['seedPotGap'] is not None and r['seedPotGap'] >= 2])
reference = dict(version=1, attribution='StatsBomb/Hudl Open Data; FIFA/UEFA/FA pre-draw seeding',
                 retrievedAt=datetime.now(timezone.utc).isoformat(), sourceCommit=commit,
                 sources=['https://github.com/statsbomb/open-data',
                          'https://inside.fifa.com/tournaments/mens/worldcup/2018russia/news/pots-announced-for-final-draw-2920191',
                          'https://www.thefa.com/news/2017/nov/21/world-cup-draw-venue-calendar-dates-ticket-details-211117',
                          'https://www.uefa.com/european-qualifiers/news/026d-1357d498645c-3c5513508c20-1000--world-cup-draw-twelve-european-teams-set-to-discover-oppo/'],
                 definitions=dict(clock='Periods 1/2 including added time, excludes extra time and shootouts',
                                  strength='Pre-draw World Cup pot gap; exclude hosts and 2022 unresolved playoff slots; no mapping to game ability',
                                  passSharePct='Event pass-count share, NOT official time-possession percentage',
                                  counter='Provider From Counter play-pattern possession; not all ball recoveries',
                                  onTarget='Shot outcomes Goal, Saved, Saved to Post; provider definition',
                                  formation='Starting XI provider formation only; does not identify low blocks or tactical changes',
                                  causality='Observational contextual comparison, not the causal effect of low-block tactics'),
                 groups=groups, matches=rows)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(reference, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'matches': len(rows), 'sourceCommit': commit, 'strongWeak': groups['worldCupPotGap2PlusNoRed']}, ensure_ascii=False), flush=True)
