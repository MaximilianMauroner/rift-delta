import assert from 'node:assert/strict'
import test from 'node:test'
import { boardHeadline, headlineScope } from '../src/views/rankings/boardHeadline.ts'
import { publishedRatingScale } from '../src/domains/rankings/internal/policy/modelConfig.ts'
import { isNearTie, nearTieGroups, nearTiePositions } from '../src/domains/rankings/internal/queries/nearTies.ts'
import type { RankingSummaryStanding } from '../src/domains/rankings/internal/projections/snapshot.ts'

const model = { version: 'model-v1', configHash: 'hash-v1', ratingScale: publishedRatingScale }

test('a gap inside the uncertainty is a near tie and a large gap is not', () => {
  assert.equal(isNearTie(standing('HLE', 2304), standing('BLG', 2275), model), true)
  assert.equal(isNearTie(standing('BLG', 2275), standing('GEN', 2138), model), false)
})

test('near-tie groups hold teams within reach of the group leader, not a chain of small gaps', () => {
  const rows = [standing('A', 2300), standing('B', 2290), standing('C', 2150), standing('D', 2140), standing('E', 2130), standing('F', 1900)]
  const groups = nearTieGroups(rows, model)
  assert.deepEqual(groups.map((group) => group.map((row) => row.code)), [['A', 'B'], ['C', 'D', 'E'], ['F']])

  // Every neighbour gap is 30 points, but the ends are 120 apart.
  const ladder = [standing('P', 2120), standing('Q', 2090), standing('R', 2060), standing('S', 2030), standing('T', 2000)]
  assert.deepEqual(nearTieGroups(ladder, model).map((group) => group.map((row) => row.code)), [['P', 'Q'], ['R', 'S'], ['T']])

  const positions = nearTiePositions(groups, (row) => row.code)
  assert.deepEqual(Object.fromEntries(positions), { A: 'start', B: 'end', C: 'start', D: 'middle', E: 'end' })
})

test('headline calls a coin-flip lead close to level', () => {
  const headline = boardHeadline([standing('Hanwha Life Esports', 2304), standing('Bilibili Gaming', 2275)], model)
  assert.match(headline ?? '', /^Hanwha Life Esports lead, but Bilibili Gaming are close to level: 5\d% per game\.$/)
})

test('headline states a clear lead as a Power gap and game edge', () => {
  const headline = boardHeadline([standing('Alpha', 2400), standing('Beta', 2200)], model)
  assert.match(headline ?? '', /^Alpha lead Beta by 200 Power, a \d\d% game edge\.$/)
})

test('headline handles scopes with one or no ranked team', () => {
  assert.equal(boardHeadline([], model), undefined)
  assert.equal(boardHeadline([standing('Solo', 2000)], model), 'Solo lead the ranking.')
})

test('a filtered board names its filter and leads with the filtered leader', () => {
  const scope = headlineScope({ region: 'LEC', tier: 'All', search: '' })
  const headline = boardHeadline([standing('G2 Esports', 2070), standing('Karmine Corp', 1917)], model, scope)
  assert.match(headline ?? '', /^LEC: G2 Esports lead Karmine Corp by 153 Power, a \d\d% game edge\.$/)
  assert.equal(boardHeadline([standing('Movistar KOI', 1797)], model, scope), 'LEC: Movistar KOI is the only ranked team.')
  assert.equal(boardHeadline([], model, scope), undefined)
})

test('the headline scope lists every active filter and is empty without one', () => {
  assert.equal(headlineScope({ region: 'All', tier: 'All', search: '  ' }), undefined)
  assert.equal(headlineScope({ region: 'LCK', tier: 'A', search: 'gen', tournament: 'MSI 2026' }), 'LCK, A tier, MSI 2026, search "gen"')
})

function standing(team: string, rating: number): RankingSummaryStanding {
  return { team, code: team, rating, uncertainty: 65 } as RankingSummaryStanding
}
