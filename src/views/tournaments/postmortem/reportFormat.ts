import type { ReportRate } from '../../../domains/rankings/tournament-reports'

export const signedGold = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString('en-US')}`

export const percent = (value: number) => `${(value * 100).toFixed(0)}%`

export const rateInterval = (rate: ReportRate) =>
  rate.interval
    ? `95% interval ${percent(rate.interval.low)}–${percent(rate.interval.high)}, ${rate.successes} of ${rate.trials}`
    : 'No games'

export function formatTeamMetric(unit: string, value: number) {
  if (unit === '%') return percent(value)
  if (unit === 'gold') return signedGold(value)
  return `${value.toFixed(1)} ${unit}`
}
