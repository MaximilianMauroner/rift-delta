import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScoutingReports } from '../src/domains/scouting/build.ts'
import { METRICS, type PlayerReport } from '../src/domains/scouting/report.ts'
import {
  formatMeasure, joinNames, leadTone, ordinal, poolRowLabel, poolSegments, readingSentence, shortDate, signed, trackPosition, verdictBadge, middleHalf,
} from '../src/views/scouting/presentation.ts'
import { FOCAL, focalSeason, scoutingGame } from './scoutingFixtures.ts'

const artifact = buildScoutingReports(focalSeason(), 'a'.repeat(64))
const focal = artifact.players.find(player => player.id === FOCAL)!

test('numbers and dates read as text, with a true minus and no time zone shift', () => {
  assert.equal(signed(1234.4), '+1,234')
  assert.equal(signed(-100), '−100')
  assert.equal(signed(0.2), '0')
  assert.equal(shortDate('2026-06-01'), '1 Jun')
  assert.equal(ordinal(11), '11th')
  assert.equal(ordinal(22), '22nd')
  assert.equal(joinNames(['A']), 'A')
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B and C')
  assert.deepEqual([leadTone(300), leadTone(-300), leadTone(0), leadTone(null)], ['up', 'down', 'none', 'none'])
})

test('the reading is one sentence of counts from the report, with no verdict wording', () => {
  assert.equal(readingSentence(focal, artifact.roles),
    'Played Riser, Steady and Fresh most in the last 90 days, won 60% of 40 games overall, and led by 500 or more at 15 minutes in 33% of games with lane data (mid average 24%).')
  const idle: PlayerReport = { ...focal, pool: focal.pool.map(row => ({ ...row, recent: { games: 0, wins: 0 } })), recent: { games: 0, champions: 0 } }
  assert.equal(readingSentence(idle, artifact.roles),
    'No games in the last 90 days. Won 60% of 40 games on record, and led by 500 or more at 15 minutes in 33% of games with lane data (mid average 24%).')
  const noLane = readingSentence({ ...focal, lane: { games: 0, behind: 0, even: 0, ahead: 0 } }, artifact.roles)
  assert.equal(noLane, 'Played Riser, Steady and Fresh most in the last 90 days, won 60% of 40 games overall.')
  for (const sentence of [readingSentence(focal, artifact.roles), noLane]) assert.doesNotMatch(sentence, /above|below|better|worse|will/i)
})

test('the pool strip heat follows games against the largest champion and keeps the rest as Others', () => {
  assert.deepEqual(poolSegments(focal).map(segment => [segment.name, segment.games, segment.heat]),
    [['Riser', 4, 6], ['Steady', 3, 5], ['Fresh', 2, 3], ['Fader', 1, 2]])
  const hidden = poolSegments({ recent: { games: 10, champions: 4 }, pool: [{ ...focal.pool[0]!, recent: { games: 6, wins: 3 } }] })
  assert.deepEqual(hidden.map(segment => [segment.name, segment.games, segment.heat, segment.size]), [[focal.pool[0]!.champion, 6, 6, 'big'], ['Others', 4, 0, 'big']])
})

test('comparison wording exists only for the four verdicts', () => {
  assert.deepEqual(['small-sample', 'above', 'below', 'close'].map(value => verdictBadge(value as Parameters<typeof verdictBadge>[0]).label),
    ['Small sample', 'Above average', 'Below average', 'Close to average'])
})

test('rank strips put the stronger side on the right for both directions', () => {
  const gd15 = METRICS.find(metric => metric.key === 'gd15')!
  const deaths = METRICS.find(metric => metric.key === 'deaths')!
  const band = { min: 0, max: 10, q1: 4, median: 5, q3: 6 }
  assert.equal(trackPosition(gd15, band, 10), 98)
  assert.equal(trackPosition(gd15, band, 0), 2)
  assert.equal(trackPosition(deaths, band, 0), 98)
  assert.equal(trackPosition(deaths, band, 99), 2)
  assert.equal(trackPosition(gd15, { ...band, min: 5, max: 5 }, 5), 50)
  const half = middleHalf(deaths, band)
  assert.ok(Math.abs(half.left - 40.4) < 1e-9 && Math.abs(half.width - 19.2) < 1e-9)
})

test('values keep their format and a missing value is a dash', () => {
  const by = (key: string) => METRICS.find(metric => metric.key === key)!
  assert.equal(formatMeasure(by('gd15'), -99.6), '−100')
  assert.equal(formatMeasure(by('csm'), 8.636), '8.64')
  assert.equal(formatMeasure(by('dpm'), 1234.4), '1,234')
  assert.equal(formatMeasure(by('kp'), 0.604), '60%')
  assert.equal(formatMeasure(by('kp'), null), '–')
})

test('a pool row label states its sample and what it leaves out', () => {
  const steady = focal.pool.find(row => row.champion === 'Steady')!
  assert.match(poolRowLabel(steady), /^Steady\. Last 90 days: 3 games, 3 won and 0 lost\. Win rate 100% over 13 games\. Lane lead at 15 minutes \+600 over 13 games\.$/)
  const fresh = focal.pool.find(row => row.champion === 'Fresh')!
  assert.match(poolRowLabel(fresh), /new lately/)
  assert.match(poolRowLabel(fresh), /Lane lead not shown, too few lane games\.$/)
})

test('the reading of a player with one game uses singular wording and keeps the lane facts', () => {
  const artifact = buildScoutingReports([scoutingGame({ id: 'one', date: '2026-06-01', lead: 600 })], 'a'.repeat(64))
  const player = artifact.players.find(entry => entry.id === FOCAL)!
  assert.equal(readingSentence(player, artifact.roles), 'Played Pick most in the last 90 days, won 100% of 1 game overall, and led by 500 or more at 15 minutes in 100% of games with lane data (mid average 50%).')
})
