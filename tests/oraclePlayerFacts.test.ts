import assert from 'node:assert/strict'
import test from 'node:test'
import { importOraclesElixirCsv } from '../scripts/rankings/providers/oraclesElixir.ts'
import { buildPlayerModel } from '../src/domains/rankings/internal/replay/model.ts'
import { buildCanonicalMatchLedger, classifyRankingChange } from '../src/lib/incremental/changeClassifier.ts'
import { reportOf } from './scoutingFixtures.ts'

function oracleGames() {
  const columns = ['gameid', 'date', 'year', 'league', 'position', 'side', 'teamname', 'teamid', 'playerid', 'playername', 'champion', 'result', 'kills', 'deaths', 'assists']
  const rows = [columns.join(',')]
  for (let game = 1; game <= 20; game++) {
    for (const [side, team, result] of [['Blue', 'a', '1'], ['Red', 'b', '0']]) {
      const values = { gameid: `game-${game}`, date: `2026-01-${String(game).padStart(2, '0')}`, year: '2026', league: 'LCK', side, teamname: team === 'a' ? 'Alpha' : 'Beta', teamid: team }
      const add = (row: Record<string, string>) => rows.push(columns.map(key => row[key] ?? '').join(','))
      add({ ...values, position: 'team', result })
      for (const [index, position] of ['top', 'jng', 'mid', 'bot', 'sup'].entries()) {
        add({ ...values, position, playerid: `${team}-${index}`, playername: `${team}-${index}`, champion: `${team}-champion-${index}`,
          result: '', kills: '1', deaths: team === 'a' && index === 2 ? (game === 20 ? '0' : '') : '1', assists: '2' })
      }
    }
  }
  return importOraclesElixirCsv(rows.join('\n')).matches
}

test('Oracle missing player results and deaths do not turn wins into losses or unknown deaths into deathless games', () => {
  const matches = oracleGames()
  const first = matches[0]!.teamARoster!.players[2]!.stats!
  const last = matches[19]!.teamARoster!.players[2]!.stats!
  assert.equal(first.won, true)
  assert.equal(first.deaths, undefined)
  assert.equal(last.deaths, 0)
  const report = reportOf(matches, 'a-2')!
  assert.equal(report.wins, 20)
  assert.deepEqual(report.facts.deathless, { games: 1, hits: 1 })
  const player = buildPlayerModel(matches, {}).find(entry => entry.id === 'a-2')!
  assert.deepEqual(player.diagnostics?.kda, { value: 3, games: 1, missing: 19 })
  assert.equal(player.diagnostics?.wins, 20)
})

test('Oracle treats invalid KDA numbers as missing and retains true zeroes', () => {
  const csv = [
    'gameid,date,year,league,position,side,teamname,playername,result,kills,deaths,assists',
    'one,2026-01-01,2026,LCK,team,Blue,Alpha,,1,15,10,20',
    'one,2026-01-01,2026,LCK,team,Red,Beta,,0,10,15,10',
    'one,2026-01-01,2026,LCK,mid,Blue,Alpha,Player,0,-1,NaN,0',
  ].join('\n')
  const match = importOraclesElixirCsv(csv).matches[0]!
  const stats = match.teamARoster!.players[0]!.stats!
  assert.equal(stats.won, true)
  assert.equal(stats.kills, undefined)
  assert.equal(stats.deaths, undefined)
  assert.equal(stats.assists, 0)
})

test('corrected imported facts invalidate the affected historical inputs', () => {
  const corrected = oracleGames()
  const previous = structuredClone(corrected)
  for (const match of previous) {
    const stats = match.teamARoster!.players[2]!.stats!
    stats.won = false
    stats.deaths = 0
  }
  const context = {
    modelVersion: 'model', modelConfigHash: 'config', importerVersion: 'importer', identityTaxonomyHash: 'taxonomy',
    scheduleReceiptIdentity: 'schedule', contextReceiptIdentity: 'context', provenanceReceiptIdentity: 'provenance',
  }
  const decision = classifyRankingChange(buildCanonicalMatchLedger(previous, context), buildCanonicalMatchLedger(corrected, context))
  assert.equal(decision.kind, 'historical-correction')
  assert.equal(decision.earliestChangedUtcDate, '2026-01-01')
  assert.ok(decision.reasons.includes('scoring-input-changed'))
})
