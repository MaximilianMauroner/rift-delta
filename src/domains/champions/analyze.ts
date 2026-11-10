import { compareCodeUnits } from '../../shared/codeUnitOrder.mjs'
import type {
  ChampionAnalysis, ChampionDataset, ChampionRole, DamageComposition,
  PairCell, Participant, PoolEvidence, ProfileSimilarity, Role, RoleInteraction,
} from './types.ts'
import { validateDataset } from './internal/validate.ts'
import { expectedProbability, rate, spread } from './internal/statistics.ts'
import { exposureConcentration, playerHistory } from './internal/preparation.ts'
import { withinRoleVariability } from './internal/variability.ts'

const roles: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
const keyOf = (role: Role, championId: number) => `${role}:${championId}`
interface Count { wins: number; games: Set<string> }
interface PairCount extends Count {
  focalRole: Role
  focalChampionId: number
  otherRole: Role
  otherChampionId: number
}

function add<K>(map: Map<K, Count>, key: K, game: string, won: boolean) {
  const count = map.get(key) ?? { wins: 0, games: new Set() }
  if (!count.games.has(game)) {
    count.games.add(game)
    count.wins += Number(won)
  }
  map.set(key, count)
}

function pairCells(map: Map<string, PairCount>, marginals: Map<string, ChampionRole>, relation: 'enemy' | 'ally'): PairCell[] {
  return [...map].sort(([a], [b]) => compareCodeUnits(a, b)).map(([, c]) => {
    const observed = rate(c.wins, c.games.size)
    const expected = expectedProbability(marginals.get(keyOf(c.focalRole, c.focalChampionId))!, marginals.get(keyOf(c.otherRole, c.otherChampionId))!, relation)
    return {
      focalRole: c.focalRole, focalChampionId: c.focalChampionId,
      otherRole: c.otherRole, otherChampionId: c.otherChampionId,
      ...observed, expectedProbability: expected, association: observed.winRate! - expected,
    }
  })
}

function similarities(champions: ChampionRole[], enemies: PairCell[], minGames: number): ProfileSimilarity[] {
  const profiles = new Map<string, Map<string, number>>()
  for (const cell of enemies) {
    if (cell.distinctGames < minGames) continue
    const key = keyOf(cell.focalRole, cell.focalChampionId)
    const profile = profiles.get(key) ?? new Map<string, number>()
    profile.set(keyOf(cell.otherRole, cell.otherChampionId), cell.association)
    profiles.set(key, profile)
  }
  const rows: ProfileSimilarity[] = []
  for (let i = 0; i < champions.length; i++) {
    for (let j = i + 1; j < champions.length; j++) {
      const a = champions[i]
      const b = champions[j]
      if (a.role !== b.role) continue
      const first = profiles.get(keyOf(a.role, a.championId)) ?? new Map<string, number>()
      const second = profiles.get(keyOf(b.role, b.championId)) ?? new Map<string, number>()
      const common = [...first].filter(([key]) => second.has(key)).map(([key, value]) => [value, second.get(key)!])
      let rmse: number | null = null
      let correlation: number | null = null
      if (common.length >= 2) {
        rmse = Math.sqrt(common.reduce((sum, [x, y]) => sum + (x - y) ** 2, 0) / common.length)
        const meanA = common.reduce((sum, [x]) => sum + x, 0) / common.length
        const meanB = common.reduce((sum, [, y]) => sum + y, 0) / common.length
        const covariance = common.reduce((sum, [x, y]) => sum + (x - meanA) * (y - meanB), 0)
        const denominator = Math.sqrt(common.reduce((sum, [x]) => sum + (x - meanA) ** 2, 0) * common.reduce((sum, [, y]) => sum + (y - meanB) ** 2, 0))
        if (denominator > 0) correlation = Math.max(-1, Math.min(1, covariance / denominator))
      }
      rows.push({ role: a.role, championA: a.championId, championB: b.championId, commonOpponentDimensions: common.length, associationRmse: rmse, centeredCorrelation: correlation })
    }
  }
  return rows
}

function poolEvidence(data: ChampionDataset, champions: Map<string, ChampionRole>, enemies: PairCell[]): PoolEvidence | null {
  const pool = data.analysis.pool
  if (!pool) return null
  const requested = pool.championIds.map(championId => {
    const evidence = champions.get(keyOf(pool.role, championId))
    return { championId, status: evidence ? 'observed' as const : 'unavailable' as const, evidence: evidence ? rate(evidence.wins, evidence.distinctGames) : rate(0, 0) }
  })
  const dimensions = new Map<string, { opponentRole: Role; opponentChampionId: number; champions: Set<number> }>()
  for (const cell of enemies.filter(c => c.focalRole === pool.role)) {
    const key = keyOf(cell.otherRole, cell.otherChampionId)
    const dimension = dimensions.get(key) ?? { opponentRole: cell.otherRole, opponentChampionId: cell.otherChampionId, champions: new Set<number>() }
    if (pool.championIds.includes(cell.focalChampionId) && cell.distinctGames >= data.analysis.minCellGames) dimension.champions.add(cell.focalChampionId)
    dimensions.set(key, dimension)
  }
  return {
    role: pool.role, requestedChampions: requested,
    observedRequestedChampions: requested.filter(c => c.status === 'observed').length,
    requestedChampionCount: requested.length,
    distinctGamesWithPool: data.matches.filter(m => m.participants.some(p => p.role === pool.role && pool.championIds.includes(p.championId))).length,
    opponentCoverage: [...dimensions].sort(([a], [b]) => compareCodeUnits(a, b)).map(([, d]) => ({ opponentRole: d.opponentRole, opponentChampionId: d.opponentChampionId, supportedPoolChampions: d.champions.size, requestedPoolChampions: requested.length })),
  }
}

function damages(data: ChampionDataset): DamageComposition[] {
  const counts = new Map<string, { role: Role | null; championId: number; games: number; observed: number; physical: number; magic: number; true: number }>()
  for (const match of data.matches) {
    for (const p of match.participants) {
      const key = `${p.role}:${p.championId}`
      const c = counts.get(key) ?? { role: p.role, championId: p.championId, games: 0, observed: 0, physical: 0, magic: 0, true: 0 }
      c.games++
      if (p.finalDamage) {
        c.observed++
        c.physical += p.finalDamage.physical
        c.magic += p.finalDamage.magic
        c.true += p.finalDamage.true
      }
      counts.set(key, c)
    }
  }
  return [...counts].sort(([a], [b]) => compareCodeUnits(a, b)).map(([, c]) => {
    const total = c.physical + c.magic + c.true
    return {
      role: c.role, championId: c.championId, distinctGames: c.games,
      observedDamageGames: c.observed, missingDamageGames: c.games - c.observed,
      physicalShare: total > 0 ? c.physical / total : null,
      magicShare: total > 0 ? c.magic / total : null,
      trueShare: total > 0 ? c.true / total : null,
    }
  })
}

export function analyzeChampions(input: unknown): ChampionAnalysis {
  const data = validateDataset(input)
  const marginals = new Map<string, Count>()
  const enemyCounts = new Map<string, PairCount>()
  const allyCounts = new Map<string, PairCount>()
  const durations = new Map<string, Count>()
  for (const match of data.matches) {
    const known = match.participants.filter((p): p is Participant & { role: Role } => p.role !== null)
    for (const focal of known) {
      const focalKey = keyOf(focal.role, focal.championId)
      add(marginals, focalKey, match.matchId, focal.won)
      for (const window of data.analysis.durationWindows) {
        if (match.durationSeconds >= window.minSeconds && (window.maxSeconds === null || match.durationSeconds < window.maxSeconds)) add(durations, JSON.stringify([focalKey, window.label]), match.matchId, focal.won)
      }
      for (const other of known) {
        if (other.participantId === focal.participantId) continue
        const map = other.teamId === focal.teamId ? allyCounts : enemyCounts
        const key = `${focalKey}|${keyOf(other.role, other.championId)}`
        const count = map.get(key) ?? { focalRole: focal.role, focalChampionId: focal.championId, otherRole: other.role, otherChampionId: other.championId, wins: 0, games: new Set<string>() }
        count.games.add(match.matchId)
        count.wins += Number(focal.won)
        map.set(key, count)
      }
    }
  }
  const champions = new Map<string, ChampionRole>()
  for (const [key, count] of [...marginals].sort(([a], [b]) => compareCodeUnits(a, b))) {
    const [role, champion] = key.split(':')
    champions.set(key, { role: role as Role, championId: Number(champion), appearances: count.games.size, ...rate(count.wins, count.games.size) })
  }
  const championRoles = [...champions.values()]
  const enemyMatchups = pairCells(enemyCounts, champions, 'enemy')
  const allySynergies = pairCells(allyCounts, champions, 'ally')
  const relationTables = [{ relation: 'enemy' as const, cells: enemyMatchups, counts: enemyCounts }, { relation: 'ally' as const, cells: allySynergies, counts: allyCounts }]
  const variability = relationTables.flatMap(({ relation, cells }) => championRoles.map(c => ({
    role: c.role, championId: c.championId, relation,
    ...spread(cells.filter(p => p.focalRole === c.role && p.focalChampionId === c.championId), data.analysis.minCellGames),
  })))
  const roleInteractions: RoleInteraction[] = relationTables.flatMap(({ relation, cells, counts }) => roles.flatMap(focalRole => roles.flatMap(otherRole => {
    const selected = cells.filter(c => c.focalRole === focalRole && c.otherRole === otherRole)
    if (!selected.length) return []
    const supported = selected.filter(c => c.distinctGames >= data.analysis.minCellGames)
    const weight = supported.reduce((sum, c) => sum + c.distinctGames, 0)
    const games = new Set([...counts.values()].filter(c => c.focalRole === focalRole && c.otherRole === otherRole).flatMap(c => [...c.games]))
    return [{ relation, focalRole, otherRole, distinctGames: games.size, cells: selected.length, supportedCells: supported.length, meanAbsoluteAssociation: weight ? supported.reduce((sum, c) => sum + Math.abs(c.association) * c.distinctGames, 0) / weight : null }]
  })))
  const all = data.matches.flatMap(m => m.participants)
  const scenario = data.analysis.counterAvailability
  return {
    version: 1, source: data.source, scope: data.scope, window: data.window,
    methods: {
      version: 'rift-delta-champions-1',
      eligibility: 'Normalized records include every supplied match. Document remake and early-ending selection in source.selectionDescription. The local Riot adapter requires modern timestamps and explicit early-surrender flags, and refuses flagged matches.',
      unit: 'Each champion-role and directional pair cell counts distinct games. Cells and participants share games and are not independent replicates.',
      intervals: 'Wilson 95% intervals for raw within-cell Bernoulli rates. Assumes independent games. Repeated players, selection, and time dependence can narrow coverage. No adjusted intervals.',
      baseline: 'Odds combination of Jeffreys-smoothed marginal rates p=(wins+0.5)/(games+1). Enemy odds divide, ally odds multiply. Fitted on this same sample.',
      association: 'Observed win rate minus odds baseline. Empirical baseline-adjusted association, NOT calibrated or causal prediction. No shrinkage of observed cell rates.',
      variability: 'Game-count-weighted population SD and lower-tail RMS around the cell mean. Cells overlap. Includes sampling noise. Baseline-adjusted dispersion is uncorrected. No certainty of true spread.',
      minCellGames: data.analysis.minCellGames,
      concentrationThreshold: data.analysis.concentrationThreshold,
      durationWindows: data.analysis.durationWindows,
    },
    coverage: {
      distinctGames: data.matches.length, participants: all.length,
      knownRoleParticipants: all.filter(p => p.role !== null).length,
      unknownRoleParticipants: all.filter(p => p.role === null).length,
      gamesWithAllRoles: data.matches.filter(m => m.participants.every(p => p.role !== null)).length,
      participantsWithOpaquePlayerKey: all.filter(p => p.playerKey !== undefined).length,
      participantsWithDamage: all.filter(p => p.finalDamage !== undefined).length,
    },
    championRoles, enemyMatchups, allySynergies, variability, roleInteractions,
    withinRoleVariability: relationTables.flatMap(({ relation, cells }) => withinRoleVariability(championRoles, cells, relation, data.analysis.minCellGames)),
    profileSimilarity: similarities(championRoles, enemyMatchups, data.analysis.minCellGames),
    damageComposition: damages(data),
    durationResults: championRoles.flatMap(c => data.analysis.durationWindows.map(w => {
      const count = durations.get(JSON.stringify([keyOf(c.role, c.championId), w.label]))
      return { role: c.role, championId: c.championId, window: w.label, minSeconds: w.minSeconds, maxSeconds: w.maxSeconds, ...rate(count?.wins ?? 0, count?.games.size ?? 0) }
    })),
    concentration: roles.map(role => exposureConcentration(championRoles, role, data.analysis.concentrationThreshold)),
    poolEvidence: poolEvidence(data, champions, enemyMatchups),
    privatePlayerHistory: playerHistory(data),
    counterAvailability: scenario ? { ...scenario, probability: scenario.k === 0 ? 0 : -Math.expm1(scenario.k * Math.log1p(-scenario.q)), label: 'Hypothetical independent availability. NOT measured actual counterpick chance.' } : null,
    unavailableCapabilities: [
      { capability: 'Timeline and scaling', reason: 'Final-duration results describe selected completed games. They do not measure power growth or controlled combat.', requiredFields: ['timestampSeconds', 'all ten participants at each timestamp', 'level', 'gold', 'inventory', 'health', 'position', 'alive state', 'game state and sampling policy'] },
      { capability: 'Objective effects', reason: 'No objective event or pre-event state. Descriptive association cannot identify a causal effect.', requiredFields: ['objective event type and time', 'teamId', 'complete pre-event state', 'treatment definition', 'confounder and identification plan'] },
      { capability: 'Historical rank', reason: 'Scope labels are caller declarations. No historical rank reconstruction or rank equivalence.', requiredFields: ['contemporaneous rank snapshot time', 'queueId', 'platform', 'tier', 'division', 'LP', 'selection and linkage provenance'] },
      { capability: 'Build simulation', reason: 'Final damage totals cannot reconstruct builds or combat. No new combat simulator.', requiredFields: ['ruleset and patch', 'champion level and skill ranks', 'item inventory', 'runes', 'target state', 'combat scenario for the existing DPS engine'] },
      ...(!data.analysis.player ? [{ capability: 'Player histories', reason: 'No private player request. Supply analysis.player and stable opaque keys in authorized records to enable local history. Keys are never emitted.', requiredFields: ['analysis.player with role and playerKey', 'stable opaque participant playerKey', 'authorized private history selection'] }] : []),
    ],
  }
}
