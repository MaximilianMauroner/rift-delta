import type { CSSProperties } from 'react'
import { leagueColor } from '../../shared/teamColor'
import { cn } from '../../shared/utils'

export function Lane({ league, value, low, high, min, max, label, className }: {
  league: string
  value: number
  low: number
  high: number
  min: number
  max: number
  label: string
  className?: string
}) {
  const at = (point: number) => max > min ? Math.max(0, Math.min(100, (point - min) / (max - min) * 100)) : 50
  const start = at(low)
  return (
    <span role="img" aria-label={label} className={cn('power-lane', className)} style={{ '--league-color': leagueColor(league) } as CSSProperties}>
      <span className="power-lane__band" style={{ left: `${start}%`, width: `${Math.max(0, at(high) - start)}%` }} />
      <span className="power-lane__dot" style={{ left: `${at(value)}%` }} />
    </span>
  )
}
