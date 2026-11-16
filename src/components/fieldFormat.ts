import type { Rate } from '../domains/rankings/field-statistics'

export const signedGold = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString('en-US')}`

export const percent = (value: number) => `${(value * 100).toFixed(0)}%`

export const rateInterval = (rate: Rate) =>
  rate.interval
    ? `95% interval ${percent(rate.interval.low)}–${percent(rate.interval.high)}, ${rate.successes} of ${rate.trials}`
    : 'No games'
