import { playerPerformanceMetrics } from '../../domains/rankings/read'
import type { PlayerPerformanceMetric } from '../../domains/rankings/types'

/**
 * Fewer decimals as numbers grow, so 349.14 gold reads 349 and 2.25 wards stays
 * 2.25. `scale` sets the decimals, so numbers shown side by side share them.
 */
function figure(value: number, signed: boolean, scale: number, most: number) {
  const size = Math.abs(value)
  const digits = Math.min(most, scale >= 100 ? 0 : scale >= 10 ? 1 : 2)
  const text = size.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const zero = Number(text.replace(/,/g, '')) === 0
  const sign = zero ? '' : value < 0 ? '−' : signed && value > 0 ? '+' : ''
  return `${sign}${text}`
}

export function formatMetric(key: PlayerPerformanceMetric, value: number | null, scale = Math.abs(value ?? 0)) {
  if (value === null) return 'Unavailable'
  const { format, decimals } = playerPerformanceMetrics[key]
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'points') return `${figure(value * 100, true, scale * 100, decimals)} pts`
  return figure(value, format === 'signed', scale, decimals)
}
