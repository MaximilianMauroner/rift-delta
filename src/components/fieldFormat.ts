import type { Better, FieldStanding } from '../domains/rankings/field-statistics'

export const signedGold = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString('en-US')}`

export const percent = (value: number) => `${(value * 100).toFixed(0)}%`

export function ordinal(value: number) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th')
  return `${value}${suffix}`
}

/** The words for a standing. A style measure (`better` is null) says higher or lower, never better or worse. */
export function standingLabel(standing: FieldStanding, better: Better, within: string) {
  if (standing === 'top') return `${better ? 'Best' : 'Highest'} ${within}`
  if (standing === 'close') return 'Close to average'
  const above = standing === 'above'
  if (better) return above ? 'Above average' : 'Below average'
  return above ? 'Higher than average' : 'Lower than average'
}
