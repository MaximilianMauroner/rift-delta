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

export type TournamentTabContext = {
  schedule?: { address: string; edition?: string }
  reportEdition?: string
}

export function tournamentTabAddress(
  tab: TournamentTab,
  from: TournamentTab,
  query: URLSearchParams,
  context: TournamentTabContext,
) {
  const crossing = (tab === 'postmortem') !== (from === 'postmortem')
  const next = crossing ? new URLSearchParams() : new URLSearchParams(query)
  const scope = query.get('scope')
  if (crossing && scope) next.set('scope', scope)
  if (tab === 'postmortem' && crossing) {
    const edition = query.get('edition') ?? context.schedule?.edition
    const scheduleEvent = query.has('edition') ? null : context.schedule?.address ?? query.get('event')
    if (edition) next.set('edition', edition)
    if (scheduleEvent) next.set('scheduleEvent', scheduleEvent)
  } else if (from === 'postmortem' && crossing) {
    const scheduleEvent = query.get('scheduleEvent')
    const edition = query.get('event') ?? context.reportEdition
    if (scheduleEvent) next.set('event', scheduleEvent)
    else if (edition && /^worlds:\d{4}$/.test(edition)) next.set('edition', edition)
  } else if (tab !== 'postmortem' && tab !== from && !next.has('event') && !next.has('edition') && context.schedule) {
    next.set('event', context.schedule.address)
  }
  if (tab === 'bracket') next.delete('view')
  else next.set('view', tab)
  return `#tournaments${next.size ? `?${next}` : ''}`
}

export function selectTournamentReport(selection: {
  event: string
  team?: string
  player?: string
  changeEdition?: boolean
}) {
  const query = currentHashQuery()
  if (selection.changeEdition) {
    query.delete('edition')
    query.delete('scheduleEvent')
  }
  query.set('view', 'postmortem')
  query.set('event', selection.event)
  for (const key of ['team', 'player'] as const) {
    if (selection[key]) query.set(key, selection[key])
    else query.delete(key)
  }
  writeNavigationHash(`#tournaments?${query}`, 'push')
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
