import { useState } from 'react'
import { currentHashQuery, writeNavigationHash } from '../browser/navigation'

const LIMIT = 4

function readComparison(query: URLSearchParams) {
  return [...new Set(query.getAll('compare').filter(Boolean))].slice(0, LIMIT)
}

export function useComparisonAddress(address: URLSearchParams) {
  const [state, setState] = useState(() => ({
    address,
    ids: readComparison(currentHashQuery()),
    open: currentHashQuery().has('compare'),
    origin: 'arrived' as 'arrived' | 'pushed',
  }))
  let current = state
  if (state.address !== address) {
    current = {
      address,
      ids: address.has('compare') ? readComparison(address) : state.ids,
      open: address.has('compare'),
      origin: 'arrived',
    }
    setState(current)
  }

  function write(ids: string[], method: 'push' | 'replace') {
    const query = currentHashQuery()
    query.delete('compare')
    for (const id of ids) query.append('compare', id)
    if (ids.length === 0) query.set('compare', '')
    writeNavigationHash(`#rankings?${query.toString()}`, method)
  }

  function change(ids: string[]) {
    if (current.open) write(ids, 'replace')
    setState({ ...current, ids })
  }

  return {
    ids: current.ids,
    isOpen: current.open,
    toggle(id: string) {
      const ids = current.ids.includes(id)
        ? current.ids.filter((picked) => picked !== id)
        : [...current.ids.slice(-(LIMIT - 1)), id]
      change(ids)
    },
    remove(id: string) { change(current.ids.filter((picked) => picked !== id)) },
    clear() { change([]) },
    open(ids: string[]) {
      write(ids, 'push')
      setState({ ...current, ids, open: true, origin: 'pushed' })
    },
    close() {
      if (current.origin === 'pushed') {
        window.history.back()
        return
      }
      const query = currentHashQuery()
      query.delete('compare')
      writeNavigationHash(`#rankings?${query.toString()}`, 'replace')
      setState({ ...current, open: false })
    },
  }
}
