import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseDocument, DomUtils } from 'htmlparser2'
import { deltaBarWidth, seriesRatingChange } from '../src/views/matches/seriesOutcome.ts'
import { SeriesCards, SeriesTable } from '../src/views/matches/SeriesLedger.tsx'
import type { PublicMatchHistoryEntry } from '../src/domains/rankings/internal/published/schema.ts'

function series(overrides: Partial<PublicMatchHistoryEntry>): PublicMatchHistoryEntry {
  return {
    id: 'g1',
    date: '2026-07-21',
    event: 'KeSPA Cup',
    phase: 'Playoffs',
    league: 'KeSPA',
    region: 'LCK',
    patch: '26.14',
    bestOf: 1,
    gameNumber: 1,
    seriesId: 's1',
    seriesState: 'completed',
    seriesWinsA: 0,
    seriesWinsB: 1,
    teamA: { id: 'gen', name: 'Gen.G', code: 'GEN' },
    teamB: { id: 'bro', name: 'HANJIN BRION', code: 'BRO' },
    winnerId: 'bro',
    impact: { unit: 'series-applied', teamA: -45, teamB: 46, expectedTeamA: 0.78, expectedTeamB: 0.22, eventWeight: 1.643 },
    source: { provider: 'leaguepedia-cargo' },
    ...overrides,
  }
}

test('reports the pre-match chance of the series winner and flags upsets', () => {
  const change = seriesRatingChange(series({}))
  assert.equal(change.kind, 'applied')
  if (change.kind !== 'applied') return
  assert.equal(change.chanceSide, 'B')
  assert.ok(Math.abs((change.chance ?? 0) - 0.22) < 1e-9)
  assert.equal(change.upset, true)

  const favourite = seriesRatingChange(series({ seriesWinsA: 1, seriesWinsB: 0, winnerId: 'gen', impact: { unit: 'series-applied', teamA: 20, teamB: -20, expectedTeamA: 0.78 } }))
  assert.equal(favourite.kind === 'applied' && favourite.upset, false)
})

test('hides the rating change when the deltas contradict the winner', () => {
  assert.deepEqual(seriesRatingChange(series({ impact: { unit: 'series-applied', teamA: 45, teamB: -46, expectedTeamA: 0.1 } })), { kind: 'missing' })
  assert.deepEqual(seriesRatingChange(series({ impact: { unit: 'held' } })), { kind: 'held' })
})

test('Bo2 winner uses its own recorded probability for the chance and upset flag', () => {
  const change = seriesRatingChange(series({ bestOf: 2, seriesWinsB: 2,
    impact: { unit: 'series-applied', teamA: -45, teamB: 46, expectedTeamA: 0.64, expectedTeamB: 0.04 } }))
  assert.equal(change.kind === 'applied' && change.chance, 0.04)
  assert.equal(change.kind === 'applied' && change.upset, true)
})

test('missing winner probability is omitted instead of complemented from the other team', () => {
  const change = seriesRatingChange(series({
    impact: { unit: 'series-applied', teamA: -45, teamB: 46, expectedTeamA: 0.64 } }))
  assert.equal(change.kind === 'applied' && change.chance, undefined)
  assert.equal(change.kind === 'applied' && change.upset, false)
})

test('caps the delta bar and keeps small changes visible', () => {
  assert.equal(deltaBarWidth(120, 36), 36)
  assert.equal(deltaBarWidth(-25, 36), 18)
  assert.equal(deltaBarWidth(0.4, 36), 2)
  assert.equal(deltaBarWidth(0, 36), 0)
})

test('both ledger layouts preserve signed unequal impacts, league identity and game details', () => {
  const first = series({ id: 'g1', bestOf: 3, gameNumber: 1, impact: { unit: 'held' }, patch: '26.14' })
  const last = series({ id: 'g2', bestOf: 3, gameNumber: 2, seriesWinsB: 2, picks: { teamA: ['Ahri', null, null, null, null], teamB: ['Akali', null, null, null, null] } })
  for (const layout of [SeriesTable, SeriesCards]) {
    const html = renderToStaticMarkup(createElement(layout, {
      series: [{ id: 's1', games: [first, last], summary: last }],
      expanded: new Set(['s1']), onToggle: () => {}, publication: 'Test generation',
    }))
    const document = parseDocument(html)
    const text = DomUtils.textContent(document)
    const names = DomUtils.findAll((node) => node.attribs.class?.split(' ').includes('matches-team-name') ?? false, document.children)
    assert.match(names[0]?.attribs.class ?? '', /font-normal/)
    assert.match(names[1]?.attribs.class ?? '', /font-semibold/)
    const row = DomUtils.findOne((node) => node.attribs['data-first-answer'] === 'matches', document.children)
    assert.match(row?.attribs.style ?? '', /border-left(?:-color)?:.*var\(--league-other\)/)
    assert.match(text, /Gen.G/)
    assert.match(text, /HANJIN BRION/)
    assert.match(text, /KeSPA/)
    assert.match(text, /−45/)
    assert.match(text, /\+46/)
    assert.match(html, /aria-label="−45 Power"/)
    assert.match(html, /aria-label="\+46 Power"/)
    assert.match(text, /Patch 26.14/)
    assert.match(html, /Hide games in Gen.G versus HANJIN BRION/)
    assert.match(html, /aria-label="Ahri"/)
    assert.match(html, /aria-label="Akali"/)
    assert.match(html, /var\(--league-other\)/)
  }
})

test('both ledger layouts keep missing and held impact states without a zero Power change', () => {
  for (const layout of [SeriesTable, SeriesCards]) {
    for (const [impact, label] of [
      [{ unit: 'series-applied' }, 'No rating change recorded'],
      [{ unit: 'series-applied', teamA: -45 }, 'No rating change recorded'],
      [{ unit: 'series-applied', teamB: 46 }, 'No rating change recorded'],
      [{ unit: 'held' }, 'Held until the series ends'],
    ] as const) {
      const match = series({ impact })
      const html = renderToStaticMarkup(createElement(layout, {
        series: [{ id: 's1', games: [match], summary: match }],
        expanded: new Set<string>(), onToggle: () => {}, publication: 'Test generation',
      }))
      const text = DomUtils.textContent(parseDocument(html))
      assert.ok(text.includes(label))
      assert.doesNotMatch(text, /pre-match|event weight|Upset/)
      assert.doesNotMatch(html, /aria-label="[+−\d]+ Power"/)
      if (impact.unit === 'series-applied') {
        assert.match(html, /aria-label="Report this series"/)
        assert.match(html, /Why no rating change/)
      }
    }
  }
})

test('both ledger layouts mark a level best-of score that has no winner', () => {
  const render = (match: PublicMatchHistoryEntry, layout: typeof SeriesTable) => DomUtils.textContent(parseDocument(renderToStaticMarkup(createElement(layout, {
    series: [{ id: 's1', games: [match], summary: match }],
    expanded: new Set<string>(), onToggle: () => {}, publication: 'Test generation',
  }))))
  const level = { bestOf: 5, gameNumber: 4, seriesWinsA: 2, seriesWinsB: 2, impact: { unit: 'held' } } as const
  for (const layout of [SeriesTable, SeriesCards]) {
    assert.match(render(series(level), layout), /Result incomplete/)
    assert.match(render(series({ ...level, seriesState: 'ongoing' }), layout), /In progress/)
    assert.doesNotMatch(render(series({ bestOf: 2, gameNumber: 2, seriesWinsA: 1, seriesWinsB: 1 }), layout), /Result incomplete|In progress/)
    assert.doesNotMatch(render(series({}), layout), /Result incomplete|In progress/)
  }
})
