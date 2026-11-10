export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY'
export interface Scope {
  patch: string
  queueId: number
  platform: string
  population: 'solo-queue' | 'professional'
  rankSnapshotLabel?: string
}
export interface Participant {
  participantId: string
  teamId: 100 | 200
  championId: number
  role: Role | null
  won: boolean
  playerKey?: string
  finalDamage?: { physical: number; magic: number; true: number }
}
export interface ChampionMatch {
  matchId: string
  scope: Scope
  startedAt: string
  durationSeconds: number
  winnerTeamId: 100 | 200
  participants: Participant[]
}
export interface DurationWindow {
  label: string
  minSeconds: number
  maxSeconds: number | null
}
export interface ChampionDataset {
  version: 1
  source: {
    kind: 'synthetic' | 'riot' | 'other-recorded'
    id: string
    collectedAt: string
    selectionDescription: string
  }
  scope: Scope
  window: { start: string; end: string }
  matches: ChampionMatch[]
  analysis: {
    minCellGames: number
    concentrationThreshold: number
    durationWindows: DurationWindow[]
    pool?: { role: Role; championIds: number[] }
    counterAvailability?: { q: number; k: number }
  }
}
export interface Rate {
  distinctGames: number
  wins: number
  winRate: number | null
  wilson95: [number, number] | null
}
export interface ChampionRole extends Rate {
  role: Role
  championId: number
  appearances: number
}
export interface PairCell extends Rate {
  focalRole: Role
  focalChampionId: number
  otherRole: Role
  otherChampionId: number
  expectedProbability: number
  association: number
}
export interface Spread {
  supportedCells: number
  meanWinRate: number | null
  weightedSd: number | null
  downsideRms: number | null
  associationSd: number | null
  noiseCorrectedVariance: null
  correctionUnavailableReason: string
}
export interface ChampionVariability extends Spread {
  role: Role
  championId: number
  relation: 'enemy' | 'ally'
}
export interface RoleInteraction {
  relation: 'enemy' | 'ally'
  focalRole: Role
  otherRole: Role
  distinctGames: number
  cells: number
  supportedCells: number
  meanAbsoluteAssociation: number | null
}
export interface ProfileSimilarity {
  role: Role
  championA: number
  championB: number
  commonOpponentDimensions: number
  associationRmse: number | null
  centeredCorrelation: number | null
}
export interface DamageComposition {
  role: Role | null
  championId: number
  distinctGames: number
  observedDamageGames: number
  missingDamageGames: number
  physicalShare: number | null
  magicShare: number | null
  trueShare: number | null
}
export interface DurationResult extends Rate {
  role: Role
  championId: number
  window: string
  minSeconds: number
  maxSeconds: number | null
}
export interface PoolEvidence {
  role: Role
  requestedChampions: Array<{ championId: number; status: 'observed' | 'unavailable'; evidence: Rate }>
  observedRequestedChampions: number
  requestedChampionCount: number
  distinctGamesWithPool: number
  opponentCoverage: Array<{ opponentRole: Role; opponentChampionId: number; supportedPoolChampions: number; requestedPoolChampions: number }>
}
export interface Concentration {
  role: Role
  appearances: number
  threshold: number
  poolSize: number | null
  cumulativeShare: number | null
}
export interface ChampionAnalysis {
  version: 1
  source: ChampionDataset['source']
  scope: Scope
  window: ChampionDataset['window']
  methods: {
    unit: string
    intervals: string
    baseline: string
    association: string
    variability: string
    minCellGames: number
    concentrationThreshold: number
    durationWindows: DurationWindow[]
  }
  coverage: {
    distinctGames: number
    participants: number
    knownRoleParticipants: number
    unknownRoleParticipants: number
    gamesWithAllRoles: number
    participantsWithOpaquePlayerKey: number
    participantsWithDamage: number
  }
  championRoles: ChampionRole[]
  enemyMatchups: PairCell[]
  allySynergies: PairCell[]
  variability: ChampionVariability[]
  roleInteractions: RoleInteraction[]
  profileSimilarity: ProfileSimilarity[]
  damageComposition: DamageComposition[]
  durationResults: DurationResult[]
  concentration: Concentration[]
  poolEvidence: PoolEvidence | null
  counterAvailability: { q: number; k: number; probability: number; label: string } | null
  unavailableCapabilities: Array<{ capability: string; reason: string; requiredFields: string[] }>
}
