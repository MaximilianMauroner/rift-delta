import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RankingSummaryStanding } from '../src/domains/rankings/types.ts'
import { BoardList } from '../src/views/rankings/BoardList.tsx'

const team = (name: string, rating: number, rank: number) => ({
  teamId: name.toLowerCase(), team: name, code: name.slice(0, 3).toUpperCase(), league: 'LEC', region: 'LEC', rating, uncertainty: 40,
  rank, wins: 10, losses: 5, form: ['W', 'L'], eligibility: { eligible: true, reasons: [] },
}) as unknown as RankingSummaryStanding

const rows = [team('Alpha', 2200, 1), team('Bravo', 2190, 2), team('Charlie', 2000, 3)]
const tiers: Record<string, 'S' | 'A' | 'B'> = { alpha: 'S', bravo: 'A', charlie: 'B' }

function render(sortKey: 'rank' | 'wins', visible = rows.slice(1), pageStart = 1) {
  return renderToStaticMarkup(createElement(BoardList, {
    rows, visibleRows: visible, pageStart, tierFor: (entry) => tiers[entry.teamId], sortKey, sortDirection: sortKey === 'rank' ? 'ascending' : 'descending',
    onSort: () => {}, movementByTeamId: new Map<string, never>(), movementPeriod: 'last 30 days', scopeScoreRanks: new Map<string, number>(), pickedKeys: new Set<string>(),
    onOpen: () => {}, onToggle: () => {}, onPrepare: () => {},
  }))
}

test('a page starting in a lower tier shows the gap and near tie to the last team of the tier above', () => {
  const html = render('rank')
  assert.match(html, /Δ10 tie/, 'The first row of a group measures from the row above across the header and the page break')
  assert.match(html, /10 Power behind Alpha, a near tie\./)
  assert.match(html, /Δ190</, 'A clear gap carries no tie mark')
  assert.doesNotMatch(html, /190 Power behind Bravo, a near tie/)
  assert.match(html, />A tier</)
  assert.match(html, />B tier</)
  assert.doesNotMatch(html, />S tier</, 'Only groups on this page get a header')
})

test('a record sort keeps every row but drops the tier headers and gaps that need rank order', () => {
  const html = render('wins', rows, 0)
  assert.equal((html.match(/data-team-key=/g) ?? []).length, 3)
  assert.doesNotMatch(html, /tier<\/span>/)
  assert.doesNotMatch(html, /Δ/)
})
