import type { PairCell, Rate, Spread } from '../types.ts'

export function rate(wins: number, games: number): Rate {
  if (!games) return { distinctGames: 0, wins: 0, winRate: null, wilson95: null }
  const p = wins / games
  const z = 1.959963984540054
  const denominator = 1 + z * z / games
  const center = (p + z * z / (2 * games)) / denominator
  const radius = z * Math.sqrt(p * (1 - p) / games + z * z / (4 * games * games)) / denominator
  return { distinctGames: games, wins, winRate: p, wilson95: [Math.max(0, center - radius), Math.min(1, center + radius)] }
}

export function expectedProbability(a: Rate, b: Rate, relation: 'enemy' | 'ally'): number {
  const p = (a.wins + 0.5) / (a.distinctGames + 1)
  const q = (b.wins + 0.5) / (b.distinctGames + 1)
  const positive = relation === 'enemy' ? p * (1 - q) : p * q
  const negative = relation === 'enemy' ? (1 - p) * q : (1 - p) * (1 - q)
  return positive / (positive + negative)
}

export function spread(cells: PairCell[], minGames: number): Spread {
  const supported = cells.filter(c => c.distinctGames >= minGames)
  const base = {
    supportedCells: supported.length,
    noiseCorrectedVariance: null,
    correctionUnavailableReason: 'Cells share games and fitted marginals. Independent-cell noise correction does not apply. Raw spread includes sampling noise.',
  }
  if (supported.length < 2) return { ...base, meanWinRate: null, weightedSd: null, downsideRms: null, associationSd: null }
  const total = supported.reduce((sum, c) => sum + c.distinctGames, 0)
  const mean = supported.reduce((sum, c) => sum + c.wins, 0) / total
  const associationMean = supported.reduce((sum, c) => sum + c.association * c.distinctGames, 0) / total
  const weighted = (fn: (c: PairCell) => number) => supported.reduce((sum, c) => sum + c.distinctGames / total * fn(c), 0)
  return {
    ...base, meanWinRate: mean,
    weightedSd: Math.sqrt(weighted(c => (c.winRate! - mean) ** 2)),
    downsideRms: Math.sqrt(weighted(c => Math.min(0, c.winRate! - mean) ** 2)),
    associationSd: Math.sqrt(weighted(c => (c.association - associationMean) ** 2)),
  }
}
