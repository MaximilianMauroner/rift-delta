import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScoutingReports } from '../src/domains/scouting/build.ts'
import { parseScoutingArtifact, reportKey, scoutingField, scoutingMeasures, staleDays, verdict, wilson95, type PlayerReport } from '../src/domains/scouting/report.ts'
import { FOCAL, focalSeason, scoutingGame } from './scoutingFixtures.ts'

const hash = 'a'.repeat(64)
const focal = (games = focalSeason()) => buildScoutingReports(games, hash).players.find(player => player.id === FOCAL)!

test('a game is counted only when both teams are complete and every champion is read correctly', () => {
  const missing = scoutingGame({ id: 'missing', date: '2026-06-01' })
  missing.teamARoster!.players[0]!.stats!.champion = 'none'
  const duplicate = scoutingGame({ id: 'duplicate', date: '2026-06-01' })
  duplicate.teamBRoster!.players[0]!.stats!.champion = duplicate.teamARoster!.players[0]!.stats!.champion
  const short = scoutingGame({ id: 'short', date: '2026-06-01' })
  short.teamARoster!.players.pop()
  const artifact = buildScoutingReports([
    scoutingGame({ id: 'good', date: '2026-06-01' }), scoutingGame({ id: 'other', date: '2026-06-01', provider: 'leaguepedia-cargo' }), missing, duplicate, short,
  ], hash)
  assert.equal(artifact.countedGames, 1)
  assert.equal(artifact.excludedGames, 4)
  assert.deepEqual(artifact.excludedByReason, { 'other-provider': 1, 'incomplete-pair': 1, 'missing-team-id': 0, 'champion-identity': 2 })
})

test('a player needs twenty games and a recent game to have a report', () => {
  const games = focalSeason()
  assert.equal(buildScoutingReports(games.slice(-19), hash).players.length, 0)
  assert.equal(buildScoutingReports(games, hash).players.some(player => player.id === FOCAL), true)
  const later = scoutingGame({ id: 'later', date: '2027-07-01', teams: ['c', 'd'] })
  assert.equal(buildScoutingReports([...games, later], hash).players.some(player => player.id === FOCAL), false)
})

test('the pool tags each champion from its share of recent games against its share of all games', () => {
  const player = focal()
  assert.deepEqual(player.pool.map(row => [row.champion, row.trend, row.recent.games, row.all.games]), [
    ['Riser', 'rising', 4, 6], ['Steady', 'steady', 3, 13], ['Fresh', 'new', 2, 2], ['Fader', 'fading', 1, 11], ['Veteran', 'dropped', 0, 8],
  ])
  assert.deepEqual(player.recent, { games: 10, champions: 4 })
  assert.deepEqual(player.pool.find(row => row.champion === 'Steady')!.lead, { mean: 600, games: 13 })
  assert.equal(player.pool.find(row => row.champion === 'Fresh')!.lead, null)
  assert.deepEqual(player.pool.find(row => row.champion === 'Riser')!.last.map(game => game.date), ['2026-06-08', '2026-06-06', '2026-06-03', '2026-06-01', '2026-01-30'])
})

test('lane facts count games by lead, win rate when behind and ahead, deathless games and the best and worst game', () => {
  const player = focal()
  assert.deepEqual(player.lane, { games: 40, behind: 6, even: 21, ahead: 13 })
  assert.deepEqual(player.facts.behind, { games: 6, hits: 0 })
  assert.deepEqual(player.facts.ahead, { games: 13, hits: 13 })
  assert.deepEqual(player.facts.deathless, { games: 40, hits: 13 })
  assert.deepEqual([player.facts.best?.lead, player.facts.best?.champion, player.facts.best?.date], [600, 'Steady', '2026-06-07'])
  assert.deepEqual([player.facts.worst?.lead, player.facts.worst?.champion, player.facts.worst?.date], [-700, 'Riser', '2026-06-08'])
  assert.deepEqual(player.facts.hardest, { against: 'Bane', games: 6, laneGames: 6, lead: -700 })
  assert.deepEqual(player.facts.easiest, { against: 'Boon', games: 13, laneGames: 13, lead: 600 })
  assert.equal(player.observed.gd15?.mean, 90)
  assert.equal(player.observed.deaths?.mean, 0.675)
})

test('a matchup needs five games with lane data before it is named', () => {
  const lane = (against: string, keep: number) => {
    let seen = 0
    return focal(focalSeason(options => options.against === against && ++seen > keep ? { ...options, noLane: true } : options))
  }
  const four = lane('Bane', 4)
  assert.equal(four.facts.hardest?.against, 'Foe')
  assert.equal(four.facts.easiest?.against, 'Boon')
  const five = lane('Bane', 5)
  assert.deepEqual(five.facts.hardest, { against: 'Bane', games: 6, laneGames: 5, lead: -700 })
  const only = focal(focalSeason(options => options.against === 'Foe' ? options : { ...options, noLane: true }))
  assert.equal(only.facts.hardest?.against, 'Foe')
  assert.equal(only.facts.easiest, null)
})

test('games in one series keep play order from the game number, or from the input when there is none', () => {
  const padding = focalSeason().slice(0, 20)
  const series = (numbered: boolean) => ['Third', 'First', 'Second'].map((champion, i) => scoutingGame({
    id: `series-${champion}`, date: '2026-07-01', datetimeUtc: '2026-07-01T08:00:00Z', champion, gameNumber: numbered ? [3, 1, 2][i] : undefined,
  }))
  const numbered = focal([...padding, ...series(true)])
  assert.deepEqual(numbered.form.slice(0, 3).map(game => game.champion), ['Third', 'Second', 'First'])
  const unnumbered = focal([...padding, ...series(false)])
  assert.deepEqual(unnumbered.form.slice(0, 3).map(game => game.champion), ['Second', 'First', 'Third'])
})

test('input order does not change the artifact when games have distinct times', () => {
  const games = focalSeason()
  assert.deepEqual(buildScoutingReports([...games].reverse(), hash), buildScoutingReports(games, hash))
})

test('role baselines add up every player in the role, including players without a report', () => {
  const artifact = buildScoutingReports(focalSeason().slice(0, 12), hash)
  assert.equal(artifact.players.length, 0)
  assert.deepEqual(artifact.roles.Mid.lane, { games: 24, behind: 0, even: 24, ahead: 0 })
  assert.deepEqual(artifact.roles.Mid.deathless, { games: 24, hits: 0 })
  assert.deepEqual(artifact.roles.Top.lane, { games: 24, behind: 0, even: 24, ahead: 0 })
})

test('the artifact survives a JSON round trip and the parser rejects values the builder cannot produce', () => {
  const artifact = buildScoutingReports(focalSeason(), hash)
  assert.deepEqual(parseScoutingArtifact(JSON.parse(JSON.stringify(artifact))), artifact)
  const copy = () => JSON.parse(JSON.stringify(artifact))
  // These mutations break the artifact shape on purpose, so the value is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutations: Array<[string, (value: any) => void]> = [
    ['version', value => { value.version = 'scouting-reports-v0' }],
    ['rules', value => { value.rules.windowDays = 30 }],
    ['unknown key', value => { value.players[0].extra = 1 }],
    ['wins over games', value => { value.players[0].wins = value.players[0].games + 1 }],
    ['form out of order', value => { value.players[0].form.reverse() }],
    ['duplicate player', value => { value.players.push(structuredClone(value.players[0])) }],
    ['bad date', value => { value.players[0].last = '2026-13-01' }],
    ['lane that does not add up', value => { value.players[0].lane.even += 1 }],
    ['unknown trend', value => { value.players[0].pool[0].trend = 'hot' }],
    ['kill participation above one', value => { value.players[0].observed.kp.mean = 1.5 }],
  ]
  for (const [name, mutate] of mutations) {
    const value = copy()
    mutate(value)
    assert.throws(() => parseScoutingArtifact(value), /Invalid scouting reports/, name)
  }
})

test('a verdict needs fifteen games and a whole 95% range on one side of the average', () => {
  assert.equal(verdict({ games: 14, hits: 14 }, 0.3), 'small-sample')
  assert.equal(verdict({ games: 71, hits: 33 }, 0.287), 'above')
  assert.equal(verdict({ games: 52, hits: 43 }, 0.713), 'close')
  assert.equal(verdict({ games: 60, hits: 6 }, 0.3), 'below')
  const [low, high] = wilson95(33, 71)
  assert.ok(low > 0.287 && high < 0.6)
})

function reportWith(id: string, games: number, observed: PlayerReport['observed']): PlayerReport {
  return { ...focal(), id, games, observed }
}

test('ranks use only peers with enough games, put fewer deaths first and leave small samples unranked', () => {
  const peers = [10, 20, 30, 40].map((value, i) => reportWith(`p${i}`, 80, { gd15: { mean: value, games: 80 }, deaths: { mean: 5 - i, games: 80 } }))
  const rookie = reportWith('rookie', 30, { gd15: { mean: 99, games: 30 } })
  const thin = reportWith('thin', 80, { gd15: { mean: 99, games: 10 } })
  const field = scoutingField([...peers, rookie, thin], 'Mid')
  const measure = (player: PlayerReport, key: string) => scoutingMeasures(player, field).find(entry => entry.metric.key === key)!
  assert.deepEqual([measure(peers[3]!, 'gd15').rank, measure(peers[3]!, 'gd15').of], [1, 4])
  assert.deepEqual([measure(peers[0]!, 'gd15').rank, measure(peers[0]!, 'gd15').of], [4, 4])
  assert.equal(measure(peers[3]!, 'deaths').rank, 1)
  assert.equal(measure(peers[0]!, 'deaths').rank, 4)
  assert.equal(measure(rookie, 'gd15').rank, null)
  assert.equal(measure(thin, 'gd15').rank, null)
  assert.deepEqual(field.get('gd15')!.band, { min: 10, max: 40, q1: 17.5, median: 25, q3: 32.5 })
  assert.equal(scoutingField(peers, 'Top').size, 0)
})

test('the report key and stale gap come from the identity and the newest game', () => {
  assert.equal(reportKey({ id: 'oe:player:1', role: 'Mid' }), 'oe:player:1|Mid')
  assert.equal(staleDays({ last: '2026-06-14' }, '2026-07-10'), 26)
})
