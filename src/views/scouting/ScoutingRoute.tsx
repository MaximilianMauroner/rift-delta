import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { currentHashQuery, hashForModeAndScope, readModeFromHash, readScopeFromHash, writeNavigationHash } from '../../browser/navigation'
import { canonicalScoutingQuery, changeScoutingQuery, scoutingSelection } from '../../browser/scouting/navigation'
import { useScoutingReports } from '../../browser/scouting/useScoutingReports'
import { DataState } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { LoadingState } from '../../components/ui/loading'
import { Panel } from '../../components/ui/panel'
import { Select } from '../../components/ui/select'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'
import { RIOT_PROJECT_NOTICE } from '../../data/legal'
import { currentSeasonScope } from '../../domains/rankings/read'
import { reportKey, scoutingField, scoutingMeasures, type ScoutingArtifact } from '../../domains/scouting/report'
import { AppNavigation } from '../AppShell'
import { Facts } from './Facts'
import { FormList } from './FormList'
import { LanePanel } from './LanePanel'
import { PoolTable } from './PoolTable'
import { RankStrips } from './RankStrips'
import { ScoutingHero } from './ScoutingHero'
import { fullDate, roleWord } from './presentation'
import './scouting.css'

function Report({ artifact, query }: { artifact: ScoutingArtifact; query: URLSearchParams }) {
  const selection = useMemo(() => scoutingSelection(artifact, query), [artifact, query])
  const { role, roles, players, player, found } = selection
  const field = useMemo(() => player ? scoutingField(artifact.players, player.role) : undefined, [artifact, player])
  const measures = useMemo(() => player && field ? scoutingMeasures(player, field) : [], [player, field])
  const change = (params: Record<string, string>) => changeScoutingQuery(params, artifact)

  useEffect(() => {
    if (readModeFromHash() !== 'scouting') return
    const canonical = `#scouting?${canonicalScoutingQuery(selection).toString()}`
    if (window.location.hash !== canonical) writeNavigationHash(canonical, 'replace')
  }, [selection])

  const baseline = role ? artifact.roles[role] : undefined
  return <div className="sc-page">
    <div className="sc-controls">
      <label className="sc-field"><span>Role</span>
        <Select aria-label="Role" value={role ?? ''} disabled={!roles.length} onChange={event => change({ role: event.target.value })}>
          {roles.map(option => <option key={option}>{option}</option>)}
        </Select></label>
      <label className="sc-field sc-field-grow"><span>Player</span>
        <Select aria-label="Player" value={player ? reportKey(player) : ''} disabled={!player} onChange={event => change({ player: event.target.value })}>
          {players.map(option => <option key={reportKey(option)} value={reportKey(option)}>{option.name} ({option.team}, {option.games} games)</option>)}
        </Select></label>
      <p className="sc-through">{artifact.through ? <>Games through <b>{fullDate(artifact.through)}</b></> : 'No counted games'}</p>
    </div>
    <div className="sc-body">
      {!found && player ? <p className="sc-alert" role="status"><b>No report matches this link.</b> Showing {player.name} instead.</p> : null}
      {player && role && baseline ? <>
        <ScoutingHero player={player} roles={artifact.roles} through={artifact.through} measures={measures} />
        <div className="sc-cols">
          <div className="sc-col">
            <PoolTable key={reportKey(player)} pool={player.pool} />
            <FormList form={player.form} />
          </div>
          <div className="sc-col">
            <LanePanel name={player.name} role={roleWord(role)} lane={player.lane} behind={player.facts.behind} ahead={player.facts.ahead} baseline={baseline} />
            <RankStrips role={role} measures={measures} />
            <Facts facts={player.facts} baseline={baseline} />
          </div>
        </div>
        <p className="sc-source">Oracle's Elixir games with complete paired rosters. Lane numbers stop at 15 minutes and compare only with the opposing {roleWord(role)} player. Observed games, not predictions.</p>
      </> : <Panel><DataState icon={null} title={role ? `No ${roleWord(role)} reports` : 'No scouting reports'}>
        {role ? `No ${roleWord(role)} player has enough recent games for a report. Choose another role.` : 'No player has enough games for a report.'}
      </DataState></Panel>}
    </div>
  </div>
}

export function ScoutingRoute() {
  const { state, retry } = useScoutingReports()
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
          : state.status === 'missing' ? <section className="px-[var(--page-x)] pt-4"><Panel><DataState icon={null} title="Scouting reports are not published">Scouting reports are not available yet. Use Players to see the available data.</DataState></Panel></section>
          : state.status === 'error' ? <section className="px-[var(--page-x)] pt-4"><Panel><DataState icon={null} title="Scouting reports could not be loaded"
            action={<Button onClick={retry}>Retry</Button>}>{state.message}</DataState></Panel></section>
            : <Report artifact={state.data} query={query} />}
      </RouteErrorBoundary>
      <footer className="px-[var(--page-x)] pt-6 text-xs text-muted-foreground">{RIOT_PROJECT_NOTICE}</footer>
    </main>
  </div>
}
