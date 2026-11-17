import { useState } from 'react'
import { currentHashQuery, writeNavigationHash } from '../browser/navigation'

const PARAM = 'compare'

type Comparison = { keys: readonly string[]; origin: 'pushed' | 'arrived' } | undefined

function fromAddress(address: URLSearchParams): Comparison {
  const keys = address.getAll(PARAM)
  return keys.length > 0 ? { keys, origin: 'arrived' } : undefined
}

function hashWithKeys(keys: readonly string[]) {
  const [route] = window.location.hash.slice(1).split('?', 2)
  const query = currentHashQuery()
  query.delete(PARAM)
  for (const key of keys) query.append(PARAM, key)
  const queryString = query.toString()
  return `#${route}${queryString ? `?${queryString}` : ''}`
}

/**
 * The team comparison page as an address: one `compare` parameter per picked
 * team, in pick order. Opening pushes an entry so Back returns to the board.
 * Closing a pushed page goes Back, and closing a page that arrived by link
 * removes the parameters in place.
 */
export function useCompareAddress(address: URLSearchParams) {
  const [model, setModel] = useState(() => ({ address, comparison: fromAddress(currentHashQuery()) }))
  const comparison = model.address === address ? model.comparison : fromAddress(address)
  if (model.address !== address) setModel({ address, comparison })

  function open(keys: readonly string[]) {
    writeNavigationHash(hashWithKeys(keys), 'push')
    setModel((current) => ({ ...current, comparison: { keys, origin: 'pushed' } }))
  }

  function dismiss() {
    writeNavigationHash(hashWithKeys([]), 'replace')
    setModel((current) => ({ ...current, comparison: undefined }))
  }

  function close() {
    if (!comparison) return
    if (comparison.origin === 'pushed') window.history.back()
    else dismiss()
  }

  function update(keys: readonly string[]) {
    if (!comparison) return
    if (keys.length === 0) {
      close()
      return
    }
    writeNavigationHash(hashWithKeys(keys), 'replace')
    setModel((current) => ({ ...current, comparison: { keys, origin: comparison.origin } }))
  }

  return { keys: comparison?.keys, open, close, dismiss, update }
}
