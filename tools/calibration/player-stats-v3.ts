import { readFileSync } from 'node:fs'
import { buildPlayerModel } from '../../src/domains/rankings/build.ts'
import { inferEventTier, regionForLeague } from '../../src/domains/rankings/evidence.ts'
import type { MatchRecord, MatchRosterSnapshot, PlayerGameStats, Role } from '../../src/domains/rankings/types.ts'

type InputPlayer = { id: string; role: Role; stats: PlayerGameStats }
type InputGame = {
  id: string
  date: string
  event: string
  seriesId: string
  league: string
  playoff: boolean
  teamA: string
  teamB: string
  leagueA: string
  leagueB: string
  winner: string
  playersA: InputPlayer[]
  playersB: InputPlayer[]
}

const games = JSON.parse(readFileSync(0, 'utf8')) as InputGame[]
const roster = (players: InputPlayer[], date: string): MatchRosterSnapshot => ({
  sourceProvider: 'oracles-elixir',
  observedAt: date,
  completeness: 'complete-five-role',
  players: players.map((player) => ({ ...player, name: player.id })),
})
const matches: MatchRecord[] = games.map((game) => ({
  id: game.id,
  sourceProvider: 'oracles-elixir',
  sourceGameId: game.id,
  sourceMatchId: game.seriesId,
  date: game.date,
  season: Number(game.date.slice(0, 4)),
  event: game.event,
  phase: game.playoff ? 'Playoffs' : 'Regular season',
  region: regionForLeague(game.league),
  league: game.league,
  teamAHomeLeague: game.leagueA,
  teamBHomeLeague: game.leagueB,
  teamARoster: roster(game.playersA, game.date),
  teamBRoster: roster(game.playersB, game.date),
  patch: '',
  bestOf: 1,
  tier: inferEventTier({ league: game.league, event: game.event, playoffs: game.playoff }),
  teamA: game.teamA,
  teamB: game.teamB,
  winner: game.winner,
  teamAKills: 0,
  teamBKills: 0,
  teamAGold: 0,
  teamBGold: 0,
}))
const players = buildPlayerModel(matches, {})
const scores = Object.fromEntries(players.flatMap((player) => player.statsPower && !player.statsPower.priorOnly
  ? [[player.id, { score: player.statsPower.score, leagueAnchor: player.statsPower.leagueAnchor }]] : []))
process.stdout.write(`${JSON.stringify(scores)}\n`)
