import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeChampions } from '../src/domains/champions/analyze.ts'
import { demoDataset } from '../tools/champions/demo.ts'
import { renderReport } from '../tools/champions/report.ts'
import { normalizeRiotExport } from '../tools/champions/riot.ts'
import { riotFixture } from './fixtures/champions/riot.ts'

function playerFixture() {
  const data = structuredClone(demoDataset)
  data.matches = data.matches.slice(0, 4).reverse()
  data.analysis.player = { playerKey: 'selected-private-key', role: 'TOP' }
  for (const match of data.matches) match.participants[0].playerKey = 'selected-private-key'
  return data
}


test('explicit selected-player request gives chronological role-specific history without identity output', () => {
  const data = playerFixture()
  const output = analyzeChampions(data)
  const player = output.privatePlayerHistory!
  assert.equal(player.distinctGames, 4)
  assert.equal(player.wins, 2)
  assert.deepEqual(player.championResults.map(c => [c.championId, c.distinctGames]), [[1, 2], [11, 2]])
  assert.equal(player.concentration.poolSize, 2)
  assert.deepEqual(player.matches.map(m => m.startedAt), data.matches.map(m => m.startedAt).reverse())
  const html = renderReport(output)
  assert.match(html, /PRIVATE PLAYER REVIEW REQUESTED/)
  assert.doesNotMatch(JSON.stringify(output) + html, /selected-private-key/)
  data.analysis.player = { playerKey: 'missing', role: 'TOP' }
  const missing = analyzeChampions(data).privatePlayerHistory!
  assert.equal(missing.status, 'unavailable')
  assert.equal(missing.winRate, null)
  assert.equal(missing.concentration.poolSize, null)
  delete data.analysis.player
  assert.equal(analyzeChampions(data).privatePlayerHistory, null)
})

test('within-role noise approximation uses disjoint cells and subtracts variances with weighted-mean adjustment', () => {
  const data = structuredClone(demoDataset)
  data.matches = data.matches.slice(0, 4)
  data.matches.forEach((m, i) => {
    m.participants.forEach((p, j) => { p.championId = j + 1 })
    m.winnerTeamId = i < 3 ? 100 : 200
    m.participants.forEach(p => { p.won = p.teamId === m.winnerTeamId })
    if (i >= 2) m.participants[5].championId = 16
  })
  const row = analyzeChampions(data).withinRoleVariability.find(c => c.championId === 1 && c.relation === 'enemy' && c.otherRole === 'TOP')!
  assert.equal(row.supportedGames, 4)
  assert.equal(row.supportedCells, 2)
  assert.equal(row.coverage, 1)
  assert.equal(row.meanWinRate, 0.75)
  assert.equal(row.observedVariance, 0.0625)
  assert.equal(row.estimatedSamplingVariance, 0.0625)
  assert.equal(row.estimatedExcessSd, 0)
  assert.match(row.label, /unresolved/)
  data.analysis.minCellGames = 3
  const unsupported = analyzeChampions(data).withinRoleVariability.find(c => c.championId === 1 && c.relation === 'enemy' && c.otherRole === 'TOP')!
  assert.equal(unsupported.coverage, 0)
  assert.equal(unsupported.estimatedExcessSd, null)
})

test('Riot adapter checks source patch and queue and drops provider identity fields', () => {
  const input = riotFixture()
  const output = analyzeChampions(normalizeRiotExport(input))
  assert.equal(output.scope.patch, '16.18')
  assert.equal(output.coverage.distinctGames, 2)
  assert.equal(output.privatePlayerHistory!.distinctGames, 2)
  assert.doesNotMatch(JSON.stringify(output), /puuid|Never emit|fake-provider|opaque-local-key/)
  input.matches[0].info.queueId = 440
  assert.throws(() => normalizeRiotExport(input), /scope mismatch/)
})

test('tiny counter probabilities retain precision rather than cancel to zero', () => {
  const data = structuredClone(demoDataset)
  data.analysis.counterAvailability = { q: 1e-20, k: 3 }
  const probability = analyzeChampions(data).counterAvailability!.probability
  assert.ok(Math.abs(probability / 3e-20 - 1) < 1e-12)
})

test('Riot adapter keeps unknown positions and partial damage unavailable', () => {
  const input = riotFixture()
  input.matches[0].info.participants[0].teamPosition = 'INVALID'
  delete input.matches[0].info.participants[0].trueDamageDealtToChampions
  const output = analyzeChampions(normalizeRiotExport(input))
  assert.equal(output.coverage.unknownRoleParticipants, 1)
  assert.equal(output.damageComposition.find(c => c.championId === 11 && c.role === null)!.missingDamageGames, 1)
})

test('Riot adapter refuses milliseconds, foreign platform, multiple winners, and collapsed identity mappings', () => {
  const milliseconds = riotFixture()
  milliseconds.matches[0].info.gameDuration *= 1000
  assert.throws(() => normalizeRiotExport(milliseconds), /duration disagrees/)
  const foreign = riotFixture()
  foreign.matches[0].metadata.matchId = 'KR_1'
  assert.throws(() => normalizeRiotExport(foreign), /scope mismatch/)
  const winners = riotFixture()
  winners.matches[0].info.participants.forEach(p => { p.win = true })
  assert.throws(() => normalizeRiotExport(winners), /winning team/)
  const identities = { ...riotFixture(), playerKeysByPuuid: { one: 'same', two: 'same' } }
  assert.throws(() => normalizeRiotExport(identities), /distinct opaque/)
})

test('Riot adapter refuses missing modern end timestamps and early-ended matches before calculation', () => {
  const legacy = riotFixture()
  legacy.matches[0].info.gameDuration *= 1000
  Reflect.deleteProperty(legacy.matches[0].info, 'gameEndTimestamp')
  assert.throws(() => normalizeRiotExport(legacy), /gameEndTimestamp/)
  const early = riotFixture()
  early.matches[0].info.participants[0].gameEndedInEarlySurrender = true
  assert.throws(() => normalizeRiotExport(early), /Early-surrender or remake flag/)
  const unknown = riotFixture()
  Reflect.deleteProperty(unknown.matches[0].info.participants[0], 'gameEndedInEarlySurrender')
  assert.throws(() => normalizeRiotExport(unknown), /gameEndedInEarlySurrender/)
  const reversed = riotFixture()
  reversed.matches[0].info.gameEndTimestamp = reversed.matches[0].info.gameStartTimestamp
  assert.throws(() => normalizeRiotExport(reversed), /end must follow/)
})

test('concentration reaches an exact decimal threshold without counting an extra champion', () => {
  const data = structuredClone(demoDataset)
  data.analysis.concentrationThreshold = 0.14
  data.matches = Array.from({ length: 25 }, (_, i) => {
    const match = structuredClone(demoDataset.matches[0])
    match.matchId = `concentration-${i}`
    match.startedAt = new Date(Date.parse(data.window.start) + i * 600000).toISOString()
    match.participants.forEach((p, j) => { p.championId = i < 7 && j === 0 ? 1 : 1000 + i * 10 + j })
    return match
  })
  const report = analyzeChampions(data)
  const top = report.concentration.find(c => c.role === 'TOP')!
  assert.equal(top.appearances, 50)
  assert.equal(top.poolSize, 1)
  assert.equal(top.cumulativeShare, 0.14)
  const html = renderReport(report)
  assert.match(html, /Table preview is limited. Complete data is in analysis.json/)
  for (const body of html.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? []) {
    assert.ok((body.match(/<tr>/g) ?? []).length <= 200)
  }
})
