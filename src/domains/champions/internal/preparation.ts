import { compareCodeUnits } from '../../../shared/codeUnitOrder.mjs'
import type { ChampionDataset, ChampionRole, Concentration, PlayerHistory, Role } from '../types.ts'
import { rate } from './statistics.ts'

export function exposureConcentration(champions: ChampionRole[], role: Role, threshold: number): Concentration {
  const counts = champions.filter(c => c.role === role).sort((a, b) => b.appearances - a.appearances || a.championId - b.championId)
  const total = counts.reduce((sum, c) => sum + c.appearances, 0)
  let cumulative = 0
  let size = 0
  for (const count of counts) {
    if (cumulative / total >= threshold) break
    cumulative += count.appearances
    size++
  }
  return { role, appearances: total, threshold, poolSize: total ? size : null, cumulativeShare: total ? cumulative / total : null }
}

export function playerHistory(data: ChampionDataset): PlayerHistory | null {
  const query = data.analysis.player
  if (!query) return null
  const matches = data.matches.flatMap(match => {
    const participant = match.participants.find(p => p.playerKey === query.playerKey && p.role === query.role)
    return participant ? [{ startedAt: match.startedAt, championId: participant.championId, won: participant.won, durationSeconds: match.durationSeconds }] : []
  }).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.championId - b.championId || compareCodeUnits(a.startedAt, b.startedAt))
  const counts = new Map<number, { wins: number; games: number }>()
  for (const match of matches) {
    const count = counts.get(match.championId) ?? { wins: 0, games: 0 }
    count.games++
    count.wins += Number(match.won)
    counts.set(match.championId, count)
  }
  const championResults = [...counts].sort(([a], [b]) => a - b).map(([championId, count]) => ({
    role: query.role, championId, appearances: count.games, ...rate(count.wins, count.games),
  }))
  return {
    role: query.role, status: matches.length ? 'observed' : 'unavailable',
    ...rate(matches.filter(m => m.won).length, matches.length), championResults,
    concentration: exposureConcentration(championResults, query.role, data.analysis.concentrationThreshold), matches,
  }
}
