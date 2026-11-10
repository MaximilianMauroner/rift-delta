import type { ChampionDataset, Participant, Role } from '../../src/domains/champions/types.ts'

const roles: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
const scope: ChampionDataset['scope'] = { patch: 'synthetic-1', queueId: 420, platform: 'SYNTHETIC', population: 'solo-queue', rankSnapshotLabel: 'Synthetic example. No observed rank.' }

export const demoDataset: ChampionDataset = {
  version: 1,
  source: {
    kind: 'synthetic', id: 'champions-deterministic-demo-v1', collectedAt: '2026-10-03T00:00:00Z',
    selectionDescription: 'Twelve invented matches for command verification. No Riot or creator records.',
  },
  scope,
  window: { start: '2026-10-01T00:00:00Z', end: '2026-10-02T00:00:00Z' },
  matches: Array.from({ length: 12 }, (_, game) => {
    const winnerTeamId = game % 4 < 2 ? 100 as const : 200 as const
    return {
      matchId: `synthetic-${game + 1}`, scope,
      startedAt: `2026-10-01T${String(game).padStart(2, '0')}:00:00Z`,
      durationSeconds: 1200 + game * 90, winnerTeamId,
      participants: Array.from({ length: 10 }, (_, index): Participant => {
        let championId = index + 1
        if (index === 0 && game % 3 === 0) championId = 11
        if (index === 1 && game % 2 === 0) championId = 12
        if (index === 7 && game % 3 === 1) championId = 18
        const teamId = index < 5 ? 100 as const : 200 as const
        return {
          participantId: String(index + 1), teamId, championId,
          role: game === 11 && index === 4 ? null : roles[index % 5],
          won: teamId === winnerTeamId,
          ...(index === 1 && game % 2 === 0 ? {} : { finalDamage: { physical: 1000 + index * 300, magic: 2500 - index * 100, true: 100 + game * 10 } }),
        }
      }),
    }
  }),
  analysis: {
    minCellGames: 2, concentrationThreshold: 0.8,
    durationWindows: [
      { label: 'Under 30 minutes', minSeconds: 0, maxSeconds: 1800 },
      { label: 'At least 30 minutes', minSeconds: 1800, maxSeconds: null },
    ],
    pool: { role: 'TOP', championIds: [1, 11, 999] },
    counterAvailability: { q: 0.2, k: 3 },
  },
}
