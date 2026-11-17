import { Fragment, type CSSProperties } from 'react'
import { TeamMark } from '../../components/TeamMark'
import { FormDots, SortHeader, TierChip } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { Lane } from '../../components/ui/lane'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { tournamentBoundaryLabel } from '../../domains/rankings/evidence'
import { nearTieGroups, nearTiePositions, type NearTiePosition, type PublicMatchupModel, type RankingTierLabel, type SortDirection, type SortKey } from '../../domains/rankings/read'
import type { PublicTournamentMovementShard, PublicTournamentMovementTeam, RankingSummaryStanding } from '../../domains/rankings/types'
import { formatNumber, formatRating, formatRatio, formatRecord, teamKey } from '../../shared/display'
import { leagueColor } from '../../shared/teamColor'
import { cn } from '../../shared/utils'
import { NearTieMark, TeamBoardRank, TournamentMoveChip } from './BoardCells'
import { shouldIgnoreTeamRowClick } from './boardEvents'
import { activeMovement, eligibilitySummary, rollingMovementTitle, teamRankFor, teamScoreFor } from './boardFormat'
import { CompareToggle } from './CompareToggle'
import { MovementChip } from './WhatChanged'

type Group = { key: RankingTierLabel | 'unranked'; label: string; count: number; continued: boolean }

type Gap = { points: number; tie: boolean; above: RankingSummaryStanding }

const uncertaintyOf = (team: RankingSummaryStanding) => Math.max(0, team.ratingComponents?.uncertainty ?? team.uncertainty ?? 0)

/** The axis every row's lane shares: the shown teams' bands, widened to round 50s. */
function boardLaneAxis(rows: readonly RankingSummaryStanding[]) {
  const ends = rows.flatMap((team) => {
    const score = teamScoreFor(team)
    if (typeof score !== 'number' || !Number.isFinite(score)) return []
    const band = uncertaintyOf(team)
    return [score - band, score + band]
  })
  if (ends.length === 0) return undefined
  return { min: Math.floor(Math.min(...ends) / 50) * 50, max: Math.ceil(Math.max(...ends) / 50) * 50 }
}

/**
 * The ranking as one table grouped under tier headers. In rank order each
 * ranked row carries its Power gap to the ranked row above it, also across a
 * tier header or a page break, and "tie" when the pair passes the near-tie
 * rule. A near-tie run keeps its bar in the rank cell, measured from the
 * run's first team as the rule requires.
 */
export function BoardList({
  rows,
  visibleRows,
  pageStart,
  tierFor,
  model,
  sortKey,
  sortDirection,
  onSort,
  tournament,
  movementByTeamId,
  movementPeriod,
  scopeScoreRanks,
  selectedKey,
  pickedKeys,
  onOpen,
  onToggle,
  onPrepare,
}: {
  rows: readonly RankingSummaryStanding[]
  visibleRows: readonly RankingSummaryStanding[]
  pageStart: number
  tierFor: (team: RankingSummaryStanding) => RankingTierLabel | undefined
  model?: PublicMatchupModel
  sortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: string) => void
  tournament?: PublicTournamentMovementShard
  movementByTeamId: ReadonlyMap<string, PublicTournamentMovementTeam>
  movementPeriod: string
  scopeScoreRanks: ReadonlyMap<string, number>
  selectedKey?: string
  pickedKeys: ReadonlySet<string>
  onOpen: (team: RankingSummaryStanding) => void
  onToggle: (team: RankingSummaryStanding) => void
  onPrepare: () => void
}) {
  // Gaps and ties only mean something when neighbours on screen are
  // neighbours in the ranking. Tier groups also hold under a Power sort.
  const rankedOrder = sortKey === 'rank' && sortDirection === 'ascending'
  const grouped = sortKey !== 'wins'
  const ranked = (team: RankingSummaryStanding) => team.eligibility?.eligible !== false
  const groupKey = (team: RankingSummaryStanding) => (ranked(team) ? tierFor(team) : undefined) ?? 'unranked'
  const tiePositions = rankedOrder ? nearTiePositions(nearTieGroups(rows.filter(ranked), model), teamKey) : new Map<string, NearTiePosition>()
  const axis = boardLaneAxis(visibleRows)

  function gapFor(index: number): Gap | undefined {
    const team = rows[index]
    const above = rows[index - 1]
    if (!rankedOrder || !above || !ranked(team) || !ranked(above)) return undefined
    return {
      points: Math.round(above.rating) - Math.round(team.rating),
      tie: nearTieGroups([above, team], model).length === 1,
      above,
    }
  }

  function groupFor(index: number): Group | undefined {
    if (!grouped) return undefined
    const team = rows[index]
    const key = groupKey(team)
    const startsGroup = index === pageStart || groupKey(rows[index - 1]) !== key
    if (!startsGroup) return undefined
    return {
      key,
      label: key === 'unranked' ? 'Unranked' : `${key} tier`,
      count: rows.filter((row) => groupKey(row) === key).length,
      continued: index > 0 && groupKey(rows[index - 1]) === key,
    }
  }

  return (
    <Table containerClassName="board-list @container/board max-w-full [contain:paint]" className="ranking-table board-grid w-full border-collapse text-sm">
      <colgroup>
        <col className="board-col-rank" />
        <col className="board-col-team" />
        <col className="board-col-tier" />
        <col className="board-col-score" />
        <col className="board-col-lane" />
        <col className="board-col-move" />
        <col className="board-col-form" />
        <col className="board-col-record" />
        <col className="board-col-action" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <SortHeader label="Rank" columnKey="rank" sortKey={sortKey} descending={sortDirection === 'descending'} onSort={onSort} className="board-col-rank" />
          <TableHead>Team</TableHead>
          <TableHead className="board-col-tier">Tier</TableHead>
          <SortHeader label="Power" columnKey="rating" sortKey={sortKey} descending={sortDirection === 'descending'} onSort={onSort} className="board-col-score" />
          <TableHead className="board-col-lane">
            {axis ? (
              <span className="flex justify-between gap-2 tabular-nums">
                <span><span className="sr-only">Power band, axis from </span>{formatRating(axis.min)}</span>
                <span><span className="sr-only">to </span>{formatRating(axis.max)}</span>
              </span>
            ) : <span className="sr-only">Power band</span>}
          </TableHead>
          <TableHead className="board-col-move">{tournament ? 'Event' : '30d'}<span className="sr-only">{tournament ? ', rank change from the tournament start to its endpoint' : `, rank change ${movementPeriod}`}</span></TableHead>
          <TableHead className="board-col-form">Form</TableHead>
          <SortHeader label="Record" columnKey="wins" sortKey={sortKey} descending={sortDirection === 'descending'} onSort={onSort} align="right" className="board-col-record" />
          <TableHead className="board-col-action"><span className="sr-only">Compare</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleRows.map((team, offset) => {
          const index = pageStart + offset
          const key = teamKey(team)
          const total = team.wins + team.losses
          const rank = teamRankFor(team)
          const tier = ranked(team) ? tierFor(team) : undefined
          const excluded = !ranked(team)
          const score = teamScoreFor(team)
          const group = groupFor(index)
          const gap = gapFor(index)
          const tie = tiePositions.get(key)
          const band = uncertaintyOf(team)
          return (
            <Fragment key={key}>
              {group ? (
                <tr className="board-tier-row" style={{ '--tier-color': group.key === 'unranked' ? 'var(--line)' : `var(--tier-${group.key.toLowerCase()})` } as CSSProperties}>
                  <th colSpan={9} scope="colgroup">
                    <span className={cn('board-tier-name', group.key === 'unranked' && 'text-text')}>{group.label}</span>
                    <small>{formatNumber(group.count)} {group.count === 1 ? 'team' : 'teams'}{group.continued ? ', continued' : ''}</small>
                  </th>
                </tr>
              ) : null}
              <TableRow
                data-first-answer="rankings"
                data-team-key={key}
                aria-current={key === selectedKey ? 'true' : undefined}
                className={cn(
                  'board-row group/board cursor-pointer outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-focus',
                  pickedKeys.has(key) && 'is-picked',
                  key === selectedKey && 'is-selected',
                  excluded && 'is-excluded',
                )}
                style={{ '--league-color': leagueColor(team.league) } as CSSProperties}
                onPointerEnter={onPrepare}
                onTouchStart={onPrepare}
                onClick={(event) => {
                  if (shouldIgnoreTeamRowClick(event)) return
                  onOpen(team)
                }}
              >
                <TableCell className="board-col-rank relative" aria-label={excluded ? 'Unranked' : `Rank ${rank}`}>
                  {tie ? <NearTieMark position={tie} /> : null}
                  {gap ? <GapMark gap={gap} /> : null}
                  <TeamBoardRank team={team} rank={rank} rawScoreRank={scopeScoreRanks.get(key)} />
                </TableCell>
                <TableCell className="board-col-team">
                  <Button
                    type="button"
                    variant="ghost"
                    className="team-cell team-cell__button h-auto min-h-9 w-full cursor-pointer justify-start gap-2.5 whitespace-normal rounded-md border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit] hover:bg-transparent hover:text-[inherit] focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                    onClick={() => onOpen(team)}
                    onFocus={onPrepare}
                    title={`Open ${team.team}`}
                  >
                    <TeamMark team={team.team} code={team.code} className="team-mark size-8 border-0 bg-transparent" />
                    <span className="ent grid min-w-0 gap-px">
                      <b className="truncate font-semibold text-text">{team.team}</b>
                      <span className="league-label">
                        <span className="league-dot" aria-hidden="true" />
                        {excluded ? `${team.league}, ${eligibilitySummary(team)}` : team.league}
                      </span>
                    </span>
                  </Button>
                </TableCell>
                <TableCell className="board-col-tier">{tier ? <TierChip tier={tier} /> : null}</TableCell>
                <TableCell className="board-col-score" aria-label={`Power ${formatRating(score)}`}>
                  <span className="board-power">{typeof score === 'number' ? formatRating(score) : '—'}</span>
                </TableCell>
                <TableCell className="board-col-lane">
                  {axis && typeof score === 'number' ? (
                    <Lane
                      league={team.league}
                      value={score}
                      low={score - band}
                      high={score + band}
                      min={axis.min}
                      max={axis.max}
                      label={`${team.team} Power ${formatRating(score)}, band ±${formatRating(band)}`}
                    />
                  ) : null}
                </TableCell>
                <TableCell className="board-col-move">
                  {tournament ? (
                    <TournamentMoveChip movement={movementByTeamId.get(team.teamId)} endpointLabel={tournamentBoundaryLabel(tournament.status)} />
                  ) : (
                    <MovementChip places={activeMovement(team)?.rankMovement ?? undefined} title={rollingMovementTitle(team, movementPeriod)} />
                  )}
                </TableCell>
                <TableCell className="board-col-form">
                  <FormDots form={team.form} />
                </TableCell>
                <TableCell className="board-col-record num" aria-label={`Match wins ${formatNumber(team.wins)}, losses ${formatNumber(team.losses)}; win rate ${formatRatio(total > 0 ? team.wins / total : undefined)}`}>
                  <b className="font-semibold text-text">{formatRecord(team.wins, team.losses)}</b>{' '}
                  <span className="text-xs text-muted">{formatRatio(total > 0 ? team.wins / total : undefined)}</span>
                </TableCell>
                <TableCell className="board-col-action">
                  <CompareToggle picked={pickedKeys.has(key)} onToggle={() => onToggle(team)} label={team.team} />
                </TableCell>
              </TableRow>
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** The gap to the row above, at the top edge of the rank cell. A near tie adds the word and an outlined Δ. */
function GapMark({ gap }: { gap: Gap }) {
  return (
    <span className={cn('board-gap', gap.tie && 'is-tie')}>
      <span aria-hidden="true">Δ{formatNumber(gap.points)}{gap.tie ? ' tie' : ''}</span>
      <span className="sr-only">{formatNumber(gap.points)} Power behind {gap.above.team}{gap.tie ? ', a near tie' : ''}.</span>
    </span>
  )
}
