import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalScoutingQuery, scoutingHref, scoutingSelection } from '../src/browser/scouting/navigation.ts'
import { FOCAL, focalSeason, scoutingGame, scoutingOf } from './scoutingFixtures.ts'

const artifact = scoutingOf([...focalSeason(), ...Array.from({ length: 22 }, (_, i) => scoutingGame({ id: `other${i}`, date: `2026-05-${String(i + 1).padStart(2, '0')}`, teams: ['c', 'd'] }))]).index

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

test('a linked player under the game minimum stays selected and is offered in the picker, so the page can say why', () => {
  const index = scoutingOf([...focalSeason(), ...Array.from({ length: 3 }, (_, i) => scoutingGame({ id: `rare${i}`, date: '2026-06-20', teams: ['e', 'b'] }))]).index
  const selection = scoutingSelection(index, new URLSearchParams({ player: 'e-2|Mid' }))
  assert.deepEqual([selection.player?.id, selection.player?.games, selection.found], ['e-2', 3, true])
  assert.equal(selection.players[0]?.id, 'e-2')
  const fallback = scoutingSelection(index, new URLSearchParams())
  assert.equal(fallback.players.some(player => player.id === 'e-2'), false)
})
