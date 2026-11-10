import type { ChampionRole, PairCell, Role, WithinRoleVariability } from '../types.ts'

export function withinRoleVariability(champions: ChampionRole[], cells: PairCell[], relation: 'enemy' | 'ally', minGames: number): WithinRoleVariability[] {
  const roles: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
  return champions.flatMap(champion => roles.flatMap(otherRole => {
    const selected = cells.filter(c => c.focalRole === champion.role && c.focalChampionId === champion.championId && c.otherRole === otherRole)
    if (!selected.length) return []
    const supported = selected.filter(c => c.distinctGames >= minGames)
    const total = supported.reduce((sum, c) => sum + c.distinctGames, 0)
    const mean = supported.length >= 2 ? supported.reduce((sum, c) => sum + c.wins, 0) / total : null
    const observed = mean === null ? null : supported.reduce((sum, c) => sum + c.distinctGames / total * (c.winRate! - mean) ** 2, 0)
    const noise = mean === null ? null : supported.reduce((sum, c) => {
      const weight = c.distinctGames / total
      return sum + weight * (1 - weight) * c.winRate! * (1 - c.winRate!) / (c.distinctGames - 1)
    }, 0)
    return [{
      role: champion.role, championId: champion.championId, relation, otherRole,
      candidateGames: champion.distinctGames, supportedGames: total, supportedCells: supported.length,
      coverage: total / champion.distinctGames, meanWinRate: mean,
      observedVariance: observed, estimatedSamplingVariance: noise,
      estimatedExcessSd: observed === null || noise === null ? null : Math.sqrt(Math.max(0, observed - noise)),
      label: 'Approximate raw-rate excess spread within one other role. Cells use disjoint games, conditional on observed weights. Assumes independent games. Does not adjust champion strength or baseline uncertainty. Zero means excess spread is unresolved, not proven absent.',
    }]
  }))
}
