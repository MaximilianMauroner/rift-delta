import { useCallback, useEffect, useState } from 'react'
import { PublicArtifactRequestError, fetchPublicArtifact } from '../rankings/published/artifactIdentity'
import { RANKING_MANIFEST_URL, loadRankingManifest } from '../rankings/published/rankingManifest'
import { parseScoutingIndex, parseScoutingShard, type ScoutingIndex, type ScoutingPlayer, type ScoutingShard } from '../../domains/scouting/report'

export type Loadable<T> = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

const failed = (error: unknown, what: string): Loadable<never> => error instanceof PublicArtifactRequestError && (error.status === 404 || error.status === 410)
  ? { status: 'missing' }
  : { status: 'error', message: error instanceof Error ? error.message : `${what} could not be loaded.` }

/** The scouting index of the published generation. Missing when the generation has none. */
export function useScoutingIndex() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<Loadable<ScoutingIndex>>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const manifest = await loadRankingManifest()
        const next: Loadable<ScoutingIndex> = manifest.scoutingIndexUrl
          ? { status: 'ready', data: await fetchPublicArtifact(manifest, manifest.scoutingIndexUrl, RANKING_MANIFEST_URL, parseScoutingIndex, { signal: controller.signal }) }
          : { status: 'missing' }
        if (!controller.signal.aborted) setState(next)
      } catch (error) {
        if (!controller.signal.aborted) setState(failed(error, 'Scouting reports'))
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

/** One player's games. Nothing is fetched while `player` is undefined. */
export function usePlayerGames(index: ScoutingIndex, player: ScoutingPlayer | undefined) {
  const [attempt, setAttempt] = useState(0)
  const [finished, setFinished] = useState<{ url: string; attempt: number; state: Loadable<ScoutingShard> }>()
  useEffect(() => {
    if (!player) return
    const controller = new AbortController()
    const done = (state: Loadable<ScoutingShard>) => { if (!controller.signal.aborted) setFinished({ url: player.url, attempt, state }) }
    fetchPublicArtifact(index, player.url, RANKING_MANIFEST_URL, value => parseScoutingShard(value, player), { signal: controller.signal })
      .then(data => done({ status: 'ready', data }), error => done(failed(error, 'The player report')))
    return () => controller.abort()
  }, [index, player, attempt])
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  // A result belongs to one player and one attempt. Any other result is still loading.
  const state: Loadable<ScoutingShard> = finished && finished.url === player?.url && finished.attempt === attempt ? finished.state : { status: 'loading' }
  return { state, retry }
}
