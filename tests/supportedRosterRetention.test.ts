import assert from 'node:assert/strict'
import test from 'node:test'
import { powerRating } from '../src/domains/rankings/internal/replay/ratingCalculations.ts'
import { ratedRoster, retentionHistory, retentionTargets, supportedRetentionDate } from './supportedRosterRetentionFixtures.ts'

test('a proven stronger played lineup keeps live, execution and frozen result strength with the roster uncertainty penalty', () => {
  const { capture } = supportedRetentionDate()
  const [upgrade, rematch, downgrade, upgradeAgain] = capture.expected.series
  assert.deepEqual(upgrade.continuity[1], { rosterContinuity: 0, rating: 1900, executionRating: 1800, uncertainty: 140 })
  const first = upgrade.members.at(-1)!.sides[1]
  assert.equal(upgrade.input.currentPowerRating[0] - first.snapshotMomentum - first.publishedRosterPriorOffset,
    powerRating(1900, first.snapshotLeagueScore))
  assert.deepEqual(rematch.input.currentPowerRating, upgrade.input.currentPowerRating)
  const later = downgrade.members[0].sides[0]
  assert.equal(downgrade.input.currentPowerRating[0] - later.snapshotMomentum - later.publishedRosterPriorOffset,
    powerRating(1720, later.snapshotLeagueScore))
  assert.deepEqual(upgradeAgain.input.currentPowerRating, downgrade.input.currentPowerRating)
  assert.equal(upgradeAgain.continuity[0].rating, downgrade.members[0].sides[0].rating)
  assert.equal(upgradeAgain.continuity[0].executionRating, downgrade.members[0].sides[0].executionRating)
})

for (const [name, strength] of [['weaker', 0.1], ['equal', 0.5]] as const) {
  test(`${name} prior player scores retain the continuity shrink`, () => {
    const { capture } = supportedRetentionDate(retentionHistory(strength))
    assert.equal(capture.expected.series[0].continuity[1].rating, 1720)
    assert.equal(capture.expected.series[0].continuity[1].executionRating, 1665)
  })
}

for (const missing of ['old', 'incoming'] as const) {
  for (const coverage of ['all', 'one'] as const) {
    test(`${missing} lineup with ${coverage} missing player priors cannot preserve strength`, () => {
      const history = retentionHistory()
      for (const row of history) {
        for (const lineup of [row.teamARoster!, row.teamBRoster!]) {
          for (const player of lineup.players) {
            if (player.id.startsWith(`${missing}-`) && (coverage === 'all' || player.role === 'Top')) delete player.stats
          }
        }
      }
      assert.equal(supportedRetentionDate(history).capture.expected.series[0].continuity[1].rating, 1720)
    })
  }
}

test('unknown player identities cannot use default ratings to prove an upgrade', () => {
  const targets = retentionTargets()
  for (const row of targets) for (const lineup of [row.teamARoster!, row.teamBRoster!]) {
    for (const player of lineup.players) if (player.id.startsWith('incoming-')) player.id = `unknown-${player.role}`
  }
  assert.equal(supportedRetentionDate(retentionHistory(), targets).capture.expected.series[0].continuity[1].rating, 1720)
})

test('partial played lineups cannot provide upgrade proof', () => {
  const targets = retentionTargets()
  targets[1].teamBRoster = { ...ratedRoster('incoming', targets[1].date), completeness: 'partial',
    players: targets[1].teamBRoster!.players.slice(0, 4) }
  const { capture } = supportedRetentionDate(retentionHistory(), targets)
  assert.equal(capture.expected.series[0].continuity[1].rosterContinuity, null)
  assert.equal(capture.expected.series[0].continuity[1].rating, 1900)
})

test('target and future performance cannot supply missing prior player evidence', () => {
  const targets = retentionTargets()
  const future = retentionHistory().map(row => ({ ...row, id: `future-${row.id}`, sourceMatchId: `future-${row.id}`,
    date: '2026-01-21', datetimeUtc: '2026-01-21T12:00:00Z', gameCompletedAtUtc: '2026-01-21T12:30:00Z' }))
  for (const history of [[], future]) {
    assert.equal(supportedRetentionDate(history, targets).capture.expected.series[0].continuity[1].rating, 1720)
  }
})

test('same-day, future-completing and unproven series cannot supply prior player evidence', () => {
  for (const clock of ['same-day', 'future-completion', 'unproven'] as const) {
    const history = retentionHistory().map(row => ({ ...row,
      ...(clock === 'same-day' ? { date: '2026-01-20', datetimeUtc: '2026-01-20T01:00:00Z' } : {}),
      gameCompletedAtUtc: clock === 'unproven' ? undefined : '2026-01-20T01:30:00Z',
    }))
    assert.equal(supportedRetentionDate(history).capture.expected.series[0].continuity[1].rating, 1720)
  }
})

test('changing same-day results and player stats leaves the strength-retention decision unchanged', () => {
  const targets = retentionTargets()
  const changed = structuredClone(targets)
  for (const row of changed) {
    row.winner = 'Beta'
    for (const lineup of [row.teamARoster!, row.teamBRoster!]) {
      for (const player of lineup.players) Object.assign(player.stats!, { kills: 100, deaths: 0, damageShare: 1 })
    }
  }
  const before = supportedRetentionDate(retentionHistory(), targets).capture
  const after = supportedRetentionDate(retentionHistory(), changed).capture
  assert.deepEqual(after.expected.series.map(({ input }) => input.currentPowerRating),
    before.expected.series.map(({ input }) => input.currentPowerRating))
})
