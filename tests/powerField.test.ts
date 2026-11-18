import assert from 'node:assert/strict'
import test from 'node:test'
import type { RankingSummaryStanding } from '../src/domains/rankings/types.ts'
import { swarmOffsets, tierZones } from '../src/views/rankings/powerField.ts'

const team = (name: string, rating: number) => ({ team: name, teamId: name, rating }) as unknown as RankingSummaryStanding
const axis = { min: 1500, max: 2300 }

test('tier zones meet halfway across the gap between tiers and reach the axis ends', () => {
  const teams = [team('s', 2200), team('a1', 2100), team('a2', 2000), team('b', 1800)]
  const tiers: Record<string, 'S' | 'A' | 'B'> = { s: 'S', a1: 'A', a2: 'A', b: 'B' }
  assert.deepEqual(tierZones(teams, (entry) => tiers[entry.teamId], axis), [
    { tier: 'S', from: 2150, to: 2300 },
    { tier: 'A', from: 1900, to: 2150 },
    { tier: 'B', from: 1500, to: 1900 },
  ])
})

test('tiers whose Power ranges overlap get no zones, so a band never claims a team of another tier', () => {
  const teams = [team('s', 2200), team('a', 2210), team('b', 1800)]
  const tiers: Record<string, 'S' | 'A' | 'B'> = { s: 'S', a: 'A', b: 'B' }
  assert.deepEqual(tierZones(teams, (entry) => tiers[entry.teamId], axis), [])
})

test('swarm marks at one Power value stack apart without overlap inside the height', () => {
  const items = Array.from({ length: 5 }, () => ({ x: 100, radius: 6 }))
  const offsets = swarmOffsets(items, 80)
  const sorted = [...offsets].sort((left, right) => left - right)
  for (let index = 1; index < sorted.length; index += 1) assert.ok(sorted[index] - sorted[index - 1] >= 12, `gap at ${index}`)
  assert.ok(offsets.every((offset) => Math.abs(offset) <= 34))
})
