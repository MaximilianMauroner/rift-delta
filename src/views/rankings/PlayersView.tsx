import { AlertTriangle, ClipboardList, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { currentHashQuery, hashEnum, hashParam, hashWithParam, useHashSync, writeNavigationHash } from '../../browser/navigation'
import type { PlayerDirectoryState } from '../../browser/rankings/usePublicArtifacts'
import { scoutingHref } from '../../browser/scouting/navigation'
import { TeamMark } from '../../components/TeamMark'
import { Lane } from '../../components/ui/lane'
import { DataState, RegionBadge } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { LoadingState } from '../../components/ui/loading'
import { Select } from '../../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { providerFreshness } from '../../domains/rankings/evidence'
import { playerLeaderboardForScope } from '../../domains/rankings/read'
import type { PublicRankingManifest, Role, SnapshotFilter } from '../../domains/rankings/types'
import { formatDate, formatDecimal, formatNumber, formatRating } from '../../shared/display'
import { PlayerRoleProfile } from './PlayerRoleProfile'
import { playerLeague } from './playerData'
import './players.css'

const ROLES: readonly Role[] = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']
const ROLE_FILTERS = ['All', ...ROLES] as const
function readFilters(query: URLSearchParams) {
  return {
    search: hashParam('player', query) ?? '',
    role: hashEnum('role', ROLE_FILTERS, 'All', query),
    region: hashParam('region', query) ?? 'All',
    profile: hashParam('profile', query) ?? '',
  }
}

export function PlayersView({ state, manifest, filter, scopeLabel, hashQuery, searchRef }: {
  state: PlayerDirectoryState
  manifest: PublicRankingManifest
  filter: SnapshotFilter
  scopeLabel: string
  hashQuery: URLSearchParams
  searchRef?: RefObject<HTMLInputElement | null>
}) {
  const [filters, setFilters] = useState(() => readFilters(currentHashQuery()))
  const list = useRef<HTMLDivElement>(null)
  const pushedProfile = useRef(false)
  const returnFocus = useRef<string | null>(null)
  const [appliedQuery, setAppliedQuery] = useState(hashQuery)
  if (hashQuery !== appliedQuery) {
    setAppliedQuery(hashQuery)
    setFilters(readFilters(hashQuery))
  }
  useHashSync('players', { region: filters.region === 'All' ? '' : filters.region, player: filters.search, role: filters.role === 'All' ? '' : filters.role, profile: filters.profile })
  const directory = state.status === 'ready' ? state.data : undefined
  const scopeBoard = useMemo(() => playerLeaderboardForScope(directory, filter), [directory, filter])
  const { scoreFamily, rows: players } = scopeBoard
  const selectedPlayers = useMemo(() => filters.role === 'All'
    ? players
    : playerLeaderboardForScope(directory, filter, filters.role).rows, [directory, filter, filters.role, players])
  const rankedScores = players.flatMap((player) => player.leaderboardScore.status === 'ranked' ? [player.leaderboardScore.value] : [])
  const scoreRange = rankedScores.length ? { min: Math.min(...rankedScores), max: Math.max(...rankedScores) } : undefined
  const rankedCount = selectedPlayers.filter((player) => player.leaderboardScore.status === 'ranked').length
  const unrankedCount = selectedPlayers.length - rankedCount
  const statsPowerVersion = players.find((player) => player.statsPower)?.statsPower?.version
  const statsFamily = scoreFamily === 'stats-power'
  const scoreLabel = statsFamily ? 'Stats Power' : 'Role Power'
  const unrankedNote = unrankedCount > 0
    ? `Players without a usable ${scoreLabel} score are unranked, show a dash, and follow the ranked players.`
    : ''
  const teamLabel = filter.season === 'All' ? 'Latest team' : 'Season team'
  const teamAttribution = filter.season === 'All'
    ? 'Latest team is the latest observed team across all seasons.'
    : 'Season team is the most-played credited team in the selected season.'
  const seeded = manifest.dataMode === 'seeded-sample' || manifest.coverage.seededSample || manifest.playerData.status === 'seeded-demo-rosters'
  const statSource = providerFreshness([], manifest.sources.filter((source) => source.kind !== 'seed'))
    .find((provider) => provider.label === "Oracle's Elixir")
  const search = filters.search.trim().toLowerCase()
  const visible = selectedPlayers.filter((player) =>
    (filters.region === 'All' || playerLeague(player) === filters.region) &&
    (!search || [player.name, player.team, player.teamCode ?? ''].some((value) => value.toLowerCase().includes(search))),
  )

  const profilePlayer = selectedPlayers.find((player) => player.id === filters.profile) ?? visible[0]
  const profileOpen = Boolean(filters.profile && selectedPlayers.some((player) => player.id === filters.profile))

  useEffect(() => {
    if (profileOpen || returnFocus.current === null) return
    const row = list.current?.querySelector<HTMLButtonElement>(`[data-player-profile="${CSS.escape(returnFocus.current)}"]`)
    const target = row ?? searchRef?.current ?? list.current
    returnFocus.current = null
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest' })
  }, [profileOpen, searchRef])

  function selectProfile(profile: string) {
    if (!profileOpen) pushedProfile.current = true
    writeNavigationHash(hashWithParam('profile', profile), profileOpen ? 'replace' : 'push')
    setFilters({ ...filters, profile })
  }

  function closeProfile() {
    returnFocus.current = profilePlayer?.id ?? ''
    if (pushedProfile.current) {
      pushedProfile.current = false
      window.history.back()
    } else {
      writeNavigationHash(hashWithParam('profile', null), 'replace')
      setFilters({ ...filters, profile: '' })
    }
  }

  const methodDisclosure = (
    <details className="players-method">
      <summary>Method</summary>
      <div className="grid gap-1.5 text-xs leading-relaxed text-muted">
        {statsFamily ? (
          <>
            <p>Stats Power compares selected stats within each role. It does not measure overall player ability. Its ordering across roles is not validated as a measure of player ability or role importance. Newer games get more weight, with a 90-day half-life. Inactivity alone does not lower Stats Power.</p>
            <p>The selected stats for each role have equal base weight, with smaller samples reduced toward the league anchor. Support uses kill participation, wards placed per minute, and wards cleared per minute. Ward counts measure activity, not ward quality.</p>
            <p>Only players with stat games in this scope get a rank. A player without stat games is unranked, because a league-anchor score is not an observation. Role Power stays in its own column and never sets a Stats Power rank.</p>
          </>
        ) : <p>This scope has no Stats Power, so ranks use Role Power.</p>}
        <p>Role Power includes individual stats, team results, opponent strength and event context. Because it includes team results, it does not measure individual skill alone.</p>
        {unrankedNote ? <p>{unrankedNote}</p> : null}
        <p>{teamAttribution} Games count games credited to that team where available, otherwise all rated games.</p>
      </div>
    </details>
  )

  return (
    <section className="r8-players" data-profile-open={profileOpen} aria-label="Player leaderboard">
      <div className="r8-player-filters">
        <label>
          Role
          <Select aria-label="Role" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value as typeof filters.role, profile: '' })}>
            {ROLE_FILTERS.map((role) => <option key={role} value={role}>{role === 'All' ? 'All roles' : role}</option>)}
          </Select>
        </label>
        <label className="r8-player-search">
          Find a player or team
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input ref={searchRef} type="search" className="pl-9" value={filters.search} placeholder="Player or team name" aria-keyshortcuts="/" onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          </span>
        </label>
        <label data-league-filter>
          League
          <Select aria-label="League" value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value })}>
            <option value="All">All leagues</option>
            {[...new Set([...players.map(playerLeague), ...(filters.region === 'All' ? [] : [filters.region])])].sort().map((league) => <option key={league}>{league}</option>)}
          </Select>
        </label>
        {visible.length > 0 && (filters.search || filters.role !== 'All' || filters.region !== 'All') ? <Button variant="ghost" onClick={() => setFilters({ search: '', role: 'All', region: 'All', profile: '' })}>Clear filters</Button> : null}
      </div>

      <p className="players-source break-words text-xs leading-relaxed text-muted" role="status" aria-label="Player-stat freshness">
        {seeded ? 'Seeded sample data. Player-stat freshness is unavailable.' : (
          <>
            {statSource?.publishedThrough
              ? `Oracle's Elixir source coverage through ${formatDate(statSource.publishedThrough)}.`
              : "Oracle's Elixir player-stat coverage is unavailable."}
            {statSource?.failedUpdate === 'failed' ? " Latest Oracle's Elixir update failed." : null}
            {statSource?.failedUpdate === 'partial' ? " Latest Oracle's Elixir update was partial." : null}
          </>
        )}
      </p>

      {state.status === 'idle' || state.status === 'loading' ? (
        <LoadingState label="Loading player rankings" presentation="rows" rowCount={6} />
      ) : state.status === 'error' || state.status === 'missing' ? (
        <Card role="alert">
          <DataState icon={<AlertTriangle size={26} aria-hidden="true" />} title="Player rankings unavailable" action={<Button onClick={() => window.location.reload()}>Retry</Button>}>
            {state.message}
          </DataState>
        </Card>
      ) : players.length === 0 ? (
        <Card role="status">
          <DataState icon={<Users size={26} aria-hidden="true" />} title="No ranked players in this scope">
            No player rankings are published for {scopeLabel}. Select another season or period.
          </DataState>
        </Card>
      ) : (
        <>
          <p className="players-count flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted" role="status">
            <span>{formatNumber(visible.length)} of {formatNumber(selectedPlayers.length)} {filters.role === 'All' ? 'players' : `${filters.role} players`} in {scopeLabel}.{filters.role === 'All' ? ' Ranks across roles are rough. Pick a role to compare fairly.' : ''}</span>
            {unrankedCount > 0 ? <span>{formatNumber(rankedCount)} ranked by {scoreLabel}. {formatNumber(unrankedCount)} unranked without a usable {scoreLabel} score.</span> : null}
            {scoreRange && visible.length > 0 ? (
              <span className="player-score-key">
                Scores run from {formatDecimal(scoreRange.min)} to {formatDecimal(scoreRange.max)}. Filters keep this scale.
              </span>
            ) : null}
          </p>
          <div className="r8-player-layout">
            <div ref={list} tabIndex={-1} className="r8-player-list">
              {visible.length === 0 ? (
                <Card role="status" className="players-empty-result">
                  <DataState icon={<Search size={26} aria-hidden="true" />} title="No players match these filters" action={<Button variant="outline" onClick={() => setFilters({ search: '', role: 'All', region: 'All', profile: '' })}>Clear filters</Button>}>
                    Try another player or team name, or select all roles and leagues.
                  </DataState>
                </Card>
              ) : (
                <Card className="r8-player-board min-w-0 overflow-hidden p-0">
                  <Table role="table" aria-label="Player rankings" className="r8-player-table">
                    <caption className="sr-only">Player rankings for {scopeLabel}, {filters.role === 'All' ? 'all roles' : `${filters.role} players`}, ordered by {scoreLabel}, highest first. {unrankedNote ? `${unrankedNote} ` : ''}Ranks use full precision. Equal full-precision scores share a rank. Displayed scores are rounded. {teamAttribution}{statsFamily ? ' Stat games count games with usable role stats in this scope, including previous teams.' : ''} Games count games credited to the displayed team where available, otherwise all rated games.</caption>
                    <TableHeader role="rowgroup">
                      <TableRow role="row">
                        <TableHead role="columnheader" scope="col" className="player-col-rank" aria-label="Rank">#</TableHead>
                        <TableHead role="columnheader" scope="col" className="player-col-name">Player</TableHead>
                        <TableHead role="columnheader" scope="col" className="player-col-score text-right" aria-sort="descending">{scoreLabel}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody role="rowgroup">
                      {visible.map((player) => {
                        const league = playerLeague(player)
                        const score = player.leaderboardScore
                        const scoreValue = score.status === 'ranked' ? score.value : undefined
                        const scoreText = statsFamily ? formatDecimal(scoreValue) : formatRating(scoreValue)
                        const evidenceThrough = score.status === 'unranked' ? undefined : statsFamily ? player.statsPower?.evidenceThrough : player.latestObservedAt
                        const decimalIndex = scoreText.lastIndexOf('.')
                        return (
                          <TableRow data-first-answer="players" role="row" key={player.id} league={league} data-selected={profilePlayer?.id === player.id}>
                            <TableCell role="cell" className="player-col-rank pl-4 text-muted tabular-nums">
                              {player.leaderboardRank ?? <><span aria-hidden="true">—</span><span className="sr-only">Unranked</span></>}
                            </TableCell>
                            <TableCell role="cell" className="player-col-name">
                              <div className="r8-player-identity">
                                <TeamMark team={player.team} code={player.teamCode} className="size-7" fallback="initial" />
                                <div>
                                  <button
                                    type="button"
                                    data-player-profile={player.id}
                                    aria-label={`Open profile for ${player.name}`}
                                    aria-current={profilePlayer?.id === player.id ? 'true' : undefined}
                                    onClick={() => selectProfile(player.id)}
                                  >
                                    {player.name}
                                  </button>
                                  <span className="r8-player-affiliation">
                                    {player.teamCode ?? player.team}
                                    <span>{player.role}</span>
                                    <RegionBadge region={league} size="sm" />
                                  </span>
                                </div>
                              </div>
                              <details className="r8-player-row-details">
                                <summary>Stats and report</summary>
                                <dl>
                                  <div><dt>{teamLabel}</dt><dd data-player-stat="team">{player.team}</dd></div>
                                  <div><dt>Role</dt><dd data-player-stat="role">{player.role}</dd></div>
                                  {statsFamily ? (
                                    <>
                                      <div><dt>Stat games</dt><dd data-player-stat="stat-games">{formatNumber(player.statsPower?.sampleGames)}</dd></div>
                                      <div><dt>Role Power</dt><dd data-player-stat="role-power">{formatRating(player.rating)}</dd></div>
                                    </>
                                  ) : null}
                                  {evidenceThrough ? <div><dt>Score evidence</dt><dd className="player-score-evidence">Through {formatDate(evidenceThrough)}</dd></div> : null}
                                  <div><dt>Games</dt><dd data-player-stat="games">{formatNumber(player.teamGames ?? player.games)}</dd></div>
                                </dl>
                                <a href={scoutingHref(player)} aria-label={`Scouting report for ${player.name}`}><ClipboardList size={14} aria-hidden="true" />Scouting report</a>
                              </details>
                            </TableCell>
                            <TableCell role="cell" className="player-col-score text-right font-semibold text-text tabular-nums">
                              <span className="player-score-figure"><span>{decimalIndex < 0 ? scoreText : scoreText.slice(0, decimalIndex)}</span><span>{decimalIndex < 0 ? '' : scoreText.slice(decimalIndex)}</span></span>
                              {scoreValue !== undefined && scoreRange ? (
                                <Lane
                                  league={league}
                                  value={scoreValue}
                                  low={scoreValue}
                                  high={scoreValue}
                                  min={scoreRange.min}
                                  max={scoreRange.max}
                                  label={`${player.name} ${scoreLabel} ${scoreText} on the full scope range ${formatDecimal(scoreRange.min)} to ${formatDecimal(scoreRange.max)}`}
                                />
                              ) : null}
                              {score.status === 'unranked' ? (
                                <span className="player-score-unranked block text-xs font-normal whitespace-normal text-muted">
                                  Unranked. {score.reason === 'no-stat-games' ? 'No stat games.' : `No ${scoreLabel}.`}
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
            {profilePlayer ? <PlayerRoleProfile
              players={players}
              choices={visible}
              selectedId={profilePlayer.id}
              scoreLabel={scoreLabel}
              scoreValue={profilePlayer.leaderboardScore.status === 'ranked' ? profilePlayer.leaderboardScore.value : undefined}
              rank={profilePlayer.leaderboardRank}
              open={profileOpen}
              onSelect={selectProfile}
              onClose={closeProfile}
            /> : null}
          </div>
        </>
      )}
      {methodDisclosure}
      {directory ? (
        <p className="players-source break-words text-xs leading-relaxed text-muted">
          Source {directory.sourceProvider}.{' '}
          {statsPowerVersion
            ? `Stats Power ${statsPowerVersion} scores lane leads at 15 minutes, kill participation and ward activity against each role's average. It weights each game by event and home-league strength, then gives a game half the weight of a game 90 days later in the supplied history. It pulls small samples to the league anchor and excludes wins, KDA and gold share. For each player, newer games get more weight than older games. Inactivity alone does not lower the score. Stat games count raw games with usable role stats in this scope, including previous teams. `
            : ''}
          Role Power uses model {directory.modelVersion}, configuration {directory.modelConfigHash}, and includes individual stats, results, opponent strength and event context. Its history and deltas still track Role Power. Games count games credited to the displayed team where available, otherwise all rated games. Game counts do not measure certainty.
        </p>
      ) : null}
    </section>
  )
}
