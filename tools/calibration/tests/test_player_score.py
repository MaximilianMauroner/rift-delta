import csv
import gzip
import json
import sys
import tempfile
import unittest
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from player_score_data import Game, Player, ROLES, SIDES, chronological_folds, game_features, linked_game, normalized, read_games
from evaluate_player_score import calibration_slopes, evaluate_fold, export_v3, paired_interval, player_key, rated_games


def game(game_id, date, event):
    players = []
    for side in SIDES:
        sign = 1 if side == 'Blue' else -1
        for role in ROLES:
            stats = {'golddiffat15': sign * 100., 'xpdiffat15': sign * 80.,
                     'csdiffat15': sign * 10., 'kp': .7, 'wpm': 1., 'wcpm': .3,
                     'kills': 2., 'deaths': 1., 'assists': 3., 'teamkills': 10.}
            players.append(Player(f'{side}-{role}', role, side, stats))
    return Game(game_id, date, event, game_id, 'LCK', ('alpha', 'beta'), 1, False, tuple(players))


def linked_fixture():
    rows = []
    redirects = {}
    linked = {}
    wiki = {'GameId': 'wiki-1', 'DateTime UTC': '2025-01-01 12:00:00', 'OverviewPage': 'LCK/2025', 'MatchId': 'match'}
    for index, side in enumerate(SIDES, 1):
        names = [f'{side}-{role}' for role in ROLES]
        champs = [f'champion-{role}' for role in ROLES]
        wiki[f'Team{index}'] = f'Team {side}'
        wiki[f'Team{index}Players'] = ','.join(names)
        wiki[f'Team{index}Picks'] = ','.join(champs)
        linked[side] = dict(zip(ROLES, names))
        for role, name, champ in zip(ROLES, names, champs):
            redirects[normalized(name)] = {name}
            rows.append({'game_id': 'game', 'side': side, 'position': role, 'date': '2025-01-01 12:00:00',
                         'league': 'LCK', 'playoffs': 'FALSE', 'team_name': f'Team {side}', 'result': str(side == 'Blue'),
                         'playername': name, 'champion': champ, 'gamelength': '1800',
                         'kills': '2', 'deaths': '1', 'assists': '3', 'teamkills': '10',
                         'golddiffat15': '0', 'xpdiffat15': '0', 'csdiffat15': '0', 'wpm': '1', 'wcpm': '.3'})
    return rows, {'game': 'wiki-1', 'match': 'match', 'players': linked}, wiki, redirects


class PlayerScoreDataTests(unittest.TestCase):
    def test_fold_withholds_every_game_from_tournaments_crossing_a_boundary(self):
        games = [game('fit', '2025-02-01', 'fit'),
                 game('cross-early', '2025-03-30', 'cross'), game('cross-late', '2025-04-02', 'cross'),
                 game('valid', '2025-05-01', 'valid'), game('future', '2025-08-01', 'future')]
        spans = {'fit': ('2025-02-01', '2025-02-01'), 'cross': ('2025-03-30', '2025-04-02'),
                 'valid': ('2025-05-01', '2025-05-01'), 'future': ('2025-08-01', '2025-08-01')}
        result = chronological_folds(games, '2025-03-31', '2025-06-30', spans)
        self.assertEqual([g.id for g in result['fit']], ['fit'])
        self.assertEqual([g.id for g in result['validation']], ['valid'])
        self.assertEqual([g.id for g in result['crosses_boundary']], ['cross-early', 'cross-late'])
        self.assertEqual([g.id for g in result['future']], ['future'])

    def test_unlinked_wiki_games_still_determine_the_event_boundary(self):
        linked = [game('linked', '2025-03-20', 'event')]
        spans = {'event': ('2025-03-20', '2025-04-10')}
        result = chronological_folds(linked, '2025-03-31', '2025-06-30', spans)
        self.assertEqual([g.id for g in result['crosses_boundary']], ['linked'])
        self.assertEqual(result['fit'], [])

    def test_game_features_require_symmetric_lane_differences(self):
        sample = game('one', '2025-01-01', 'event')
        self.assertEqual(game_features(sample)[0], 100.)
        sample.player('Red', 'top').stats['golddiffat15'] = -90.
        self.assertIsNone(game_features(sample))
        sample.player('Red', 'top').stats['golddiffat15'] = None
        self.assertIsNone(game_features(sample))

    def test_link_requires_matching_teams_champions_names_and_identity(self):
        rows, link, wiki, redirects = linked_fixture()
        self.assertIsNotNone(linked_game('game', rows, link, wiki, redirects, set()))
        self.assertIsNone(linked_game('game', rows, link, wiki, redirects, {'Blue-top'}))
        rows[0]['champion'] = 'wrong'
        self.assertIsNone(linked_game('game', rows, link, wiki, redirects, set()))

    def test_ambiguous_wiki_games_do_not_resolve_to_a_player_lineup(self):
        rows, link, wiki, redirects = linked_fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            players = root / 'players.csv.gz'
            with gzip.open(players, 'wt', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=rows[0])
                writer.writeheader()
                writer.writerows(rows)
            wiki_path = root / 'wiki.csv'
            def write_wiki(entries):
                with wiki_path.open('w', newline='', encoding='utf-8') as stream:
                    writer = csv.DictWriter(stream, fieldnames=wiki)
                    writer.writeheader()
                    writer.writerows(entries)
            write_wiki([wiki])
            redirect_path = root / 'redirects.csv'
            with redirect_path.open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=('AllName', 'OverviewPage'))
                writer.writeheader()
                writer.writerows({'AllName': next(iter(value)), 'OverviewPage': next(iter(value))}
                                 for value in redirects.values())
            link_path, conflict_path = root / 'links.json', root / 'conflicts.json'
            link_path.write_text(json.dumps({'game': link}))
            conflict_path.write_text('[]')
            def load():
                return read_games([players], link_path, [wiki_path], redirect_path, conflict_path)
            self.assertEqual(len(load()[0]), 1)
            write_wiki([wiki, {**wiki, 'GameId': 'wiki-2', 'MatchId': 'other-match'}])
            games, counts, _ = load()
            self.assertEqual(games, [])
            self.assertEqual(counts['ambiguous-game-link'], 1)


class PlayerScoreEvaluationTests(unittest.TestCase):
    def test_validation_results_cannot_change_the_frozen_team_ratings(self):
        fit = [game('first', '2025-01-01', 'first'), game('second', '2025-01-20', 'second')]
        later = [game('later', '2025-03-01', 'later'), game('last', '2025-03-20', 'last')]
        _, before = rated_games(fit, later, '2025-01-31')
        altered = [replace(item, won_blue=1 - item.won_blue) for item in later]
        _, after = rated_games(fit, altered, '2025-01-31')
        self.assertEqual([row['elo'] for row in before], [row['elo'] for row in after])
        self.assertEqual(before[0]['elo'], before[1]['elo'])

    def test_paired_interval_resamples_series_and_is_deterministic(self):
        rows = [{'game': replace(game(str(i), '2025-05-01', str(i)), series=str(i // 2))} for i in range(12)]
        differences = np.full(len(rows), .02)
        weights = np.ones(len(rows))
        first = paired_interval(rows, differences, weights, 1000, 7, 5)
        self.assertEqual(first, paired_interval(rows, differences, weights, 1000, 7, 5))
        self.assertEqual(first['series'], 6)
        self.assertAlmostEqual(first['low'], .02)
        self.assertAlmostEqual(first['high'], .02)
        self.assertEqual(paired_interval(rows[:8], differences[:8], weights[:8], 1000, 7, 5)['status'], 'unavailable')

    def test_calibration_does_not_claim_a_slope_when_scores_do_not_vary(self):
        rows = [{'game': game(str(i), '2025-05-01', str(i)), 'weight': 1.} for i in range(60)]
        result = calibration_slopes(rows, np.full(len(rows), .5), np.zeros((len(rows), 5)), 1000, 7, 5)
        self.assertEqual(result['status'], 'unavailable')

    def test_v3_comparison_uses_the_project_player_model(self):
        fit = [game(str(i), f'2025-01-0{i + 1}', str(i)) for i in range(4)]
        rated, _ = rated_games(fit, [], '2025-01-31')
        scores = export_v3(rated)
        blue = scores[player_key(fit[0].player('Blue', 'top'))]
        red = scores[player_key(fit[0].player('Red', 'top'))]
        self.assertGreater(blue['score'], red['score'])
        self.assertEqual(blue['leagueAnchor'], red['leagueAnchor'])

    def test_future_game_stats_cannot_change_forward_predictions(self):
        games = []
        for i in range(140):
            day = date(2025, 1, 1) + timedelta(days=i if i < 80 else i + 40)
            item = replace(game(str(i), day.isoformat(), f'event-{i}'), won_blue=i % 2)
            for player in item.players:
                sign = 1 if player.side == 'Blue' else -1
                phase = i * .31 + ROLES.index(player.role)
                player.stats.update({'golddiffat15': sign * (100 + 20 * np.sin(phase)),
                                     'xpdiffat15': sign * (80 + 15 * np.cos(phase)),
                                     'csdiffat15': sign * (10 + 3 * np.sin(phase * 1.3)),
                                     'kp': .6 + sign * .1 * np.sin(phase),
                                     'wpm': 1. + sign * .2 * np.cos(phase),
                                     'wcpm': .4 + sign * .1 * np.sin(phase * 1.2)})
            games.append(item)
        recent_fit = game('recent-fit', '2025-04-28', 'recent-fit')
        games.append(recent_fit)
        scores = {player_key(player): {'score': 100., 'leagueAnchor': 100.}
                  for item in games for player in item.players}
        spans = {item.event: (item.date, item.date) for item in games}
        fold = {'fitThrough': '2025-04-30', 'validateThrough': '2025-07-31'}
        protocol = {'bootstrapIterations': 100, 'seed': 7, 'minimumIndependentClusters': 5}
        with patch('evaluate_player_score.export_v3', return_value=scores):
            before = evaluate_fold(games, spans, fold, protocol)
            games[-1] = replace(recent_fit, won_blue=0)
            games[-1].player('Blue', 'top').stats['golddiffat15'] += 10000
            for item in games[80:-1]:
                item.player('Blue', 'top').stats['golddiffat15'] += 10000
            after = evaluate_fold(games, spans, fold, protocol)
        self.assertGreater(before['eligibleGames'], 0)
        self.assertEqual(before['fitEvidenceGames'], 80)
        self.assertEqual(before['weightedLogLoss'], after['weightedLogLoss'])


if __name__ == '__main__':
    unittest.main()
