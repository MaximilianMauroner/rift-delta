import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TeamMark } from '../../components/TeamMark'
import { leagueColor } from '../../shared/teamColor'
import { teamIdentityFor } from '../../domains/rankings/evidence'
import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import type { WorldsForecastInput } from '../../domains/tournaments/forecast'
import type { TournamentEvent } from '../../domains/tournaments/read'
import { loadWorldsArtifact, type WorldsArtifact } from '../../browser/tournaments/worldsArtifacts'
import { WORLD_FINISHES, WORLD_STAGES, worldsSamplingInterval, type WorldStage, type WorldsReport, type WorldsSimulationResult } from '../../domains/tournaments/simulation'
import type { GroupReplayResult } from '../../domains/tournaments/simulation'
import { startWorldsWorker } from '../../browser/tournaments/worldsWorkerClient'

const STAGE_LABELS: Record<WorldStage, string> = { swiss: 'Swiss', knockout: 'Knockout', semifinal: 'Semifinal', final: 'Final', champion: 'Champion' }
const OPTIONS = { seed: 20261009, trials: 10_000 }

/** The parent keys this panel by coherent schedule and model identities. */
export function WorldsTournamentPanel({ event, forecast, fixtureFeed }: { event: TournamentEvent; forecast: WorldsForecastInput; fixtureFeed: boolean }) {
  const { basis, seriesSource } = forecast
  const [artifact, setArtifact] = useState<WorldsArtifact | null>(null)
  const [display, setDisplay] = useState<WorldsSimulationResult | null>(null)
  const [historical, setHistorical] = useState<GroupReplayResult | null>(null)
  const [mode, setMode] = useState<'loading' | 'running' | 'done' | 'cancelled' | 'error'>('loading')
  const [detail, setDetail] = useState('Loading reviewed Worlds state.')
  const [progress, setProgress] = useState(0)
  const [run, setRun] = useState(0)
  const stop = useRef<(() => void) | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let timeout: number | undefined
    // A refreshed companion and its worker share one lifetime, even for unchanged feed keys.
    const timer = window.setTimeout(() => {
      setArtifact(null); setDisplay(null); setHistorical(null)
      setMode('loading'); setProgress(0); setDetail('Loading reviewed Worlds state.')
      timeout = window.setTimeout(() => {
        controller.abort()
        if (active) { setMode('error'); setDetail('Worlds state request timed out. The schedule remains available.') }
      }, 10_000)
      void loadWorldsArtifact(event, fixtureFeed, controller.signal).then((loaded) => {
        window.clearTimeout(timeout)
        if (!active || controller.signal.aborted) return
        setArtifact(loaded); setMode('running'); setDetail('Computing from the pinned event state.')
        stop.current = startWorldsWorker(loaded.state, { basis, seriesSource }, OPTIONS, (message) => {
          if (!active || controller.signal.aborted) return
          if (message.type === 'progress') { setProgress(message.completed); return }
          if (message.type === 'state' || message.type === 'result') setDisplay(message.result)
          if (message.type === 'state') return
          if (message.type === 'historical') setHistorical(message.result)
          setMode(message.type === 'error' ? 'error' : 'done')
          if (message.type === 'error') setDetail(message.detail)
          stop.current?.(); stop.current = null
        })
      }).catch((error: unknown) => {
        window.clearTimeout(timeout)
        if (!active || controller.signal.aborted) return
        setMode('error')
        setDetail(error instanceof SyntaxError ? 'The reviewed Worlds state could not be read. Refresh the schedule to try again.' : error instanceof Error ? error.message : String(error))
      })
    }, 0)
    return () => {
      active = false; controller.abort(); window.clearTimeout(timer); window.clearTimeout(timeout)
      stop.current?.(); stop.current = null
    }
  }, [event, fixtureFeed, basis, seriesSource, run])

  const names = new Map(event.series.flatMap((series) => series.teams.filter((team) => team.id).map((team) => [team.id!, team.name ?? team.id!])))
  const name = (id: string) => names.get(id) ?? id
  return <Card className="min-w-0 border-dashed border-[var(--forecast)]" aria-label="Worlds simulation">
    <CardHeader><CardTitle role="heading" aria-level={3} className="flex flex-wrap items-center gap-2">Worlds outlook <Badge variant="preview">Forecast</Badge></CardTitle></CardHeader>
    <CardContent className="grid min-w-0 gap-3">
      {artifact?.dataMode === 'synthetic-fixture' ? <Alert variant="warning"><TriangleAlert aria-hidden="true" /><div className="min-w-0">Synthetic Worlds state and model evidence. These probabilities are fixture estimates, not official forecasts.</div></Alert> : null}
      {display?.status === 'supported' && display.report.model && display.report.model.dataMode !== 'scheduled-public-data'
        ? <Alert variant="warning"><TriangleAlert aria-hidden="true" /><div className="min-w-0">Sample model inputs. These probabilities use seeded or unavailable sample data and are not official forecasts.</div></Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted" role="status">{mode === 'running' ? progress ? `Sampling · ${progress.toLocaleString()} / ${OPTIONS.trials.toLocaleString()} trials` : 'Computing remaining stages.' : mode === 'cancelled' ? 'Simulation cancelled. Observed state remains available.' : mode === 'loading' ? detail : mode === 'done' ? 'Computation complete.' : `Forecast unavailable: ${detail}`}</p>
        {mode === 'running' ? <Button variant="outline" size="sm" onClick={() => { stop.current?.(); stop.current = null; setMode('cancelled') }}>Cancel simulation</Button> : artifact ? <Button variant="outline" size="sm" onClick={() => setRun((value) => value + 1)}>Run simulation</Button> : null}
      </div>
      {display?.status === 'unsupported' ? <Alert variant="warning"><TriangleAlert aria-hidden="true" /><div className="min-w-0">Forecast unavailable: {display.detail}</div></Alert> : null}
      {display?.status === 'supported' ? <WorldsReportView report={display.report} name={name} /> : null}
      {historical ? <HistoricalGroupView result={historical} name={name} asOf={artifact?.state.format === 'worlds-2022-group' ? artifact.state.asOf : ''} /> : null}
    </CardContent>
  </Card>
}

function WorldsReportView({ report, name }: { report: WorldsReport; name: (id: string) => string }) {
  const championChances = report.teams.flatMap((team) =>
    team.stages.champion === null || team.stages.champion <= 0 || team.deterministicStages.champion
      ? [] : [{ id: team.id, probability: team.stages.champion }],
  ).sort((first, second) => second.probability - first.probability).slice(0, 4)
  const lastSwissRound = Math.max(0, ...(report.pinnedState.swiss?.rounds.map((round) => round.round) ?? []))
  const currentMatches = report.matches.filter((match) => report.currentStage === 'Play-In' ? match.label.startsWith('Play-In')
    : report.currentStage.startsWith('Swiss') ? match.label.startsWith(`Swiss R${lastSwissRound || 1}`)
      : !match.label.startsWith('Swiss') && !match.label.startsWith('Play-In'))
  const earlierMatches = report.matches.filter((match) => !currentMatches.includes(match))
  return <>
    {championChances.length ? <section aria-label="Champion forecast" className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold">Who lifts the trophy</h3>
      <ol className="grid gap-2">{championChances.map((team) => <li key={team.id} className="flex min-w-0 items-center gap-2 text-sm">
        <TeamMark team={name(team.id)} className="size-5" fallback="initial" />
        <span className="min-w-0 flex-1 break-words">{name(team.id)}</span>
        <span aria-hidden="true" className="h-1.5 w-12 shrink-0 overflow-hidden rounded-md bg-raised">
          <span className="block h-full" style={{ width: `${team.probability * 100}%`, background: leagueColor(teamIdentityFor(name(team.id))?.league ?? '') }} />
        </span>
        <strong className="w-12 shrink-0 text-right tabular-nums">{percent(team.probability)}</strong>
      </li>)}</ol>
      <p className="text-xs text-muted">Forecast from the pinned Worlds state and model.</p>
    </section> : null}
    <h3 className="text-sm font-semibold">Current stage: {report.currentStage}</h3>
    {report.unavailable.map((reason) => <Alert key={reason} variant="warning"><TriangleAlert aria-hidden="true" /><div className="min-w-0">Forecast unavailable: {reason}</div></Alert>)}
    <details className="min-w-0 text-sm">
      <summary className="cursor-pointer font-semibold">All stage probabilities</summary>
    <div role="region" aria-label="Worlds cumulative probabilities" tabIndex={0} className="min-w-0">
      <Table>
        <TableCaption>Cumulative chances to reach each stage. Totals are 16 / 8 / 4 / 2 / 1 when all stages are supported. A dash means unavailable. The small range under a sampled chance is its 95% sampling interval.</TableCaption>
        <TableHeader><TableRow><TableHead scope="col">Team / seed</TableHead><TableHead scope="col">Observed state</TableHead>{WORLD_STAGES.map((stage) => <TableHead scope="col" key={stage}>{STAGE_LABELS[stage]}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{report.teams.map((team) => <TableRow key={team.id}>
          <TableHead scope="row">{name(team.id)} · {team.seed}</TableHead><TableCell>{team.state}</TableCell>
          {WORLD_STAGES.map((stage) => {
            const count = report.counts.find((row) => row.id === team.id)?.stages[stage]
            const interval = count !== undefined && report.trials && !team.deterministicStages[stage] ? worldsSamplingInterval(count, report.trials) : null
            const label = interval ? `${percent(team.stages[stage])}; 95% sampling interval ${percent(interval[0])} to ${percent(interval[1])}`
              : `${percent(team.stages[stage])}${team.deterministicStages[stage] ? '; observed outcome' : ''}`
            return <TableCell key={stage} aria-label={`${STAGE_LABELS[stage]}: ${label}`}>{percent(team.stages[stage])}
              {interval ? <span className="block text-xs text-muted" aria-hidden="true">{percent(interval[0])}–{percent(interval[1])}</span> : null}</TableCell>
          })}
        </TableRow>)}</TableBody>
      </Table>
    </div>
    </details>
    <details className="min-w-0 text-sm"><summary className="cursor-pointer font-semibold">Exclusive finish probabilities</summary>
      <Table><TableCaption>Finish buckets are mutually exclusive. A complete supported row sums to 100%.</TableCaption>
        <TableHeader><TableRow><TableHead scope="col">Team</TableHead>{WORLD_FINISHES.map((finish) => <TableHead scope="col" key={finish}>{finish === '1' ? 'Champion' : finish === '2' ? 'Runner-up' : finish}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{report.teams.map((team) => <TableRow key={team.id}><TableHead scope="row">{name(team.id)}</TableHead>{WORLD_FINISHES.map((finish) => <TableCell key={finish}>{percent(team.finishes[finish])}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </details>
    <details className="text-sm"><summary className="cursor-pointer font-semibold">Current draw and bracket</summary>
      <div className="mt-2 grid gap-2">{currentMatches.map((match, index) => <p className="break-words rounded-md border border-line p-2" key={index}>{match.label}: {name(match.teamIds[0])} vs {name(match.teamIds[1])}{match.winnerId ? ` · Winner: ${name(match.winnerId)}` : ' · Unresolved'}</p>)}</div>
      {!currentMatches.length ? <p className="mt-2 text-muted">No observed draw is available for this stage.</p> : null}
      {report.pinnedState.knockout ? <p className="mt-2 text-muted">Fixed links: quarterfinals 1–2 feed semifinal 1; quarterfinals 3–4 feed semifinal 2. The semifinal winners meet in the final.</p> : null}
      {report.currentStage === 'Knockout draw pending' || report.method === 'seeded-monte-carlo' ? <p className="mt-2 text-muted">The future knockout draw is sampled under §4.3.4. These pairings are not an observed bracket. Winners follow fixed links after each draw.</p> : null}
    </details>
    {earlierMatches.length ? <details className="text-sm"><summary className="cursor-pointer font-semibold">Previous draws and results</summary><div className="mt-2 grid gap-2">{earlierMatches.map((match, index) => <p className="break-words rounded-md border border-line p-2" key={index}>{match.label}: {name(match.teamIds[0])} vs {name(match.teamIds[1])}{match.winnerId ? ` · Winner: ${name(match.winnerId)}` : ' · Unresolved'}</p>)}</div></details> : null}
    <details className="min-w-0 text-sm"><summary className="cursor-pointer font-semibold">Simulation basis and precision</summary>
      <div className="mt-2 grid gap-2 break-words text-muted">
        <p>{report.method} · {report.trials.toLocaleString()} sampled trials · Seed {report.seed} · {report.elapsedMs.toFixed(0)} ms. Exact enumeration has no sampling error.</p>
        <p>State {report.stateVersion} · Information through {report.asOf} · Engine {report.engineVersion}.</p>
        <p><a className="underline" target="_blank" rel="noopener noreferrer" href={report.rules.source}>Riot rules v{report.rules.version}</a> · Checked {report.rules.checkedAt} · {report.rules.ids.join(' / ')}.</p>
        <p>{report.model ? `Snapshot ${report.model.snapshotId} · Model ${report.model.version} / ${report.model.configHash} · Ratings through ${report.model.dataAsOf} · Published ${report.model.publishedAt} · Identity map ${report.model.identityRevision}.` : 'No historical or current model snapshot is assumed.'}</p>
        {report.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}
        {report.hypotheticalMatchups.flatMap((match) => match.warnings).filter((warning, index, all) => all.indexOf(warning) === index).map((warning) => <p key={warning}>{warning}</p>)}
        <p>95% marginal Wilson intervals appear on unresolved sampled stage cells. Observed outcomes have no sampling error. These intervals are finite-sample error estimates, not model confidence. Clinched/eliminated labels come from observed rules.</p>
        <Button variant="outline" size="sm" onClick={() => downloadReport(report)}>Download pinned run</Button>
      </div>
    </details>
  </>
}
function HistoricalGroupView({ result, name, asOf }: { result: GroupReplayResult; name: (id: string) => string; asOf: string }) {
  if (result.status === 'unsupported') return <Alert variant="warning"><TriangleAlert aria-hidden="true" /><div className="min-w-0">Historical group replay unavailable: {result.detail}. Historical forecasts require as-of ratings; current ratings are not used.</div></Alert>
  return <div className="grid gap-2"><h3 className="text-sm font-semibold">Worlds 2022 · Group {result.groupId} · Observed results</h3>
    <p className="text-sm text-muted">Information cutoff {asOf}. Top two advance to the knockout draw. Forecast unavailable: historical model inputs are unavailable. Current ratings are not used.</p>
    <Table><TableHeader><TableRow><TableHead scope="col">Team</TableHead><TableHead scope="col">Record</TableHead><TableHead scope="col">Advancement</TableHead></TableRow></TableHeader>
      <TableBody>{result.standings.map((team) => <TableRow key={team.id}><TableHead scope="row">{name(team.id)}</TableHead><TableCell>{team.wins}–{team.losses}</TableCell><TableCell>{result.knockoutQualifierIds.includes(team.id) ? 'Reached knockout' : 'Eliminated'}</TableCell></TableRow>)}</TableBody>
    </Table>
  </div>
}
function percent(value: number | null) { return value === null ? '—' : `${(100 * value).toFixed(1)}%` }
function downloadReport(report: WorldsReport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'worlds-pinned-run.json'; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
