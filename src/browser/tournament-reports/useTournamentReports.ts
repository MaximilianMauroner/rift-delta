import { useCallback, useEffect, useState } from 'react'
import {
  PublicArtifactRequestError,
  fetchPublicArtifact,
} from '../rankings/published/artifactIdentity'
import { createPublicRankingManifestLoader } from '../rankings/published/manifestLoader'
import { RANKING_MANIFEST_URL } from '../rankings/published/rankingManifest'
import {
  parseTournamentReport,
  parseTournamentReportIndex,
  type TournamentReport,
  type TournamentReportEntry,
  type TournamentReportIndex,
} from '../../domains/rankings/tournament-reports'

type Resource<T> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }
const failure = (error: unknown): Resource<never> =>
  error instanceof PublicArtifactRequestError &&
  [404, 410].includes(error.status)
    ? { status: 'unavailable' }
    : {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Report request failed.',
      }

export function useTournamentReports() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<Resource<TournamentReportIndex>>({
    status: 'loading',
  })
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const manifest = await createPublicRankingManifestLoader(
          RANKING_MANIFEST_URL,
          (resource, options) =>
            fetch(resource, { ...options, signal: controller.signal }),
        )()
        const next: Resource<TournamentReportIndex> =
          manifest.tournamentReportIndexUrl
            ? {
                status: 'ready',
                data: await fetchPublicArtifact(
                  manifest,
                  manifest.tournamentReportIndexUrl,
                  RANKING_MANIFEST_URL,
                  parseTournamentReportIndex,
                  { signal: controller.signal },
                ),
              }
            : { status: 'unavailable' }
        if (!controller.signal.aborted) setState(next)
      } catch (error) {
        if (!controller.signal.aborted) setState(failure(error))
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])
  return { state, retry }
}

export function useTournamentReport(
  index: TournamentReportIndex,
  entry: TournamentReportEntry | undefined,
) {
  const [attempt, setAttempt] = useState(0)
  const [finished, setFinished] = useState<{
    index: TournamentReportIndex
    url: string
    attempt: number
    state: Resource<TournamentReport>
  }>()
  useEffect(() => {
    if (!entry) return
    const controller = new AbortController()
    const done = (state: Resource<TournamentReport>) => {
      if (!controller.signal.aborted)
        setFinished({ index, url: entry.url, attempt, state })
    }
    fetchPublicArtifact(
      index,
      entry.url,
      RANKING_MANIFEST_URL,
      (value) => {
        const report = parseTournamentReport(value, entry)
        if (
          report.modelVersion !== index.modelVersion ||
          report.modelConfigHash !== index.modelConfigHash
        )
          throw new Error('Report model identity differs from its catalog.')
        return report
      },
      { signal: controller.signal },
    ).then(
      (data) => done({ status: 'ready', data }),
      (error) => done(failure(error)),
    )
    return () => controller.abort()
  }, [index, entry, attempt])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const state: Resource<TournamentReport> =
    finished?.index === index &&
    finished.url === entry?.url &&
    finished.attempt === attempt
      ? finished.state
      : { status: 'loading' }
  return { state, retry }
}
