import assert from 'node:assert/strict'
import test from 'node:test'
import { teamColor } from '../src/shared/teamColor.ts'

const field = ['BLG', 'GEN', 'HLE', 'AL', 'G2', 'T1', 'TLAW', 'DK', 'TSW', 'LYON', 'DNS', 'TES', 'KT', 'KC', 'NIP', 'IG', 'BFX', 'NS', 'LGD', 'JDG', 'WE', 'MKOI', 'C9', 'BRO', 'KRX']

function hue(colour: string) {
  const match = /^oklch\(74% 0\.14 (\d+(?:\.\d)?)\)$/.exec(colour)
  assert.ok(match, `${colour} is an identity colour`)
  return Number(match[1])
}

function hueGap(left: string, right: string) {
  const gap = Math.abs(hue(left) - hue(right)) % 360
  return Math.min(gap, 360 - gap)
}

test('a team code keeps its colour', () => {
  assert.equal(teamColor('BLG', field), teamColor('BLG', [...field]))
  assert.equal(teamColor('BLG', field), teamColor('BLG', [...field, 'XYZ', 'BLG']))
  assert.equal(teamColor('XYZ', field), teamColor('XYZ', ['BLG']))
})

test('teams within three places of each other get clearly different hues', () => {
  for (let index = 0; index < field.length; index++) {
    for (let distance = 1; distance <= 3 && index + distance < field.length; distance++) {
      const [left, right] = [field[index]!, field[index + distance]!]
      assert.ok(hueGap(teamColor(left, field), teamColor(right, field)) >= 50, `${left} and ${right} are too close`)
    }
  }
})
