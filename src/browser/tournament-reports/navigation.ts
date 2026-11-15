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

export function tournamentSubviewAddress(
  view: 'postmortem' | 'bracket',
  query: URLSearchParams,
) {
  const next = new URLSearchParams()
  const scope = query.get('scope')
  if (scope) next.set('scope', scope)
  if (view === 'postmortem') next.set('view', view)
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
