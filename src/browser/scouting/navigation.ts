import { ROLES, SCOUTING_RULES, reportKey, type PlayerReport, type ScoutingIndex } from '../../domains/scouting/report'
import type { Role } from '../../domains/rankings/types'
import { compareCodeUnits } from '../../shared/codeUnitOrder.mjs'
import { currentHashQuery, writeNavigationHash } from '../navigation'

/** Link target for one player's report. Players rows and the report's own picker both use it. */
export function scoutingHref(player: Pick<PlayerReport, 'id' | 'role'>) {
  return `#scouting?${new URLSearchParams({ player: reportKey(player) }).toString()}`
}

/**
 * Resolve the role and player a hash query asks for, falling back to the most active player.
 * A role in the query wins over the player's own role, so the role picker can switch roles and reset the player.
 * A linked player under the game minimum stays selected, so the page can say why there is no report.
 */
export function scoutingSelection(index: ScoutingIndex, query: URLSearchParams) {
  const requested = index.players.find(player => reportKey(player) === query.get('player'))
  const eligible = index.players.filter(player => player.games >= SCOUTING_RULES.minGames)
  const roles = ROLES.filter(role => eligible.some(player => player.role === role))
  const role: Role | undefined = roles.find(candidate => candidate === query.get('role')) ?? requested?.role ?? (roles.includes('Mid') ? 'Mid' : roles[0])
  const players = eligible.filter(player => player.role === role)
    .sort((a, b) => b.recent - a.recent || b.games - a.games || compareCodeUnits(reportKey(a), reportKey(b)))
  const player = requested?.role === role ? requested : players[0]
  if (player && !players.includes(player)) players.unshift(player)
  return { roles, role, players, player, found: Boolean(requested) || !query.get('player') }
}

/** The hash that holds exactly the selection, so a reload or a shared link shows the same report. */
export function canonicalScoutingQuery(selection: ReturnType<typeof scoutingSelection>) {
  const query = new URLSearchParams()
  if (selection.role) query.set('role', selection.role)
  if (selection.player) query.set('player', reportKey(selection.player))
  return query
}

export function changeScoutingQuery(params: Record<string, string>, index: ScoutingIndex) {
  const next = currentHashQuery()
  for (const [key, value] of Object.entries(params)) next.set(key, value)
  if ('role' in params) next.delete('player')
  const hash = `#scouting?${canonicalScoutingQuery(scoutingSelection(index, next)).toString()}`
  if (hash === window.location.hash) return
  writeNavigationHash(hash, 'push')
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
