import type { MatchRecord, MatchRosterSnapshot } from '../../types.ts'
import {
  initialTeamRating,
  maximumUncertainty,
  minimumUncertainty,
  rosterChangeUncertaintyPenalty,
  rosterContinuityFloor,
} from '../policy/modelConfig.ts'
import { clamp } from './ratingCalculations.ts'
import { rosterContinuity } from '../players/rosters.ts'

export function applyRosterContinuityForSeries(
  match: MatchRecord,
  ratingChannels: readonly Map<string, number>[],
  uncertainties: Map<string, number>,
  lastRosterByTeam: Map<string, MatchRosterSnapshot>,
  currentRosterContinuity: Map<string, number>,
) {
  const processedTeams = new Set<string>()
  applyRosterContinuityForTeam({
    team: match.teamA,
    observedRoster: match.teamARoster,
    processedTeams,
    ratingChannels,
    uncertainties,
    lastRosterByTeam,
    currentRosterContinuity,
  })
  applyRosterContinuityForTeam({
    team: match.teamB,
    observedRoster: match.teamBRoster,
    processedTeams,
    ratingChannels,
    uncertainties,
    lastRosterByTeam,
    currentRosterContinuity,
  })
}

export function roundedContinuity(value?: number) {
  return value === undefined ? undefined : Number(value.toFixed(3))
}

function applyRosterContinuityForTeam({
  team,
  observedRoster,
  processedTeams,
  ratingChannels,
  uncertainties,
  lastRosterByTeam,
  currentRosterContinuity,
}: {
  team: string
  observedRoster?: MatchRosterSnapshot
  processedTeams: Set<string>
  ratingChannels: readonly Map<string, number>[]
  uncertainties: Map<string, number>
  lastRosterByTeam: Map<string, MatchRosterSnapshot>
  currentRosterContinuity: Map<string, number>
}) {
  if (processedTeams.has(team)) return
  processedTeams.add(team)

  const continuity = rosterContinuity(lastRosterByTeam.get(team), observedRoster)
  if (continuity === undefined) return

  currentRosterContinuity.set(team, continuity)
  const retention = rosterContinuityFloor + (1 - rosterContinuityFloor) * continuity
  for (const ratings of ratingChannels) {
    const rating = ratings.get(team) ?? initialTeamRating
    ratings.set(team, initialTeamRating + retention * (rating - initialTeamRating))
  }

  if (continuity < 1) {
    const uncertainty = uncertainties.get(team) ?? maximumUncertainty
    uncertainties.set(team, clamp(uncertainty + rosterChangeUncertaintyPenalty * (1 - continuity), minimumUncertainty, maximumUncertainty))
  }
}
