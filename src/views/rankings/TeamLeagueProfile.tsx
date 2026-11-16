import { FieldStrip } from '../../components/FieldStrip'
import { percent, rateInterval } from '../../components/fieldFormat'
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
  return (
    <section
      className="grid gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--detail-surface-2,var(--surface))] px-5 py-4 max-[900px]:px-4"
      aria-label={`${team.code ?? team.team} compared with ${team.league}`}
    >
      <div>
        <h3 className="text-base font-semibold text-[var(--text-strong)]">Compared with {team.league}</h3>
        <p className="text-xs text-muted-foreground">
          Each dot is one {team.league} team in this scope. The large dot is {team.code ?? team.team}. Record:{' '}
          {rateInterval(profile.record)}.
        </p>
      </div>
      <ol className="grid min-w-0 divide-y divide-border">
        {profile.positions.map((position) => (
          <FieldStrip
            key={position.metric}
            label={TEAM_FIELD_METRICS[position.metric].label}
            subject={team.code ?? team.team}
            subjectId={team.teamId}
            position={position}
            format={(value) => formatTeamValue(position.metric, value)}
            nameFor={(id) => codes.get(id) ?? id}
            detail={position.metric === 'winRate' ? rateInterval(profile.record) : undefined}
            minSamples={position.metric === 'recentForm' ? 3 : TEAM_FIELD_MIN_MATCHES}
            sampleUnit={position.metric === 'recentForm' ? 'recent results' : 'series'}
          />
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        σ is the distance from the league average in standard deviations. p is the share of league teams below. Teams
        enter after {TEAM_FIELD_MIN_MATCHES} scored series. Wins above expectation is series wins minus the
        results the ranking expected before each series.
      </p>
    </section>
  )
}
