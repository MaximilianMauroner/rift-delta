#!/usr/bin/env python3
"""Exploratory, identity-linked, chronological player-score evaluation."""

import argparse
from collections import Counter, defaultdict, deque
from datetime import date, timedelta
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import warnings

import numpy as np
import scipy
import sklearn
from scipy.optimize import minimize
from scipy.special import expit, logit
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from player_score_data import (
    FEATURES, INTERNATIONAL, LANE, REGIONAL, ROLES, ROLE_NAMES, SIDES,
    chronological_folds, game_features, read_games, role_values,
)

ROOT = Path(__file__).resolve().parents[2]
PROTOCOL = ROOT / 'tools/calibration/ranking-accuracy-protocol.json'
MIN_HISTORY = 10
HALF_LIFE_DAYS = 90.
LAG_DAYS = 7
RIDGE_C = .1
NORMAL_80 = 1.2815515655446004
LOG_ODDS_PER_RATING = math.log(10.) / 400.


def event_weight(game):
    if game.league == 'WLDs':
        return 2.7857142857142856 if game.playoff else 1.9285714285714286
    if game.league == 'MSI':
        return 2.4285714285714284 if game.playoff else 1.9285714285714286
    if game.league == 'FST':
        return 2.4285714285714284
    if game.league == 'EWC':
        return 1.5714285714285714
    return 1.5714285714285714 if game.playoff else 1.


def rated_games(fit, validation, fit_through):
    ratings, home, pending = {}, {}, deque()
    fit_rated, valid_rated = [], []

    def apply(item):
        game = item['game']
        delta = 24. * item['weight'] * (game.won_blue - item['expected'])
        ratings[game.teams[0]] += delta
        ratings[game.teams[1]] -= delta
        if game.league in REGIONAL:
            home[game.teams[0]] = home[game.teams[1]] = game.league

    def context(game, update_initial):
        leagues = ((game.league, game.league) if game.league in REGIONAL
                   else tuple(home.get(team, 'Unknown') for team in game.teams))
        strengths = [REGIONAL.get(league, (.65, 1375.)) for league in leagues]
        if update_initial:
            for team, (_, prior) in zip(game.teams, strengths):
                ratings.setdefault(team, prior)
        values = [ratings.get(team, prior) for team, (_, prior) in zip(game.teams, strengths)]
        diff = values[0] - values[1]
        weight = event_weight(game)
        return {'game': game, 'elo': diff, 'expected': float(expit(diff * LOG_ODDS_PER_RATING)),
                'weight': weight * (strengths[0][0] + strengths[1][0]) / 2.,
                'side_weights': (weight * strengths[0][0], weight * strengths[1][0]), 'leagues': leagues}

    by_day = defaultdict(list)
    for game in fit:
        by_day[game.date].append(game)
    for day in sorted(by_day):
        lagged = (date.fromisoformat(day) - timedelta(days=LAG_DAYS)).isoformat()
        while pending and pending[0]['game'].date <= lagged:
            apply(pending.popleft())
        batch = [context(game, True) for game in sorted(by_day[day], key=lambda game: game.id)]
        fit_rated.extend(batch)
        pending.extend(batch)
    cutoff = (date.fromisoformat(fit_through) - timedelta(days=LAG_DAYS)).isoformat()
    while pending and pending[0]['game'].date <= cutoff:
        apply(pending.popleft())
    for game in validation:
        valid_rated.append(context(game, False))
    return fit_rated, valid_rated


def fit_models(fit):
    complete = [row for row in fit if game_features(row['game']) is not None]
    count_features = sum(len(FEATURES[role]) for role in ROLES)
    if len(complete) < max(50, 3 * (count_features + 1)) or len({row['game'].won_blue for row in complete}) != 2:
        return None
    x = np.array([game_features(row['game']) + [row['elo']] for row in complete], dtype=float)
    y = np.array([row['game'].won_blue for row in complete])
    weights = np.array([row['weight'] for row in complete])
    if np.any(np.std(x[:, :-1], axis=0) < 1e-12):
        return None
    with warnings.catch_warnings():
        warnings.simplefilter('error', ConvergenceWarning)
        model = make_pipeline(StandardScaler(), LogisticRegression(C=RIDGE_C, max_iter=3000))
        model.fit(x, y, logisticregression__sample_weight=weights)
        baseline = make_pipeline(StandardScaler(), LogisticRegression(C=RIDGE_C, max_iter=3000))
        baseline.fit(np.array([[row['elo']] for row in fit]),
                     np.array([row['game'].won_blue for row in fit]),
                     logisticregression__sample_weight=np.array([row['weight'] for row in fit]))
    beta = (model[-1].coef_[0] / model[0].scale_)[:-1]
    coefficients = {}
    centers = {}
    index = 0
    for role in ROLES:
        for metric in FEATURES[role]:
            coefficients[role, metric] = float(beta[index])
            observations = [(row['game'].player(side, role).stats[metric], row['weight'])
                            for row in complete for side in SIDES]
            centers[role, metric] = float(np.average([v for v, _ in observations], weights=[w for _, w in observations]))
            index += 1
    return baseline, coefficients, centers, len(complete)


def player_contribution(player, coefficients, centers):
    if role_values(player) is None:
        return None
    return sum(coefficients[player.role, metric] * (player.stats[metric] - centers[player.role, metric])
               * (.5 if metric in LANE else 1.) for metric in FEATURES[player.role])


def weighted_mean(values):
    weight = sum(w for _, w in values)
    squared = sum(w * w for _, w in values)
    return sum(value * w for value, w in values) / weight, weight * weight / squared


def fit_player_estimates(fit, fit_through, coefficients, centers):
    observations = defaultdict(list)
    cutoff = date.fromisoformat(fit_through)
    for row in fit:
        game = row['game']
        decay = 2. ** (-(cutoff - date.fromisoformat(game.date)).days / HALF_LIFE_DAYS)
        for player in game.players:
            value = player_contribution(player, coefficients, centers)
            if value is not None:
                side = SIDES.index(player.side)
                observations[player.key].append((value, row['side_weights'][side] * decay))
    by_role = defaultdict(list)
    for (identity, role), values in observations.items():
        mean, effective = weighted_mean(values)
        by_role[role].append((identity, values, mean, effective))
    models, estimates = {}, {}
    for role in ROLES:
        players = by_role[role]
        if len(players) < 2:
            continue
        numerator, denominator = 0., 0.
        for _, values, mean, _ in players:
            total_weight = sum(weight for _, weight in values)
            numerator += sum(weight * (value - mean) ** 2 for value, weight in values)
            denominator += total_weight - sum(weight * weight for _, weight in values) / total_weight
        if denominator <= 0:
            continue
        within = numerator / denominator
        between = max(0., float(np.var([p[2] for p in players], ddof=1))
                      - float(np.mean([within / p[3] for p in players])))
        all_values = [item for _, values, _, _ in players for item in values]
        center, _ = weighted_mean(all_values)
        models[role] = {'within': within, 'between': between, 'players': len(players)}
        for identity, values, mean, effective in players:
            shrink = effective * between / (effective * between + within) if between + within > 0 else 0.
            variance = between * (1. - shrink)
            estimates[identity, role] = {'mean': center + shrink * (mean - center), 'variance': variance,
                                         'games': len(values), 'effective': effective}
    return models, estimates


def export_v3(fit):
    bridge = ROOT / 'tools/calibration/player-stats-v3.ts'
    runner = ROOT / 'node_modules/.bin/tsx'
    if not runner.exists():
        raise RuntimeError('Install project dependencies with pnpm install before running the v3 comparison')
    games = []
    for row in fit:
        game = row['game']
        players = []
        for side in SIDES:
            appearances = []
            for role in ROLES:
                player = game.player(side, role)
                stats = player.stats
                values = {'side': side.lower(), 'won': bool(game.won_blue) == (side == 'Blue'),
                          'kills': stats['kills'], 'deaths': stats['deaths'], 'assists': stats['assists'],
                          'killParticipation': stats['kp'], 'goldDiffAt15': stats['golddiffat15'],
                          'xpDiffAt15': stats['xpdiffat15'], 'csDiffAt15': stats['csdiffat15'],
                          'wardsPlacedPerMinute': stats['wpm'], 'wardsClearedPerMinute': stats['wcpm']}
                appearances.append({'id': player_key(player), 'role': ROLE_NAMES[role],
                                    'stats': {key: value for key, value in values.items() if value is not None}})
            players.append(appearances)
        games.append({'id': game.id, 'date': game.date, 'event': game.event, 'seriesId': game.series,
                      'league': game.league, 'playoff': game.playoff, 'teamA': game.teams[0], 'teamB': game.teams[1],
                      'leagueA': row['leagues'][0], 'leagueB': row['leagues'][1],
                      'winner': game.teams[0 if game.won_blue else 1], 'playersA': players[0], 'playersB': players[1]})
    process = subprocess.run([str(runner), str(bridge)], input=json.dumps(games, ensure_ascii=False, allow_nan=False),
                             text=True, capture_output=True, check=False, cwd=ROOT)
    if process.returncode:
        raise RuntimeError(f'v3 comparison failed: {process.stderr.strip()}')
    return json.loads(process.stdout)


def player_key(player):
    return json.dumps([player.identity, player.role], ensure_ascii=False, separators=(',', ':'))


def log_loss(y, probability):
    probability = np.clip(probability, 1e-12, 1. - 1e-12)
    return -y * np.log(probability) - (1. - y) * np.log1p(-probability)


def paired_interval(rows, loss_difference, weights, iterations, seed, minimum_clusters):
    groups = defaultdict(list)
    for i, row in enumerate(rows):
        groups[row['game'].series].append(i)
    if len(groups) < minimum_clusters:
        return {'status': 'unavailable', 'series': len(groups)}
    sums = np.array([[sum(weights[i] for i in indexes), sum(weights[i] * loss_difference[i] for i in indexes)]
                     for indexes in groups.values()])
    rng = np.random.default_rng(seed)
    samples = rng.integers(0, len(sums), size=(iterations, len(sums)))
    selected = sums[samples].sum(axis=1)
    draws = selected[:, 1] / selected[:, 0]
    return {'status': 'estimated', 'series': len(groups), 'low': float(np.quantile(draws, .025)),
            'high': float(np.quantile(draws, .975))}


def calibration_slopes(rows, baseline, role_differences, iterations, seed, minimum_clusters):
    count = len(rows)
    active = np.flatnonzero(np.std(role_differences, axis=0) > 1e-9)
    if len(active) == 0 or count < max(50, 10 * (len(active) + 1)):
        return {'status': 'unavailable', 'reason': 'insufficient varying role scores'}
    scales = np.std(role_differences[:, active], axis=0)
    x = np.column_stack([np.ones(count), role_differences[:, active] / scales])
    y = np.array([row['game'].won_blue for row in rows])
    weights = np.array([row['weight'] for row in rows])
    offset = logit(np.clip(baseline, 1e-9, 1. - 1e-9))
    penalty = np.r_[0., np.full(len(active), 1e-6)]

    def objective(beta):
        z = offset + x @ beta
        loss = np.sum(weights * (np.logaddexp(0., z) - y * z)) + .5 * np.sum(penalty * beta ** 2)
        gradient = x.T @ (weights * (expit(z) - y)) + penalty * beta
        return loss, gradient

    result = minimize(objective, np.zeros(x.shape[1]), jac=True, method='BFGS')
    if not result.success and np.linalg.norm(result.jac) > 1e-4:
        return {'status': 'unavailable', 'reason': 'calibration fit did not converge'}
    p = expit(offset + x @ result.x)
    hessian = x.T @ ((weights * p * (1. - p))[:, None] * x) + np.diag(penalty)
    if np.linalg.cond(hessian) > 1e12:
        return {'status': 'unavailable', 'reason': 'calibration is not identifiable'}
    groups = defaultdict(lambda: np.zeros(x.shape[1]))
    for i, row in enumerate(rows):
        groups[row['game'].series] += x[i] * weights[i] * (y[i] - p[i])
    if len(groups) < minimum_clusters:
        return {'status': 'unavailable', 'reason': 'too few series'}
    influence = np.array(list(groups.values())) @ np.linalg.inv(hessian).T
    rng = np.random.default_rng(seed)
    draws = rng.multinomial(len(influence), np.full(len(influence), 1. / len(influence)), size=iterations)
    sampled = result.x + (draws - 1) @ influence
    slopes = {}
    for role in ROLES:
        role_index = ROLES.index(role)
        if role_index not in active:
            slopes[role] = None
            continue
        j = int(np.flatnonzero(active == role_index)[0]) + 1
        distribution = sampled[:, j] / scales[j - 1]
        slopes[role] = {'estimate': float(result.x[j] / scales[j - 1]),
                        'low': float(np.quantile(distribution, .025)), 'high': float(np.quantile(distribution, .975))}
    return {'status': 'estimated', 'series': len(groups), 'slopes': slopes,
            'interval': 'linearized series-cluster bootstrap, conditional on fitted scores'}


def future_reliability(validation, models, estimates, coefficients, centers):
    observations = defaultdict(list)
    for row in validation:
        for player in row['game'].players:
            value = player_contribution(player, coefficients, centers)
            if value is not None:
                observations[player.key].append((value, row['side_weights'][SIDES.index(player.side)]))
    result = {}
    for role in ROLES:
        pairs, covered = [], []
        model = models.get(role)
        if not model or model['between'] <= 0:
            result[role] = {'status': 'unavailable', 'reason': 'no estimated between-player spread'}
            continue
        for key, values in observations.items():
            estimate = estimates.get(key)
            if key[1] != role or len(values) < 5 or not estimate or estimate['games'] < MIN_HISTORY:
                continue
            future, effective = weighted_mean(values)
            sd = math.sqrt(estimate['variance'] + model['within'] / effective)
            pairs.append((estimate['mean'], future))
            covered.append(abs(future - estimate['mean']) <= NORMAL_80 * sd)
        correlation = None
        if len(pairs) >= 3 and np.std(np.array(pairs), axis=0).min() > 0:
            correlation = float(np.corrcoef(np.array(pairs).T)[0, 1])
        result[role] = {'players': len(pairs), 'future_games_minimum': 5,
                        'correlation': correlation, 'coverage80': float(np.mean(covered)) if covered else None}
    return result


def evaluate_fold(games, event_spans, fold, protocol):
    sections = chronological_folds(games, fold['fitThrough'], fold['validateThrough'], event_spans)
    evidence_cutoff = (date.fromisoformat(fold['fitThrough']) - timedelta(days=LAG_DAYS)).isoformat()
    fit_evidence = [game for game in sections['fit'] if game.date <= evidence_cutoff]
    fit, validation = rated_games(fit_evidence, sections['validation'], fold['fitThrough'])
    report = {'fitThrough': fold['fitThrough'], 'validateThrough': fold['validateThrough'],
              'games': {name: len(items) for name, items in sections.items()},
              'fitEvidenceThrough': evidence_cutoff, 'fitEvidenceGames': len(fit_evidence),
              'validationLeagues': dict(Counter(row['game'].league for row in validation))}
    models = fit_models(fit)
    if models is None:
        report['status'] = 'unavailable: insufficient or constant first-stage data'
        return report
    baseline, coefficients, centers, complete_count = models
    role_models, estimates = fit_player_estimates(fit, fold['fitThrough'], coefficients, centers)
    v3 = export_v3(fit)
    rows, differences, old_differences = [], [], []
    for row in validation:
        game = row['game']
        players = [(game.player('Blue', role), game.player('Red', role)) for role in ROLES]
        if not all(estimates.get(p.key, {}).get('games', 0) >= MIN_HISTORY and player_key(p) in v3
                   for pair in players for p in pair):
            continue
        rows.append(row)
        differences.append([estimates[a.key]['mean'] - estimates[b.key]['mean']
                            + (v3[player_key(a)]['leagueAnchor'] - v3[player_key(b)]['leagueAnchor']) * LOG_ODDS_PER_RATING
                            for a, b in players])
        old_differences.append([v3[player_key(a)]['score'] - v3[player_key(b)]['score'] for a, b in players])
    report.update({'stage1CompleteGames': complete_count,
                   'stage1CompleteLeagues': dict(Counter(row['game'].league for row in fit if game_features(row['game']) is not None)),
                   'coefficients': {role: {metric: coefficients[role, metric] for metric in FEATURES[role]} for role in ROLES},
                   'centers': {role: {metric: centers[role, metric] for metric in FEATURES[role]} for role in ROLES},
                   'teamBaseline': {'coefficientPerRatingPoint': float(baseline[-1].coef_[0, 0] / baseline[0].scale_[0]),
                                    'intercept': float(baseline[-1].intercept_[0]
                                                       - baseline[-1].coef_[0, 0] * baseline[0].mean_[0] / baseline[0].scale_[0])},
                   'eligibleGames': len(rows),
                   'eligibleLeagues': dict(Counter(row['game'].league for row in rows)),
                   'roleVariance': role_models, 'priorStatGamesRequired': MIN_HISTORY})
    if not rows:
        report['status'] = 'unavailable: no eligible validation games'
        return report
    y = np.array([row['game'].won_blue for row in rows])
    w = np.array([row['weight'] for row in rows])
    p_base = baseline.predict_proba(np.array([[row['elo']] for row in rows]))[:, 1]
    diff = np.array(differences)
    old = np.array(old_differences)
    p_v3 = expit(logit(np.clip(p_base, 1e-9, 1. - 1e-9)) + old.sum(axis=1) * LOG_ODDS_PER_RATING)
    p_v4 = expit(logit(np.clip(p_base, 1e-9, 1. - 1e-9)) + diff.sum(axis=1))
    losses = {'team': log_loss(y, p_base), 'teamPlusV3': log_loss(y, p_v3), 'teamPlusCandidate': log_loss(y, p_v4)}
    iterations = protocol['bootstrapIterations']
    seed = protocol['seed']
    minimum_clusters = protocol['minimumIndependentClusters']
    report['weightedLogLoss'] = {key: float(np.average(value, weights=w)) for key, value in losses.items()}
    report['improvementOverTeam'] = {key: {'estimate': float(np.average(losses['team'] - losses[key], weights=w)),
                                           'interval95': paired_interval(rows, losses['team'] - losses[key], w,
                                                                        iterations, seed, minimum_clusters)}
                                     for key in ('teamPlusV3', 'teamPlusCandidate')}
    candidate_delta = losses['teamPlusV3'] - losses['teamPlusCandidate']
    report['candidateOverV3'] = {'estimate': float(np.average(candidate_delta, weights=w)),
                                 'interval95': paired_interval(rows, candidate_delta, w,
                                                              iterations, seed, minimum_clusters)}
    report['leagueResults'] = {}
    for league in sorted({row['game'].league for row in rows}):
        indices = np.array([i for i, row in enumerate(rows) if row['game'].league == league])
        report['leagueResults'][league] = {
            'games': len(indices),
            'weightedLogLoss': {key: float(np.average(values[indices], weights=w[indices])) for key, values in losses.items()},
        }
    report['roleCalibration'] = calibration_slopes(rows, p_base, diff, iterations, seed, minimum_clusters)
    report['forwardReliability'] = future_reliability(validation, role_models, estimates, coefficients, centers)
    report['status'] = 'exploratory'
    return report


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def model_provenance():
    try:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        diff = subprocess.check_output(['git', 'diff', '--binary', 'HEAD', '--', 'src/domains/rankings', 'src/shared'], cwd=ROOT)
        return {'commit': commit, 'modelWorkingTreeDiffSha256': hashlib.sha256(diff).hexdigest(),
                'modelWorkingTreeDirty': bool(diff)}
    except (OSError, subprocess.CalledProcessError):
        return {'status': 'git provenance unavailable'}


def main():
    parser = argparse.ArgumentParser(description=__doc__, epilog=(
        'Install the project Node dependencies and the packages in tools/calibration/player-score-requirements.txt. '
        'All inputs are local research captures. The tool reads them without contacting providers or publishing data.'
    ))
    parser.add_argument('--players', nargs='+', required=True, help='ChainCC player CSV gzip files')
    parser.add_argument('--leaguepedia', nargs='+', required=True, help='Leaguepedia ScoreboardGames CSV files')
    parser.add_argument('--links', required=True, help='game-to-Leaguepedia identity links JSON')
    parser.add_argument('--redirects', required=True, help='Leaguepedia PlayerRedirects CSV')
    parser.add_argument('--conflicts', required=True, help='JSON array of player identities to exclude')
    args = parser.parse_args()
    protocol = json.loads(PROTOCOL.read_text(encoding='utf-8'))
    paths = args.players + args.leaguepedia + [args.links, args.redirects, args.conflicts, str(PROTOCOL),
                                             __file__, str(ROOT / 'tools/calibration/player_score_data.py'),
                                             str(ROOT / 'tools/calibration/player-stats-v3.ts'),
                                             str(ROOT / 'tools/calibration/player-score-requirements.txt')]
    games, coverage, event_spans = read_games(args.players, args.links, args.leaguepedia, args.redirects, args.conflicts)
    result = {'status': 'exploratory; inspected historical data; no production change', 'modelProvenance': model_provenance(),
              'softwareVersions': {'python': sys.version.split()[0], 'numpy': np.__version__, 'scipy': scipy.__version__,
                                   'scikitLearn': sklearn.__version__,
                                   'node': subprocess.check_output(['node', '--version'], cwd=ROOT, text=True).strip()},
              'inputSha256': {str(path): digest(path) for path in paths}, 'coverage': coverage,
              'method': {'baseline': 'simplified team Elo and league priors, frozen with the same seven-day evidence lag as player scores',
                         'candidate': 'same-game outcome weights fitted on earlier games; player means shrunk by role and anchored to prior league strength',
                         'v3': 'production Stats Power computation with prior league anchors, converted as Elo points',
                         'prediction': 'team log-odds plus the sum of prior player score differences',
                         'intervalCoverage': 'naive 80% interval for future mean stat contributions; assumes independent games',
                         'limitations': ['previously inspected data', 'identity links and redirects can be wrong',
                                         'league and event weights are approximate', 'no causal player or role claim',
                                         'v3 is not a production forecast', 'v3 uses default league anchors',
                                         'the additive score-to-win mapping is assumed, not independently calibrated',
                                         'intervals omit coefficient and prior uncertainty',
                                         'series bootstrap does not capture repeated players or teams across series',
                                         'event boundaries depend on the captured wiki games',
                                         'validation coverage is not random', 'team and player effects are confounded']},
              'folds': [evaluate_fold(games, event_spans, fold, protocol) for fold in protocol['folds']]}
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError, ConvergenceWarning) as error:
        print(f'Player score evaluation failed: {error}', file=sys.stderr)
        sys.exit(1)
