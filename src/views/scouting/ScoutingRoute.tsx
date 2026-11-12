import { AlertTriangle, ArrowLeft, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { currentHashQuery, hashForModeAndScope, readModeFromHash, readScopeFromHash, writeNavigationHash } from '../../browser/navigation'
import { canonicalScoutingQuery, changeScoutingQuery, scoutingSelection } from '../../browser/scouting/navigation'
import { usePlayerGames, useScoutingIndex } from '../../browser/scouting/useScouting'
import { DataState } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { LoadingState } from '../../components/ui/loading'
import { Panel } from '../../components/ui/panel'
import { Select } from '../../components/ui/select'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'
import { RIOT_PROJECT_NOTICE } from '../../data/legal'
import { currentSeasonScope } from '../../domains/rankings/read'
import { SCOUTING_RULES, reportKey, scoutingField, scoutingMeasures, scoutingReport, type ScoutingIndex, type ScoutingPlayer } from '../../domains/scouting/report'
import type { Role } from '../../domains/rankings/types'
import { AppNavigation } from '../AppShell'
import { Facts } from './Facts'
import { FormList } from './FormList'
import { LanePanel } from './LanePanel'
import { PoolTable } from './PoolTable'
import { RankStrips } from './RankStrips'
import { ScoutingHero } from './ScoutingHero'
import { fullDate, gameCount, roleWord } from './presentation'
import './scouting.css'

function PlayerReportView({ index, player, role }: { index: ScoutingIndex; player: ScoutingPlayer; role: Role }) {
  const { state, retry } = usePlayerGames(index, player)
  const report = useMemo(() => state.status === 'ready' && index.through ? scoutingReport(player, state.data, index.through) : undefined, [state, player, index])
  const field = useMemo(() => scoutingField(index.players, role), [index, role])
  const measures = useMemo(() => scoutingMeasures(player, field), [player, field])
  const baseline = index.roles[role]
  if (state.status === 'loading') return <LoadingState presentation="page" layout="board" label={`Loading the report for ${player.name}`} />
  if (state.status !== 'ready' || !report) return <Panel><DataState icon={<AlertTriangle size={26} aria-hidden="true" />} title={`The report for ${player.name} could not be loaded`}
    action={<Button onClick={retry}>Retry</Button>}>{state.status === 'error' ? state.message : 'The published data has no games for this player.'}</DataState></Panel>
  return <>
    <ScoutingHero player={report} roles={index.roles} through={index.through} measures={measures} />
    <div className="sc-cols">
      <div className="sc-col">
        <PoolTable key={reportKey(report)} pool={report.pool} />
        <FormList form={report.form} />
      </div>
      <div className="sc-col">
        <LanePanel name={report.name} role={roleWord(role)} lane={report.lane} behind={report.facts.behind} ahead={report.facts.ahead} baseline={baseline} />
        <RankStrips role={role} measures={measures} />
        <Facts facts={report.facts} baseline={baseline} />
      </div>
    </div>
    <p className="sc-source">Oracle's Elixir games with complete paired rosters. Lane numbers stop at 15 minutes and compare only with the opposing {roleWord(role)} player. Observed games, not predictions.</p>
  </>
}

function Report({ index, query }: { index: ScoutingIndex; query: URLSearchParams }) {
  const selection = useMemo(() => scoutingSelection(index, query), [index, query])
  const { role, roles, players, player, found } = selection
  const change = (params: Record<string, string>) => changeScoutingQuery(params, index)

  useEffect(() => {
    if (readModeFromHash() !== 'scouting') return
    const canonical = `#scouting?${canonicalScoutingQuery(selection).toString()}`
    if (window.location.hash !== canonical) writeNavigationHash(canonical, 'replace')
  }, [selection])

  return <div className="sc-page">
    <div className="sc-controls">
      <label className="sc-field"><span>Role</span>
        <Select aria-label="Role" value={role ?? ''} disabled={!roles.length} onChange={event => change({ role: event.target.value })}>
          {roles.map(option => <option key={option}>{option}</option>)}
        </Select></label>
      <label className="sc-field sc-field-grow"><span>Player</span>
        <Select aria-label="Player" value={player ? reportKey(player) : ''} disabled={!player} onChange={event => change({ player: event.target.value })}>
          {players.map(option => <option key={reportKey(option)} value={reportKey(option)}>{option.name} ({option.team}, {gameCount(option.games)})</option>)}
        </Select></label>
      <p className="sc-through">{index.through ? <>Games through <b>{fullDate(index.through)}</b></> : 'No counted games'}</p>
    </div>
    <div className="sc-body">
      {!found && player ? <p className="sc-alert" role="status"><b>No report matches this link.</b> Showing {player.name} instead.</p> : null}
      {player && role && player.games < SCOUTING_RULES.minGames ? <Panel><DataState icon={<Users size={26} aria-hidden="true" />} title={`Too few games for a report on ${player.name}`}>
        {player.name} has {gameCount(player.games)} in the counted data. A report needs {SCOUTING_RULES.minGames}, because fewer games mostly show chance. Choose another player.
      </DataState></Panel>
        : player && role ? <PlayerReportView index={index} player={player} role={role} />
          : <Panel><DataState icon={<Users size={26} aria-hidden="true" />} title={role ? `No ${roleWord(role)} reports` : 'No scouting reports'}>
            {role ? `No ${roleWord(role)} player has enough games for a report. Choose another role.` : 'No player has enough games for a report.'}
          </DataState></Panel>}
    </div>
  </div>
}

export function ScoutingRoute() {
  const { state, retry } = useScoutingIndex()
  const [query, setQuery] = useState(currentHashQuery)
  useEffect(() => {
    // Not popstate. It fires before hashchange, so the canonical replace would run between them and the second read would hide the not-found notice.
    const restore = () => {
      if (readModeFromHash() === 'scouting') setQuery(currentHashQuery())
    }
    window.addEventListener('hashchange', restore)
    return () => window.removeEventListener('hashchange', restore)
  }, [])
  const scope = readScopeFromHash() ?? currentSeasonScope()
  return <div className="flex min-h-full flex-col">
    <a className="fixed top-[-56px] left-3 z-80 rounded-md border border-[var(--accent-line)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--text-strong)] no-underline shadow-[var(--shadow-2)] focus-visible:top-3" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); document.getElementById('main-content')?.scrollIntoView({ block: 'start' }) }}>Skip to content</a>
    <AppNavigation mode="players" scope={scope} />
    <main id="main-content" tabIndex={-1} className="min-w-0 pb-6 max-sm:pb-[calc(var(--tabbar-h)+24px)]">
      <nav className="sc-crumb" aria-label="Breadcrumb">
        <a href={hashForModeAndScope('players', scope)}><ArrowLeft size={15} aria-hidden="true" />Players</a>
        <span aria-hidden="true">/</span><span aria-current="page">Scouting report</span>
      </nav>
      <RouteErrorBoundary>
        {state.status === 'loading' ? <LoadingState presentation="page" layout="board" label="Loading scouting reports" />
          : state.status === 'missing' ? <section className="px-[var(--page-x)] pt-4"><Panel><DataState icon={<Users size={26} aria-hidden="true" />} title="Scouting reports are not published">Scouting reports are not available yet. Use Players to see the available data.</DataState></Panel></section>
          : state.status === 'error' ? <section className="px-[var(--page-x)] pt-4"><Panel><DataState icon={<AlertTriangle size={26} aria-hidden="true" />} title="Scouting reports could not be loaded"
            action={<Button onClick={retry}>Retry</Button>}>{state.message}</DataState></Panel></section>
            : <Report index={state.data} query={query} />}
      </RouteErrorBoundary>
      <footer className="px-[var(--page-x)] pt-6 text-xs text-muted-foreground">{RIOT_PROJECT_NOTICE}</footer>
    </main>
  </div>
}
