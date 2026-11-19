import { useState, type CSSProperties } from 'react'
import { TeamMark } from '../../components/TeamMark'
import { RegionBadge, Segmented } from '../../components/ui'
import { Lane } from '../../components/ui/lane'
import { estimatePublicMatchup, type PublicMatchupModel } from '../../domains/rankings/read'
import type { RankingSummaryStanding } from '../../domains/rankings/types'
import { formatModelVersion, formatRating, teamKey } from '../../shared/display'
import { cn } from '../../shared/utils'
import { compareSeriesColors } from './compareAnalysisData'

const FORMATS = ['1', '3', '5'] as const
type Format = typeof FORMATS[number]

const shortName = (team: RankingSummaryStanding) => team.code ?? team.team

/**
 * Who would win, answered first. The bar splits in the same colours as the
 * rest of the comparison, so two teams from one league get two colours.
 * The range under it is the chance's sensitivity to both evidence bands.
 */
export function HeadToHead({ home, away, model }: { home: RankingSummaryStanding; away: RankingSummaryStanding; model?: PublicMatchupModel }) {
  const [format, setFormat] = useState<Format>('3')
  const bestOf = Number(format)
  const estimate = estimatePublicMatchup(home, away, model, { bestOf, sideAssumption: 'neutral', uncertaintyBands: true })
  const homeChance = Math.round(estimate.homeSeriesWinProbability * 100)
  const awayChance = 100 - homeChance
  const band = estimate.uncertaintyBand?.homeSeriesWinProbability
  const low = band ? Math.round(band.lower * 100) : undefined
  const high = band ? Math.round(band.upper * 100) : undefined
  const [homeColor, awayColor] = compareSeriesColors([home.league, away.league])

  return (
    <section data-first-answer="comparison" className="head-to-head grid gap-3" aria-label={`${home.team} against ${away.team}`}>
      <div className="head-to-head__teams">
        <MatchSide team={home} />
        <Segmented
          className="head-to-head__format"
          value={format}
          options={FORMATS.map((value) => ({ value, label: `Bo${value}` }))}
          onChange={setFormat}
          ariaLabel="Series format"
        />
        <MatchSide team={away} end />
      </div>
      <div className="grid gap-1.5">
        <span className="flex h-2.5 gap-1" aria-hidden="true">
          <span className="rounded-l-full" style={{ width: `${homeChance}%`, background: homeColor }} />
          <span className="rounded-r-full" style={{ width: `${awayChance}%`, background: awayColor }} />
        </span>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5">
          <Chance team={home} chance={homeChance} color={homeColor} />
          <p className="col-start-2 row-start-1 pt-1.5 text-center text-xs leading-[1.45] text-muted max-sm:col-span-3 max-sm:col-start-1 max-sm:row-start-2 max-sm:pt-0 max-sm:text-left">
            {shortName(home)} wins a Bo{bestOf} {homeChance}% of the time.
            {low !== undefined && high !== undefined ? ` Range ${low}% to ${high}%,` : ''} neutral side, model {formatModelVersion(model?.version)}.
          </p>
          <Chance team={away} chance={awayChance} color={awayColor} end />
        </div>
      </div>
    </section>
  )
}

function MatchSide({ team, end = false }: { team: RankingSummaryStanding; end?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', end && 'flex-row-reverse text-right')}>
      <TeamMark team={team.team} code={team.code} className="size-10 border-0 bg-transparent max-sm:size-8" />
      <div className={cn('grid min-w-0 gap-0.5', end && 'justify-items-end')}>
        <h2 className="line-clamp-2 text-base leading-tight font-semibold text-text">{team.team}</h2>
        <RegionBadge region={team.league} size="sm" />
      </div>
    </div>
  )
}

function Chance({ team, chance, color, end = false }: { team: RankingSummaryStanding; chance: number; color: string; end?: boolean }) {
  return (
    <span className={cn('col-start-1 row-start-1 grid leading-none', end && 'col-start-3 justify-items-end')}>
      <b className="text-3xl font-bold tabular-nums" style={{ color }}>{chance}%</b>
      <small className="mt-1 text-xs text-muted">{shortName(team)}</small>
    </span>
  )
}

/**
 * Every picked team on one Power axis, each with its evidence band, so the
 * overlap between bands is visible rather than implied by the ranks.
 */
export function PowerScale({ teams }: { teams: readonly RankingSummaryStanding[] }) {
  const lanes = teams.map((team) => {
    const band = Math.max(0, team.ratingComponents?.uncertainty ?? team.uncertainty ?? 0)
    return { team, low: team.rating - band, high: team.rating + band }
  })
  const lowest = Math.min(...lanes.map((lane) => lane.low))
  const highest = Math.max(...lanes.map((lane) => lane.high))
  const pad = Math.max(10, (highest - lowest) * 0.08)
  const min = lowest - pad
  const max = highest + pad
  const [first, second] = lanes
  const overlap = lanes.length === 2 && first.low <= second.high && second.low <= first.high
  const colors = compareSeriesColors(teams.map((team) => team.league))

  return (
    <section className="power-scale grid gap-2.5 rounded-[10px] border border-line bg-surface px-4 py-3.5" aria-label="On one Power scale">
      <h2 className="text-sm font-semibold text-text">On one Power scale</h2>
      <ul className="grid gap-2">
        {lanes.map(({ team, low, high }, index) => (
          <li key={teamKey(team)} className="grid grid-cols-[minmax(3.5rem,auto)_minmax(0,1fr)_auto] items-center gap-3 text-sm" style={{ '--league-color': colors[index] } as CSSProperties}>
            <b className="truncate font-semibold text-text">{shortName(team)}</b>
            <Lane
              league={team.league}
              color={colors[index]}
              value={team.rating}
              low={low}
              high={high}
              min={min}
              max={max}
              label={`${team.team}: Power ${formatRating(team.rating)}, band ${formatRating(low)} to ${formatRating(high)}`}
            />
            <span className="text-right font-semibold text-text tabular-nums">{formatRating(team.rating)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between pl-[calc(3.5rem+12px)] text-xs text-muted tabular-nums" aria-hidden="true">
        <span>{formatRating(min)}</span>
        <span>{formatRating(max)}</span>
      </div>
      {lanes.length === 2 ? (
        <p className="text-xs text-muted">
          {overlap
            ? `The Power bands of ${shortName(first.team)} and ${shortName(second.team)} overlap, so the gap is inside the model's uncertainty.`
            : `The Power bands of ${shortName(first.team)} and ${shortName(second.team)} do not overlap.`}
        </p>
      ) : null}
    </section>
  )
}
