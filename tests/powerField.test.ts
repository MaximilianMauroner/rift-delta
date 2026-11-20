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

test('clustered Power marks keep their rectangular click targets apart', () => {
  const items = [0, 7, 17, 21, 21, 28, 31, 48].map((x, index) => ({ x, radius: index < 4 ? 16 : 12 }))
  const offsets = swarmOffsets(items)
  assert.equal(offsets[0], 0)
  for (const [index, item] of items.entries()) {
    for (let earlier = 0; earlier < index; earlier += 1) {
      const clearance = item.radius + items[earlier].radius + 2
      assert.ok(Math.abs(item.x - items[earlier].x) >= clearance || Math.abs(offsets[index] - offsets[earlier]) >= clearance)
    }
  }
})
