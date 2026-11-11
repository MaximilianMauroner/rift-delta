import { useCallback, useEffect, useState } from 'react'
import { parseScoutingArtifact, type ScoutingArtifact } from '../../domains/scouting/report'

export type ScoutingArtifactState = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; data: ScoutingArtifact }

export function useScoutingReports() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ScoutingArtifactState>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/data/scouting-reports.json', { signal: controller.signal })
        if (response.status === 404 || response.status === 410) {
          if (!controller.signal.aborted) setState({ status: 'missing' })
          return
        }
        if (!response.ok) throw new Error(`Scouting reports are unavailable. HTTP ${response.status}.`)
        const data = parseScoutingArtifact(await response.json())
        if (!controller.signal.aborted) setState({ status: 'ready', data })
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'Scouting reports could not be loaded.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt(value => value + 1)
  }, [])
  return { state, retry }
}
