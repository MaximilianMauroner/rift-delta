import { scoutingGame } from './scoutingFixtures.ts'
import type { MatchRecord, TeamProfile } from '../src/domains/rankings/types.ts'
import type { RankingSourceImport } from '../scripts/rankings/source-input.ts'

export const reportTeams: Record<string, TeamProfile> = {
  Alpha: { name: 'Alpha', code: 'ALP', region: 'LCK', league: 'LCK' },
  Beta: { name: 'Beta', code: 'BET', region: 'LCK', league: 'LCK' },
}

export function reportGame(
  id = 'worlds-game-1',
  date = '2025-10-15',
  lead = 500,
): MatchRecord {
  return {
    ...scoutingGame({ id, date, lead }),
    event: `Worlds ${date.slice(0, 4)}`,
    phase: 'Swiss',
    tier: 'worlds-main',
    region: 'International',
    league: 'WLDs',
    sourceGameId: `source-${id}`,
    sourceMatchId: `series-${id}`,
    sourceFileName: 'synthetic-worlds-fixture.csv',
  }
}

export function reportSource(
  observed: MatchRecord[],
  rated = observed,
  teams = reportTeams,
): RankingSourceImport {
  return {
    importedMatches: observed,
    matches: rated,
    teams: reportTeams,
    mergedTeams: teams,
    source: 'Explicitly synthetic tournament report test fixture',
    dataMode: 'scheduled-public-data',
    externalSources: [],
    tournamentScheduleReferences: [],
  }
}
