import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { analyzeChampions } from '../src/domains/champions/analyze.ts'
import type { ChampionDataset } from '../src/domains/champions/types.ts'
import { demoDataset } from '../tools/champions/demo.ts'
import { renderReport } from '../tools/champions/report.ts'

function fixture(games = 4): ChampionDataset {
  const data = structuredClone(demoDataset)
  data.matches = data.matches.slice(0, games)
  data.matches.forEach((match, index) => {
    match.winnerTeamId = index < 3 ? 100 : 200
    match.participants.forEach((p, i) => {
      p.championId = i + 1
      p.won = p.teamId === match.winnerTeamId
    })
  })
  return data
}
function near(actual: number | null, expected: number, tolerance = 1e-12) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) < tolerance, `${actual} differs from ${expected}`)
}

test('retained example equals the deterministic typed example', async () => {
  const json: unknown = JSON.parse(await readFile(new URL('./fixtures/champions/example.json', import.meta.url), 'utf8'))
  assert.deepEqual(json, demoDataset)
})

test('one game is one champion-role or directional pair observation, not ten samples', () => {
  const a = analyzeChampions(fixture(1))
  assert.equal(a.coverage.distinctGames, 1)
  assert.equal(a.coverage.participants, 10)
  assert.equal(a.championRoles.length, 10)
  assert.equal(a.enemyMatchups.length, 50)
  assert.equal(a.allySynergies.length, 40)
  assert.ok(a.championRoles.every(c => c.distinctGames === 1 && c.appearances === 1))
  assert.ok([...a.enemyMatchups, ...a.allySynergies].every(c => c.distinctGames === 1))
  const win = a.championRoles.find(c => c.championId === 1)!
  assert.equal(win.wins, 1)
  near(win.wilson95![0], 0.20654931437723745)
  near(win.wilson95![1], 1)
  near(a.enemyMatchups.find(c => c.focalChampionId === 1 && c.otherChampionId === 6)!.expectedProbability, 0.9)
  near(a.allySynergies.find(c => c.focalChampionId === 1 && c.otherChampionId === 2)!.expectedProbability, 0.9)
  assert.equal(a.roleInteractions.find(c => c.relation === 'enemy' && c.focalRole === 'TOP' && c.otherRole === 'JUNGLE')!.distinctGames, 1)
  assert.equal(a.variability[0].weightedSd, null)
})

test('Wilson and odds use independent hand-calculated four-game values', () => {
  const a = analyzeChampions(fixture())
  const top = a.championRoles.find(c => c.championId === 1)!
  assert.equal(top.distinctGames, 4)
  near(top.winRate, 0.75)
  near(top.wilson95![0], 0.30064184258240184)
  near(top.wilson95![1], 0.9544127391902995)
  // Jeffreys marginals are 7/10 and 3/10. Divided enemy odds are 49/9.
  const enemy = a.enemyMatchups.find(c => c.focalChampionId === 1 && c.otherChampionId === 7)!
  near(enemy.expectedProbability, 49 / 58)
  near(enemy.association, 3 / 4 - 49 / 58)
  const reverse = a.enemyMatchups.find(c => c.focalChampionId === 7 && c.otherChampionId === 1)!
  near(reverse.expectedProbability, 9 / 58)
  near(reverse.winRate, 1 / 4)
  near(reverse.association, -enemy.association)
  // Multiplying two 7/3 ally odds gives the same 49/9 baseline.
  const ally = a.allySynergies.find(c => c.focalChampionId === 1 && c.otherChampionId === 2)!
  near(ally.expectedProbability, 49 / 58)
  near(ally.association, 3 / 4 - 49 / 58)
  const allyReverse = a.allySynergies.find(c => c.focalChampionId === 2 && c.otherChampionId === 1)!
  near(allyReverse.association, ally.association)
  assert.equal(a.variability.find(c => c.championId === 1 && c.relation === 'enemy')!.noiseCorrectedVariance, null)
})

test('neutral odds baseline and scenario boundary values remain finite', () => {
  const data = fixture(2)
  data.matches[1].winnerTeamId = 200
  data.matches[1].participants.forEach(p => { p.won = p.teamId === 200 })
  near(analyzeChampions(data).enemyMatchups[0].expectedProbability, 0.5)
  const cases = [[0.2, 3, 0.488], [0, 5, 0], [1, 5, 1], [1, 0, 0], [0.5, 2, 0.75]]
  for (const [q, k, expected] of cases) {
    data.analysis.counterAvailability = { q, k }
    near(analyzeChampions(data).counterAvailability!.probability, expected)
  }
})

test('raw weighted spread separates mean, SD, and downside and declines noise correction', () => {
  const data = fixture()
  data.matches.forEach((match, i) => {
    match.winnerTeamId = i < 2 ? 100 : 200
    match.participants.forEach(p => { p.won = p.teamId === match.winnerTeamId })
    if (i >= 2) match.participants[7].championId = 18
  })
  const s = analyzeChampions(data).variability.find(c => c.championId === 1 && c.relation === 'enemy')!
  assert.equal(s.supportedCells, 6)
  // Four rate-1/2 cells have weight 1/5 each. Rate-1 and rate-0 cells have weight 1/10 each.
  near(s.meanWinRate, 0.5)
  near(s.weightedSd, Math.sqrt(0.05))
  near(s.downsideRms, Math.sqrt(0.025))
  assert.equal(s.noiseCorrectedVariance, null)
  assert.match(s.correctionUnavailableReason, /share games/)
})

test('pool evidence keeps an unobserved champion unavailable and uses the requested denominator', () => {
  const a = analyzeChampions(fixture())
  const pool = a.poolEvidence!
  assert.equal(pool.requestedChampionCount, 3)
  assert.equal(pool.observedRequestedChampions, 1)
  assert.equal(pool.distinctGamesWithPool, 4)
  assert.equal(pool.requestedChampions.find(c => c.championId === 999)!.status, 'unavailable')
  assert.deepEqual(pool.requestedChampions.find(c => c.championId === 999)!.evidence, { distinctGames: 0, wins: 0, winRate: null, wilson95: null })
  assert.equal(pool.opponentCoverage.length, 10)
  assert.equal(pool.opponentCoverage.filter(c => c.supportedPoolChampions === 1).length, 5)
  assert.equal(pool.opponentCoverage.filter(c => c.supportedPoolChampions === 0).length, 5)
  assert.ok(pool.opponentCoverage.every(c => c.requestedPoolChampions === 3))
  const top = a.concentration.find(c => c.role === 'TOP')!
  assert.equal(top.appearances, 8)
  assert.equal(top.poolSize, 2)
  near(top.cumulativeShare, 1)
})

test('unknown roles are excluded from estimates and retained in coverage and damage', () => {
  const data = fixture(1)
  data.matches[0].participants[0].role = null
  data.matches[0].participants[5].role = null
  const a = analyzeChampions(data)
  assert.equal(a.coverage.unknownRoleParticipants, 2)
  assert.equal(a.coverage.knownRoleParticipants, 8)
  assert.equal(a.coverage.gamesWithAllRoles, 0)
  assert.equal(a.championRoles.length, 8)
  assert.equal(a.enemyMatchups.length, 32)
  assert.equal(a.allySynergies.length, 24)
  assert.ok(!a.championRoles.some(c => c.role === 'TOP'))
  assert.equal(a.concentration.find(c => c.role === 'TOP')!.poolSize, null)
  assert.equal(a.damageComposition.filter(c => c.role === null).length, 2)
})

test('empty data has unavailable estimates and no invented damage, similarity, or pool evidence', () => {
  const a = analyzeChampions(fixture(0))
  assert.equal(a.coverage.distinctGames, 0)
  for (const rows of [a.championRoles, a.enemyMatchups, a.allySynergies, a.variability, a.roleInteractions, a.profileSimilarity, a.damageComposition, a.durationResults]) assert.equal(rows.length, 0)
  assert.ok(a.concentration.every(c => c.poolSize === null && c.cumulativeShare === null))
  assert.ok(a.poolEvidence!.requestedChampions.every(c => c.evidence.winRate === null))
  assert.match(renderReport(a), /No supported rows/)
})

test('missing damage and observed zero totals stay distinct from measured type shares', () => {
  const data = fixture(2)
  delete data.matches[0].participants[0].finalDamage
  data.matches[1].participants[0].finalDamage = { physical: 30, magic: 60, true: 10 }
  data.matches.forEach(m => { m.participants[1].finalDamage = { physical: 0, magic: 0, true: 0 } })
  const a = analyzeChampions(data)
  const top = a.damageComposition.find(c => c.championId === 1)!
  assert.equal(top.observedDamageGames, 1)
  assert.equal(top.missingDamageGames, 1)
  near(top.physicalShare, 0.3)
  near(top.magicShare, 0.6)
  near(top.trueShare, 0.1)
  const zero = a.damageComposition.find(c => c.championId === 2)!
  assert.equal(zero.observedDamageGames, 2)
  assert.equal(zero.physicalShare, null)
})

test('duration strata use inclusive minimum and exclusive maximum and remain NOT scaling', () => {
  const data = fixture(2)
  data.matches[0].durationSeconds = 1799
  data.matches[1].durationSeconds = 1800
  const a = analyzeChampions(data)
  const rows = a.durationResults.filter(c => c.championId === 1)
  assert.deepEqual(rows.map(c => c.distinctGames), [1, 1])
  assert.match(renderReport(a), /Results by final duration. NOT scaling/)
})

test('similarity compares common supported dimensions and declines constant-profile correlation', () => {
  const data = fixture()
  data.matches.forEach((m, i) => { if (i >= 2) m.participants[0].championId = 11 })
  const a = analyzeChampions(data)
  const pair = a.profileSimilarity.find(c => c.role === 'TOP' && c.championA === 1 && c.championB === 11)!
  assert.equal(pair.commonOpponentDimensions, 5)
  assert.notEqual(pair.associationRmse, null)
  assert.equal(pair.centeredCorrelation, null)
  data.analysis.minCellGames = 3
  const unsupported = analyzeChampions(data).profileSimilarity[0]
  assert.equal(unsupported.commonOpponentDimensions, 0)
  assert.equal(unsupported.associationRmse, null)
})

test('input is not mutated and aggregate output excludes match and player identity', () => {
  const data = fixture(1)
  data.matches[0].matchId = 'private-match-do-not-publish'
  data.matches[0].participants[0].participantId = 'private-participant-do-not-publish'
  data.matches[0].participants[0].playerKey = 'private-player-do-not-publish'
  const before = structuredClone(data)
  const a = analyzeChampions(data)
  assert.deepEqual(data, before)
  assert.equal(a.coverage.participantsWithOpaquePlayerKey, 1)
  const serialized = JSON.stringify(a) + renderReport(a)
  assert.doesNotMatch(serialized, /private-match|private-participant|private-player/)
})

test('HTML escapes user strings and consumes chart arrays without executable script or CDN', () => {
  const data = fixture(1)
  data.source.id = '<script>alert("source")</script>'
  data.source.selectionDescription = '<img src=x onerror=alert(1)>'
  data.analysis.durationWindows[0].label = '<svg onload="evil()">'
  data.scope.rankSnapshotLabel = "<a href='javascript:evil()'>x</a>"
  data.matches.forEach(m => { m.scope = structuredClone(data.scope) })
  const a = analyzeChampions(data)
  const html = renderReport(a)
  assert.match(html, /&lt;script&gt;alert\(&quot;source&quot;\)&lt;\/script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /&lt;svg onload=&quot;evil\(\)&quot;&gt;/)
  assert.doesNotMatch(html, /<script|<img|<a href|<svg onload/)
  assert.match(html, /SYNTHETIC DATA/)
  assert.match(html, /<svg xmlns=/)
  for (const title of ['Directional enemy matchups', 'Directional ally synergy', 'Variability separated', 'Role interactions', 'Champion profile similarity', 'Observed final damage', 'Observed role pool concentration', 'Caller pool evidence']) assert.ok(html.includes(title))
})

const invalidCases: Array<[string, (d: ChampionDataset) => void]> = [
  ['duplicate match', d => { d.matches.push(structuredClone(d.matches[0])) }],
  ['trim-normalized duplicate match', d => { d.matches[1].matchId = ` ${d.matches[0].matchId} ` }],
  ['conflicting duplicate match', d => { const m = structuredClone(d.matches[0]); m.durationSeconds += 1; d.matches.push(m) }],
  ['control character in ID', d => { d.matches[0].matchId = 'bad\u0000id' }],
  ['empty ID', d => { d.matches[0].matchId = '  ' }],
  ['duplicate participant', d => { d.matches[0].participants[1].participantId = '1' }],
  ['duplicate player key', d => { d.matches[0].participants[0].playerKey = 'a'; d.matches[0].participants[1].playerKey = 'a' }],
  ['mirror', d => { d.matches[0].participants[5].championId = 1 }],
  ['duplicate role', d => { d.matches[0].participants[1].role = 'TOP' }],
  ['impossible team', d => { d.matches[0].participants[5].teamId = 100 }],
  ['missing participant', d => { d.matches[0].participants.pop() }],
  ['winner mismatch', d => { d.matches[0].participants[0].won = false }],
  ['NaN damage', d => { d.matches[0].participants[0].finalDamage!.magic = NaN }],
  ['infinite duration', d => { d.matches[0].durationSeconds = Infinity }],
  ['negative damage', d => { d.matches[0].participants[0].finalDamage!.true = -1 }],
  ['invalid timestamp', d => { d.matches[0].startedAt = 'yesterday' }],
  ['outside start window', d => { d.matches[0].startedAt = '2026-09-01T00:00:00Z' }],
  ['exclusive end', d => { d.matches[0].startedAt = d.window.end }],
  ['backward window', d => { d.window.end = d.window.start }],
  ['early collection', d => { d.source.collectedAt = d.window.start }],
  ['overlapping durations', d => { d.analysis.durationWindows[1].minSeconds = 1200 }],
  ['empty duration window', d => { d.analysis.durationWindows[0].maxSeconds = 0 }],
  ['unbounded overlap', d => { d.analysis.durationWindows[0].maxSeconds = null }],
  ['duplicate window label', d => { d.analysis.durationWindows[1].label = d.analysis.durationWindows[0].label }],
  ['duplicate pool champion', d => { d.analysis.pool!.championIds = [1, 1] }],
  ['bad q', d => { d.analysis.counterAvailability!.q = 1.1 }],
  ['fractional k', d => { d.analysis.counterAvailability!.k = 1.2 }],
  ['bad support cutoff', d => { d.analysis.minCellGames = 1 }],
  ['bad threshold', d => { d.analysis.concentrationThreshold = 0 }],
]
for (const [label, mutate] of invalidCases) test(`rejects ${label}`, () => {
  const data = fixture()
  mutate(data)
  assert.throws(() => analyzeChampions(data))
})
for (const [field, value] of [['patch', 'other'], ['platform', 'KR'], ['queueId', 440], ['population', 'professional'], ['rankSnapshotLabel', 'Different historical rank']] as const) test(`isolates cohort field ${field}`, () => {
  const data = fixture()
  data.matches[0].scope = { ...data.scope, [field]: value }
  assert.throws(() => analyzeChampions(data), /Mixed cohort/)
})
test('rejects undeclared fields and partial optional damage', () => {
  const data = fixture(1)
  assert.throws(() => analyzeChampions({ ...data, timeline: [] }))
  const participant = data.matches[0].participants[0]
  assert.throws(() => analyzeChampions({ ...data, matches: [{ ...data.matches[0], participants: [{ ...participant, puuid: 'secret' }, ...data.matches[0].participants.slice(1)] }] }))
  assert.throws(() => analyzeChampions({ ...data, matches: [{ ...data.matches[0], participants: [{ ...participant, finalDamage: { physical: 1 } }, ...data.matches[0].participants.slice(1)] }] }))
})
