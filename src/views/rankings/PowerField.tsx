import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { TeamMark } from '../../components/TeamMark'
import { Select } from '../../components/ui/select'
import type { RankingTierLabel } from '../../domains/rankings/read'
import type { RankingSummaryStanding } from '../../domains/rankings/types'
import { formatNumber, formatRating, teamKey } from '../../shared/display'
import { leagueColor } from '../../shared/teamColor'
import { cn } from '../../shared/utils'
import { fieldAxis, swarmOffsets, tierZones } from './powerField'

const DISC_COUNT = 8
/** Below this width the field is a thin strip of dots, as on phones. */
const STRIP_BELOW = 600
/** `top` keeps the tier names clear of the marks. */
const WIDE = { height: 148, top: 18, inset: 18, disc: 16, dot: 6 }
const STRIP = { height: 48, top: 0, inset: 5, dot: 4 }

/**
 * Every team in the current scope and filters on one Power axis, so the
 * reader sees the gaps before reading the list. The top eight carry their
 * logo; the rest are dots in league colour. Each mark is a button that opens
 * the team, and the arrow keys move between marks in Power order.
 */
export function PowerField({
  teams,
  ranked,
  tierFor,
  selectedKey,
  gapExample,
  onOpen,
  onPrepare,
}: {
  teams: readonly RankingSummaryStanding[]
  /** The whole ranked board, which sets the tier zones. */
  ranked: readonly RankingSummaryStanding[]
  tierFor: (team: RankingSummaryStanding) => RankingTierLabel | undefined
  selectedKey?: string
  /** Game win chance for a 100-point gap, from the model. */
  gapExample: number
  onOpen: (team: RankingSummaryStanding) => void
  onPrepare: () => void
}) {
  const plotRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const plot = fieldRef.current
    if (!plot) return
    const measure = () => {
      const style = getComputedStyle(plot)
      setWidth(plot.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(plot)
    return () => observer.disconnect()
  }, [])

  const strip = width > 0 && width < STRIP_BELOW
  const size = strip ? STRIP : WIDE
  const byPower = useMemo(() => [...teams].sort((left, right) => right.rating - left.rating), [teams])
  const axis = useMemo(() => fieldAxis(byPower.map((team) => team.rating)), [byPower])
  const zones = useMemo(() => strip ? [] : tierZones(ranked, tierFor, axis), [axis, ranked, strip, tierFor])
  const xFor = (rating: number) => size.inset + ((rating - axis.min) / (axis.max - axis.min)) * Math.max(0, width - 2 * size.inset)
  const marks = useMemo(() => {
    if (width === 0) return []
    const items = byPower.map((team, index) => {
      const disc = !strip && index < DISC_COUNT
      const radius = disc ? WIDE.disc : strip ? STRIP.dot : WIDE.dot
      const x = size.inset + ((team.rating - axis.min) / (axis.max - axis.min)) * Math.max(0, width - 2 * size.inset)
      return { team, key: teamKey(team), disc, radius, x }
    })
    const band = size.height - size.top
    const offsets = swarmOffsets(items, band)
    return items.map((item, index) => ({ ...item, y: size.top + band / 2 + offsets[index] }))
  }, [axis, byPower, size, strip, width])

  const [active, setActive] = useState<string>()
  const keys = byPower.map(teamKey)
  const activeKey = active && keys.includes(active) ? active : selectedKey && keys.includes(selectedKey) ? selectedKey : keys[0]

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const index = keys.indexOf(activeKey ?? '')
    const target = {
      ArrowRight: index - 1,
      ArrowUp: index - 1,
      ArrowLeft: index + 1,
      ArrowDown: index + 1,
      End: 0,
      Home: keys.length - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    const key = keys[Math.min(Math.max(0, target), keys.length - 1)]
    setActive(key)
    plotRef.current?.querySelector<HTMLButtonElement>(`[data-field-key="${CSS.escape(key)}"]`)?.focus()
  }

  return (
    <section ref={fieldRef} className={cn('power-field', strip && 'is-strip')} data-first-answer="rankings" aria-label="Power field">
      <details open={!strip}>
        <summary className="power-field__summary">Power field</summary>
        <div
          ref={plotRef}
          className="power-field__plot"
          style={{ height: size.height }}
          role={strip ? undefined : 'group'}
          aria-hidden={strip || undefined}
          aria-label={`${formatNumber(teams.length)} teams on one Power axis, from ${formatRating(byPower.at(-1)?.rating ?? axis.min)} to ${formatRating(byPower[0]?.rating ?? axis.max)}. Arrow keys move between teams. Select a team to open it.`}
          onKeyDown={move}
        >
          {zones.map((zone) => (
            <span
              key={zone.tier}
              className="power-field__zone"
              style={{ left: xFor(zone.from), width: xFor(zone.to) - xFor(zone.from), '--tier-color': `var(--tier-${zone.tier.toLowerCase()})` } as CSSProperties}
              aria-hidden="true"
            >
              {zone.tier} tier
            </span>
          ))}
          {strip ? null : axis.ticks.map((tick) => (
            <span key={tick} className="power-field__tick" style={{ left: xFor(tick) }} aria-hidden="true" />
          ))}
          {marks.map(({ team, key, disc, radius, x, y }) => {
            const tier = tierFor(team)
            return (
              <button
                key={key}
                type="button"
                disabled={strip}
                data-field-key={key}
                className={cn('power-field__mark', disc && 'is-disc', key === selectedKey && 'is-selected')}
                style={{ left: x - radius, top: y - radius, width: radius * 2, height: radius * 2, '--league-color': leagueColor(team.league) } as CSSProperties}
                tabIndex={key === activeKey ? 0 : -1}
                aria-current={key === selectedKey ? 'true' : undefined}
                aria-label={`${team.eligibility?.eligible === false || team.rank == null ? 'Unranked' : `Rank ${team.rank}`}, ${team.team}, ${team.league}, Power ${formatRating(team.rating)}${tier ? `, ${tier} tier` : ''}`}
                onFocus={() => {
                  setActive(key)
                  onPrepare()
                }}
                onPointerEnter={onPrepare}
                onClick={() => onOpen(team)}
              >
                {disc ? <TeamMark team={team.team} code={team.code} fallback="initial" className="size-6 rounded-full border-0 bg-transparent" /> : null}
              </button>
            )
          })}
        </div>
        {strip ? (
          <label className="power-field__selector">
            Open a team
            <Select aria-label="Open a team from the Power field" value={selectedKey ?? ''} onChange={(event) => {
              const team = byPower.find((entry) => teamKey(entry) === event.target.value)
              if (team) onOpen(team)
            }} onFocus={onPrepare}>
              <option value="">Choose team</option>
              {byPower.map((team) => <option key={teamKey(team)} value={teamKey(team)}>{team.team} · {team.league} · {formatRating(team.rating)}</option>)}
            </Select>
          </label>
        ) : null}
        <div className="power-field__axis" aria-hidden="true">
          {strip ? (
            <>
              <span>{formatRating(axis.min)}</span>
              <span>{formatRating(axis.max)} Power</span>
            </>
          ) : axis.ticks.map((tick) => (
            <span key={tick} style={{ left: xFor(tick) }}>{formatRating(tick)}</span>
          ))}
        </div>
        <p className="power-field__caption">
          Every team on one Power scale, higher to the right. {strip ? 'Dots' : 'Logos are the top eight; dots'} are coloured by league.{' '}
          <b className="font-semibold text-text">100 Power ≈ {gapExample}% per game.</b>
        </p>
        <div className="power-field__leagues" aria-label="League colours">
          {[...new Set(byPower.map((team) => team.league))].sort().map((league) => (
            <span key={league}><i style={{ background: leagueColor(league) }} aria-hidden="true" />{league}</span>
          ))}
        </div>
      </details>
    </section>
  )
}
