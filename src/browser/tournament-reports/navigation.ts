import { useSyncExternalStore } from 'react'
import { currentHashQuery, writeNavigationHash } from '../navigation'

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener)
  window.addEventListener('popstate', listener)
  return () => {
    window.removeEventListener('hashchange', listener)
    window.removeEventListener('popstate', listener)
  }
}

export function useTournamentReportAddress() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  return new URLSearchParams(hash.slice(1).split('?', 2)[1] ?? '')
}

export type TournamentTab = 'bracket' | 'schedule' | 'swiss' | 'postmortem'

/**
 * The address of one tournament tab. Bracket, schedule and Swiss preview read
 * the same competition, so they keep the whole query. Team reports use their
 * own event ids, so crossing to or from them keeps only the scope.
 */
export function tournamentTabAddress(
  tab: TournamentTab,
  from: TournamentTab,
  query: URLSearchParams,
) {
  const crossing = (tab === 'postmortem') !== (from === 'postmortem')
  const next = crossing ? new URLSearchParams() : new URLSearchParams(query)
  const scope = query.get('scope')
  if (crossing && scope) next.set('scope', scope)
  if (tab === 'bracket') next.delete('view')
  else next.set('view', tab)
  return `#tournaments${next.size ? `?${next}` : ''}`
}

export function selectTournamentReport(selection: {
  event: string
  team?: string
  player?: string
}) {
  const query = currentHashQuery()
  query.set('view', 'postmortem')
  query.set('event', selection.event)
  for (const key of ['team', 'player'] as const) {
    if (selection[key]) query.set(key, selection[key])
    else query.delete(key)
  }
  writeNavigationHash(`#tournaments?${query}`, 'push')
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
