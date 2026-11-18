/**
 * Palette slots that follow the entity, not its position. Keys that keep
 * appearing keep their slot; new keys take the lowest free slot. A filter that
 * swaps some teams out therefore never repaints the teams that stay, which a
 * reader who learned "HLE is blue" would otherwise misread.
 */
export function assignColorSlots(previous: ReadonlyMap<string, number>, keys: readonly string[], slotCount: number) {
  const next = new Map<string, number>()
  for (const key of keys) {
    const slot = previous.get(key)
    if (slot !== undefined && slot < slotCount && ![...next.values()].includes(slot)) next.set(key, slot)
  }
  for (const key of keys) {
    if (next.has(key)) continue
    const used = new Set(next.values())
    const free = Array.from({ length: slotCount }, (_, slot) => slot).find((slot) => !used.has(slot))
    if (free === undefined) break
    next.set(key, free)
  }
  return next
}

/**
 * Slot 0 is the league's own colour, held by one team per league. Every other
 * team shares slots 1 and up across all leagues, so two repeats never match.
 * Both kinds of slot follow the team, as above.
 */
export function assignLeagueColorSlots(previous: ReadonlyMap<string, number>, teams: readonly { key: string; league: string }[], slotCount: number) {
  const next = new Map<string, number>()
  for (const league of new Set(teams.map((team) => team.league))) {
    const keys = teams.filter((team) => team.league === league).map((team) => team.key)
    const holder = keys.find((key) => previous.get(key) === 0) ?? keys.find((key) => !previous.has(key))
    if (holder !== undefined) next.set(holder, 0)
  }
  const repeats = teams.map((team) => team.key).filter((key) => !next.has(key))
  const previousRepeats = new Map([...previous].filter(([, slot]) => slot > 0).map(([key, slot]) => [key, slot - 1]))
  for (const [key, slot] of assignColorSlots(previousRepeats, repeats, slotCount - 1)) next.set(key, slot + 1)
  return next
}

export function sameColorSlots(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>) {
  return left.size === right.size && [...left].every(([key, slot]) => right.get(key) === slot)
}
