import { demoDataset } from '../../../tools/champions/demo.ts'

export function riotFixture() {
  const data = structuredClone(demoDataset)
  data.scope = { patch: '16.18', queueId: 420, platform: 'EUW1', population: 'solo-queue' }
  data.analysis.player = { playerKey: 'opaque-local-key', role: 'TOP' }
  return {
    version: 1, source: data.source, scope: data.scope, window: data.window, analysis: data.analysis,
    playerKeysByPuuid: { 'fake-provider-puuid-1': 'opaque-local-key' },
    matches: data.matches.slice(0, 2).map((m, i) => ({
      metadata: { matchId: `EUW1_${i + 1}`, participants: ['private-provider-metadata'] },
      info: {
        gameVersion: '16.18.123.456', queueId: 420, gameStartTimestamp: Date.parse(m.startedAt),
        gameEndTimestamp: Date.parse(m.startedAt) + m.durationSeconds * 1000, gameDuration: m.durationSeconds,
        participants: m.participants.map(p => ({
          participantId: Number(p.participantId), teamId: p.teamId, championId: p.championId,
          teamPosition: p.role ?? '', win: p.won,
          gameEndedInEarlySurrender: false,
          puuid: p.participantId === '1' ? 'fake-provider-puuid-1' : 'other-private-provider-puuid-' + p.participantId,
          riotIdGameName: 'Never emit this name',
          ...(p.finalDamage ? { physicalDamageDealtToChampions: p.finalDamage.physical, magicDamageDealtToChampions: p.finalDamage.magic, trueDamageDealtToChampions: p.finalDamage.true } : {}),
        })),
      },
    })),
  }
}
