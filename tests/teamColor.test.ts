import assert from 'node:assert/strict'
import test from 'node:test'
import { leagueColor } from '../src/shared/teamColor.ts'

test('league identity is fixed across case and surrounding spaces', () => {
  assert.equal(leagueColor('LCK'), 'var(--league-lck)')
  assert.equal(leagueColor(' lck '), leagueColor('LCK'))
  assert.equal(leagueColor('CBLOL'), 'var(--league-cblol)')
})

test('unknown leagues use the other league colour', () => {
  assert.equal(leagueColor('PCS'), 'var(--league-other)')
  assert.equal(leagueColor(''), 'var(--league-other)')
  assert.equal(leagueColor('constructor'), 'var(--league-other)')
})
