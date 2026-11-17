import assert from 'node:assert/strict'
import test from 'node:test'
import { replaceHashForModeAndScope } from '../src/browser/navigation'

test('scope normalization belongs to the active shell route', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const location = { hash: '#tournaments?scope=season%3A2026&event=worlds', pathname: '/' }
  let writes = 0
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location,
      history: {
        replaceState: (_state: unknown, _title: string, hash: string) => {
          location.hash = hash
          writes += 1
        },
      },
      dispatchEvent: () => true,
    },
  })
  try {
    replaceHashForModeAndScope('rankings', 'all')
    assert.equal(writes, 0, 'a departing shell must preserve the destination address')
    assert.equal(location.hash, '#tournaments?scope=season%3A2026&event=worlds')
    location.hash = '#rankings?scope=all&team=T1'
    replaceHashForModeAndScope('rankings', 'season:2026')
    assert.equal(writes, 1)
    assert.equal(location.hash, '#rankings?scope=season%3A2026&team=T1')
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
