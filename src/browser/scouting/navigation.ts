import { ROLES, reportKey, type PlayerReport, type ScoutingArtifact } from '../../domains/scouting/report'
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
 */
export function scoutingSelection(artifact: ScoutingArtifact, query: URLSearchParams) {
  const requested = artifact.players.find(player => reportKey(player) === query.get('player'))
  const roles = ROLES.filter(role => artifact.players.some(player => player.role === role))
  const role: Role | undefined = roles.find(candidate => candidate === query.get('role')) ?? requested?.role ?? (roles.includes('Mid') ? 'Mid' : roles[0])
  const players = artifact.players.filter(player => player.role === role)
    .sort((a, b) => b.recent.games - a.recent.games || b.games - a.games || compareCodeUnits(reportKey(a), reportKey(b)))
  const player = players.find(candidate => reportKey(candidate) === query.get('player')) ?? players[0]
  return { roles, role, players, player, found: Boolean(requested) || !query.get('player') }
}

/** The hash that holds exactly the selection, so a reload or a shared link shows the same report. */
export function canonicalScoutingQuery(selection: ReturnType<typeof scoutingSelection>) {
  const query = new URLSearchParams()
  if (selection.role) query.set('role', selection.role)
  if (selection.player) query.set('player', reportKey(selection.player))
  return query
}

export function changeScoutingQuery(params: Record<string, string>, artifact: ScoutingArtifact) {
  const next = currentHashQuery()
  for (const [key, value] of Object.entries(params)) next.set(key, value)
  if ('role' in params) next.delete('player')
  const hash = `#scouting?${canonicalScoutingQuery(scoutingSelection(artifact, next)).toString()}`
  if (hash === window.location.hash) return
  writeNavigationHash(hash, 'push')
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
