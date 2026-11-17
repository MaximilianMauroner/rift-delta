import { FieldStrip, FieldStripKey } from '../../components/FieldStrip'
import { percent } from '../../components/fieldFormat'
import {
  TEAM_FIELD_METRICS,
  TEAM_FIELD_MIN_MATCHES,
  teamLeagueProfile,
  type TeamFieldMetric,
} from '../../domains/rankings/field-statistics'
import type { RankingSummaryStanding } from '../../domains/rankings/types'
import { formatRating } from '../../shared/display'

function formatTeamValue(metric: TeamFieldMetric, value: number) {
  const unit = TEAM_FIELD_METRICS[metric].unit
  if (unit === '%') return percent(value)
  if (unit === 'wins') return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`
  return formatRating(value)
}

export function TeamLeagueProfile({
  team,
  standings,
}: {
  team: RankingSummaryStanding
  standings: readonly RankingSummaryStanding[]
}) {
  const profile = teamLeagueProfile(standings, team.teamId)
  if (!profile) return null
  const codes = new Map(standings.map((entry) => [entry.teamId, entry.code ?? entry.team]))
  const subject = team.code ?? team.team
  return (
    <section
      className="grid gap-2 border-t border-line px-4 py-4"
      aria-label={`${subject} compared with ${team.league}`}
    >
      <h3 className="text-sm font-semibold text-text">Compared with {team.league}</h3>
      <ol className="grid min-w-0 divide-y divide-line">
        {profile.positions.map((position) => {
          const metric = TEAM_FIELD_METRICS[position.metric]
          return (
            <FieldStrip
              key={position.metric}
              label={metric.label}
              hint={metric.hint}
              subject={subject}
              subjectId={team.teamId}
              position={position}
              format={(value) => formatTeamValue(position.metric, value)}
              nameFor={(id) => codes.get(id) ?? id}
              within={`in ${team.league}`}
              minSamples={position.metric === 'recentForm' ? 3 : TEAM_FIELD_MIN_MATCHES}
              sampleUnit={position.metric === 'recentForm' ? 'recent results' : 'series'}
            />
          )
        })}
      </ol>
      <FieldStripKey subject={subject} others={`Other ${team.league} teams`}>
        <span>Teams need {TEAM_FIELD_MIN_MATCHES} series to count.</span>
      </FieldStripKey>
    </section>
  )
}
