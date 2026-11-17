import assert from 'node:assert/strict'
import test from 'node:test'
import { assignColorSlots, assignLeagueColorSlots } from '../src/shared/colorSlots.ts'

test('teams that stay keep their colour when others leave or join', () => {
  const first = assignColorSlots(new Map(), ['HLE', 'BLG', 'GEN'], 5)
  assert.deepEqual(Object.fromEntries(first), { HLE: 0, BLG: 1, GEN: 2 })

  const second = assignColorSlots(first, ['BLG', 'GEN', 'T1'], 5)
  assert.deepEqual(Object.fromEntries(second), { BLG: 1, GEN: 2, T1: 0 })
})

test('slots never exceed the palette', () => {
  const slots = assignColorSlots(new Map(), ['A', 'B', 'C'], 2)
  assert.deepEqual(Object.fromEntries(slots), { A: 0, B: 1 })
})

test('a second team from one league keeps its repeat slot when the first team leaves', () => {
  const first = assignLeagueColorSlots(new Map(), [{ key: 'HLE', league: 'LCK' }, { key: 'BLG', league: 'LPL' }, { key: 'GEN', league: 'LCK' }], 4)
  assert.deepEqual(Object.fromEntries(first), { HLE: 0, GEN: 1, BLG: 0 })

  const second = assignLeagueColorSlots(first, [{ key: 'BLG', league: 'LPL' }, { key: 'GEN', league: 'LCK' }], 4)
  assert.deepEqual(Object.fromEntries(second), { GEN: 1, BLG: 0 })
})
