import type { MatchRecord, MatchRosterSnapshot } from '../../types.ts'
import {
  initialTeamRating,
  maximumUncertainty,
  minimumUncertainty,
  rosterChangeUncertaintyPenalty,
  rosterContinuityFloor,
} from '../policy/modelConfig.ts'
import { clamp } from './ratingCalculations.ts'
import { rosterContinuity, rosterFingerprint } from '../players/rosters.ts'
import type { PregamePlayerRatingEdge, RosterUpgradeProof } from '../players/playerModel.ts'

export function applyRosterContinuityForSeries(
  match: MatchRecord,
  ratingChannels: readonly Map<string, number>[],
  uncertainties: Map<string, number>,
  lastRosterByTeam: Map<string, MatchRosterSnapshot>,
  currentRosterContinuity: Map<string, number>,
  playerEvidence?: PregamePlayerRatingEdge,
) {
  const processedTeams = new Set<string>()
  const preservedA = applyRosterContinuityForTeam({
    team: match.teamA,
    observedRoster: match.teamARoster,
    processedTeams,
    ratingChannels,
    uncertainties,
    lastRosterByTeam,
    currentRosterContinuity,
    upgrade: playerEvidence?.teamARosterUpgrade,
  })
  const preservedB = applyRosterContinuityForTeam({
    team: match.teamB,
    observedRoster: match.teamBRoster,
    processedTeams,
    ratingChannels,
    uncertainties,
    lastRosterByTeam,
    currentRosterContinuity,
    upgrade: playerEvidence?.teamBRosterUpgrade,
  })
  return [preservedA, preservedB] as const
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
  upgrade,
}: {
  team: string
  observedRoster?: MatchRosterSnapshot
  processedTeams: Set<string>
  ratingChannels: readonly Map<string, number>[]
  uncertainties: Map<string, number>
  lastRosterByTeam: Map<string, MatchRosterSnapshot>
  currentRosterContinuity: Map<string, number>
  upgrade?: RosterUpgradeProof
}) {
  if (processedTeams.has(team)) return false
  processedTeams.add(team)

  const continuity = rosterContinuity(lastRosterByTeam.get(team), observedRoster)
  if (continuity === undefined) return false

  currentRosterContinuity.set(team, continuity)
  const preserved = upgrade !== undefined && upgrade.previous === rosterFingerprint(lastRosterByTeam.get(team))
    && upgrade.played === rosterFingerprint(observedRoster)
  const retention = preserved ? 1 : rosterContinuityFloor + (1 - rosterContinuityFloor) * continuity
  for (const ratings of ratingChannels) {
    const rating = ratings.get(team) ?? initialTeamRating
    ratings.set(team, initialTeamRating + retention * (rating - initialTeamRating))
  }

  if (continuity < 1) {
    const uncertainty = uncertainties.get(team) ?? maximumUncertainty
    uncertainties.set(team, clamp(uncertainty + rosterChangeUncertaintyPenalty * (1 - continuity), minimumUncertainty, maximumUncertainty))
  }
  return preserved
}
