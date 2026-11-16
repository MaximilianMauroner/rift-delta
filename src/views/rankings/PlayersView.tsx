import { AlertTriangle, ClipboardList, MoveHorizontal, Search, Users } from 'lucide-react'
import { useMemo, useState, type RefObject } from 'react'
import { currentHashQuery, hashEnum, hashParam, useHashSync } from '../../browser/navigation'
import type { PlayerDirectoryState } from '../../browser/rankings/usePublicArtifacts'
import { scoutingHref } from '../../browser/scouting/navigation'
import { DataState } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { LoadingState } from '../../components/ui/loading'
import { Select } from '../../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { teamBrandingFor } from '../../data/teamBranding'
import { providerFreshness } from '../../domains/rankings/evidence'
import { playerLeaderboardForScope } from '../../domains/rankings/read'
import type { PublicRankingManifest, Role, SnapshotFilter } from '../../domains/rankings/types'
import { formatDate, formatDecimal, formatNumber, formatRating } from '../../shared/display'
import { PlayerRoleProfile } from './PlayerRoleProfile'

const ROLES: readonly Role[] = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']
const ROLE_FILTERS = ['All', ...ROLES] as const
function readFilters(query: URLSearchParams) {
  return {
    search: hashParam('player', query) ?? '',
    role: hashEnum('role', ROLE_FILTERS, 'All', query),
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
  const [appliedQuery, setAppliedQuery] = useState(hashQuery)
  if (hashQuery !== appliedQuery) {
    setAppliedQuery(hashQuery)
    setFilters(readFilters(hashQuery))
  }
  useHashSync('players', { player: filters.search, role: filters.role === 'All' ? '' : filters.role, profile: filters.profile })
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
    !search || [player.name, player.team, player.teamCode ?? ''].some((value) => value.toLowerCase().includes(search)),
  )

  const profileId = players.some((player) => player.id === filters.profile) ? filters.profile : visible[0]?.id

  const methodDisclosure = (
    <details className="players-method">
      <summary>Method</summary>
      <div className="grid gap-1.5 text-xs leading-relaxed text-muted-foreground">
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
    <section className="players-view flex min-w-0 flex-col gap-4 px-[var(--page-x)] pt-5" aria-label="Player leaderboard">
      <div className="players-filters flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5 text-xs text-muted-foreground">
          Find a player or team
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--faint)]" aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              className="pl-9"
              value={filters.search}
              placeholder="Player or team name"
              aria-keyshortcuts="/"
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Role
          <Select aria-label="Role" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value as typeof filters.role })}>
            {ROLE_FILTERS.map((role) => <option key={role} value={role}>{role === 'All' ? 'All roles' : role}</option>)}
          </Select>
        </label>
      </div>

      <p className="players-source break-words text-xs leading-relaxed text-muted-foreground" role="status" aria-label="Player-stat freshness">
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

      {visible.length > 0 ? (
        <div className="players-reading-tools">
          {methodDisclosure}
          <p className="players-scroll-cue"><MoveHorizontal size={16} aria-hidden="true" /><span>Scroll for more stats</span></p>
        </div>
      ) : null}

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
          <p className="players-count flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground" role="status">
            <span>{formatNumber(visible.length)} of {formatNumber(selectedPlayers.length)} {filters.role === 'All' ? 'players' : `${filters.role} players`} in {scopeLabel}. {filters.role === 'All' ? 'Ranks mix all roles.' : 'Ranks compare players in this role.'} Search keeps these ranks.</span>
            {unrankedCount > 0 ? <span>{formatNumber(rankedCount)} ranked by {scoreLabel}. {formatNumber(unrankedCount)} unranked without a usable {scoreLabel} score.</span> : null}
            <span>Scores are rounded. Ranks use the exact score.</span>
            {filters.role === 'All' ? <span>Ranks across roles are rough. Pick a role for a fair comparison.</span> : null}
            {scoreRange && visible.length > 0 ? (
              <span className="player-score-key" title="Each bar shows the score on this full range. Filters keep the same scale.">
                Scores run from {formatDecimal(scoreRange.min)} to {formatDecimal(scoreRange.max)}
              </span>
            ) : null}
          </p>
          {profileId ? (
            <PlayerRoleProfile
              players={players}
              choices={visible}
              selectedId={profileId}
              onSelect={(profile) => setFilters({ ...filters, profile })}
            />
          ) : null}
          {visible.length === 0 ? (
            <Card role="status" className="players-empty-result">
              <DataState icon={<Search size={26} aria-hidden="true" />} title="No players match these filters" action={<Button variant="outline" onClick={() => setFilters({ ...filters, search: '', role: 'All', profile: '' })}>Clear filters</Button>}>
                Try another player or team name, or select all roles.
              </DataState>
            </Card>
          ) : (
            <Card className="players-board min-w-0 overflow-hidden p-0">
              <Table role="table" data-stat-games={statsFamily} aria-label="Player rankings" tabIndex={0} className="players-table focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]">
                <caption className="sr-only">Player rankings for {scopeLabel}, {filters.role === 'All' ? 'all roles' : `${filters.role} players`}, ordered by {scoreLabel}, highest first. {unrankedNote ? `${unrankedNote} ` : ''}Ranks use full precision. Equal full-precision scores share a rank. Displayed scores are rounded. {teamAttribution}{statsFamily ? ' Stat games count games with usable role stats in this scope, including previous teams.' : ''} Games count games credited to the displayed team where available, otherwise all rated games.</caption>
                <TableHeader role="rowgroup">
                  <TableRow role="row">
                    <TableHead role="columnheader" scope="col" className="player-col-rank pl-4">Rank</TableHead>
                    <TableHead role="columnheader" scope="col" className="player-col-name">Player</TableHead>
                    <TableHead role="columnheader" scope="col" className="player-col-team" title={teamAttribution}>{teamLabel}</TableHead>
                    <TableHead role="columnheader" scope="col" className="player-col-role">Role</TableHead>
                    <TableHead role="columnheader" scope="col" className="player-col-score text-right" aria-sort="descending">{scoreLabel}</TableHead>
                    {statsFamily ? (
                      <>
                        <TableHead role="columnheader" scope="col" className="player-col-stat-games text-right">Stat games</TableHead>
                        <TableHead role="columnheader" scope="col" className="player-col-role-power text-right">Role Power</TableHead>
                      </>
                    ) : null}
                    <TableHead role="columnheader" scope="col" className="player-col-games pr-4 text-right">Games</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody role="rowgroup">
                  {visible.map((player) => {
                    const branding = teamBrandingFor(player.team)
                    const logo = branding?.logo && branding.logoTreatment !== 'code' ? branding.logo : undefined
                    const score = player.leaderboardScore
                    const scoreValue = score.status === 'ranked' ? score.value : undefined
                    const scoreText = statsFamily ? formatDecimal(scoreValue) : formatRating(scoreValue)
                    const evidenceThrough = score.status === 'unranked' ? undefined : statsFamily ? player.statsPower?.evidenceThrough : player.latestObservedAt
                    const decimalIndex = scoreText.lastIndexOf('.')
                    const scorePosition = scoreValue === undefined || !scoreRange ? undefined
                      : scoreRange.max === scoreRange.min ? 50 : 100 * (scoreValue - scoreRange.min) / (scoreRange.max - scoreRange.min)
                    return (
                      <TableRow role="row" key={player.id}>
                        <TableCell role="cell" className="player-col-rank pl-4 font-mono text-muted-foreground tabular-nums">
                          {player.leaderboardRank ?? <><span aria-hidden="true">—</span><span className="sr-only">Unranked</span></>}
                        </TableCell>
                        <TableCell role="cell" className="player-col-name text-md font-semibold text-[var(--text-strong)]"><span className="player-identity">
                          {logo ? <img src={`${logo}?v=icon-128`} className={branding?.logoTreatment === 'invert' ? 'player-identity-mark invert' : 'player-identity-mark'} alt="" aria-hidden="true" width={20} height={20} loading="lazy" decoding="async" /> : null}
                          <a
                            href={scoutingHref(player)}
                            aria-label={`Scouting report for ${player.name}`}
                            title="Scouting report"
                            className="player-scouting-link inline-flex min-h-6 min-w-0 items-center gap-2 rounded-sm text-inherit no-underline hover:text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                          ><span className="min-w-0 [overflow-wrap:anywhere]">{player.name}</span><ClipboardList className="size-4 shrink-0 text-[var(--faint)]" aria-hidden="true" /></a>
                        </span></TableCell>
                        <TableCell role="cell" className="player-col-team max-w-44 whitespace-normal"><span className="player-team">
                          {logo ? <img src={`${logo}?v=icon-128`} className={branding?.logoTreatment === 'invert' ? 'invert' : undefined} alt="" aria-hidden="true" width={24} height={24} loading="lazy" decoding="async" /> : null}
                          <span>{player.team}</span>
                        </span></TableCell>
                        <TableCell role="cell" className="player-col-role text-muted-foreground"><span className="player-role">{player.role}</span></TableCell>
                        <TableCell role="cell" className="player-col-score text-right font-mono font-semibold text-[var(--text-strong)] tabular-nums">
                          {scorePosition === undefined
                            ? <span className="player-score-position invisible" aria-hidden="true" />
                            : <span className="player-score-position" aria-hidden="true"><i style={{ left: `${scorePosition}%` }} /></span>}
                          <span className="player-score-figure"><span>{decimalIndex < 0 ? scoreText : scoreText.slice(0, decimalIndex)}</span><span>{decimalIndex < 0 ? '' : scoreText.slice(decimalIndex)}</span></span>
                          {evidenceThrough ? <span className="player-score-evidence block text-2xs font-normal text-muted-foreground">Through {formatDate(evidenceThrough)}</span> : null}
                          {score.status === 'unranked' ? (
                            <span className="player-score-unranked block text-2xs font-normal whitespace-normal text-muted-foreground">
                              Unranked. {score.reason === 'no-stat-games' ? 'No stat games.' : `No ${scoreLabel}.`}
                            </span>
                          ) : null}
                        </TableCell>
                        {statsFamily ? (
                          <>
                            <TableCell role="cell" className="player-col-stat-games text-right font-mono text-muted-foreground tabular-nums">{formatNumber(player.statsPower?.sampleGames)}</TableCell>
                            <TableCell role="cell" className="player-col-role-power text-right font-mono text-muted-foreground tabular-nums">{formatRating(player.rating)}</TableCell>
                          </>
                        ) : null}
                        <TableCell role="cell" className="player-col-games pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatNumber(player.teamGames ?? player.games)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
      {visible.length === 0 ? methodDisclosure : null}
      {directory ? (
        <p className="players-source break-words text-xs leading-relaxed text-muted-foreground">
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
