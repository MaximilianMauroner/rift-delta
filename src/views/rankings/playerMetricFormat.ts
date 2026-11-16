import { playerPerformanceMetrics } from '../../domains/rankings/read'
import type { PlayerPerformanceMetric } from '../../domains/rankings/types'

export function formatMetric(key: PlayerPerformanceMetric, value: number | null) {
  if (value === null) return 'Unavailable'
  const format = playerPerformanceMetrics[key].format
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'points') return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`
  return `${format === 'signed' && value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}
