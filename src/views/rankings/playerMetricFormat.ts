import { playerPerformanceMetrics } from '../../domains/rankings/read'
import type { PlayerPerformanceMetric } from '../../domains/rankings/types'

/** Fewer decimals as a number grows, so 349.14 gold reads 349 and 2.25 wards stays 2.25. */
function figure(value: number, signed: boolean) {
  const size = Math.abs(value)
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2
  const text = size.toLocaleString('en-US', { maximumFractionDigits: digits })
  const sign = value < 0 && text !== '0' ? '−' : signed && value > 0 && text !== '0' ? '+' : ''
  return `${sign}${text}`
}

export function formatMetric(key: PlayerPerformanceMetric, value: number | null) {
  if (value === null) return 'Unavailable'
  const format = playerPerformanceMetrics[key].format
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'points') return `${figure(value * 100, true)} pp`
  return figure(value, format === 'signed')
}
