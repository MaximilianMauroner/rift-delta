import { ChevronLeft, Plus } from 'lucide-react'
import { Suspense, useEffect, useRef } from 'react'
import type { TeamHistoryArtifactState } from '../../browser/rankings/usePublicArtifacts'
import { DataState } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { LoadingState } from '../../components/ui/loading'
import { PageShell } from '../../components/ui/page-shell'
import type { PublicMatchupModel } from '../../domains/rankings/read'
import type { RankingSummaryStanding } from '../../domains/rankings/types'
import { TEAM_COMPARE_ROWS, teamCompareColumns } from './compareAnalysisData'
import { CompareTable } from './CompareDrawer'
import { HeadToHead, PowerScale } from './HeadToHead'
import { TeamCompareAnalysis } from './routeLoading'

/** The team comparison on its own page: who would win, the Power bands, the table, then the history. */
export function ComparePage({
  teams,
  model,
  historyState,
  scopeLabel,
  onClose,
  onRemove,
}: {
  teams: RankingSummaryStanding[]
  model?: PublicMatchupModel
  historyState: TeamHistoryArtifactState
  scopeLabel: string
  onClose: () => void
  onRemove: (id: string) => void
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    headingRef.current?.focus({ preventScroll: true })
  }, [])
  const columns = teamCompareColumns(teams)
  const [home, away] = teams

  return (
    <PageShell className="compare-page gap-3 pt-2" role="region" aria-label="Team comparison">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8 min-h-8 gap-1 px-2 font-semibold text-focus" onClick={onClose} aria-label="Back to rankings">
          <ChevronLeft size={16} aria-hidden="true" />
          Rankings
        </Button>
        <h1 ref={headingRef} tabIndex={-1} className="text-sm font-normal text-muted outline-none">Comparison</h1>
        <span className="ml-auto text-xs text-muted">{scopeLabel}</span>
      </div>
      {teams.length === 0 ? (
        <DataState icon={<Plus size={26} aria-hidden="true" />} title="Nothing selected yet" action={<Button type="button" variant="outline" onClick={onClose}>Pick teams on the board</Button>}>
          Tick Compare on two teams to see who would win.
        </DataState>
      ) : (
        <>
          {home && away ? <HeadToHead home={home} away={away} model={model} /> : (
            <p className="text-sm text-muted">Pick one more team on the board to see who would win.</p>
          )}
          {teams.length >= 2 ? <PowerScale teams={teams} /> : null}
          <CompareTable entities={teams} columns={columns} rows={TEAM_COMPARE_ROWS} onRemove={onRemove} />
          <Suspense fallback={<LoadingState label="Loading team comparison" />}>
            <TeamCompareAnalysis teams={teams} columns={columns} historyState={historyState} />
          </Suspense>
        </>
      )}
    </PageShell>
  )
}
