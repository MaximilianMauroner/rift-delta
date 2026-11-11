import type { Role } from '../../domains/rankings/types'
import {
  rate, type Band, type ChampionRow, type LaneSplit, type Measure, type Metric, type PlayerReport, type RoleBaseline,
  type Trend, type Verdict,
} from '../../domains/scouting/report'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const percent = (value: number) => `${Math.round(value * 100)}%`
export const winLoss = (wins: number, games: number) => `${wins}–${games - wins}`

export function signed(value: number) {
  const whole = Math.round(value)
  return `${whole > 0 ? '+' : whole < 0 ? '−' : ''}${Math.abs(whole).toLocaleString('en-US')}`
}
/** Colour role of a lane lead. A level lane and a missing lead stay neutral. */
export const leadTone = (value: number | null) => value === null || Math.round(value) === 0 ? 'none' : value < 0 ? 'down' : 'up'

export function ordinal(value: number) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th')
  return `${value}${suffix}`
}

/** `2026-06-12` as `12 Jun`. The date string is read as text so no time zone can move it. */
export function shortDate(date: string) {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`
}
export const fullDate = (date: string) => `${shortDate(date)} ${date.slice(0, 4)}`

export function joinNames(names: readonly string[]) {
  return names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const PEER_NOUNS: Record<Role, string> = { Top: 'top laners', Jungle: 'junglers', Mid: 'mid laners', Bot: 'bot laners', Support: 'supports' }
export const peerNoun = (role: Role) => PEER_NOUNS[role]
/** Role as it reads inside a sentence, such as "mid average". */
export const roleWord = (role: Role) => role.toLowerCase()

export const TREND_TAGS: Record<Trend, { label: string; arrow: string } | null> = {
  new: { label: 'New', arrow: '' },
  rising: { label: 'More', arrow: '▲' },
  steady: null,
  fading: { label: 'Less', arrow: '▼' },
  dropped: { label: 'Not lately', arrow: '▼' },
}
const TREND_WORDS: Record<Trend, string> = {
  new: 'new lately', rising: 'played more lately', steady: '', fading: 'played less lately', dropped: 'not played lately',
}

/** The only place a verdict becomes words. The verdict itself comes from `verdict()` in the domain. */
export function verdictBadge(value: Verdict) {
  switch (value) {
    case 'small-sample': return { label: 'Small sample', arrow: '', variant: 'warning' as const }
    case 'above': return { label: 'Above average', arrow: '▲', variant: 'secondary' as const }
    case 'below': return { label: 'Below average', arrow: '▼', variant: 'secondary' as const }
    case 'close': return { label: 'Close to average', arrow: '', variant: 'secondary' as const }
  }
}

export function formatMeasure(metric: Metric, value: number | null) {
  if (value === null) return '–'
  switch (metric.format) {
    case 'signed': return signed(value)
    case 'integer': return Math.round(value).toLocaleString('en-US')
    case 'percent': return percent(value)
    case 'decimal': return value.toFixed(2)
  }
}

/**
 * Place of a value on a rank strip, in percent of the strip. Stronger is always to the right,
 * so a measure where low is better runs backwards. The ends keep 2 percent free so a dot is never cut.
 */
export function trackPosition(metric: Metric, band: Band, value: number) {
  const span = band.max - band.min
  const t = span > 0 ? Math.max(0, Math.min(1, (value - band.min) / span)) : 0.5
  return 2 + (metric.better === 'low' ? 1 - t : t) * 96
}
export function middleHalf(metric: Metric, band: Band) {
  const a = trackPosition(metric, band, band.q1)
  const b = trackPosition(metric, band, band.q3)
  return { left: Math.min(a, b), width: Math.abs(a - b) }
}

export type PoolSegment = { name: string; games: number; heat: number; size: 'big' | 'mid' | 'low' | 'tiny' }
/**
 * The last 90 days split by champion. Heat is the segment's games against the largest segment, from 1 to 6.
 * Games on champions outside the pool table are one muted "Others" segment with heat 0.
 */
export function poolSegments(player: Pick<PlayerReport, 'pool' | 'recent'>): PoolSegment[] {
  const rows = player.pool.filter(row => row.recent.games > 0)
  const listed = rows.reduce((sum, row) => sum + row.recent.games, 0)
  const largest = Math.max(1, ...rows.map(row => row.recent.games))
  const size = (games: number): PoolSegment['size'] => {
    const share = games / player.recent.games
    return share >= 0.15 ? 'big' : share >= 0.095 ? 'mid' : share >= 0.06 ? 'low' : 'tiny'
  }
  const segments = rows.map(row => ({
    name: row.champion, games: row.recent.games, heat: Math.max(1, Math.min(6, Math.ceil(6 * row.recent.games / largest))), size: size(row.recent.games),
  }))
  const others = player.recent.games - listed
  return others > 0 ? [...segments, { name: 'Others', games: others, heat: 0, size: size(others) }] : segments
}

export function laneShares(split: LaneSplit) {
  return split.games ? { behind: split.behind / split.games, even: split.even / split.games, ahead: split.ahead / split.games } : null
}

/** One sentence made only from counts in the report. It compares nothing and predicts nothing. */
export function readingSentence(player: PlayerReport, roles: Record<Role, RoleBaseline>) {
  const top = player.pool.filter(row => row.recent.games > 0).slice(0, 3).map(row => row.champion)
  const results = `${percent(player.wins / player.games)} of ${player.games} games`
  const lane = laneShares(player.lane)
  const base = laneShares(roles[player.role].lane)
  const laneClause = lane && base
    ? `, and led by 500 or more at 15 minutes in ${percent(lane.ahead)} of games with lane data (${roleWord(player.role)} average ${percent(base.ahead)})`
    : ''
  return top.length
    ? `Played ${joinNames(top)} most in the last 90 days, won ${results} overall${laneClause}.`
    : `No games in the last 90 days. Won ${results} on record${laneClause}.`
}

export function poolRowLabel(row: ChampionRow) {
  const { recent, all } = row
  const trend = TREND_WORDS[row.trend]
  return [
    `${row.champion}${trend ? `, ${trend}` : ''}.`,
    recent.games ? `Last 90 days: ${recent.games} games, ${recent.wins} won and ${recent.games - recent.wins} lost.` : 'No games in the last 90 days.',
    `Win rate ${percent(all.wins / all.games)} over ${all.games} games.`,
    row.lead ? `Lane lead at 15 minutes ${signed(row.lead.mean)} over ${row.lead.games} games.` : 'Lane lead not shown, too few lane games.',
  ].join(' ')
}

export const baselineRate = (tally: RoleBaseline['behind']) => tally.games ? rate(tally) : null

/** How many peers the ranks compare with. Each measure has its own field, so this can be a range. */
export function peerRange(measures: readonly Measure[]) {
  const sizes = measures.filter(measure => measure.rank !== null).map(measure => measure.of)
  if (!sizes.length) return null
  const low = Math.min(...sizes)
  const high = Math.max(...sizes)
  return low === high ? String(low) : `${low} to ${high}`
}

export function measureLabel(measure: Measure) {
  const value = formatMeasure(measure.metric, measure.value)
  if (measure.value === null) return `${measure.metric.label}: no data.`
  return measure.rank === null
    ? `${measure.metric.label}: ${value}, not ranked.`
    : `${measure.metric.label}: ${value}, ${ordinal(measure.rank)} of ${measure.of}.`
}
