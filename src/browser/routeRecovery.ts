const preloadFailures = new WeakSet<object>()
const retryKey = 'rift-delta:asset-reload-attempted'

window.addEventListener('vite:preloadError', (event: Event & { payload?: unknown }) => {
  if (event.payload instanceof Error) preloadFailures.add(event.payload)
})

export function recoverRouteLoad(error: unknown) {
  if (!(error instanceof Error) || !preloadFailures.has(error)) return
  try {
    if (sessionStorage.getItem(retryKey)) return
    sessionStorage.setItem(retryKey, 'true')
  } catch {
    return
  }
  window.location.reload()
}
