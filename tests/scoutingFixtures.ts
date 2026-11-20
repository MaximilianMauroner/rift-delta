import type { MatchRecord, Role } from '../src/domains/rankings/types.ts'
import { buildScouting, scoutingShardPath } from '../src/domains/scouting/build.ts'
import { ROLES } from '../src/domains/scouting/model.ts'
import { scoutingReport } from '../src/domains/scouting/report.ts'

export const FOCAL = 'a-2'

export type ScoutingGameOptions = {
  id: string
  date: string
  datetimeUtc?: string
  gameNumber?: number
  /** Champion of the focal Mid player. */
  champion?: string
  /** Champion of the opposing Mid player. */
  against?: string
  won?: boolean
  lead?: number
  deaths?: number
  provider?: 'oracles-elixir' | 'leaguepedia-cargo'
  /** Drops the lane data from the game. */
  noLane?: boolean
  /** Team ids. The focal player's id is `${teams[0]}-2`. */
  teams?: [string, string]
}

/** One game of two complete teams. The focal player is the Mid on the first team, and the opposing Mid is the Mid on the second. */
export function scoutingGame(options: ScoutingGameOptions): MatchRecord {
  const { id, date, champion = 'Pick', against = 'Foe', won = true, lead = 0, deaths = 1, teams = ['a', 'b'] } = options
  const roster = (team: string, side: 0 | 1) => ({
    sourceProvider: 'oracles-elixir' as const, teamId: team, observedAt: date, completeness: 'complete-five-role' as const,
    players: ROLES.map((role: Role, i) => {
      const focal = side === 0 && i === 2
      const foe = side === 1 && i === 2
      const stats = {
        side: side === 0 ? 'blue' as const : 'red' as const, won: side === 0 ? won : !won, kills: 1, deaths: focal ? deaths : 1, assists: 1,
        champion: focal ? champion : foe ? against : `${team}-${role}`,
        goldDiffAt15: focal ? lead : foe ? -lead : 0, damagePerMinute: 100, csPerMinute: 8, killParticipation: 0.5,
      }
      if (options.noLane) delete (stats as { goldDiffAt15?: number }).goldDiffAt15
      return { id: `${team}-${i}`, name: focal ? 'Focal' : `${team}-${i}`, role, stats }
    }),
  })
  return {
    id, sourceProvider: options.provider ?? 'oracles-elixir', date, datetimeUtc: options.datetimeUtc, gameNumber: options.gameNumber, season: Number(date.slice(0, 4)),
    event: 'LCK', phase: 'Regular season', region: 'LCK', league: 'LCK', patch: '', bestOf: 1, tier: 'regional-regular',
    teamA: 'Alpha', teamB: 'Beta', winner: won ? 'Alpha' : 'Beta', teamAHomeLeague: 'LCK', teamBHomeLeague: 'LCK',
    teamAKills: 5, teamBKills: 5, teamAGold: 60_000, teamBGold: 60_000,
    teamARoster: roster(teams[0], 0), teamBRoster: roster(teams[1], 1),
  } as MatchRecord
}

const day = (month: number, d: number) => `2026-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Forty games for the focal player, built so every number is checkable by hand.
 * Newest game is 10 Jun, so the 90 day window starts after 12 Mar and the 30 January games are all old.
 * Veteran 8 old (dropped), Fader 10 old and 1 recent (fading), Steady 10 old and 3 recent (steady),
 * Riser 2 old and 4 recent (rising), Fresh 2 recent (new).
 * Steady games are ahead by 600 against Boon and won, Riser games are behind by 700 against Bane and lost,
 * and every other game is level against Foe.
 */
export function focalSeason(change: (options: ScoutingGameOptions) => ScoutingGameOptions = options => options): MatchRecord[] {
  const old = [...Array(8).fill('Veteran'), ...Array(10).fill('Fader'), ...Array(10).fill('Steady'), ...Array(2).fill('Riser')] as string[]
  const recent = ['Riser', 'Steady', 'Riser', 'Steady', 'Fresh', 'Riser', 'Steady', 'Riser', 'Fresh', 'Fader']
  return [...old.map((champion, i) => ({ champion, date: day(1, i + 1) })), ...recent.map((champion, i) => ({ champion, date: day(6, i + 1) }))]
    .map(({ champion, date }, i) => scoutingGame(change({
      id: `g${String(i).padStart(2, '0')}`, date, champion,
      against: champion === 'Riser' ? 'Bane' : champion === 'Steady' ? 'Boon' : 'Foe',
      lead: champion === 'Riser' ? -700 : champion === 'Steady' ? 600 : 0,
      won: champion === 'Steady' ? true : champion === 'Riser' ? false : i % 2 === 0,
      deaths: champion === 'Steady' ? 0 : 1,
    })))
}

/** The index and player files for some games, with plain data paths as links. */
export function scoutingOf(games: MatchRecord[] = focalSeason()) {
  return buildScouting(games, path => `/data/${path}`)
}

/** The report the browser shows for one player, built from the same files. */
export function reportOf(games: MatchRecord[] = focalSeason(), id = FOCAL, role: Role = 'Mid') {
  const { index, shards } = scoutingOf(games)
  const player = index.players.find(entry => entry.id === id && entry.role === role)
  if (!player) return undefined
  return scoutingReport(player, shards[scoutingShardPath(player)]!, index.through!)
}
