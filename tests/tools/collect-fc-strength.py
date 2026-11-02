"""Offline FC/FIFA ratings joined to real matches; no model training or odds.

python -X utf8 collect-fc-strength.py ABS_CACHE ABS_OUTPUT
Raw ratings/scoreboards/summaries remain in ABS_CACHE, outside Git. The output
contains derived match statistics, strength labels, coverage and source hashes.
"""
import concurrent.futures
import csv
import hashlib
import json
import math
import pathlib
import statistics
import sys
import time
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent
LEAGUES = {'E0': 13, 'E1': 14, 'E2': 60, 'E3': 61, 'D1': 19, 'D2': 20,
           'I1': 31, 'SP1': 53, 'F1': 16, 'SC0': 50, 'N1': 10, 'P1': 308}
EDITIONS = {19: {'season': 2018, 'available': '2018-09-28'},
            23: {'season': 2022, 'available': '2022-09-30'},
            24: {'season': 2023, 'available': '2023-09-22'}}
METRICS = ['goals', 'shots', 'onTarget', 'passes', 'completedPasses', 'passCompletionPct',
           'possession', 'fouls', 'corners', 'yellowCards', 'redCards', 'saves',
           'interceptions', 'tackleAttempts', 'wonTackles', 'clearances', 'blockedShots',
           'longBalls', 'accurateLongBalls', 'crosses', 'accurateCrosses']
ESPN_METRICS = {'totalShots': 'shots', 'shotsOnTarget': 'onTarget', 'totalPasses': 'passes',
                'accuratePasses': 'completedPasses', 'possessionPct': 'possession',
                'foulsCommitted': 'fouls', 'wonCorners': 'corners', 'yellowCards': 'yellowCards',
                'redCards': 'redCards', 'saves': 'saves', 'interceptions': 'interceptions',
                'totalTackles': 'tackleAttempts', 'effectiveTackles': 'wonTackles',
                'totalClearance': 'clearances', 'blockedShots': 'blockedShots',
                'totalLongBalls': 'longBalls', 'accurateLongBalls': 'accurateLongBalls',
                'totalCrosses': 'crosses', 'accurateCrosses': 'accurateCrosses'}


def norm(value):
    value = value.casefold().translate(str.maketrans({'ø': 'o', 'ð': 'd', 'ł': 'l', 'æ': 'ae', 'þ': 'th', 'ı': 'i'}))
    return ''.join(c for c in unicodedata.normalize('NFKD', value)
                   if c.isalnum() and not unicodedata.combining(c))


def number(value):
    if value is None or str(value).strip() in ['', '--', 'N/A']:
        return None
    try:
        result = float(str(value).replace('%', '').replace(',', ''))
        return result if math.isfinite(result) else None
    except ValueError:
        return None


def describe(values):
    values = sorted(v for v in values if v is not None)
    return {'n': len(values), 'mean': statistics.mean(values) if values else None,
            'sampleVariance': statistics.variance(values) if len(values) > 1 else None,
            'median': statistics.median(values) if values else None,
            'p10': values[int((len(values)-1)*.1)] if values else None,
            'p90': values[int((len(values)-1)*.9)] if values else None,
            'min': min(values) if values else None, 'max': max(values) if values else None}


def panel(matches, kind, orientation='rating'):
    selected = [r for r in matches if r['ratings'].get(kind) is not None]
    ordered = []
    for row in selected:
        scores = row['ratings'][kind]
        side = (0 if row['finalPointsRanks'][0] < row['finalPointsRanks'][1] else 1) if orientation == 'final-rank' else (0 if scores[0] >= scores[1] else 1)
        ordered.append((row, side))
    differences = [r['stats'][s]['goals'] - r['stats'][1-s]['goals'] for r, s in ordered]
    return {'matches': len(selected), 'ratingKind': kind, 'orientation': orientation,
            'editionCounts': dict(Counter(r['edition'] for r in selected)),
            'competitionCounts': dict(Counter(r['competition'] for r in selected)),
            'firstSideHomeAwayNeutral': dict(Counter('neutral' if r.get('neutral') else 'home' if s == 0 else 'away' for r,s in ordered)),
            'tiedRatingMatches': sum(r['ratings'][kind][0] == r['ratings'][kind][1] for r in selected),
            'higherRatedOrHomeIfTiedWinDrawLose': [sum(d > 0 for d in differences), sum(d == 0 for d in differences), sum(d < 0 for d in differences)],
            'strong': {k: describe([r['stats'][s].get(k) for r, s in ordered]) for k in METRICS},
            'weak': {k: describe([r['stats'][1-s].get(k) for r, s in ordered]) for k in METRICS},
            'goalMargin': describe(differences)}


def bucket(gap):
    return 'equal' if gap == 0 else '0-2' if gap < 3 else '3-5' if gap < 6 else '6-9' if gap < 10 else '10-14' if gap < 15 else '15-19' if gap < 20 else '20+'


class Builder:
    def __init__(self, cache):
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True)
        self.sources = {}
        self.excluded = []
        self.aliases = json.loads((ROOT / 'fc-club-aliases.json').read_text(encoding='utf8'))
        self.teams = defaultdict(dict)
        self.team_names = defaultdict(lambda: defaultdict(list))
        for row in csv.DictReader((cache / 'male_teams.csv').open(encoding='utf-8-sig')):
            edition = int(float(row['fifa_version']))
            self.teams[edition][int(row['team_id'])] = row
            if row['league_name'] != 'Friendly International':
                self.team_names[edition][norm(row['team_name'])].append(row)
        self.players = defaultdict(list)
        self.player_names = defaultdict(lambda: defaultdict(list))
        self.club_players = defaultdict(lambda: defaultdict(list))
        self.player_initial_surname = defaultdict(lambda: defaultdict(list))
        for row in csv.DictReader((cache / 'male_players.csv').open(encoding='utf-8-sig')):
            edition = int(float(row['fifa_version']))
            if edition in EDITIONS:
                self.players[edition].append(row)
                for key in {norm(row['short_name']), norm(row['long_name'])}:
                    self.player_names[edition][key].append(row)
                if row['club_team_id']:
                    self.club_players[edition][int(row['club_team_id'])].append(row)
                short = row['short_name'].split()
                if len(short) >= 2:
                    self.player_initial_surname[edition][(norm(short[0])[:1], norm(short[-1]))].append(row)
        for name in ['male_teams.csv', 'male_players.csv', 'kaggle-meta.json']:
            self.register(cache / name, 'Kaggle Stefano Leone / SoFIFA, dataset version 4')

    def register(self, path, url):
        relative = path.relative_to(self.cache).as_posix()
        self.sources[relative] = {'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

    def get(self, url, name):
        path = self.cache / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            for attempt in range(3):
                try:
                    request = urllib.request.Request(url, headers={'User-Agent': 'Touchline-strength-reference/1.0'})
                    with urllib.request.urlopen(request, timeout=45) as response:
                        data = response.read()
                    json.loads(data)
                    path.write_bytes(data)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(1 + attempt)
        self.register(path, url)
        return json.loads(path.read_bytes())

    def team(self, name, edition):
        override = self.aliases.get('espn', {}).get(name)
        if override:
            return self.teams[edition].get(override)
        candidates = self.team_names[edition].get(norm(name), [])
        return candidates[0] if len(candidates) == 1 else None

    def xi(self, roster, edition, club):
        starters = [p for p in roster.get('roster', []) if p.get('starter')]
        matches = []
        for p in starters:
            name = norm(p['athlete']['displayName'])
            full = norm(p['athlete'].get('fullName', ''))
            def exact(row):
                return name in [norm(row['short_name']), norm(row['long_name'])] or full in [norm(row['short_name']), norm(row['long_name'])]
            pool = self.club_players[edition][int(club['team_id'])]
            local = [r for r in pool if exact(r)]
            global_names = {r['player_id']: r for key in {name, full} for r in self.player_names[edition].get(key, [])}
            candidates = local or list(global_names.values())
            method = 'exact-name-club' if local else 'unique-exact-name-global'
            if not candidates:
                # Full names often include middle names absent from the match
                # feed. Initial + surname is accepted only once within club.
                tokens = p['athlete'].get('fullName', p['athlete']['displayName']).split()
                if tokens:
                    def initial_surname(r):
                        return any(norm(r[field]).startswith(norm(tokens[0])[:1]) and norm(r[field]).endswith(norm(tokens[-1])) for field in ['short_name', 'long_name'])
                    candidates = [r for r in pool if initial_surname(r)]
                    method = 'unique-initial-surname-club'
                    if not candidates:
                        candidates = self.player_initial_surname[edition].get((norm(tokens[0])[:1], norm(tokens[-1])), [])
                        method = 'unique-initial-surname-global'
            if len(candidates) == 1:
                row = candidates[0]
                matches.append({'name': p['athlete']['displayName'], 'fcPlayerId': int(row['player_id']),
                                'overall': int(row['overall']), 'method': method})
        complete = len(starters) == 11 and len(matches) == 11 and len({r['fcPlayerId'] for r in matches}) == 11
        return {'starters': len(starters), 'matched': len(matches), 'players': matches,
                'mean': statistics.mean(r['overall'] for r in matches) if complete else None}

    def leagues(self):
        output = []
        for code in LEAGUES:
            path = self.cache / f'{code}-2324.csv'
            if not path.exists():
                url = f'https://www.football-data.co.uk/mmz4281/2324/{code}.csv'
                with urllib.request.urlopen(url, timeout=45) as response:
                    path.write_bytes(response.read())
            self.register(path, f'https://www.football-data.co.uk/mmz4281/2324/{code}.csv')
            raw = list(csv.DictReader(path.open(encoding='utf-8-sig')))
            table = defaultdict(lambda: [0, 0, 0])
            for r in raw:
                h, a = r['HomeTeam'], r['AwayTeam']
                hg, ag = int(r['FTHG']), int(r['FTAG'])
                for name, gf, ga in [(h, hg, ag), (a, ag, hg)]:
                    table[name][0] += 3 if gf > ga else 1 if gf == ga else 0
                    table[name][1] += gf-ga
                    table[name][2] += gf
            ranked = sorted(table, key=lambda n: (-table[n][0], -table[n][1], -table[n][2], n))
            edge = max(1, len(ranked)//5)
            for i, r in enumerate(raw):
                when = datetime.strptime(r['Date'], '%d/%m/%Y').date().isoformat()
                if when < EDITIONS[24]['available']:
                    self.excluded.append({'source': code, 'row': i, 'reason': 'before-rating-availability'})
                    continue
                ids = [self.aliases['footballData'][code][r[k]]['teamId'] for k in ['HomeTeam', 'AwayTeam']]
                teams = [self.teams[24][id] for id in ids]
                stats = []
                for side in ['H', 'A']:
                    stats.append({key: number(r.get(column)) for key, column in {
                        'goals': f'FT{side}G', 'shots': f'{side}S', 'onTarget': f'{side}ST',
                        'fouls': f'{side}F', 'corners': f'{side}C', 'yellowCards': f'{side}Y', 'redCards': f'{side}R'}.items()})
                positions = [ranked.index(r[k])+1 for k in ['HomeTeam', 'AwayTeam']]
                output.append({'id': f'fd-{code}-2324-{i}', 'date': when, 'source': 'Football-Data',
                               'competition': code, 'family': 'league', 'edition': 24,
                               'ratingDate': teams[0]['update_as_of'], 'teams': [r['HomeTeam'], r['AwayTeam']],
                               'fcTeamIds': ids, 'ratings': {'teamOVR': [int(t['overall']) for t in teams], 'actualXI': None},
                               'stats': stats, 'neutral': False, 'finalPointsRanks': positions,
                               'topVsBottom': min(positions) <= edge and max(positions) > len(ranked)-edge,
                               'sourceFile': path.name})
        return output

    def cups(self):
        inputs = []
        for edition, setting in EDITIONS.items():
            competitions = [('eng.fa', 'FA Cup'), ('eng.league_cup', 'League Cup')]
            if edition == 24:
                competitions.append(('uefa.champions', 'UEFA Champions League'))
            for league, family in competitions:
                for year in [setting['season'], setting['season']+1]:
                    data = self.get(f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates={year}&limit=1000', f'scoreboards/{league}-{year}.json')
                    for event in data.get('events', []):
                        when = event['date'][:10]
                        if not setting['available'] <= when < f"{setting['season']+1}-07-01":
                            continue
                        competitors = sorted(event['competitions'][0]['competitors'], key=lambda c: c['homeAway'] != 'home')
                        teams = [self.team(c['team']['displayName'], edition) for c in competitors]
                        if not all(teams):
                            self.excluded.append({'source': league, 'id': event['id'], 'edition': edition,
                                                  'teams': [c['team']['displayName'] for c in competitors], 'reason': 'unrated-or-unresolved-team'})
                            continue
                        inputs.append((event['id'], league, family, edition, teams))

        def collect(item):
            id, league, family, edition, teams = item
            try:
                data = self.get(f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event={id}', f'summaries/{league}-{id}.json')
                comp = data['header']['competitions'][0]
                status = comp['status']['type']
                # FA penalty finals necessarily followed extra time. Historical
                # ESPN aggregate boxes cannot reliably split 90 from 120 min.
                extra = any(token in status['name'] for token in ['EXTRA', 'AET', 'OVERTIME']) or (league == 'eng.fa' and 'PEN' in status['name'])
                if not status.get('completed') or extra:
                    return None, {'source': league, 'id': id, 'reason': 'extra-time-or-not-complete', 'status': status['name']}
                opponents = sorted(comp['competitors'], key=lambda c: c['homeAway'] != 'home')
                boxes = {str(r['team']['id']): r for r in data.get('boxscore', {}).get('teams', [])}
                rosters = {str(r['team']['id']): r for r in data.get('rosters', [])}
                stats, lineups = [], []
                for i, c in enumerate(opponents):
                    values = {r['name']: number(r.get('displayValue')) for r in boxes.get(str(c['id']), {}).get('statistics', [])}
                    row = {ESPN_METRICS[k]: v for k, v in values.items() if k in ESPN_METRICS}
                    row['goals'] = number(c['score'])
                    row['passCompletionPct'] = 100*row['completedPasses']/row['passes'] if row.get('passes') and row.get('completedPasses') is not None else None
                    stats.append(row)
                    lineups.append(self.xi(rosters.get(str(c['id']), {}), edition, teams[i]))
                quality = []
                if all(s.get('passes') == 0 for s in stats):
                    # Some historical ESPN boxes use zero placeholders for the
                    # entire passing/tracking block. A completed 90-minute
                    # match cannot contain zero passes by both teams.
                    for row in stats:
                        for key in ['passes','completedPasses','passCompletionPct','interceptions',
                                    'tackleAttempts','wonTackles','clearances','longBalls',
                                    'accurateLongBalls','crosses','accurateCrosses']:
                            if row.get(key) == 0:
                                row[key] = None
                    quality.append('historical-zero-passing-block-treated-as-missing')
                if any(s.get('shots') is None or s.get('onTarget') is None for s in stats):
                    return None, {'source': league, 'id': id, 'reason': 'missing-shots-boxscore'}
                actual = [r['mean'] for r in lineups] if all(r['mean'] is not None for r in lineups) else None
                return {'id': f'espn-{league}-{id}', 'date': comp['date'][:10], 'source': 'ESPN',
                        'sourceUrl': f'https://www.espn.com/soccer/matchstats/_/gameId/{id}',
                        'competition': family, 'family': 'cup', 'edition': edition,
                        'ratingDate': teams[0]['update_as_of'], 'teams': [c['team']['displayName'] for c in opponents],
                        'fcTeamIds': [int(t['team_id']) for t in teams],
                        'ratings': {'teamOVR': [int(t['overall']) for t in teams], 'actualXI': actual},
                        'stats': stats, 'lineupCoverage': lineups, 'neutral': comp.get('neutralSite', False),
                        'status': status['name'], 'qualityNotes': quality,
                        'sourceFile': f'summaries/{league}-{id}.json'}, None
            except Exception as error:
                return None, {'source': league, 'id': id, 'reason': 'fetch-or-parse-failure', 'message': str(error)}

        output = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            for i, (result, excluded) in enumerate(executor.map(collect, inputs)):
                if result:
                    output.append(result)
                else:
                    self.excluded.append(excluded)
                if (i+1) % 25 == 0:
                    print(f'cup summaries {i+1}/{len(inputs)}; included {len(output)}', flush=True)
        return output


def main():
    cache, target = [pathlib.Path(p).resolve() for p in sys.argv[1:3]]
    builder = Builder(cache)
    matches = builder.leagues() + builder.cups()
    if len({r['id'] for r in matches}) != len(matches):
        raise ValueError('Duplicate real matches')
    groups = {}
    for family in ['league', 'cup']:
        for kind in ['teamOVR', 'actualXI']:
            for gap in ['equal', '0-2', '3-5', '6-9', '10-14', '15-19', '20+']:
                rows = [r for r in matches if r['family'] == family and r['ratings'][kind] is not None
                        and bucket(abs(r['ratings'][kind][0]-r['ratings'][kind][1])) == gap
                        and all(s.get('redCards') == 0 for s in r['stats'])]
                groups[f'{family}/{kind}/noRed/{gap}'] = panel(rows, kind)
    groups['league/teamOVR/topVsBottom'] = panel([r for r in matches if r.get('topVsBottom')], 'teamOVR')
    groups['league/finalRank/topVsBottom'] = panel([r for r in matches if r.get('topVsBottom')], 'teamOVR', 'final-rank')
    fm = json.loads((ROOT / 'fm24-strength-crosscheck.json').read_text(encoding='utf8'))
    fm_teams = {r['fcTeamId']: r for r in fm['teams']}
    fm_pairs = []
    for row in matches:
        if row['edition'] != 24 or not all(id in fm_teams for id in row['fcTeamIds']):
            continue
        ratings = [fm_teams[id]['rating'] for id in row['fcTeamIds']]
        fc = row['ratings']['teamOVR']
        fm_pairs.append({'matchId': row['id'], 'fmCommunityRating': ratings,
                         'fcTeamOVR': fc, 'sameOrder': (ratings[0]-ratings[1])*(fc[0]-fc[1]) > 0,
                         'tiedInEither': ratings[0] == ratings[1] or fc[0] == fc[1]})
    reference = {'version': 1, 'retrievedAt': datetime.now(timezone.utc).isoformat(),
                 'method': {'ratings': 'Career-mode base FC/FIFA ratings; editions kept separate in match records; no FUT upgrades.',
                            'ratingSnapshot': 'Source as-of date and conservative release availability; no later ratings substituted.',
                            'actualXI': 'Exactly 11 unique matched starters per side, otherwise missing; never fill missing players with a club average.',
                            'teamOVR': 'Published team OVR is a proxy, not the actual starting XI mean; panels never mix the two.',
                            'lineupNames': 'Unique exact full/short name preferred within club, then globally; unique initial+surname fallback recorded explicitly, never fuzzy similarity.',
                            'missing': 'Missing metric remains missing, never zero; each metric reports n.',
                            'extraTime': 'Extra-time aggregate cup boxes excluded; FA penalty finals excluded. League totals are regulation plus added time.',
                            'strong': 'Higher FC score, home side used for exact ties and counted explicitly.',
                            'headBottom': 'Retrospective final points/GD/GF order, top and bottom floor(N/5); descriptive label, not a pre-match predictor or official H2H tie-break.',
                            'FM': 'Separate archived community FM rating cross-check, not mixed with FC OVR or claimed to be raw CA/2.',
                            'limits': 'Observed outcomes conditional on ratings, not a causal tactical effect or mandatory per-match limits.'},
                 'ratingSources': {'publisher': 'Stefano Leone, EA Sports FC 24 complete player dataset / SoFIFA',
                                   'url': 'https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset',
                                   'version': 4, 'publisherLicense': 'CC0: Public Domain; raw files not redistributed here',
                                   'editions': EDITIONS,
                                   'availabilitySources': [
                                       'https://news.ea.com/press-releases/press-releases-details/2018/EA-Announces-UEFA-Champions-League-in-EA-SPORTS-FIFA-19-Available-September-28/default.aspx',
                                       'https://www.ea.com/ea-play/news/fifa-23-release-dates',
                                       'https://news.ea.com/press-releases/press-releases-details/2023/Electronic-Arts-Sets-out-Vision-for-EA-SPORTS-FC-and-Reveals-First-Look-at-EA-SPORTS-FC-24-Gameplay/default.aspx']},
                 'coverage': {'matches': len(matches), 'leagues': sum(r['family']=='league' for r in matches),
                              'cups': sum(r['family']=='cup' for r in matches),
                              'completeActualXI': sum(r['ratings']['actualXI'] is not None for r in matches),
                              'excludedReasons': dict(Counter(r['reason'] for r in builder.excluded))},
                 'fmCrosscheck': {**fm, 'matchedPairs': fm_pairs,
                                  'scope': 'Ordinal cross-check only. Community formula and original FM24 patch date unknown; never a dated pre-match CA estimate or numerical conversion into FC.'},
                 'sources': builder.sources, 'groups': groups, 'matches': matches, 'excluded': builder.excluded}
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(reference, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(reference['coverage']))


if __name__ == '__main__':
    main()
