import { z } from 'zod'
import type { ChampionDataset } from '../types.ts'

const text = z.string().trim().min(1).refine(value => ![...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), 'Control characters are not allowed')
const timestamp = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), 'Invalid timestamp')
const role = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'])
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const nonnegative = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const scope = z.strictObject({
  patch: text,
  queueId: z.number().int().nonnegative(),
  platform: text,
  population: z.enum(['solo-queue', 'professional']),
  rankSnapshotLabel: text.optional(),
})
const datasetSchema = z.strictObject({
  version: z.literal(1),
  source: z.strictObject({
    kind: z.enum(['synthetic', 'riot', 'other-recorded']), id: text,
    collectedAt: timestamp, selectionDescription: text,
  }),
  scope,
  window: z.strictObject({ start: timestamp, end: timestamp }),
  matches: z.array(z.strictObject({
    matchId: text, scope, startedAt: timestamp,
    durationSeconds: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
    winnerTeamId: z.union([z.literal(100), z.literal(200)]),
    participants: z.array(z.strictObject({
      participantId: text, teamId: z.union([z.literal(100), z.literal(200)]), championId: id,
      role: role.nullable(), won: z.boolean(), playerKey: text.optional(),
      finalDamage: z.strictObject({ physical: nonnegative, magic: nonnegative, true: nonnegative }).optional(),
    })).length(10),
  })),
  analysis: z.strictObject({
    minCellGames: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER),
    concentrationThreshold: z.number().finite().gt(0).lte(1),
    durationWindows: z.array(z.strictObject({
      label: text, minSeconds: nonnegative, maxSeconds: nonnegative.nullable(),
    })),
    pool: z.strictObject({ role, championIds: z.array(id).min(1) }).optional(),
    player: z.strictObject({ playerKey: text, role }).optional(),
    counterAvailability: z.strictObject({ q: z.number().finite().min(0).max(1), k: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).optional(),
  }),
})

function sameScope(a: ChampionDataset['scope'], b: ChampionDataset['scope']): boolean {
  return a.patch === b.patch && a.queueId === b.queueId && a.platform === b.platform
    && a.population === b.population && a.rankSnapshotLabel === b.rankSnapshotLabel
}

export function validateDataset(input: unknown): ChampionDataset {
  const data = datasetSchema.parse(input)
  const start = Date.parse(data.window.start)
  const end = Date.parse(data.window.end)
  if (start >= end) throw new Error('The dataset window must have start < end')
  if (Date.parse(data.source.collectedAt) < end) throw new Error('Collection time must be at or after the window end')
  const matchIds = new Set<string>()
  for (const match of data.matches) {
    if (matchIds.has(match.matchId)) throw new Error(`Duplicate match ID ${match.matchId}`)
    matchIds.add(match.matchId)
    if (!sameScope(data.scope, match.scope)) throw new Error(`Mixed cohort in ${match.matchId}`)
    const startedAt = Date.parse(match.startedAt)
    if (startedAt < start || startedAt >= end) throw new Error(`Match outside the start-inclusive, end-exclusive window ${match.matchId}`)
    if (startedAt + match.durationSeconds * 1000 > Date.parse(data.source.collectedAt)) throw new Error(`Match ends after collection ${match.matchId}`)
    const participants = match.participants
    if (new Set(participants.map(p => p.participantId)).size !== 10) throw new Error(`Duplicate participant ID in ${match.matchId}`)
    if (new Set(participants.map(p => p.championId)).size !== 10) throw new Error(`Champion mirrors or duplicate picks in ${match.matchId}`)
    const keys = participants.flatMap(p => p.playerKey === undefined ? [] : [p.playerKey])
    if (new Set(keys).size !== keys.length) throw new Error(`Duplicate player key in ${match.matchId}`)
    for (const teamId of [100, 200]) {
      const team = participants.filter(p => p.teamId === teamId)
      if (team.length !== 5) throw new Error(`Each team must contain five participants in ${match.matchId}`)
      const knownRoles = team.flatMap(p => p.role === null ? [] : [p.role])
      if (new Set(knownRoles).size !== knownRoles.length) throw new Error(`Duplicate team role in ${match.matchId}`)
    }
    if (participants.some(p => p.won !== (p.teamId === match.winnerTeamId))) throw new Error(`Winner inconsistency in ${match.matchId}`)
  }
  const windows = [...data.analysis.durationWindows].sort((a, b) => a.minSeconds - b.minSeconds)
  if (new Set(windows.map(w => w.label)).size !== windows.length) throw new Error('Duplicate duration window labels')
  windows.forEach((w, i) => {
    if (w.maxSeconds !== null && w.maxSeconds <= w.minSeconds) throw new Error('Duration window must have minSeconds < maxSeconds')
    const previous = windows[i - 1]
    if (previous && (previous.maxSeconds === null || previous.maxSeconds > w.minSeconds)) throw new Error('Duration windows must not overlap')
  })
  const pool = data.analysis.pool
  if (pool && new Set(pool.championIds).size !== pool.championIds.length) throw new Error('Duplicate pool champion IDs')
  return data
}
