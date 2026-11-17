import { Fragment, useState, type CSSProperties } from 'react'
import { TeamMark } from '../../components/TeamMark'
import { Button } from '../../components/ui/button'
import { FormDots } from '../../components/ui'
import type { RankingSummaryStanding } from '../../domains/rankings/types'
import { formatRating, formatRatio, formatRecord, teamKey } from '../../shared/display'
import { leagueColor } from '../../shared/teamColor'
import { teamRankFor, teamScoreFor, formatUncertaintyBand } from './boardFormat'

export function PowerField({ teams, selected, onOpen, firstAnswer = false, bands = false }: {
  teams: readonly RankingSummaryStanding[]
  selected?: string
  onOpen: (team: RankingSummaryStanding) => void
  firstAnswer?: boolean
  bands?: boolean
}) {
  const [inspected, setInspected] = useState<string>()
  const rated = teams
    .filter((team) => Number.isFinite(teamScoreFor(team)))
    .toSorted((left, right) => teamScoreFor(right)! - teamScoreFor(left)!)
  if (rated.length === 0) return null
  const uncertainty = (team: RankingSummaryStanding) => team.ratingComponents?.uncertainty ?? team.uncertainty ?? 0
  const logoTeams = new Set(rated.filter((team) => team.eligibility?.eligible !== false).slice(0, 8).map(teamKey))
  const low = Math.floor(Math.min(...rated.map((team) => teamScoreFor(team)! - (bands ? uncertainty(team) : 0))) / 100) * 100 - 50
  const high = Math.ceil(Math.max(...rated.map((team) => teamScoreFor(team)! + (bands ? uncertainty(team) : 0))) / 100) * 100 + 50
  const at = (team: RankingSummaryStanding) => (teamScoreFor(team)! - low) / (high - low) * 100
  const active = rated.find((team) => teamKey(team) === inspected)
  return (
    <section className={`power-field${bands ? ' power-field--comparison' : ''}`} style={{ '--field-count': rated.length } as CSSProperties} aria-label="Every rated team on one Power scale" data-first-answer={firstAnswer ? 'rankings' : undefined}>
      <div className="power-field__plot">
        {rated.map((team, index) => (
          <Fragment key={teamKey(team)}>
            {bands ? (
              <span
                className="power-field__band"
                style={{
                  left: `${at(team) - uncertainty(team) / (high - low) * 100}%`,
                  width: `${2 * uncertainty(team) / (high - low) * 100}%`,
                  '--field-row': index,
                  '--league-color': leagueColor(team.league),
                } as CSSProperties}
                aria-label={`${team.team} Power evidence band ${formatRating(teamScoreFor(team)! - uncertainty(team))} to ${formatRating(teamScoreFor(team)! + uncertainty(team))}`}
              />
            ) : null}
            <button
              type="button"
              className={`power-field__team ${logoTeams.has(teamKey(team)) ? 'power-field__team--logo' : ''}`}
              style={{ left: `${at(team)}%`, '--field-row': bands ? index : index % 3, '--league-color': leagueColor(team.league) } as CSSProperties}
              aria-label={`${team.team}, ${team.league}, ${team.eligibility?.eligible !== false && teamRankFor(team) ? `rank ${teamRankFor(team)}, ` : 'unranked, '}Power ${formatRating(teamScoreFor(team))}`}
              aria-pressed={selected === teamKey(team)}
              onFocus={() => setInspected(teamKey(team))}
              onPointerEnter={() => setInspected(teamKey(team))}
              onClick={() => {
                setInspected(teamKey(team))
                onOpen(team)
              }}
            >
              {logoTeams.has(teamKey(team)) ? <TeamMark team={team.team} code={team.code} className="size-7" /> : null}
            </button>
          </Fragment>
        ))}
      </div>
      <div className="power-field__axis">
        <span>{formatRating(low)}</span><span>Power</span><span>{formatRating(high)}</span>
      </div>
      <p className="power-field__caption">{bands ? 'Teams on one Power scale. Lines show model evidence bands.' : `${rated.length} teams on one Power scale. Logos show the top eight. Dots show each league.`}</p>
      {active ? (
        <div className="power-field__inspection" aria-live="polite">
          <Button variant="ghost" size="sm" onClick={() => onOpen(active)}>{active.team}</Button>
          <span>{active.league}</span>
          <span>{formatRating(teamScoreFor(active))} {formatUncertaintyBand(active.ratingComponents?.uncertainty ?? active.uncertainty)} Power</span>
          <span>{formatRecord(active.wins, active.losses)} ({formatRatio(active.wins + active.losses ? active.wins / (active.wins + active.losses) : undefined)})</span>
          <FormDots form={active.form} />
        </div>
      ) : null}
    </section>
  )
}
