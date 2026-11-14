import { writeOracleForecastFixture } from './fixtures/oracleForecastFixture.ts'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { exportPregameSeries } from '../scripts/rankings/export-pregame-series.ts'
import type { ForecastRequestFile } from '../scripts/rankings/export-pregame-series.ts'
import { importRankingSourceData } from '../scripts/rankings/source-input.ts'
import { sampleMatches } from './fixtures/rankingFixtures.ts'

const cutoff = Date.parse('2026-02-10T10:00:00Z')
const capture = '2026-02-09T00:00:00Z'
const future = '2026-03-01T00:00:00Z'

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'pregame-availability-'))
  const manifest = join(directory, 'manifest.json')
  const requests = join(directory, 'requests.json')
  const candidate = join(directory, 'candidate.json')
  const raw = { fetchedAt: capture, matches: sampleMatches.slice(0, 2).map((match, index) => ({ ...match,
    id: `availability-${index}`, bestOf: 1 })) }
  const files = { leaguepediaJson: [] as string[], lolEsportsJson: [] as string[], oracleCsv: ['raw.csv'] }
  const sourceCapture = await writeOracleForecastFixture(directory, 'raw.csv', raw.matches, Date.parse(capture))
  await writeFile(manifest, JSON.stringify({ files }))
  const source = await importRankingSourceData({ manifestPath: manifest })
  const requestFile: ForecastRequestFile = { evidenceMode: 'synthetic', availability: 'verified', sourceFiles: [sourceCapture],
    observations: source.matches.map(match => ({ gameId: match.id, observedAt: Date.parse(match.date) + 3600_000,
      resultAvailableAt: Date.parse(match.date) + 3600_000 })), requests: [{
      seriesId: 'availability-series', eventId: 'availability-event', homeTeamId: 'gen', awayTeamId: 't1',
      homeSourceTeam: 'Gen.G', awaySourceTeam: 'T1', bestOf: 3, scheduleRevision: 'revision-1',
      scheduledStartAt: cutoff + 7200_000, scheduleObservedAt: cutoff - 1000, scheduleProvider: 'lolesports-schedule',
      asOf: cutoff, validUntil: cutoff + 7000_000, event: 'LCK 2026 Spring', patch: '26.1', season: 2026,
      league: 'LCK', region: 'LCK', tier: 'regional-regular',
    }] }
  await writeFile(candidate, JSON.stringify({ candidateId: 'availability', parentCandidateId: null,
    calibrationFit: null, transform: { temperature: 1, calibrationOrder: 'game-before-series', dependence: 0 } }))
  let run = 0
  return { directory, raw, files, requestFile, candidate, async export() {
    await writeFile(manifest, JSON.stringify({ files }))
    await writeFile(requests, JSON.stringify(requestFile))
    const output = join(directory, `forecast-${run++}.jsonl`)
    const receipts = await exportPregameSeries(manifest, requests, candidate, output)
    return { receipts, states: await readFile(`${output}.states.jsonl`, 'utf8') }
  } }
}

test('late official enrichment cannot change earlier eligible probabilities or exact states', async () => {
  const f = await fixture()
  try {
    const baseline = await f.export()
    const references = { fetchedAt: future, events: f.raw.matches.map((match, index) => ({
      startTime: `${match.date}T00:00:00Z`, state: 'completed', blockName: 'Playoffs',
      league: { name: 'LCK', slug: 'lck' }, match: { id: `official-${index}`, strategy: { type: 'bestOf', count: 5 },
        teams: [{ name: match.teamA }, { name: match.teamB }] },
    })) }
    f.files.lolEsportsJson.push('reference.json')
    await writeFile(join(f.directory, 'reference.json'), JSON.stringify(references))
    const late = await f.export()
    assert.equal(late.states, baseline.states)
    assert.equal(late.receipts[0].eligible, true)
    assert.equal(late.receipts[0].homeSeriesWinProbability, baseline.receipts[0].homeSeriesWinProbability)
    assert.deepEqual(late.receipts[0].sourceObservedAt, baseline.receipts[0].sourceObservedAt)
    assert.ok(late.receipts[0].sourceObservedAt.includes(Date.parse(capture)))
    references.fetchedAt = capture
    await writeFile(join(f.directory, 'reference.json'), JSON.stringify(references))
    const available = await f.export()
    assert.notEqual(available.states, baseline.states)
    assert.notEqual(available.receipts[0].homeSeriesWinProbability, baseline.receipts[0].homeSeriesWinProbability)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('future raw revisions are filtered before duplicate selection and retain batch order', async () => {
  const f = await fixture()
  try {
    const baseline = await f.export()
    const revision = { fetchedAt: future, matches: f.raw.matches.map(match => ({ ...match,
      winner: match.winner === match.teamA ? match.teamB : match.teamA, bestOf: 5 })) }
    f.requestFile.sourceFiles![1] = await writeOracleForecastFixture(f.directory, 'revision.csv', revision.matches, Date.parse(revision.fetchedAt))
    f.files.oracleCsv.unshift('revision.csv')
    const later = Date.parse('2026-03-02T10:00:00Z')
    const request = f.requestFile.requests[0]
    f.requestFile.requests.unshift({ ...request, seriesId: 'later-series', asOf: later,
      scheduleObservedAt: later - 1000, scheduledStartAt: later + 7200_000, validUntil: later + 7000_000 })
    const result = await f.export()
    assert.equal(result.states.trim().split('\n')[1], baseline.states.trim())
    assert.equal(result.receipts[1].homeSeriesWinProbability, baseline.receipts[0].homeSeriesWinProbability)
    assert.notEqual(result.receipts[0].modelStateHash, baseline.receipts[0].modelStateHash)
    assert.ok(result.receipts[0].sourceObservedAt.includes(Date.parse(future)))
    revision.matches[0].teamAKills += 20
    f.requestFile.sourceFiles![1] = await writeOracleForecastFixture(f.directory, 'revision.csv', revision.matches, Date.parse(revision.fetchedAt))
    const changed = await f.export()
    assert.equal(changed.states.trim().split('\n')[1], baseline.states.trim())
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('unobserved raw enrichment cannot change prior state even in an available snapshot', async () => {
  const f = await fixture()
  try {
    f.files.leaguepediaJson.push('enrichment.json')
    const path = join(f.directory, 'enrichment.json')
    await writeFile(path, JSON.stringify(f.raw))
    const enrichment = await importRankingSourceData({ leaguepediaJsonPaths: [path] })
    f.requestFile.observations.push(...enrichment.matches.map(match => ({ gameId: match.id,
      observedAt: Date.parse(match.date) + 3600_000, resultAvailableAt: Date.parse(match.date) + 3600_000 })))
    const baseline = await f.export()
    f.raw.matches[0].bestOf = 5
    const observation = f.requestFile.observations.find(row => row.gameId === enrichment.matches[0].id)!
    observation.observedAt = Date.parse(future)
    await writeFile(path, JSON.stringify(f.raw))
    const unavailable = await f.export()
    assert.equal(unavailable.states, baseline.states)
    assert.equal(unavailable.receipts[0].homeSeriesWinProbability, baseline.receipts[0].homeSeriesWinProbability)
    observation.observedAt = cutoff - 1
    const available = await f.export()
    assert.ok(available.receipts[0].sourceObservedAt.includes(cutoff - 1))
    assert.notEqual(available.states, baseline.states)
    assert.notEqual(available.receipts[0].homeSeriesWinProbability, baseline.receipts[0].homeSeriesWinProbability)
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

test('verified export requires source capture evidence and binds explicit evidence to bytes', async () => {
  const f = await fixture()
  try {
    const captures = f.requestFile.sourceFiles
    delete f.requestFile.sourceFiles
    await assert.rejects(f.export(), /Missing source file capture/)
    f.requestFile.sourceFiles = captures
    assert.equal((await f.export()).receipts[0].eligible, true)
    const rawPath = join(f.directory, 'raw.csv')
    await writeFile(rawPath, (await readFile(rawPath, 'utf8')) + '\n')
    await assert.rejects(f.export(), /Invalid source file capture/)
    f.requestFile.availability = 'historical-limited'
    f.requestFile.evidenceMode = 'retrospective'
    const historical = await f.export()
    assert.equal(historical.receipts[0].eligible, false)
    assert.deepEqual(historical.receipts[0].exclusions, ['historical-availability-not-proven'])
  } finally { await rm(f.directory, { recursive: true, force: true }) }
})

for (const modelKind of ['ranking', 'simple-elo'] as const) {
  test(`${modelKind} strict export rejects Leaguepedia without completion until a captured Oracle source is available`, async () => {
    const f = await fixture()
    try {
      await writeFile(f.candidate, JSON.stringify({ modelKind, candidateId: modelKind === 'simple-elo' ? 'simple-elo-v1' : 'availability',
        parentCandidateId: null, calibrationFit: null, transform: { temperature: 1, calibrationOrder: 'game-before-series', dependence: 0 } }))
      f.files.oracleCsv = []
      f.files.leaguepediaJson.push('raw.json')
      await writeFile(join(f.directory, 'raw.json'), JSON.stringify(f.raw))
      const leaguepedia = await importRankingSourceData({ leaguepediaJsonPaths: [join(f.directory, 'raw.json')] })
      assert.ok(leaguepedia.matches.every(match => match.gameCompletedAtUtc === undefined))
      f.requestFile.observations.push(...leaguepedia.matches.map(match => ({ gameId: match.id,
        observedAt: Date.parse(match.date) + 3600_000, resultAvailableAt: Date.parse(match.date) + 3600_000 })))
      await assert.rejects(f.export(), /No available prior-date ranking input|No completed causal Elo history/)
      const sourceCapture = await writeOracleForecastFixture(f.directory, 'oracle.csv', f.raw.matches, Date.parse(future))
      f.files.oracleCsv.push('oracle.csv')
      f.requestFile.sourceFiles = [sourceCapture]
      await assert.rejects(f.export(), /No available prior-date ranking input|No completed causal Elo history/)
      sourceCapture.observedAt = Date.parse(capture)
      const available = await f.export()
      assert.equal(available.receipts[0].eligible, true)
      assert.ok(available.states.includes('oe-availability-0'))
    } finally { await rm(f.directory, { recursive: true, force: true }) }
  })
}
