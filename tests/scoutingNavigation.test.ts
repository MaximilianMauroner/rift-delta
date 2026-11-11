import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalScoutingQuery, scoutingHref, scoutingSelection } from '../src/browser/scouting/navigation.ts'
import { buildScoutingReports } from '../src/domains/scouting/build.ts'
import { FOCAL, focalSeason, scoutingGame } from './scoutingFixtures.ts'

const artifact = buildScoutingReports([...focalSeason(), ...Array.from({ length: 22 }, (_, i) => scoutingGame({ id: `other${i}`, date: `2026-05-${String(i + 1).padStart(2, '0')}`, teams: ['c', 'd'] }))], 'a'.repeat(64))

test('a link selects its player and the selection reads back from the hash', () => {
  const href = scoutingHref({ id: FOCAL, role: 'Mid' })
  const selection = scoutingSelection(artifact, new URLSearchParams(href.split('?')[1]))
  assert.equal(selection.role, 'Mid')
  assert.equal(selection.player?.id, FOCAL)
  assert.equal(canonicalScoutingQuery(selection).get('player'), `${FOCAL}|Mid`)
})

test('without a request the most active player in Mid is chosen, and a role in the query resets the player', () => {
  const none = scoutingSelection(artifact, new URLSearchParams())
  assert.equal(none.role, 'Mid')
  assert.equal(none.player?.id, 'c-2')
  assert.deepEqual(none.players.map(player => player.id), ['c-2', 'd-2', FOCAL, 'b-2'])
  assert.equal(none.found, true)
  const top = scoutingSelection(artifact, new URLSearchParams({ role: 'Top', player: `${FOCAL}|Mid` }))
  assert.equal(top.role, 'Top')
  assert.equal(top.player?.role, 'Top')
})

test('an unknown player falls back to the default and says it was not found', () => {
  const selection = scoutingSelection(artifact, new URLSearchParams({ player: 'nobody|Mid' }))
  assert.equal(selection.found, false)
  assert.equal(selection.player?.role, 'Mid')
})
