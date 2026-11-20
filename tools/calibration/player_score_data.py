from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
import csv
import gzip
import json
import math
from pathlib import Path
import re
import unicodedata

ROLES = ('top', 'jng', 'mid', 'bot', 'sup')
SIDES = ('Blue', 'Red')
ROLE_NAMES = dict(zip(ROLES, ('Top', 'Jungle', 'Mid', 'Bot', 'Support')))
FEATURES = {
    'top': ('golddiffat15', 'xpdiffat15', 'csdiffat15'),
    'jng': ('golddiffat15', 'xpdiffat15', 'csdiffat15', 'kp'),
    'mid': ('golddiffat15', 'xpdiffat15', 'csdiffat15'),
    'bot': ('golddiffat15', 'xpdiffat15', 'csdiffat15'),
    'sup': ('kp', 'wpm', 'wcpm'),
}
LANE = frozenset(('golddiffat15', 'xpdiffat15', 'csdiffat15'))
REGIONAL = {
    'LCK': (1., 1500.), 'LPL': (1., 1500.), 'LEC': (.9, 1450.),
    'LCS': (.9, 1450.), 'LTA N': (.9, 1450.), 'LTA S': (.65, 1375.),
    'LCP': (.9, 1450.), 'CBLOL': (.65, 1375.),
}
INTERNATIONAL = frozenset(('WLDs', 'MSI', 'FST', 'EWC'))


@dataclass(frozen=True)
class Player:
    identity: str
    role: str
    side: str
    stats: dict

    @property
    def key(self):
        return self.identity, self.role


@dataclass(frozen=True)
class Game:
    id: str
    date: str
    event: str
    series: str
    league: str
    teams: tuple
    won_blue: int
    playoff: bool
    players: tuple

    def player(self, side, role):
        return next(p for p in self.players if p.side == side and p.role == role)


def normalized(value):
    decomposed = unicodedata.normalize('NFKD', str(value or '')).casefold()
    return ''.join(c for c in decomposed if c.isalnum() and not unicodedata.combining(c))


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def boolean(value):
    text = str(value).strip().lower()
    if text in ('true', '1'):
        return True
    if text in ('false', '0'):
        return False
    return None


def player_stats(row):
    duration = number(row.get('gamelength'))
    fields = ('kills', 'deaths', 'assists', 'teamkills', 'golddiffat15', 'xpdiffat15', 'csdiffat15', 'wpm', 'wcpm')
    result = {key: number(row.get(key)) for key in fields}
    for key in ('kills', 'deaths', 'assists', 'teamkills'):
        value = result[key]
        if value is not None and (value < 0 or not value.is_integer()):
            result[key] = None
    for key in ('wpm', 'wcpm'):
        if result[key] is not None and result[key] < 0:
            result[key] = None
    if duration is not None and duration < 900:
        for key in LANE:
            result[key] = None
    kills, assists, teamkills = (result[key] for key in ('kills', 'assists', 'teamkills'))
    kp = (kills + assists) / teamkills if kills is not None and assists is not None and teamkills else None
    result['kp'] = kp if kp is not None and 0 <= kp <= 1 else None
    return result


def role_values(player):
    values = [player.stats[key] for key in FEATURES[player.role]]
    return None if any(value is None for value in values) else values


def game_features(game):
    result = []
    for role in ROLES:
        a, b = (game.player(side, role) for side in SIDES)
        av, bv = role_values(a), role_values(b)
        if av is None or bv is None:
            return None
        for key, left, right in zip(FEATURES[role], av, bv):
            if key in LANE:
                if abs(left + right) > .01:
                    return None
                result.append(left)
            else:
                result.append(left - right)
    return result


def read_games(player_paths, link_path, wiki_paths, redirect_path, conflict_path):
    links = json.loads(Path(link_path).read_text(encoding='utf-8'))
    conflicts = set(json.loads(Path(conflict_path).read_text(encoding='utf-8')))
    redirects = defaultdict(set)
    with Path(redirect_path).open(newline='', encoding='utf-8-sig') as stream:
        for row in csv.DictReader(stream):
            if row['AllName'] and row['OverviewPage']:
                redirects[normalized(row['AllName'])].add(row['OverviewPage'])
    wiki = defaultdict(list)
    wiki_by_date_teams = defaultdict(list)
    event_dates = defaultdict(list)
    incomplete_events = set()
    for path in wiki_paths:
        with Path(path).open(newline='', encoding='utf-8-sig') as stream:
            for row in csv.DictReader(stream):
                wiki[row['GameId']].append(row)
                event = row['OverviewPage']
                if event:
                    try:
                        day = datetime.fromisoformat(row['DateTime UTC']).date().isoformat()
                        event_dates[event].append(day)
                        teams = tuple(sorted((normalized(row['Team1']), normalized(row['Team2']))))
                        wiki_by_date_teams[day, teams].append(row)
                    except (ValueError, TypeError):
                        incomplete_events.add(event)
    source = defaultdict(list)
    counts = Counter()
    for path in player_paths:
        with gzip.open(path, 'rt', newline='', encoding='utf-8-sig') as stream:
            for row in csv.DictReader(stream):
                if row['league'] not in REGIONAL and row['league'] not in INTERNATIONAL:
                    continue
                if row['position'] not in ROLES or row['side'] not in SIDES:
                    continue
                source[row['game_id']].append(row)
    reverse = Counter(link['game'] for key, link in links.items() if key in source)
    games = []
    for game_id, rows in source.items():
        link = links.get(game_id)
        if not link:
            counts['unlinked'] += 1
            continue
        if reverse[link['game']] != 1 or len(wiki[link['game']]) != 1:
            counts['ambiguous-game-link'] += 1
            continue
        game = linked_game(game_id, rows, link, wiki[link['game']][0], redirects, conflicts)
        if game is None:
            counts['invalid-or-conflicting-link'] += 1
            continue
        alternatives = wiki_by_date_teams[game.date, tuple(sorted(game.teams))]
        matches = [candidate for candidate in alternatives
                   if linked_game(game_id, rows, {'match': candidate['MatchId'], 'players': link['players']},
                                  candidate, redirects, conflicts) is not None]
        if len(matches) != 1 or matches[0]['GameId'] != link['game']:
            counts['ambiguous-game-link'] += 1
            continue
        games.append(game)
    series_events = defaultdict(set)
    for game in games:
        series_events[game.series].add(game.event)
    if any(len(events) != 1 for events in series_events.values()):
        raise ValueError('A linked series crosses tournament identities')
    counts['resolved'] = len(games)
    event_spans = {event: None if event in incomplete_events else (min(dates), max(dates))
                   for event, dates in event_dates.items()}
    return sorted(games, key=lambda game: (game.date, game.id)), dict(counts), event_spans


def linked_game(game_id, rows, link, wiki, redirects, conflicts):
    if len(rows) != 10 or len({(r['side'], r['position']) for r in rows}) != 10:
        return None
    if {r['side'] for r in rows} != set(SIDES) or {r['position'] for r in rows} != set(ROLES):
        return None
    if len({r['date'] for r in rows}) != 1 or len({r['league'] for r in rows}) != 1:
        return None
    try:
        when = datetime.fromisoformat(rows[0]['date'])
        wiki_when = datetime.fromisoformat(wiki['DateTime UTC'])
        if abs((when - wiki_when).total_seconds()) > 600:
            return None
    except (ValueError, TypeError):
        return None
    if not wiki['OverviewPage'] or not link['match'] or wiki['MatchId'] != link['match']:
        return None
    wiki_teams = [normalized(wiki['Team1']), normalized(wiki['Team2'])]
    if not all(wiki_teams) or wiki_teams[0] == wiki_teams[1]:
        return None
    players = []
    teams = []
    outcomes = []
    playoffs = {boolean(r['playoffs']) for r in rows}
    if len(playoffs) != 1 or None in playoffs:
        return None
    for side in SIDES:
        side_rows = [r for r in rows if r['side'] == side]
        if len(side_rows) != 5 or {r['position'] for r in side_rows} != set(ROLES):
            return None
        side_teams = {normalized(r['team_name']) for r in side_rows}
        side_outcomes = {boolean(r['result']) for r in side_rows}
        if len(side_teams) != 1 or len(side_outcomes) != 1 or None in side_outcomes:
            return None
        team = next(iter(side_teams))
        if team not in wiki_teams:
            return None
        index = wiki_teams.index(team) + 1
        picks = wiki[f'Team{index}Picks'].split(',')
        names = wiki[f'Team{index}Players'].split(',')
        if len(picks) != 5 or len(names) != 5:
            return None
        teams.append(team)
        outcomes.append(next(iter(side_outcomes)))
        for role, pick, name in zip(ROLES, picks, names):
            row = next(r for r in side_rows if r['position'] == role)
            candidates = redirects.get(normalized(name), set())
            identity = link.get('players', {}).get(side, {}).get(role)
            if len(candidates) != 1 or identity not in candidates or identity in conflicts:
                return None
            basename = re.sub(r'\s*\([^()]*\)\s*$', '', name).strip()
            aliases = redirects.get(normalized(row['playername']), set())
            if normalized(row['playername']) != normalized(basename) and not (len(aliases) == 1 and identity in aliases):
                return None
            if normalized(row['champion']) != normalized(pick):
                return None
            players.append(Player(identity, role, side, player_stats(row)))
    if teams[0] == teams[1] or outcomes[0] == outcomes[1] or len({p.identity for p in players}) != 10:
        return None
    return Game(game_id, when.date().isoformat(), wiki['OverviewPage'], link['match'], rows[0]['league'],
                tuple(teams), int(outcomes[0]), next(iter(playoffs)), tuple(players))


def chronological_folds(games, fit_through, validate_through, event_spans):
    groups = defaultdict(list)
    for game in games:
        groups[game.event].append(game)
    result = {'fit': [], 'validation': [], 'crosses_boundary': [], 'future': []}
    for event, event_games in groups.items():
        span = event_spans.get(event)
        if span is None:
            section = 'crosses_boundary'
        elif span[1] <= fit_through:
            section = 'fit'
        elif span[0] > fit_through and span[1] <= validate_through:
            section = 'validation'
        elif span[0] > validate_through:
            section = 'future'
        else:
            section = 'crosses_boundary'
        result[section].extend(event_games)
    return {key: sorted(value, key=lambda game: (game.date, game.id)) for key, value in result.items()}
