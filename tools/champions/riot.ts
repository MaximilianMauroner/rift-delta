import { z } from 'zod'

const damage = z.number().finite().nonnegative().optional()
const participant = z.object({
  participantId: z.number().int().positive(), teamId: z.union([z.literal(100), z.literal(200)]),
  championId: z.number().int().positive(), teamPosition: z.string().optional(), win: z.boolean(),
  gameEndedInEarlySurrender: z.boolean(),
  puuid: z.string().optional(), physicalDamageDealtToChampions: damage,
  magicDamageDealtToChampions: damage, trueDamageDealtToChampions: damage,
})
const envelope = z.strictObject({
  version: z.literal(1), source: z.unknown(), window: z.unknown(), analysis: z.unknown(),
  scope: z.strictObject({
    patch: z.string(), queueId: z.number().int(), platform: z.string(),
    population: z.enum(['solo-queue', 'professional']), rankSnapshotLabel: z.string().optional(),
  }),
  playerKeysByPuuid: z.record(z.string(), z.string()).optional(),
  matches: z.array(z.object({
    metadata: z.object({ matchId: z.string() }),
    info: z.object({
      gameVersion: z.string().regex(/^\d+\.\d+\.\d+(?:\.\d+)?$/), queueId: z.number().int(), gameStartTimestamp: z.number().int().positive(),
      gameDuration: z.number().finite().positive(), gameEndTimestamp: z.number().int().positive(),
      participants: z.array(participant),
    }),
  })),
})
const roles = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'])

export function normalizeRiotExport(input: unknown): unknown {
  const data = envelope.parse(input)
  const keys = Object.values(data.playerKeysByPuuid ?? {})
  if (new Set(keys).size !== keys.length) throw new Error('Different PUUIDs must have distinct opaque player keys')
  const matches = data.matches.map(match => {
    const info = match.info
    if (info.gameEndTimestamp <= info.gameStartTimestamp) throw new Error('Riot match end must follow match start')
    const patch = info.gameVersion.split('.').slice(0, 2).join('.')
    if (patch !== data.scope.patch || info.queueId !== data.scope.queueId || !match.metadata.matchId.startsWith(`${data.scope.platform}_`)) throw new Error(`Riot match scope mismatch in ${match.metadata.matchId}`)
    if (Math.abs(info.gameEndTimestamp - info.gameStartTimestamp - info.gameDuration * 1000) > 120000) throw new Error('Riot duration disagrees with timestamps. This adapter accepts modern second-based MatchV5 exports only.')
    if (info.participants.some(p => p.gameEndedInEarlySurrender)) throw new Error(`Early-surrender or remake flag in ${match.metadata.matchId}. Exclude this match and record that selection policy before import.`)
    const winners = new Set(info.participants.filter(p => p.win).map(p => p.teamId))
    if (winners.size !== 1) throw new Error('Riot export must have exactly one winning team')
    return {
      matchId: match.metadata.matchId, scope: data.scope,
      startedAt: new Date(info.gameStartTimestamp).toISOString(), durationSeconds: info.gameDuration,
      winnerTeamId: [...winners][0],
      participants: info.participants.map(p => {
        const playerKey = p.puuid === undefined ? undefined : data.playerKeysByPuuid?.[p.puuid]
        const completeDamage = p.physicalDamageDealtToChampions !== undefined && p.magicDamageDealtToChampions !== undefined && p.trueDamageDealtToChampions !== undefined
        return {
          participantId: String(p.participantId), teamId: p.teamId, championId: p.championId,
          role: roles.has(p.teamPosition ?? '') ? p.teamPosition : null, won: p.win,
          ...(playerKey === undefined ? {} : { playerKey }),
          ...(completeDamage ? { finalDamage: { physical: p.physicalDamageDealtToChampions, magic: p.magicDamageDealtToChampions, true: p.trueDamageDealtToChampions } } : {}),
        }
      }),
    }
  })
  return { version: data.version, source: data.source, scope: data.scope, window: data.window, analysis: data.analysis, matches }
}
